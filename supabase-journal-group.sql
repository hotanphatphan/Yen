-- Multi-line journal entries — link split rows via group_id
-- Run once in Supabase SQL Editor. Safe to run multiple times.

alter table journal_entries
  add column if not exists group_id uuid;

create index if not exists idx_journal_entries_group
  on journal_entries(company_id, group_id);
