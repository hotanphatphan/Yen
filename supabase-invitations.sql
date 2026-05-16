-- Run this in Supabase SQL Editor to add the invitation system

-- 1. Update profiles role constraint to include super_admin
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('accountant', 'client', 'super_admin'));

-- 2. Invitations table
create table if not exists invitations (
  id uuid primary key default gen_random_uuid(),
  email text,
  role text not null check (role in ('accountant', 'client')),
  company_id uuid references companies(id) on delete cascade,
  invited_by uuid not null references profiles(id),
  used_at timestamptz,
  created_at timestamptz default now()
);

alter table invitations enable row level security;

-- Super admin and accountants can insert invitations
create policy "invitations_insert" on invitations
  for insert with check (
    auth.uid() in (select id from profiles where role in ('super_admin', 'accountant'))
  );

-- Anyone can read any invitation (needed to validate token on invite page)
create policy "invitations_select" on invitations
  for select using (true);

-- Anyone can mark invitation used
create policy "invitations_update" on invitations
  for update using (true);

-- 3. Set your account as super_admin
-- Replace the email below if needed
update profiles set role = 'super_admin'
  where email = 'hotanphat.phan@gmail.com';

-- If your profile row doesn't exist yet, insert it:
-- (get your user ID from Authentication > Users in Supabase dashboard)
insert into profiles (id, email, full_name, role)
  select id, email, raw_user_meta_data->>'full_name', 'super_admin'
  from auth.users
  where email = 'hotanphat.phan@gmail.com'
on conflict (id) do update set role = 'super_admin';
