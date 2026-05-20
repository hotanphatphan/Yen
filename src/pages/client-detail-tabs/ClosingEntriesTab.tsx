import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, BookOpen } from 'lucide-react'
import { Button } from '@/components/shared/Button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/shared/Dialog'
import { supabase } from '@/lib/supabase'
import { COMMON_ACCOUNTS, getAccountName } from '@/lib/accountSuggestion'
import { cn } from '@/lib/utils'
import type { JournalEntry } from '@/types'

const fmt = (n: number) => new Intl.NumberFormat('vi-VN').format(n)

const TYPE_LABELS: Record<string, string> = {
  closing: 'Đóng sổ',
  adjustment: 'Điều chỉnh',
  accrual: 'Trích trước',
  invoice: 'Hóa đơn',
}

const TYPE_COLORS: Record<string, string> = {
  closing: 'bg-purple-50 text-purple-700 border-purple-200',
  adjustment: 'bg-blue-50 text-blue-700 border-blue-200',
  accrual: 'bg-amber-50 text-amber-700 border-amber-200',
  invoice: 'bg-green-50 text-green-700 border-green-200',
}

// Common closing entry templates
const TEMPLATES = [
  {
    label: 'Phân bổ chi phí trả trước',
    type: 'adjustment',
    debitAccount: '642',
    creditAccount: '142',
  },
  {
    label: 'Trích khấu hao TSCĐ',
    type: 'accrual',
    debitAccount: '642',
    creditAccount: '214',
  },
  {
    label: 'Trích trước chi phí lương',
    type: 'accrual',
    debitAccount: '642',
    creditAccount: '335',
  },
  {
    label: 'Phân bổ công cụ dụng cụ',
    type: 'adjustment',
    debitAccount: '627',
    creditAccount: '153',
  },
  {
    label: 'Điều chỉnh VAT đầu vào',
    type: 'adjustment',
    debitAccount: '133',
    creditAccount: '642',
  },
]

interface FormState {
  date: string
  description: string
  type: string
  debitAccount: string
  creditAccount: string
  amount: string
  vatDebitAccount: string
  vatCreditAccount: string
  vatAmount: string
  notes: string
}

const DEFAULT_FORM: FormState = {
  date: new Date().toISOString().split('T')[0],
  description: '',
  type: 'closing',
  debitAccount: '642',
  creditAccount: '112',
  amount: '',
  vatDebitAccount: '',
  vatCreditAccount: '',
  vatAmount: '',
  notes: '',
}

