import { supabase } from './supabase'

export interface GeminiMatchResult {
  bank_tx_id: string
  invoice_id: string | null
  debit_account: string
  credit_account: string
  vat_account: string | null
  confidence: number
  reason: string
}

export interface BankTxInput {
  id: string
  date: string
  description: string
  amount: number
}

export interface InvoiceInput {
  id: string
  date: string
  vendor: string
  amount: number
  vat_amount: number
  invoice_number: string | null
  category: string | null
}

export async function autoMatchTransactions(
  bankTxs: BankTxInput[],
  invoices: InvoiceInput[]
): Promise<GeminiMatchResult[]> {
  const { data, error } = await supabase.functions.invoke('auto-match-transactions', {
    body: { bankTxs, invoices },
  })

  if (error) throw new Error('Lỗi kết nối Supabase Edge Function: ' + error.message)
  if (data?.error) throw new Error('Lỗi từ AI: ' + data.error)

  return data.data as GeminiMatchResult[]
}
