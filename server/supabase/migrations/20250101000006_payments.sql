-- =========================================================
-- PickleBella Park — real payments
--
-- Until now a booking was written straight to 'paid' the moment the customer
-- pressed the button. Nothing was ever charged; "paid" meant "asked to pay".
--
-- With a payment gateway in front, confirmation stops being one step:
--
--   1. the API writes the basket as 'pending' and opens a payment intent
--   2. the customer is redirected to GCash / Maya / QR Ph and pays
--   3. the gateway's webhook tells us it succeeded, and only then 'paid'
--
-- Between 1 and 3 the slot has to be OFF SALE. A pending booking is an
-- unfinished sale, not a free court — if the exclusion constraint ignored it,
-- two people could be sent to GCash for the same 7pm slot and one of them
-- would pay for a court they cannot have. So the constraint below covers
-- 'pending' as well as 'paid'.
--
-- The other side of that: a hold must not last forever. Someone who closes
-- the GCash tab would otherwise keep a court off sale indefinitely. Every
-- pending row carries hold_expires_at, and expire_pending_bookings() releases
-- the stale ones. It is called opportunistically from the read paths rather
-- than by a scheduler, so no cron is required for correctness.
-- =========================================================

-- ---------------------------------------------------------
-- Columns
-- ---------------------------------------------------------

alter table public.bookings
  add column if not exists payment_intent_id text,
  add column if not exists payment_ref       text,
  add column if not exists hold_expires_at   timestamptz;

comment on column public.bookings.payment_intent_id is
  'Gateway payment intent this booking belongs to. All rows in one basket share it.';
comment on column public.bookings.payment_ref is
  'Gateway payment id, recorded when the webhook confirms the charge.';
comment on column public.bookings.hold_expires_at is
  'When a pending hold lapses and the slot goes back on sale. Null once paid.';

-- Looking a basket up by intent is what the webhook does on every call.
create index if not exists bookings_payment_intent_idx
  on public.bookings (payment_intent_id)
  where payment_intent_id is not null;

-- Finding lapsed holds cheaply.
create index if not exists bookings_pending_hold_idx
  on public.bookings (hold_expires_at)
  where status = 'pending';

-- ---------------------------------------------------------
-- Status values
--
--   pending    awaiting payment; holds the slot
--   paid       money received
--   failed     the payment did not complete, or the hold lapsed
--   cancelled  called off after payment
-- ---------------------------------------------------------

alter table public.bookings drop constraint if exists bookings_status_valid;
alter table public.bookings
  add constraint bookings_status_valid
  check (status in ('pending', 'paid', 'failed', 'cancelled'));

-- ---------------------------------------------------------
-- The overlap guarantee now covers unfinished sales too.
--
-- Dropping and re-adding an exclusion constraint rebuilds its GiST index, so
-- this statement is not free on a large table — it is, however, the whole
-- point of the migration.
-- ---------------------------------------------------------

alter table public.bookings drop constraint if exists bookings_no_overlap;
alter table public.bookings
  add constraint bookings_no_overlap
  exclude using gist (court_id with =, date with =, slot with &&)
  where (status in ('paid', 'pending'));

-- ---------------------------------------------------------
-- expire_pending_bookings
--
-- Releases holds whose payment never arrived, and hands back the promo
-- redemption each basket consumed so a lapsed hold does not quietly burn a
-- limited code.
--
-- Written to be safe to call constantly and from several requests at once: it
-- only ever touches rows that are already past their expiry, and the UPDATE
-- takes a row lock, so two concurrent callers cannot both refund the same
-- promo use.
-- ---------------------------------------------------------

create or replace function public.expire_pending_bookings()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_released integer := 0;
begin
  create temporary table if not exists _lapsed_holds (
    promo_id text,
    payment_intent_id text
  ) on commit drop;

  delete from _lapsed_holds;

  with lapsed as (
    update public.bookings
       set status = 'failed'
     where status = 'pending'
       and hold_expires_at is not null
       and hold_expires_at < now()
    returning promo_id, payment_intent_id
  )
  insert into _lapsed_holds select promo_id, payment_intent_id from lapsed;

  get diagnostics v_released = row_count;

  -- One basket redeems a promo once however many rows it has, so count
  -- baskets (distinct intents), not rows.
  update public.promo_codes p
     set used_count = greatest(p.used_count - b.n, 0)
    from (
      select promo_id, count(distinct payment_intent_id) as n
        from _lapsed_holds
       where promo_id is not null
       group by promo_id
    ) b
   where p.id = b.promo_id;

  return v_released;