export default function ClosingEntriesTab({ companyId }: { companyId: string }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<FormState>(DEFAULT_FORM)
  const [filterType, setFilterType] = useState<string>('all')

  const { data: entries = [], isLoading } = useQuery<JournalEntry[]>({
    queryKey: ['journal-entries', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('journal_entries')
        .select('*')
        .eq('company_id', companyId)
        .order('date', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })

  const createMutation = useMutation({
    mutationFn: async (f: FormState) => {
      const amount = parseInt(f.amount.replace(/[^0-9]/g, '')) || 0
      const vatAmount = parseInt(f.vatAmount.replace(/[^0-9]/g, '')) || 0
      const { error } = await supabase.from('journal_entries').insert({
        company_id: companyId,
        date: f.date,
        description: f.description,
        type: f.type,
        debit_account: f.debitAccount,
        credit_account: f.creditAccount,
        amount,
        vat_debit_account: f.vatDebitAccount || null,
        vat_credit_account: f.vatCreditAccount || null,
        vat_amount: vatAmount,
        notes: f.notes || null,
        status: 'posted',
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journal-entries', companyId] })
      setOpen(false)
      setForm(DEFAULT_FORM)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('journal_entries').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['journal-entries', companyId] }),
  })

  const set = (key: keyof FormState) => (
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value }))
  )

  const filtered = filterType === 'all' ? entries : entries.filter(e => e.type === filterType)

  const totalDebit = filtered.reduce((s, e) => s + e.amount + e.vat_amount, 0)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-slate-700">Bút toán điều chỉnh & đóng sổ</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Nhập bút toán thủ công: phân bổ, trích trước, điều chỉnh, đóng quý
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" />
          Thêm bút toán
        </Button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {['all', 'closing', 'adjustment', 'accrual', 'invoice'].map(t => (
          <button
            key={t}
            onClick={() => setFilterType(t)}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-medium transition-colors',
              filterType === t
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            )}
          >
            {t === 'all' ? 'Tất cả' : TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Summary */}
      {filtered.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
            <p className="text-xs text-slate-400">Số bút toán</p>
            <p className="font-bold text-slate-700">{filtered.length}</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
            <p className="text-xs text-slate-400">Tổng phát sinh nợ</p>
            <p className="font-bold font-mono text-slate-700">{fmt(totalDebit)}</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
            <p className="text-xs text-slate-400">Tổng phát sinh có</p>
            <p className="font-bold font-mono text-slate-700">{fmt(totalDebit)}</p>
          </div>
        </div>
      )}

      {/* Entries list */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        {isLoading ? (
          <div className="py-12 text-center text-slate-400 text-sm">Đang tải...</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <BookOpen className="h-8 w-8 mx-auto text-slate-200" />
            <p className="text-slate-400 text-sm">Chưa có bút toán nào</p>
            <button
              onClick={() => setOpen(true)}
              className="text-indigo-500 text-sm hover:underline"
            >
              Thêm bút toán đầu tiên
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-slate-400">
                <th className="text-left px-5 py-3 font-medium">Ngày</th>
                <th className="text-left px-4 py-3 font-medium">Diễn giải</th>
                <th className="text-left px-4 py-3 font-medium">Loại</th>
                <th className="text-center px-4 py-3 font-medium">Nợ TK</th>
                <th className="text-center px-4 py-3 font-medium">Có TK</th>
                <th className="text-right px-4 py-3 font-medium">Số tiền</th>
                <th className="text-right px-5 py-3 font-medium">VAT</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(entry => (
                <tr key={entry.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3 text-slate-500 whitespace-nowrap text-xs">
                    {new Date(entry.date).toLocaleDateString('vi-VN')}
                  </td>
                  <td className="px-4 py-3 max-w-[200px]">
                    <p className="text-slate-700 truncate font-medium">{entry.description}</p>
                    {entry.notes && (
                      <p className="text-xs text-slate-400 truncate">{entry.notes}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      'px-2 py-0.5 rounded-full text-xs border',
                      TYPE_COLORS[entry.type ?? ''] ?? 'bg-slate-50 text-slate-500 border-slate-200'
                    )}>
                      {TYPE_LABELS[entry.type ?? ''] ?? entry.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="px-2 py-0.5 rounded bg-red-50 text-red-700 font-mono text-xs font-bold">
                      {entry.debit_account}
                    </span>
                    <p className="text-xs text-slate-400 mt-0.5 hidden md:block">
                      {getAccountName(entry.debit_account)}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-mono text-xs font-bold">
                      {entry.credit_account}
                    </span>
                    <p className="text-xs text-slate-400 mt-0.5 hidden md:block">
                      {getAccountName(entry.credit_account)}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-slate-800">
                    {fmt(entry.amount)}
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-slate-400 text-xs">
                    {entry.vat_amount > 0 ? fmt(entry.vat_amount) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => {
                        if (confirm('Xóa bút toán này?')) deleteMutation.mutate(entry.id)
                      }}
                      className="text-slate-300 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Thêm bút toán</DialogTitle>
          </DialogHeader>

          {/* Templates */}
          <div>
            <p className="text-xs text-slate-400 mb-2">Dùng mẫu có sẵn:</p>
            <div className="flex flex-wrap gap-2">
              {TEMPLATES.map(t => (
                <button
                  key={t.label}
                  onClick={() => setForm(f => ({
                    ...f,
                    description: t.label,
                    type: t.type,
                    debitAccount: t.debitAccount,
                    creditAccount: t.creditAccount,
                  }))}
                  className="text-xs px-2.5 py-1 rounded-full border border-slate-200
                    hover:border-indigo-300 hover:bg-indigo-50 text-slate-600 transition-colors"
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            {/* Date + Type */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Ngày</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={set('date')}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2
                    focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Loại bút toán</label>
                <select
                  value={form.type}
                  onChange={set('type')}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2
                    focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
                >
                  <option value="closing">Đóng sổ</option>
                  <option value="adjustment">Điều chỉnh</option>
                  <option value="accrual">Trích trước</option>
                </select>
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Diễn giải *</label>
              <input
                type="text"
                value={form.description}
                onChange={set('description')}
                placeholder="Mô tả bút toán..."
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2
                  focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>

            {/* Debit / Credit accounts */}
            <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-2.5 bg-slate-50">
                <span className="w-8 text-xs font-bold text-red-500">Nợ</span>
                <select
                  value={form.debitAccount}
                  onChange={set('debitAccount')}
                  className="flex-1 bg-transparent text-sm focus:outline-none text-slate-700"
                >
                  {COMMON_ACCOUNTS.map(a => (
                    <option key={a.code} value={a.code}>{a.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-3 px-4 py-2.5">
                <span className="w-8 text-xs font-bold text-blue-500">Có</span>
                <select
                  value={form.creditAccount}
                  onChange={set('creditAccount')}
                  className="flex-1 bg-transparent text-sm focus:outline-none text-slate-700"
                >
                  {COMMON_ACCOUNTS.map(a => (
                    <option key={a.code} value={a.code}>{a.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Amount */}
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Số tiền (VNĐ) *</label>
              <input
                type="text"
                value={form.amount}
                onChange={set('amount')}
                placeholder="0"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2
                  focus:outline-none focus:ring-2 focus:ring-indigo-400 font-mono"
              />
            </div>

            {/* Optional VAT */}
            <details className="text-sm">
              <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-600">
                + Thêm dòng VAT (không bắt buộc)
              </summary>
              <div className="mt-2 space-y-2">
                <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-2.5 bg-slate-50">
                    <span className="w-8 text-xs font-bold text-red-500">Nợ</span>
                    <select value={form.vatDebitAccount} onChange={set('vatDebitAccount')}
                      className="flex-1 bg-transparent text-sm focus:outline-none text-slate-700">
                      <option value="">— Không có —</option>
                      {COMMON_ACCOUNTS.map(a => <option key={a.code} value={a.code}>{a.label}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center gap-3 px-4 py-2.5">
                    <span className="w-8 text-xs font-bold text-blue-500">Có</span>
                    <select value={form.vatCreditAccount} onChange={set('vatCreditAccount')}
                      className="flex-1 bg-transparent text-sm focus:outline-none text-slate-700">
                      <option value="">— Không có —</option>
                      {COMMON_ACCOUNTS.map(a => <option key={a.code} value={a.code}>{a.label}</option>)}
                    </select>
                  </div>
                </div>
                <input
                  type="text"
                  value={form.vatAmount}
                  onChange={set('vatAmount')}
                  placeholder="Số tiền VAT"
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2
                    focus:outline-none focus:ring-2 focus:ring-indigo-400 font-mono"
                />
              </div>
            </details>

            {/* Notes */}
            <textarea
              value={form.notes}
              onChange={set('notes')}
              placeholder="Ghi chú (không bắt buộc)"
              rows={2}
              className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2
                focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
            />
          </div>

          <div className="flex gap-2 justify-end pt-1">
            <Button variant="ghost" onClick={() => setOpen(false)}>Hủy</Button>
            <Button
              onClick={() => createMutation.mutate(form)}
              disabled={!form.description || !form.amount || createMutation.isPending}
            >
              {createMutation.isPending ? 'Đang lưu...' : 'Lưu bút toán'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
