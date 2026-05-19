import * as XLSX from 'xlsx'

export interface ParsedBankRow {
  date: string
  description: string
  amount: number
  balance: number | null
}

interface ColumnMapping {
  headerRowIdx: number
  dateCol: number
  descCol: number
  debitCol: number   // debit = tiền ra (có thể đã âm sẵn, hoặc dương tùy ngân hàng)
  creditCol: number  // credit = tiền vào (luôn dương)
  amountCol: number  // một cột tổng hợp (nếu không tách nợ/có)
  balanceCol: number
  debitIsNegative: boolean // true nếu ngân hàng lưu debit là số âm sẵn
}

function parseAmount(raw: unknown): number {
  if (raw === null || raw === undefined || raw === '') return 0
  if (typeof raw === 'number') return Math.round(raw)
  const s = String(raw).replace(/,/g, '').replace(/[^\d.\-]/g, '')
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
  const m = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return s
}

function normalize(v: unknown): string {
  return String(v ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')  // bỏ dấu tiếng Việt
    .replace(/\n/g, ' ')
    .trim()
}

// Từ khóa cho từng loại cột — hỗ trợ TCB, VCB, BIDV, MB, ACB, VPBank, Agribank
const DATE_KW   = ['ngay giao dich', 'transaction date', 'posting date', 'value date', 'ngay hieu luc', 'ngay kh', 'ngay gd', 'ngay thang', 'ngay', 'date']
const DESC_KW   = ['dien giai', 'noi dung giao dich', 'noi dung', 'mo ta', 'ghi chu', 'description', 'transaction description', 'transaction detail', 'detail', 'remark', 'nhan vien']
const CREDIT_KW = ['so tien ghi co', 'tien ghi co', 'phat sinh co', 'ghi co', 'tien vao', 'co/credit', 'ps co', 'credit', 'credits']
const DEBIT_KW  = ['so tien ghi no', 'tien ghi no', 'phat sinh no', 'ghi no', 'tien ra', 'no/debit', 'ps no', 'debit', 'debits']
const AMOUNT_KW = ['so tien giao dich', 'so tien', 'amount', 'transaction amount']
const BAL_KW    = ['so du cuoi ky', 'so du cuoi', 'so du', 'du cuoi', 'running balance', 'closing balance', 'ending balance', 'balance']

function colMatch(cell: unknown, keywords: string[]): boolean {
  const v = normalize(cell)
  if (!v) return false
  return keywords.some(k => {
    // Từ ngắn (≤4 ký tự, ví dụ "no", "co", "date") → match exact hoặc bắt đầu bằng từ đó
    if (k.length <= 4) return v === k || v.startsWith(k + '/') || v.startsWith(k + ' ')
    return v.includes(k)
  })
}

function detectMapping(rows: unknown[][]): ColumnMapping | null {
  for (let r = 0; r < Math.min(rows.length, 30); r++) {
    const row = rows[r] as unknown[]
    if (!row || row.filter(Boolean).length < 3) continue

    let dateCol = -1, descCol = -1, creditCol = -1, debitCol = -1, amountCol = -1, balanceCol = -1

    for (let c = 0; c < row.length; c++) {
      const cell = row[c]
      if (!cell) continue
      if (dateCol < 0   && colMatch(cell, DATE_KW))   { dateCol = c;   continue }
      if (descCol < 0   && colMatch(cell, DESC_KW))   { descCol = c;   continue }
      if (creditCol < 0 && colMatch(cell, CREDIT_KW)) { creditCol = c; continue }
      if (debitCol < 0  && colMatch(cell, DEBIT_KW))  { debitCol = c;  continue }
      if (amountCol < 0 && colMatch(cell, AMOUNT_KW)) { amountCol = c; continue }
      if (balanceCol < 0 && colMatch(cell, BAL_KW))   { balanceCol = c; continue }
    }

    // Cần tối thiểu: cột ngày + mô tả + ít nhất 1 cột tiền
    if (dateCol >= 0 && descCol >= 0 && (creditCol >= 0 || debitCol >= 0 || amountCol >= 0)) {
      // Kiểm tra debit có phải đã là số âm chưa (dựa vào vài dòng data đầu tiên)
      let debitIsNegative = false
      if (debitCol >= 0) {
        for (let dr = r + 1; dr < Math.min(rows.length, r + 10); dr++) {
          const val = parseAmount((rows[dr] as unknown[])[debitCol])
          if (val !== 0) { debitIsNegative = val < 0; break }
        }
      }
      return { headerRowIdx: r, dateCol, descCol, creditCol, debitCol, amountCol, balanceCol, debitIsNegative }
    }
  }
  return null
}

function applyMapping(rows: unknown[][], m: ColumnMapping): ParsedBankRow[] {
  const results: ParsedBankRow[] = []

  for (let i = m.headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i] as unknown[]
    if (!row || row.every(cell => cell === null || cell === undefined || cell === '')) continue

    const date = parseDate(row[m.dateCol])
    const description = String(row[m.descCol] ?? '').replace(/\n/g, ' ').trim()
    if (!date && !description) continue

    let amount = 0

    if (m.creditCol >= 0 && row[m.creditCol]) {
      const credit = parseAmount(row[m.creditCol])
      if (credit > 0) { amount = credit }
    }
    if (amount === 0 && m.debitCol >= 0 && row[m.debitCol]) {
      const debit = parseAmount(row[m.debitCol])
      if (debit !== 0) {
        // Nếu ngân hàng lưu debit là âm sẵn (như TCB) → giữ nguyên
        // Nếu ngân hàng lưu debit là dương (phần lớn VCB, BIDV) → đổi âm
        amount = m.debitIsNegative ? debit : -Math.abs(debit)
      }
    }
    if (amount === 0 && m.amountCol >= 0 && row[m.amountCol]) {
      amount = parseAmount(row[m.amountCol])
    }

    const balance = m.balanceCol >= 0 && row[m.balanceCol] != null
      ? parseAmount(row[m.balanceCol])
      : null

    results.push({ date, description, amount, balance })
  }

  return results
}

export async function parseBankStatementWithGemini(buffer: ArrayBuffer): Promise<ParsedBankRow[]> {
  const wb = XLSX.read(buffer, { type: 'array', codepage: 1258 })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 }) as unknown[][]

  if (rows.length < 2) throw new Error('File trống hoặc không đúng định dạng')

  const mapping = detectMapping(rows)

  if (!mapping) {
    throw new Error(
      'Không nhận dạng được cột trong file sao kê này.\n' +
      'Hỗ trợ: TCB, VCB, BIDV, MB, ACB, VPBank, Agribank.\n' +
      'File cần có các cột: Ngày, Mô tả/Diễn giải, Số tiền.'
    )
  }

  const results = applyMapping(rows, mapping)

  if (results.length === 0) {
    throw new Error('Đọc được cấu trúc file nhưng không tìm thấy giao dịch nào.')
  }

  return results
}
