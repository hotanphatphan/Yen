-- Invoices table
-- direction: 'incoming' = mua vào (company là buyer), 'outgoing' = bán ra (company là seller)

create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  direction text not null check (direction in ('incoming', 'outgoing')),

  -- Invoice identity
  invoice_number text,
  invoice_series text,
  invoice_date date,

  -- Parties
  seller_name text,
  seller_mst text,
  buyer_name text,
  buyer_mst text,

  -- Financials (in VND, stored as integers)
  subtotal bigint not null default 0,
  vat_amount bigint not null default 0,
  total bigint not null default 0,
  vat_rate text,

  -- Line items
  line_items jsonb not null default '[]',

  -- File
  file_path text,
  file_name text,
  source_format text check (source_format in ('pdf', 'xml', 'html')),

  -- Accounting
  status text not null default 'pending' check (status in ('pending', 'matched', 'posted')),
  transaction_id uuid references transactions(id) on delete set null,
  suggested_account_code text,
  notes text,

  created_at timestamptz default now()
);

create index if not exists idx_invoices_company on invoices(company_id);
create index if not exists idx_invoices_date on invoices(invoice_date);
create index if not exists idx_invoices_status on invoices(company_id, status);
create index if not exists idx_invoices_direction on invoices(company_id, direction);

alter table invoices enable row level security;

create policy "invoices_accountant" on invoices
  for all using (company_id in (select accountant_company_ids()));

-- Storage bucket for invoices
insert into storage.buckets (id, name, public) values ('invoices', 'invoices', false)
on conflict do nothing;

create policy "invoices_storage_upload" on storage.objects
  for insert with check (bucket_id = 'invoices' and auth.role() = 'authenticated');

create policy "invoices_storage_read" on storage.objects
  for select using (bucket_id = 'invoices' and auth.role() = 'authenticated');

create policy "invoices_storage_delete" on storage.objects
  for delete using (bucket_id = 'invoices' and auth.role() = 'authenticated');
