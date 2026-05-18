import { useState } from 'react'
import { FileDown } from 'lucide-react'
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

// Helper: tính balance của 1 mã TK từ transactions + journal_entries
function calcAccountBalance(
  code: string,
  transactions: { account_id: string | null; type: string; amount: number; accounts?: { code: string } | null }[],
  journalEntries: JournalEntry[],
  accountIdMap: Record<string, string> // code → id
) {
  const acctId = accountIdMap[code]
  // Từ transactions: income credit TK, expense debit TK
  const txBalance = transactions.reduce((sum, t) => {
    if (t.account_id !== acctId) return sum
    return t.type === 'income' ? sum + t.amount : sum - t.amount
  }, 0)
  // Từ journal_entries
  const jeBalance = journalEntries.reduce((sum, e) => {
    if (e.debit_account === code) return sum + e.amount
    if (e.credit_account === code) return sum - e.amount
    return sum
  }, 0)
  return txBalance + jeBalance
}

export default function BCTCTab({ companyId }: { companyId: string }) {
  const { data: company } = useCompany(companyId)
  const { quarter, year } = getCurrentQuarter()
  const [period, setPeriod] = useState(`${year}-Q${quarter}`)
  const periodOptions = buildPeriodOptions()
  const [generating, setGenerating] = useState(false)
  const [activeView, setActiveView] = useState<'reports' | 'tb' | 'gl'>('reports')
  const [glAccount, setGlAccount] = useState('112')

  const isQuarter = period.includes('-Q')
  const [periodYear, periodQ] = isQuarter ? period.split('-Q').map(Number) : [parseInt(period), 0]
  const dateFrom = isQuarter
    ? new Date(periodYear, (periodQ - 1) * 3, 1).toISOString().split('T')[0]
    : `${periodYear}-01-01`
  const dateTo = isQuarter
    ? new Date(periodYear, periodQ * 3, 0).toISOString().split('T')[0]
    : `${periodYear}-12-31`

  const { data: transactions = [] } = useTransactions(companyId, { status: 'official', dateFrom, dateTo })
  const { data: allTransactions = [] } = useTransactions(companyId, { status: 'official' })

  const { data: journalEntries = [] } = useQuery({
    queryKey: ['journal-entries', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('journal_entries').select('*').eq('company_id', companyId)
      return (data ?? []) as JournalEntry[]
    },
  })

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('accounts').select('id, code, name, type').eq('company_id', companyId)
      return data ?? []
    },
  })

  const accountIdMap: Record<string, string> = {}
  accounts.forEach((a: { code: string; id: string }) => { accountIdMap[a.code] = a.id })

  // B02 figures
  const totalRevenue = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const totalExpense = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const netProfit = totalRevenue - totalExpense

  // B01 figures — tính từ toàn bộ transactions (cumulative balance sheet)
  const bal = (code: string) => calcAccountBalance(code, allTransactions, journalEntries, accountIdMap)

  const cash = bal('111') + bal('112')
  const receivables = bal('131')
  const vatInput = bal('133')
  const inventory = bal('152') + bal('155') + bal('156')
  const ppe = bal('211')
  const accDepreciation = bal('214')
  const prepaid = bal('242')
  const totalAssets = cash + receivables + vatInput + inventory + ppe - accDepreciation + prepaid

  const shortTermLoan = Math.abs(bal('311'))
  const payables = Math.abs(bal('331'))
  const taxPayable = Math.abs(bal('333'))
  const salaryPayable = Math.abs(bal('334'))
  const totalLiabilities = shortTermLoan + payables + taxPayable + salaryPayable

  const capital = Math.abs(bal('411'))
  const retainedEarnings = Math.abs(bal('421')) + netProfit
  const totalEquity = capital + retainedEarnings

  // Trial Balance — tất cả TK có phát sinh
  const tbRows = DEFAULT_ACCOUNTS.map(a => {
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

  // General Ledger — transactions + journal entries cho 1 TK
  const glTxs = allTransactions
    .filter(t => t.account_id === accountIdMap[glAccount])
    .map(t => ({
      date: t.date,
      description: t.description || t.counterparty || '—',
      debit: t.type === 'expense' ? t.amount : 0,
      credit: t.type === 'income' ? t.amount : 0,
    }))
  const glJEs = journalEntries
    .filter(e => e.debit_account === glAccount || e.credit_account === glAccount)
    .map(e => ({
      date: e.date,
      description: e.description || '—',
      debit: e.debit_account === glAccount ? e.amount : 0,
      credit: e.credit_account === glAccount ? e.amount : 0,
    }))
  const glRows = [...glTxs, ...glJEs].sort((a, b) => a.date.localeCompare(b.date))
  let runningBalance = 0
  const glRowsWithBalance = glRows.map(r => {
    runningBalance += r.debit - r.credit
    return { ...r, balance: runningBalance }
  })

  async function exportPDF() {
    if (!company) return
    setGenerating(true)
    try {
      const blob = await pdf(
        <BCTCPDF company={company} period={period} transactions={transactions} journalEntries={journalEntries} />
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

  return (
    <div className="space-y-4">
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
        <Button onClick={exportPDF} disabled={generating || transactions.length === 0}>
          <FileDown className="h-4 w-4" />
          {generating ? 'Đang tạo...' : 'Xuất PDF TT99 (B01+B02+B03)'}
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
            <CardHeader><CardTitle className="text-sm">B02-DNN — Kết quả hoạt động kinh doanh</CardTitle></CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              {[
                { code: '01', label: 'Doanh thu bán hàng và CCDV', value: totalRevenue },
                { code: '10', label: 'Doanh thu thuần', value: totalRevenue, bold: true },
                { code: '25', label: 'Chi phí quản lý doanh nghiệp', value: totalExpense },
                { code: '30', label: 'Lợi nhuận thuần từ HĐKD', value: netProfit, bold: true },
                { code: '50', label: 'Tổng lợi nhuận trước thuế', value: netProfit, bold: true },
                { code: '60', label: 'Lợi nhuận sau thuế', value: netProfit, bold: true, highlight: true },
              ].map(row => (
                <div key={row.code} className={`flex justify-between items-center py-1 ${row.highlight ? 'border-t font-bold' : ''}`}>
                  <span className="text-gray-500 w-8 text-xs">{row.code}</span>
                  <span className={`flex-1 ${row.bold ? 'font-semibold' : 'text-gray-600'}`}>{row.label}</span>
                  <span className={`font-medium ${row.value < 0 ? 'text-red-600' : 'text-gray-900'} ${row.bold ? 'font-bold' : ''}`}>
                    {fmtVND(row.value)}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* B03-DNN */}
          <Card>
            <CardHeader><CardTitle className="text-sm">B03-DNN — Lưu chuyển tiền tệ</CardTitle></CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              {[
                { code: '01', label: 'Thu từ bán hàng, CCDV', value: totalRevenue },
                { code: '02', label: 'Chi trả người cung cấp', value: -totalExpense },
                { code: '20', label: 'Lưu chuyển tiền thuần từ HĐKD', value: netProfit, bold: true },
                { code: '50', label: 'Lưu chuyển tiền thuần trong kỳ', value: netProfit, bold: true },
                { code: '70', label: 'Tiền cuối kỳ', value: cash, bold: true, highlight: true },
              ].map(row => (
                <div key={row.code} className={`flex justify-between items-center py-1 ${row.highlight ? 'border-t font-bold' : ''}`}>
                  <span className="text-gray-500 w-8 text-xs">{row.code}</span>
                  <span className={`flex-1 ${row.bold ? 'font-semibold' : 'text-gray-600'}`}>{row.label}</span>
                  <span className={`font-medium ${row.value < 0 ? 'text-red-600' : 'text-gray-900'} ${row.bold ? 'font-bold' : ''}`}>
                    {fmtVND(row.value)}
                  </span>
                </div>
              ))}
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
            <div className="flex items-center gap-3">
              <CardTitle className="text-sm">Sổ cái (General Ledger)</CardTitle>
              <Select value={glAccount} onValueChange={setGlAccount}>
                <SelectTrigger className="w-64 h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DEFAULT_ACCOUNTS.map(a => (
                    <SelectItem key={a.code} value={a.code}>{a.code} — {a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {glRowsWithBalance.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">Chưa có phát sinh cho tài khoản này</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-800 text-white">
                      <th className="text-left p-2">Ngày</th>
                      <th className="text-left p-2">Diễn giải</th>
                      <th className="text-right p-2">Nợ</th>
                      <th className="text-right p-2">Có</th>
                      <th className="text-right p-2">Số dư</th>
                    </tr>
                  </thead>
                  <tbody>
                    {glRowsWithBalance.map((r, i) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="p-2 text-gray-500">{r.date}</td>
                        <td className="p-2 text-gray-800 truncate max-w-xs">{r.description}</td>
                        <td className="p-2 text-right">{r.debit > 0 ? fmtVND(r.debit) : '—'}</td>
                        <td className="p-2 text-right">{r.credit > 0 ? fmtVND(r.credit) : '—'}</td>
                        <td className={`p-2 text-right font-medium ${r.balance < 0 ? 'text-red-600' : ''}`}>
                          {fmtVND(Math.abs(r.balance))} {r.balance < 0 ? 'Có' : 'Nợ'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {transactions.length === 0 && (
        <p className="text-sm text-amber-600 text-center">
          Chưa có giao dịch trong kỳ này. Hãy hạch toán ở tab Hạch toán trước.
        </p>
      )}
    </div>
  )
}
