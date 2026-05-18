-- Migration: Journal Entries (double-entry closing/adjustment entries)
-- Run this in Supabase SQL Editor after supabase-schema.sql

create table if not exists journal_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  date date not null,
  description text,
  debit_account text not null,
  credit_account text not null,
  amount bigint not null default 0,
  created_at timestamptz default now()
);

alter table journal_entries enable row level security;

create policy "accountant full access" on journal_entries
  for all using (
    exists (
      select 1 from companies c
      join profiles p on p.id = c.accountant_id
      where c.id = journal_entries.company_id
        and p.id = auth.uid()
    )
  );
