-- =========================================================
-- PickleBella Park — close the implicit PUBLIC execute grant
--
-- Postgres grants EXECUTE on every newly created function to the PUBLIC role.
-- `REVOKE ... FROM anon, authenticated` does NOT remove that, because PUBLIC is
-- a separate implicit grantee. The blanket revoke in the RLS migration
-- therefore left handle_new_user() reachable over /rest/v1/rpc/ by anyone,
-- which Supabase's database linter correctly flagged.
--
-- Calling it would have failed anyway (a trigger function has no NEW record
-- outside a trigger), but an unauthenticated caller should not be able to
-- reach a SECURITY DEFINER function at all — the next such function added
-- might not be so harmless.
--
-- Lesson worth keeping: for functions, always revoke from `public` explicitly,
-- not just from the Supabase roles.
-- =========================================================

revoke all on function public.handle_new_user() from public, anon, authenticated;

-- Re-stated for the three that already revoked from PUBLIC, so this migration
-- is a complete statement of the intended grants rather than a patch.
revoke all on function public.is_admin(uuid) from public, anon, authenticated;
revoke all on function public.hours_for_date(date) from public, anon, authenticated;
revoke all on function public.create_bookings(uuid, jsonb, text, text, text, int, text, text, text)
  from public, anon, authenticated;

-- Anything added to this schema later starts with no EXECUTE for PUBLIC.
alter default privileges in schema public revoke execute on functions from public;
