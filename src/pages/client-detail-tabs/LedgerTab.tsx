import { useState } from 'react'
import { Plus, Trash2, ArrowDownCircle, ArrowUpCircle } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/shared/Button'
import { Input } from '@/components/shared/Input'
import { Label } from '@/components/shared/Label'
import { Card, CardContent } from '@/components/shared/Card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/shared/Dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/shared/Select'
import { VNDInput } from '@/components/shared/VNDInput'
import { Badge } from '@/components/shared/Badge'
import { useTransactions, useCategories, useCreateTransaction, useDeleteTransaction } from '@/hooks/useTransactions'
import { formatDate, formatVND } from '@/lib/utils'
import type { TransactionType } from '@/types'

const schema = z.object({
  date: z.string().min(1, 'Ngày bắt buộc'),
  type: z.enum(['income', 'expense']),
  amount: z.number().min(1, 'Số tiền phải > 0'),
  vat_amount: z.number().min(0),
  category_id: z.string().optional(),
  description: z.string().optional(),
  invoice_number: z.string().optional(),
  counterparty: z.string().optional(),
})
type FormData = z.infer<typeof schema>

export default function LedgerTab({ companyId }: { companyId: string }) {
  const [open, setOpen] = useState(false)
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [amount, setAmount] = useState(0)
  const [vatAmount, setVatAmount] = useState(0)

  const { data: transactions = [] } = useTransactions(companyId, {
    status: 'official',
    type: filterType === 'all' ? undefined : filterType,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  })
  const { data: categories = [] } = useCategories(companyId)
  const createTransaction = useCreateTransaction()
  const deleteTransaction = useDeleteTransaction()

  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { type: 'income', amount: 0, vat_amount: 0, date: new Date().toISOString().split('T')[0] },
  })
  const type = watch('type')

  const filteredCategories = categories.filter(c => c.type === type)

  const totalIncome = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const totalExpense = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const net = totalIncome - totalExpense

  async function onSubmit(data: FormData) {
    await createTransaction.mutateAsync({
      company_id: companyId,
      date: data.date,
      type: data.type,
      amount: data.amount,
      vat_amount: data.vat_amount,
      category_id: data.category_id || null,
      account_id: null,
      description: data.description || null,
      attachment_path: null,
      status: 'official',
      source: 'manual',
      invoice_number: data.invoice_number || null,
      counterparty: data.counterparty || null,
      bank_transaction_id: null,
      needs_review: false,
    })
    reset()
    setAmount(0)
    setVatAmount(0)
    setOpen(false)
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Tổng thu', value: totalIncome, color: 'text-green-600' },
          { label: 'Tổng chi', value: totalExpense, color: 'text-red-600' },
          { label: 'Lãi/lỗ ròng', value: net, color: net >= 0 ? 'text-green-600' : 'text-red-600' },
        ].map(({ label, value, color }) => (
          <Card key={label}>
            <CardContent className="py-4">
              <p className="text-xs text-gray-500">{label}</p>
              <p className={`text-xl font-bold mt-1 ${color}`}>{formatVND(value)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1">
          {(['all', 'income', 'expense'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilterType(f)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                filterType === f ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f === 'all' ? 'Tất cả' : f === 'income' ? 'Thu' : 'Chi'}
            </button>
          ))}
        </div>
        <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-36 text-xs" placeholder="Từ ngày" />
        <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-36 text-xs" placeholder="Đến ngày" />
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Thêm giao dịch
        </Button>
      </div>

      {/* Transaction list */}
      {transactions.length === 0 ? (
        <Card>
          <CardContent className="text-center py-8 text-gray-400 text-sm">
            Chưa có giao dịch nào
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-1">
          {transactions.map(tx => (
            <div key={tx.id} className="flex items-center gap-3 p-3 rounded-md border border-gray-100 hover:bg-gray-50">
              {tx.type === 'income'
                ? <ArrowDownCircle className="h-5 w-5 text-green-500 shrink-0" />
                : <ArrowUpCircle className="h-5 w-5 text-red-500 shrink-0" />
              }
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900 truncate">{tx.description || tx.counterparty || '—'}</span>
                  {tx.categories && <Badge variant="secondary" className="text-xs">{tx.categories.name}</Badge>}
                </div>
                <div className="flex gap-3 text-xs text-gray-400 mt-0.5">
                  <span>{formatDate(tx.date)}</span>
                  {tx.invoice_number && <span>HĐ: {tx.invoice_number}</span>}
                  {tx.counterparty && <span>{tx.counterparty}</span>}
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className={`font-medium text-sm ${tx.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                  {tx.type === 'income' ? '+' : '-'}{formatVND(tx.amount)}
                </p>
                {tx.vat_amount > 0 && <p className="text-xs text-gray-400">VAT: {formatVND(tx.vat_amount)}</p>}
              </div>
              <button
                onClick={() => deleteTransaction.mutate({ id: tx.id, company_id: companyId })}
                className="p-1 text-gray-300 hover:text-red-500 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Thêm giao dịch</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(d => onSubmit({ ...d, amount, vat_amount: vatAmount }))} className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Loại</Label>
                <Select value={type} onValueChange={v => setValue('type', v as TransactionType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="income">Thu</SelectItem>
                    <SelectItem value="expense">Chi</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Ngày *</Label>
                <Input type="date" {...register('date')} />
                {errors.date && <p className="text-xs text-red-500">{errors.date.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Số tiền (chưa VAT) *</Label>
                <VNDInput value={amount} onChange={setAmount} placeholder="0" />
                {errors.amount && <p className="text-xs text-red-500">{errors.amount.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Tiền VAT</Label>
                <VNDInput value={vatAmount} onChange={setVatAmount} placeholder="0" />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Danh mục</Label>
                <Select onValueChange={v => setValue('category_id', v)}>
                  <SelectTrigger><SelectValue placeholder="Chọn danh mục" /></SelectTrigger>
                  <SelectContent>
                    {filteredCategories.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Số hóa đơn</Label>
                <Input placeholder="0001234" {...register('invoice_number')} />
              </div>
              <div className="space-y-1.5">
                <Label>Người bán/mua</Label>
                <Input placeholder="Tên công ty/cá nhân" {...register('counterparty')} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Mô tả</Label>
                <Input placeholder="Mô tả giao dịch..." {...register('description')} />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Hủy</Button>
              <Button type="submit" disabled={isSubmitting || amount === 0}>Thêm</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
