// Hạch toán hàng loạt: chọn tài khoản cho mỗi hóa đơn theo đúng cách công ty đã hạch toán trước đó.
// Ưu tiên: (1) cùng người bán (MST) đã từng hạch toán → dùng lại;
//          (2) bộ tài khoản dùng nhiều nhất của công ty cho cùng chiều (mua vào / bán ra);
//          (3) gợi ý mặc định theo tên người bán (suggestAccounts).
import { suggestAccounts } from '@/lib/accountSuggestion'
import type { Invoice } from '@/types'

export interface AccountSet {
  debit: string
  credit: string
  vatDebit: string | null
  vatCredit: string | null
}

export interface PostedHistoryRow {
  direction: string
  seller_mst: string | null
  buyer_mst: string | null
  debit_account: string
  credit_account: string
  vat_debit_account: string | null
  vat_credit_account: string | null
}

export interface AccountHistory {
  byPartner: Map<string, AccountSet>
  mostUsed: { incoming?: AccountSet; outgoing?: AccountSet }
}

const partnerOf = (r: { direction: string; seller_mst: string | null; buyer_mst: string | null }) =>
  (r.direction === 'incoming' ? r.seller_mst : r.buyer_mst)?.trim() || null

export function buildAccountHistory(rows: PostedHistoryRow[]): AccountHistory {
  const byPartner = new Map<string, AccountSet>()
  const counts: Record<string, Map<string, { set: AccountSet; n: number }>> = { incoming: new Map(), outgoing: new Map() }
  for (const r of rows) {
    const set: AccountSet = { debit: r.debit_account, credit: r.credit_account, vatDebit: r.vat_debit_account, vatCredit: r.vat_credit_account }
    const p = partnerOf(r)
    if (p) byPartner.set(`${r.direction}|${p}`, set) // bản sau cùng thắng
    const bucket = counts[r.direction]
    if (!bucket) continue
    const k = `${set.debit}|${set.credit}|${set.vatDebit}|${set.vatCredit}`
    const c = bucket.get(k) ?? { set, n: 0 }
    c.n++
    bucket.set(k, c)
  }
  const top = (m: Map<string, { set: AccountSet; n: number }>) =>
    [...m.values()].filter(c => c.set.vatDebit || c.set.vatCredit).sort((a, b) => b.n - a.n)[0]?.set
  return { byPartner, mostUsed: { incoming: top(counts.incoming), outgoing: top(counts.outgoing) } }
}

export function pickAccounts(inv: Invoice, history: AccountHistory): AccountSet & { source: 'partner' | 'company' | 'default' } {
  const hasVat = inv.vat_amount > 0
  const withVat = (s: AccountSet): AccountSet => hasVat
    ? { ...s, vatDebit: s.vatDebit ?? (inv.direction === 'incoming' ? '1331' : s.debit), vatCredit: s.vatCredit ?? (inv.direction === 'incoming' ? s.credit : '33311') }
    : { ...s, vatDebit: null, vatCredit: null }

  const p = partnerOf(inv)
  const fromPartner = p ? history.byPartner.get(`${inv.direction}|${p}`) : undefined
  if (fromPartner) return { ...withVat(fromPartner), source: 'partner' }

  const common = inv.direction === 'incoming' ? history.mostUsed.incoming : history.mostUsed.outgoing
  if (common) return { ...withVat(common), source: 'company' }

  const s = suggestAccounts(inv)
  return { debit: s.debitAccount, credit: s.creditAccount, vatDebit: s.vatDebitAccount, vatCredit: s.vatCreditAccount, source: 'default' }
}

/** Diễn giải chuẩn cho bút toán hàng loạt (không dùng tên dòng hàng đầu tiên vì thường vô nghĩa, VD "Khăn lạnh"). */
export function bulkDescription(inv: Invoice): string {
  return inv.direction === 'incoming'
    ? `Mua hàng từ ${inv.seller_name ?? 'NCC'} - HĐ ${inv.invoice_series ?? ''}/${inv.invoice_number ?? ''}`
    : `Bán hàng cho ${inv.buyer_name ?? 'KH'} - HĐ ${inv.invoice_series ?? ''}/${inv.invoice_number ?? ''}`
}
