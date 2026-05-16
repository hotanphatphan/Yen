import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/shared/Button'
import { Input } from '@/components/shared/Input'
import { Label } from '@/components/shared/Label'
import { Card, CardContent } from '@/components/shared/Card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/shared/Dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/shared/Select'
import { ComplianceBadge } from '@/components/shared/StatusBadge'
import { useComplianceItems, useCreateComplianceItem, useUpdateComplianceStatus, useDeleteComplianceItem } from '@/hooks/useCompliance'
import { formatDate, isOverdue } from '@/lib/utils'
import type { ComplianceStatus, ComplianceType } from '@/types'

const schema = z.object({
  name: z.string().min(1, 'Tên bắt buộc'),
  type: z.enum(['vat_quarterly', 'payroll_monthly', 'bctc_annual', 'custom']),
  period: z.string().min(1, 'Kỳ bắt buộc'),
  due_date: z.string().min(1, 'Ngày hạn bắt buộc'),
  notes: z.string().optional(),
})
type FormData = z.infer<typeof schema>

const TYPE_LABELS: Record<ComplianceType, string> = {
  vat_quarterly: 'VAT (Quý)',
  payroll_monthly: 'Lương (Tháng)',
  bctc_annual: 'BCTC (Năm)',
  custom: 'Khác',
}

const STATUS_NEXT: Record<ComplianceStatus, ComplianceStatus | null> = {
  not_started: 'in_progress',
  in_progress: 'completed',
  completed: null,
  overdue: 'in_progress',
}

export default function ComplianceTab({ companyId }: { companyId: string }) {
  const { data: items = [], isLoading } = useComplianceItems(companyId)
  const createItem = useCreateComplianceItem()
  const updateStatus = useUpdateComplianceStatus()
  const deleteItem = useDeleteComplianceItem()
  const [open, setOpen] = useState(false)

  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { type: 'custom' },
  })
  const type = watch('type')

  const enrichedItems = items.map(item => ({
    ...item,
    effectiveStatus: (item.status !== 'completed' && isOverdue(item.due_date) ? 'overdue' : item.status) as ComplianceStatus,
  }))

  async function onSubmit(data: FormData) {
    await createItem.mutateAsync({
      company_id: companyId,
      type: data.type,
      name: data.name,
      period: data.period,
      due_date: data.due_date,
      status: 'not_started',
      notes: data.notes || null,
    })
    reset()
    setOpen(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-medium text-gray-900">Các đầu mục compliance</h3>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Thêm mục
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-gray-400">Đang tải...</div>
      ) : enrichedItems.length === 0 ? (
        <Card>
          <CardContent className="text-center py-8 text-gray-400">
            Chưa có mục compliance nào
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {enrichedItems.map(item => {
            const nextStatus = STATUS_NEXT[item.effectiveStatus]
            return (
              <Card key={item.id} className={item.effectiveStatus === 'overdue' ? 'border-red-200' : ''}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-gray-900">{item.name}</span>
                        <span className="text-xs text-gray-400">{TYPE_LABELS[item.type]}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-gray-500">Kỳ: {item.period}</span>
                        <span className={`text-xs ${item.effectiveStatus === 'overdue' ? 'text-red-500 font-medium' : 'text-gray-500'}`}>
                          Hạn: {formatDate(item.due_date)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <ComplianceBadge status={item.effectiveStatus} />
                      {nextStatus && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateStatus.mutate({ id: item.id, company_id: companyId, status: nextStatus })}
                        >
                          {nextStatus === 'in_progress' ? 'Bắt đầu' : 'Hoàn tất'}
                        </Button>
                      )}
                      <button
                        onClick={() => deleteItem.mutate({ id: item.id, company_id: companyId })}
                        className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Thêm mục compliance</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Loại</Label>
              <Select value={type} onValueChange={v => setValue('type', v as ComplianceType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tên mục</Label>
              <Input placeholder="VD: Khai thuế VAT Q2/2026" {...register('name')} />
              {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Kỳ</Label>
                <Input placeholder="VD: 2026-Q2" {...register('period')} />
                {errors.period && <p className="text-xs text-red-500">{errors.period.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Ngày hạn</Label>
                <Input type="date" {...register('due_date')} />
                {errors.due_date && <p className="text-xs text-red-500">{errors.due_date.message}</p>}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Hủy</Button>
              <Button type="submit" disabled={isSubmitting}>Thêm</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
