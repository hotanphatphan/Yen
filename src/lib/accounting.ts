// Suy ra doanh thu / chi phí từ bút toán (journal_entries) theo lớp tài khoản VAS.
//
// Vì sao cần file này: các luồng hạch toán (ngân hàng, sổ quỹ, hóa đơn) ghi vào
// bảng `journal_entries`, trong khi báo cáo lãi/lỗ trước đây chỉ đọc bảng
// `transactions` → doanh thu/chi phí book qua các luồng đó bị bỏ sót. Các hàm
// dưới đây tính bổ sung phần P&L nằm trong journal_entries.
//
// Quy ước tài khoản (Thông tư 200/133):
//   5xx, 7xx = doanh thu / thu nhập (số dư Có)
//   6xx, 8xx = chi phí (số dư Nợ)
//   9xx (911...) = xác định kết quả KD — KHÔNG tính vào doanh thu/chi phí.

import type { JournalEntry } from '@/types'

export const isRevenueAccount = (code: string): boolean =>
  code.startsWith('5') || code.startsWith('7')

export const isExpenseAccount = (code: string): boolean =>
  code.startsWith('6') || code.startsWith('8')

type PLEntry = Pick<JournalEntry, 'date' | 'debit_account' | 'credit_account' | 'amount'>

/** Đánh dấu dòng VAT tách ra từ 1 bút toán (không phải bản ghi thật trong DB → không cho sửa trực tiếp). */
export const VAT_LINE_SUFFIX = '#vat'
export const isVatLine = (e: { id: string }) => e.id.endsWith(VAT_LINE_SUFFIX)

/**
 * Mỗi bút toán có thể mang 2 vế: vế chính (debit/credit/amount) và vế thuế GTGT
 * (vat_debit_account/vat_credit_account/vat_amount — VD Nợ 1331 / Có 331 khi mua hàng,
 * Nợ 131 / Có 33311 khi bán hàng). Báo cáo phải cộng cả vế thuế, nếu không TK 1331, 33311
 * biến mất và TK 131/331/112 bị thiếu đúng phần thuế.
 * Hàm này trả về danh sách bút toán đã tách vế thuế thành dòng riêng để cộng dồn như bình thường.
 */
export function expandVatLines<T extends Pick<JournalEntry, 'id' | 'debit_account' | 'credit_account' | 'amount' | 'vat_debit_account' | 'vat_credit_account' | 'vat_amount'>>(entries: T[]): T[] {
  const out: T[] = []
  for (const e of entries) {
    out.push(e)
    if (e.vat_amount && e.vat_debit_account && e.vat_credit_account) {
      out.push({ ...e, id: e.id + VAT_LINE_SUFFIX, debit_account: e.vat_debit_account, credit_account: e.vat_credit_account, amount: e.vat_amount })
    }
  }
  return out
}

/** Ngày 'YYYY-MM-DD' theo giờ địa phương (toISOString() đổi sang UTC → lùi 1 ngày ở VN). */
export const localYmd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// So sánh ngày dạng 'YYYY-MM-DD' bằng chuỗi là chính xác. from/to là optional.
function inPeriod(date: string, from?: string, to?: string): boolean {
  if (from && date < from) return false
  if (to && date > to) return false
  return true
}

// Doanh thu phát sinh trong kỳ từ journal_entries.
// Ghi Có TK doanh thu → +; ghi Nợ TK doanh thu (hàng bán bị trả lại, kết chuyển) → −.
export function periodRevenueFromJournal(entries: PLEntry[], from?: string, to?: string): number {
  return entries.reduce((s, e) => {
    if (!inPeriod(e.date, from, to)) return s
    if (isRevenueAccount(e.credit_account)) return s + e.amount
    if (isRevenueAccount(e.debit_account)) return s - e.amount
    return s
  }, 0)
}

// Chi phí phát sinh trong kỳ từ journal_entries.
// Ghi Nợ TK chi phí → +; ghi Có TK chi phí (hoàn nhập, kết chuyển) → −.
export function periodExpenseFromJournal(entries: PLEntry[], from?: string, to?: string): number {
  return entries.reduce((s, e) => {
    if (!inPeriod(e.date, from, to)) return s
    if (isExpenseAccount(e.debit_account)) return s + e.amount
    if (isExpenseAccount(e.credit_account)) return s - e.amount
    return s
  }, 0)
}
