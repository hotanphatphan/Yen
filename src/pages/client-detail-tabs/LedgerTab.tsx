import { useState, useMemo } from 'react'
import { Sparkles, Loader2, CheckCircle2, AlertCircle, Plus, Trash2, ChevronDown, ChevronRight, Pencil, Check, X, FileSpreadsheet } from 'lucide-react'
import * as XLSX from 'xlsx'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/shared/Button'
import { Input } from '@/components/shared/Input'
import { Label } from '@/components/shared/Label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/shared/Card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/shared/Select'
import { Badge } from '@/components/shared/Badge'
import { VNDInput } from '@/components/shared/VNDInput'
import { supabase } from '@/lib/supabase'
import { useTransactions, useCreateTransaction } from '@/hooks/useTransactions'
import { autoMatchTransactions } from '@/lib/gemini'
import type { GeminiMatchResult, BankTxInput, InvoiceInput } from '@/lib/gemini'
import type { BankTransaction, JournalEntry } from '@/types'
import { formatDate, formatVND } from '@/lib/utils'
import { DEFAULT_ACCOUNTS } from '@/lib/seeds/defaultAccounts'

const EXPENSE_ACCOUNTS = DEFAULT_ACCOUNTS.filter(a => a.type === 'expense')

// --- Section A: Chi phí (C1 Gemini + C2 Manual) ---

