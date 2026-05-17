import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Clock, AlertCircle, Hourglass, CheckCircle2, ClipboardCheck, ArrowRight, Bell } from 'lucide-react'
import { AccountantLayout } from '@/components/shared/AccountantLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/shared/Card'
import { useCompanies } from '@/hooks/useCompanies'
import { useAllComplianceItems } from '@/hooks/useCompliance'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { isOverdue, daysUntil, formatDate } from '@/lib/utils'
import type { Company, ComplianceItem, DocumentRequest } from '@/types'

function computeClientStatus(
  company: Company,
  complianceItems: ComplianceItem[],
  docRequests: DocumentRequest[]
): 'urgent' | 'waiting' | 'ready' | 'complete' {
  const clientCompliance = complianceItems.filter(c => c.company_id === company.id)
  const clientDocs = docRequests.filter(d => d.company_id === company.id)

  const hasOverdue = clientCompliance.some(c => c.status !== 'completed' && isOverdue(c.due_date))
  const hasMissingDocs = clientDocs.some(d => d.status === 'pending' && d.deadline && isOverdue(d.deadline))
  if (hasOverdue || hasMissingDocs) return 'urgent'

  const hasWaiting = clientDocs.some(d => d.status === 'pending')
  if (hasWaiting) return 'waiting'

  const hasReady = clientDocs.some(d => d.status === 'uploaded')
  if (hasReady) return 'ready'

  const allDone = clientCompliance.length > 0 && clientCompliance.every(c => c.status === 'completed')
  if (allDone) return 'complete'

  return 'waiting'
}

