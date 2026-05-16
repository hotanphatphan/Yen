import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Building2, User } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { AccountantLayout, PageHeader } from '@/components/shared/AccountantLayout'
import { Button } from '@/components/shared/Button'
import { Input } from '@/components/shared/Input'
import { Label } from '@/components/shared/Label'
import { Card, CardContent } from '@/components/shared/Card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/shared/Dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/shared/Select'
import { Textarea } from '@/components/shared/Textarea'
import { useCompanies, useCreateCompany } from '@/hooks/useCompanies'
import type { Company } from '@/types'

const schema = z.object({
  name: z.string().min(1, 'Tên công ty là bắt buộc'),
  mst: z.string().min(10, 'MST phải có ít nhất 10 ký tự').max(13),
  business_type: z.enum(['cong_ty', 'ho_kinh_doanh']),
  owner_name: z.string().optional(),
  owner_phone: z.string().optional(),
  owner_email: z.string().email('Email không hợp lệ').optional().or(z.literal('')),
  address: z.string().optional(),
  notes: z.string().optional(),
  vat_rate: z.number().min(0).max(100),
})
type FormData = z.infer<typeof schema>

const TYPE_LABELS: Record<string, string> = {
  cong_ty: 'Công ty',
  ho_kinh_doanh: 'Hộ kinh doanh',
}

export default function ClientsPage() {
  const navigate = useNavigate()
  const { data: companies = [], isLoading } = useCompanies()
  const createCompany = useCreateCompany()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { business_type: 'cong_ty', vat_rate: 10 },
  })

  const businessType = watch('business_type')

  const filtered = companies.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.mst.includes(search)
  )

  async function onSubmit(data: FormData) {
    await createCompany.mutateAsync({
      ...data,
      owner_name: data.owner_name || undefined,
      owner_phone: data.owner_phone || undefined,
      owner_email: data.owner_email || undefined,
      address: data.address || undefined,
      notes: data.notes || undefined,
    })
    reset()
    setOpen(false)
  }

  return (
    <AccountantLayout>
      <PageHeader
        title="Khách hàng"
        subtitle={`${companies.length} khách hàng`}
        actions={
          <Button onClick={() => setOpen(true)} size="sm">
            <Plus className="h-4 w-4" />
            Thêm khách hàng
          </Button>
        }
      />

      <div className="p-6 space-y-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Tìm theo tên hoặc MST..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-gray-400">Đang tải...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Building2 className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p>{search ? 'Không tìm thấy khách hàng' : 'Chưa có khách hàng. Bấm "Thêm khách hàng" để bắt đầu.'}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {filtered.map(company => (
              <ClientCard
                key={company.id}
                company={company}
                onClick={() => navigate(`/clients/${company.id}`)}
              />
            ))}
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Thêm khách hàng mới</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label>Tên công ty / hộ kinh doanh *</Label>
                <Input placeholder="Công ty TNHH ABC" {...register('name')} />
                {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label>Mã số thuế *</Label>
                <Input placeholder="0123456789" {...register('mst')} />
                {errors.mst && <p className="text-xs text-red-500">{errors.mst.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label>Loại hình</Label>
                <Select value={businessType} onValueChange={v => setValue('business_type', v as 'cong_ty' | 'ho_kinh_doanh')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cong_ty">Công ty</SelectItem>
                    <SelectItem value="ho_kinh_doanh">Hộ kinh doanh</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Tên chủ / giám đốc</Label>
                <Input placeholder="Nguyễn Văn A" {...register('owner_name')} />
              </div>

              <div className="space-y-1.5">
                <Label>Số điện thoại</Label>
                <Input placeholder="0901234567" {...register('owner_phone')} />
              </div>

              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" placeholder="owner@company.com" {...register('owner_email')} />
                {errors.owner_email && <p className="text-xs text-red-500">{errors.owner_email.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label>Thuế suất VAT (%)</Label>
                <Input type="number" min="0" max="100" {...register('vat_rate', { valueAsNumber: true })} />
              </div>

              <div className="col-span-2 space-y-1.5">
                <Label>Địa chỉ</Label>
                <Input placeholder="123 Đường ABC, Q1, TP.HCM" {...register('address')} />
              </div>

              <div className="col-span-2 space-y-1.5">
                <Label>Ghi chú</Label>
                <Textarea placeholder="Ghi chú về khách hàng..." {...register('notes')} />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Hủy</Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Đang tạo...' : 'Tạo khách hàng'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </AccountantLayout>
  )
}

function ClientCard({ company, onClick }: { company: Company; onClick: () => void }) {
  return (
    <Card
      className="cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all"
      onClick={onClick}
    >
      <CardContent className="py-4 px-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-blue-100 flex items-center justify-center">
              {company.business_type === 'cong_ty'
                ? <Building2 className="h-4 w-4 text-blue-600" />
                : <User className="h-4 w-4 text-blue-600" />
              }
            </div>
            <div>
              <p className="font-medium text-gray-900">{company.name}</p>
              <p className="text-xs text-gray-400">MST: {company.mst} · {TYPE_LABELS[company.business_type]}</p>
            </div>
          </div>
          <div className="text-right text-xs text-gray-400">
            {company.owner_name && <p>{company.owner_name}</p>}
            {company.owner_phone && <p>{company.owner_phone}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
