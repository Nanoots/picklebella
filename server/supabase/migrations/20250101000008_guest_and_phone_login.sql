-- =========================================================
-- PickleBella Park — guest checkout + sign in by phone
--
-- Two independent changes that both loosen `profiles`:
--
-- 1. Guest checkout uses Supabase's built-in anonymous sign-in
--    (supabase.auth.signInAnonymously()) so the existing authenticated
--    booking/payment path works unchanged for guests — they get a real,
--    if disposable, JWT. An anonymous auth.users row has no email, and
--    handle_new_user() copies auth.users.email straight into
--    profiles.email, so the NOT NULL constraint there would abort the
--    trigger — and with it, the anonymous sign-in itself. Two different
--    guests both having a null email is fine: Postgres does not treat
--    NULLs as duplicates under a UNIQUE constraint.
--
-- 2. Signing in with a phone number (instead of email) needs a way to
--    look up which account a phone number belongs to. A UNIQUE index
--    scoped to non-blank phones would be the tidy version of that lookup
--    — but at least one phone number is already shared by two real
--    accounts (same name, two different emails, a minute apart), so a
--    unique constraint would fail to apply and this migration is not the
--    place to guess which of those two rows to fix. Instead the index
--    below is a plain (non-unique) one for lookup performance, and the
--    lookup endpoint treats more than one match for a phone as "not
--    found" rather than picking one of the two accounts at random.
-- =========================================================

alter table public.profiles
  alter column email drop not null;

create index if not exists profiles_phone_idx
  on public.profiles (phone)
  where phone <> '';
