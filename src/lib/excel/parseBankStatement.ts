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
  // yyyy-mm-dd or yyyy-mm-dd hh:mm:ss
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  // dd/mm/yyyy or dd-mm-yyyy
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

// Gemini-powered: detect column mapping directly via Gemini API
export async function parseBankStatementWithGemini(buffer: ArrayBuffer): Promise<ParsedBankRow[]> {
  const wb = XLSX.read(buffer, { type: 'array', codepage: 1258 })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 }) as unknown[][]

  if (rows.length < 2) return []

  const sheetPreview = rows.slice(0, 30).map((row, i) =>
    `Row ${i}: ${(row as unknown[]).map((c, j) => `[${j}]${String(c ?? '').slice(0, 40)}`).join(' | ')}`
  ).join('\n')

  const mapping: ColumnMapping = await detectBankColumns(sheetPreview)
  return applyMapping(rows, mapping)
}
