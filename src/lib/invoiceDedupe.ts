// Nhận diện hóa đơn trùng: cùng MST người bán + ký hiệu + số hóa đơn.
// Ký hiệu được chuẩn hóa về 6 ký tự cuối (bỏ ký tự loại hóa đơn "1"/"2" ở đầu: "1C26TYY" ≡ "C26TYY"),
// số hóa đơn bỏ số 0 ở đầu ("00000005" ≡ "5").

export interface DedupeInvoice {
  id: string
  seller_mst: string | null
  invoice_series: string | null
  invoice_number: string | null
  invoice_date: string | null
  status: string
  source_format: string | null
  created_at: string
}

export function normalizeSeries(series: string | null | undefined): string {
  const s = (series ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '')
  return s.length === 7 && /^[0-9]/.test(s) ? s.slice(1) : s
}

export function normalizeNumber(num: string | null | undefined): string {
  const digits = (num ?? '').replace(/\D/g, '').replace(/^0+/, '')
  return digits || (num ?? '').trim()
}

export function normalizeMst(mst: string | null | undefined): string {
  return (mst ?? '').replace(/[^0-9-]/g, '')
}

/** Khóa nhận diện; null nếu hóa đơn thiếu số/ký hiệu (không đủ căn cứ để coi là trùng). */
export function invoiceKey(inv: Pick<DedupeInvoice, 'seller_mst' | 'invoice_series' | 'invoice_number' | 'invoice_date'>): string | null {
  const series = normalizeSeries(inv.invoice_series)
  const num = normalizeNumber(inv.invoice_number)
  if (!series || !num) return null
  const mst = normalizeMst(inv.seller_mst)
  // Không có MST người bán: thêm ngày lập để tránh gộp nhầm 2 người bán cùng ký hiệu + số.
  return mst ? `${mst}|${series}|${num}` : `?|${series}|${num}|${inv.invoice_date ?? ''}`
}

const STATUS_RANK: Record<string, number> = { posted: 0, matched: 1, pending: 2 }
const FORMAT_RANK: Record<string, number> = { xml: 0, html: 1, pdf: 2 }

/** Bản nên giữ: đã hạch toán trước, rồi bản XML (số liệu chính xác nhất), rồi bản tải lên sớm nhất. */
function keeperOrder(a: DedupeInvoice, b: DedupeInvoice): number {
  return (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9)
    || (FORMAT_RANK[a.source_format ?? ''] ?? 9) - (FORMAT_RANK[b.source_format ?? ''] ?? 9)
    || a.created_at.localeCompare(b.created_at)
}

export interface DuplicateGroup<T extends DedupeInvoice> {
  key: string
  keep: T
  extras: T[]
}

export function findDuplicateGroups<T extends DedupeInvoice>(invoices: T[]): DuplicateGroup<T>[] {
  const byKey = new Map<string, T[]>()
  for (const inv of invoices) {
    const k = invoiceKey(inv)
    if (!k) continue
    const list = byKey.get(k)
    if (list) list.push(inv)
    else byKey.set(k, [inv])
  }
  const groups: DuplicateGroup<T>[] = []
  for (const [key, list] of byKey) {
    if (list.length < 2) continue
    const sorted = [...list].sort(keeperOrder)
    groups.push({ key, keep: sorted[0], extras: sorted.slice(1) })
  }
  return groups
}
