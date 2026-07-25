import { useState, useEffect, useRef, useMemo } from 'react'
import { Upload, Plus, CheckCircle2, AlertCircle, XCircle, Trash2, Pencil,
  Landmark, ChevronDown, ChevronUp, Link2, Sparkles, Check } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/shared/Button'
import { Card, CardContent } from '@/components/shared/Card'
import { Badge } from '@/components/shared/Badge'
import { Input } from '@/components/shared/Input'
import { Label } from '@/components/shared/Label'
import { supabase } from '@/lib/supabase'
import { parseBankStatementWithGemini } from '@/lib/excel/parseBankStatement'
import { autoMatchTransactions } from '@/lib/gemini'
import type { BankTransaction, BankAccount, Invoice } from '@/types'
import { formatDate, formatVND } from '@/lib/utils'
import { COMMON_ACCOUNTS } from '@/lib/accountSuggestion'
import { cn } from '@/lib/utils'
import CashLedgerTab from './CashLedgerTab'
import { SectionButToanDieuChinh } from './LedgerTab'

// Suy ra năm / tháng / quý từ ngày giao dịch (dùng cho kho sao kê)
function periodOf(dateStr: string | null): { year: number; month: number; quarter: number } | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  const month = d.getMonth() + 1
  return { year: d.getFullYear(), month, quarter: Math.ceil(month / 3) }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface TxSuggestion {
  bankTxId: string
  matchedInvoiceId: string | null
  matchedInvoiceName: string | null
  matchedInvoiceNumber: string | null
  debitAccount: string
  creditAccount: string
  vatAccount: string | null
  confidence: number
  reason: string
  isIncome: boolean
  customerName: string
  outInvoiceNo: string
}

type ImportStatus = { type: 'success'; count: number; fileName: string; note?: string } | { type: 'error'; message: string } | null

// ─── Bank Accounts Section ────────────────────────────────────────────────────

const BANK_OPTIONS = [
  'Vietcombank', 'Techcombank', 'MB Bank', 'BIDV', 'Agribank',
  'VPBank', 'ACB', 'Sacombank', 'TPBank', 'VietinBank', 'HDBank', 'SHB', 'Khác',
]

