import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Circle } from 'lucide-react'
import { Button } from '@/components/shared/Button'
import { Card, CardContent } from '@/components/shared/Card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/shared/Select'
import { Label } from '@/components/shared/Label'
import { supabase } from '@/lib/supabase'
import { useDocumentRequests } from '@/hooks/useDocuments'
import { useComplianceItems } from '@/hooks/useCompliance'
import { getCurrentQuarter } from '@/lib/utils'
import type { QuarterClosing } from '@/types'

interface Stage {
  key: string
  label: string
  description: string
  auto: boolean
}

const STAGES: Stage[] = [
  { key: 'docs_collected', label: 'Thu thập chứng từ', description: 'Tất cả yêu cầu chứng từ đã được review', auto: true },
  { key: 'bank_reconciled', label: 'Đối chiếu ngân hàng', description: 'Đã đối chiếu xong sao kê ngân hàng', auto: false },
  { key: 'transactions_complete', label: 'Giao dịch đầy đủ', description: 'Đã nhập đủ giao dịch thu/chi', auto: false },
  { key: 'vat_filed', label: 'Nộp VAT', description: 'Đã finalize tờ khai VAT', auto: true },
  { key: 'bctc_generated', label: 'Tạo BCTC', description: 'Đã xuất BCTC và lưu tài liệu', auto: true },
  { key: 'quarter_closed', label: 'Đóng quý', description: 'Xác nhận đóng quý hoàn tất', auto: false },
]

export default function QuarterClosingTab({ companyId }: { companyId: string }) {
  const qc = useQueryClient()
  const { year, quarter } = getCurrentQuarter()
  const [selectedYear, setSelectedYear] = useState(year)
  const [selectedQuarter, setSelectedQuarter] = useState(quarter)

  const { data: closing } = useQuery({
    queryKey: ['quarter-closing', companyId, selectedYear, selectedQuarter],
    queryFn: async () => {
      const { data } = await supabase
        .from('quarter_closings')
        .select('*')
        .eq('company_id', companyId)
        .eq('year', selectedYear)
        .eq('quarter', selectedQuarter)
        .single()
      return data as QuarterClosing | null
    },
  })

  const { data: docRequests = [] } = useDocumentRequests(companyId)
  const { data: complianceItems = [] } = useComplianceItems(companyId)

  const period = `${selectedYear}-Q${selectedQuarter}`

  // Auto-calculate stages
  const docsCollected = docRequests.length > 0 && docRequests.every(r => r.status === 'reviewed')
  const vatFiled = complianceItems.some(c => c.type === 'vat_quarterly' && c.period === period && c.status === 'completed')
  const bctcGenerated = complianceItems.some(c => c.type === 'bctc_annual' && c.status === 'completed')

  const manualStages = closing?.stages ?? { bank_reconciled: false, transactions_complete: false, quarter_closed: false }

  const stageValues: Record<string, boolean> = {
    docs_collected: docsCollected,
    bank_reconciled: manualStages.bank_reconciled,
    transactions_complete: manualStages.transactions_complete,
    vat_filed: vatFiled,
    bctc_generated: bctcGenerated,
    quarter_closed: manualStages.quarter_closed,
  }

  const completedCount = Object.values(stageValues).filter(Boolean).length
  const pct = Math.round((completedCount / 6) * 100)

  const toggleMutation = useMutation({
    mutationFn: async (key: string) => {
      const newStages = {
        ...manualStages,
        [key]: !manualStages[key as keyof typeof manualStages],
      }
      await supabase.from('quarter_closings').upsert({
        company_id: companyId,
        year: selectedYear,
        quarter: selectedQuarter,
        stages: newStages,
        closed_at: newStages.quarter_closed ? new Date().toISOString() : null,
      }, { onConflict: 'company_id,year,quarter' })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quarter-closing', companyId, selectedYear, selectedQuarter] })
    },
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Label>Quý:</Label>
        <Select value={String(selectedQuarter)} onValueChange={v => setSelectedQuarter(Number(v))}>
          <SelectTrigger className="w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[1, 2, 3, 4].map(q => <SelectItem key={q} value={String(q)}>Q{q}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={String(selectedYear)} onValueChange={v => setSelectedYear(Number(v))}>
          <SelectTrigger className="w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[year, year - 1, year - 2].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Progress bar */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Tiến trình đóng quý Q{selectedQuarter}/{selectedYear}</span>
            <span className="text-sm font-bold text-blue-600">{completedCount}/6 hoàn tất</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div
              className={`h-3 rounded-full transition-all ${pct === 100 ? 'bg-green-500' : 'bg-blue-500'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          {pct === 100 && (
            <p className="text-sm text-green-600 font-medium mt-2 text-center">✅ Quý đã đóng hoàn tất!</p>
          )}
        </CardContent>
      </Card>

      {/* Stage list */}
      <div className="space-y-2">
        {STAGES.map((stage, i) => {
          const done = stageValues[stage.key]
          return (
            <Card key={stage.key} className={done ? 'border-green-200' : ''}>
              <CardContent className="py-3 px-4">
                <div className="flex items-center gap-3">
                  <div className="text-2xl font-bold text-gray-300 w-6 text-center">{i + 1}</div>
                  {done
                    ? <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                    : <Circle className="h-5 w-5 text-gray-300 shrink-0" />
                  }
                  <div className="flex-1">
                    <p className={`text-sm font-medium ${done ? 'text-green-800' : 'text-gray-700'}`}>{stage.label}</p>
                    <p className="text-xs text-gray-400">{stage.description}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {stage.auto ? (
                      <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">Tự động</span>
                    ) : (
                      <Button
                        size="sm"
                        variant={done ? 'secondary' : 'outline'}
                        onClick={() => toggleMutation.mutate(stage.key)}
                        disabled={toggleMutation.isPending}
                      >
                        {done ? 'Hoàn tác' : 'Đánh dấu xong'}
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
