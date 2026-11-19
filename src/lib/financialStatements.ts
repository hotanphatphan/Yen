// Báo cáo tài chính theo Thông tư 133/2016/TT-BTC (doanh nghiệp nhỏ và vừa), tính từ sổ bút toán kép.
//   B02-DNN — Báo cáo kết quả hoạt động kinh doanh
//   B03-DNN — Báo cáo lưu chuyển tiền tệ (phương pháp trực tiếp)
// Dùng chung cho màn hình, Excel và PDF để 3 nơi luôn ra cùng một số.
// Đầu vào: bút toán đã tách vế thuế GTGT (expandVatLines).

import type { JournalEntry } from '@/types'

export interface ReportLine {
  code: string
  label: string
  value?: number      // undefined = dòng tiêu đề
  bold?: boolean
  indent?: boolean
}

type Entry = Pick<JournalEntry, 'date' | 'debit_account' | 'credit_account' | 'amount' | 'description'>

const startsWith = (code: string | null | undefined, ...prefixes: string[]) =>
  !!code && prefixes.some(p => code.startsWith(p))
const inPeriod = (d: string, from: string, to: string) => d >= from && d <= to
/** Bút toán kết chuyển cuối kỳ (qua 911) không phải doanh thu/chi phí phát sinh */
const isClosing = (e: Entry) => startsWith(e.debit_account, '911') || startsWith(e.credit_account, '911')

// ─────────────────────────────── B02 ───────────────────────────────

/** legacy: doanh thu/chi phí ghi ở bảng `transactions` cũ (1 vế, không có TK đối ứng) — cộng thêm để không mất số liệu cũ */
export function computeB02(entries: Entry[], from: string, to: string, legacy: { revenue: number; expense: number } = { revenue: 0, expense: 0 }): ReportLine[] {
  const ps = entries.filter(e => inPeriod(e.date, from, to) && !isClosing(e))
  /** Phát sinh Có − Nợ của nhóm TK (dùng cho doanh thu, thu nhập) */
  const credit = (match: (c: string) => boolean) =>
    ps.reduce((s, e) => s + (match(e.credit_account) ? e.amount : 0) - (match(e.debit_account) ? e.amount : 0), 0)
  /** Phát sinh Nợ − Có của nhóm TK (dùng cho chi phí) */
  const debit = (match: (c: string) => boolean) => -credit(match)

  const v01 = credit(c => startsWith(c, '5') && !startsWith(c, '515', '521')) + legacy.revenue
  const v02 = debit(c => startsWith(c, '521'))
  const v10 = v01 - v02
  const v11 = debit(c => startsWith(c, '632', '621', '622', '627', '631'))
  const v20 = v10 - v11
  const v21 = credit(c => startsWith(c, '515'))
  const v22 = debit(c => startsWith(c, '635'))
  const v24 = debit(c => startsWith(c, '6') && !startsWith(c, '632', '621', '622', '627', '631', '635')) + legacy.expense
  const v30 = v20 + v21 - v22 - v24
  const v31 = credit(c => startsWith(c, '7'))
  const v32 = debit(c => startsWith(c, '8') && !startsWith(c, '821'))
  const v40 = v31 - v32
  const v50 = v30 + v40
  const v51 = debit(c => startsWith(c, '821'))
  const v60 = v50 - v51

  return [
    { code: '01', label: '1. Doanh thu bán hàng và cung cấp dịch vụ', value: v01 },
    { code: '02', label: '2. Các khoản giảm trừ doanh thu', value: v02 },
    { code: '10', label: '3. Doanh thu thuần về bán hàng và cung cấp dịch vụ (10 = 01 − 02)', value: v10, bold: true },
    { code: '11', label: '4. Giá vốn hàng bán', value: v11 },
    { code: '20', label: '5. Lợi nhuận gộp về bán hàng và cung cấp dịch vụ (20 = 10 − 11)', value: v20, bold: true },
    { code: '21', label: '6. Doanh thu hoạt động tài chính', value: v21 },
    { code: '22', label: '7. Chi phí tài chính', value: v22 },
    { code: '24', label: '8. Chi phí quản lý kinh doanh', value: v24 },
    { code: '30', label: '9. Lợi nhuận thuần từ hoạt động kinh doanh (30 = 20 + 21 − 22 − 24)', value: v30, bold: true },
    { code: '31', label: '10. Thu nhập khác', value: v31 },
    { code: '32', label: '11. Chi phí khác', value: v32 },
    { code: '40', label: '12. Lợi nhuận khác (40 = 31 − 32)', value: v40, bold: true },
    { code: '50', label: '13. Tổng lợi nhuận kế toán trước thuế (50 = 30 + 40)', value: v50, bold: true },
    { code: '51', label: '14. Chi phí thuế TNDN', value: v51 },
    { code: '60', label: '15. Lợi nhuận sau thuế TNDN (60 = 50 − 51)', value: v60, bold: true },
  ]
}

