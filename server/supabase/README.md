# Database

## Applying migrations

```bash
cd server
npx supabase link --project-ref YOUR-PROJECT-REF
npx supabase db push
```

They run in filename order and are written to be re-runnable, so a partial
apply can be repeated safely.

| File | What it does |
|---|---|
| `20250101000001_schema.sql` | Tables, constraints, indexes, the signup trigger |
| `20250101000002_rls.sql` | Row level security — revokes first, then grants back the few public reads |
| `20250101000003_create_booking.sql` | The atomic booking function and the hours resolver |
| `20250101000004_seed.sql` | Three courts, default hours, default pricing |

## Creating a staff account

There is deliberately no endpoint for this. Adding an admin requires database
access, so compromising the API is not enough to become one.

1. Sign up through the site with the address that should have staff access,
   and confirm the email.
2. In the Supabase SQL editor:

```sql
insert into public.admin_users (user_id, note)
select id, 'Front desk'
from auth.users
where email = 'you@example.com'
on conflict (user_id) do nothing;
```

3. Confirm it took:

```sql
select u.email, a.note
from public.admin_users a
join auth.users u on u.id = a.user_id;
```

To revoke:

```sql
delete from public.admin_users
where user_id = (select id from auth.users where email = 'them@example.com');
```

The next request they make is a 403. Their customer account is untouched.

## Things worth knowing

**Day-of-week indexing.** `0` is Sunday everywhere — JavaScript's `getDay()`,
Postgres's `extract(dow)`, and index 0 of the `weekly` array in the hours
config. They were made to agree so nothing needs to translate between them.

**Half-open hour ranges.** A booking occupies `[start, start + duration)`. One
ending at 18:00 and one starting at 18:00 do not overlap.

**Why bookings are cancelled, not deleted.** Reports need the history, and the
exclusion constraint only covers `status = 'paid'`, so a cancellation frees the
slot immediately without losing the record.

**Changing a court's rate does not change past bookings.** `bookings.amount`
is the amount actually charged, stored at the time. Reports read that column,
never a recomputed price.

## Verifying RLS is doing its job

With the anon key — every one of these should return nothing or an error:

```sql
-- as the anon role
select * from public.promo_codes;   -- permission denied
select * from public.admin_users;   -- permission denied
select * from public.blocks;        -- permission denied
insert into public.bookings (court_id, date, start_hour, duration, amount)
values ('court-1', current_date, 9, 1, 1);   -- permission denied
```

The last one is the important one: it is the "book a court for one peso"
attack, refused at the database rather than by the application.
