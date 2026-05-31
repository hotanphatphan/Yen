-- Run this in Supabase Dashboard > SQL Editor

-- 1. bank_accounts table
CREATE TABLE IF NOT EXISTS bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  bank_name text NOT NULL,
  account_number text NOT NULL,
  account_name text,
  account_code text NOT NULL DEFAULT '1121',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "accountant_owns_bank_accounts" ON bank_accounts
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM companies
      WHERE companies.id = bank_accounts.company_id
        AND companies.accountant_id = auth.uid()
    )
  );

-- 2. Link bank_statements with bank_account
ALTER TABLE bank_statements
  ADD COLUMN IF NOT EXISTS bank_account_id uuid REFERENCES bank_accounts(id);

-- 3. Link bank_transactions with bank_account
ALTER TABLE bank_transactions
  ADD COLUMN IF NOT EXISTS bank_account_id uuid REFERENCES bank_accounts(id);

-- 4. Add journal_entry_id to bank_transactions (for tracking posted entries)
ALTER TABLE bank_transactions
  ADD COLUMN IF NOT EXISTS journal_entry_id uuid REFERENCES journal_entries(id),
  ADD COLUMN IF NOT EXISTS posting_data jsonb;
