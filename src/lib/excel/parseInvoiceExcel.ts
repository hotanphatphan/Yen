import * as XLSX from 'xlsx'
import type { Category, DraftTransaction, TransactionType } from '@/types'

const COLUMN_ALIASES: Record<string, string> = {
  'ngày hóa đơn': 'date',
  'ngay hoa don': 'date',
  'số hóa đơn': 'invoice_number',
  'so hoa don': 'invoice_number',
  'người bán/mua': 'counterparty',
  'nguoi ban/mua': 'counterparty',
  'người bán': 'counterparty',
  'người mua': 'counterparty',
  'mô tả hàng hóa/dịch vụ': 'description',
  'mo ta hang hoa/dich vu': 'description',
  'mô tả': 'description',
  'số tiền (chưa vat)': 'amount',
  'so tien (chua vat)': 'amount',
  'số tiền chưa vat': 'amount',
  'tiền vat': 'vat_amount',
  'tien vat': 'vat_amount',
  'vat': 'vat_amount',
  'tổng tiền': 'total',
  'tong tien': 'total',
  'loại (thu/chi)': 'type',
  'loai (thu/chi)': 'type',
  'loại': 'type',
  'danh mục': 'category_name',
  'danh muc': 'category_name',
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().trim()
}

function parseDate(raw: unknown): string {
  if (!raw) return ''
  if (typeof raw === 'number') {
    // Excel serial date
    const date = XLSX.SSF.parse_date_code(raw)
    return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`
  }
  const s = String(raw).trim()
  // DD/MM/YYYY
  const match = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (match) return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`
  // YYYY-MM-DD already
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  return s
}

function parseAmount(raw: unknown): number {
  if (typeof raw === 'number') return Math.round(raw)
  const s = String(raw ?? '').replace(/[^\d]/g, '')
  return parseInt(s || '0', 10)
}

export function parseInvoiceExcel(
  buffer: ArrayBuffer,
  categories: Pick<Category, 'id' | 'name' | 'type'>[]
): DraftTransaction[] {
  const wb = XLSX.read(buffer, { type: 'array' })
  const sheetName = wb.SheetNames.find(n => n !== '_categories' && n !== 'Hướng dẫn') ?? wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][]

  if (rows.length < 2) return []

  // Detect header row
  const headerRow = rows[0] as string[]
  const colMap: Record<string, number> = {}
  headerRow.forEach((h, i) => {
    const normalized = normalizeHeader(String(h ?? ''))
    const mapped = COLUMN_ALIASES[normalized]
    if (mapped) colMap[mapped] = i
  })

  const categoryMap = new Map(categories.map(c => [c.name.toLowerCase().trim(), c]))

  const drafts: DraftTransaction[] = []
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as unknown[]
    if (!row || row.every(cell => !cell)) continue

    const get = (key: string) => colMap[key] !== undefined ? row[colMap[key]] : undefined

    const rawDate = get('date')
    const rawAmount = get('amount')
    const rawVat = get('vat_amount')
    const rawType = String(get('type') ?? '').trim()
    const rawCategory = String(get('category_name') ?? '').trim()

    const amount = parseAmount(rawAmount)
    const vatAmount = parseAmount(rawVat)
    const total = amount + vatAmount

    const type: TransactionType = rawType === 'Chi' ? 'expense' : 'income'

    const matchedCategory = categoryMap.get(rawCategory.toLowerCase())
    const needsReview = !matchedCategory || !rawDate || amount === 0

    drafts.push({
      row_index: i,
      date: parseDate(rawDate),
      invoice_number: String(get('invoice_number') ?? '').trim(),
      counterparty: String(get('counterparty') ?? '').trim(),
      description: String(get('description') ?? '').trim(),
      amount,
      vat_amount: vatAmount,
      total,
      type,
      category_name: rawCategory,
      matched_category_id: matchedCategory?.id ?? null,
      needs_review: needsReview,
      rejected: false,
    })
  }

  return drafts
}
