import { useState } from 'react'
import { FileDown, FileSpreadsheet } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/shared/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/shared/Card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/shared/Select'
import { Label } from '@/components/shared/Label'
import { supabase } from '@/lib/supabase'
import { useTransactions } from '@/hooks/useTransactions'
import { useCompany } from '@/hooks/useCompanies'
import { getCurrentQuarter } from '@/lib/utils'
import { pdf } from '@react-pdf/renderer'
import BCTCPDF from '@/lib/pdf/BCTCPDF'
import type { JournalEntry } from '@/types'
import { DEFAULT_ACCOUNTS } from '@/lib/seeds/defaultAccounts'
import { expandVatLines, localYmd } from '@/lib/accounting'
import { downloadExcel, vnDate } from '@/lib/excelExport'
import { computeB02, computeB03, type ReportLine } from '@/lib/financialStatements'

function buildPeriodOptions() {
  const { year, quarter } = getCurrentQuarter()
  const options = []
  for (let i = 0; i < 8; i++) {
    const correctedQ = ((quarter - 1 - i % 4 + 4) % 4) + 1
    const correctedY = year - Math.floor(i / 4)
    options.push({ label: `Quý ${correctedQ}/${correctedY}`, value: `${correctedY}-Q${correctedQ}` })
  }
  for (let i = 0; i < 3; i++) {
    options.push({ label: `Năm ${year - i}`, value: `${year - i}` })
  }
  return options
}

function fmtVND(n: number) {
  if (n === 0) return '—'
  return new Intl.NumberFormat('vi-VN').format(Math.abs(n))
}

