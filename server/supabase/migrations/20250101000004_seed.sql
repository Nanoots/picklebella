-- =========================================================
-- PickleBella Park — starting data
--
-- Courts and configuration only. No users, no bookings, no promo codes:
-- seed data that logs in is how a demo account survives into production.
-- Staff accounts are created by hand — see server/supabase/README.md.
-- =========================================================

insert into public.courts (id, name, type, surface, rate, emoji, color, feats, lighting, active, sort_order)
values
  ('court-1', 'Court 1', 'Indoor',  'Cushioned Acrylic',  300, '🥒',
   'linear-gradient(135deg,#1b5236,#0f3324)',
   array['Roofed', 'Pro Lighting', 'Net Cam'], true, true, 1),

  ('court-2', 'Court 2', 'Indoor',  'Cushioned Acrylic',  300, '🏓',
   'linear-gradient(135deg,#256e46,#14432c)',
   array['Roofed', 'Pro Lighting', 'Beginner Friendly'], true, true, 2),

  ('court-3', 'Court 3', 'Outdoor', 'Acrylic Hard Court', 300, '☀️',
   'linear-gradient(135deg,#e63e8c,#d81c72)',
   array['Open Air', 'Shaded Seating', 'Great for Groups'], true, true, 3)
on conflict (id) do nothing;

-- Open 6:00 to 22:00, seven days. Index 0 is Sunday, matching JavaScript's
-- getDay() and Postgres's extract(dow).
insert into public.settings (key, value)
values (
  'hours',
  jsonb_build_object(
    'weekly', jsonb_build_array(
      jsonb_build_object('open', 6, 'close', 22, 'closed', false),
      jsonb_build_object('open', 6, 'close', 22, 'closed', false),
      jsonb_build_object('open', 6, 'close', 22, 'closed', false),
      jsonb_build_object('open', 6, 'close', 22, 'closed', false),
      jsonb_build_object('open', 6, 'close', 22, 'closed', false),
      jsonb_build_object('open', 6, 'close', 22, 'closed', false),
      jsonb_build_object('open', 6, 'close', 22, 'closed', false)
    ),
    'holidays', '[]'::jsonb
  )
)
on conflict (key) do nothing;

insert into public.settings (key, value)
values (
  'pricing',
  jsonb_build_object(
    'peakEnabled',   false,
    'peakStartHour', 17,
    'peakEndHour',   21,
    'peakDays',      jsonb_build_array(1, 2, 3, 4, 5),
    'peakMultiplier', 1.25
  )
)
on conflict (key) do nothing;
