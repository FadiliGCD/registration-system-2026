-- 1) In Supabase > Authentication > Users, create 5 users:
--    one admin + four tablet users.
-- 2) Copy each user's UUID and replace the placeholders below.
-- 3) Run this file in SQL Editor.

insert into public.profiles(user_id, role, device_name, active) values
  ('PASTE_ADMIN_UUID_HERE',   'admin',  'Main Laptop', true),
  ('PASTE_TABLET1_UUID_HERE', 'sender', 'Tablet 1',    true),
  ('PASTE_TABLET2_UUID_HERE', 'sender', 'Tablet 2',    true),
  ('PASTE_TABLET3_UUID_HERE', 'sender', 'Tablet 3',    true),
  ('PASTE_TABLET4_UUID_HERE', 'sender', 'Tablet 4',    true)
on conflict (user_id) do update
set role = excluded.role,
    device_name = excluded.device_name,
    active = excluded.active;