// ─────────────────────────────── B03 ───────────────────────────────

const CASH = ['111', '112', '113']
const isCash = (c: string | null | undefined) => startsWith(c, ...CASH)

export interface CashFlowDetail { date: string; description: string; contra: string; amount: number }

/**
 * Dòng B03 của 1 khoản tiền vào (+) / ra (−) theo TK đối ứng.
 * nameOf dùng để nhận TK phải thu/phải trả chủ sở hữu về lợi nhuận (VD 1388 "tạm ứng lợi nhuận chủ sở hữu").
 */
export function cashFlowCode(contra: string, amount: number, nameOf: (code: string) => string = () => ''): string {
  const inflow = amount > 0
  if (startsWith(contra, '421') || (startsWith(contra, '138', '338') && /lợi nhuận/i.test(nameOf(contra)))) return '35'
  if (startsWith(contra, '411')) return inflow ? '31' : '32'
  if (startsWith(contra, '311', '341')) return inflow ? '33' : '34'
  if (startsWith(contra, '211', '213', '217', '241')) return inflow ? '22' : '21'
  if (startsWith(contra, '121', '128', '221', '222', '228')) return inflow ? '24' : '23'
  if (startsWith(contra, '515')) return '25'
  if (startsWith(contra, '3334', '821')) return '05'
  if (startsWith(contra, '333')) return inflow ? '01' : '07'   // thuế GTGT thu cùng tiền bán hàng / nộp thuế khác
  if (startsWith(contra, '131', '5')) return '01'
  if (startsWith(contra, '334')) return '03'
  if (startsWith(contra, '635')) return '04'
  if (startsWith(contra, '331', '133', '15', '242', '6', '8')) return '02'
  return inflow ? '06' : '07'
}

export interface CashFlowResult {
  lines: ReportLine[]
  details: Record<string, CashFlowDetail[]>
  opening: number
  closing: number
  /** Chênh lệch 70 tính theo công thức với số dư tiền thực tế cuối kỳ (phải = 0) */
  diff: number
}