const STATUS_CONFIG = {
  urgent: {
    dot: 'bg-red-500',
    badge: 'bg-red-100 text-red-700',
    label: 'Cần xử lý',
  },
  waiting: {
    dot: 'bg-amber-400',
    badge: 'bg-amber-100 text-amber-700',
    label: 'Chờ KH',
  },
  ready: {
    dot: 'bg-emerald-500',
    badge: 'bg-emerald-100 text-emerald-700',
    label: 'Sẵn sàng',
  },
  complete: {
    dot: 'bg-indigo-500',
    badge: 'bg-indigo-100 text-indigo-700',
    label: 'Hoàn tất',
  },
}

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Chào buổi sáng'
  if (hour < 18) return 'Chào buổi chiều'
  return 'Chào buổi tối'
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { data: companies = [] } = useCompanies()
  const { data: allCompliance = [] } = useAllComplianceItems()

  const { data: allDocRequests = [] } = useQuery({
    queryKey: ['doc-requests', 'all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('document_requests')
        .select('*')
      if (error) throw error
      return data as DocumentRequest[]
    },
  })

  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20)
      return data ?? []
    },
  })

  const clientStatuses = useMemo(() =>
    companies.map(c => ({
      company: c,
      status: computeClientStatus(c, allCompliance, allDocRequests as DocumentRequest[]),
    })),
    [companies, allCompliance, allDocRequests]
  )

  const urgent = clientStatuses.filter(c => c.status === 'urgent')
  const waiting = clientStatuses.filter(c => c.status === 'waiting')
  const ready = clientStatuses.filter(c => c.status === 'ready')
  const complete = clientStatuses.filter(c => c.status === 'complete')

  const upcomingDeadlines = allCompliance
    .filter(c => c.status !== 'completed' && daysUntil(c.due_date) <= 7 && daysUntil(c.due_date) >= 0)
    .slice(0, 5)

  const summaryCards = [
    {
      label: 'Cần xử lý ngay',
      count: urgent.length,
      description: 'Deadline hoặc chứng từ quá hạn',
      icon: AlertCircle,
      iconBg: 'bg-red-100',
      iconColor: 'text-red-500',
      numberColor: 'text-red-600',
      border: 'border-l-4 border-l-red-400',
      items: urgent,
    },
    {
      label: 'Chờ khách hàng',
      count: waiting.length,
      description: 'Chờ khách upload chứng từ',
      icon: Hourglass,
      iconBg: 'bg-amber-100',
      iconColor: 'text-amber-500',
      numberColor: 'text-amber-600',
      border: 'border-l-4 border-l-amber-400',
      items: waiting,
    },
    {
      label: 'Sẵn sàng review',
      count: ready.length,
      description: 'Đã upload, chờ bạn xem',
      icon: ClipboardCheck,
      iconBg: 'bg-emerald-100',
      iconColor: 'text-emerald-500',
      numberColor: 'text-emerald-600',
      border: 'border-l-4 border-l-emerald-400',
      items: ready,
    },
    {
      label: 'Hoàn tất quý này',
      count: complete.length,
      description: 'Tất cả compliance đã xong',
      icon: CheckCircle2,
      iconBg: 'bg-indigo-100',
      iconColor: 'text-indigo-500',
      numberColor: 'text-indigo-600',
      border: 'border-l-4 border-l-indigo-400',
      items: complete,
    },
  ]

  const today = new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <AccountantLayout>
      <div className="p-6 space-y-6">

        {/* Hero Banner */}
        <div className="relative rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 55%, #9333EA 100%)' }}>
          {/* Decorative blobs */}
          <div className="absolute -top-10 -right-10 h-48 w-48 rounded-full opacity-20" style={{ background: 'radial-gradient(circle, #A78BFA, transparent)' }} />
          <div className="absolute bottom-0 left-1/3 h-32 w-32 rounded-full opacity-10" style={{ background: 'radial-gradient(circle, #60A5FA, transparent)' }} />
          {/* SVG wave */}
          <svg className="absolute bottom-0 right-0 opacity-10 h-32 w-64" viewBox="0 0 300 150" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M0 100 Q75 40 150 80 Q225 120 300 50 L300 150 L0 150 Z" fill="white"/>
          </svg>

          <div className="relative z-10 p-6 flex items-center justify-between">
            <div>
              <p className="text-indigo-200 text-sm font-medium mb-1">{getGreeting()}, {profile?.full_name?.split(' ').pop() ?? 'bạn'} 👋</p>
              <h1 className="text-white text-2xl font-bold mb-3">Tổng quan hôm nay</h1>
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <p className="text-white/70 text-xs mb-0.5">Khách hàng</p>
                  <p className="text-white text-3xl font-extrabold leading-none">{companies.length}</p>
                </div>
                <div className="h-10 w-px bg-white/20" />
                <div className="text-center">
                  <p className="text-white/70 text-xs mb-0.5">Cần xử lý</p>
                  <p className="text-red-300 text-3xl font-extrabold leading-none">{urgent.length}</p>
                </div>
                <div className="h-10 w-px bg-white/20" />
                <div className="text-center">
                  <p className="text-white/70 text-xs mb-0.5">Hoàn tất</p>
                  <p className="text-emerald-300 text-3xl font-extrabold leading-none">{complete.length}</p>
                </div>
              </div>
            </div>
            <div className="hidden sm:block">
              <div className="h-16 w-16 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)' }}>
                <span className="text-3xl font-black text-white/90">Y</span>
              </div>
              <p className="text-indigo-200 text-xs text-center mt-1.5">{today}</p>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {summaryCards.map(card => {
            const Icon = card.icon
            return (
              <div key={card.label} className={`bg-white rounded-2xl shadow-sm border border-slate-100/60 ${card.border} p-4`}>
                <div className="flex items-start justify-between mb-3">
                  <div className={`h-9 w-9 rounded-xl flex items-center justify-center ${card.iconBg}`}>
                    <Icon className={`h-5 w-5 ${card.iconColor}`} />
                  </div>
                  {card.items.length > 0 && (
                    <span className="text-xs font-medium text-slate-400">{card.items.length} KH</span>
                  )}
                </div>
                <p className={`text-3xl font-extrabold leading-none mb-1 ${card.numberColor}`}>{card.count}</p>
                <p className="text-sm font-semibold text-slate-700">{card.label}</p>
                <p className="text-xs text-slate-400 mt-0.5">{card.description}</p>
                {card.items.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-100 space-y-1">
                    {card.items.slice(0, 2).map(({ company }) => (
                      <button
                        key={company.id}
                        onClick={() => navigate(`/clients/${company.id}`)}
                        className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-indigo-600 transition-colors w-full text-left"
                      >
                        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${card.iconColor.replace('text-', 'bg-')}`} />
                        <span className="truncate">{company.name}</span>
                      </button>
                    ))}
                    {card.items.length > 2 && (
                      <p className="text-xs text-slate-300 pl-3">+{card.items.length - 2} khác</p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="grid grid-cols-3 gap-5">
          {/* Client List */}
          <div className="col-span-2">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Tất cả khách hàng</CardTitle>
                  <button
                    onClick={() => navigate('/clients')}
                    className="flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700 font-medium transition-colors"
                  >
                    Xem tất cả <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </CardHeader>
              <CardContent>
                {companies.length === 0 ? (
                  <div className="text-center py-10">
                    {/* Inline empty state illustration */}
                    <svg className="mx-auto mb-3 h-16 w-16 opacity-20" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <circle cx="40" cy="40" r="38" stroke="#6366F1" strokeWidth="3"/>
                      <circle cx="29" cy="33" r="8" stroke="#6366F1" strokeWidth="2.5"/>
                      <circle cx="51" cy="33" r="8" stroke="#6366F1" strokeWidth="2.5"/>
                      <path d="M15 62 Q29 50 40 54 Q51 58 65 62" stroke="#6366F1" strokeWidth="2.5" strokeLinecap="round"/>
                    </svg>
                    <p className="text-sm text-slate-400">Chưa có khách hàng. Thêm khách hàng đầu tiên.</p>
                    <button
                      onClick={() => navigate('/clients')}
                      className="mt-2 text-sm text-indigo-500 hover:underline font-medium"
                    >
                      Thêm khách hàng →
                    </button>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-50">
                    {clientStatuses.slice(0, 10).map(({ company, status }) => {
                      const cfg = STATUS_CONFIG[status]
                      return (
                        <button
                          key={company.id}
                          onClick={() => navigate(`/clients/${company.id}`)}
                          className="flex items-center justify-between w-full py-3 text-left hover:bg-slate-50 transition-colors px-2 rounded-xl group"
                        >
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-xl flex items-center justify-center text-xs font-bold text-white shrink-0"
                              style={{ background: `hsl(${Math.abs(company.name.charCodeAt(0) * 137) % 360}, 65%, 50%)` }}>
                              {company.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-slate-800 group-hover:text-indigo-600 transition-colors">{company.name}</p>
                              <p className="text-xs text-slate-400">MST: {company.mst}</p>
                            </div>
                          </div>
                          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${cfg.badge}`}>
                            {cfg.label}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right column */}
          <div className="space-y-4">
            {/* Upcoming deadlines */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <div className="h-7 w-7 rounded-lg bg-amber-100 flex items-center justify-center">
                    <Clock className="h-4 w-4 text-amber-500" />
                  </div>
                  Deadline 7 ngày tới
                </CardTitle>
              </CardHeader>
              <CardContent>
                {upcomingDeadlines.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-3">Không có deadline sắp tới</p>
                ) : (
                  <div className="space-y-2">
                    {upcomingDeadlines.map(item => (
                      <div
                        key={item.id}
                        className="cursor-pointer hover:bg-slate-50 p-2 rounded-xl transition-colors"
                        onClick={() => navigate(`/clients/${item.company_id}`)}
                      >
                        <p className="text-xs font-semibold text-slate-700 truncate">{item.name}</p>
                        <p className="text-xs text-red-400 mt-0.5">{formatDate(item.due_date)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Notifications */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <div className="h-7 w-7 rounded-lg bg-indigo-100 flex items-center justify-center">
                    <Bell className="h-4 w-4 text-indigo-500" />
                  </div>
                  Thông báo
                </CardTitle>
              </CardHeader>
              <CardContent>
                {notifications.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-3">Chưa có thông báo</p>
                ) : (
                  <div className="space-y-1">
                    {notifications.slice(0, 5).map((n: { id: string; title: string; content: string; read: boolean; created_at: string }) => (
                      <div key={n.id} className={`p-2 rounded-xl text-xs ${n.read ? 'text-slate-400' : 'text-slate-700 font-medium bg-indigo-50/50'}`}>
                        <p>{n.title}</p>
                        <p className="text-slate-400 text-xs mt-0.5">{formatDate(n.created_at)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AccountantLayout>
  )
}
