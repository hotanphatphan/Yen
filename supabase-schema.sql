-- KeToanPro Database Schema
-- Run this in Supabase SQL Editor

-- Profiles (extends auth.users)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role text check (role in ('accountant', 'client')),
  company_id uuid,
  created_at timestamptz default now()
);

-- Companies
create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  accountant_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  mst text not null,
  business_type text not null check (business_type in ('cong_ty', 'ho_kinh_doanh')),
  owner_name text,
  owner_phone text,
  owner_email text,
  address text,
  notes text,
  vat_rate numeric not null default 10,
  client_user_id uuid references profiles(id),
  invited_email text,
  invite_sent_at timestamptz,
  created_at timestamptz default now()
);

-- Add foreign key from profiles.company_id to companies
alter table profiles
  add constraint profiles_company_id_fkey
  foreign key (company_id) references companies(id) on delete set null
  not valid;

-- Compliance Items
create table if not exists compliance_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  type text not null check (type in ('vat_quarterly', 'payroll_monthly', 'bctc_annual', 'custom')),
  name text not null,
  period text not null,
  due_date date not null,
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'completed', 'overdue')),
  notes text,
  created_at timestamptz default now()
);

-- Document Requests
create table if not exists document_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  title text not null,
  description text,
  deadline date,
  type text not null default 'general' check (type in ('general', 'invoice_template')),
  status text not null default 'pending' check (status in ('pending', 'uploaded', 'reviewed')),
  created_at timestamptz default now()
);

-- Documents
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  request_id uuid references document_requests(id) on delete set null,
  name text not null,
  file_path text not null,
  file_type text,
  file_size bigint,
  uploaded_by uuid not null references profiles(id),
  shared_with_client boolean not null default false,
  created_at timestamptz default now()
);

-- Chart of Accounts
create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  code text not null,
  name text not null,
  type text not null check (type in ('asset', 'liability', 'equity', 'revenue', 'expense')),
  parent_code text,
  is_system boolean not null default false,
  created_at timestamptz default now(),
  unique (company_id, code)
);

-- Categories
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  type text not null check (type in ('income', 'expense')),
  account_id uuid references accounts(id),
  created_at timestamptz default now()
);

-- Transactions
create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  date date not null,
  type text not null check (type in ('income', 'expense')),
  amount bigint not null,
  vat_amount bigint not null default 0,
  category_id uuid references categories(id),
  account_id uuid references accounts(id),
  description text,
  attachment_path text,
  status text not null default 'official' check (status in ('draft', 'official')),
  source text not null default 'manual' check (source in ('manual', 'excel_import', 'bank_import')),
  invoice_number text,
  counterparty text,
  bank_transaction_id uuid,
  needs_review boolean not null default false,
  created_at timestamptz default now()
);

-- Bank Statements
create table if not exists bank_statements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  file_name text not null,
  bank_name text,
  period_start date,
  period_end date,
  created_at timestamptz default now()
);

-- Bank Transactions
create table if not exists bank_transactions (
  id uuid primary key default gen_random_uuid(),
  statement_id uuid not null references bank_statements(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  date date not null,
  description text not null,
  amount bigint not null,
  balance bigint,
  matched_transaction_id uuid references transactions(id),
  status text not null default 'unmatched' check (status in ('unmatched', 'matched')),
  created_at timestamptz default now()
);

-- VAT Periods
create table if not exists vat_periods (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  period text not null,
  output_vat bigint not null default 0,
  input_vat bigint not null default 0,
  payable bigint not null default 0,
  adjustments jsonb not null default '[]',
  status text not null default 'draft' check (status in ('draft', 'finalized')),
  finalized_at timestamptz,
  created_at timestamptz default now(),
  unique (company_id, period)
);

-- Notifications
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  content text not null,
  type text not null check (type in ('overdue', 'upload', 'review', 'system')),
  related_company_id uuid references companies(id) on delete set null,
  read boolean not null default false,
  created_at timestamptz default now()
);

-- Quarter Closings
create table if not exists quarter_closings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  year int not null,
  quarter int not null check (quarter between 1 and 4),
  stages jsonb not null default '{"bank_reconciled": false, "transactions_complete": false, "quarter_closed": false}',
  closed_at timestamptz,
  created_at timestamptz default now(),
  unique (company_id, year, quarter)
);

-- Indexes
create index if not exists idx_compliance_items_company on compliance_items(company_id);
create index if not exists idx_compliance_items_due_date on compliance_items(due_date);
create index if not exists idx_document_requests_company on document_requests(company_id);
create index if not exists idx_documents_company on documents(company_id);
create index if not exists idx_transactions_company on transactions(company_id);
create index if not exists idx_transactions_date on transactions(date);
create index if not exists idx_notifications_user on notifications(user_id);

