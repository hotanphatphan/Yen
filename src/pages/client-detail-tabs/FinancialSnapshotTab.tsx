import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { Card, CardContent } from '@/components/shared/Card'
import { useTransactions } from '@/hooks/useTransactions'
import { useCompany } from '@/hooks/useCompanies'
import { formatVND, getCurrentQuarter } from '@/lib/utils'

function getQuarterRange(year: number, quarter: number) {
  const start = new Date(year, (quarter - 1) * 3, 1).toISOString().split('T')[0]
  const end = new Date(year, quarter * 3, 0).toISOString().split('T')[0]
  return { start, end }
}

export default function FinancialSnapshotTab({ companyId }: { companyId: string }) {
  const { data: company } = useCompany(companyId)
  const { year, quarter } = getCurrentQuarter()

  const prevQ = quarter === 1 ? 4 : quarter - 1
  const prevY = quarter === 1 ? year - 1 : year

  const { start: curStart, end: curEnd } = getQuarterRange(year, quarter)
  const { start: prevStart, end: prevEnd } = getQuarterRange(prevY, prevQ)

  const { data: currentTx = [] } = useTransactions(companyId, { status: 'official', dateFrom: curStart, dateTo: curEnd })
  const { data: prevTx = [] } = useTransactions(companyId, { status: 'official', dateFrom: prevStart, dateTo: prevEnd })

  const curRevenue = currentTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const curExpense = currentTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const curNet = curRevenue - curExpense
  const curVAT = Math.round(curRevenue * (company?.vat_rate ?? 10) / 100)

  const prevRevenue = prevTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const prevExpense = prevTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const prevNet = prevRevenue - prevExpense

  function pct(cur: number, prev: number) {
    if (prev === 0) return null
    return ((cur - prev) / prev) * 100
  }

  const metrics = [
    { label: 'Doanh thu', value: curRevenue, prev: prevRevenue, color: 'text-green-600' },
    { label: 'Chi phí', value: curExpense, prev: prevExpense, color: 'text-red-600' },
    { label: 'Lãi/lỗ ròng', value: curNet, prev: prevNet, color: curNet >= 0 ? 'text-green-600' : 'text-red-600' },
    { label: 'VAT ước tính', value: curVAT, prev: null, color: 'text-blue-600' },
  ]

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Quý {quarter}/{year} so với Quý {prevQ}/{prevY}
      </p>
      <div className="grid grid-cols-2 gap-4">
        {metrics.map(({ label, value, prev, color }) => {
          const change = prev !== null ? pct(value, prev) : null
          return (
            <Card key={label}>
              <CardContent className="py-5">
                <p className="text-sm text-gray-500">{label}</p>
                <p className={`text-2xl font-bold mt-1 ${color}`}>{formatVND(Math.abs(value))}</p>
                {change !== null && (
                  <div className="flex items-center gap-1 mt-2">
                    {change > 0 ? (
                      <TrendingUp className="h-3.5 w-3.5 text-green-500" />
                    ) : change < 0 ? (
                      <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                    ) : (
                      <Minus className="h-3.5 w-3.5 text-gray-400" />
                    )}
                    <span className={`text-xs font-medium ${change > 0 ? 'text-green-600' : change < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                      {change > 0 ? '+' : ''}{change.toFixed(1)}% so với quý trước
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
