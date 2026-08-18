-- =========================================================
-- PickleBella Park — schema
--
-- Constraints here are the last line of defence. The API validates input and
-- checks permissions, but a bug in a handler, a stray query from the Supabase
-- dashboard, or a future endpoint written in a hurry all end up here. Anything
-- that must never be true of the data is expressed as a constraint, not as a
-- convention.
-- =========================================================

-- Lets a GiST exclusion constraint mix plain equality columns (court_id, date)
-- with a range overlap test. This is what makes double-booking impossible
-- rather than merely unlikely.
create extension if not exists btree_gist;

-- ---------------------------------------------------------
-- profiles — one row per auth account, created by trigger
-- ---------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text        not null,
  name        text        not null default '',
  phone       text        not null default '',
  banned      boolean     not null default false,
  vip         boolean     not null default false,
  notes       text        not null default '',
  created_at  timestamptz not null default now(),

  constraint profiles_email_key unique (email),
  constraint profiles_email_len check (char_length(email) <= 254),
  constraint profiles_name_len  check (char_length(name)  <= 120),
  constraint profiles_phone_len check (char_length(phone) <= 32),
  constraint profiles_notes_len check (char_length(notes) <= 1000)
);

-- ---------------------------------------------------------
-- admin_users — the ONLY thing that grants staff access
--
-- Membership is deliberately not self-service: there is no endpoint that
-- writes to this table. Rows are added by a project owner in the Supabase SQL
-- editor. An attacker who fully compromises the API still cannot promote
-- themselves through it.
-- ---------------------------------------------------------
create table if not exists public.admin_users (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  note        text        not null default '',
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------
-- courts
-- ---------------------------------------------------------
create table if not exists public.courts (
  id          text        primary key,
  name        text        not null,
  type        text        not null,
  surface     text        not null default '',
  rate        integer     not null,
  emoji       text        not null default '',
  color       text        not null default '',
  feats       text[]      not null default '{}',
  lighting    boolean     not null default true,
  active      boolean     not null default true,
  sort_order  integer     not null default 0,
  created_at  timestamptz not null default now(),

  constraint courts_id_format check (id ~ '^[a-z0-9][a-z0-9-]*$'),
  constraint courts_type_valid check (type in ('Indoor', 'Outdoor')),
  -- An upper bound as well as a lower one: a rate is a price in pesos, and a
  -- ten-million-peso court hour is a typo, not a business decision.
  constraint courts_rate_range check (rate >= 0 and rate <= 100000),
  constraint courts_name_len check (char_length(name) between 1 and 80)
);

-- ---------------------------------------------------------
-- bookings
-- ---------------------------------------------------------
create table if not exists public.bookings (
  id              uuid        primary key default gen_random_uuid(),
  court_id        text        not null references public.courts (id) on delete restrict,
  -- Null for walk-ins entered by staff for someone with no account. Set null
  -- on account deletion so the financial record survives the customer.
  user_id         uuid        references auth.users (id) on delete set null,
  date            date        not null,
  start_hour      smallint    not null,
  duration        smallint    not null,
  name            text        not null default '',
  phone           text        not null default '',
  email           text        not null default '',
  players         smallint    not null default 2,
  notes           text        not null default '',
  payment_method  text        not null default '',
  amount          integer     not null,
  status          text        not null default 'paid',
  promo_id        text,
  created_by      uuid        references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  cancelled_at    timestamptz,

  -- Half-open [start, end): a booking ending at 18 and one starting at 18 do
  -- not overlap, which is exactly the behaviour an hourly calendar needs.
  slot int4range generated always as (int4range(start_hour, start_hour + duration)) stored,

  constraint bookings_status_valid   check (status in ('paid', 'cancelled')),
  constraint bookings_start_range    check (start_hour between 0 and 23),
  constraint bookings_duration_range check (duration between 1 and 6),
  constraint bookings_end_of_day     check (start_hour + duration <= 24),
  constraint bookings_players_range  check (players between 1 and 20),
  constraint bookings_amount_range   check (amount >= 0 and amount <= 1000000),
  constraint bookings_name_len       check (char_length(name)  <= 120),
  constraint bookings_phone_len      check (char_length(phone) <= 32),
  constraint bookings_email_len      check (char_length(email) <= 254),
  constraint bookings_notes_len      check (char_length(notes) <= 500)
);

-- The core guarantee: no two live bookings may overlap on the same court and
-- date. Enforced by the database, so two requests arriving in the same
-- millisecond cannot both succeed no matter what the application does.
--
-- The WHERE clause matters: cancelled bookings are excluded, so cancelling
-- immediately frees the slot while keeping the row for reporting.
alter table public.bookings drop constraint if exists bookings_no_overlap;
alter table public.bookings
  add constraint bookings_no_overlap
  exclude using gist (court_id with =, date with =, slot with &&)
  where (status = 'paid');

create index if not exists bookings_date_idx        on public.bookings (date);
create index if not exists bookings_court_date_idx  on public.bookings (court_id, date);
create index if not exists bookings_user_idx        on public.bookings (user_id);
create index if not exists bookings_email_idx       on public.bookings (lower(email));

-- ---------------------------------------------------------
-- blocks — staff holds that take a court off sale
-- ---------------------------------------------------------
create table if not exists public.blocks (
  id          uuid        primary key default gen_random_uuid(),
  court_id    text        not null references public.courts (id) on delete cascade,
  date        date        not null,
  start_hour  smallint    not null,
  end_hour    smallint    not null,
  reason      text        not null default '',
  created_by  uuid        references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),

  slot int4range generated always as (int4range(start_hour, end_hour)) stored,

  constraint blocks_hours_ordered check (end_hour > start_hour),
  constraint blocks_hours_range   check (start_hour >= 0 and end_hour <= 24),
  constraint blocks_reason_len    check (char_length(reason) <= 200)
);