-- RLS Policies
alter table profiles enable row level security;
alter table companies enable row level security;
alter table compliance_items enable row level security;
alter table document_requests enable row level security;
alter table documents enable row level security;
alter table accounts enable row level security;
alter table categories enable row level security;
alter table transactions enable row level security;
alter table bank_statements enable row level security;
alter table bank_transactions enable row level security;
alter table vat_periods enable row level security;
alter table notifications enable row level security;
alter table quarter_closings enable row level security;

-- profiles: users can read/update their own profile
create policy "profiles_own" on profiles
  for all using (auth.uid() = id);

-- companies: accountant owns it, client can read via company_id
create policy "companies_accountant" on companies
  for all using (accountant_id = auth.uid());

create policy "companies_client_read" on companies
  for select using (
    id in (select company_id from profiles where id = auth.uid() and company_id is not null)
  );

-- Helper function for accountant company access
create or replace function accountant_company_ids()
returns setof uuid language sql security definer as $$
  select id from companies where accountant_id = auth.uid()
$$;

-- Helper function for client company id
create or replace function client_company_id()
returns uuid language sql security definer as $$
  select company_id from profiles where id = auth.uid() limit 1
$$;

-- compliance_items
create policy "compliance_accountant" on compliance_items
  for all using (company_id in (select accountant_company_ids()));

create policy "compliance_client_read" on compliance_items
  for select using (company_id = client_company_id());

-- document_requests
create policy "doc_requests_accountant" on document_requests
  for all using (company_id in (select accountant_company_ids()));

create policy "doc_requests_client" on document_requests
  for select using (company_id = client_company_id());

-- documents
create policy "documents_accountant" on documents
  for all using (company_id in (select accountant_company_ids()));

create policy "documents_client" on documents
  for select using (company_id = client_company_id() and shared_with_client = true);

create policy "documents_client_upload" on documents
  for insert with check (company_id = client_company_id());

-- accounts
create policy "accounts_accountant" on accounts
  for all using (company_id in (select accountant_company_ids()));

create policy "accounts_client_read" on accounts
  for select using (company_id = client_company_id());

-- categories
create policy "categories_accountant" on categories
  for all using (company_id in (select accountant_company_ids()));

create policy "categories_client_read" on categories
  for select using (company_id = client_company_id());

-- transactions
create policy "transactions_accountant" on transactions
  for all using (company_id in (select accountant_company_ids()));

-- bank_statements
create policy "bank_statements_accountant" on bank_statements
  for all using (company_id in (select accountant_company_ids()));

-- bank_transactions
create policy "bank_transactions_accountant" on bank_transactions
  for all using (company_id in (select accountant_company_ids()));

-- vat_periods
create policy "vat_periods_accountant" on vat_periods
  for all using (company_id in (select accountant_company_ids()));

-- notifications
create policy "notifications_own" on notifications
  for all using (user_id = auth.uid());

-- quarter_closings
create policy "quarter_closings_accountant" on quarter_closings
  for all using (company_id in (select accountant_company_ids()));

-- Storage bucket for documents
insert into storage.buckets (id, name, public) values ('documents', 'documents', false)
on conflict do nothing;

create policy "documents_storage_accountant_upload" on storage.objects
  for insert with check (bucket_id = 'documents' and auth.role() = 'authenticated');

create policy "documents_storage_read" on storage.objects
  for select using (bucket_id = 'documents' and auth.role() = 'authenticated');

create policy "documents_storage_delete" on storage.objects
  for delete using (bucket_id = 'documents' and auth.role() = 'authenticated');

-- ============================================================
-- INVITATION SYSTEM (add after initial schema)
-- ============================================================

-- Update profiles role to include super_admin
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('accountant', 'client', 'super_admin'));

-- Invitations table
create table if not exists invitations (
  id uuid primary key default gen_random_uuid(),
  email text,
  role text not null check (role in ('accountant', 'client')),
  company_id uuid references companies(id) on delete cascade,
  invited_by uuid not null references profiles(id) on delete cascade,
  used_at timestamptz,
  created_at timestamptz default now()
);

alter table invitations enable row level security;

-- Super admin and accountants can create invitations
create policy "invitations_insert" on invitations
  for insert with check (
    auth.uid() in (select id from profiles where role in ('super_admin', 'accountant'))
  );

-- Creator can view their invitations
create policy "invitations_select" on invitations
  for select using (invited_by = auth.uid() or
    auth.uid() in (select id from profiles where role = 'super_admin')
  );

-- Anyone can read an invitation by token (for the invite page) - via service role or anon with specific token
create policy "invitations_public_read" on invitations
  for select using (true);

-- Anyone can mark an invitation as used
create policy "invitations_update" on invitations
  for update using (true);
