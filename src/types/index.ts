export type UserRole = 'accountant' | 'client' | 'super_admin'

export interface Invitation {
  id: string
  email: string | null
  role: 'accountant' | 'client'
  company_id: string | null
  invited_by: string
  used_at: string | null
  created_at: string
}

export interface Profile {
  id: string
  email: string
  full_name: string | null
  role: UserRole
  company_id: string | null
  created_at: string
}

export type BusinessType = 'cong_ty' | 'ho_kinh_doanh'

export interface Company {
  id: string
  accountant_id: string
  name: string
  mst: string
  business_type: BusinessType
  owner_name: string | null
  owner_phone: string | null
  owner_email: string | null
  address: string | null
  notes: string | null
  vat_rate: number
  client_user_id: string | null
  invited_email: string | null
  invite_sent_at: string | null
  created_at: string
}

export type ComplianceType = 'vat_quarterly' | 'payroll_monthly' | 'bctc_annual' | 'custom'
export type ComplianceStatus = 'not_started' | 'in_progress' | 'completed' | 'overdue'

export interface ComplianceItem {
  id: string
  company_id: string
  type: ComplianceType
  name: string
  period: string
  due_date: string
  status: ComplianceStatus
  notes: string | null
  created_at: string
}

export type DocumentRequestType = 'general' | 'invoice_template'
export type DocumentRequestStatus = 'pending' | 'uploaded' | 'reviewed'

export interface DocumentRequest {
  id: string
  company_id: string
  title: string
  description: string | null
  deadline: string | null
  type: DocumentRequestType
  status: DocumentRequestStatus
  created_at: string
}

export interface Document {
  id: string
  company_id: string
  request_id: string | null
  name: string
  file_path: string
  file_type: string | null
  file_size: number | null
  uploaded_by: string
  shared_with_client: boolean
  created_at: string
}

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'

export interface Account {
  id: string
  company_id: string
  code: string
  name: string
  type: AccountType
  parent_code: string | null
  is_system: boolean
  created_at: string
}

export type CategoryType = 'income' | 'expense'

export interface Category {
  id: string
  company_id: string
  name: string
  type: CategoryType
  account_id: string | null
  created_at: string
}

export type TransactionType = 'income' | 'expense'
export type TransactionStatus = 'draft' | 'official'
export type TransactionSource = 'manual' | 'excel_import' | 'bank_import'

export interface Transaction {
  id: string
  company_id: string
  date: string
  type: TransactionType
  amount: number
  vat_amount: number
  category_id: string | null
  account_id: string | null
  description: string | null
  attachment_path: string | null
  status: TransactionStatus
  source: TransactionSource
  invoice_number: string | null
  counterparty: string | null
  bank_transaction_id: string | null
  needs_review: boolean
  created_at: string
}

export interface BankStatement {
  id: string
  company_id: string
  file_name: string
  bank_name: string | null
  period_start: string | null
  period_end: string | null
  created_at: string
}

export type BankTransactionStatus = 'unmatched' | 'matched'

export interface BankTransaction {
  id: string
  statement_id: string
  company_id: string
  date: string
  description: string
  amount: number
  balance: number | null
  matched_transaction_id: string | null
  status: BankTransactionStatus
  created_at: string
}

export type VATStatus = 'draft' | 'finalized'

export interface VATPeriod {
  id: string
  company_id: string
  period: string
  output_vat: number
  input_vat: number
  payable: number
  adjustments: VATAdjustment[]
  status: VATStatus
  finalized_at: string | null
  created_at: string
}

export interface VATAdjustment {
  label: string
  amount: number
}

export interface Notification {
  id: string
  user_id: string
  title: string
  content: string
  type: 'overdue' | 'upload' | 'review' | 'system'
  related_company_id: string | null
  read: boolean
  created_at: string
}

export interface QuarterClosingStages {
  bank_reconciled: boolean
  transactions_complete: boolean
  quarter_closed: boolean
}

export interface QuarterClosing {
  id: string
  company_id: string
  year: number
  quarter: number
  stages: QuarterClosingStages
  closed_at: string | null
  created_at: string
}

export interface JournalEntry {
  id: string
  company_id: string
  date: string
  description: string | null
  debit_account: string
  credit_account: string
  amount: number
  type: string | null
  vat_amount: number
  vat_debit_account: string | null
  vat_credit_account: string | null
  invoice_id: string | null
  notes: string | null
  status: string | null
  created_at: string
}

export type InvoiceDirection = 'incoming' | 'outgoing'
export type InvoiceStatus = 'pending' | 'matched' | 'posted'
export type InvoiceSourceFormat = 'pdf' | 'xml' | 'html'

export interface Invoice {
  id: string
  company_id: string
  direction: InvoiceDirection
  invoice_number: string | null
  invoice_series: string | null
  invoice_date: string | null
  seller_name: string | null
  seller_mst: string | null
  buyer_name: string | null
  buyer_mst: string | null
  subtotal: number
  vat_amount: number
  total: number
  vat_rate: string | null
  line_items: unknown[]
  file_name: string | null
  source_format: InvoiceSourceFormat | null
  status: InvoiceStatus
  created_at: string
}

export interface DraftTransaction {
  row_index: number
  date: string
  invoice_number: string
  counterparty: string
  description: string
  amount: number
  vat_amount: number
  total: number
  type: TransactionType
  category_name: string
  matched_category_id: string | null
  needs_review: boolean
  rejected: boolean
}
