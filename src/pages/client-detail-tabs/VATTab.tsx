import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { FileDown, CheckCircle2, Plus, Trash2, ArrowUpRight, ArrowDownRight, FileSpreadsheet } from 'lucide-react'
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
import { cn } from '@/lib/utils'
import type { VATPeriod } from '@/types'
import { pdf } from '@react-pdf/renderer'
import VATPDF from '@/lib/pdf/VATPDF'
import * as XLSX from 'xlsx'

interface VATAdjRow {
  id: string
  description: string
  amount: number
  type: 'input' | 'output'
}

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

  // Manual adjustment rows
  const [adjRows, setAdjRows] = useState<VATAdjRow[]>([])
  const [newAdjDesc, setNewAdjDesc] = useState('')
  const [newAdjAmount, setNewAdjAmount] = useState('')
  const [newAdjType, setNewAdjType] = useState<'input' | 'output'>('input')

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

  const { data: postedInvoices = [] } = useQuery({
    queryKey: ['invoices-vat', companyId, qStart, qEnd],
    queryFn: async () => {
      const { data } = await supabase
        .from('invoices')
        .select('direction, subtotal, vat_amount, invoice_date, seller_name, seller_mst, seller_address, buyer_name, buyer_mst, buyer_address, invoice_number, description')
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

  const outgoingInvoices = postedInvoices.filter((i: { direction: string }) => i.direction === 'outgoing')
  const incomingInvoices = postedInvoices.filter((i: { direction: string }) => i.direction === 'incoming')

  const invoiceOutputVAT = outgoingInvoices.reduce((s: number, i: { vat_amount: number }) => s + i.vat_amount, 0)
  const txOutputVAT = Math.round(totalRevenue * vatRate)
  const baseOutputVAT = vatPeriod
    ? vatPeriod.output_vat
    : invoiceOutputVAT > 0 ? invoiceOutputVAT : txOutputVAT

  const invoiceInputVAT = incomingInvoices.reduce((s: number, i: { vat_amount: number }) => s + i.vat_amount, 0)
  const txInputVAT = expenseTransactions.reduce((s, t) => s + t.vat_amount, 0)
  const baseInputVAT = vatPeriod
    ? vatPeriod.input_vat
    : invoiceInputVAT > 0 ? invoiceInputVAT : txInputVAT

  // Apply manual adjustments
  const adjOutputTotal = adjRows.filter(r => r.type === 'output').reduce((s, r) => s + r.amount, 0)
  const adjInputTotal = adjRows.filter(r => r.type === 'input').reduce((s, r) => s + r.amount, 0)

  const finalOutputVAT = baseOutputVAT + adjOutputTotal
  const finalInputVAT = baseInputVAT + adjInputTotal
  const finalPayable = finalOutputVAT - finalInputVAT

  function addAdjRow() {
    const amount = parseInt(newAdjAmount)
    if (!amount || !newAdjDesc.trim()) return
    setAdjRows(r => [...r, { id: crypto.randomUUID(), description: newAdjDesc.trim(), amount, type: newAdjType }])
    setNewAdjDesc('')
    setNewAdjAmount('')
  }

  const saveMutation = useMutation({
    mutationFn: async (status: 'draft' | 'finalized') => {
      const data = {
        company_id: companyId,
        period,
        output_vat: finalOutputVAT,
        input_vat: finalInputVAT,
        payable: finalPayable,
        adjustments: adjRows,
        status,
        finalized_at: status === 'finalized' ? new Date().toISOString() : null,
      }
      await supabase.from('vat_periods').upsert(data, { onConflict: 'company_id,period' })

      if (status === 'finalized') {
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

  function exportExcel() {
    const wb = XLSX.utils.book_new()

    // Sheet 1: Bảng kê hóa đơn bán ra (output VAT)
    const outRows = [
      ['BẢNG KÊ HÓA ĐƠN, CHỨNG TỪ HÀNG HÓA, DỊCH VỤ BÁN RA'],
      [`Kỳ tính thuế: ${period}   Đơn vị: ${company?.name ?? ''}   MST: ${company?.mst ?? ''}`],
      [],
      ['STT', 'Tên người mua', 'MST', 'Địa chỉ', 'Ngày HĐ', 'Số HĐ', 'Diễn giải', 'Doanh thu chưa thuế', 'Thuế GTGT'],
      ...outgoingInvoices.map((inv: { buyer_name: string; buyer_mst: string; buyer_address: string; invoice_date: string; invoice_number: string; description: string; subtotal: number; vat_amount: number }, idx: number) => [
        idx + 1,
        inv.buyer_name ?? '',
        inv.buyer_mst ?? '',
        inv.buyer_address ?? '',
        inv.invoice_date ?? '',
        inv.invoice_number ?? '',
        inv.description ?? '',
        inv.subtotal ?? 0,
        inv.vat_amount ?? 0,
      ]),
      [],
      ['', '', '', '', '', '', 'TỔNG CỘNG', outgoingInvoices.reduce((s: number, i: { subtotal: number }) => s + (i.subtotal ?? 0), 0), invoiceOutputVAT],
    ]
    const ws1 = XLSX.utils.aoa_to_sheet(outRows)
    XLSX.utils.book_append_sheet(wb, ws1, 'HĐ bán ra')

    // Sheet 2: Bảng kê hóa đơn mua vào (input VAT)
    const inRows = [
      ['BẢNG KÊ HÓA ĐƠN, CHỨNG TỪ HÀNG HÓA, DỊCH VỤ MUA VÀO'],
      [`Kỳ tính thuế: ${period}   Đơn vị: ${company?.name ?? ''}   MST: ${company?.mst ?? ''}`],
      [],
      ['STT', 'Tên người bán', 'MST', 'Địa chỉ', 'Ngày HĐ', 'Số HĐ', 'Diễn giải', 'Giá trị chưa thuế', 'Thuế GTGT được khấu trừ'],
      ...incomingInvoices.map((inv: { seller_name: string; seller_mst: string; seller_address: string; invoice_date: string; invoice_number: string; description: string; subtotal: number; vat_amount: number }, idx: number) => [
        idx + 1,
        inv.seller_name ?? '',
        inv.seller_mst ?? '',
        inv.seller_address ?? '',
        inv.invoice_date ?? '',
        inv.invoice_number ?? '',
        inv.description ?? '',
        inv.subtotal ?? 0,
        inv.vat_amount ?? 0,
      ]),
      [],
      ['', '', '', '', '', '', 'TỔNG CỘNG', incomingInvoices.reduce((s: number, i: { subtotal: number }) => s + (i.subtotal ?? 0), 0), invoiceInputVAT],
    ]
    const ws2 = XLSX.utils.aoa_to_sheet(inRows)
    XLSX.utils.book_append_sheet(wb, ws2, 'HĐ mua vào')

    // Sheet 3: Tổng hợp
    const sumRows = [
      ['TỔNG HỢP KÊ KHAI VAT'],
      [`Kỳ: ${period}   Công ty: ${company?.name ?? ''}   MST: ${company?.mst ?? ''}`],
      [],
      ['Chỉ tiêu', 'Số tiền'],
      ['VAT đầu ra (phải nộp)', finalOutputVAT],
      ['VAT đầu vào (được khấu trừ)', finalInputVAT],
      ['VAT phải nộp (hoặc được hoàn)', finalPayable],
      [],
      ...(adjRows.length > 0 ? [
        ['ĐIỀU CHỈNH THỦ CÔNG', ''],
        ...adjRows.map(r => [`[${r.type === 'output' ? 'Đầu ra' : 'Đầu vào'}] ${r.description}`, r.amount]),
      ] : []),
    ]
    const ws3 = XLSX.utils.aoa_to_sheet(sumRows)
    XLSX.utils.book_append_sheet(wb, ws3, 'Tổng hợp')

    XLSX.writeFile(wb, `bang-ke-vat-${period}-${company?.name ?? companyId}.xlsx`)
  }

  return (
    <div className="space-y-5">
      {/* Header row */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Label className="text-sm text-slate-600">Kỳ:</Label>
          <Select value={period} onValueChange={v => { setPeriod(v); setAdjRows([]) }}>
            <SelectTrigger className="w-36 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {periodOptions.map(o => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {vatPeriod?.status === 'finalized' && <Badge variant="success">Đã finalize</Badge>}
        <div className="ml-auto flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => saveMutation.mutate('draft')} disabled={saveMutation.isPending}>
            Lưu nháp
          </Button>
          <Button size="sm" variant="outline" onClick={exportPDF}>
            <FileDown className="h-3.5 w-3.5" /> PDF
          </Button>
          <Button size="sm" variant="outline" onClick={exportExcel}>
            <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
          </Button>
          <Button
            size="sm"
            onClick={() => saveMutation.mutate('finalized')}
            disabled={saveMutation.isPending || vatPeriod?.status === 'finalized'}
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Finalize
          </Button>
        </div>
      </div>

      {/* VAT Flow: Input → Output → Payable */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Input VAT (được khấu trừ) */}
        <Card className="border-green-200">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="h-6 w-6 rounded-full bg-green-100 flex items-center justify-center">
                <ArrowDownRight className="h-3.5 w-3.5 text-green-600" />
              </span>
              <p className="text-xs font-semibold text-green-700 uppercase tracking-wide">VAT đầu vào</p>
              <span className="ml-auto text-xs font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">Được khấu trừ (+)</span>
            </div>
            <p className="text-2xl font-bold text-green-700">{formatVND(finalInputVAT)}</p>
            <p className="text-xs text-slate-400 mt-1">
              {invoiceInputVAT > 0
                ? `${incomingInvoices.length} hóa đơn mua vào`
                : `Từ ${expenseTransactions.filter(t => t.vat_amount > 0).length} giao dịch chi`}
              {adjInputTotal !== 0 && ` + điều chỉnh ${formatVND(adjInputTotal)}`}
            </p>
          </CardContent>
        </Card>

        {/* Output VAT (phải nộp) */}
        <Card className="border-orange-200">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="h-6 w-6 rounded-full bg-orange-100 flex items-center justify-center">
                <ArrowUpRight className="h-3.5 w-3.5 text-orange-600" />
              </span>
              <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide">VAT đầu ra</p>
              <span className="ml-auto text-xs font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">Phải nộp (−)</span>
            </div>
            <p className="text-2xl font-bold text-orange-700">{formatVND(finalOutputVAT)}</p>
            <p className="text-xs text-slate-400 mt-1">
              {invoiceOutputVAT > 0
                ? `${outgoingInvoices.length} hóa đơn bán ra`
                : `Từ DT ${formatVND(totalRevenue)} × ${company?.vat_rate ?? 10}%`}
              {adjOutputTotal !== 0 && ` + điều chỉnh ${formatVND(adjOutputTotal)}`}
            </p>
          </CardContent>
        </Card>

        {/* Payable */}
        <Card className={cn(
          'border-2',
          finalPayable > 0 ? 'border-red-300 bg-red-50' : finalPayable < 0 ? 'border-blue-300 bg-blue-50' : 'border-slate-200'
        )}>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Kết quả</p>
            <p className={cn(
              'text-2xl font-bold',
              finalPayable > 0 ? 'text-red-600' : finalPayable < 0 ? 'text-blue-600' : 'text-slate-700'
            )}>
              {finalPayable >= 0 ? '' : '−'}{formatVND(Math.abs(finalPayable))}
            </p>
            {finalPayable > 0 && (
              <p className="text-xs text-red-500 mt-1 font-medium">Phải nộp ngân sách</p>
            )}
            {finalPayable < 0 && (
              <p className="text-xs text-blue-600 mt-1 font-medium">VAT âm — chuyển sang kỳ sau</p>
            )}
            {finalPayable === 0 && (
              <p className="text-xs text-slate-400 mt-1">Cân bằng</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Invoice detail tables */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Output invoices */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <ArrowUpRight className="h-4 w-4 text-orange-500" />
              Hóa đơn bán ra ({outgoingInvoices.length})
              <span className="ml-auto text-orange-600 font-bold text-sm">{formatVND(invoiceOutputVAT)}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {outgoingInvoices.length === 0 ? (
              <p className="text-xs text-slate-400 py-2">
                {txOutputVAT > 0
                  ? `Tính từ doanh thu: ${formatVND(totalRevenue)} × ${company?.vat_rate ?? 10}% = ${formatVND(txOutputVAT)}`
                  : 'Chưa có hóa đơn bán ra nào được hạch toán'}
              </p>
            ) : (
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {outgoingInvoices.map((inv: { buyer_name: string; invoice_date: string; invoice_number: string; vat_amount: number }, idx: number) => (
                  <div key={idx} className="flex items-center justify-between text-xs py-1 border-b border-slate-50">
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-slate-700">{inv.buyer_name || '—'}</p>
                      <p className="text-slate-400">{inv.invoice_date} {inv.invoice_number && `· HĐ ${inv.invoice_number}`}</p>
                    </div>
                    <span className="ml-2 font-mono text-orange-600 font-medium shrink-0">{formatVND(inv.vat_amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Input invoices */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <ArrowDownRight className="h-4 w-4 text-green-500" />
              Hóa đơn mua vào ({incomingInvoices.length})
              <span className="ml-auto text-green-600 font-bold text-sm">{formatVND(invoiceInputVAT)}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {incomingInvoices.length === 0 ? (
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {expenseTransactions.filter(t => t.vat_amount > 0).length === 0 ? (
                  <p className="text-xs text-slate-400 py-2">Chưa có hóa đơn mua vào nào được hạch toán</p>
                ) : (
                  expenseTransactions.filter(t => t.vat_amount > 0).map(t => (
                    <div key={t.id} className="flex items-center justify-between text-xs py-1 border-b border-slate-50">
                      <span className="truncate text-slate-600 flex-1">{t.description || '—'}</span>
                      <span className="ml-2 font-mono text-green-600 font-medium shrink-0">{formatVND(t.vat_amount)}</span>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {incomingInvoices.map((inv: { seller_name: string; invoice_date: string; invoice_number: string; vat_amount: number }, idx: number) => (
                  <div key={idx} className="flex items-center justify-between text-xs py-1 border-b border-slate-50">
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-slate-700">{inv.seller_name || '—'}</p>
                      <p className="text-slate-400">{inv.invoice_date} {inv.invoice_number && `· HĐ ${inv.invoice_number}`}</p>
                    </div>
                    <span className="ml-2 font-mono text-green-600 font-medium shrink-0">{formatVND(inv.vat_amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Manual adjustments */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Điều chỉnh thủ công</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {adjRows.length > 0 && (
            <div className="space-y-1.5">
              {adjRows.map(row => (
                <div key={row.id} className="flex items-center gap-2 text-xs py-1.5 px-2 rounded-lg bg-slate-50 border border-slate-100">
                  <span className={cn(
                    'px-1.5 py-0.5 rounded text-xs font-medium shrink-0',
                    row.type === 'input' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                  )}>
                    {row.type === 'input' ? 'Đầu vào' : 'Đầu ra'}
                  </span>
                  <span className="flex-1 text-slate-600">{row.description}</span>
                  <span className="font-mono font-medium text-slate-700">{formatVND(row.amount)}</span>
                  <button
                    onClick={() => setAdjRows(r => r.filter(x => x.id !== row.id))}
                    className="text-slate-300 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add new adjustment */}
          <div className="flex gap-2 items-end flex-wrap">
            <div className="shrink-0">
              <Label className="text-xs mb-1 block">Loại</Label>
              <select
                value={newAdjType}
                onChange={e => setNewAdjType(e.target.value as 'input' | 'output')}
                className="h-8 text-xs rounded-lg border border-slate-200 px-2 focus:outline-none focus:ring-1 focus:ring-violet-400"
              >
                <option value="input">Đầu vào (+)</option>
                <option value="output">Đầu ra (−)</option>
              </select>
            </div>
            <div className="flex-1 min-w-32">
              <Label className="text-xs mb-1 block">Diễn giải</Label>
              <Input
                value={newAdjDesc}
                onChange={e => setNewAdjDesc(e.target.value)}
                placeholder="Ví dụ: Điều chỉnh HĐ tháng trước"
                className="h-8 text-xs"
              />
            </div>
            <div className="w-36 shrink-0">
              <Label className="text-xs mb-1 block">Số tiền (đ)</Label>
              <Input
                type="number"
                value={newAdjAmount}
                onChange={e => setNewAdjAmount(e.target.value)}
                placeholder="0"
                className="h-8 text-xs"
              />
            </div>
            <Button size="sm" variant="outline" onClick={addAdjRow} className="h-8 shrink-0">
              <Plus className="h-3.5 w-3.5" /> Thêm
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
