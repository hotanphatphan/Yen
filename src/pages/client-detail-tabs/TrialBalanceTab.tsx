import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, Pencil, Check, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatVND, formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { DEFAULT_ACCOUNTS } from '@/lib/seeds/defaultAccounts'
import type { JournalEntry, Account } from '@/types'
import { expandVatLines, isVatLine } from '@/lib/accounting'
import { Input } from '@/components/shared/Input'
import { VNDInput } from '@/components/shared/VNDInput'

interface AccountBalance {
  code: string
  name: string
  totalDebit: number
  totalCredit: number
  balance: number
  entries: JournalEntry[]
}

// Gom tài khoản con vào mẹ: mã 4+ số thì mẹ là 3 số đầu (VD 1121 → 112).
function parentOf(code: string): string {
  return code.length > 3 ? code.slice(0, 3) : code
}

interface AccountGroup {
  code: string          // mã tài khoản mẹ (3 số)
  name: string
  self: AccountBalance | null       // bút toán ghi thẳng vào mẹ
  children: AccountBalance[]         // các tài khoản con
  totalDebit: number    // = self + tổng con (tự động)
  totalCredit: number
  balance: number
}

export default function TrialBalanceTab({ companyId }: { companyId: string }) {
  const qc = useQueryClient()
  const [expandedCode, setExpandedCode] = useState<string | null>(null)   // mã mẹ đang xòe
  const [expandedChild, setExpandedChild] = useState<string | null>(null) // mã con/mẹ đang xem bút toán
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ debit_account: '', credit_account: '', amount: 0, description: '', date: '' })

  const { data: entries = [] } = useQuery({
    queryKey: ['all-journal-entries', companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from('journal_entries')
        .select('*')
        .eq('company_id', companyId)
        .order('date', { ascending: false })
      return (data ?? []) as JournalEntry[]
    },
  })

  // Danh mục tài khoản của công ty (để lấy tên tài khoản con tự thêm)
  const { data: companyAccounts = [] } = useQuery({
    queryKey: ['accounts', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('accounts').select('*').eq('company_id', companyId)
      return (data ?? []) as Account[]
    },
  })

  function nameOf(code: string): string {
    return companyAccounts.find(a => a.code === code)?.name
      ?? DEFAULT_ACCOUNTS.find(a => a.code === code)?.name
      ?? code
  }

  const updateEntry = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('journal_entries').update({
        debit_account: editForm.debit_account,
        credit_account: editForm.credit_account,
        amount: editForm.amount,
        description: editForm.description || null,
        date: editForm.date,
      }).eq('id', id)
    },
    onSuccess: () => {
      setEditingEntryId(null)
      qc.invalidateQueries({ queryKey: ['all-journal-entries', companyId] })
    },
  })

  // Build trial balance: for each account code, sum debit/credit
  const accountMap = new Map<string, AccountBalance>()

  function ensure(code: string): AccountBalance {
    if (!accountMap.has(code)) {
      accountMap.set(code, { code, name: nameOf(code), totalDebit: 0, totalCredit: 0, balance: 0, entries: [] })
    }
    return accountMap.get(code)!
  }

  for (const e of expandVatLines(entries)) {
    if (e.debit_account) {
      const a = ensure(e.debit_account)
      a.totalDebit += e.amount
      if (!a.entries.find(x => x.id === e.id)) a.entries.push(e)
    }
    if (e.credit_account) {
      const a = ensure(e.credit_account)
      a.totalCredit += e.amount
      if (!a.entries.find(x => x.id === e.id)) a.entries.push(e)
    }
  }
  for (const a of accountMap.values()) a.balance = a.totalDebit - a.totalCredit

  // Gom vào nhóm mẹ (3 số). Mẹ = ghi thẳng (self) + tổng các con → luôn khớp.
  const groupMap = new Map<string, AccountGroup>()
  for (const a of accountMap.values()) {
    const pc = parentOf(a.code)
    if (!groupMap.has(pc)) {
      groupMap.set(pc, { code: pc, name: nameOf(pc), self: null, children: [], totalDebit: 0, totalCredit: 0, balance: 0 })
    }
    const g = groupMap.get(pc)!
    if (a.code === pc) g.self = a
    else g.children.push(a)
  }
  for (const g of groupMap.values()) {
    const parts = [g.self, ...g.children].filter(Boolean) as AccountBalance[]
    g.totalDebit = parts.reduce((s, p) => s + p.totalDebit, 0)
    g.totalCredit = parts.reduce((s, p) => s + p.totalCredit, 0)
    g.balance = g.totalDebit - g.totalCredit
    g.children.sort((a, b) => a.code.localeCompare(b.code))
  }

  const groups = Array.from(groupMap.values()).sort((a, b) => a.code.localeCompare(b.code))
  const grandDebit = groups.reduce((s, g) => s + g.totalDebit, 0)
  const grandCredit = groups.reduce((s, g) => s + g.totalCredit, 0)
  const balanced = Math.round(grandDebit) === Math.round(grandCredit)

  function startEdit(e: JournalEntry) {
    setEditingEntryId(e.id)
    setEditForm({
      debit_account: e.debit_account,
      credit_account: e.credit_account,
      amount: e.amount,
      description: e.description ?? '',
      date: e.date,
    })
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-16 text-slate-400 text-sm">
        Chưa có bút toán nào. Hạch toán hóa đơn hoặc giao dịch ngân hàng trước.
      </div>
    )
  }

  // Bảng bút toán chi tiết của 1 tài khoản (dùng cho cả mẹ ghi thẳng lẫn con)
  function renderEntries(acct: AccountBalance) {
    return (
      <div className="border-t border-slate-100 bg-slate-50/50">
        <div className="grid grid-cols-12 gap-2 px-8 py-1.5 text-xs text-slate-400 font-medium border-b border-slate-100">
          <div className="col-span-2">Ngày</div>
          <div className="col-span-3">Diễn giải</div>
          <div className="col-span-2">Nợ / Có</div>
          <div className="col-span-2 text-right">Nợ</div>
          <div className="col-span-2 text-right">Có</div>
          <div className="col-span-1" />
        </div>
        {acct.entries.map(e => {
          const isEditing = editingEntryId === e.id
          const isDebit = e.debit_account === acct.code
          return (
            <div key={e.id} className="grid grid-cols-12 gap-2 px-8 py-2 text-xs hover:bg-white border-b border-slate-50 items-center group">
              {isEditing ? (
                <>
                  <div className="col-span-2">
                    <Input type="date" value={editForm.date} onChange={e2 => setEditForm(f => ({ ...f, date: e2.target.value }))} className="h-7 text-xs" />
                  </div>
                  <div className="col-span-3">
                    <Input value={editForm.description} onChange={e2 => setEditForm(f => ({ ...f, description: e2.target.value }))} placeholder="Diễn giải" className="h-7 text-xs" />
                  </div>
                  <div className="col-span-2 flex gap-1">
                    <select value={editForm.debit_account} onChange={e2 => setEditForm(f => ({ ...f, debit_account: e2.target.value }))}
                      className="w-full rounded border border-slate-200 text-xs px-1 py-0.5 focus:outline-none">
                      {DEFAULT_ACCOUNTS.map(a => <option key={a.code} value={a.code}>{a.code}</option>)}
                    </select>
                    <select value={editForm.credit_account} onChange={e2 => setEditForm(f => ({ ...f, credit_account: e2.target.value }))}
                      className="w-full rounded border border-slate-200 text-xs px-1 py-0.5 focus:outline-none">
                      {DEFAULT_ACCOUNTS.map(a => <option key={a.code} value={a.code}>{a.code}</option>)}
                    </select>
                  </div>
                  <div className="col-span-4">
                    <VNDInput value={editForm.amount} onChange={v => setEditForm(f => ({ ...f, amount: v }))} />
                  </div>
                  <div className="col-span-1 flex gap-1 justify-end">
                    <button onClick={() => updateEntry.mutate(e.id)} className="p-1 text-green-500 hover:text-green-700"><Check className="h-3.5 w-3.5" /></button>
                    <button onClick={() => setEditingEntryId(null)} className="p-1 text-slate-400 hover:text-slate-600"><X className="h-3.5 w-3.5" /></button>
                  </div>
                </>
              ) : (
                <>
                  <div className="col-span-2 text-slate-400">{formatDate(e.date)}</div>
                  <div className="col-span-3 text-slate-600 truncate">{e.description || '—'}</div>
                  <div className="col-span-2 text-slate-400">Nợ {e.debit_account} / Có {e.credit_account}</div>
                  <div className={cn('col-span-2 text-right font-mono', isDebit ? 'text-slate-700 font-medium' : 'text-slate-300')}>
                    {isDebit ? formatVND(e.amount) : '—'}
                  </div>
                  <div className={cn('col-span-2 text-right font-mono', !isDebit ? 'text-slate-700 font-medium' : 'text-slate-300')}>
                    {!isDebit ? formatVND(e.amount) : '—'}
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <button
                      hidden={isVatLine(e)}
                      title={isVatLine(e) ? undefined : 'Sửa bút toán'}
                      onClick={() => startEdit(e)}
                      className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-indigo-500 transition-all"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  // 1 dòng số dư (mã, tên, tổng nợ/có, dư nợ/có)
  function balanceCells(bal: number, td: number, tc: number) {
    const debitBalance = bal > 0 ? bal : 0
    const creditBalance = bal < 0 ? Math.abs(bal) : 0
    return (
      <>
        <div className="col-span-2 text-right font-mono text-slate-600">{formatVND(td)}</div>
        <div className="col-span-2 text-right font-mono text-slate-600">{formatVND(tc)}</div>
        <div className={cn('col-span-2 text-right font-mono font-medium', debitBalance > 0 ? 'text-slate-800' : 'text-slate-300')}>
          {debitBalance > 0 ? formatVND(debitBalance) : '—'}
        </div>
        <div className={cn('col-span-2 text-right font-mono font-medium', creditBalance > 0 ? 'text-slate-800' : 'text-slate-300')}>
          {creditBalance > 0 ? formatVND(creditBalance) : '—'}
        </div>
      </>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-700">Bảng cân đối thử (Trial Balance)</h3>
        {!balanced && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            <span className="text-red-500 font-bold">!</span>
            Chênh lệch: {formatVND(Math.abs(grandDebit - grandCredit))} — kiểm tra lại bút toán
          </div>
        )}
        {balanced && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm">
            <Check className="h-4 w-4" /> Cân bằng
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-12 gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
          <div className="col-span-1">Mã TK</div>
          <div className="col-span-3">Tên tài khoản</div>
          <div className="col-span-2 text-right">Tổng Nợ</div>
          <div className="col-span-2 text-right">Tổng Có</div>
          <div className="col-span-2 text-right">Dư Nợ</div>
          <div className="col-span-2 text-right">Dư Có</div>
        </div>

        {/* Rows */}
        {groups.map(g => {
          const hasChildren = g.children.length > 0
          const isExpanded = expandedCode === g.code
          // Danh sách dòng con: nếu mẹ có bút toán ghi thẳng thì thêm dòng "self"
          const childRows: AccountBalance[] = [...(g.self ? [g.self] : []), ...g.children]

          return (
            <div key={g.code} className="border-b border-slate-100 last:border-0">
              {/* Dòng tài khoản mẹ (số tổng, tự động = con) */}
              <button
                onClick={() => {
                  setExpandedCode(isExpanded ? null : g.code)
                  setExpandedChild(null)
                }}
                className="w-full grid grid-cols-12 gap-2 px-4 py-3 hover:bg-slate-50 transition-colors text-sm text-left"
              >
                <div className="col-span-1 flex items-center gap-1 font-mono font-semibold text-slate-700">
                  {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />}
                  {g.code}
                </div>
                <div className="col-span-3 text-slate-600 truncate">
                  {g.name}
                  {hasChildren && <span className="ml-1.5 text-xs text-slate-400">({g.children.length} tk con)</span>}
                </div>
                {balanceCells(g.balance, g.totalDebit, g.totalCredit)}
              </button>

              {isExpanded && (
                hasChildren ? (
                  // Có tài khoản con → xổ ra từng con, mẹ = tổng con
                  <div className="bg-slate-50/40">
                    {childRows.map(child => {
                      const isChildOpen = expandedChild === child.code
                      const isSelf = child.code === g.code
                      return (
                        <div key={child.code} className="border-t border-slate-100">
                          <button
                            onClick={() => setExpandedChild(isChildOpen ? null : child.code)}
                            className="w-full grid grid-cols-12 gap-2 pl-8 pr-4 py-2.5 hover:bg-white transition-colors text-sm text-left"
                          >
                            <div className="col-span-1 flex items-center gap-1 font-mono text-slate-500">
                              {isChildOpen ? <ChevronDown className="h-3 w-3 text-slate-300 shrink-0" /> : <ChevronRight className="h-3 w-3 text-slate-300 shrink-0" />}
                              {child.code}
                            </div>
                            <div className="col-span-3 text-slate-500 truncate">
                              {isSelf ? <span className="italic text-slate-400">Ghi thẳng vào {g.code}</span> : child.name}
                            </div>
                            {balanceCells(child.balance, child.totalDebit, child.totalCredit)}
                          </button>
                          {isChildOpen && renderEntries(child)}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  // Không có con → xem thẳng bút toán như cũ
                  g.self && renderEntries(g.self)
                )
              )}
            </div>
          )
        })}

        {/* Grand total */}
        <div className={cn(
          'grid grid-cols-12 gap-2 px-4 py-3 text-sm font-bold border-t-2',
          balanced ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
        )}>
          <div className="col-span-4 text-slate-700">Tổng cộng</div>
          <div className={cn('col-span-2 text-right font-mono', balanced ? 'text-green-700' : 'text-red-700')}>{formatVND(grandDebit)}</div>
          <div className={cn('col-span-2 text-right font-mono', balanced ? 'text-green-700' : 'text-red-700')}>{formatVND(grandCredit)}</div>
          <div className="col-span-4" />
        </div>
      </div>
    </div>
  )
}
