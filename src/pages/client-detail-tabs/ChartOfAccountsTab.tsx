import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, X, FileSpreadsheet } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/shared/Card'
import { Badge } from '@/components/shared/Badge'
import { Button } from '@/components/shared/Button'
import type { Account, AccountType } from '@/types'
import { downloadExcel } from '@/lib/excelExport'

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

type FormState = { code: string; name: string; type: AccountType; parent_code: string }
const EMPTY_FORM: FormState = { code: '', name: '', type: 'expense', parent_code: '' }

export default function ChartOfAccountsTab({ companyId }: { companyId: string }) {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['accounts', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('accounts').select('*').eq('company_id', companyId).order('code')
      if (error) throw error
      return data as Account[]
    },
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      const code = form.code.trim()
      const name = form.name.trim()
      if (!code) throw new Error('Vui lòng nhập mã tài khoản.')
      if (!name) throw new Error('Vui lòng nhập tên tài khoản.')
      if (editId) {
        // Sửa: đổi tên / loại / tk mẹ (không đổi mã)
        const { error } = await supabase.from('accounts')
          .update({ name, type: form.type, parent_code: form.parent_code || null })
          .eq('id', editId)
        if (error) throw error
      } else {
        const { error } = await supabase.from('accounts').insert({
          company_id: companyId,
          code, name, type: form.type,
          parent_code: form.parent_code || null,
          is_system: false,
        })
        if (error) throw error.message.includes('duplicate') || error.code === '23505'
          ? new Error(`Mã ${code} đã tồn tại. Dùng mã khác hoặc bấm Sửa ở tài khoản đó.`)
          : error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts', companyId] })
      closeForm()
    },
    onError: (e: Error) => setError(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('accounts').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts', companyId] }),
  })

  function openAdd() {
    setForm(EMPTY_FORM); setEditId(null); setError(null); setShowForm(true)
  }
  function openEdit(a: Account) {
    setForm({ code: a.code, name: a.name, type: a.type, parent_code: a.parent_code ?? '' })
    setEditId(a.id); setError(null); setShowForm(true)
  }
  function closeForm() {
    setShowForm(false); setEditId(null); setForm(EMPTY_FORM); setError(null)
  }

  const grouped = accounts.reduce<Record<AccountType, Account[]>>((acc, a) => {
    if (!acc[a.type]) acc[a.type] = []
    acc[a.type].push(a)
    return acc
  }, {} as Record<AccountType, Account[]>)

  // Danh sách tài khoản mẹ (cấp 1, mã 3 số) để chọn khi thêm tk con
  const parentOptions = accounts.filter(a => a.code.length === 3)

  if (isLoading) return <div className="text-center py-8 text-gray-400">Đang tải...</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-500 flex-1">
          Danh mục tài khoản kế toán. Bạn có thể thêm tài khoản con (VD 1121 — Techcombank), đổi tên hoặc xóa tài khoản tự thêm.
        </p>
        <Button size="sm" variant="outline" disabled={accounts.length === 0} onClick={() => downloadExcel('he-thong-tai-khoan', [{
          name: 'Hệ thống TK',
          title: ['HỆ THỐNG TÀI KHOẢN KẾ TOÁN'],
          header: ['Mã TK', 'Tên tài khoản', 'Loại', 'TK mẹ'],
          rows: [...accounts].sort((a, b) => a.code.localeCompare(b.code)).map(a => [a.code, a.name, TYPE_LABELS[a.type] ?? a.type, a.parent_code ?? '']),
          widths: [9, 50, 16, 9],
        }])}>
          <FileSpreadsheet className="h-4 w-4" /> Xuất Excel
        </Button>
        {!showForm && (
          <Button size="sm" onClick={openAdd}>
            <Plus className="h-4 w-4" /> Thêm tài khoản
          </Button>
        )}
      </div>

      {/* Form thêm / sửa */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center justify-between">
              {editId ? 'Sửa tài khoản' : 'Thêm tài khoản mới'}
              <button onClick={closeForm} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Mã tài khoản</label>
                <input
                  value={form.code}
                  onChange={e => setForm(f => ({ ...f, code: e.target.value.replace(/[^\d]/g, '') }))}
                  disabled={!!editId}
                  placeholder="VD 1121"
                  className="w-full h-9 text-sm rounded-lg border border-slate-200 px-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:bg-slate-50 disabled:text-slate-400 font-mono"
                />
                {editId && <p className="text-xs text-slate-400 mt-1">Không đổi được mã. Muốn mã khác thì tạo tài khoản mới.</p>}
                {!editId && form.code.length > 3 && (
                  <p className="text-xs text-slate-400 mt-1">
                    ↳ Tài khoản con của <span className="font-mono">{form.code.slice(0, 3)}</span>
                    {accounts.find(a => a.code === form.code.slice(0, 3))?.name
                      ? ` — ${accounts.find(a => a.code === form.code.slice(0, 3))!.name}` : ''}.
                    Số dư tự cộng vào tổng của {form.code.slice(0, 3)}.
                  </p>
                )}
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Tên tài khoản</label>
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="VD Tiền gửi Techcombank"
                  className="w-full h-9 text-sm rounded-lg border border-slate-200 px-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Loại</label>
                <select
                  value={form.type}
                  onChange={e => setForm(f => ({ ...f, type: e.target.value as AccountType }))}
                  className="w-full h-9 text-sm rounded-lg border border-slate-200 px-2 focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white"
                >
                  {(Object.keys(TYPE_LABELS) as AccountType[]).map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Thuộc tài khoản mẹ (không bắt buộc)</label>
                <select
                  value={form.parent_code}
                  onChange={e => setForm(f => ({ ...f, parent_code: e.target.value }))}
                  className="w-full h-9 text-sm rounded-lg border border-slate-200 px-2 focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white"
                >
                  <option value="">— Không —</option>
                  {parentOptions.map(a => <option key={a.code} value={a.code}>{a.code} — {a.name}</option>)}
                </select>
              </div>
            </div>
            {error && <p className="text-xs text-red-500">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={closeForm}>Hủy</Button>
              <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? 'Đang lưu...' : editId ? 'Lưu thay đổi' : 'Thêm'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

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
                  <div key={a.id} className={`flex items-center gap-3 py-2 group ${a.parent_code ? 'pl-4' : ''}`}>
                    <span className="font-mono text-sm text-blue-700 w-14 shrink-0">{a.code}</span>
                    <span className="text-sm text-gray-800 flex-1">{a.name}</span>
                    {a.is_system
                      ? <Badge variant="secondary" className="text-xs">Hệ thống</Badge>
                      : <Badge variant="default" className="text-xs">Tự thêm</Badge>}
                    <button
                      onClick={() => openEdit(a)}
                      className="text-slate-300 hover:text-indigo-500 transition-colors"
                      title="Sửa tên / loại"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    {!a.is_system && (
                      <button
                        onClick={() => { if (confirm(`Xóa tài khoản ${a.code} — ${a.name}?`)) deleteMutation.mutate(a.id) }}
                        className="text-slate-300 hover:text-red-400 transition-colors"
                        title="Xóa tài khoản"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
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
