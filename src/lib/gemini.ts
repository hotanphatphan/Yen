import { supabase } from './supabase'

export interface GeminiMatchResult {
  bank_tx_id: string
  invoice_id: string | null  // null nếu không match được
  debit_account: string      // mã TK nợ, VD: "642"
  credit_account: string     // mã TK có, VD: "112"
  vat_account: string | null // "133" nếu có VAT, null nếu không
  confidence: number         // 0-1
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

  if (data?.error) throw new Error(data.error)
  if (error) throw new Error(error.message)

  return data.data as GeminiMatchResult[]
}
