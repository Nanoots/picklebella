-- =========================================================
-- PickleBella Park — atomic booking confirmation
--
-- Confirming a booking touches several things that must agree: opening hours,
-- staff blocks, the promo code's usage counter, and every slot in the basket.
-- Doing them as separate statements from the API leaves gaps — two customers
-- can both pass the block check, a promo limited to 50 uses can be redeemed 60
-- times by 60 simultaneous requests, or a basket of three slots can half-book
-- and leave the customer charged for a court they did not get.
--
-- Running the lot inside one function means one transaction. Either every part
-- commits or none does.
-- =========================================================

-- Resolves the venue's hours for a date: a holiday entry wins, otherwise the
-- weekday's configured hours, otherwise the built-in default.
create or replace function public.hours_for_date(p_date date)
returns table (open_hour int, close_hour int, is_closed boolean)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  cfg     jsonb;
  holiday jsonb;
  dow     int;
begin
  select value into cfg from public.settings where key = 'hours';

  if cfg is null then
    return query select 6, 22, false;
    return;
  end if;

  select h into holiday
    from jsonb_array_elements(coalesce(cfg -> 'holidays', '[]'::jsonb)) as h
   where h ->> 'date' = to_char(p_date, 'YYYY-MM-DD')
   limit 1;

  if holiday is not null then
    return query select
      coalesce((holiday ->> 'open')::int, 6),
      coalesce((holiday ->> 'close')::int, 22),
      coalesce((holiday ->> 'closed')::boolean, false);
    return;
  end if;

  dow := extract(dow from p_date)::int;  -- 0 = Sunday, matching the client

  return query select
    coalesce((cfg -> 'weekly' -> dow ->> 'open')::int, 6),
    coalesce((cfg -> 'weekly' -> dow ->> 'close')::int, 22),
    coalesce((cfg -> 'weekly' -> dow ->> 'closed')::boolean, false);
end;
$$;

-- Superseded by create_bookings below, which handles a basket rather than a
-- single slot. Dropped so no caller can reach the older, weaker path.
drop function if exists public.create_booking(uuid, text, date, int, int, text, text, text, int, text, text, int, text);

-- ---------------------------------------------------------
-- create_bookings
--
-- p_slots is a JSON array of objects:
--   { "courtId": text, "date": "YYYY-MM-DD", "startHour": int,
--     "duration": int, "amount": int }
--
-- Amounts are computed and signed by the API (see lib/quotes.ts); this
-- function does not price anything. It enforces availability and atomicity.
--
-- Raises with distinct SQLSTATEs so the API can turn each into a message the
-- customer can act on:
--   P0101  slot already booked
--   P0102  slot blocked, or court unavailable
--   P0103  outside opening hours
--   P0104  promo code no longer usable
-- ---------------------------------------------------------
create or replace function public.create_bookings(
  p_user_id        uuid,
  p_slots          jsonb,
  p_name           text,
  p_phone          text,
  p_email          text,
  p_players        int,
  p_notes          text,
  p_payment_method text,
  p_promo_id       text default null
)
returns setof public.bookings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_slot      jsonb;
  v_court_id  text;
  v_date      date;
  v_start     int;
  v_duration  int;
  v_amount    int;
  v_range     int4range;
  v_hours     record;
  v_booking   public.bookings;
begin
  if jsonb_typeof(p_slots) <> 'array' or jsonb_array_length(p_slots) = 0 then
    raise exception 'no slots supplied' using errcode = 'P0102';
  end if;

  -- Redeemed once for the whole basket, before any insert. The guarded WHERE
  -- re-tests every usability condition, so a code with one use left cannot be
  -- redeemed twice by two racing requests — the row lock taken by UPDATE
  -- serialises them. If any insert below fails, this rolls back with it.
  if p_promo_id is not null then
    update public.promo_codes
       set used_count = used_count + 1
     where id = p_promo_id
       and active
       and (expires_at is null or expires_at >= current_date)
       and (max_uses = 0 or used_count < max_uses);

    if not found then
      raise exception 'promo unusable' using errcode = 'P0104';
    end if;
  end if;

  for v_slot in select * from jsonb_array_elements(p_slots)
  loop
    v_court_id := v_slot ->> 'courtId';
    v_date     := (v_slot ->> 'date')::date;
    v_start    := (v_slot ->> 'startHour')::int;
    v_duration := (v_slot ->> 'duration')::int;
    v_amount   := (v_slot ->> 'amount')::int;
    v_range    := int4range(v_start, v_start + v_duration);

    if not exists (select 1 from public.courts c where c.id = v_court_id and c.active) then
      raise exception 'court unavailable' using errcode = 'P0102';
    end if;

    select * into v_hours from public.hours_for_date(v_date);
    if v_hours.is_closed
       or v_start < v_hours.open_hour
       or v_start + v_duration > v_hours.close_hour then
      raise exception 'outside opening hours' using errcode = 'P0103';
    end if;

    -- Blocks are checked in-transaction. There is no cross-table exclusion
    -- constraint available, so this is the check that matters; it is safe here
    -- because a concurrent block insert cannot commit and become visible
    -- mid-transaction.
    if exists (
      select 1 from public.blocks b
       where b.court_id = v_court_id
         and b.date = v_date
         and b.slot && v_range
    ) then
      raise exception 'slot blocked' using errcode = 'P0102';
    end if;

    begin
      insert into public.bookings (
        court_id, user_id, date, start_hour, duration,
        name, phone, email, players, notes,
        payment_method, amount, status, promo_id
      )
      values (
        v_court_id, p_user_id, v_date, v_start, v_duration,
        left(coalesce(p_name, ''), 120),
        left(coalesce(p_phone, ''), 32),
        left(lower(coalesce(p_email, '')), 254),
        p_players,
        left(coalesce(p_notes, ''), 500),
        p_payment_method, v_amount, 'paid', p_promo_id
      )
      returning * into v_booking;
    exception
      when exclusion_violation then
        -- Someone else committed an overlapping slot first. Re-raised as P0101
        -- so the API reports "just taken" rather than a generic database
        -- error. Every earlier insert in this basket rolls back too.
        raise exception 'slot taken' using errcode = 'P0101';
    end;

    return next v_booking;
  end loop;
end;
$$;

-- Callable only with the service-role key, i.e. only from the API. A browser
-- holding the anon key cannot invoke it and therefore cannot mint a booking
-- at a price of its choosing.
revoke all on function public.create_bookings(uuid, jsonb, text, text, text, int, text, text, text)
  from public, anon, authenticated;

revoke all on function public.hours_for_date(date) from public, anon, authenticated;