export default function BCTCTab({ companyId }: { companyId: string }) {
  const { data: company } = useCompany(companyId)
  const { quarter, year } = getCurrentQuarter()
  const [period, setPeriod] = useState(`${year}-Q${quarter}`)
  const periodOptions = buildPeriodOptions()
  const [generating, setGenerating] = useState(false)
  const [activeView, setActiveView] = useState<'reports' | 'tb' | 'gl'>('reports')
  const [glAccount, setGlAccount] = useState('112')
  const [cfOpen, setCfOpen] = useState<string | null>(null)

  const isQuarter = period.includes('-Q')
  const periodLabel = period.includes('-Q') ? `Quý ${period.split('-Q')[1]}/${period.split('-Q')[0]}` : `Năm ${period}`
  const [periodYear, periodQ] = isQuarter ? period.split('-Q').map(Number) : [parseInt(period), 0]
  const dateFrom = isQuarter
    ? localYmd(new Date(periodYear, (periodQ - 1) * 3, 1))
    : `${periodYear}-01-01`
  const dateTo = isQuarter
    ? localYmd(new Date(periodYear, periodQ * 3, 0))
    : `${periodYear}-12-31`

  const { data: transactions = [] } = useTransactions(companyId, { status: 'official', dateFrom, dateTo })
  const { data: allTransactions = [] } = useTransactions(companyId, { status: 'official' })

  const { data: rawJournalEntries = [] } = useQuery({
    queryKey: ['journal-entries', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('journal_entries').select('*').eq('company_id', companyId)
      return (data ?? []) as JournalEntry[]
    },
  })
  // Tách vế thuế GTGT thành dòng riêng để TK 1331 / 33311 lên báo cáo và 131/331/112 đủ số
  const journalEntries = expandVatLines(rawJournalEntries)

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('accounts').select('id, code, name, type').eq('company_id', companyId)
      return data ?? []
    },
  })

  const accountIdMap: Record<string, string> = {}
  accounts.forEach((a: { code: string; id: string }) => { accountIdMap[a.code] = a.id })

  const periodJEs = journalEntries.filter(e => e.date >= dateFrom && e.date <= dateTo)

  // B01 — số dư TẠI NGÀY CUỐI KỲ (lũy kế từ đầu), tính từ sổ bút toán kép (journal_entries).
  // Tổng tài sản = toàn bộ TK loại 1+2; nợ phải trả = loại 3; vốn = loại 4 + lãi/lỗ lũy kế (loại 5–9 chưa kết chuyển).
  // Vì sổ kép luôn cân nên B01 luôn cân; TK không có dòng riêng (138, 141, 338…) gom vào dòng "khác" thay vì bị bỏ sót.
  const balMap = new Map<string, number>()
  for (const e of journalEntries) {
    if (e.date > dateTo) continue
    if (e.debit_account) balMap.set(e.debit_account, (balMap.get(e.debit_account) ?? 0) + e.amount)
    if (e.credit_account) balMap.set(e.credit_account, (balMap.get(e.credit_account) ?? 0) - e.amount)
  }
  const sumPrefix = (...prefixes: string[]) =>
    [...balMap].reduce((s, [code, v]) => prefixes.some(p => code.startsWith(p)) ? s + v : s, 0)

  const cash = sumPrefix('111', '112', '113')
  const receivables = sumPrefix('131')
  const vatInput = sumPrefix('133')
  const inventory = sumPrefix('151', '152', '153', '154', '155', '156')
  const ppe = sumPrefix('211')
  const accDepreciation = -sumPrefix('214') // số dư Có → dương
  const prepaid = sumPrefix('242')
  const totalAssets = sumPrefix('1', '2')
  const otherAssets = totalAssets - (cash + receivables + vatInput + inventory + ppe - accDepreciation + prepaid)

  const shortTermLoan = -sumPrefix('311')
  const payables = -sumPrefix('331')
  const taxPayable = -sumPrefix('333')
  const salaryPayable = -sumPrefix('334')
  const totalLiabilities = -sumPrefix('3')
  const otherLiabilities = totalLiabilities - (shortTermLoan + payables + taxPayable + salaryPayable)

  const capital = -sumPrefix('411')
  const cumulativeProfit = -sumPrefix('5', '6', '7', '8', '9')
  const retainedEarnings = -sumPrefix('42') + cumulativeProfit
  const totalEquity = -sumPrefix('4') + cumulativeProfit

  // Trial Balance — tất cả TK có phát sinh (gồm cả tài khoản con công ty tự mở, VD 1121, 6428, 1388)
  const nameByCode = new Map<string, string>([
    ['138', 'Phải thu khác'], ['335', 'Chi phí phải trả'], ['338', 'Phải trả, phải nộp khác'], ['3335', 'Thuế thu nhập cá nhân'],
    ...DEFAULT_ACCOUNTS.map(a => [a.code, a.name] as [string, string]),
    ...accounts.map((a: { code: string; name: string }) => [a.code, a.name] as [string, string]),
  ])
  const tbCodes = [...new Set([
    ...DEFAULT_ACCOUNTS.map(a => a.code),
    ...journalEntries.flatMap(e => [e.debit_account, e.credit_account]).filter(Boolean),
  ])].sort()
  const tbRows = tbCodes.map(code => ({ code, name: nameByCode.get(code) ?? code })).map(a => {
    const txDebit = allTransactions
      .filter(t => t.account_id === accountIdMap[a.code] && t.type === 'expense')
      .reduce((s, t) => s + t.amount, 0)
    const txCredit = allTransactions
      .filter(t => t.account_id === accountIdMap[a.code] && t.type === 'income')
      .reduce((s, t) => s + t.amount, 0)
    const jeDebit = journalEntries
      .filter(e => e.debit_account === a.code)
      .reduce((s, e) => s + e.amount, 0)
    const jeCredit = journalEntries
      .filter(e => e.credit_account === a.code)
      .reduce((s, e) => s + e.amount, 0)
    const debit = txDebit + jeDebit
    const credit = txCredit + jeCredit
    return { ...a, debit, credit, balance: debit - credit }
  }).filter(r => r.debit > 0 || r.credit > 0)

  // B02 / B03 theo TT133 — dùng chung cho màn hình, Excel, PDF
  const legacyRevenue = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const legacyExpense = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const b02Lines = computeB02(journalEntries, dateFrom, dateTo, { revenue: legacyRevenue, expense: legacyExpense })
  const b03 = computeB03(journalEntries, dateFrom, dateTo, code => nameByCode.get(code) ?? '')
  const b01Lines: ReportLine[] = [
    { code: 'A', label: 'TÀI SẢN', bold: true },
    { code: '110', label: 'I. Tiền và các khoản tương đương tiền', value: cash, indent: true },
    { code: '131', label: 'II. Phải thu của khách hàng', value: receivables, indent: true },
    { code: '133', label: 'III. Thuế GTGT được khấu trừ', value: vatInput, indent: true },
    { code: '140', label: 'IV. Hàng tồn kho', value: inventory, indent: true },
    { code: '150', label: 'V. Tài sản cố định (nguyên giá − hao mòn)', value: ppe - accDepreciation, indent: true },
    { code: '160', label: 'VI. Chi phí trả trước', value: prepaid, indent: true },
    { code: '180', label: 'VII. Tài sản khác (138, 141, 128…)', value: otherAssets, indent: true },
    { code: '200', label: 'TỔNG CỘNG TÀI SẢN', value: totalAssets, bold: true },
    { code: 'C', label: 'NỢ PHẢI TRẢ', bold: true },
    { code: '311', label: '1. Vay và nợ thuê tài chính', value: shortTermLoan, indent: true },
    { code: '331', label: '2. Phải trả người bán', value: payables, indent: true },
    { code: '333', label: '3. Thuế và các khoản phải nộp Nhà nước', value: taxPayable, indent: true },
    { code: '334', label: '4. Phải trả người lao động', value: salaryPayable, indent: true },
    { code: '338', label: '5. Nợ phải trả khác', value: otherLiabilities, indent: true },
    { code: '300', label: 'Tổng nợ phải trả', value: totalLiabilities, bold: true },
    { code: 'D', label: 'VỐN CHỦ SỞ HỮU', bold: true },
    { code: '411', label: '1. Vốn góp của chủ sở hữu', value: capital, indent: true },
    { code: '421', label: '2. Lợi nhuận sau thuế chưa phân phối', value: retainedEarnings, indent: true },
    { code: '400', label: 'Tổng vốn chủ sở hữu', value: totalEquity, bold: true },
    { code: '500', label: 'TỔNG CỘNG NGUỒN VỐN', value: totalLiabilities + totalEquity, bold: true },
  ]

  // General Ledger — sổ cái 1 TK trong kỳ: số dư đầu kỳ + phát sinh + số dư cuối kỳ.
  // Chọn TK mẹ (VD 112) thì gồm cả TK con (1121…); có cả vế thuế GTGT.
  const glOptions = [...new Set(tbRows.flatMap(r => r.code.length > 3 ? [r.code.slice(0, 3), r.code] : [r.code]))]
    .sort()
    .map(code => ({ code, name: nameByCode.get(code) ?? code }))
  const inGl = (code: string | null) => !!code && code.startsWith(glAccount)
  const glAll = journalEntries
    .filter(e => inGl(e.debit_account) !== inGl(e.credit_account)) // bút toán nội bộ trong cùng TK (VD 1121↔1122) không tính
    .map(e => ({
      date: e.date,
      description: e.description || '—',
      contra: inGl(e.debit_account) ? e.credit_account : e.debit_account,
      debit: inGl(e.debit_account) ? e.amount : 0,
      credit: inGl(e.credit_account) ? e.amount : 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
  const glOpening = glAll.filter(r => r.date < dateFrom).reduce((s, r) => s + r.debit - r.credit, 0)
  const glRowsWithBalance = glAll
    .filter(r => r.date >= dateFrom && r.date <= dateTo)
    .reduce<(typeof glAll[number] & { balance: number })[]>((acc, r) => {
      const prev = acc.length ? acc[acc.length - 1].balance : glOpening
      acc.push({ ...r, balance: prev + r.debit - r.credit })
      return acc
    }, [])
  const runningBalance = glRowsWithBalance.length ? glRowsWithBalance[glRowsWithBalance.length - 1].balance : glOpening
  const glPeriodDebit = glRowsWithBalance.reduce((s, r) => s + r.debit, 0)
  const glPeriodCredit = glRowsWithBalance.reduce((s, r) => s + r.credit, 0)

  function exportGlExcel() {
    const name = nameByCode.get(glAccount) ?? glAccount
    downloadExcel(`so-cai-${glAccount}-${period}`, [{
      name: `Sổ cái ${glAccount}`,
      title: [`SỔ CÁI TÀI KHOẢN ${glAccount} — ${name}`, `${company?.name ?? ''} · Kỳ ${period} (${vnDate(dateFrom)} – ${vnDate(dateTo)})`],
      header: ['Ngày', 'Diễn giải', 'TK đối ứng', 'Nợ', 'Có', 'Số dư Nợ', 'Số dư Có'],
      rows: [
        ['', 'Số dư đầu kỳ', '', '', '', glOpening > 0 ? glOpening : '', glOpening < 0 ? -glOpening : ''],
        ...glRowsWithBalance.map(r => [vnDate(r.date), r.description, r.contra, r.debit || '', r.credit || '', r.balance > 0 ? r.balance : '', r.balance < 0 ? -r.balance : '']),
        ['', 'Cộng phát sinh / Số dư cuối kỳ', '', glPeriodDebit, glPeriodCredit, runningBalance > 0 ? runningBalance : '', runningBalance < 0 ? -runningBalance : ''],
      ],
      widths: [11, 60, 10, 15, 15, 15, 15],
    }])
  }

  function exportExcel() {
    const head = [`${company?.name ?? ''} — MST ${company?.mst ?? ''}`, `Kỳ: ${periodLabel} (${vnDate(dateFrom)} – ${vnDate(dateTo)}) · Chế độ kế toán TT133/2016/TT-BTC · Đơn vị tính: đồng`]
    const toRows = (lines: ReportLine[]) => lines.map(l => [l.code, (l.indent ? '    ' : '') + l.label, l.value ?? ''])
    downloadExcel(`bctc-${period}-${company?.name ?? ''}`, [
      { name: 'B01-DNN', title: ['BÁO CÁO TÌNH HÌNH TÀI CHÍNH (B01-DNN)', ...head, `Số dư tại ngày ${vnDate(dateTo)}`],
        header: ['Mã', 'Chỉ tiêu', 'Số cuối kỳ'], rows: toRows(b01Lines), widths: [7, 60, 18] },
      { name: 'B02-DNN', title: ['BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH (B02-DNN)', ...head],
        header: ['Mã số', 'Chỉ tiêu', 'Kỳ này'], rows: toRows(b02Lines), widths: [7, 75, 18] },
      { name: 'B03-DNN', title: ['BÁO CÁO LƯU CHUYỂN TIỀN TỆ (B03-DNN) — Phương pháp trực tiếp', ...head],
        header: ['Mã số', 'Chỉ tiêu', 'Kỳ này'], rows: toRows(b03.lines), widths: [7, 85, 18] },
      { name: 'B03 chi tiết', title: ['CHI TIẾT CÁC KHOẢN TIỀN THEO DÒNG B03', ...head],
        header: ['Mã số', 'Ngày', 'Diễn giải', 'TK đối ứng', 'Số tiền (+ thu / − chi)'],
        rows: Object.keys(b03.details).sort().flatMap(code => b03.details[code]
          .sort((x, y) => x.date.localeCompare(y.date))
          .map(d => [code, vnDate(d.date), d.description, d.contra, d.amount])),
        widths: [7, 11, 70, 10, 18] },
      { name: 'Cân đối TK', title: ['BẢNG CÂN ĐỐI TÀI KHOẢN (lũy kế)', ...head],
        header: ['Mã TK', 'Tên TK', 'Tổng Nợ', 'Tổng Có', 'Dư Nợ', 'Dư Có'],
        rows: tbRows.map(r => [r.code, r.name, r.debit, r.credit, r.balance > 0 ? r.balance : '', r.balance < 0 ? -r.balance : '']),
        widths: [9, 45, 17, 17, 17, 17] },
    ])
  }

  async function exportPDF() {
    if (!company) return
    setGenerating(true)
    try {
      const blob = await pdf(
        <BCTCPDF company={company} periodLabel={periodLabel} asOf={vnDate(dateTo)} b01={b01Lines} b02={b02Lines} b03={b03.lines} />
      ).toBlob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `bctc-${period}-${company.name}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      await supabase.from('compliance_items')
        .update({ status: 'completed' })
        .eq('company_id', companyId)
        .eq('type', 'bctc_annual')
    } finally {
      setGenerating(false)
    }
  }

  const totalSourcesOfFunding = totalLiabilities + totalEquity
  const balanceGap = Math.abs(totalAssets - totalSourcesOfFunding)
  const isUnbalanced = balanceGap > 1000 && (totalAssets > 0 || totalSourcesOfFunding > 0)

  return (
    <div className="space-y-4">
      {/* Balance warning */}
      {isUnbalanced && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-red-50 border-2 border-red-300">
          <span className="text-red-500 text-lg font-bold shrink-0">!</span>
          <div>
            <p className="text-sm font-semibold text-red-800">Tài sản không cân với nguồn vốn</p>
            <p className="text-xs text-red-700 mt-0.5">
              Tổng tài sản: <strong>{new Intl.NumberFormat('vi-VN').format(totalAssets)} đ</strong> ·
              Tổng nguồn vốn: <strong>{new Intl.NumberFormat('vi-VN').format(totalSourcesOfFunding)} đ</strong> ·
              Chênh lệch: <strong>{new Intl.NumberFormat('vi-VN').format(balanceGap)} đ</strong>
            </p>
            <p className="text-xs text-red-600 mt-1">Kiểm tra lại bút toán hoặc hạch toán còn thiếu trong tab Cân đối thử.</p>
          </div>
        </div>
      )}

      {/* Period selector + export */}
      <div className="flex items-center gap-3 flex-wrap">
        <Label>Kỳ báo cáo:</Label>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            {periodOptions.map(o => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={exportPDF} disabled={generating || (transactions.length === 0 && journalEntries.length === 0)}>
          <FileDown className="h-4 w-4" />
          {generating ? 'Đang tạo...' : 'Xuất PDF TT133 (B01+B02+B03)'}
        </Button>
        <Button variant="outline" onClick={exportExcel} disabled={transactions.length === 0 && journalEntries.length === 0}>
          <FileSpreadsheet className="h-4 w-4" />
          Xuất Excel
        </Button>
      </div>

      {/* View switcher */}
      <div className="flex gap-1">
        {[
          { id: 'reports', label: 'Báo cáo (B01, B02, B03)' },
          { id: 'tb', label: 'Bảng số dư TK' },
          { id: 'gl', label: 'Sổ cái' },
        ].map(v => (
          <button
            key={v.id}
            onClick={() => setActiveView(v.id as typeof activeView)}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              activeView === v.id ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* REPORTS VIEW */}
      {activeView === 'reports' && (
        <div className="space-y-4">
          {/* B01-DNN */}
          <Card>
            <CardHeader><CardTitle className="text-sm">B01-DNN — Bảng cân đối kế toán</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-6 text-sm">
                <div className="space-y-2">
                  <p className="font-semibold text-gray-700 border-b pb-1">TÀI SẢN</p>
                  {[
                    { label: 'A. Tài sản ngắn hạn', bold: true },
                    { label: 'Tiền và tương đương tiền (111+112)', value: cash },
                    { label: 'Phải thu của khách hàng (131)', value: receivables },
                    { label: 'Thuế GTGT được khấu trừ (133)', value: vatInput },
                    { label: 'Hàng tồn kho', value: inventory },
                    { label: 'B. Tài sản dài hạn', bold: true },
                    { label: 'TSCĐ hữu hình (211-214)', value: ppe - accDepreciation },
                    { label: 'Chi phí trả trước (242)', value: prepaid },
                    { label: 'Tài sản khác (138, 141, 128…)', value: otherAssets },
                    { label: 'TỔNG CỘNG TÀI SẢN', value: totalAssets, bold: true, highlight: true },
                  ].map((row, i) => (
                    <div key={i} className={`flex justify-between items-center ${row.highlight ? 'border-t pt-1 font-bold' : ''}`}>
                      <span className={`text-gray-600 ${row.bold ? 'font-semibold text-gray-800' : ''}`}>{row.label}</span>
                      {row.value !== undefined && (
                        <span className={row.bold ? 'font-bold' : 'font-medium'}>{fmtVND(row.value)}</span>
                      )}
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  <p className="font-semibold text-gray-700 border-b pb-1">NGUỒN VỐN</p>
                  {[
                    { label: 'A. Nợ phải trả', bold: true },
                    { label: 'Vay ngắn hạn (311)', value: shortTermLoan },
                    { label: 'Phải trả người bán (331)', value: payables },
                    { label: 'Thuế và các khoản nộp NN (333)', value: taxPayable },
                    { label: 'Phải trả người lao động (334)', value: salaryPayable },
                    { label: 'Nợ phải trả khác (338, 341…)', value: otherLiabilities },
                    { label: 'Tổng nợ phải trả', value: totalLiabilities, bold: true },
                    { label: 'B. Vốn chủ sở hữu', bold: true },
                    { label: 'Vốn góp (411)', value: capital },
                    { label: 'Lợi nhuận chưa phân phối', value: retainedEarnings },
                    { label: 'Tổng vốn chủ sở hữu', value: totalEquity, bold: true },
                    { label: 'TỔNG CỘNG NGUỒN VỐN', value: totalLiabilities + totalEquity, bold: true, highlight: true },
                  ].map((row, i) => (
                    <div key={i} className={`flex justify-between items-center ${row.highlight ? 'border-t pt-1 font-bold' : ''}`}>
                      <span className={`text-gray-600 ${row.bold ? 'font-semibold text-gray-800' : ''}`}>{row.label}</span>
                      {row.value !== undefined && (
                        <span className={row.bold ? 'font-bold' : 'font-medium'}>{fmtVND(row.value)}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* B02-DNN */}
          <Card>
            <CardHeader><CardTitle className="text-sm">B02-DNN — Kết quả hoạt động kinh doanh · {periodLabel}</CardTitle></CardHeader>
            <CardContent className="space-y-0.5 text-sm">
              {b02Lines.map(row => (
                <div key={row.code} className={`flex justify-between items-center py-1 ${row.code === '60' ? 'border-t font-bold' : ''}`}>
                  <span className="text-gray-500 w-8 text-xs">{row.code}</span>
                  <span className={`flex-1 ${row.bold ? 'font-semibold' : 'text-gray-600'}`}>{row.label}</span>
                  <span className={`font-medium ${(row.value ?? 0) < 0 ? 'text-red-600' : 'text-gray-900'} ${row.bold ? 'font-bold' : ''}`}>
                    {(row.value ?? 0) < 0 ? `(${fmtVND(row.value ?? 0)})` : fmtVND(row.value ?? 0)}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* B03-DNN */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center justify-between gap-2">
                <span>B03-DNN — Lưu chuyển tiền tệ (phương pháp trực tiếp) · {periodLabel}</span>
                {Math.abs(b03.diff) < 1
                  ? <span className="text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded px-2 py-0.5">Khớp số dư tiền cuối kỳ</span>
                  : <span className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded px-2 py-0.5">Lệch {fmtVND(b03.diff)} so với số dư tiền</span>}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-0.5 text-sm">
              {b03.lines.map(row => {
                const det = b03.details[row.code] ?? []
                const open = cfOpen === row.code
                return (
                  <div key={row.code}>
                    <button
                      type="button"
                      disabled={det.length === 0}
                      onClick={() => setCfOpen(open ? null : row.code)}
                      className={`w-full flex justify-between items-center py-1 text-left ${['50', '70'].includes(row.code) ? 'border-t' : ''} ${det.length ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-default'}`}
                    >
                      <span className="text-gray-500 w-8 text-xs">{/^[IVX]+$/.test(row.code) ? '' : row.code}</span>
                      <span className={`flex-1 ${row.bold ? 'font-semibold' : 'text-gray-600'} ${row.indent ? 'pl-3' : ''}`}>
                        {row.label}{det.length > 0 && <span className="ml-1 text-[11px] text-indigo-500">({det.length})</span>}
                      </span>
                      {row.value !== undefined && (
                        <span className={`font-medium ${row.value < 0 ? 'text-red-600' : 'text-gray-900'} ${row.bold ? 'font-bold' : ''}`}>
                          {row.value < 0 ? `(${fmtVND(row.value)})` : fmtVND(row.value)}
                        </span>
                      )}
                    </button>
                    {open && (
                      <div className="ml-8 mb-2 rounded border border-gray-100 bg-gray-50 text-xs">
                        {det.slice().sort((x, y) => x.date.localeCompare(y.date)).map((d, i) => (
                          <div key={i} className="grid grid-cols-12 gap-2 px-2 py-1 border-b border-gray-100 last:border-0">
                            <span className="col-span-2 text-gray-400">{vnDate(d.date)}</span>
                            <span className="col-span-7 truncate" title={d.description}>{d.description}</span>
                            <span className="col-span-1 font-mono text-gray-500" title={nameByCode.get(d.contra) ?? ''}>{d.contra}</span>
                            <span className={`col-span-2 text-right ${d.amount < 0 ? 'text-red-600' : ''}`}>{d.amount < 0 ? `(${fmtVND(d.amount)})` : fmtVND(d.amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </div>
      )}

      {/* TRIAL BALANCE VIEW */}
      {activeView === 'tb' && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Bảng số dư tài khoản (Trial Balance)</CardTitle></CardHeader>
          <CardContent>
            {tbRows.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">Chưa có phát sinh nào</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-indigo-700 text-white">
                      <th className="text-left p-2">Mã TK</th>
                      <th className="text-left p-2">Tên tài khoản</th>
                      <th className="text-right p-2">PS Nợ</th>
                      <th className="text-right p-2">PS Có</th>
                      <th className="text-right p-2">Dư Nợ</th>
                      <th className="text-right p-2">Dư Có</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tbRows.map((r, i) => (
                      <tr key={r.code} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="p-2 font-mono font-medium">{r.code}</td>
                        <td className="p-2 text-gray-700">{r.name}</td>
                        <td className="p-2 text-right">{r.debit > 0 ? fmtVND(r.debit) : '—'}</td>
                        <td className="p-2 text-right">{r.credit > 0 ? fmtVND(r.credit) : '—'}</td>
                        <td className="p-2 text-right font-medium">{r.balance > 0 ? fmtVND(r.balance) : '—'}</td>
                        <td className="p-2 text-right font-medium">{r.balance < 0 ? fmtVND(Math.abs(r.balance)) : '—'}</td>
                      </tr>
                    ))}
                    <tr className="bg-indigo-50 font-bold border-t-2 border-indigo-200">
                      <td className="p-2" colSpan={2}>TỔNG CỘNG</td>
                      <td className="p-2 text-right">{fmtVND(tbRows.reduce((s, r) => s + r.debit, 0))}</td>
                      <td className="p-2 text-right">{fmtVND(tbRows.reduce((s, r) => s + r.credit, 0))}</td>
                      <td className="p-2 text-right">{fmtVND(tbRows.filter(r => r.balance > 0).reduce((s, r) => s + r.balance, 0))}</td>
                      <td className="p-2 text-right">{fmtVND(tbRows.filter(r => r.balance < 0).reduce((s, r) => s + Math.abs(r.balance), 0))}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* GENERAL LEDGER VIEW */}
      {activeView === 'gl' && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-3">
              <CardTitle className="text-sm">Sổ cái (General Ledger)</CardTitle>
              <Select value={glAccount} onValueChange={setGlAccount}>
                <SelectTrigger className="w-72 h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {glOptions.map(a => (
                    <SelectItem key={a.code} value={a.code}>
                      <span className={a.code.length > 3 ? 'pl-3' : 'font-medium'}>{a.code} — {a.name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" className="ml-auto" onClick={exportGlExcel}>
                <FileSpreadsheet className="h-3.5 w-3.5" /> Xuất Excel
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-800 text-white">
                    <th className="text-left p-2">Ngày</th>
                    <th className="text-left p-2">Diễn giải</th>
                    <th className="text-left p-2">TK đối ứng</th>
                    <th className="text-right p-2">Nợ</th>
                    <th className="text-right p-2">Có</th>
                    <th className="text-right p-2">Số dư</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-indigo-50 font-medium">
                    <td className="p-2" colSpan={5}>Số dư đầu kỳ</td>
                    <td className="p-2 text-right">{fmtVND(Math.abs(glOpening))} {glOpening < 0 ? 'Có' : 'Nợ'}</td>
                  </tr>
                  {glRowsWithBalance.length === 0 && (
                    <tr><td colSpan={6} className="p-4 text-center text-gray-400">Không có phát sinh trong kỳ</td></tr>
                  )}
                  {glRowsWithBalance.map((r, i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="p-2 text-gray-500 whitespace-nowrap">{vnDate(r.date)}</td>
                      <td className="p-2 text-gray-800 truncate max-w-xs" title={r.description}>{r.description}</td>
                      <td className="p-2 font-mono text-gray-500" title={nameByCode.get(r.contra ?? '') ?? ''}>{r.contra}</td>
                      <td className="p-2 text-right">{r.debit > 0 ? fmtVND(r.debit) : '—'}</td>
                      <td className="p-2 text-right">{r.credit > 0 ? fmtVND(r.credit) : '—'}</td>
                      <td className={`p-2 text-right font-medium ${r.balance < 0 ? 'text-red-600' : ''}`}>
                        {fmtVND(Math.abs(r.balance))} {r.balance < 0 ? 'Có' : 'Nợ'}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-indigo-50 font-medium border-t-2 border-indigo-200">
                    <td className="p-2" colSpan={3}>Cộng phát sinh / Số dư cuối kỳ</td>
                    <td className="p-2 text-right">{fmtVND(glPeriodDebit)}</td>
                    <td className="p-2 text-right">{fmtVND(glPeriodCredit)}</td>
                    <td className="p-2 text-right">{fmtVND(Math.abs(runningBalance))} {runningBalance < 0 ? 'Có' : 'Nợ'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {transactions.length === 0 && periodJEs.length === 0 && (
        <p className="text-sm text-amber-600 text-center">
          Chưa có giao dịch trong kỳ này. Hãy hạch toán ở tab Hạch toán trước.
        </p>
      )}
    </div>
  )
}
