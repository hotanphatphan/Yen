import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/shared/Card'
import { Badge } from '@/components/shared/Badge'
import type { Account, AccountType } from '@/types'

const TYPE_LABELS: Record<AccountType, string> = {
  asset: 'Tài sản',
  liability: 'Nợ phải trả',
  equity: 'Vốn chủ sở hữu',
  revenue: 'Doanh thu',
  expense: 'Chi phí',
}

const TYPE_COLORS: Record<AccountType, 'default' | 'success' | 'warning' | 'secondary' | 'destructive'> = {
  asset: 'default',
  liability: 'warning',
  equity: 'secondary',
  revenue: 'success',
  expense: 'destructive',
}

export default function ChartOfAccountsTab({ companyId }: { companyId: string }) {
  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['accounts', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('company_id', companyId)
        .order('code')
      if (error) throw error
      return data as Account[]
    },
  })

  const grouped = accounts.reduce<Record<AccountType, Account[]>>((acc, a) => {
    if (!acc[a.type]) acc[a.type] = []
    acc[a.type].push(a)
    return acc
  }, {} as Record<AccountType, Account[]>)

  if (isLoading) return <div className="text-center py-8 text-gray-400">Đang tải...</div>

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Hệ thống tài khoản kế toán theo Thông tư 99. Mỗi giao dịch được map vào tài khoản tương ứng khi được phân loại danh mục.
      </p>
      {(Object.keys(TYPE_LABELS) as AccountType[]).map(type => {
        const accs = grouped[type] ?? []
        if (accs.length === 0) return null
        return (
          <Card key={type}>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Badge variant={TYPE_COLORS[type]}>{TYPE_LABELS[type]}</Badge>
                <span className="text-gray-400 text-xs">{accs.length} tài khoản</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="divide-y divide-gray-50">
                {accs.map(a => (
                  <div key={a.id} className={`flex items-center gap-3 py-2 ${a.parent_code ? 'pl-4' : ''}`}>
                    <span className="font-mono text-sm text-blue-700 w-14 shrink-0">{a.code}</span>
                    <span className="text-sm text-gray-800 flex-1">{a.name}</span>
                    {a.is_system && <Badge variant="secondary" className="text-xs">Hệ thống</Badge>}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
