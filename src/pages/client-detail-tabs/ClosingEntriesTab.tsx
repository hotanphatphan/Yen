import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, BookOpen, X, FileSpreadsheet } from 'lucide-react'
import { Button } from '@/components/shared/Button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/shared/Dialog'
import { supabase } from '@/lib/supabase'
import { COMMON_ACCOUNTS, getAccountName } from '@/lib/accountSuggestion'
import { cn } from '@/lib/utils'
import type { JournalEntry } from '@/types'
import { downloadExcel, vnDate } from '@/lib/excelExport'

const fmt = (n: number) => new Intl.NumberFormat('vi-VN').format(n)
const digits = (s: string) => s.replace(/[^0-9]/g, '')
const toNum = (s: string) => parseInt(digits(s) || '0', 10)

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

// Mẫu bút toán thường dùng (1 dòng Nợ - 1 dòng Có)
const TEMPLATES = [
  { label: 'Phân bổ chi phí trả trước', type: 'adjustment', debit: '642', credit: '142' },
  { label: 'Trích khấu hao TSCĐ', type: 'accrual', debit: '642', credit: '214' },
  { label: 'Trích trước chi phí lương', type: 'accrual', debit: '642', credit: '335' },
  { label: 'Phân bổ công cụ dụng cụ', type: 'adjustment', debit: '627', credit: '153' },
  { label: 'Điều chỉnh VAT đầu vào', type: 'adjustment', debit: '133', credit: '642' },
]

interface Line {
  account: string
  amount: string // chỉ chứa chữ số
}

interface FormState {
  date: string
  description: string
  type: string
  notes: string
  debits: Line[]
  credits: Line[]
}

const emptyForm = (): FormState => ({
  date: new Date().toISOString().split('T')[0],
  description: '',
  type: 'closing',
  notes: '',
  debits: [{ account: '642', amount: '' }],
  credits: [{ account: '112', amount: '' }],
})

// Gộp các dòng lệch nhau thành các cặp Nợ/Có để lưu (tổng Nợ = tổng Có nên luôn chia hết)
function pairLines(debits: { account: string; amount: number }[], credits: { account: string; amount: number }[]) {
  const d = debits.map(x => ({ ...x }))
  const c = credits.map(x => ({ ...x }))
  const pairs: { debit: string; credit: string; amount: number }[] = []
  let i = 0, j = 0
  while (i < d.length && j < c.length) {
    const m = Math.min(d[i].amount, c[j].amount)
    if (m > 0) pairs.push({ debit: d[i].account, credit: c[j].account, amount: m })
    d[i].amount -= m
    c[j].amount -= m
    if (d[i].amount === 0) i++
    if (c[j].amount === 0) j++
  }
  return pairs
}

// Gom các dòng cùng bút toán (group_id) để hiển thị lại dạng nhiều dòng
interface GroupedEntry {
  key: string
  ids: string[]
  date: string
  description: string | null
  notes: string | null
  type: string | null
  debitLines: { account: string; amount: number }[]
  creditLines: { account: string; amount: number }[]
  total: number
}

function groupEntries(entries: JournalEntry[]): GroupedEntry[] {
  const map = new Map<string, JournalEntry[]>()
  for (const e of entries) {
    const key = e.group_id ?? e.id
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(e)
  }
  const result: GroupedEntry[] = []
  for (const [key, rows] of map) {
    const debitMap = new Map<string, number>()
    const creditMap = new Map<string, number>()
    const add = (m: Map<string, number>, acc: string, amt: number) =>
      m.set(acc, (m.get(acc) ?? 0) + amt)
    for (const r of rows) {
      if (r.amount > 0) {
        add(debitMap, r.debit_account, r.amount)
        add(creditMap, r.credit_account, r.amount)
      }
      if (r.vat_amount > 0) {
        if (r.vat_debit_account) add(debitMap, r.vat_debit_account, r.vat_amount)
        if (r.vat_credit_account) add(creditMap, r.vat_credit_account, r.vat_amount)
      }
    }
    const debitLines = [...debitMap.entries()].map(([account, amount]) => ({ account, amount }))
    const total = debitLines.reduce((s, l) => s + l.amount, 0)
    result.push({
      key,
      ids: rows.map(r => r.id),
      date: rows[0].date,
      description: rows[0].description,
      notes: rows[0].notes,
      type: rows[0].type,
      debitLines,
      creditLines: [...creditMap.entries()].map(([account, amount]) => ({ account, amount })),
      total,
    })
  }
  return result.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}

