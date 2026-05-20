import { useMemo } from 'react'
import {
  FileText, CreditCard, BarChart3, PieChart,
  CheckSquare, Settings, AlertTriangle, ChevronRight,
  TrendingUp, TrendingDown, ArrowRight,
} from 'lucide-react'
import { useTransactions } from '@/hooks/useTransactions'
import { useComplianceItems } from '@/hooks/useCompliance'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { formatVND, getCurrentQuarter } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { Company } from '@/types'

type SectionKey = 'invoices' | 'transactions' | 'tax' | 'financial' | 'progress' | 'settings'

interface Props {
  company: Company
  onNavigate: (section: SectionKey) => void
}

function getQuarterRange(year: number, quarter: number) {
  const start = new Date(year, (quarter - 1) * 3, 1).toISOString().split('T')[0]
  const end = new Date(year, quarter * 3, 0).toISOString().split('T')[0]
  return { start, end }
}

export default function CompanyHome({ company, onNavigate }: Props) {
  const { year, quarter } = getCurrentQuarter()
  const { start, end } = getQuarterRange(year, quarter)

  const { data: txs = [] } = useTransactions(company.id, {
    status: 'official',
    dateFrom: start,
    dateTo: end,
  })
  const { data: compliance = [] } = useComplianceItems(company.id)

  const { data: pendingInvoices = 0 } = useQuery({
    queryKey: ['invoices-pending-count', company.id],
    queryFn: async () => {
      const { count } = await supabase
        .from('invoices')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', company.id)
        .eq('status', 'pending')
      return count ?? 0
    },
  })

  const { data: unmatchedBank = 0 } = useQuery({
    queryKey: ['bank-unmatched-count', company.id],
    queryFn: async () => {
      const { count } = await supabase
        .from('bank_transactions')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', company.id)
        .eq('status', 'unmatched')
      return count ?? 0
    },
  })

  const revenue = useMemo(
    () => txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0),
    [txs]
  )
  const expense = useMemo(
    () => txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0),
    [txs]
  )
  const profit = revenue - expense
  const vatPayable = Math.round(revenue * (company.vat_rate ?? 10) / 100)

  const overdueItems = compliance.filter(
    c => c.status !== 'completed' && new Date(c.due_date) < new Date()
  )
  const upcomingItems = compliance.filter(c => {
    if (c.status === 'completed') return false
    const days = Math.ceil((new Date(c.due_date).getTime() - Date.now()) / 86400000)
    return days >= 0 && days <= 14
  })

  const urgentActions: { label: string; level: 'red' | 'yellow' }[] = []
  overdueItems.forEach(i => urgentActions.push({ label: `${i.name} — quá hạn`, level: 'red' }))
  upcomingItems.forEach(i => {
    const days = Math.ceil((new Date(i.due_date).getTime() - Date.now()) / 86400000)
    urgentActions.push({ label: `${i.name} — còn ${days} ngày`, level: 'yellow' })
  })
  if (pendingInvoices > 0)
    urgentActions.push({ label: `${pendingInvoices} hóa đơn chưa hạch toán`, level: 'yellow' })
  if (unmatchedBank > 0)
    urgentActions.push({ label: `${unmatchedBank} giao dịch NH chưa khớp`, level: 'yellow' })

  const sections: {
    key: SectionKey
    icon: React.ElementType
    label: string
    sub: string
    color: string
    badge?: number | string
    badgeColor?: string
  }[] = [
    {
      key: 'invoices',
      icon: FileText,
      label: 'Hóa đơn & Chứng từ',
      sub: pendingInvoices > 0 ? `${pendingInvoices} chờ hạch toán` : 'Cập nhật',
      color: 'from-violet-500 to-purple-600',
      badge: pendingInvoices || undefined,
      badgeColor: 'bg-violet-100 text-violet-700',
    },
    {
      key: 'transactions',
      icon: CreditCard,
      label: 'Sổ giao dịch',
      sub: unmatchedBank > 0 ? `${unmatchedBank} giao dịch chưa khớp` : 'Đối chiếu OK',
      color: 'from-blue-500 to-cyan-500',
      badge: unmatchedBank || undefined,
      badgeColor: 'bg-blue-100 text-blue-700',
    },
    {
      key: 'tax',
      icon: PieChart,
      label: 'Thuế VAT',
      sub: `Phải nộp: ${formatVND(vatPayable)}`,
      color: 'from-orange-400 to-amber-500',
    },
    {
      key: 'financial',
      icon: BarChart3,
      label: 'Báo cáo tài chính',
      sub: 'BCTC theo TT99',
      color: 'from-emerald-500 to-teal-500',
    },
    {
      key: 'progress',
      icon: CheckSquare,
      label: 'Tiến độ & Deadline',
      sub: overdueItems.length > 0
        ? `${overdueItems.length} việc quá hạn`
        : upcomingItems.length > 0
        ? `${upcomingItems.length} việc sắp đến hạn`
        : 'Mọi thứ đúng tiến độ',
      color: overdueItems.length > 0 ? 'from-red-500 to-rose-500' : 'from-green-500 to-emerald-500',
      badge: overdueItems.length || undefined,
      badgeColor: 'bg-red-100 text-red-700',
    },
    {
      key: 'settings',
      icon: Settings,
      label: 'Cài đặt',
      sub: 'Hệ thống TK & mẫu HĐ',
      color: 'from-slate-400 to-slate-500',
    },
  ]

  return (
    <div className="p-6 space-y-6 max-w-5xl">

      {/* Period header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg,#7C3AED,#9333EA)' }}>
          <span className="text-white font-bold text-sm">Q{quarter}</span>
        </div>
        <div>
          <p className="text-xs text-slate-400">Kỳ báo cáo hiện tại</p>
          <p className="font-semibold text-slate-700">Quý {quarter} / {year}</p>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            label: 'Doanh thu',
            value: formatVND(revenue),
            icon: TrendingUp,
            color: 'text-emerald-600',
            bg: 'bg-emerald-50',
          },
          {
            label: 'Chi phí',
            value: formatVND(expense),
            icon: TrendingDown,
            color: 'text-orange-500',
            bg: 'bg-orange-50',
          },
          {
            label: 'Lợi nhuận',
            value: formatVND(profit),
            icon: profit >= 0 ? TrendingUp : TrendingDown,
            color: profit >= 0 ? 'text-blue-600' : 'text-red-500',
            bg: profit >= 0 ? 'bg-blue-50' : 'bg-red-50',
          },
          {
            label: 'VAT ước tính',
            value: formatVND(vatPayable),
            icon: PieChart,
            color: 'text-purple-600',
            bg: 'bg-purple-50',
          },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white rounded-2xl border border-slate-100 p-4 space-y-2">
            <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', bg)}>
              <Icon className={cn('h-4 w-4', color)} />
            </div>
            <p className="text-xs text-slate-400">{label}</p>
            <p className={cn('font-bold text-base font-mono', color)}>{value}</p>
          </div>
        ))}
      </div>

      {/* Urgent actions */}
      {urgentActions.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-semibold text-slate-700">Cần làm ngay</h3>
          </div>
          <div className="space-y-2">
            {urgentActions.map((a, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className={cn(
                  'h-2 w-2 rounded-full shrink-0',
                  a.level === 'red' ? 'bg-red-500' : 'bg-amber-400'
                )} />
                <span className="text-sm text-slate-600">{a.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Section cards */}
      <div>
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
          Phân hệ
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {sections.map(({ key, icon: Icon, label, sub, color, badge, badgeColor }) => (
            <button
              key={key}
              onClick={() => onNavigate(key)}
              className="group bg-white rounded-2xl border border-slate-100 p-5 text-left
                hover:border-violet-200 hover:shadow-md transition-all duration-150"
            >
              <div className="flex items-start justify-between mb-4">
                <div className={cn(
                  'h-10 w-10 rounded-xl flex items-center justify-center bg-gradient-to-br',
                  color
                )}>
                  <Icon className="h-5 w-5 text-white" />
                </div>
                {badge ? (
                  <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full', badgeColor)}>
                    {badge}
                  </span>
                ) : (
                  <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-violet-400 transition-colors" />
                )}
              </div>
              <p className="font-semibold text-slate-700 text-sm leading-tight">{label}</p>
              <p className="text-xs text-slate-400 mt-1">{sub}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Quick stats row */}
      {txs.length > 0 && (
        <div className="bg-gradient-to-r from-violet-600 to-purple-600 rounded-2xl p-5 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-violet-200">Tổng giao dịch Q{quarter}</p>
              <p className="text-2xl font-bold mt-1">{txs.length} giao dịch</p>
            </div>
            <button
              onClick={() => onNavigate('transactions')}
              className="flex items-center gap-2 bg-white/20 hover:bg-white/30 transition-colors
                px-4 py-2 rounded-xl text-sm font-medium"
            >
              Xem chi tiết <ArrowRight className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-violet-300">Thu</p>
              <p className="font-semibold text-sm font-mono">
                {txs.filter(t => t.type === 'income').length} khoản
              </p>
            </div>
            <div>
              <p className="text-xs text-violet-300">Chi</p>
              <p className="font-semibold text-sm font-mono">
                {txs.filter(t => t.type === 'expense').length} khoản
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
