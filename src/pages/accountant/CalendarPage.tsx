import { useNavigate } from 'react-router-dom'
import { Calendar as CalendarIcon } from 'lucide-react'
import { AccountantLayout, PageHeader } from '@/components/shared/AccountantLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/shared/Card'
import { useAllComplianceItems } from '@/hooks/useCompliance'
import { formatDate, daysUntil } from '@/lib/utils'
import { Badge } from '@/components/shared/Badge'

export default function CalendarPage() {
  const navigate = useNavigate()
  const { data: allCompliance = [] } = useAllComplianceItems()

  const upcoming = allCompliance
    .filter(c => c.status !== 'completed')
    .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())

  const grouped: Record<string, typeof upcoming> = {}
  upcoming.forEach(item => {
    const month = item.due_date.substring(0, 7)
    if (!grouped[month]) grouped[month] = []
    grouped[month].push(item)
  })

  return (
    <AccountantLayout>
      <PageHeader title="Lịch deadline" subtitle="Tất cả deadline compliance của tất cả khách hàng" />

      <div className="p-6 space-y-6">
        {Object.keys(grouped).length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <CalendarIcon className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p>Không có deadline nào</p>
          </div>
        ) : (
          Object.entries(grouped).map(([month, items]) => {
            const [year, m] = month.split('-')
            const monthName = new Date(Number(year), Number(m) - 1, 1).toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' })
            return (
              <Card key={month}>
                <CardHeader>
                  <CardTitle className="text-base capitalize">{monthName}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {items.map(item => {
                      const days = daysUntil(item.due_date)
                      const isUrgent = days <= 7 && days >= 0
                      const isOverdueItem = days < 0
                      return (
                        <div
                          key={item.id}
                          className="flex items-center justify-between p-3 rounded-md border border-gray-100 hover:bg-gray-50 cursor-pointer"
                          onClick={() => navigate(`/clients/${item.company_id}`)}
                        >
                          <div>
                            <p className="text-sm font-medium text-gray-900">{item.name}</p>
                            <p className="text-xs text-gray-400">
                              {(item as typeof item & { companies?: { name: string } }).companies?.name ?? ''} · {formatDate(item.due_date)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={isOverdueItem ? 'destructive' : isUrgent ? 'warning' : 'secondary'}
                            >
                              {isOverdueItem ? `Quá hạn ${Math.abs(days)} ngày` : days === 0 ? 'Hôm nay' : `${days} ngày nữa`}
                            </Badge>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>
    </AccountantLayout>
  )
}