export default function ClosingEntriesTab({ companyId }: { companyId: string }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm())
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

  // Danh mục tài khoản của công ty (gồm tk con) để gợi ý gõ tay
  const { data: dbAccounts = [] } = useQuery({
    queryKey: ['accounts', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('accounts')
        .select('code, name').eq('company_id', companyId).order('code')
      if (error) throw error
      return data as { code: string; name: string }[]
    },
  })

  const accountOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const a of COMMON_ACCOUNTS) map.set(a.code, a.name)
    for (const a of dbAccounts) map.set(a.code, a.name)
    return [...map.entries()].map(([code, name]) => ({ code, name }))
      .sort((x, y) => x.code.localeCompare(y.code))
  }, [dbAccounts])

  const createMutation = useMutation({
    mutationFn: async (f: FormState) => {
      const debits = f.debits.map(l => ({ account: l.account.trim(), amount: toNum(l.amount) }))
        .filter(l => l.account && l.amount > 0)
      const credits = f.credits.map(l => ({ account: l.account.trim(), amount: toNum(l.amount) }))
        .filter(l => l.account && l.amount > 0)
      const pairs = pairLines(debits, credits)
      const groupId = crypto.randomUUID()
      const rows = pairs.map(p => ({
        company_id: companyId,
        date: f.date,
        description: f.description,
        type: f.type,
        debit_account: p.debit,
        credit_account: p.credit,
        amount: p.amount,
        vat_debit_account: null,
        vat_credit_account: null,
        vat_amount: 0,
        notes: f.notes || null,
        status: 'posted',
        group_id: groupId,
      }))
      const { error } = await supabase.from('journal_entries').insert(rows)
      if (error) throw error

      // Ghi nhớ tk con mới gõ tay vào danh mục để lần sau tự gợi ý
      const known = new Set(dbAccounts.map(a => a.code))
      const newCodes = [...new Set([...debits, ...credits].map(l => l.account))]
        .filter(c => c && !known.has(c) && !COMMON_ACCOUNTS.some(a => a.code === c))
      if (newCodes.length > 0) {
        const newRows = newCodes.map(code => {
          const parentCode = code.length > 3 ? code.slice(0, 3) : null
          const parent = dbAccounts.find(a => a.code === parentCode)
          return {
            company_id: companyId,
            code,
            name: getAccountName(code) !== code ? getAccountName(code)
              : parent ? `${parent.name} (${code})` : `Tài khoản ${code}`,
            type: 'expense',
            parent_code: parent ? parentCode : null,
          }
        })
        try {
          await supabase.from('accounts').upsert(newRows, { onConflict: 'company_id,code', ignoreDuplicates: true })
        } catch { /* ghi nhớ là phụ */ }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journal-entries', companyId] })
      queryClient.invalidateQueries({ queryKey: ['accounts', companyId] })
      setOpen(false)
      setForm(emptyForm())
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from('journal_entries').delete().in('id', ids)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['journal-entries', companyId] }),
  })

  // Helpers chỉnh form
  const setField = (key: 'date' | 'description' | 'type' | 'notes') =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value }))

  const setLine = (side: 'debits' | 'credits', idx: number, key: keyof Line, value: string) =>
    setForm(f => ({
      ...f,
      [side]: f[side].map((l, i) => i === idx
        ? { ...l, [key]: key === 'amount' ? digits(value) : value } : l),
    }))

  const addLine = (side: 'debits' | 'credits') =>
    setForm(f => ({ ...f, [side]: [...f[side], { account: '', amount: '' }] }))

  const removeLine = (side: 'debits' | 'credits', idx: number) =>
    setForm(f => ({ ...f, [side]: f[side].filter((_, i) => i !== idx) }))

  const filtered = filterType === 'all' ? entries : entries.filter(e => e.type === filterType)
  const grouped = useMemo(() => groupEntries(filtered), [filtered])
  const totalDebit = grouped.reduce((s, g) => s + g.total, 0)

  const sumDebit = form.debits.reduce((s, l) => s + toNum(l.amount), 0)
  const sumCredit = form.credits.reduce((s, l) => s + toNum(l.amount), 0)
  const balanced = sumDebit > 0 && sumDebit === sumCredit
  const diff = sumDebit - sumCredit

  return (
    <div className="space-y-5">
      <datalist id="acc-options">
        {accountOptions.map(a => (
          <option key={a.code} value={a.code}>{a.code} — {a.name}</option>
        ))}
      </datalist>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-slate-700">Bút toán điều chỉnh & đóng sổ</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Nhập bút toán thủ công, hỗ trợ nhiều dòng Nợ / nhiều dòng Có
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" disabled={filtered.length === 0} onClick={() => downloadExcel('but-toan-dieu-chinh-dong-so', [{
            name: 'Bút toán',
            title: [`BÚT TOÁN ${filterType === 'all' ? 'ĐIỀU CHỈNH & ĐÓNG SỔ' : (TYPE_LABELS[filterType] ?? filterType).toUpperCase()}`],
            header: ['Ngày', 'Diễn giải', 'TK Nợ', 'TK Có', 'Số tiền', 'TK Nợ thuế', 'TK Có thuế', 'Tiền thuế', 'Loại', 'Nhóm bút toán'],
            rows: [...filtered].sort((a, b) => a.date.localeCompare(b.date)).map(e => {
              const vat = e.vat_amount && e.vat_debit_account && e.vat_credit_account ? e.vat_amount : 0
              return [vnDate(e.date), e.description, e.debit_account, e.credit_account, e.amount,
                vat ? e.vat_debit_account : '', vat ? e.vat_credit_account : '', vat || '', TYPE_LABELS[e.type ?? ''] ?? e.type, e.group_id ? e.group_id.slice(0, 8) : '']
            }),
            widths: [11, 60, 8, 8, 15, 10, 10, 13, 14, 12],
          }])}>
            <FileSpreadsheet className="h-4 w-4 mr-1.5" />
            Xuất Excel
          </Button>
          <Button onClick={() => { setForm(emptyForm()); setOpen(true) }}>
            <Plus className="h-4 w-4 mr-1.5" />
            Thêm bút toán
          </Button>
        </div>
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
      {grouped.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
            <p className="text-xs text-slate-400">Số bút toán</p>
            <p className="font-bold text-slate-700">{grouped.length}</p>
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
        ) : grouped.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <BookOpen className="h-8 w-8 mx-auto text-slate-200" />
            <p className="text-slate-400 text-sm">Chưa có bút toán nào</p>
            <button
              onClick={() => { setForm(emptyForm()); setOpen(true) }}
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
                <th className="text-left px-4 py-3 font-medium">Định khoản</th>
                <th className="text-right px-5 py-3 font-medium">Số tiền</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {grouped.map(g => (
                <tr key={g.key} className="border-b border-slate-50 hover:bg-slate-50 transition-colors align-top">
                  <td className="px-5 py-3 text-slate-500 whitespace-nowrap text-xs">
                    {new Date(g.date).toLocaleDateString('vi-VN')}
                  </td>
                  <td className="px-4 py-3 max-w-[200px]">
                    <p className="text-slate-700 truncate font-medium">{g.description}</p>
                    {g.notes && <p className="text-xs text-slate-400 truncate">{g.notes}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      'px-2 py-0.5 rounded-full text-xs border',
                      TYPE_COLORS[g.type ?? ''] ?? 'bg-slate-50 text-slate-500 border-slate-200'
                    )}>
                      {TYPE_LABELS[g.type ?? ''] ?? g.type}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="space-y-1">
                      {g.debitLines.map((l, i) => (
                        <div key={'d' + i} className="flex items-center gap-2">
                          <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-700 font-mono text-xs font-bold">
                            Nợ {l.account}
                          </span>
                          <span className="font-mono text-xs text-slate-500">{fmt(l.amount)}</span>
                        </div>
                      ))}
                      {g.creditLines.map((l, i) => (
                        <div key={'c' + i} className="flex items-center gap-2 pl-3">
                          <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-mono text-xs font-bold">
                            Có {l.account}
                          </span>
                          <span className="font-mono text-xs text-slate-500">{fmt(l.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right font-mono font-semibold text-slate-800 whitespace-nowrap">
                    {fmt(g.total)}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => {
                        if (confirm('Xóa bút toán này?')) deleteMutation.mutate(g.ids)
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
                    debits: [{ account: t.debit, amount: '' }],
                    credits: [{ account: t.credit, amount: '' }],
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
                  onChange={setField('date')}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2
                    focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Loại bút toán</label>
                <select
                  value={form.type}
                  onChange={setField('type')}
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
                onChange={setField('description')}
                placeholder="Mô tả bút toán..."
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2
                  focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>

            {/* Debit lines */}
            <LineEditor
              label="Nợ" color="red" side="debits" lines={form.debits}
              onChange={setLine} onAdd={addLine} onRemove={removeLine}
            />
            {/* Credit lines */}
            <LineEditor
              label="Có" color="blue" side="credits" lines={form.credits}
              onChange={setLine} onAdd={addLine} onRemove={removeLine}
            />

            {/* Balance indicator */}
            <div className={cn(
              'flex items-center justify-between rounded-xl px-4 py-2.5 text-sm border',
              balanced
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'bg-amber-50 border-amber-200 text-amber-700'
            )}>
              <span className="font-medium">
                {balanced ? '✓ Cân đối' : diff === 0 ? 'Nhập số tiền' : `Lệch ${fmt(Math.abs(diff))}`}
              </span>
              <span className="font-mono text-xs">
                Nợ {fmt(sumDebit)} / Có {fmt(sumCredit)}
              </span>
            </div>

            {/* Notes */}
            <textarea
              value={form.notes}
              onChange={setField('notes')}
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
              disabled={!form.description || !balanced || createMutation.isPending}
            >
              {createMutation.isPending ? 'Đang lưu...' : 'Lưu bút toán'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function LineEditor({ label, color, side, lines, onChange, onAdd, onRemove }: {
  label: string
  color: 'red' | 'blue'
  side: 'debits' | 'credits'
  lines: Line[]
  onChange: (side: 'debits' | 'credits', idx: number, key: keyof Line, value: string) => void
  onAdd: (side: 'debits' | 'credits') => void
  onRemove: (side: 'debits' | 'credits', idx: number) => void
}) {
  const badge = color === 'red' ? 'text-red-500' : 'text-blue-500'
  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-b border-slate-100">
        <span className={cn('text-xs font-bold', badge)}>{label}</span>
        <button
          onClick={() => onAdd(side)}
          className="text-xs text-indigo-500 hover:text-indigo-700 flex items-center gap-1"
        >
          <Plus className="h-3 w-3" /> Thêm dòng
        </button>
      </div>
      <div className="divide-y divide-slate-100">
        {lines.map((l, idx) => (
          <div key={idx} className="flex items-center gap-2 px-3 py-2">
            <input
              list="acc-options"
              value={l.account}
              onChange={e => onChange(side, idx, 'account', e.target.value)}
              placeholder="TK"
              className="w-24 text-sm border border-slate-200 rounded-lg px-2 py-1.5
                focus:outline-none focus:ring-2 focus:ring-indigo-400 font-mono"
            />
            <input
              type="text"
              inputMode="numeric"
              value={l.amount ? new Intl.NumberFormat('vi-VN').format(parseInt(l.amount, 10)) : ''}
              onChange={e => onChange(side, idx, 'amount', e.target.value)}
              placeholder="Số tiền"
              className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5
                focus:outline-none focus:ring-2 focus:ring-indigo-400 font-mono text-right"
            />
            <button
              onClick={() => onRemove(side, idx)}
              disabled={lines.length === 1}
              className="text-slate-300 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
