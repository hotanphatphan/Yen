import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Clock } from 'lucide-react'
import { AccountantLayout, PageHeader } from '@/components/shared/AccountantLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/shared/Card'
import { useCompanies } from '@/hooks/useCompanies'
import { useAllComplianceItems } from '@/hooks/useCompliance'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
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

const STATUS_LABELS: Record<string, string> = {
  urgent: '🔴',
  waiting: '🟡',
  ready: '🟢',
  complete: '✅',
}

export default function DashboardPage() {
  const navigate = useNavigate()
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
      label: '🔴 Cần xử lý ngay',
      count: urgent.length,
      description: 'Deadline trong 7 ngày hoặc chứng từ quá hạn',
      color: 'bg-red-50 border-red-200',
      textColor: 'text-red-700',
      items: urgent,
    },
    {
      label: '🟡 Chờ khách hàng',
      count: waiting.length,
      description: 'Chờ khách hàng upload chứng từ',
      color: 'bg-amber-50 border-amber-200',
      textColor: 'text-amber-700',
      items: waiting,
    },
    {
      label: '🟢 Sẵn sàng review',
      count: ready.length,
      description: 'Khách hàng đã upload, chờ bạn xem',
      color: 'bg-green-50 border-green-200',
      textColor: 'text-green-700',
      items: ready,
    },
    {
      label: '✅ Hoàn tất quý này',
      count: complete.length,
      description: 'Đã hoàn tất tất cả compliance items',
      color: 'bg-blue-50 border-blue-200',
      textColor: 'text-blue-700',
      items: complete,
    },
  ]

  return (
    <AccountantLayout>
      <PageHeader
        title="Tổng quan"
        subtitle={`${companies.length} khách hàng đang quản lý`}
      />

      <div className="p-6 space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-4 gap-4">
          {summaryCards.map(card => (
            <div key={card.label} className={`rounded-lg border p-4 ${card.color}`}>
              <p className={`text-sm font-medium ${card.textColor}`}>{card.label}</p>
              <p className={`text-3xl font-bold mt-1 ${card.textColor}`}>{card.count}</p>
              <p className="text-xs text-gray-500 mt-1">{card.description}</p>
              {card.items.length > 0 && (
                <div className="mt-2 space-y-1">
                  {card.items.slice(0, 3).map(({ company }) => (
                    <button
                      key={company.id}
                      onClick={() => navigate(`/clients/${company.id}`)}
                      className="block w-full text-left text-xs text-gray-700 hover:text-blue-600 truncate"
                    >
                      → {company.name}
                    </button>
                  ))}
                  {card.items.length > 3 && (
                    <p className="text-xs text-gray-400">+{card.items.length - 3} khác</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-6">
          {/* Client List */}
          <div className="col-span-2">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Tất cả khách hàng</CardTitle>
                  <button
                    onClick={() => navigate('/clients')}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Xem tất cả →
                  </button>
                </div>
              </CardHeader>
              <CardContent>
                {companies.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">Chưa có khách hàng. Thêm khách hàng đầu tiên.</p>
                    <button
                      onClick={() => navigate('/clients')}
                      className="mt-2 text-sm text-blue-600 hover:underline"
                    >
                      Thêm khách hàng →
                    </button>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {clientStatuses.slice(0, 10).map(({ company, status }) => (
                      <button
                        key={company.id}
                        onClick={() => navigate(`/clients/${company.id}`)}
                        className="flex items-center justify-between w-full py-2.5 text-left hover:bg-gray-50 transition-colors px-1 rounded"
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-900">{company.name}</p>
                          <p className="text-xs text-gray-400">MST: {company.mst}</p>
                        </div>
                        <span className="text-lg">{STATUS_LABELS[status]}</span>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right column */}
          <div className="space-y-4">
            {/* Upcoming deadlines */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-500" />
                  Deadline 7 ngày tới
                </CardTitle>
              </CardHeader>
              <CardContent>
                {upcomingDeadlines.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-2">Không có deadline sắp tới</p>
                ) : (
                  <div className="space-y-2">
                    {upcomingDeadlines.map(item => (
                      <div
                        key={item.id}
                        className="cursor-pointer hover:bg-gray-50 p-1.5 rounded"
                        onClick={() => navigate(`/clients/${item.company_id}`)}
                      >
                        <p className="text-xs font-medium text-gray-800 truncate">{item.name}</p>
                        <p className="text-xs text-red-500">{formatDate(item.due_date)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Notifications */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Thông báo</CardTitle>
              </CardHeader>
              <CardContent>
                {notifications.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-2">Chưa có thông báo</p>
                ) : (
                  <div className="space-y-2">
                    {notifications.slice(0, 5).map((n: { id: string; title: string; content: string; read: boolean; created_at: string }) => (
                      <div key={n.id} className={`p-2 rounded text-xs ${n.read ? 'text-gray-400' : 'text-gray-700 font-medium'}`}>
                        <p>{n.title}</p>
                        <p className="text-gray-400 text-xs mt-0.5">{formatDate(n.created_at)}</p>
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

function Users({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  )
}