end;
$$;

-- ---------------------------------------------------------
-- create_bookings — now writes a status, an intent id and a hold deadline.
--
-- The old signature is dropped rather than overloaded: leaving it in place
-- would leave a callable path that still books straight to 'paid'.
-- ---------------------------------------------------------

drop function if exists public.create_bookings(uuid, jsonb, text, text, text, int, text, text, text);

create or replace function public.create_bookings(
  p_user_id           uuid,
  p_slots             jsonb,
  p_name              text,
  p_phone             text,
  p_email             text,
  p_players           int,
  p_notes             text,
  p_payment_method    text,
  p_promo_id          text default null,
  p_status            text default 'pending',
  p_payment_intent_id text default null,
  p_hold_expires_at   timestamptz default null
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

  if p_status not in ('pending', 'paid') then
    raise exception 'bookings may only be created pending or paid' using errcode = 'P0102';
  end if;

  -- Lapsed holds are cleared inside this same transaction, so a slot whose
  -- hold expired a second ago is bookable by the customer sitting in front of
  -- it rather than blocked until some later sweep runs.
  perform public.expire_pending_bookings();

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
        payment_method, amount, status, promo_id,
        payment_intent_id, hold_expires_at
      )
      values (
        v_court_id, p_user_id, v_date, v_start, v_duration,
        left(coalesce(p_name, ''), 120),
        left(coalesce(p_phone, ''), 32),
        left(lower(coalesce(p_email, '')), 254),
        p_players,
        left(coalesce(p_notes, ''), 500),
        p_payment_method, v_amount, p_status, p_promo_id,
        p_payment_intent_id,
        case when p_status = 'pending' then p_hold_expires_at end
      )
      returning * into v_booking;
    exception
      when exclusion_violation then
        -- Someone else committed an overlapping slot first — either a paid
        -- booking or another customer's live payment hold. Re-raised as P0101
        -- so the API reports "just taken" rather than a generic database
        -- error. Every earlier insert in this basket rolls back too.
        raise exception 'slot taken' using errcode = 'P0101';
    end;

    return next v_booking;
  end loop;
end;
$$;

-- ---------------------------------------------------------
-- settle_payment
--
-- The webhook's only job. Idempotent by construction: it moves rows out of
-- 'pending' and nothing else, so a gateway that delivers the same event three
-- times settles once and reports zero rows twice.
--
-- p_paid = true  -> the basket is paid, and the hold becomes a booking
-- p_paid = false -> the payment failed; release the slots and refund the
--                   promo redemption
-- ---------------------------------------------------------

create or replace function public.settle_payment(
  p_payment_intent_id text,
  p_paid              boolean,
  p_payment_ref       text default null
)
returns setof public.bookings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_promo_id text;
  v_touched  int;
begin
  if p_payment_intent_id is null or p_payment_intent_id = '' then
    raise exception 'payment intent id required' using errcode = 'P0102';
  end if;

  select promo_id into v_promo_id
    from public.bookings
   where payment_intent_id = p_payment_intent_id
     and status = 'pending'
   limit 1;

  return query
    update public.bookings
       set status          = case when p_paid then 'paid' else 'failed' end,
           payment_ref     = coalesce(p_payment_ref, payment_ref),
           hold_expires_at = null
     where payment_intent_id = p_payment_intent_id
       and status = 'pending'
    returning *;

  get diagnostics v_touched = row_count;

  -- A failed basket hands its promo redemption back. A paid one keeps it.
  if not p_paid and v_touched > 0 and v_promo_id is not null then
    update public.promo_codes
       set used_count = greatest(used_count - 1, 0)
     where id = v_promo_id;
  end if;
end;
$$;

-- ---------------------------------------------------------
-- Callable only with the service-role key, i.e. only from the API.
-- ---------------------------------------------------------

revoke all on function public.create_bookings(uuid, jsonb, text, text, text, int, text, text, text, text, text, timestamptz)
  from public, anon, authenticated;

revoke all on function public.settle_payment(text, boolean, text) from public, anon, authenticated;
revoke all on function public.expire_pending_bookings() from public, anon, authenticated;
