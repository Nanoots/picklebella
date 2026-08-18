-- =========================================================
-- PickleBella Park — row level security
--
-- The publishable ("anon") key ships inside the browser bundle. Anyone can
-- read it out and talk to PostgREST directly with it, bypassing our API
-- entirely. RLS is what makes that harmless.
--
-- The model here is deny by default: RLS is enabled on every table, and a
-- table with no policy grants nothing. Only the handful of genuinely public
-- reads get a policy. Everything else — writes of any kind, promo codes,
-- blocks, the admin list, other people's bookings — is reachable only through
-- the API, which holds the service-role key and does its own authorisation.
-- =========================================================

alter table public.profiles    enable row level security;
alter table public.admin_users enable row level security;
alter table public.courts      enable row level security;
alter table public.bookings    enable row level security;
alter table public.blocks      enable row level security;
alter table public.promo_codes enable row level security;
alter table public.settings    enable row level security;

-- Force RLS even for the table owner, so a mistake made while connected as
-- the owner role in the SQL editor doesn't quietly bypass these rules.
alter table public.profiles    force row level security;
alter table public.admin_users force row level security;
alter table public.bookings    force row level security;
alter table public.promo_codes force row level security;

-- ---------------------------------------------------------
-- Start from nothing.
--
-- Supabase grants broad table privileges to `anon` and `authenticated` by
-- default and relies on RLS alone. Revoking first means a table added later
-- without a policy is unreachable rather than wide open, and it removes the
-- ability to even attempt a write.
-- ---------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

-- ---------------------------------------------------------
-- courts — the only table the public may read directly
-- ---------------------------------------------------------
grant select on public.courts to anon, authenticated;

drop policy if exists courts_public_read on public.courts;
create policy courts_public_read
  on public.courts
  for select
  to anon, authenticated
  using (active = true);

-- ---------------------------------------------------------
-- settings — opening hours and pricing rules are public information
-- ---------------------------------------------------------
grant select on public.settings to anon, authenticated;

drop policy if exists settings_public_read on public.settings;
create policy settings_public_read
  on public.settings
  for select
  to anon, authenticated
  using (key in ('hours', 'pricing'));

-- ---------------------------------------------------------
-- profiles — a signed-in user may read and edit only their own
--
-- Column-level grants restrict the update to name and phone. A policy alone
-- would let a user set banned = false or vip = true on their own row, since
-- policies gate rows, not columns.
-- ---------------------------------------------------------
grant select on public.profiles to authenticated;
grant update (name, phone) on public.profiles to authenticated;

drop policy if exists profiles_read_own on public.profiles;
create policy profiles_read_own
  on public.profiles
  for select
  to authenticated
  using (id = (select auth.uid()));

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ---------------------------------------------------------
-- bookings — read your own, and only your own
--
-- No insert, update or delete policy exists for any browser-held role. Every
-- write goes through the API so that pricing, availability and the promo
-- counter are applied. A customer cannot create a booking with an amount of
-- their choosing by talking to PostgREST.
-- ---------------------------------------------------------
grant select on public.bookings to authenticated;

drop policy if exists bookings_read_own on public.bookings;
create policy bookings_read_own
  on public.bookings
  for select
  to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------
-- No policies at all for: admin_users, blocks, promo_codes.
--
-- That is intentional and is the strongest statement this file makes.
--   admin_users — who is staff is not public, and cannot be self-assigned.
--   promo_codes — discount codes must not be enumerable.
--   blocks      — internal scheduling; the public sees the effect via
--                 /api/availability, which reports 'blocked' and nothing more.
-- ---------------------------------------------------------

-- ---------------------------------------------------------
-- Convenience helper for anyone reading the data by hand in the SQL editor.
-- The API does not rely on it — it checks admin_users itself — but having one
-- definition of "is staff" avoids the question being answered two ways.
-- ---------------------------------------------------------
create or replace function public.is_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.admin_users a where a.user_id = p_user_id);
$$;

revoke all on function public.is_admin(uuid) from public, anon, authenticated;
