import { useState } from 'react'
import { FileDown } from 'lucide-react'
import { Button } from '@/components/shared/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/shared/Card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/shared/Select'
import { Label } from '@/components/shared/Label'
import { supabase } from '@/lib/supabase'
import { useTransactions } from '@/hooks/useTransactions'
import { useCompany } from '@/hooks/useCompanies'
import { formatVND, getCurrentQuarter } from '@/lib/utils'
import { pdf } from '@react-pdf/renderer'
import BCTCPDF from '@/lib/pdf/BCTCPDF'

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

export default function BCTCTab({ companyId }: { companyId: string }) {
  const { data: company } = useCompany(companyId)
  const { quarter, year } = getCurrentQuarter()
  const [period, setPeriod] = useState(`${year}-Q${quarter}`)
  const periodOptions = buildPeriodOptions()
  const [generating, setGenerating] = useState(false)

  const isQuarter = period.includes('-Q')
  const [periodYear, periodQ] = isQuarter ? period.split('-Q').map(Number) : [parseInt(period), 0]
  const dateFrom = isQuarter
    ? new Date(periodYear, (periodQ - 1) * 3, 1).toISOString().split('T')[0]
    : `${periodYear}-01-01`
  const dateTo = isQuarter
    ? new Date(periodYear, periodQ * 3, 0).toISOString().split('T')[0]
    : `${periodYear}-12-31`

  const { data: transactions = [] } = useTransactions(companyId, { status: 'official', dateFrom, dateTo })

  const totalRevenue = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const totalExpense = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const netProfit = totalRevenue - totalExpense

  async function exportPDF() {
    if (!company) return
    setGenerating(true)
    try {
      const blob = await pdf(
        <BCTCPDF company={company} period={period} transactions={transactions} />
      ).toBlob()

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `bctc-${period}-${company.name}.pdf`
      a.click()
      URL.revokeObjectURL(url)

      // Auto-save to documents and mark compliance
      const { data: existingProfile } = await supabase.from('profiles').select('id').limit(1).single()
      if (existingProfile) {
        const path = `${companyId}/bctc-${period}-${Date.now()}.pdf`
        const file = new File([blob], `BCTC-${period}.pdf`, { type: 'application/pdf' })
        await supabase.storage.from('documents').upload(path, file)
        await supabase.from('documents').insert({
          company_id: companyId,
          name: `BCTC ${period}`,
          file_path: path,
          file_type: 'application/pdf',
          file_size: blob.size,
          uploaded_by: existingProfile.id,
          shared_with_client: true,
        })
      }

      // Mark BCTC compliance as completed
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
      <div className="flex items-center gap-3">
        <Label>Kỳ báo cáo:</Label>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {periodOptions.map(o => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Preview */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">B02-DNN — Kết quả kinh doanh</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Doanh thu thuần</span>
              <span className="font-medium text-green-600">{formatVND(totalRevenue)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Chi phí</span>
              <span className="font-medium text-red-600">{formatVND(totalExpense)}</span>
            </div>
            <div className="flex justify-between border-t pt-2">
              <span className="font-medium">Lợi nhuận sau thuế</span>
              <span className={`font-bold ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatVND(Math.abs(netProfit))} {netProfit < 0 ? '(lỗ)' : ''}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">B03-DNN — Lưu chuyển tiền tệ</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Thu từ hoạt động KD</span>
              <span className="font-medium text-green-600">{formatVND(totalRevenue)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Chi cho hoạt động KD</span>
              <span className="font-medium text-red-600">{formatVND(totalExpense)}</span>
            </div>
            <div className="flex justify-between border-t pt-2">
              <span className="font-medium">Lưu chuyển tiền thuần</span>
              <span className={`font-bold ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatVND(Math.abs(netProfit))}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="py-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-blue-900">Xuất bộ BCTC (B02-DNN + B03-DNN)</p>
            <p className="text-xs text-blue-600 mt-0.5">Tự động lưu vào tài liệu và chia sẻ với khách hàng</p>
          </div>
          <Button onClick={exportPDF} disabled={generating || transactions.length === 0}>
            <FileDown className="h-4 w-4" />
            {generating ? 'Đang tạo...' : 'Xuất PDF TT99'}
          </Button>
        </CardContent>
      </Card>

      {transactions.length === 0 && (
        <p className="text-sm text-amber-600 text-center">
          Chưa có giao dịch trong kỳ này. Vui lòng nhập giao dịch trước khi tạo BCTC.
        </p>
      )}
    </div>
  )
}