alter table public.blocks drop constraint if exists blocks_no_overlap;
alter table public.blocks
  add constraint blocks_no_overlap
  exclude using gist (court_id with =, date with =, slot with &&);

create index if not exists blocks_court_date_idx on public.blocks (court_id, date);

-- ---------------------------------------------------------
-- promo_codes
-- ---------------------------------------------------------
create table if not exists public.promo_codes (
  id          text        primary key,
  code        text        not null,
  type        text        not null,
  value       numeric(10, 2) not null,
  active      boolean     not null default true,
  expires_at  date,
  max_uses    integer     not null default 0,
  used_count  integer     not null default 0,
  created_at  timestamptz not null default now(),

  constraint promo_type_valid  check (type in ('percent', 'fixed')),
  constraint promo_value_range check (value >= 0 and (type <> 'percent' or value <= 100)),
  constraint promo_uses_range  check (max_uses >= 0 and used_count >= 0),
  constraint promo_code_format check (code ~ '^[A-Za-z0-9_-]{2,40}$')
);

-- Case-insensitive uniqueness: SUMMER and summer must not be two codes, or
-- redemption becomes ambiguous.
create unique index if not exists promo_codes_code_key on public.promo_codes (upper(code));

-- ---------------------------------------------------------
-- settings — hours and pricing, edited as whole JSON documents
-- ---------------------------------------------------------
create table if not exists public.settings (
  key         text        primary key,
  value       jsonb       not null,
  updated_by  uuid        references auth.users (id) on delete set null,
  updated_at  timestamptz not null default now(),

  constraint settings_key_allowed check (key in ('hours', 'pricing'))
);

-- ---------------------------------------------------------
-- Profile creation on signup
--
-- security definer because the trigger runs as the signing-up user, who has
-- no rights on public.profiles. search_path is pinned so the function can
-- never be redirected to a shadowed table by a caller-controlled path.
-- ---------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email, name, phone)
  values (
    new.id,
    lower(new.email),
    coalesce(left(new.raw_user_meta_data ->> 'name', 120), ''),
    coalesce(left(new.raw_user_meta_data ->> 'phone', 32), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
