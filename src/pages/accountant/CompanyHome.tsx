import { useMemo } from 'react'
import {
  FolderOpen, FileText, CreditCard, Landmark, ReceiptText,
  BarChart3, CheckCircle2, Circle, AlertTriangle,
  TrendingUp, TrendingDown, PieChart, ChevronRight,
} from 'lucide-react'
import { useTransactions } from '@/hooks/useTransactions'
import { useComplianceItems } from '@/hooks/useCompliance'
import { useDocumentRequests } from '@/hooks/useDocuments'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { formatVND, getCurrentQuarter } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { Company } from '@/types'

type TabKey = 'home' | 'compliance' | 'parsed-invoices' | 'ledger' | 'bank' | 'tax-reports' | 'documents' | 'settings'

interface Props {
  company: Company
  onNavigate: (tab: TabKey) => void
}

function getQuarterRange(year: number, quarter: number) {
  const start = new Date(year, (quarter - 1) * 3, 1).toISOString().split('T')[0]
  const end = new Date(year, quarter * 3, 0).toISOString().split('T')[0]
  return { start, end }
}

function getMonthRange(year: number, month: number) {
  const start = new Date(year, month - 1, 1).toISOString().split('T')[0]
  const end = new Date(year, month, 0).toISOString().split('T')[0]
  return { start, end }
}

type StepStatus = 'done' | 'action' | 'pending' | 'locked'

function StatusIcon({ status }: { status: StepStatus }) {
  if (status === 'done') return <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
  if (status === 'action') return (
    <span className="h-5 w-5 rounded-full border-2 border-violet-500 bg-violet-100 shrink-0 flex items-center justify-center">
      <span className="h-2 w-2 rounded-full bg-violet-500" />
    </span>
  )
  return <Circle className="h-5 w-5 text-slate-300 shrink-0" />
}

