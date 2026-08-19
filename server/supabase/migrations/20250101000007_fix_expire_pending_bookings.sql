-- =========================================================
-- PickleBella Park — drop the scratch table from expire_pending_bookings
--
-- The previous version staged the rows it had just expired in a TEMPORARY
-- table so it could count them and refund each basket's promo redemption. It
-- cleared that table with a bare `delete from _lapsed_holds;`.
--
-- That works in the SQL editor and fails everywhere that matters. Supabase
-- runs PostgREST's connections with a safe-update guard which rejects any
-- UPDATE or DELETE that has no WHERE clause, raising SQLSTATE 21000
-- ("DELETE requires a WHERE clause"). Because create_bookings calls
-- expire_pending_bookings before it does anything else, every booking attempt
-- failed with it — a 400 from PostgREST that surfaced to the customer as a
-- flat 500.
--
-- Adding `where true` would have silenced it. Removing the table is better:
-- the whole thing was a workaround for wanting a row count, and a chain of
-- data-modifying CTEs gives that directly. Data-modifying CTEs are executed
-- exactly once and always to completion, whether or not the primary query
-- reads their output, so `refunded` still runs even though nothing selects
-- from it.
--
-- Lesson worth keeping, alongside the one in migration 5: a function that
-- passes in the SQL editor has not been tested. Anything the API calls has to
-- be exercised through PostgREST, which applies guards the editor does not.
-- =========================================================

create or replace function public.expire_pending_bookings()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_released integer := 0;
begin
  with lapsed as (
    update public.bookings
       set status = 'failed'
     where status = 'pending'
       and hold_expires_at is not null
       and hold_expires_at < now()
    returning promo_id, payment_intent_id
  ),
  -- One basket redeems a promo once however many rows it has, so count
  -- baskets (distinct intents), not rows.
  baskets as (
    select promo_id, count(distinct payment_intent_id) as n
      from lapsed
     where promo_id is not null
     group by promo_id
  ),
  refunded as (
    update public.promo_codes p
       set used_count = greatest(p.used_count - b.n, 0)
      from baskets b
     where p.id = b.promo_id
    returning 1
  )
  select count(*)::int into v_released from lapsed;

  return v_released;
end;
$$;

revoke all on function public.expire_pending_bookings() from public, anon, authenticated;
