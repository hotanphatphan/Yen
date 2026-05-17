import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Building2, User, ChevronRight } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { AccountantLayout, PageHeader } from '@/components/shared/AccountantLayout'
import { Button } from '@/components/shared/Button'
import { Input } from '@/components/shared/Input'
import { Label } from '@/components/shared/Label'
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

// Generate a deterministic vibrant color from company name
function avatarColor(name: string) {
  const colors = [
    'linear-gradient(135deg, #6366F1, #8B5CF6)',
    'linear-gradient(135deg, #F59E0B, #EF4444)',
    'linear-gradient(135deg, #10B981, #3B82F6)',
    'linear-gradient(135deg, #EC4899, #8B5CF6)',
    'linear-gradient(135deg, #0EA5E9, #6366F1)',
    'linear-gradient(135deg, #F97316, #EF4444)',
    'linear-gradient(135deg, #14B8A6, #6366F1)',
  ]
  const idx = Math.abs(name.charCodeAt(0) * 13 + name.charCodeAt(1 % name.length) * 7) % colors.length
  return colors[idx]
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
        subtitle={`${companies.length} khách hàng đang quản lý`}
        actions={
          <Button onClick={() => setOpen(true)} size="sm">
            <Plus className="h-4 w-4" />
            Thêm khách hàng
          </Button>
        }
      />

      <div className="p-6 space-y-5">
        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            placeholder="Tìm theo tên hoặc MST..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-slate-200 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all placeholder:text-slate-400"
          />
        </div>

        {isLoading ? (
          <div className="text-center py-16 text-slate-400">Đang tải...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="mx-auto mb-4 h-20 w-20 rounded-2xl bg-slate-100 flex items-center justify-center">
              <Building2 className="h-10 w-10 text-slate-300" />
            </div>
            <p className="text-slate-400 text-sm">
              {search ? 'Không tìm thấy khách hàng' : 'Chưa có khách hàng. Bấm "Thêm khách hàng" để bắt đầu.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
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
  const initials = company.name
    .split(' ')
    .map(w => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <button
      className="group flex items-center gap-4 bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all duration-200 p-4 text-left w-full"
      onClick={onClick}
    >
      {/* Avatar */}
      <div
        className="h-12 w-12 rounded-xl flex items-center justify-center text-white font-bold text-base shrink-0 shadow-sm"
        style={{ background: avatarColor(company.name) }}
      >
        {initials || (company.business_type === 'cong_ty' ? <Building2 className="h-5 w-5" /> : <User className="h-5 w-5" />)}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-slate-800 group-hover:text-indigo-600 transition-colors truncate">{company.name}</p>
        <p className="text-xs text-slate-400 mt-0.5">
          MST: {company.mst} · <span className="text-slate-500">{TYPE_LABELS[company.business_type]}</span>
        </p>
        {company.owner_name && (
          <p className="text-xs text-slate-400 mt-0.5">{company.owner_name}{company.owner_phone ? ` · ${company.owner_phone}` : ''}</p>
        )}
      </div>

      {/* Arrow */}
      <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-indigo-400 transition-colors shrink-0" />
    </button>
  )
}
