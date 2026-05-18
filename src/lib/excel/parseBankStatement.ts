import * as XLSX from 'xlsx'

export interface ParsedBankRow {
  date: string
  description: string
  amount: number
  balance: number | null
}

const DATE_ALIASES = ['ngày', 'ngay', 'date', 'transaction date', 'posting date', 'value date']
const DESC_ALIASES = ['mô tả', 'mo ta', 'description', 'nội dung', 'noi dung', 'diễn giải', 'dien giai', 'transaction detail']
const CREDIT_ALIASES = ['tiền gửi', 'tien gui', 'credit', 'ghi có', 'ghi co', 'phát sinh có', 'phat sinh co', 'số tiền gửi']
const DEBIT_ALIASES = ['tiền rút', 'tien rut', 'debit', 'ghi nợ', 'ghi no', 'phát sinh nợ', 'phat sinh no', 'số tiền rút']
const AMOUNT_ALIASES = ['số tiền', 'so tien', 'amount', 'giá trị', 'gia tri']
const BALANCE_ALIASES = ['số dư', 'so du', 'balance', 'running balance', 'closing balance']

function normalize(h: string): string {
  return h.toLowerCase().trim().replace(/\s+/g, ' ')
}

function findCol(headers: string[], aliases: string[]): number {
  for (const alias of aliases) {
    const idx = headers.findIndex(h => normalize(h).includes(alias))
    if (idx >= 0) return idx
  }
  return -1
}

function parseAmount(raw: unknown): number {
  if (!raw && raw !== 0) return 0
  if (typeof raw === 'number') return Math.round(raw)
  const s = String(raw).replace(/[^\d,\.\-]/g, '').replace(',', '.')
  return Math.round(parseFloat(s || '0')) || 0
}

function parseDate(raw: unknown): string {
  if (!raw) return ''
  if (typeof raw === 'number') {
    const d = XLSX.SSF.parse_date_code(raw)
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  const s = String(raw).trim()
  const match = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/)
  if (match) return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  return s
}

// Keywords that reliably appear in transaction header rows
const HEADER_KEYWORDS = ['debit', 'credit', 'nợ', 'no', 'có', 'co', 'ghi nợ', 'ghi có', 'phát sinh', 'phat sinh']

export function parseBankStatement(buffer: ArrayBuffer): ParsedBankRow[] {
  const wb = XLSX.read(buffer, { type: 'array', codepage: 1258 })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 }) as unknown[][]

  if (rows.length < 2) return []

  // Find header row: scan up to 40 rows, look for a row containing debit/credit keywords
  let headerRowIdx = 0
  for (let i = 0; i < Math.min(40, rows.length); i++) {
    const row = (rows[i] as unknown[]).map(c => normalize(String(c ?? '')))
    const hasDebitOrCredit = HEADER_KEYWORDS.some(kw => row.some(cell => cell.includes(kw)))
    const hasDate = DATE_ALIASES.some(kw => row.some(cell => cell.includes(kw)))
    if (hasDebitOrCredit && hasDate) { headerRowIdx = i; break }
  }

  const headers = (rows[headerRowIdx] as unknown[]).map(h => String(h ?? ''))
  const dateCol = findCol(headers, DATE_ALIASES)
  const descCol = findCol(headers, DESC_ALIASES)
  const creditCol = findCol(headers, CREDIT_ALIASES)
  const debitCol = findCol(headers, DEBIT_ALIASES)
  const amountCol = findCol(headers, AMOUNT_ALIASES)
  const balanceCol = findCol(headers, BALANCE_ALIASES)

  const results: ParsedBankRow[] = []

  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i] as unknown[]
    if (!row || row.every(cell => !cell)) continue

    const date = parseDate(row[dateCol])
    const description = String(row[descCol] ?? '').trim()
    if (!date && !description) continue

    let amount = 0
    if (creditCol >= 0 && row[creditCol]) {
      amount = parseAmount(row[creditCol])
    } else if (debitCol >= 0 && row[debitCol]) {
      amount = -parseAmount(row[debitCol])
    } else if (amountCol >= 0) {
      amount = parseAmount(row[amountCol])
    }

    const balance = balanceCol >= 0 && row[balanceCol] ? parseAmount(row[balanceCol]) : null

    results.push({ date, description, amount, balance })
  }

  return results
}