function BankAccountsSection({ companyId }: { companyId: string }) {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ bank_name: '', account_number: '', account_name: '', account_code: '1121' })

  const { data: accounts = [] } = useQuery({
    queryKey: ['bank-accounts', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('bank_accounts').select('*').eq('company_id', companyId).order('created_at')
      return (data ?? []) as BankAccount[]
    },
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editId) {
        await supabase.from('bank_accounts').update(form).eq('id', editId)
      } else {
        await supabase.from('bank_accounts').insert({ ...form, company_id: companyId })
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bank-accounts', companyId] })
      setShowForm(false)
      setEditId(null)
      setForm({ bank_name: '', account_number: '', account_name: '', account_code: '1121' })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('bank_accounts').delete().eq('id', id)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bank-accounts', companyId] }),
  })

  function startEdit(acct: BankAccount) {
    setEditId(acct.id)
    setForm({ bank_name: acct.bank_name, account_number: acct.account_number, account_name: acct.account_name ?? '', account_code: acct.account_code })
    setShowForm(true)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">Quản lý các tài khoản ngân hàng của công ty</p>
        <Button size="sm" onClick={() => { setShowForm(!showForm); setEditId(null); setForm({ bank_name: '', account_number: '', account_name: '', account_code: '1121' }) }}>
          <Plus className="h-3.5 w-3.5" /> Thêm tài khoản
        </Button>
      </div>

      {showForm && (
        <Card className="border-indigo-200">
          <CardContent className="pt-4 space-y-3">
            <p className="text-sm font-semibold text-slate-700">{editId ? 'Sửa tài khoản' : 'Thêm tài khoản ngân hàng'}</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Ngân hàng</Label>
                <select
                  value={form.bank_name}
                  onChange={e => setForm(f => ({ ...f, bank_name: e.target.value }))}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                >
                  <option value="">-- Chọn ngân hàng --</option>
                  {BANK_OPTIONS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>TK kế toán (VAS)</Label>
                <select
                  value={form.account_code}
                  onChange={e => setForm(f => ({ ...f, account_code: e.target.value }))}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                >
                  <option value="1121">1121 — Tiền gửi VNĐ</option>
                  <option value="1122">1122 — Tiền gửi ngoại tệ</option>
                  <option value="1123">1123 — Tiền gửi vàng</option>
                  <option value="112">112 — Tiền gửi NH (tổng hợp)</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Số tài khoản</Label>
                <Input value={form.account_number} onChange={e => setForm(f => ({ ...f, account_number: e.target.value }))} placeholder="0123456789" />
              </div>
              <div className="space-y-1.5">
                <Label>Tên tài khoản</Label>
                <Input value={form.account_name} onChange={e => setForm(f => ({ ...f, account_name: e.target.value }))} placeholder="Công ty TNHH ABC" />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => { setShowForm(false); setEditId(null) }}>Hủy</Button>
              <Button size="sm" onClick={() => saveMutation.mutate()} disabled={!form.bank_name || !form.account_number || saveMutation.isPending}>
                {saveMutation.isPending ? 'Đang lưu...' : 'Lưu'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {accounts.length === 0 && !showForm && (
        <Card>
          <CardContent className="py-10 text-center text-slate-400 text-sm">
            Chưa có tài khoản ngân hàng. Thêm tài khoản để bắt đầu import sao kê.
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {accounts.map(acct => (
          <div key={acct.id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-white hover:border-indigo-200 transition-colors">
            <div className="h-9 w-9 rounded-lg bg-teal-50 flex items-center justify-center shrink-0">
              <Landmark className="h-4.5 w-4.5 text-teal-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-slate-800 text-sm">{acct.bank_name}</p>
              <p className="text-xs text-slate-500">{acct.account_number}{acct.account_name ? ` · ${acct.account_name}` : ''}</p>
            </div>
            <Badge variant="secondary" className="text-xs font-mono">{acct.account_code}</Badge>
            <button onClick={() => startEdit(acct)} className="text-slate-300 hover:text-indigo-500 transition-colors">
              <Pencil className="h-4 w-4" />
            </button>
            <button onClick={() => { if (confirm('Xóa tài khoản này?')) deleteMutation.mutate(acct.id) }} className="text-slate-300 hover:text-red-400 transition-colors">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Statement Section ────────────────────────────────────────────────────────

function StatementsSection({ companyId }: { companyId: string }) {
  const qc = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [parsing, setParsing] = useState(false)
  const [importStatus, setImportStatus] = useState<ImportStatus>(null)
  const [selectedBankAccountId, setSelectedBankAccountId] = useState<string>('')
  const [suggestions, setSuggestions] = useState<Map<string, TxSuggestion>>(new Map())
  const [userEdits, setUserEdits] = useState<Map<string, Partial<TxSuggestion>>>(new Map())
  const [selectedTxIds, setSelectedTxIds] = useState<Set<string>>(new Set())
  const [editingTxId, setEditingTxId] = useState<string | null>(null)
  const [editData, setEditData] = useState({ description: '', amount: '', date: '' })
  const [confirming, setConfirming] = useState<Set<string>>(new Set())
  const [showDone, setShowDone] = useState(false)
  const [editingMatchedId, setEditingMatchedId] = useState<string | null>(null)
  const [matchedEditForm, setMatchedEditForm] = useState({ debitAccount: '', creditAccount: '', description: '' })
  const [matchedJournalId, setMatchedJournalId] = useState<string | null>(null)

  // Kho sao kê: lọc theo năm / quý / tháng
  const [filterYear, setFilterYear] = useState<number | 'all'>('all')
  const [filterQuarter, setFilterQuarter] = useState<number | 'all'>('all')
  const [filterMonth, setFilterMonth] = useState<number | 'all'>('all')

  // Month close marker — stored in localStorage per company
  const now = new Date()
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const m = String(now.getMonth() + 1).padStart(2, '0')
    return `${now.getFullYear()}-${m}`
  })
  const closedMonthsKey = `closed-months-${companyId}`
  const [closedMonths, setClosedMonths] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(closedMonthsKey) ?? '[]') } catch { return [] }
  })
  const isCurrentMonthClosed = closedMonths.includes(selectedMonth)

  function toggleMonthClose() {
    const next = isCurrentMonthClosed
      ? closedMonths.filter(m => m !== selectedMonth)
      : [...closedMonths, selectedMonth]
    setClosedMonths(next)
    localStorage.setItem(closedMonthsKey, JSON.stringify(next))
  }

  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = `Tháng ${d.getMonth() + 1}/${d.getFullYear()}`
    return { val, label }
  })

  const { data: bankAccounts = [] } = useQuery({
    queryKey: ['bank-accounts', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('bank_accounts').select('*').eq('company_id', companyId).order('created_at')
      return (data ?? []) as BankAccount[]
    },
  })

  const { data: bankTransactions = [] } = useQuery({
    queryKey: ['bank-transactions', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('bank_transactions').select('*').eq('company_id', companyId).order('date', { ascending: false })
      return (data ?? []) as BankTransaction[]
    },
  })

  const { data: pendingInvoices = [] } = useQuery({
    queryKey: ['invoices', companyId, 'pending-for-match'],
    queryFn: async () => {
      const { data } = await supabase.from('invoices').select('*').eq('company_id', companyId).in('status', ['pending', 'matched'])
      return (data ?? []) as Invoice[]
    },
  })

  const selectedAccount = bankAccounts.find(a => a.id === selectedBankAccountId)

  // Auto-run matching whenever transactions or invoices change
  useEffect(() => {
    const unmatched = bankTransactions.filter(t => t.status === 'unmatched')
    if (unmatched.length === 0) return

    const bankAccountCode = selectedAccount?.account_code ?? bankAccounts[0]?.account_code ?? '112'

    const bankInputs = unmatched.map(bt => ({
      id: bt.id,
      date: bt.date,
      description: bt.description,
      amount: bt.amount,
    }))

    const invoiceInputs = pendingInvoices.map(inv => ({
      id: inv.id,
      date: inv.invoice_date ?? '',
      vendor: inv.seller_name ?? '',
      amount: inv.subtotal,
      vat_amount: inv.vat_amount,
      invoice_number: inv.invoice_number,
      category: null,
    }))

    autoMatchTransactions(bankInputs, invoiceInputs, bankAccountCode).then(results => {
      const map = new Map<string, TxSuggestion>()
      for (const r of results) {
        const bt = unmatched.find(t => t.id === r.bank_tx_id)
        const matchedInvoice = r.invoice_id ? pendingInvoices.find(i => i.id === r.invoice_id) : null
        map.set(r.bank_tx_id, {
          bankTxId: r.bank_tx_id,
          matchedInvoiceId: r.invoice_id,
          matchedInvoiceName: matchedInvoice?.seller_name ?? null,
          matchedInvoiceNumber: matchedInvoice?.invoice_number ?? null,
          debitAccount: r.debit_account,
          creditAccount: r.credit_account,
          vatAccount: r.vat_account,
          confidence: r.confidence,
          reason: r.reason,
          isIncome: (bt?.amount ?? 0) > 0,
          customerName: '',
          outInvoiceNo: '',
        })
      }
      setSuggestions(map)
    })
  }, [bankTransactions, pendingInvoices, selectedAccount, bankAccounts])

  function getSuggestion(txId: string): TxSuggestion | undefined {
    const base = suggestions.get(txId)
    const edits = userEdits.get(txId)
    if (!base) return undefined
    return { ...base, ...edits }
  }

  function updateEdit(txId: string, patch: Partial<TxSuggestion>) {
    setUserEdits(prev => {
      const next = new Map(prev)
      next.set(txId, { ...(next.get(txId) ?? {}), ...patch })
      return next
    })
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setParsing(true)
    setImportStatus(null)
    try {
      const rows = await parseBankStatementWithGemini(file)
      if (rows.length === 0) {
        setImportStatus({ type: 'error', message: 'Không đọc được giao dịch nào từ file. Kiểm tra lại các cột ngày / diễn giải / số tiền trong file.' })
        return
      }

      // Cột "date" trong DB là NOT NULL — chỉ cần 1 dòng ngày sai là cả lô insert bị hỏng.
      // Vì vậy lọc bỏ dòng không có ngày hợp lệ (YYYY-MM-DD) trước khi lưu.
      const isValidDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d)
      const validRows = rows.filter(r => isValidDate(r.date))
      const skipped = rows.length - validRows.length
      if (validRows.length === 0) {
        setImportStatus({ type: 'error', message: `Đọc được ${rows.length} dòng nhưng không dòng nào có ngày hợp lệ. Kiểm tra lại cột ngày (định dạng ngày/tháng/năm) trong file.` })
        return
      }

      const { data: stmt, error: stmtErr } = await supabase.from('bank_statements').insert({
        company_id: companyId,
        file_name: file.name,
        bank_account_id: selectedBankAccountId || null,
      }).select().single()
      if (stmtErr) throw stmtErr
      if (!stmt) throw new Error('Không tạo được bản ghi sao kê.')

      const { error: txErr } = await supabase.from('bank_transactions').insert(
        validRows.map(r => ({
          statement_id: stmt.id,
          company_id: companyId,
          date: r.date,
          description: r.description || '(không có diễn giải)',
          amount: r.amount,
          balance: r.balance,
          bank_account_id: selectedBankAccountId || null,
          status: 'unmatched',
        }))
      )
      if (txErr) {
        // Lưu giao dịch thất bại → xóa luôn bản ghi sao kê rỗng để không để lại rác
        await supabase.from('bank_statements').delete().eq('id', stmt.id)
        throw txErr
      }

      qc.invalidateQueries({ queryKey: ['bank-transactions', companyId] })
      setImportStatus({
        type: 'success',
        count: validRows.length,
        fileName: file.name,
        note: skipped > 0 ? `${skipped} dòng bị bỏ qua do thiếu/sai ngày.` : undefined,
      })
    } catch (err) {
      setImportStatus({ type: 'error', message: err instanceof Error ? err.message : String(err) })
    } finally {
      setParsing(false)
      e.target.value = ''
    }
  }

  async function confirmTx(bt: BankTransaction) {
    const sg = getSuggestion(bt.id)
    if (!sg) return
    setConfirming(prev => new Set(prev).add(bt.id))
    try {
      const desc = sg.isIncome
        ? `Doanh thu${sg.customerName ? ` từ ${sg.customerName}` : ''}${sg.outInvoiceNo ? ` - HĐ ${sg.outInvoiceNo}` : ''}`
        : bt.description

      const { data: entry } = await supabase.from('journal_entries').insert({
        company_id: companyId,
        date: bt.date,
        description: desc,
        type: sg.matchedInvoiceId ? 'invoice' : (sg.isIncome ? 'income' : 'expense'),
        debit_account: sg.debitAccount,
        credit_account: sg.creditAccount,
        amount: Math.abs(bt.amount),
        vat_debit_account: (!sg.isIncome && sg.vatAccount) ? sg.vatAccount : null,
        vat_credit_account: (sg.isIncome && sg.vatAccount) ? sg.vatAccount : null,
        vat_amount: 0,
        invoice_id: sg.matchedInvoiceId || null,
        status: 'posted',
      }).select().single()

      await supabase.from('bank_transactions')
        .update({ status: 'matched', journal_entry_id: entry?.id ?? null })
        .eq('id', bt.id)

      // If matched with invoice, mark it
      if (sg.matchedInvoiceId) {
        await supabase.from('invoices').update({ status: 'matched' }).eq('id', sg.matchedInvoiceId)
      }

      qc.invalidateQueries({ queryKey: ['bank-transactions', companyId] })
      qc.invalidateQueries({ queryKey: ['invoices', companyId] })
      qc.invalidateQueries({ queryKey: ['invoices', companyId, 'pending-for-match'] })
    } finally {
      setConfirming(prev => { const s = new Set(prev); s.delete(bt.id); return s })
    }
  }

  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const targets = bankTransactions.filter(t => ids.includes(t.id))
      const matched = targets.filter(t => t.status === 'matched')
      if (matched.length > 0) {
        const ok = confirm(
          `${matched.length > 1 ? `${matched.length} giao dịch` : 'Giao dịch này'} đã hạch toán. Xóa sẽ đồng thời xóa bút toán liên kết và ảnh hưởng đến báo cáo. Tiếp tục?`
        )
        if (!ok) return
        // Cascade delete linked journal entries
        const jeIds = matched
          .map(t => (t as BankTransaction & { journal_entry_id?: string }).journal_entry_id)
          .filter(Boolean) as string[]
        if (jeIds.length > 0) {
          await supabase.from('journal_entries').delete().in('id', jeIds)
        }
      }
      await supabase.from('bank_transactions').delete().in('id', ids)
    },
    onSuccess: () => {
      setSelectedTxIds(new Set())
      qc.invalidateQueries({ queryKey: ['bank-transactions', companyId] })
      qc.invalidateQueries({ queryKey: ['all-journal-entries', companyId] })
    },
  })

  const updateJournalMutation = useMutation({
    mutationFn: async ({ journalId, debitAccount, creditAccount, description }: {
      journalId: string; debitAccount: string; creditAccount: string; description: string
    }) => {
      await supabase.from('journal_entries').update({
        debit_account: debitAccount,
        credit_account: creditAccount,
        description: description || null,
      }).eq('id', journalId)
    },
    onSuccess: () => {
      setEditingMatchedId(null)
      setMatchedJournalId(null)
      qc.invalidateQueries({ queryKey: ['bank-transactions', companyId] })
    },
  })

  const updateTxMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { description?: string; amount?: number; date?: string } }) => {
      await supabase.from('bank_transactions').update(data).eq('id', id)
    },
    onSuccess: () => {
      setEditingTxId(null)
      qc.invalidateQueries({ queryKey: ['bank-transactions', companyId] })
    },
  })

  function startEdit(bt: BankTransaction) {
    setEditingTxId(bt.id)
    setEditData({ description: bt.description, amount: String(bt.amount), date: bt.date })
  }

  function saveEdit(id: string) {
    updateTxMutation.mutate({
      id,
      data: {
        description: editData.description,
        amount: parseFloat(editData.amount) || 0,
        date: editData.date,
      },
    })
  }

  const availableYears = useMemo(() => {
    const ys = new Set<number>()
    for (const t of bankTransactions) {
      const p = periodOf(t.date)
      if (p) ys.add(p.year)
    }
    return [...ys].sort((a, b) => b - a)
  }, [bankTransactions])

  const filtering = filterYear !== 'all' || filterQuarter !== 'all' || filterMonth !== 'all'

  const periodFiltered = useMemo(() => bankTransactions.filter(t => {
    const p = periodOf(t.date)
    if (filterYear !== 'all' && (!p || p.year !== filterYear)) return false
    if (filterQuarter !== 'all' && (!p || p.quarter !== filterQuarter)) return false
    if (filterMonth !== 'all' && (!p || p.month !== filterMonth)) return false
    return true
  }), [bankTransactions, filterYear, filterQuarter, filterMonth])

  const unmatched = periodFiltered.filter(t => t.status === 'unmatched')
  const matched = periodFiltered.filter(t => t.status === 'matched')

  const highConf = unmatched.filter(t => (getSuggestion(t.id)?.confidence ?? 0) >= 0.5)
  const lowConf = unmatched.filter(t => (getSuggestion(t.id)?.confidence ?? 0) < 0.5 || !getSuggestion(t.id))

  const toggleSelect = (id: string) => setSelectedTxIds(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  return (
    <div className="space-y-4">
      {/* Month marker */}
      <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-slate-100 bg-slate-50">
        <select
          value={selectedMonth}
          onChange={e => setSelectedMonth(e.target.value)}
          className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white"
        >
          {monthOptions.map(o => (
            <option key={o.val} value={o.val}>{o.label}</option>
          ))}
        </select>
        <button
          onClick={toggleMonthClose}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
            isCurrentMonthClosed
              ? 'bg-green-50 border-green-200 text-green-700 hover:bg-white hover:text-slate-500 hover:border-slate-200'
              : 'bg-white border-slate-200 text-slate-500 hover:bg-green-50 hover:border-green-200 hover:text-green-700'
          )}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          {isCurrentMonthClosed ? 'Đã hoàn thành — bấm để bỏ' : 'Đánh dấu hoàn thành'}
        </button>
        {isCurrentMonthClosed && (
          <span className="text-xs text-slate-400">Kỳ này đã đánh dấu xong. Vẫn sửa được bình thường.</span>
        )}
        {closedMonths.length > 0 && !isCurrentMonthClosed && (
          <span className="text-xs text-slate-400 ml-auto">
            Đã hoàn thành: {closedMonths.map(m => {
              const [y, mo] = m.split('-')
              return `T${parseInt(mo)}/${y}`
            }).join(', ')}
          </span>
        )}
      </div>

      {/* Import row */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={selectedBankAccountId}
          onChange={e => setSelectedBankAccountId(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 min-w-[180px]"
        >
          <option value="">Tất cả tài khoản</option>
          {bankAccounts.map(a => (
            <option key={a.id} value={a.id}>{a.bank_name} — {a.account_code}</option>
          ))}
        </select>

        <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" id="bank-import" onChange={handleImport} />
        <label htmlFor="bank-import">
          <Button asChild variant="outline" disabled={parsing}>
            <span>
              {parsing
                ? <><span className="animate-spin mr-1">⏳</span>Đang đọc file...</>
                : <><Upload className="h-4 w-4" />Import sao kê</>}
            </span>
          </Button>
        </label>
        <p className="text-xs text-slate-400">CSV/Excel từ TCB, VCB, BIDV, MB, ACB, VPBank, Agribank</p>

        {selectedTxIds.size > 0 && (
          <button
            onClick={() => { if (confirm(`Xóa ${selectedTxIds.size} giao dịch đã chọn?`)) deleteMutation.mutate([...selectedTxIds]) }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-medium rounded-lg border border-red-200 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" /> Xóa {selectedTxIds.size} dòng
          </button>
        )}
      </div>

      {importStatus?.type === 'success' && (
        <div className="flex items-start gap-2 rounded-lg bg-green-50 border border-green-200 px-4 py-3">
          <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
          <div className="text-sm flex-1">
            <p className="font-medium text-green-800">Import thành công!</p>
            <p className="text-green-700">Đã lưu <strong>{importStatus.count}</strong> giao dịch từ <em>{importStatus.fileName}</em></p>
            {importStatus.note && <p className="text-amber-600 text-xs mt-0.5">{importStatus.note}</p>}
          </div>
          <button onClick={() => setImportStatus(null)} className="text-green-400 hover:text-green-600">
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      )}

      {importStatus?.type === 'error' && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
          <div className="text-sm flex-1">
            <p className="font-medium text-red-800">Lỗi import</p>
            <p className="text-red-700 whitespace-pre-line">{importStatus.message}</p>
          </div>
          <button onClick={() => setImportStatus(null)} className="text-red-400 hover:text-red-600">
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      )}

      {bankTransactions.length === 0 && (
        <Card>
          <CardContent className="text-center py-10 text-slate-400 text-sm">
            Chưa có giao dịch nào. Import sao kê ngân hàng để bắt đầu.
          </CardContent>
        </Card>
      )}

      {/* Kho sao kê: lọc theo kỳ */}
      {bankTransactions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-100 bg-slate-50/60">
          <span className="text-xs text-slate-400">Lọc theo kỳ:</span>
          <select value={filterYear} onChange={e => setFilterYear(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400">
            <option value="all">Tất cả năm</option>
            {availableYears.map(y => <option key={y} value={y}>Năm {y}</option>)}
          </select>
          <select value={filterQuarter} onChange={e => setFilterQuarter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400">
            <option value="all">Tất cả quý</option>
            {[1, 2, 3, 4].map(q => <option key={q} value={q}>Quý {q}</option>)}
          </select>
          <select value={filterMonth} onChange={e => setFilterMonth(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400">
            <option value="all">Tất cả tháng</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>Tháng {m}</option>)}
          </select>
          {filtering && (
            <>
              <button onClick={() => { setFilterYear('all'); setFilterQuarter('all'); setFilterMonth('all') }}
                className="text-xs text-indigo-500 hover:text-indigo-600 ml-1">Xóa lọc</button>
              <span className="text-xs text-slate-400 ml-auto">{periodFiltered.length} giao dịch trong kỳ</span>
            </>
          )}
        </div>
      )}

      {bankTransactions.length > 0 && periodFiltered.length === 0 && (
        <Card>
          <CardContent className="text-center py-10 text-slate-400 text-sm">
            Không có giao dịch nào trong kỳ đã chọn
          </CardContent>
        </Card>
      )}

      {/* Summary chips */}
      {periodFiltered.length > 0 && (
        <div className="flex gap-3 text-sm">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700">
            <AlertCircle className="h-3.5 w-3.5" />
            {unmatched.length} chờ xử lý
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-50 border border-green-200 text-green-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {matched.length} đã xử lý
          </div>
        </div>
      )}

      {/* Needs confirmation — high confidence */}
      {highConf.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-indigo-500" />
            <p className="text-sm font-semibold text-slate-700">Cần xác nhận ({highConf.length})</p>
            <p className="text-xs text-slate-400">App đã gợi ý — review và xác nhận</p>
          </div>
          {highConf.map(bt => {
            const sg = getSuggestion(bt.id)
            if (!sg) return null
            const isConfirming = confirming.has(bt.id)
            return (
              <TxSuggestionCard
                key={bt.id}
                bt={bt}
                sg={sg}
                isConfirming={isConfirming}
                isSelected={selectedTxIds.has(bt.id)}
                isEditing={editingTxId === bt.id}
                editData={editData}
                onToggleSelect={() => toggleSelect(bt.id)}
                onConfirm={() => confirmTx(bt)}
                onEdit={() => startEdit(bt)}
                onSaveEdit={() => saveEdit(bt.id)}
                onCancelEdit={() => setEditingTxId(null)}
                onEditData={setEditData}
                onUpdateSuggestion={patch => updateEdit(bt.id, patch)}
                onDelete={() => { if (confirm('Xóa giao dịch này?')) deleteMutation.mutate([bt.id]) }}
              />
            )
          })}
        </div>
      )}

      {/* Needs manual — low confidence */}
      {lowConf.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-500" />
            <p className="text-sm font-semibold text-slate-700">Cần xử lý thủ công ({lowConf.length})</p>
            <p className="text-xs text-slate-400">App không chắc — kế toán tự chọn tài khoản</p>
          </div>
          {lowConf.map(bt => {
            const sg = getSuggestion(bt.id)
            if (!sg) return null
            const isConfirming = confirming.has(bt.id)
            return (
              <TxSuggestionCard
                key={bt.id}
                bt={bt}
                sg={sg}
                isConfirming={isConfirming}
                isSelected={selectedTxIds.has(bt.id)}
                isEditing={editingTxId === bt.id}
                editData={editData}
                onToggleSelect={() => toggleSelect(bt.id)}
                onConfirm={() => confirmTx(bt)}
                onEdit={() => startEdit(bt)}
                onSaveEdit={() => saveEdit(bt.id)}
                onCancelEdit={() => setEditingTxId(null)}
                onEditData={setEditData}
                onUpdateSuggestion={patch => updateEdit(bt.id, patch)}
                onDelete={() => { if (confirm('Xóa giao dịch này?')) deleteMutation.mutate([bt.id]) }}
                isManual
              />
            )
          })}
        </div>
      )}

      {/* Done — collapsed */}
      {matched.length > 0 && (
        <div>
          <button
            onClick={() => setShowDone(!showDone)}
            className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 transition-colors"
          >
            {showDone ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            Đã xử lý ({matched.length})
          </button>
          {showDone && (
            <div className="mt-2 space-y-1">
              {matched.map(bt => {
                const isEditingThis = editingMatchedId === bt.id
                return (
                  <div key={bt.id} className="rounded-lg bg-green-50 border border-green-100 text-sm overflow-hidden">
                    <div className="flex items-center justify-between p-2.5">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <input type="checkbox" checked={selectedTxIds.has(bt.id)} onChange={() => toggleSelect(bt.id)} className="rounded shrink-0" />
                        <div className="min-w-0">
                          <p className="text-slate-700 truncate">{bt.description}</p>
                          <p className="text-xs text-slate-400">{formatDate(bt.date)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className={cn('font-mono text-sm font-medium', bt.amount > 0 ? 'text-green-600' : 'text-slate-700')}>
                          {bt.amount > 0 ? '+' : ''}{formatVND(bt.amount)}
                        </span>
                        <Badge variant="success">Đã hạch toán</Badge>
                        <button
                          onClick={async () => {
                            if (isEditingThis) { setEditingMatchedId(null); return }
                            // Load journal entry for this tx
                            const journalId = (bt as BankTransaction & { journal_entry_id?: string }).journal_entry_id
                            if (journalId) {
                              const { data } = await supabase.from('journal_entries').select('*').eq('id', journalId).single()
                              if (data) {
                                setMatchedEditForm({ debitAccount: data.debit_account, creditAccount: data.credit_account, description: data.description ?? '' })
                                setMatchedJournalId(journalId)
                              }
                            } else {
                              // Fallback: find by date + amount
                              const { data } = await supabase.from('journal_entries')
                                .select('*').eq('company_id', companyId).eq('date', bt.date)
                                .gte('amount', Math.abs(bt.amount) * 0.99).lte('amount', Math.abs(bt.amount) * 1.01)
                                .order('created_at', { ascending: false }).limit(1).single()
                              if (data) {
                                setMatchedEditForm({ debitAccount: data.debit_account, creditAccount: data.credit_account, description: data.description ?? '' })
                                setMatchedJournalId(data.id)
                              }
                            }
                            setEditingMatchedId(bt.id)
                          }}
                          className={cn('transition-colors', isEditingThis ? 'text-indigo-500' : 'text-slate-300 hover:text-indigo-400')}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => { if (confirm('Xóa giao dịch này?')) deleteMutation.mutate([bt.id]) }}
                          className="text-slate-300 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Inline edit panel */}
                    {isEditingThis && (
                      <div className="border-t border-green-200 bg-white px-3 py-2.5 space-y-2">
                        {matchedJournalId ? (
                          <>
                            <p className="text-xs text-slate-400 font-medium">Sửa bút toán hạch toán</p>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-xs text-slate-500 mb-1 block">TK Nợ</label>
                                <select
                                  value={matchedEditForm.debitAccount}
                                  onChange={e => setMatchedEditForm(f => ({ ...f, debitAccount: e.target.value }))}
                                  className="w-full h-7 text-xs rounded border border-slate-200 px-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                                >
                                  {COMMON_ACCOUNTS.map(a => <option key={a.code} value={a.code}>{a.code} — {a.name}</option>)}
                                </select>
                              </div>
                              <div>
                                <label className="text-xs text-slate-500 mb-1 block">TK Có</label>
                                <select
                                  value={matchedEditForm.creditAccount}
                                  onChange={e => setMatchedEditForm(f => ({ ...f, creditAccount: e.target.value }))}
                                  className="w-full h-7 text-xs rounded border border-slate-200 px-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                                >
                                  {COMMON_ACCOUNTS.map(a => <option key={a.code} value={a.code}>{a.code} — {a.name}</option>)}
                                </select>
                              </div>
                            </div>
                            <div>
                              <label className="text-xs text-slate-500 mb-1 block">Diễn giải</label>
                              <input
                                value={matchedEditForm.description}
                                onChange={e => setMatchedEditForm(f => ({ ...f, description: e.target.value }))}
                                className="w-full h-7 text-xs rounded border border-slate-200 px-2 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                              />
                            </div>
                            <div className="flex gap-2 justify-end">
                              <button onClick={() => setEditingMatchedId(null)} className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1">Huỷ</button>
                              <button
                                onClick={() => updateJournalMutation.mutate({ journalId: matchedJournalId, ...matchedEditForm })}
                                disabled={updateJournalMutation.isPending}
                                className="text-xs bg-indigo-600 text-white px-3 py-1 rounded hover:bg-indigo-700 disabled:opacity-50"
                              >
                                {updateJournalMutation.isPending ? 'Đang lưu...' : 'Lưu'}
                              </button>
                            </div>
                          </>
                        ) : (
                          <p className="text-xs text-slate-400">Không tìm thấy bút toán liên kết. Sửa trong tab Cân đối thử.</p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Tx Suggestion Card ───────────────────────────────────────────────────────

function TxSuggestionCard({
  bt, sg, isConfirming, isSelected, isEditing, editData,
  onToggleSelect, onConfirm, onEdit, onSaveEdit, onCancelEdit,
  onEditData, onUpdateSuggestion, onDelete, isManual = false,
}: {
  bt: BankTransaction
  sg: TxSuggestion
  isConfirming: boolean
  isSelected: boolean
  isEditing: boolean
  editData: { description: string; amount: string; date: string }
  onToggleSelect: () => void
  onConfirm: () => void
  onEdit: () => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onEditData: (d: { description: string; amount: string; date: string }) => void
  onUpdateSuggestion: (p: Partial<TxSuggestion>) => void
  onDelete: () => void
  isManual?: boolean
}) {
  const hasInvoiceMatch = !!sg.matchedInvoiceId
  const borderColor = isManual ? 'border-amber-200' : hasInvoiceMatch ? 'border-blue-200' : 'border-indigo-200'
  const bgColor = isManual ? 'bg-amber-50' : hasInvoiceMatch ? 'bg-blue-50' : 'bg-indigo-50'

  return (
    <div className={cn('rounded-xl border p-3 space-y-2', borderColor, bgColor)}>
      <div className="flex items-start gap-2">
        <input type="checkbox" checked={isSelected} onChange={onToggleSelect} className="mt-1 rounded" />
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <div className="space-y-2">
              <input
                value={editData.description}
                onChange={e => onEditData({ ...editData, description: e.target.value })}
                className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
              <div className="flex gap-2">
                <input
                  type="date"
                  value={editData.date}
                  onChange={e => onEditData({ ...editData, date: e.target.value })}
                  className="text-xs border border-slate-200 rounded-lg px-2 py-1 focus:outline-none"
                />
                <input
                  value={editData.amount}
                  onChange={e => onEditData({ ...editData, amount: e.target.value })}
                  className="text-xs border border-slate-200 rounded-lg px-2 py-1 w-32 focus:outline-none font-mono"
                />
                <Button size="sm" onClick={onSaveEdit}>Lưu</Button>
                <Button size="sm" variant="ghost" onClick={onCancelEdit}>Hủy</Button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm font-medium text-slate-800 truncate">{bt.description}</p>
              <p className="text-xs text-slate-500">{formatDate(bt.date)}</p>
            </>
          )}

          {/* Suggestion info */}
          {!isEditing && (
            <div className="mt-1.5">
              {hasInvoiceMatch ? (
                <div className="flex items-center gap-1.5 text-xs text-blue-700">
                  <Link2 className="h-3 w-3" />
                  <span>Có hóa đơn khớp: <strong>{sg.matchedInvoiceName}</strong> / HĐ {sg.matchedInvoiceNumber}</span>
                </div>
              ) : (
                <p className="text-xs text-indigo-600">{sg.reason}</p>
              )}
            </div>
          )}

          {/* Income: extra fields */}
          {!isEditing && sg.isIncome && (
            <div className="mt-2 flex gap-2">
              <input
                value={sg.customerName}
                onChange={e => onUpdateSuggestion({ customerName: e.target.value })}
                placeholder="Tên khách hàng"
                className="flex-1 text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
              <input
                value={sg.outInvoiceNo}
                onChange={e => onUpdateSuggestion({ outInvoiceNo: e.target.value })}
                placeholder="Số HĐ (nếu có)"
                className="w-32 text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            </div>
          )}

          {/* Account selectors */}
          {!isEditing && (
            <div className="mt-2 flex gap-2 flex-wrap items-center">
              <span className="text-xs text-slate-500">Nợ:</span>
              <select
                value={sg.debitAccount}
                onChange={e => onUpdateSuggestion({ debitAccount: e.target.value })}
                className="text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none bg-white"
              >
                {COMMON_ACCOUNTS.map(a => <option key={a.code} value={a.code}>{a.label}</option>)}
              </select>
              <span className="text-xs text-slate-500">Có:</span>
              <select
                value={sg.creditAccount}
                onChange={e => onUpdateSuggestion({ creditAccount: e.target.value })}
                className="text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none bg-white"
              >
                {COMMON_ACCOUNTS.map(a => <option key={a.code} value={a.code}>{a.label}</option>)}
              </select>
            </div>
          )}
        </div>

        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={cn('font-mono font-semibold text-sm', bt.amount > 0 ? 'text-green-600' : 'text-slate-800')}>
            {bt.amount > 0 ? '+' : ''}{formatVND(bt.amount)}
          </span>
          {!isEditing && (
            <span className="text-xs text-slate-400">{Math.round(sg.confidence * 100)}% tin cậy</span>
          )}
        </div>
      </div>

      {!isEditing && (
        <div className="flex items-center gap-2 pt-1 border-t border-slate-200/60">
          <Button size="sm" onClick={onConfirm} disabled={isConfirming}>
            <Check className="h-3.5 w-3.5" />
            {isConfirming ? 'Đang hạch toán...' : 'Xác nhận'}
          </Button>
          <button onClick={onEdit} className="text-xs text-slate-400 hover:text-slate-600 transition-colors px-2 py-1">
            <Pencil className="h-3 w-3 inline mr-1" />Sửa
          </button>
          <button onClick={onDelete} className="ml-auto text-slate-300 hover:text-red-400 transition-colors">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────

type BankSubTab = 'statements' | 'cashledger' | 'adjustments' | 'accounts'

export default function BankReconciliationTab({ companyId }: { companyId: string }) {
  const [subTab, setSubTab] = useState<BankSubTab>('statements')

  const SUB_TABS: { key: BankSubTab; label: string }[] = [
    { key: 'statements', label: 'Sao kê & Đối chiếu' },
    { key: 'cashledger', label: 'Sổ quỹ (TK 111)' },
    { key: 'adjustments', label: 'Bút toán điều chỉnh' },
    { key: 'accounts', label: 'Tài khoản NH' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5 border-b border-slate-100 pb-3">
        {SUB_TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setSubTab(key)}
            className={cn(
              'px-4 py-1.5 rounded-xl text-sm font-medium transition-all',
              subTab === key
                ? 'bg-teal-600 text-white shadow-sm'
                : 'bg-teal-50 text-slate-500 hover:bg-teal-100'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {subTab === 'statements' && <StatementsSection companyId={companyId} />}
      {subTab === 'cashledger' && <CashLedgerTab companyId={companyId} />}
      {subTab === 'adjustments' && <SectionButToanDieuChinh companyId={companyId} />}
      {subTab === 'accounts' && <BankAccountsSection companyId={companyId} />}
    </div>
  )
}