export default function CompanyHome({ company, onNavigate }: Props) {
  const now = new Date()
  const currentMonth = now.getMonth() + 1
  const currentYear = now.getFullYear()
  const { year, quarter } = getCurrentQuarter()
  const { start: qStart, end: qEnd } = getQuarterRange(year, quarter)
  const { start: mStart, end: mEnd } = getMonthRange(currentYear, currentMonth)
  const isQuarterEnd = [3, 6, 9, 12].includes(currentMonth)

  const { data: txs = [] } = useTransactions(company.id, { status: 'official', dateFrom: qStart, dateTo: qEnd })
  const { data: compliance = [] } = useComplianceItems(company.id)
  const { data: docRequests = [] } = useDocumentRequests(company.id)

  const { data: pendingInvoices = 0 } = useQuery({
    queryKey: ['invoices-pending-count', company.id],
    queryFn: async () => {
      const { count } = await supabase.from('invoices').select('*', { count: 'exact', head: true })
        .eq('company_id', company.id).eq('status', 'pending')
      return count ?? 0
    },
  })

  const { data: totalInvoices = 0 } = useQuery({
    queryKey: ['invoices-total-month', company.id, mStart, mEnd],
    queryFn: async () => {
      const { count } = await supabase.from('invoices').select('*', { count: 'exact', head: true })
        .eq('company_id', company.id).gte('invoice_date', mStart).lte('invoice_date', mEnd)
      return count ?? 0
    },
  })

  const { data: unmatchedBank = 0 } = useQuery({
    queryKey: ['bank-unmatched-count', company.id],
    queryFn: async () => {
      const { count } = await supabase.from('bank_transactions').select('*', { count: 'exact', head: true })
        .eq('company_id', company.id).eq('status', 'unmatched')
      return count ?? 0
    },
  })

  const { data: bankTxCount = 0 } = useQuery({
    queryKey: ['bank-total-count', company.id],
    queryFn: async () => {
      const { count } = await supabase.from('bank_transactions').select('*', { count: 'exact', head: true })
        .eq('company_id', company.id)
      return count ?? 0
    },
  })

  // Step statuses
  const pendingDocs = docRequests.filter(r => (r as { status: string }).status === 'pending').length
  const totalDocs = docRequests.length

  const vatCompliance = compliance.find(c =>
    /VAT|GTGT|giá trị gia tăng/i.test(c.name) &&
    c.due_date >= mStart && c.due_date <= mEnd
  )
  const bctcCompliance = compliance.find(c =>
    /BCTC|báo cáo tài chính/i.test(c.name) &&
    c.due_date >= qStart && c.due_date <= qEnd
  )

  const step1Status: StepStatus = pendingDocs > 0 ? 'action' : totalDocs > 0 ? 'done' : 'pending'
  const step2Status: StepStatus = pendingInvoices > 0 ? 'action' : totalInvoices > 0 ? 'done' : 'pending'
  const step3Status: StepStatus = txs.length > 0 ? 'done' : 'pending'
  const step4Status: StepStatus = bankTxCount === 0 ? 'pending' : unmatchedBank > 0 ? 'action' : 'done'
  const step5Status: StepStatus = vatCompliance?.status === 'completed' ? 'done' : 'action'
  const step6Status: StepStatus = !isQuarterEnd ? 'locked' : bctcCompliance?.status === 'completed' ? 'done' : 'action'

  const steps = [
    {
      num: 1, status: step1Status, tab: 'documents' as TabKey,
      icon: FolderOpen, iconBg: 'bg-green-100', iconColor: 'text-green-600',
      label: 'Thu chứng từ',
      desc: pendingDocs > 0 ? `${pendingDocs} yêu cầu chờ khách hàng` : totalDocs > 0 ? `${totalDocs} chứng từ đã nhận` : 'Gửi yêu cầu cho khách hàng',
    },
    {
      num: 2, status: step2Status, tab: 'parsed-invoices' as TabKey,
      icon: FileText, iconBg: 'bg-blue-100', iconColor: 'text-blue-600',
      label: 'Nhập hóa đơn',
      desc: pendingInvoices > 0 ? `${pendingInvoices} hóa đơn chờ hạch toán` : totalInvoices > 0 ? `${totalInvoices} hóa đơn đã nhập` : 'Upload và hạch toán hóa đơn',
    },
    {
      num: 3, status: step3Status, tab: 'ledger' as TabKey,
      icon: CreditCard, iconBg: 'bg-cyan-100', iconColor: 'text-cyan-600',
      label: 'Nhập giao dịch',
      desc: txs.length > 0 ? `${txs.length} giao dịch trong quý` : 'Chưa có giao dịch trong tháng',
    },
    {
      num: 4, status: step4Status, tab: 'bank' as TabKey,
      icon: Landmark, iconBg: 'bg-teal-100', iconColor: 'text-teal-600',
      label: 'Đối chiếu ngân hàng',
      desc: unmatchedBank > 0 ? `${unmatchedBank} giao dịch chưa khớp` : bankTxCount > 0 ? 'Đã đối chiếu xong' : 'Import sao kê ngân hàng',
    },
    {
      num: 5, status: step5Status, tab: 'tax-reports' as TabKey,
      icon: ReceiptText, iconBg: 'bg-amber-100', iconColor: 'text-amber-600',
      label: 'Kê khai VAT',
      desc: vatCompliance?.status === 'completed' ? 'Đã nộp' : 'Lập tờ khai VAT tháng này',
    },
    ...(isQuarterEnd ? [{
      num: 6, status: step6Status, tab: 'tax-reports' as TabKey,
      icon: BarChart3, iconBg: 'bg-violet-100', iconColor: 'text-violet-600',
      label: 'Lập BCTC',
      desc: bctcCompliance?.status === 'completed' ? `Đã hoàn thành Q${quarter}` : `Cuối quý ${quarter} — lập báo cáo tài chính`,
    }] : []),
  ]

  const doneCount = steps.filter(s => s.status === 'done').length
  const totalSteps = steps.length
  const progressPct = Math.round((doneCount / totalSteps) * 100)

  // Metrics
  const revenue = useMemo(() => txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0), [txs])
  const expense = useMemo(() => txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0), [txs])
  const profit = revenue - expense
  const vatPayable = Math.round(revenue * (company.vat_rate ?? 10) / 100)

  const overdueItems = compliance.filter(c => c.status !== 'completed' && new Date(c.due_date) < new Date())
  const upcomingItems = compliance.filter(c => {
    if (c.status === 'completed') return false
    const days = Math.ceil((new Date(c.due_date).getTime() - Date.now()) / 86400000)
    return days >= 0 && days <= 14
  })

  const MONTH_VI = ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
    'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12']

  return (
    <div className="p-6 space-y-6 max-w-4xl">

      {/* ── PHẦN A: Header + Progress ─────────────────────────────── */}
      <div className="bg-gradient-to-r from-violet-600 to-purple-700 rounded-2xl p-5 text-white">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-violet-200 text-xs font-medium uppercase tracking-widest mb-1">
              Tiến độ tháng này
            </p>
            <h2 className="text-xl font-bold">
              {MONTH_VI[currentMonth - 1]} / {currentYear}
            </h2>
            <p className="text-violet-200 text-sm mt-0.5">Quý {quarter} • {doneCount}/{totalSteps} bước hoàn thành</p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-extrabold">{progressPct}%</p>
            <p className="text-violet-300 text-xs">hoàn thành</p>
          </div>
        </div>
        {/* Progress bar */}
        <div className="h-2 bg-white/20 rounded-full overflow-hidden">
          <div
            className="h-full bg-white rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* ── PHẦN B: Checklist 6 bước ──────────────────────────────── */}
      <div>
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">
          Quy trình tháng {currentMonth}
        </h3>
        <div className="space-y-2">
          {steps.map((step) => {
            const Icon = step.icon
            const isDone = step.status === 'done'
            const isAction = step.status === 'action'
            const isLocked = step.status === 'locked'
            return (
              <div
                key={step.num}
                className={cn(
                  'flex items-center gap-4 bg-white rounded-2xl border px-4 py-3.5 transition-all',
                  isDone && 'border-emerald-100 bg-emerald-50/30',
                  isAction && 'border-violet-200 shadow-sm',
                  !isDone && !isAction && 'border-slate-100',
                  isLocked && 'opacity-50'
                )}
              >
                {/* Step icon */}
                <span className={cn('h-9 w-9 rounded-xl flex items-center justify-center shrink-0', step.iconBg)}>
                  <Icon size={16} className={step.iconColor} />
                </span>

                {/* Label + desc */}
                <div className="flex-1 min-w-0">
                  <p className={cn(
                    'text-sm font-semibold',
                    isDone ? 'text-slate-500 line-through' : 'text-slate-800'
                  )}>
                    {step.label}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5 truncate">{step.desc}</p>
                </div>

                {/* Status + action */}
                <div className="flex items-center gap-2 shrink-0">
                  <StatusIcon status={step.status} />
                  {!isLocked && (
                    <button
                      onClick={() => onNavigate(step.tab)}
                      className={cn(
                        'flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg transition-all',
                        isAction
                          ? 'bg-violet-600 text-white hover:bg-violet-700'
                          : isDone
                          ? 'text-slate-400 hover:text-slate-600'
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      )}
                    >
                      {isAction ? 'Làm ngay' : isDone ? 'Xem' : 'Bắt đầu'}
                      <ChevronRight size={12} />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Urgent alerts ─────────────────────────────────────────── */}
      {(overdueItems.length > 0 || upcomingItems.length > 0) && (
        <div className="bg-white rounded-2xl border border-amber-100 p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-semibold text-slate-700">Cần chú ý</h3>
          </div>
          <div className="space-y-2">
            {overdueItems.map(i => (
              <div key={i.id} className="flex items-center gap-3">
                <div className="h-2 w-2 rounded-full bg-red-500 shrink-0" />
                <span className="text-sm text-slate-600">{i.name} — <span className="text-red-500">quá hạn</span></span>
              </div>
            ))}
            {upcomingItems.map(i => {
              const days = Math.ceil((new Date(i.due_date).getTime() - Date.now()) / 86400000)
              return (
                <div key={i.id} className="flex items-center gap-3">
                  <div className="h-2 w-2 rounded-full bg-amber-400 shrink-0" />
                  <span className="text-sm text-slate-600">{i.name} — còn {days} ngày</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── PHẦN C: Quick metrics ─────────────────────────────────── */}
      <div>
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">
          Số liệu Quý {quarter} / {year}
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Doanh thu', value: formatVND(revenue), icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { label: 'Chi phí', value: formatVND(expense), icon: TrendingDown, color: 'text-orange-500', bg: 'bg-orange-50' },
            { label: 'Lợi nhuận', value: formatVND(profit), icon: profit >= 0 ? TrendingUp : TrendingDown,
              color: profit >= 0 ? 'text-blue-600' : 'text-red-500', bg: profit >= 0 ? 'bg-blue-50' : 'bg-red-50' },
            { label: 'VAT ước tính', value: formatVND(vatPayable), icon: PieChart, color: 'text-violet-600', bg: 'bg-violet-50' },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="bg-white rounded-2xl border border-slate-100 p-3.5 space-y-2">
              <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center', bg)}>
                <Icon className={cn('h-3.5 w-3.5', color)} />
              </div>
              <p className="text-xs text-slate-400">{label}</p>
              <p className={cn('font-bold text-sm font-mono', color)}>{value}</p>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
