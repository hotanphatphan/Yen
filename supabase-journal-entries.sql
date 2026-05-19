-- Journal Entries — migration (handles existing table from old schema)
-- Run this in Supabase SQL Editor after supabase-schema.sql and supabase-invoices.sql

-- Step 1: Create table if not exists (first-time setup)
create table if not exists journal_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  date date not null,
  description text not null default '',
  debit_account text not null,
  credit_account text not null,
  amount bigint not null default 0,
  created_at timestamptz default now()
);

-- Step 2: Add missing columns if they don't exist yet (safe to run multiple times)
alter table journal_entries
  add column if not exists type text not null default 'closing',
  add column if not exists vat_debit_account text,
  add column if not exists vat_credit_account text,
  add column if not exists vat_amount bigint not null default 0,
  add column if not exists invoice_id uuid references invoices(id) on delete set null,
  add column if not exists notes text,
  add column if not exists status text not null default 'posted';

-- Step 3: Add check constraints (ignore if already exists)
do $$ begin
  alter table journal_entries
    add constraint journal_entries_type_check
    check (type in ('closing', 'adjustment', 'accrual', 'invoice'));
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table journal_entries
    add constraint journal_entries_status_check
    check (status in ('draft', 'posted'));
exception when duplicate_object then null;
end $$;

-- Step 4: Indexes
create index if not exists idx_journal_entries_company on journal_entries(company_id);
create index if not exists idx_journal_entries_date on journal_entries(date);
create index if not exists idx_journal_entries_type on journal_entries(company_id, type);
create index if not exists idx_journal_entries_status on journal_entries(company_id, status);

-- Step 5: RLS
alter table journal_entries enable row level security;

-- Drop old policy if exists, then recreate
drop policy if exists "accountant full access" on journal_entries;
drop policy if exists "journal_entries_accountant" on journal_entries;

create policy "journal_entries_accountant" on journal_entries
  for all using (company_id in (select accountant_company_ids()));
