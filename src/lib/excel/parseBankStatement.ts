import * as XLSX from 'xlsx'
import { detectBankColumns } from '../gemini'

export interface ParsedBankRow {
  date: string
  description: string
  amount: number
  balance: number | null
}

import type { ColumnMapping } from '../gemini'
export type { ColumnMapping }

function parseAmount(raw: unknown): number {
  if (!raw && raw !== 0) return 0
  if (typeof raw === 'number') return Math.round(raw)
  const s = String(raw).replace(/[^\d.\-]/g, '')
  return Math.round(parseFloat(s || '0')) || 0
}

function parseDate(raw: unknown): string {
  if (!raw) return ''
  if (typeof raw === 'number') {
    const d = XLSX.SSF.parse_date_code(raw)
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  const s = String(raw).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const match = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/)
  if (match) return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`
  return s
}

function applyMapping(rows: unknown[][], mapping: ColumnMapping): ParsedBankRow[] {
  const { dateCol, descCol, creditCol, debitCol, amountCol, balanceCol, headerRowIdx } = mapping
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

// Rule-based fallback: detect columns from Vietnamese/English header keywords
function detectByRules(rows: unknown[][]): ColumnMapping | null {
  const DATE_KEYS = ['ngày', 'date', 'ngay', 'ngày gd', 'ngày giao dịch', 'transaction date', 'posting date', 'value date']
  const DESC_KEYS = ['diễn giải', 'nội dung', 'mô tả', 'ghi chú', 'description', 'detail', 'noi dung', 'mo ta', 'dien giai', 'tran description']
  const CREDIT_KEYS = ['ghi có', 'tiền vào', 'credit', 'credits', 'ps co', 'phát sinh có', 'phat sinh co', 'ghi co']
  const DEBIT_KEYS = ['ghi nợ', 'tiền ra', 'debit', 'debits', 'ps no', 'phát sinh nợ', 'phat sinh no', 'ghi no']
  const AMOUNT_KEYS = ['số tiền', 'tiền', 'amount', 'so tien', 'tien', 'transaction amount']
  const BALANCE_KEYS = ['số dư', 'dư cuối', 'balance', 'so du', 'du cuoi', 'ending balance', 'closing balance']

  function match(cell: unknown, keys: string[]): boolean {
    const v = String(cell ?? '').toLowerCase().trim()
    return keys.some(k => v.includes(k))
  }

  for (let r = 0; r < Math.min(rows.length, 20); r++) {
    const row = rows[r] as unknown[]
    if (!row || row.length < 3) continue

    let dateCol = -1, descCol = -1, creditCol = -1, debitCol = -1, amountCol = -1, balanceCol = -1

    for (let c = 0; c < row.length; c++) {
      if (dateCol < 0 && match(row[c], DATE_KEYS)) dateCol = c
      else if (descCol < 0 && match(row[c], DESC_KEYS)) descCol = c
      else if (creditCol < 0 && match(row[c], CREDIT_KEYS)) creditCol = c
      else if (debitCol < 0 && match(row[c], DEBIT_KEYS)) debitCol = c
      else if (amountCol < 0 && match(row[c], AMOUNT_KEYS)) amountCol = c
      else if (balanceCol < 0 && match(row[c], BALANCE_KEYS)) balanceCol = c
    }

    // Need at least date + description + some amount column
    if (dateCol >= 0 && descCol >= 0 && (creditCol >= 0 || debitCol >= 0 || amountCol >= 0)) {
      return { headerRowIdx: r, dateCol, descCol, creditCol, debitCol, amountCol, balanceCol }
    }
  }
  return null
}

export async function parseBankStatementWithGemini(buffer: ArrayBuffer): Promise<ParsedBankRow[]> {
  const wb = XLSX.read(buffer, { type: 'array', codepage: 1258 })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 }) as unknown[][]

  if (rows.length < 2) return []

  // Try rule-based first (fast, no API needed)
  const ruleMapping = detectByRules(rows)
  if (ruleMapping) {
    console.log('Bank statement: dùng rule-based detection', ruleMapping)
    return applyMapping(rows, ruleMapping)
  }

  // Fall back to Gemini if rules couldn't detect
  console.log('Bank statement: rule-based thất bại, thử Gemini...')
  const sheetPreview = rows.slice(0, 30).map((row, i) =>
    `Row ${i}: ${(row as unknown[]).map((c, j) => `[${j}]${String(c ?? '').slice(0, 40)}`).join(' | ')}`
  ).join('\n')

  const mapping: ColumnMapping = await detectBankColumns(sheetPreview)
  return applyMapping(rows, mapping)
}
