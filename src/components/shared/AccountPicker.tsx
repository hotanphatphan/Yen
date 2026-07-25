import { useMemo, useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { Check, ChevronDown, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface AccountOption {
  code: string
  name: string
}

// Bỏ dấu tiếng Việt để tìm kiếm không cần gõ dấu
function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd')
}

/**
 * Ô chọn tài khoản có tìm kiếm (kiểu MISA/QuickBooks):
 * - Bấm ra danh sách mã + tên, gõ để lọc theo mã hoặc tên (không cần dấu)
 * - Bấm chọn — không cần nhớ mã
 * - Gõ mã chưa có (VD 6421) → hiện "➕ Dùng tài khoản mới" để thêm tk con
 */
export function AccountPicker({
  value,
  onChange,
  accounts,
  placeholder = 'Chọn tài khoản',
  allowEmpty = false,
  className,
  onCreate,
}: {
  value: string
  onChange: (code: string) => void
  accounts: AccountOption[]
  placeholder?: string
  allowEmpty?: boolean
  className?: string
  /** Lưu tài khoản con mới (mã + tên) vào danh mục ngay khi thêm. Bỏ trống name = để app tự đặt. */
  onCreate?: (code: string, name: string) => Promise<void> | void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState<{ code: string; name: string } | null>(null)
  const [saving, setSaving] = useState(false)

  const selected = accounts.find(a => a.code === value)

  const filtered = useMemo(() => {
    const q = normalize(query.trim())
    if (!q) return accounts
    return accounts.filter(a => normalize(a.code).includes(q) || normalize(a.name).includes(q))
  }, [accounts, query])

  // Cho phép thêm mã mới khi gõ là một mã tài khoản (3-6 chữ số) chưa tồn tại
  const trimmed = query.trim()
  const canCreate = /^\d{3,6}$/.test(trimmed) && !accounts.some(a => a.code === trimmed)

  function pick(code: string) {
    onChange(code)
    setOpen(false)
    setQuery('')
    setCreating(null)
  }

  function startCreate() {
    // Nếu có onCreate → mở form đặt tên; không thì chọn thẳng mã (app tự đặt tên sau)
    if (onCreate) setCreating({ code: trimmed, name: '' })
    else pick(trimmed)
  }

  async function confirmCreate() {
    if (!creating || saving) return
    setSaving(true)
    try {
      await onCreate?.(creating.code, creating.name.trim())
      pick(creating.code)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Popover.Root open={open} onOpenChange={o => { setOpen(o); if (!o) { setQuery(''); setCreating(null) } }}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={cn(
            'flex items-center gap-1.5 w-full text-left text-sm text-slate-700 focus:outline-none',
            className,
          )}
        >
          <span className={cn('truncate', !value && 'text-slate-400')}>
            {value ? (selected ? `${selected.code} — ${selected.name}` : value) : placeholder}
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-slate-400 ml-auto shrink-0" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className="z-50 w-[280px] rounded-xl border border-slate-200 bg-white shadow-lg p-1"
        >
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Tìm theo tên/mã, hoặc gõ mã mới để thêm..."
            className="w-full text-sm px-2 py-1.5 border-b border-slate-100 focus:outline-none"
          />
          <div className="max-h-60 overflow-y-auto py-1">
            {allowEmpty && (
              <button
                type="button"
                onClick={() => pick('')}
                className="flex w-full items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-slate-500 hover:bg-slate-50"
              >
                <Check className={cn('h-3.5 w-3.5', !value ? 'opacity-100 text-indigo-600' : 'opacity-0')} />
                <span className="text-slate-400">— Không có —</span>
              </button>
            )}
            {filtered.map(a => (
              <button
                key={a.code}
                type="button"
                onClick={() => pick(a.code)}
                className="flex w-full items-center gap-2 px-2 py-1.5 rounded-lg text-sm hover:bg-slate-50"
              >
                <Check className={cn('h-3.5 w-3.5 shrink-0', a.code === value ? 'opacity-100 text-indigo-600' : 'opacity-0')} />
                <span className="font-mono text-xs text-slate-500 w-12 shrink-0">{a.code}</span>
                <span className="truncate text-slate-700">{a.name}</span>
              </button>
            ))}
            {filtered.length === 0 && !canCreate && (
              <p className="text-xs text-slate-400 px-3 py-2">Không tìm thấy tài khoản phù hợp.</p>
            )}
          </div>

          {/* Luôn hiện lối "thêm tài khoản con mới" để dễ thấy */}
          <div className="border-t border-slate-100 mt-1 pt-1">
            {creating ? (
              <div className="px-2 py-1.5 space-y-1.5">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Plus className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                  Thêm tài khoản mới, mã <span className="font-mono font-medium text-slate-700">{creating.code}</span>
                </div>
                <input
                  autoFocus
                  value={creating.name}
                  onChange={e => setCreating(c => c && { ...c, name: e.target.value })}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); confirmCreate() } }}
                  placeholder="Tên tài khoản (VD Techcombank)"
                  className="w-full text-sm px-2 py-1.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                />
                <div className="flex items-center justify-end gap-2">
                  <button type="button" onClick={() => setCreating(null)} className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1">Hủy</button>
                  <button type="button" onClick={confirmCreate} disabled={saving}
                    className="text-xs bg-indigo-600 text-white px-3 py-1 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                    {saving ? 'Đang lưu...' : 'Lưu & chọn'}
                  </button>
                </div>
              </div>
            ) : canCreate ? (
              <button
                type="button"
                onClick={startCreate}
                className="flex w-full items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-indigo-600 font-medium hover:bg-indigo-50"
              >
                <Plus className="h-4 w-4 shrink-0" />
                Thêm tài khoản mới: <span className="font-mono">{trimmed}</span>
              </button>
            ) : (
              <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-slate-400">
                <Plus className="h-3.5 w-3.5 shrink-0" />
                Thêm tài khoản con: gõ mã số (VD 1121) vào ô tìm ở trên
              </div>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