export function computeB03(entries: Entry[], from: string, to: string, nameOf: (code: string) => string = () => ''): CashFlowResult {
  const cashMove = (e: Entry) => (isCash(e.debit_account) ? e.amount : 0) - (isCash(e.credit_account) ? e.amount : 0)
  const opening = entries.filter(e => e.date < from).reduce((s, e) => s + cashMove(e), 0)
  const closing = entries.filter(e => e.date <= to).reduce((s, e) => s + cashMove(e), 0)

  const details: Record<string, CashFlowDetail[]> = {}
  for (const e of entries) {
    if (!inPeriod(e.date, from, to)) continue
    const dIn = isCash(e.debit_account), cIn = isCash(e.credit_account)
    if (dIn === cIn) continue // không qua tiền, hoặc chuyển nội bộ giữa 2 TK tiền
    const amount = dIn ? e.amount : -e.amount
    const contra = (dIn ? e.credit_account : e.debit_account) ?? ''
    const code = cashFlowCode(contra, amount, nameOf)
    ;(details[code] ??= []).push({ date: e.date, description: e.description ?? '', contra, amount })
  }
  const v = (code: string) => (details[code] ?? []).reduce((s, d) => s + d.amount, 0)
  const sum = (...codes: string[]) => codes.reduce((s, c) => s + v(c), 0)
  const v20 = sum('01', '02', '03', '04', '05', '06', '07')
  const v30 = sum('21', '22', '23', '24', '25')
  const v40 = sum('31', '32', '33', '34', '35')
  const v50 = v20 + v30 + v40
  const v61 = 0 // chưa theo dõi đánh giá lại ngoại tệ trên TK tiền
  const v70 = v50 + opening + v61

  const lines: ReportLine[] = [
    { code: 'I', label: 'I. Lưu chuyển tiền từ hoạt động kinh doanh', bold: true },
    { code: '01', label: '1. Tiền thu từ bán hàng, cung cấp dịch vụ và doanh thu khác', value: v('01'), indent: true },
    { code: '02', label: '2. Tiền chi trả cho người cung cấp hàng hóa, dịch vụ', value: v('02'), indent: true },
    { code: '03', label: '3. Tiền chi trả cho người lao động', value: v('03'), indent: true },
    { code: '04', label: '4. Tiền lãi vay đã trả', value: v('04'), indent: true },
    { code: '05', label: '5. Thuế thu nhập doanh nghiệp đã nộp', value: v('05'), indent: true },
    { code: '06', label: '6. Tiền thu khác từ hoạt động kinh doanh', value: v('06'), indent: true },
    { code: '07', label: '7. Tiền chi khác cho hoạt động kinh doanh', value: v('07'), indent: true },
    { code: '20', label: 'Lưu chuyển tiền thuần từ hoạt động kinh doanh', value: v20, bold: true },
    { code: 'II', label: 'II. Lưu chuyển tiền từ hoạt động đầu tư', bold: true },
    { code: '21', label: '1. Tiền chi để mua sắm, xây dựng TSCĐ, BĐSĐT và các tài sản dài hạn khác', value: v('21'), indent: true },
    { code: '22', label: '2. Tiền thu từ thanh lý, nhượng bán TSCĐ, BĐSĐT và các tài sản dài hạn khác', value: v('22'), indent: true },
    { code: '23', label: '3. Tiền chi cho vay, đầu tư góp vốn vào đơn vị khác', value: v('23'), indent: true },
    { code: '24', label: '4. Tiền thu hồi cho vay, đầu tư góp vốn vào đơn vị khác', value: v('24'), indent: true },
    { code: '25', label: '5. Tiền thu lãi cho vay, cổ tức và lợi nhuận được chia', value: v('25'), indent: true },
    { code: '30', label: 'Lưu chuyển tiền thuần từ hoạt động đầu tư', value: v30, bold: true },
    { code: 'III', label: 'III. Lưu chuyển tiền từ hoạt động tài chính', bold: true },
    { code: '31', label: '1. Tiền thu từ phát hành cổ phiếu, nhận vốn góp của chủ sở hữu', value: v('31'), indent: true },
    { code: '32', label: '2. Tiền trả lại vốn góp cho các chủ sở hữu, mua lại cổ phiếu của doanh nghiệp đã phát hành', value: v('32'), indent: true },
    { code: '33', label: '3. Tiền thu từ đi vay', value: v('33'), indent: true },
    { code: '34', label: '4. Tiền trả nợ gốc vay và nợ thuê tài chính', value: v('34'), indent: true },
    { code: '35', label: '5. Cổ tức, lợi nhuận đã trả cho chủ sở hữu', value: v('35'), indent: true },
    { code: '40', label: 'Lưu chuyển tiền thuần từ hoạt động tài chính', value: v40, bold: true },
    { code: '50', label: 'Lưu chuyển tiền thuần trong kỳ (50 = 20 + 30 + 40)', value: v50, bold: true },
    { code: '60', label: 'Tiền và tương đương tiền đầu kỳ', value: opening, bold: true },
    { code: '61', label: 'Ảnh hưởng của thay đổi tỷ giá hối đoái quy đổi ngoại tệ', value: v61 },
    { code: '70', label: 'Tiền và tương đương tiền cuối kỳ (70 = 50 + 60 + 61)', value: v70, bold: true },
  ]
  return { lines, details, opening, closing, diff: v70 - closing }
}