function SectionChiPhi({ companyId }: { companyId: string }) {
  const qc = useQueryClient()
  const [matching, setMatching] = useState(false)
  const [matchResults, setMatchResults] = useState<GeminiMatchResult[]>([])
  const [editedResults, setEditedResults] = useState<GeminiMatchResult[]>([])
  const [confirming, setConfirming] = useState(false)
  const [c2AccountCode, setC2AccountCode] = useState<Record<string, string>>({})

  const { data: bankTxs = [] } = useQuery({
    queryKey: ['bank-transactions', companyId, 'unmatched'],
    queryFn: async () => {
      const { data } = await supabase
        .from('bank_transactions')
        .select('*')
        .eq('company_id', companyId)
        .eq('status', 'unmatched')
        .lt('amount', 0) // chỉ lấy khoản chi (số âm)
        .order('date', { ascending: false })
      return (data ?? []) as BankTransaction[]
    },
  })

  const { data: transactions = [] } = useTransactions(companyId, { status: 'official' })
  // Dùng transactions hiện có như proxy cho invoices (đã import qua Excel template)
  const unmatchedInvoices = transactions.filter(t =>
    t.type === 'expense' && !t.bank_transaction_id
  )

  const createTransaction = useCreateTransaction()

  async function runGemini() {
    if (bankTxs.length === 0) return
    setMatching(true)
    setMatchResults([])
    try {
      const inputs: BankTxInput[] = bankTxs.map(bt => ({
        id: bt.id,
        date: bt.date,
        description: bt.description,
        amount: bt.amount,
      }))
      const invoiceInputs: InvoiceInput[] = unmatchedInvoices.map(t => ({
        id: t.id,
        date: t.date,
        vendor: t.counterparty ?? '',
        amount: t.amount,
        vat_amount: t.vat_amount,
        invoice_number: t.invoice_number,
        category: t.categories?.name ?? null,
      }))
      const results = await autoMatchTransactions(inputs, invoiceInputs)
      setMatchResults(results)
      setEditedResults(results)
    } catch (e) {
      alert('Lỗi: ' + (e instanceof Error ? e.message : String(e)))
    }
    setMatching(false)
  }

  function updateResult(idx: number, field: keyof GeminiMatchResult, value: string) {
    setEditedResults(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r))
  }

  async function confirmAll() {
    setConfirming(true)
    for (const r of editedResults) {
      const bt = bankTxs.find(b => b.id === r.bank_tx_id)
      if (!bt) continue
      const { data: acctData } = await supabase
        .from('accounts')
        .select('id')
        .eq('company_id', companyId)
        .eq('code', r.debit_account)
        .single()

      await createTransaction.mutateAsync({
        company_id: companyId,
        date: bt.date,
        type: 'expense',
        amount: Math.abs(bt.amount),
        vat_amount: 0,
        category_id: null,
        account_id: acctData?.id ?? null,
        description: bt.description,
        status: 'official',
        source: 'bank_import',
        invoice_number: null,
        counterparty: null,
        bank_transaction_id: bt.id,
        needs_review: false,
        attachment_path: null,
      })
      await supabase.from('bank_transactions')
        .update({ status: 'matched' })
        .eq('id', bt.id)
    }
    qc.invalidateQueries({ queryKey: ['bank-transactions', companyId] })
    setMatchResults([])
    setEditedResults([])
    setConfirming(false)
  }

  async function createC2Entry(bt: BankTransaction) {
    const code = c2AccountCode[bt.id] || '642'
    const { data: acctData } = await supabase
      .from('accounts').select('id').eq('company_id', companyId).eq('code', code).single()
    await createTransaction.mutateAsync({
      company_id: companyId,
      date: bt.date,
      type: 'expense',
      amount: Math.abs(bt.amount),
      vat_amount: 0,
      category_id: null,
      account_id: acctData?.id ?? null,
      description: bt.description,
      status: 'official',
      source: 'bank_import',
      invoice_number: null,
      counterparty: null,
      bank_transaction_id: bt.id,
      needs_review: false,
      attachment_path: null,
    })
    await supabase.from('bank_transactions').update({ status: 'matched' }).eq('id', bt.id)
    qc.invalidateQueries({ queryKey: ['bank-transactions', companyId] })
  }

  const matched = matchResults.length > 0
  const unmatchedAfterGemini = matched
    ? bankTxs.filter(bt => !editedResults.some(r => r.bank_tx_id === bt.id))
    : bankTxs

  return (
    <div className="space-y-4">
      {/* C1: Gemini auto-match */}
      <div className="flex items-center gap-3">
        <Button onClick={runGemini} disabled={matching || bankTxs.length === 0} variant="outline">
          {matching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 text-indigo-500" />}
          {matching ? 'Đang phân tích...' : 'Auto-match & đề xuất tài khoản'}
        </Button>
        <p className="text-xs text-gray-400">
          {bankTxs.length} giao dịch ngân hàng chờ hạch toán
        </p>
      </div>

      {/* Kết quả Gemini */}
      {editedResults.length > 0 && (
        <Card className="border-indigo-200">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm text-indigo-900">
                Gemini gợi ý {editedResults.length} bút toán — xem lại trước khi xác nhận
              </CardTitle>
              <Button size="sm" onClick={confirmAll} disabled={confirming}>
                {confirming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                Xác nhận tất cả
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {editedResults.map((r, idx) => {
                const bt = bankTxs.find(b => b.id === r.bank_tx_id)
                if (!bt) return null
                return (
                  <div key={r.bank_tx_id} className="p-3 rounded border border-indigo-100 bg-indigo-50 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{bt.description}</p>
                        <p className="text-xs text-gray-400">{formatDate(bt.date)} · {formatVND(Math.abs(bt.amount))}</p>
                        <p className="text-xs text-indigo-600 mt-0.5 italic">{r.reason}</p>
                      </div>
                      <Badge variant={r.confidence >= 0.8 ? 'success' : 'secondary'} className="shrink-0 text-xs">
                        {Math.round(r.confidence * 100)}%
                      </Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <Label className="text-xs">TK Nợ</Label>
                        <Select value={r.debit_account} onValueChange={v => updateResult(idx, 'debit_account', v)}>
                          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {EXPENSE_ACCOUNTS.map(a => (
                              <SelectItem key={a.code} value={a.code}>{a.code} — {a.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">TK Có</Label>
                        <Input value={r.credit_account} readOnly className="h-7 text-xs bg-gray-50" />
                      </div>
                      <div>
                        <Label className="text-xs">TK VAT</Label>
                        <Input
                          value={r.vat_account ?? ''}
                          onChange={e => updateResult(idx, 'vat_account', e.target.value)}
                          placeholder="133 hoặc để trống"
                          className="h-7 text-xs"
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* C2: Nhập tay các dòng không match */}
      {(unmatchedAfterGemini.length > 0 && matchResults.length > 0) && (
        <Card className="border-amber-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-amber-800 flex items-center gap-1.5">
              <AlertCircle className="h-4 w-4" />
              {unmatchedAfterGemini.length} giao dịch cần nhập tay
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {unmatchedAfterGemini.map(bt => (
                <div key={bt.id} className="flex items-center gap-2 p-2 rounded border border-amber-100 bg-amber-50">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900 truncate">{bt.description}</p>
                    <p className="text-xs text-gray-400">{formatDate(bt.date)} · {formatVND(Math.abs(bt.amount))}</p>
                  </div>
                  <Select
                    value={c2AccountCode[bt.id] ?? '642'}
                    onValueChange={v => setC2AccountCode(prev => ({ ...prev, [bt.id]: v }))}
                  >
                    <SelectTrigger className="w-48 h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {EXPENSE_ACCOUNTS.map(a => (
                        <SelectItem key={a.code} value={a.code}>{a.code} — {a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="outline" onClick={() => createC2Entry(bt)}>
                    <Plus className="h-3.5 w-3.5" /> Hạch toán
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {bankTxs.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-4">
          Chưa có giao dịch ngân hàng nào chờ hạch toán. Import sao kê ở tab Đối chiếu NH trước.
        </p>
      )}
    </div>
  )
}

// --- Section B: Doanh thu ---

function SectionDoanhThu({ companyId }: { companyId: string }) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [customer, setCustomer] = useState('')
  const [invoiceNo, setInvoiceNo] = useState('')
  const [amount, setAmount] = useState(0)
  const [vatPct, setVatPct] = useState(10)
  const [paymentType, setPaymentType] = useState<'bank' | 'cash'>('bank')
  const [submitting, setSubmitting] = useState(false)

  const createTransaction = useCreateTransaction()
  const { data: recentRevenue = [] } = useTransactions(companyId, { type: 'income', status: 'official' })

  const vatAmount = Math.round(amount * vatPct / 100)
  const debitAccount = paymentType === 'bank' ? '112' : '111'

  async function handleSubmit() {
    if (!amount) return
    setSubmitting(true)
    // TK 131/112/111 — Doanh thu (511) — VAT đầu ra (3331)
    const { data: acctRevenue } = await supabase
      .from('accounts').select('id').eq('company_id', companyId).eq('code', '511').single()
    await createTransaction.mutateAsync({
      company_id: companyId,
      date,
      type: 'income',
      amount,
      vat_amount: vatAmount,
      category_id: null,
      account_id: acctRevenue?.id ?? null,
      description: customer ? `Doanh thu từ ${customer}` : 'Doanh thu',
      status: 'official',
      source: 'manual',
      invoice_number: invoiceNo || null,
      counterparty: customer || null,
      bank_transaction_id: null,
      needs_review: false,
      attachment_path: null,
    })
    setAmount(0)
    setCustomer('')
    setInvoiceNo('')
    setSubmitting(false)
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Nhập hóa đơn bán ra</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Ngày hóa đơn</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Số hóa đơn</Label>
              <Input placeholder="0000001" value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Khách hàng</Label>
              <Input placeholder="Tên công ty / cá nhân" value={customer} onChange={e => setCustomer(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Doanh thu (chưa VAT)</Label>
              <VNDInput value={amount} onChange={setAmount} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label>Thuế suất VAT (%)</Label>
              <Select value={String(vatPct)} onValueChange={v => setVatPct(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">0%</SelectItem>
                  <SelectItem value="5">5%</SelectItem>
                  <SelectItem value="8">8%</SelectItem>
                  <SelectItem value="10">10%</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Hình thức thanh toán</Label>
              <Select value={paymentType} onValueChange={v => setPaymentType(v as 'bank' | 'cash')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank">Chuyển khoản (TK 112)</SelectItem>
                  <SelectItem value="cash">Tiền mặt (TK 111)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Preview bút toán */}
          {amount > 0 && (
            <div className="rounded-md bg-green-50 border border-green-200 p-3 text-xs space-y-1">
              <p className="font-medium text-green-800 mb-1.5">Bút toán sẽ tạo:</p>
              <div className="flex justify-between">
                <span className="text-gray-600">Nợ TK {debitAccount} ({paymentType === 'bank' ? 'Tiền gửi NH' : 'Tiền mặt'})</span>
                <span className="font-medium">{formatVND(amount + vatAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 pl-4">Có TK 511 (Doanh thu)</span>
                <span className="font-medium">{formatVND(amount)}</span>
              </div>
              {vatAmount > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600 pl-4">Có TK 3331 (VAT đầu ra)</span>
                  <span className="font-medium">{formatVND(vatAmount)}</span>
                </div>
              )}
            </div>
          )}

          <Button onClick={handleSubmit} disabled={!amount || submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Hạch toán doanh thu
          </Button>
        </CardContent>
      </Card>

      {/* Lịch sử doanh thu */}
      {recentRevenue.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-gray-500 font-medium">Doanh thu đã hạch toán</p>
          {recentRevenue.slice(0, 10).map(t => (
            <div key={t.id} className="flex items-center justify-between p-2.5 rounded border border-gray-100 text-sm">
              <div>
                <span className="font-medium text-gray-900">{t.counterparty || t.description || '—'}</span>
                <span className="text-xs text-gray-400 ml-2">{formatDate(t.date)}</span>
                {t.invoice_number && <span className="text-xs text-gray-400 ml-2">HĐ: {t.invoice_number}</span>}
              </div>
              <span className="text-green-600 font-medium">+{formatVND(t.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// --- Section C: Bút toán điều chỉnh ---

/** Xuất sổ nhật ký: mỗi bút toán 1 dòng, TK Nợ và TK Có nằm cùng hàng (kèm vế thuế GTGT nếu có). */
function exportJournalExcel(entries: JournalEntry[], nameOf: (code: string | null) => string) {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date))
  const header = ['STT', 'Ngày', 'Diễn giải', 'TK Nợ', 'Tên TK Nợ', 'TK Có', 'Tên TK Có', 'Số tiền',
    'TK Nợ thuế', 'TK Có thuế', 'Tiền thuế GTGT', 'Tổng cộng', 'Loại', 'Ghi chú']
  const rows = sorted.map((e, i) => {
    const vat = e.vat_amount && e.vat_debit_account && e.vat_credit_account ? e.vat_amount : 0
    const [y, m, d] = e.date.split('-')
    return [i + 1, `${d}/${m}/${y}`, e.description ?? '', e.debit_account, nameOf(e.debit_account), e.credit_account, nameOf(e.credit_account),
      e.amount, vat ? e.vat_debit_account : '', vat ? e.vat_credit_account : '', vat, e.amount + vat, e.type ?? '', e.notes ?? '']
  })
  const total = (col: number) => rows.reduce((s, r) => s + (Number(r[col]) || 0), 0)
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows, ['', '', 'TỔNG CỘNG', '', '', '', '', total(7), '', '', total(10), total(11), '', '']])
  ws['!cols'] = [6, 11, 60, 8, 28, 8, 28, 15, 10, 10, 14, 15, 11, 30].map(wch => ({ wch }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Nhật ký chung')
  XLSX.writeFile(wb, `so-nhat-ky-chung-${new Date().toISOString().slice(0, 10)}.xlsx`)
}

export function SectionButToanDieuChinh({ companyId }: { companyId: string }) {
  const qc = useQueryClient()
  const ALL_ACCOUNTS = DEFAULT_ACCOUNTS

  const { data: entries = [] } = useQuery({
    queryKey: ['journal-entries', companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from('journal_entries')
        .select('*')
        .eq('company_id', companyId)
        .order('date', { ascending: false })
      return (data ?? []) as JournalEntry[]
    },
  })

  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [description, setDescription] = useState('')
  const [debitAccount, setDebitAccount] = useState('')
  const [creditAccount, setCreditAccount] = useState('')
  const [amount, setAmount] = useState(0)
  const [submitting, setSubmitting] = useState(false)

  const deleteEntry = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('journal_entries').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['journal-entries', companyId] })
      qc.invalidateQueries({ queryKey: ['all-journal-entries', companyId] })
    },
    onError: (err) => alert('Xóa bút toán thất bại: ' + (err as Error).message),
  })

  // Danh mục TK: mặc định + TK con công ty tự mở (1121, 1388, 6428…)
  const { data: companyAccounts = [] } = useQuery({
    queryKey: ['accounts', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('accounts').select('code, name').eq('company_id', companyId)
      return (data ?? []) as { code: string; name: string }[]
    },
  })
  const accountOptions = useMemo(() => {
    const m = new Map<string, string>()
    for (const a of ALL_ACCOUNTS) m.set(a.code, a.name)
    for (const a of companyAccounts) m.set(a.code, a.name)
    return [...m].map(([code, name]) => ({ code, name })).sort((a, b) => a.code.localeCompare(b.code))
  }, [ALL_ACCOUNTS, companyAccounts])
  const nameOf = (code: string | null) => (code ? accountOptions.find(a => a.code === code)?.name ?? code : '')

  // ── Sửa bút toán trên cùng 1 hàng ──
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ date: '', description: '', debit: '', credit: '', amount: 0, vatDebit: '', vatCredit: '', vat: 0 })
  function startEdit(e: JournalEntry) {
    setEditingId(e.id)
    setForm({
      date: e.date, description: e.description ?? '', debit: e.debit_account, credit: e.credit_account, amount: e.amount,
      vatDebit: e.vat_debit_account ?? '', vatCredit: e.vat_credit_account ?? '', vat: e.vat_amount ?? 0,
    })
  }
  const updateEntry = useMutation({
    mutationFn: async (id: string) => {
      if (!form.debit || !form.credit || !form.amount) throw new Error('Cần đủ TK Nợ, TK Có và số tiền.')
      const hasVat = form.vat > 0
      if (hasVat && (!form.vatDebit || !form.vatCredit)) throw new Error('Có tiền thuế thì phải nhập đủ TK Nợ/Có của thuế.')
      const { error } = await supabase.from('journal_entries').update({
        date: form.date,
        description: form.description.trim() || null,
        debit_account: form.debit,
        credit_account: form.credit,
        amount: form.amount,
        vat_debit_account: hasVat ? form.vatDebit : null,
        vat_credit_account: hasVat ? form.vatCredit : null,
        vat_amount: hasVat ? form.vat : 0,
      }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      setEditingId(null)
      qc.invalidateQueries({ queryKey: ['journal-entries', companyId] })
      qc.invalidateQueries({ queryKey: ['all-journal-entries', companyId] })
    },
    onError: (err) => alert('Lưu bút toán thất bại: ' + (err as Error).message),
  })

  async function handleAdd() {
    if (!debitAccount || !creditAccount || !amount) return
    setSubmitting(true)
    try {
      const { error } = await supabase.from('journal_entries').insert({
        company_id: companyId,
        date,
        description: description || null,
        debit_account: debitAccount,
        credit_account: creditAccount,
        amount,
      })
      if (error) throw error
      qc.invalidateQueries({ queryKey: ['journal-entries', companyId] })
      qc.invalidateQueries({ queryKey: ['all-journal-entries', companyId] })
      setDescription('')
      setAmount(0)
    } catch (err) {
      alert('Lưu bút toán thất bại: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        Dùng cho: khấu hao TSCĐ (Nợ 642 / Có 214), phân bổ chi phí trả trước (Nợ 642 / Có 242), trích trước chi phí, điều chỉnh cuối kỳ...
      </p>

      {/* Form nhập */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Ngày</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Diễn giải</Label>
              <Input
                placeholder="VD: Phân bổ chi phí thuê văn phòng tháng 5"
                value={description}
                onChange={e => setDescription(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>TK Nợ</Label>
              <Select value={debitAccount} onValueChange={setDebitAccount}>
                <SelectTrigger><SelectValue placeholder="Chọn tài khoản Nợ" /></SelectTrigger>
                <SelectContent>
                  {ALL_ACCOUNTS.map(a => (
                    <SelectItem key={a.code} value={a.code}>{a.code} — {a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>TK Có</Label>
              <Select value={creditAccount} onValueChange={setCreditAccount}>
                <SelectTrigger><SelectValue placeholder="Chọn tài khoản Có" /></SelectTrigger>
                <SelectContent>
                  {ALL_ACCOUNTS.map(a => (
                    <SelectItem key={a.code} value={a.code}>{a.code} — {a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Số tiền</Label>
              <VNDInput value={amount} onChange={setAmount} placeholder="0" />
            </div>
          </div>
          <Button onClick={handleAdd} disabled={!debitAccount || !creditAccount || !amount || submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Thêm bút toán
          </Button>
        </CardContent>
      </Card>

      {/* Danh sách bút toán */}
      {entries.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between px-2">
            <p className="text-xs text-gray-500">{entries.length} bút toán</p>
            <Button size="sm" variant="outline" onClick={() => exportJournalExcel(entries, nameOf)}>
              <FileSpreadsheet className="h-3.5 w-3.5" /> Xuất Excel
            </Button>
          </div>
          <datalist id="adj-account-options">
            {accountOptions.map(a => <option key={a.code} value={a.code}>{a.name}</option>)}
          </datalist>
          <div className="grid grid-cols-12 gap-2 px-2 text-xs text-gray-400 font-medium">
            <span className="col-span-2">Ngày</span>
            <span className="col-span-3">Diễn giải</span>
            <span className="col-span-2">TK Nợ</span>
            <span className="col-span-2">TK Có</span>
            <span className="col-span-2 text-right">Số tiền</span>
            <span />
          </div>
          {entries.map(e => editingId === e.id ? (
            <div key={e.id} className="rounded border border-indigo-200 bg-indigo-50/40 p-2 text-sm space-y-1.5">
              <div className="grid grid-cols-12 gap-2 items-center">
                <Input className="col-span-2 h-8 text-xs" type="date" value={form.date} onChange={ev => setForm(f => ({ ...f, date: ev.target.value }))} />
                <Input className="col-span-3 h-8 text-xs" value={form.description} onChange={ev => setForm(f => ({ ...f, description: ev.target.value }))} />
                <Input className="col-span-2 h-8 px-2 text-xs font-mono" list="adj-account-options" value={form.debit} onChange={ev => setForm(f => ({ ...f, debit: ev.target.value.trim() }))} />
                <Input className="col-span-2 h-8 px-2 text-xs font-mono" list="adj-account-options" value={form.credit} onChange={ev => setForm(f => ({ ...f, credit: ev.target.value.trim() }))} />
                <div className="col-span-2"><VNDInput className="h-8 text-xs" value={form.amount} onChange={n => setForm(f => ({ ...f, amount: n }))} /></div>
                <div className="flex justify-end gap-1">
                  <button title="Lưu" disabled={updateEntry.isPending} onClick={() => updateEntry.mutate(e.id)} className="p-1 text-green-600 hover:text-green-700"><Check className="h-4 w-4" /></button>
                  <button title="Hủy" onClick={() => setEditingId(null)} className="p-1 text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
                </div>
              </div>
              <div className="grid grid-cols-12 gap-2 items-center">
                <span className="col-span-5 text-right text-xs text-gray-500">Thuế GTGT (nếu có):</span>
                <Input className="col-span-2 h-8 px-2 text-xs font-mono" placeholder="Nợ" list="adj-account-options" value={form.vatDebit} onChange={ev => setForm(f => ({ ...f, vatDebit: ev.target.value.trim() }))} />
                <Input className="col-span-2 h-8 px-2 text-xs font-mono" placeholder="Có" list="adj-account-options" value={form.vatCredit} onChange={ev => setForm(f => ({ ...f, vatCredit: ev.target.value.trim() }))} />
                <div className="col-span-2"><VNDInput className="h-8 text-xs" value={form.vat} onChange={n => setForm(f => ({ ...f, vat: n }))} /></div>
              </div>
            </div>
          ) : (
            <div key={e.id} className="grid grid-cols-12 gap-2 items-center p-2.5 rounded border border-gray-100 hover:bg-gray-50 text-sm group">
              <span className="col-span-2 text-xs text-gray-400">{formatDate(e.date)}</span>
              <span className="col-span-3 text-gray-900 truncate" title={e.description ?? ''}>{e.description || '—'}</span>
              <span className="col-span-2 text-xs font-mono text-gray-600" title={nameOf(e.debit_account)}>{e.debit_account}</span>
              <span className="col-span-2 text-xs font-mono text-gray-600" title={nameOf(e.credit_account)}>{e.credit_account}</span>
              <div className="col-span-2 text-right">
                <span className="font-medium">{formatVND(e.amount)}</span>
                {e.vat_amount > 0 && e.vat_debit_account && e.vat_credit_account && (
                  <p className="text-[11px] text-gray-400" title={`Thuế GTGT: Nợ ${e.vat_debit_account} / Có ${e.vat_credit_account}`}>+ VAT {formatVND(e.vat_amount)}</p>
                )}
              </div>
              <div className="flex items-center justify-end gap-1">
                <button title="Sửa" onClick={() => startEdit(e)} className="p-1 text-gray-300 hover:text-indigo-500"><Pencil className="h-3.5 w-3.5" /></button>
                <button
                  title="Xóa"
                  onClick={() => { if (confirm('Xóa bút toán này?')) deleteEntry.mutate(e.id) }}
                  className="p-1 text-gray-300 hover:text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {entries.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-4">Chưa có bút toán điều chỉnh nào</p>
      )}
    </div>
  )
}

// --- Main LedgerTab ---

const SECTIONS = [
  { id: 'chiphi', label: 'Chi phí', description: 'Hạch toán chi phí từ sao kê ngân hàng' },
  { id: 'doanhthu', label: 'Doanh thu', description: 'Hạch toán hóa đơn bán ra' },
  { id: 'dieuchinh', label: 'Bút toán điều chỉnh', description: 'Phân bổ, trích trước, khấu hao, điều chỉnh cuối kỳ' },
]

export default function LedgerTab({ companyId }: { companyId: string }) {
  const [openSection, setOpenSection] = useState<string>('chiphi')

  return (
    <div className="space-y-3">
      {SECTIONS.map(s => (
        <div key={s.id} className="border border-gray-200 rounded-lg overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-gray-50 transition-colors text-left"
            onClick={() => setOpenSection(openSection === s.id ? '' : s.id)}
          >
            <div>
              <span className="font-medium text-gray-900">{s.label}</span>
              <span className="text-xs text-gray-400 ml-2">{s.description}</span>
            </div>
            {openSection === s.id
              ? <ChevronDown className="h-4 w-4 text-gray-400" />
              : <ChevronRight className="h-4 w-4 text-gray-400" />}
          </button>
          {openSection === s.id && (
            <div className="px-4 pb-4 pt-2 border-t border-gray-100 bg-gray-50/30">
              {s.id === 'chiphi' && <SectionChiPhi companyId={companyId} />}
              {s.id === 'doanhthu' && <SectionDoanhThu companyId={companyId} />}
              {s.id === 'dieuchinh' && <SectionButToanDieuChinh companyId={companyId} />}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
