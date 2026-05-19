import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { FileDown, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/shared/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/shared/Card'
import { Input } from '@/components/shared/Input'
import { Label } from '@/components/shared/Label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/shared/Select'
import { Badge } from '@/components/shared/Badge'
import { supabase } from '@/lib/supabase'
import { useTransactions } from '@/hooks/useTransactions'
import { useCompany } from '@/hooks/useCompanies'
import { formatVND, getCurrentQuarter } from '@/lib/utils'
import type { VATPeriod } from '@/types'
import { pdf } from '@react-pdf/renderer'
import VATPDF from '@/lib/pdf/VATPDF'

function buildPeriodOptions() {
  const { year, quarter } = getCurrentQuarter()
  const options = []
  for (let i = 0; i < 8; i++) {
    const correctedQ = ((quarter - 1 - i % 4 + 4) % 4) + 1
    const correctedY = year - Math.floor(i / 4)
    options.push({ label: `Quý ${correctedQ}/${correctedY}`, value: `${correctedY}-Q${correctedQ}` })
  }
  return options
}

export default function VATTab({ companyId }: { companyId: string }) {
  const qc = useQueryClient()
  const { data: company } = useCompany(companyId)
  const { quarter, year } = getCurrentQuarter()
  const [period, setPeriod] = useState(`${year}-Q${quarter}`)
  const periodOptions = buildPeriodOptions()

  const { data: vatPeriod } = useQuery({
    queryKey: ['vat-period', companyId, period],
    queryFn: async () => {
      const { data } = await supabase
        .from('vat_periods')
        .select('*')
        .eq('company_id', companyId)
        .eq('period', period)
        .single()
      return data as VATPeriod | null
    },
  })

  // Get period date range
  const [periodYear, periodQ] = period.split('-Q').map(Number)
  const qStart = new Date(periodYear, (periodQ - 1) * 3, 1).toISOString().split('T')[0]
  const qEnd = new Date(periodYear, periodQ * 3, 0).toISOString().split('T')[0]

  const { data: transactions = [] } = useTransactions(companyId, {
    status: 'official',
    dateFrom: qStart,
    dateTo: qEnd,
  })

  // Also aggregate VAT from posted invoices in the period
  const { data: postedInvoices = [] } = useQuery({
    queryKey: ['invoices-vat', companyId, qStart, qEnd],
    queryFn: async () => {
      const { data } = await supabase
        .from('invoices')
        .select('direction, subtotal, vat_amount, invoice_date, seller_name, buyer_name')
        .eq('company_id', companyId)
        .eq('status', 'posted')
        .gte('invoice_date', qStart)
        .lte('invoice_date', qEnd)
      return data ?? []
    },
  })

  const vatRate = (company?.vat_rate ?? 10) / 100

  const revenueTransactions = transactions.filter(t => t.type === 'income')
  const expenseTransactions = transactions.filter(t => t.type === 'expense')

  const totalRevenue = revenueTransactions.reduce((s, t) => s + t.amount, 0)

  // Output VAT: from transactions + from outgoing (sale) invoices
  const invoiceOutputVAT = postedInvoices
    .filter((i: { direction: string }) => i.direction === 'outgoing')
    .reduce((s: number, i: { vat_amount: number }) => s + i.vat_amount, 0)
  const txOutputVAT = Math.round(totalRevenue * vatRate)
  const outputVAT = vatPeriod
    ? vatPeriod.output_vat
    : invoiceOutputVAT > 0 ? invoiceOutputVAT : txOutputVAT

  // Input VAT: from transactions + from incoming (purchase) invoices
  const invoiceInputVAT = postedInvoices
    .filter((i: { direction: string }) => i.direction === 'incoming')
    .reduce((s: number, i: { vat_amount: number }) => s + i.vat_amount, 0)
  const txInputVAT = expenseTransactions.reduce((s, t) => s + t.vat_amount, 0)
  const inputVAT = vatPeriod
    ? vatPeriod.input_vat
    : invoiceInputVAT > 0 ? invoiceInputVAT : txInputVAT

  const [manualOutputVAT, setManualOutputVAT] = useState<number | null>(null)
  const [manualInputVAT, setManualInputVAT] = useState<number | null>(null)

  const finalOutputVAT = manualOutputVAT ?? outputVAT
  const finalInputVAT = manualInputVAT ?? inputVAT
  const finalPayable = finalOutputVAT - finalInputVAT

  const saveMutation = useMutation({
    mutationFn: async (status: 'draft' | 'finalized') => {
      const data = {
        company_id: companyId,
        period,
        output_vat: finalOutputVAT,
        input_vat: finalInputVAT,
        payable: finalPayable,
        adjustments: [],
        status,
        finalized_at: status === 'finalized' ? new Date().toISOString() : null,
      }
      await supabase.from('vat_periods').upsert(data, { onConflict: 'company_id,period' })

      if (status === 'finalized') {
        // Mark compliance item as completed
        await supabase.from('compliance_items')
          .update({ status: 'completed' })
          .eq('company_id', companyId)
          .eq('type', 'vat_quarterly')
          .eq('period', period)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vat-period', companyId, period] })
      qc.invalidateQueries({ queryKey: ['compliance', companyId] })
    },
  })

  async function exportPDF() {
    if (!company) return
    const blob = await pdf(
      <VATPDF
        company={company}
        period={period}
        outputVAT={finalOutputVAT}
        inputVAT={finalInputVAT}
        payable={finalPayable}
        totalRevenue={totalRevenue}
      />
    ).toBlob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `to-khai-vat-${period}-${company.name}.pdf`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Label>Kỳ tính thuế:</Label>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {periodOptions.map(o => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {vatPeriod?.status === 'finalized' && <Badge variant="success">Đã finalize</Badge>}
      </div>

      {/* VAT Summary */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">VAT đầu ra</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-xs text-gray-500">Doanh thu chịu thuế</p>
              <p className="text-lg font-bold text-gray-900">{formatVND(totalRevenue)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Thuế suất: {company?.vat_rate ?? 10}%</p>
              <p className="text-xl font-bold text-blue-600">{formatVND(outputVAT)}</p>
            </div>
            <div>
              <Label className="text-xs">Điều chỉnh thủ công</Label>
              <Input
                type="number"
                placeholder={outputVAT.toString()}
                onChange={e => setManualOutputVAT(e.target.value ? parseInt(e.target.value) : null)}
                className="mt-1"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">VAT đầu vào</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-xs text-gray-500">
                {invoiceInputVAT > 0
                  ? `Từ ${postedInvoices.filter((i: { direction: string }) => i.direction === 'incoming').length} hóa đơn mua vào đã hạch toán`
                  : 'Từ giao dịch chi có VAT'}
              </p>
              <p className="text-xl font-bold text-gray-900">{formatVND(inputVAT)}</p>
            </div>
            <div>
              <Label className="text-xs">Điều chỉnh thủ công</Label>
              <Input
                type="number"
                placeholder={inputVAT.toString()}
                onChange={e => setManualInputVAT(e.target.value ? parseInt(e.target.value) : null)}
                className="mt-1"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* VAT Payable */}
      <Card className={finalPayable > 0 ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}>
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">VAT phải nộp ({period})</p>
              <p className={`text-3xl font-bold mt-1 ${finalPayable > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {formatVND(Math.abs(finalPayable))}
              </p>
              {finalPayable < 0 && <p className="text-xs text-green-600 mt-1">Được hoàn thuế</p>}
            </div>
            <div className="space-y-2">
              <Button
                onClick={() => saveMutation.mutate('draft')}
                variant="outline"
                disabled={saveMutation.isPending}
              >
                Lưu nháp
              </Button>
              <Button onClick={exportPDF} variant="outline">
                <FileDown className="h-4 w-4" /> Xuất PDF
              </Button>
              <Button
                onClick={() => saveMutation.mutate('finalized')}
                disabled={saveMutation.isPending || vatPeriod?.status === 'finalized'}
              >
                <CheckCircle2 className="h-4 w-4" /> Finalize
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Transaction breakdown */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Chi tiết giao dịch kỳ {period}</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="font-medium text-gray-600 mb-2">Thu ({revenueTransactions.length})</p>
              <div className="space-y-1">
                {revenueTransactions.slice(0, 5).map(t => (
                  <div key={t.id} className="flex justify-between text-xs">
                    <span className="text-gray-500 truncate flex-1">{t.description || t.counterparty || '—'}</span>
                    <span className="text-green-600 ml-2">{formatVND(t.amount)}</span>
                  </div>
                ))}
                {revenueTransactions.length > 5 && <p className="text-xs text-gray-400">+{revenueTransactions.length - 5} giao dịch nữa</p>}
              </div>
            </div>
            <div>
              <p className="font-medium text-gray-600 mb-2">Chi có VAT ({expenseTransactions.filter(t => t.vat_amount > 0).length})</p>
              <div className="space-y-1">
                {expenseTransactions.filter(t => t.vat_amount > 0).slice(0, 5).map(t => (
                  <div key={t.id} className="flex justify-between text-xs">
                    <span className="text-gray-500 truncate flex-1">{t.description || '—'}</span>
                    <span className="text-blue-600 ml-2">VAT: {formatVND(t.vat_amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
