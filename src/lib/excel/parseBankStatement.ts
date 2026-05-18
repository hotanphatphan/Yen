import * as XLSX from 'xlsx'

export interface ParsedBankRow {
  date: string
  description: string
  amount: number
  balance: number | null
}

export interface ColumnMapping {
  dateCol: number
  descCol: number
  creditCol: number
  debitCol: number
  amountCol: number
  balanceCol: number
  headerRowIdx: number
}

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

// Gemini-powered: detect column mapping from raw sheet data
export async function parseBankStatementWithGemini(buffer: ArrayBuffer): Promise<ParsedBankRow[]> {
  const GEMINI_API_KEY = (import.meta as { env: Record<string, string> }).env.VITE_GEMINI_API_KEY
  const wb = XLSX.read(buffer, { type: 'array', codepage: 1258 })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 }) as unknown[][]

  if (rows.length < 2) return []

  // Send first 30 rows to Gemini to identify column structure
  const preview = rows.slice(0, 30).map((row, i) =>
    `Row ${i}: ${(row as unknown[]).map((c, j) => `[${j}]${String(c ?? '').slice(0, 40)}`).join(' | ')}`
  ).join('\n')

  const prompt = `Đây là dữ liệu từ file sao kê ngân hàng Việt Nam (30 dòng đầu):

${preview}

Hãy xác định:
1. headerRowIdx: chỉ số dòng (0-based) chứa tiêu đề cột của bảng giao dịch (không phải dòng thông tin ngân hàng ở đầu file)
2. dateCol: chỉ số cột chứa ngày giao dịch
3. descCol: chỉ số cột chứa mô tả/diễn giải giao dịch
4. creditCol: chỉ số cột "ghi có" / tiền vào (số dương), -1 nếu không có
5. debitCol: chỉ số cột "ghi nợ" / tiền ra (số dương, sẽ được chuyển thành âm), -1 nếu không có
6. amountCol: chỉ số cột số tiền tổng hợp (nếu không tách Nợ/Có riêng), -1 nếu không có
7. balanceCol: chỉ số cột số dư, -1 nếu không có

Trả về JSON duy nhất, không thêm text khác:
{"headerRowIdx": 0, "dateCol": 0, "descCol": 1, "creditCol": 2, "debitCol": 3, "amountCol": -1, "balanceCol": 4}`

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json' },
      }),
    }
  )

  if (!response.ok) throw new Error(`Gemini API error: ${response.status}`)

  const data = await response.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}'
  const mapping: ColumnMapping = JSON.parse(text)

  return applyMapping(rows, mapping)
}
