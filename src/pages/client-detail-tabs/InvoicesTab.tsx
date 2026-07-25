// Safari < 16.4 polyfill: pdfjs v5 uses `for await` on ReadableStream internally
if (typeof ReadableStream !== 'undefined' && !(Symbol.asyncIterator in ReadableStream.prototype)) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(ReadableStream.prototype as any)[Symbol.asyncIterator] = async function* (this: ReadableStream) {
    const reader = this.getReader()
    try { while (true) { const { done, value } = await reader.read(); if (done) return; yield value } }
    finally { reader.releaseLock() }
  }
}

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Upload, FileText, X, CheckCircle2, ArrowDownCircle,
  ArrowUpCircle, AlertCircle, BookOpen, ChevronDown, ChevronUp, Trash2, Eye, Pencil, Plus,
} from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/shared/Dialog'
import { Button } from '@/components/shared/Button'
import { AccountPicker } from '@/components/shared/AccountPicker'
import { supabase } from '@/lib/supabase'
import { suggestAccounts, COMMON_ACCOUNTS, getAccountName } from '@/lib/accountSuggestion'
import { cn } from '@/lib/utils'
import type { Invoice, JournalEntry, AccountType } from '@/types'
// ─── PDF text extraction ──────────────────────────────────────────────────────

async function extractPdfText(buffer: ArrayBuffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  // Use CDN URL matching the installed version — avoids Vite worker bundling issues
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise
  const parts: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    parts.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '))
  }
  return parts.join('\n')
}

// ─── Parse via edge function ──────────────────────────────────────────────────

interface ParsedInvoice {
  invoiceNumber: string | null
  invoiceSeries: string | null
  invoiceDate: string | null
  sellerName: string | null
  sellerMst: string | null
  sellerAddress: string | null
  buyerName: string | null
  buyerMst: string | null
  buyerAddress: string | null
  subtotal: number
  vatAmount: number
  total: number
  vatRate: string
  lineItems: object[]
  direction: 'incoming' | 'outgoing'
  fileName: string
  ext: string
}

async function parseInvoiceFile(file: File, companyMst: string): Promise<ParsedInvoice> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  let fileText: string
  if (ext === 'pdf') {
    fileText = await extractPdfText(await file.arrayBuffer())
  } else {
    fileText = await file.text()
  }
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-invoice`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token ?? ''}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ fileName: file.name, fileText, company_mst: companyMst }),
    }
  )
  const json = await res.json()
  if (!json.ok) throw new Error(json.error ?? 'Parse failed')
  return { ...json.data, fileName: file.name, ext }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) => new Intl.NumberFormat('vi-VN').format(n)

// Suy ra năm / tháng / quý từ ngày hóa đơn (dùng cho kho hóa đơn)
function periodOf(dateStr: string | null): { year: number; month: number; quarter: number } | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  const month = d.getMonth() + 1
  return { year: d.getFullYear(), month, quarter: Math.ceil(month / 3) }
}

const STATUS_LABEL: Record<Invoice['status'], string> = {
  pending: 'Chờ hạch toán',
  matched: 'Đã khớp',
  posted: 'Đã hạch toán',
}
const STATUS_CLASS: Record<Invoice['status'], string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  matched: 'bg-blue-50 text-blue-700 border-blue-200',
  posted: 'bg-green-50 text-green-700 border-green-200',
}

interface UploadItem {
  id: string
  file: File
  state: 'pending' | 'parsing' | 'done' | 'error'
  error?: string
}

// ─── Post dialog ──────────────────────────────────────────────────────────────

function PostInvoiceDialog({ invoice, onClose, onPosted, mode = 'create' }: {
  invoice: Invoice
  onClose: () => void
  onPosted: () => void
  mode?: 'create' | 'edit'
}) {
  const qc = useQueryClient()
  const suggestion = suggestAccounts(invoice)
  const isIncoming = invoice.direction === 'incoming'
  const [debitAccount, setDebitAccount] = useState(suggestion.debitAccount)
  const [creditAccount, setCreditAccount] = useState(suggestion.creditAccount)
  const [vatDebit, setVatDebit] = useState(suggestion.vatDebitAccount ?? '')
  const [vatCredit, setVatCredit] = useState(suggestion.vatCreditAccount ?? '')
  const [notes, setNotes] = useState('')
  // Diễn giải: ưu tiên diễn giải đã lưu trên hóa đơn, nếu trống thì tạo mặc định
  const defaultDescription = invoice.description?.trim() || (isIncoming
    ? `Mua hàng từ ${invoice.seller_name ?? 'NCC'} - HĐ ${invoice.invoice_series}/${invoice.invoice_number}`
    : `Bán hàng cho ${invoice.buyer_name ?? 'KH'} - HĐ ${invoice.invoice_series}/${invoice.invoice_number}`)
  const [description, setDescription] = useState(defaultDescription)
  const [loading, setLoading] = useState(false)
  const [existingEntryId, setExistingEntryId] = useState<string | null>(null)

  // Danh mục tài khoản của công ty (đã seed sẵn, có cả tk con) — dùng cho gợi ý combobox
  const { data: dbAccounts = [] } = useQuery({
    queryKey: ['accounts', invoice.company_id],
    queryFn: async () => {
      const { data, error } = await supabase.from('accounts')
        .select('code, name, type, parent_code')
        .eq('company_id', invoice.company_id).order('code')
      if (error) throw error
      return data as { code: string; name: string; type: AccountType; parent_code: string | null }[]
    },
  })

  const accountOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const a of COMMON_ACCOUNTS) map.set(a.code, a.name)
    for (const a of dbAccounts) map.set(a.code, a.name)
    return [...map.entries()]
      .map(([code, name]) => ({ code, name }))
      .sort((x, y) => x.code.localeCompare(y.code))
  }, [dbAccounts])

  // Ghi nhớ tài khoản con mới gõ tay → lưu vào danh mục để lần sau tự gợi ý
  async function rememberAccounts(codes: string[]) {
    const existing = new Set(dbAccounts.map(a => a.code))
    const newCodes = [...new Set(codes.filter(Boolean))].filter(c => !existing.has(c))
    if (newCodes.length === 0) return
    const rows = newCodes.map(code => {
      const parentCode = code.length > 3 ? code.slice(0, 3) : null
      const parent = dbAccounts.find(a => a.code === parentCode)
      const known = getAccountName(code)
      return {
        company_id: invoice.company_id,
        code,
        name: known !== code ? known : parent ? `${parent.name} (${code})` : `Tài khoản ${code}`,
        type: (parent?.type ?? 'expense') as AccountType,
        parent_code: parent ? parentCode : null,
      }
    })
    try {
      await supabase.from('accounts').upsert(rows, { onConflict: 'company_id,code', ignoreDuplicates: true })
      qc.invalidateQueries({ queryKey: ['accounts', invoice.company_id] })
    } catch { /* ghi nhớ là phụ, lỗi không chặn hạch toán */ }
  }

  // Thêm tài khoản con mới kèm tên, lưu ngay vào danh mục
  async function createAccount(code: string, name: string) {
    const parentCode = code.length > 3 ? code.slice(0, 3) : null
    const parent = dbAccounts.find(a => a.code === parentCode)
    const finalName = name || (getAccountName(code) !== code ? getAccountName(code) : parent ? `${parent.name} (${code})` : `Tài khoản ${code}`)
    await supabase.from('accounts').upsert({
      company_id: invoice.company_id,
      code,
      name: finalName,
      type: (parent?.type ?? 'expense') as AccountType,
      parent_code: parent ? parentCode : null,
    }, { onConflict: 'company_id,code' })
    qc.invalidateQueries({ queryKey: ['accounts', invoice.company_id] })
  }

  // In edit mode, load existing journal entry and prefill
  useEffect(() => {
    if (mode !== 'edit') return
    supabase
      .from('journal_entries')
      .select('*')
      .eq('invoice_id', invoice.id)
      .single()
      .then(({ data }) => {
        if (data) {
          const entry = data as JournalEntry
          setExistingEntryId(entry.id)
          setDebitAccount(entry.debit_account)
          setCreditAccount(entry.credit_account)
          setVatDebit(entry.vat_debit_account ?? '')
          setVatCredit(entry.vat_credit_account ?? '')
          setNotes(entry.notes ?? '')
          if (entry.description) setDescription(entry.description)
        }
      })
  }, [mode, invoice.id])

  async function handlePost() {
    setLoading(true)
    try {
      const entryData = {
        company_id: invoice.company_id,
        date: invoice.invoice_date ?? new Date().toISOString().split('T')[0],
        description: description.trim() || defaultDescription,
        type: 'invoice',
        debit_account: debitAccount,
        credit_account: creditAccount,
        amount: invoice.subtotal,
        vat_debit_account: vatDebit || null,
        vat_credit_account: vatCredit || null,
        vat_amount: invoice.vat_amount,
        invoice_id: invoice.id,
        notes: notes || null,
        status: 'posted',
      }

      if (mode === 'edit' && existingEntryId) {
        const { error } = await supabase.from('journal_entries').update(entryData).eq('id', existingEntryId)
        if (error) throw error
        // Đồng bộ diễn giải về hóa đơn để lên bảng kê
        await supabase.from('invoices').update({ description: description.trim() || null }).eq('id', invoice.id)
      } else {
        const { error: e1 } = await supabase.from('journal_entries').insert(entryData)
        if (e1) throw e1
        const { error: e2 } = await supabase.from('invoices')
          .update({ status: 'posted', description: description.trim() || null }).eq('id', invoice.id)
        if (e2) throw e2
      }

      // Ghi nhớ tài khoản con mới (nếu có)
      await rememberAccounts([debitAccount, creditAccount, vatDebit, vatCredit])

      onPosted()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === 'edit' ? 'Sửa hạch toán' : 'Hạch toán hóa đơn'}</DialogTitle>
        </DialogHeader>

        <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Hóa đơn</span>
            <span className="font-mono font-medium">{invoice.invoice_series}/{invoice.invoice_number}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">{isIncoming ? 'Nhà cung cấp' : 'Khách hàng'}</span>
            <span className="font-medium text-right max-w-[220px] truncate">
              {isIncoming ? invoice.seller_name : invoice.buyer_name}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Ngày</span>
            <span>{invoice.invoice_date ? new Date(invoice.invoice_date).toLocaleDateString('vi-VN') : '—'}</span>
          </div>
          <div className="border-t border-slate-200 pt-1 mt-1 flex justify-between font-semibold">
            <span>Tổng cộng</span>
            <span className="font-mono">{fmt(invoice.total)} đ</span>
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-semibold text-slate-600">Bút toán hạch toán</p>
          <p className="text-xs text-slate-400 -mt-1">Bấm để chọn, gõ để tìm theo mã/tên. Cần tài khoản con mới (VD 6421) thì gõ mã — app tự nhớ cho lần sau.</p>
          <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 text-sm overflow-hidden">
            {[
              { label: 'Nợ', value: debitAccount, onChange: setDebitAccount, amount: invoice.subtotal },
              { label: 'Có', value: creditAccount, onChange: setCreditAccount, amount: invoice.subtotal },
            ].map(({ label, value, onChange, amount }) => (
              <div key={label} className="flex items-center gap-3 px-4 py-2.5 odd:bg-slate-50">
                <span className="w-8 text-xs font-bold text-slate-400">{label}</span>
                <AccountPicker value={value} onChange={onChange} accounts={accountOptions} onCreate={createAccount} placeholder="Chọn tài khoản" className="flex-1" />
                <span className="font-mono text-slate-600 text-xs">{fmt(amount)}</span>
              </div>
            ))}
          </div>

          {invoice.vat_amount > 0 && (
            <>
              <p className="text-xs text-slate-400">Dòng VAT ({invoice.vat_rate})</p>
              <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 text-sm overflow-hidden">
                {[
                  { label: 'Nợ', value: vatDebit, onChange: setVatDebit },
                  { label: 'Có', value: vatCredit, onChange: setVatCredit },
                ].map(({ label, value, onChange }) => (
                  <div key={label} className="flex items-center gap-3 px-4 py-2.5 odd:bg-slate-50">
                    <span className="w-8 text-xs font-bold text-slate-400">{label}</span>
                    <AccountPicker value={value} onChange={onChange} accounts={accountOptions} onCreate={createAccount} placeholder="— Không có —" allowEmpty className="flex-1" />
                    <span className="font-mono text-slate-600 text-xs">{fmt(invoice.vat_amount)}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          <div>
            <label className="text-xs font-semibold text-slate-500">Diễn giải</label>
            <input value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Diễn giải bút toán"
              className="w-full mt-1 text-sm border border-slate-200 rounded-xl px-3 py-2
                focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>

          <textarea value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Ghi chú (không bắt buộc)" rows={2}
            className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2
              focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none" />
        </div>

        <div className="flex gap-2 justify-end pt-1">
          <Button variant="ghost" onClick={onClose} disabled={loading}>Hủy</Button>
          <Button onClick={handlePost} disabled={loading || (mode === 'edit' && !existingEntryId)}>
            <BookOpen className="h-4 w-4 mr-1.5" />
            {loading ? 'Đang lưu...' : mode === 'edit' ? 'Lưu thay đổi' : 'Hạch toán'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Invoice Detail Dialog (B1) ───────────────────────────────────────────────

const FORMAT_LABEL: Record<string, string> = { pdf: 'PDF', xml: 'XML', html: 'HTML / E-invoice' }
const DIRECTION_LABEL: Record<string, string> = { incoming: 'Hóa đơn mua vào', outgoing: 'Hóa đơn bán ra' }

interface LineItemDraft {
  id: string
  description: string
  quantity: string
  unitPrice: string
  amount: string
}

function InvoiceDetailDialog({ invoice, onClose, onPost, onEdit }: {
  invoice: Invoice
  onClose: () => void
  onPost: () => void
  onEdit: () => void
}) {
  const qc = useQueryClient()
  const isIncoming = invoice.direction === 'incoming'
  const [isEditing, setIsEditing] = useState(false)

  // Edit form state
  const [editDate, setEditDate] = useState(invoice.invoice_date ?? '')
  const [editVatRate, setEditVatRate] = useState(invoice.vat_rate ?? '')
  const [editSellerName, setEditSellerName] = useState(invoice.seller_name ?? '')
  const [editBuyerName, setEditBuyerName] = useState(invoice.buyer_name ?? '')
  const [editSellerMst, setEditSellerMst] = useState(invoice.seller_mst ?? '')
  const [editBuyerMst, setEditBuyerMst] = useState(invoice.buyer_mst ?? '')
  const [editSellerAddress, setEditSellerAddress] = useState(invoice.seller_address ?? '')
  const [editBuyerAddress, setEditBuyerAddress] = useState(invoice.buyer_address ?? '')
  const [editDescription, setEditDescription] = useState(invoice.description ?? '')
  const [editLineItems, setEditLineItems] = useState<LineItemDraft[]>(() =>
    invoice.line_items.length > 0
      ? (invoice.line_items as { description: string; quantity: number; unitPrice: number; amount: number }[]).map((li, i) => ({
          id: String(i),
          description: li.description ?? '',
          quantity: String(li.quantity ?? ''),
          unitPrice: String(li.unitPrice ?? ''),
          amount: String(li.amount ?? ''),
        }))
      : []
  )

  function addLineItem() {
    setEditLineItems(items => [...items, { id: crypto.randomUUID(), description: '', quantity: '1', unitPrice: '', amount: '' }])
  }

  function removeLineItem(id: string) {
    setEditLineItems(items => items.filter(x => x.id !== id))
  }

  function updateLineItem(id: string, field: keyof LineItemDraft, value: string) {
    setEditLineItems(items => items.map(item => {
      if (item.id !== id) return item
      const updated = { ...item, [field]: value }
      // Auto-calculate amount when qty or unitPrice changes
      if (field === 'quantity' || field === 'unitPrice') {
        const qty = parseFloat(field === 'quantity' ? value : item.quantity) || 0
        const price = parseFloat(field === 'unitPrice' ? value : item.unitPrice) || 0
        updated.amount = qty && price ? String(Math.round(qty * price)) : updated.amount
      }
      return updated
    }))
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const lineItems = editLineItems.map(li => ({
        description: li.description,
        quantity: parseFloat(li.quantity) || 0,
        unitPrice: parseFloat(li.unitPrice) || 0,
        amount: parseFloat(li.amount) || 0,
      }))
      await supabase.from('invoices').update({
        invoice_date: editDate || null,
        vat_rate: editVatRate || null,
        seller_name: editSellerName || null,
        seller_mst: editSellerMst || null,
        seller_address: editSellerAddress || null,
        buyer_name: editBuyerName || null,
        buyer_mst: editBuyerMst || null,
        buyer_address: editBuyerAddress || null,
        description: editDescription || null,
        line_items: lineItems,
      }).eq('id', invoice.id)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices', invoice.company_id] })
      setIsEditing(false)
    },
  })

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isIncoming
              ? <ArrowDownCircle className="h-5 w-5 text-orange-400" />
              : <ArrowUpCircle className="h-5 w-5 text-green-500" />}
            {DIRECTION_LABEL[invoice.direction]}
            <button
              onClick={() => setIsEditing(e => !e)}
              className={cn('ml-auto flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-colors',
                isEditing ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'border-slate-200 text-slate-400 hover:text-indigo-500 hover:border-indigo-200'
              )}
            >
              <Pencil className="h-3 w-3" /> {isEditing ? 'Đang sửa' : 'Sửa thông tin'}
            </button>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {/* File info */}
          <div className="flex items-center gap-3 rounded-lg bg-slate-50 border border-slate-200 px-4 py-3">
            <FileText className="h-4 w-4 text-slate-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-slate-700 truncate">{invoice.file_name ?? '—'}</p>
              <p className="text-xs text-slate-400">
                {invoice.source_format ? FORMAT_LABEL[invoice.source_format] : '—'} ·
                Nhập ngày {new Date(invoice.created_at).toLocaleDateString('vi-VN')}
              </p>
            </div>
            <span className={cn('px-2 py-0.5 rounded-full text-xs border', STATUS_CLASS[invoice.status])}>
              {STATUS_LABEL[invoice.status]}
            </span>
          </div>

          {/* Parties */}
          <div className="grid grid-cols-2 gap-3">
            {[
              {
                label: 'Bên bán', val: editSellerName, set: setEditSellerName, display: invoice.seller_name,
                mst: editSellerMst, setMst: setEditSellerMst, displayMst: invoice.seller_mst,
                addr: editSellerAddress, setAddr: setEditSellerAddress, displayAddr: invoice.seller_address,
              },
              {
                label: 'Bên mua', val: editBuyerName, set: setEditBuyerName, display: invoice.buyer_name,
                mst: editBuyerMst, setMst: setEditBuyerMst, displayMst: invoice.buyer_mst,
                addr: editBuyerAddress, setAddr: setEditBuyerAddress, displayAddr: invoice.buyer_address,
              },
            ].map(({ label, val, set, display, mst, setMst, displayMst, addr, setAddr, displayAddr }) => (
              <div key={label} className="rounded-lg border border-slate-200 p-3 space-y-1.5">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
                {isEditing
                  ? <input value={val} onChange={e => set(e.target.value)} placeholder="Tên đơn vị" className="w-full text-sm font-semibold text-slate-800 border-b border-slate-200 focus:border-indigo-400 focus:outline-none bg-transparent pb-0.5" />
                  : <p className="font-semibold text-slate-800">{display ?? '—'}</p>
                }
                {isEditing
                  ? <div className="flex items-baseline gap-1">
                      <span className="text-xs text-slate-400 shrink-0">MST:</span>
                      <input value={mst} onChange={e => setMst(e.target.value)} placeholder="Mã số thuế" className="w-full text-xs text-slate-600 border-b border-slate-200 focus:border-indigo-400 focus:outline-none bg-transparent" />
                    </div>
                  : displayMst && <p className="text-xs text-slate-500">MST: {displayMst}</p>
                }
                {isEditing
                  ? <div className="flex items-baseline gap-1">
                      <span className="text-xs text-slate-400 shrink-0">Đ/c:</span>
                      <input value={addr} onChange={e => setAddr(e.target.value)} placeholder="Địa chỉ" className="w-full text-xs text-slate-600 border-b border-slate-200 focus:border-indigo-400 focus:outline-none bg-transparent" />
                    </div>
                  : displayAddr && <p className="text-xs text-slate-500">Đ/c: {displayAddr}</p>
                }
              </div>
            ))}
          </div>

          {/* Diễn giải */}
          <div className="rounded-lg border border-slate-200 p-3 space-y-1.5">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Diễn giải</p>
            {isEditing
              ? <input value={editDescription} onChange={e => setEditDescription(e.target.value)} placeholder="Nội dung hàng hóa / dịch vụ (dùng làm diễn giải khi lên bảng kê)" className="w-full text-sm text-slate-800 border-b border-slate-200 focus:border-indigo-400 focus:outline-none bg-transparent pb-0.5" />
              : <p className="text-sm text-slate-700">{invoice.description || <span className="text-amber-500">Chưa có — bấm "Sửa thông tin" để điền</span>}</p>
            }
          </div>

          {/* Invoice details */}
          <div className="rounded-lg border border-slate-200 divide-y divide-slate-100">
            <div className="flex justify-between items-center px-4 py-2.5">
              <span className="text-slate-500">Số hóa đơn</span>
              <span className="font-medium">{invoice.invoice_series ?? ''}/{invoice.invoice_number ?? '—'}</span>
            </div>
            <div className="flex justify-between items-center px-4 py-2.5">
              <span className="text-slate-500">Ngày hóa đơn</span>
              {isEditing
                ? <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className="text-sm font-medium border border-slate-200 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-400" />
                : <span className="font-medium">{invoice.invoice_date ? new Date(invoice.invoice_date).toLocaleDateString('vi-VN') : <span className="text-amber-500">Chưa có — bấm Sửa để điền</span>}</span>
              }
            </div>
            <div className="flex justify-between items-center px-4 py-2.5">
              <span className="text-slate-500">Thuế suất VAT</span>
              {isEditing
                ? <input value={editVatRate} onChange={e => setEditVatRate(e.target.value)} placeholder="10%" className="w-24 text-sm font-medium border border-slate-200 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-400 text-right" />
                : <span className="font-medium">{invoice.vat_rate ?? <span className="text-amber-500">Chưa có</span>}</span>
              }
            </div>
          </div>

          {/* Line items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Hàng hóa / Dịch vụ</p>
              {isEditing && (
                <button onClick={addLineItem} className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700">
                  <Plus className="h-3 w-3" /> Thêm dòng
                </button>
              )}
            </div>

            {(isEditing ? editLineItems.length > 0 : invoice.line_items.length > 0) ? (
              <div className="rounded-lg border border-slate-200 overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr className="text-slate-500">
                      <th className="text-left px-3 py-2">Tên hàng hóa / dịch vụ</th>
                      <th className="text-right px-3 py-2 w-12">SL</th>
                      <th className="text-right px-3 py-2 w-24">Đơn giá</th>
                      <th className="text-right px-3 py-2 w-24">Thành tiền</th>
                      {isEditing && <th className="w-8" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {isEditing
                      ? editLineItems.map(li => (
                          <tr key={li.id}>
                            <td className="px-2 py-1">
                              <input value={li.description} onChange={e => updateLineItem(li.id, 'description', e.target.value)} placeholder="Tên hàng hóa / dịch vụ" className="w-full border-b border-slate-200 focus:border-indigo-400 focus:outline-none text-slate-700 bg-transparent" />
                            </td>
                            <td className="px-2 py-1">
                              <input value={li.quantity} onChange={e => updateLineItem(li.id, 'quantity', e.target.value)} className="w-full text-right border-b border-slate-200 focus:border-indigo-400 focus:outline-none bg-transparent" />
                            </td>
                            <td className="px-2 py-1">
                              <input value={li.unitPrice} onChange={e => updateLineItem(li.id, 'unitPrice', e.target.value)} className="w-full text-right border-b border-slate-200 focus:border-indigo-400 focus:outline-none font-mono bg-transparent" />
                            </td>
                            <td className="px-2 py-1">
                              <input value={li.amount} onChange={e => updateLineItem(li.id, 'amount', e.target.value)} className="w-full text-right border-b border-slate-200 focus:border-indigo-400 focus:outline-none font-mono font-medium bg-transparent" />
                            </td>
                            <td className="px-2 py-1 text-center">
                              <button onClick={() => removeLineItem(li.id)} className="text-slate-300 hover:text-red-400"><X className="h-3.5 w-3.5" /></button>
                            </td>
                          </tr>
                        ))
                      : (invoice.line_items as { description: string; quantity: number; unitPrice: number; amount: number }[]).map((li, i) => (
                          <tr key={i}>
                            <td className="px-3 py-2 text-slate-700">{li.description}</td>
                            <td className="px-3 py-2 text-right text-slate-500">{li.quantity}</td>
                            <td className="px-3 py-2 text-right font-mono">{fmt(li.unitPrice)}</td>
                            <td className="px-3 py-2 text-right font-mono font-medium">{fmt(li.amount)}</td>
                          </tr>
                        ))
                    }
                  </tbody>
                </table>
              </div>
            ) : (
              <div className={cn('rounded-lg border px-4 py-3 text-xs', isEditing ? 'border-dashed border-indigo-200 bg-indigo-50 text-indigo-400' : 'border-slate-100 text-slate-400')}>
                {isEditing ? 'Bấm "Thêm dòng" để nhập hàng hóa / dịch vụ' : 'Parser không đọc được dòng hàng — bấm "Sửa thông tin" để điền tay'}
              </div>
            )}
          </div>

          {/* Totals */}
          <div className="rounded-lg border border-slate-200 divide-y divide-slate-100">
            <div className="flex justify-between px-4 py-2.5 text-slate-600">
              <span>Tiền hàng (chưa VAT)</span>
              <span className="font-mono">{fmt(invoice.subtotal)} đ</span>
            </div>
            <div className="flex justify-between px-4 py-2.5 text-slate-600">
              <span>Thuế VAT ({invoice.vat_rate ?? editVatRate})</span>
              <span className="font-mono">{fmt(invoice.vat_amount)} đ</span>
            </div>
            <div className="flex justify-between px-4 py-2.5 font-bold text-slate-800">
              <span>Tổng cộng</span>
              <span className="font-mono text-lg">{fmt(invoice.total)} đ</span>
            </div>
          </div>
        </div>

        <div className="flex gap-2 justify-end pt-2 border-t border-slate-100">
          <Button variant="ghost" onClick={onClose}>Đóng</Button>
          {isEditing && (
            <>
              <Button variant="outline" onClick={() => setIsEditing(false)}>Huỷ</Button>
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? 'Đang lưu...' : 'Lưu thông tin'}
              </Button>
            </>
          )}
          {!isEditing && invoice.status === 'pending' && (
            <Button onClick={onPost}>
              <BookOpen className="h-4 w-4 mr-1.5" /> Hạch toán
            </Button>
          )}
          {!isEditing && invoice.status === 'posted' && (
            <Button variant="outline" onClick={onEdit}>
              <Pencil className="h-4 w-4 mr-1.5" /> Sửa hạch toán
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main tab component ───────────────────────────────────────────────────────

export default function InvoicesTab({ companyId, companyMst }: {
  companyId: string
  companyMst: string
}) {
  const queryClient = useQueryClient()
  const [uploads, setUploads] = useState<UploadItem[]>([])
  const [dragging, setDragging] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [postingInvoice, setPostingInvoice] = useState<Invoice | null>(null)
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null)
  const [detailInvoice, setDetailInvoice] = useState<Invoice | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: invoices = [] } = useQuery<Invoice[]>({
    queryKey: ['invoices', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices').select('*')
        .eq('company_id', companyId)
        .order('invoice_date', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      // Check if any have journal entries
      const targets = invoices.filter(i => ids.includes(i.id))
      const posted = targets.filter(i => i.status === 'posted' || i.status === 'matched')
      if (posted.length > 0) {
        const ok = confirm(
          `${posted.length > 1 ? `${posted.length} hóa đơn` : 'Hóa đơn này'} đã hạch toán. Xóa sẽ đồng thời xóa bút toán liên kết và ảnh hưởng đến báo cáo. Tiếp tục?`
        )
        if (!ok) return
        // Cascade delete journal entries
        await supabase.from('journal_entries').delete().in('invoice_id', ids)
      }
      const { error } = await supabase.from('invoices').delete().in('id', ids)
      if (error) throw error
    },
    onSuccess: () => {
      setSelectedIds(new Set())
      queryClient.invalidateQueries({ queryKey: ['invoices', companyId] })
      queryClient.invalidateQueries({ queryKey: ['all-journal-entries', companyId] })
    },
  })

  const toggleSelect = (id: string) => setSelectedIds(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  const toggleAll = (ids: string[]) => setSelectedIds(prev => {
    const allSelected = ids.length > 0 && ids.every(id => prev.has(id))
    const next = new Set(prev)
    if (allSelected) ids.forEach(id => next.delete(id))
    else ids.forEach(id => next.add(id))
    return next
  })

  const saveMutation = useMutation({
    mutationFn: async (parsed: ParsedInvoice) => {
      // Diễn giải tự động = tên dòng hàng đầu tiên (nếu parser đọc được)
      const firstItem = parsed.lineItems[0] as { description?: string } | undefined
      const autoDescription = firstItem?.description?.trim() || null
      const { error } = await supabase.from('invoices').insert({
        company_id: companyId,
        direction: parsed.direction,
        invoice_number: parsed.invoiceNumber,
        invoice_series: parsed.invoiceSeries,
        invoice_date: parsed.invoiceDate,
        seller_name: parsed.sellerName,
        seller_mst: parsed.sellerMst,
        seller_address: parsed.sellerAddress,
        buyer_name: parsed.buyerName,
        buyer_mst: parsed.buyerMst,
        buyer_address: parsed.buyerAddress,
        subtotal: parsed.subtotal,
        vat_amount: parsed.vatAmount,
        total: parsed.total,
        vat_rate: parsed.vatRate,
        line_items: parsed.lineItems,
        description: autoDescription,
        file_name: parsed.fileName,
        source_format: parsed.ext as 'pdf' | 'xml' | 'html',
      })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['invoices', companyId] }),
  })

  const processFiles = useCallback(async (files: File[]) => {
    const newItems: UploadItem[] = files.map(f => ({ id: crypto.randomUUID(), file: f, state: 'pending' }))
    setUploads(prev => [...newItems, ...prev])
    for (const item of newItems) {
      setUploads(prev => prev.map(u => u.id === item.id ? { ...u, state: 'parsing' } : u))
      try {
        const result = await parseInvoiceFile(item.file, companyMst)
        await saveMutation.mutateAsync(result)
        setUploads(prev => prev.map(u => u.id === item.id ? { ...u, state: 'done' } : u))
      } catch (err) {
        setUploads(prev => prev.map(u =>
          u.id === item.id ? { ...u, state: 'error', error: (err as Error).message } : u
        ))
      }
    }
  }, [companyMst, saveMutation])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    processFiles(Array.from(e.dataTransfer.files).filter(f =>
      ['pdf', 'xml', 'html', 'htm'].includes(f.name.split('.').pop()?.toLowerCase() ?? '')
    ))
  }, [processFiles])

  const pending = invoices.filter(i => i.status === 'pending')
  const posted = invoices.filter(i => i.status === 'posted')

  // ── Kho hóa đơn: lọc & nhóm theo quý / tháng ──
  const [filterYear, setFilterYear] = useState<number | 'all'>('all')
  const [filterQuarter, setFilterQuarter] = useState<number | 'all'>('all')
  const [filterMonth, setFilterMonth] = useState<number | 'all'>('all')

  const availableYears = useMemo(() => {
    const ys = new Set<number>()
    for (const inv of invoices) {
      const p = periodOf(inv.invoice_date)
      if (p) ys.add(p.year)
    }
    return [...ys].sort((a, b) => b - a)
  }, [invoices])

  const filteredInvoices = useMemo(() => invoices.filter(inv => {
    const p = periodOf(inv.invoice_date)
    if (filterYear !== 'all' && (!p || p.year !== filterYear)) return false
    if (filterQuarter !== 'all' && (!p || p.quarter !== filterQuarter)) return false
    if (filterMonth !== 'all' && (!p || p.month !== filterMonth)) return false
    return true
  }), [invoices, filterYear, filterQuarter, filterMonth])

  const groupedInvoices = useMemo(() => {
    const map = new Map<string, { label: string; items: Invoice[] }>()
    for (const inv of filteredInvoices) {
      const p = periodOf(inv.invoice_date)
      const key = p ? `${p.year}-${String(p.month).padStart(2, '0')}` : '0000-00'
      const label = p ? `Tháng ${p.month}/${p.year}` : 'Chưa có ngày'
      if (!map.has(key)) map.set(key, { label, items: [] })
      map.get(key)!.items.push(inv)
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([, v]) => v)
  }, [filteredInvoices])

  const filtering = filterYear !== 'all' || filterQuarter !== 'all' || filterMonth !== 'all'

  return (
    <div className="space-y-5">
      {/* Stats */}
      {invoices.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Chờ hạch toán', value: pending.length, color: 'text-amber-600', bg: 'bg-amber-50' },
            { label: 'Đã hạch toán', value: posted.length, color: 'text-green-600', bg: 'bg-green-50' },
            {
              label: 'Tổng VAT đầu vào',
              value: fmt(invoices.filter(i => i.direction === 'incoming').reduce((s, i) => s + i.vat_amount, 0)) + ' đ',
              color: 'text-indigo-600',
              bg: 'bg-indigo-50',
            },
          ].map(({ label, value, color, bg }) => (
            <div key={label} className={cn('rounded-2xl p-4 border border-slate-100', bg)}>
              <p className="text-xs text-slate-400 mb-1">{label}</p>
              <p className={cn('font-bold text-lg font-mono', color)}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Upload zone */}
      <div
        onDrop={handleDrop}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          'border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors',
          dragging ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
        )}
      >
        <Upload className="h-8 w-8 mx-auto text-slate-300 mb-3" />
        <p className="text-sm font-medium text-slate-600">Kéo thả file hóa đơn vào đây</p>
        <p className="text-xs text-slate-400 mt-1">PDF, XML, HTML — nhiều file cùng lúc</p>
        <input ref={fileInputRef} type="file" accept=".pdf,.xml,.html,.htm" multiple className="hidden"
          onChange={e => { if (e.target.files) { processFiles(Array.from(e.target.files)); e.target.value = '' } }} />
      </div>

      {/* Upload queue */}
      {uploads.length > 0 && (
        <div className="space-y-2">
          {uploads.map(item => (
            <div key={item.id} className="flex items-center gap-3 bg-white rounded-xl border border-slate-100 px-4 py-3">
              <FileText className="h-4 w-4 text-slate-400 shrink-0" />
              <span className="text-sm text-slate-700 flex-1 truncate">{item.file.name}</span>
              {item.state === 'parsing' && <span className="text-xs text-indigo-500 animate-pulse">Đang phân tích...</span>}
              {item.state === 'done' && <CheckCircle2 className="h-4 w-4 text-green-500" />}
              {item.state === 'error' && (
                <span className="text-xs text-red-500 truncate max-w-xs" title={item.error}>
                  <AlertCircle className="h-3.5 w-3.5 inline mr-1" />{item.error}
                </span>
              )}
              <button onClick={() => setUploads(p => p.filter(u => u.id !== item.id))}
                className="text-slate-300 hover:text-slate-500"><X className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
      )}

      {/* Invoice list */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                className="rounded"
                ref={el => { if (el) el.indeterminate = filteredInvoices.some(i => selectedIds.has(i.id)) && !filteredInvoices.every(i => selectedIds.has(i.id)) }}
                checked={filteredInvoices.length > 0 && filteredInvoices.every(i => selectedIds.has(i.id))}
                onChange={() => toggleAll(filteredInvoices.map(i => i.id))}
              />
              <span className="text-xs text-slate-400">Chọn tất cả</span>
            </label>
            <h3 className="text-sm font-semibold text-slate-700">
              Kho hóa đơn
              <span className="ml-2 text-xs font-normal text-slate-400">
                ({filteredInvoices.length}{filtering ? ` / ${invoices.length}` : ''})
              </span>
            </h3>
            {selectedIds.size > 0 && (
              <button
                onClick={() => { if (confirm(`Xóa ${selectedIds.size} hóa đơn đã chọn?`)) deleteMutation.mutate([...selectedIds]) }}
                className="flex items-center gap-1.5 px-3 py-1 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-medium rounded-lg border border-red-200 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" /> Xóa {selectedIds.size} mục
              </button>
            )}
          </div>
          <div className="flex gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1"><ArrowDownCircle className="h-3.5 w-3.5 text-orange-400" /> Mua vào</span>
            <span className="flex items-center gap-1"><ArrowUpCircle className="h-3.5 w-3.5 text-green-500" /> Bán ra</span>
          </div>
        </div>

        {/* Thanh lọc theo kỳ (năm / quý / tháng) */}
        {invoices.length > 0 && (
          <div className="px-5 py-2.5 border-b border-slate-100 flex flex-wrap items-center gap-2 bg-slate-50/60">
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
              <button onClick={() => { setFilterYear('all'); setFilterQuarter('all'); setFilterMonth('all') }}
                className="text-xs text-indigo-500 hover:text-indigo-600 ml-1">Xóa lọc</button>
            )}
          </div>
        )}

        {invoices.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-sm">
            Chưa có hóa đơn — upload file ở trên để bắt đầu
          </div>
        ) : filteredInvoices.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-sm">
            Không có hóa đơn nào trong kỳ đã chọn
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {groupedInvoices.map(group => (
              <div key={group.label}>
                <div className="px-5 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500">{group.label}</span>
                  <span className="text-xs text-slate-400">
                    {group.items.length} hóa đơn · {fmt(group.items.reduce((s, i) => s + i.total, 0))} đ
                  </span>
                </div>
                {group.items.map(inv => {
              const suggestion = suggestAccounts(inv)
              const expanded = expandedId === inv.id
              return (
                <div key={inv.id}>
                  <div className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors">
                    <input
                      type="checkbox"
                      className="rounded shrink-0"
                      checked={selectedIds.has(inv.id)}
                      onChange={() => toggleSelect(inv.id)}
                    />
                    <div className="shrink-0">
                      {inv.direction === 'incoming'
                        ? <ArrowDownCircle className="h-4 w-4 text-orange-400" />
                        : <ArrowUpCircle className="h-4 w-4 text-green-500" />}
                    </div>
                    <div className="flex-1 min-w-0 grid grid-cols-4 gap-3 items-center">
                      <div>
                        <p className="text-xs text-slate-400">
                          {inv.invoice_date ? new Date(inv.invoice_date).toLocaleDateString('vi-VN') : '—'}
                        </p>
                        <p className="text-xs font-mono text-slate-500">{inv.invoice_series}/{inv.invoice_number}</p>
                      </div>
                      <div className="col-span-2 min-w-0">
                        <button
                          onClick={() => setDetailInvoice(inv)}
                          className="text-sm font-medium text-slate-700 truncate hover:text-indigo-600 transition-colors text-left block w-full"
                        >
                          {inv.direction === 'incoming' ? inv.seller_name : inv.buyer_name}
                        </button>
                        {inv.description && (
                          <p className="text-xs text-slate-500 truncate" title={inv.description}>{inv.description}</p>
                        )}
                        {inv.status === 'pending' && (
                          <p className="text-xs text-indigo-400">
                            Gợi ý: Nợ {suggestion.debitAccount} / Có {suggestion.creditAccount}
                            {suggestion.vatDebitAccount && ` · VAT ${suggestion.vatDebitAccount}`}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="font-mono font-semibold text-slate-800 text-sm">{fmt(inv.total)} đ</p>
                        <p className="text-xs text-slate-400">VAT {fmt(inv.vat_amount)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={cn('px-2 py-0.5 rounded-full text-xs border', STATUS_CLASS[inv.status])}>
                        {STATUS_LABEL[inv.status]}
                      </span>
                      <button
                        onClick={() => setDetailInvoice(inv)}
                        className="text-slate-300 hover:text-indigo-500 transition-colors"
                        title="Xem chi tiết"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      {inv.status === 'pending' && (
                        <button onClick={() => setPostingInvoice(inv)}
                          className="flex items-center gap-1 px-3 py-1 bg-indigo-600 hover:bg-indigo-700
                            text-white text-xs font-medium rounded-lg transition-colors">
                          <BookOpen className="h-3 w-3" /> Hạch toán
                        </button>
                      )}
                      {inv.status === 'posted' && (
                        <button onClick={() => setEditingInvoice(inv)}
                          className="flex items-center gap-1 px-3 py-1 bg-white hover:bg-slate-50
                            text-slate-600 text-xs font-medium rounded-lg border border-slate-200 transition-colors">
                          <Pencil className="h-3 w-3" /> Sửa
                        </button>
                      )}
                      <button onClick={() => setExpandedId(expanded ? null : inv.id)}
                        className="text-slate-300 hover:text-slate-500">
                        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                      <button
                        onClick={() => { if (confirm('Xóa hóa đơn này?')) deleteMutation.mutate([inv.id]) }}
                        className="text-slate-300 hover:text-red-400 transition-colors"
                        title="Xóa hóa đơn"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {expanded && inv.line_items.length > 0 && (
                    <div className="px-14 pb-4 bg-slate-50">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-slate-400 border-b border-slate-200">
                            <th className="text-left py-2">Tên hàng hóa / dịch vụ</th>
                            <th className="text-right py-2">SL</th>
                            <th className="text-right py-2">Đơn giá</th>
                            <th className="text-right py-2">Thành tiền</th>
                            <th className="text-right py-2">Thuế</th>
                          </tr>
                        </thead>
                        <tbody>
                          {inv.line_items.map((item, i) => {
                            const li = item as { description: string; quantity: number; unitPrice: number; amount: number; vatRate: string }
                            return (
                              <tr key={i} className="border-b border-slate-100">
                                <td className="py-1.5 text-slate-600 pr-4">{li.description}</td>
                                <td className="py-1.5 text-right text-slate-500">{li.quantity}</td>
                                <td className="py-1.5 text-right font-mono text-slate-500">{fmt(li.unitPrice)}</td>
                                <td className="py-1.5 text-right font-mono font-medium">{fmt(li.amount)}</td>
                                <td className="py-1.5 text-right text-slate-400">{li.vatRate}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })}
              </div>
            ))}
          </div>
        )}
      </div>

      {postingInvoice && (
        <PostInvoiceDialog
          invoice={postingInvoice}
          onClose={() => setPostingInvoice(null)}
          onPosted={() => {
            setPostingInvoice(null)
            queryClient.invalidateQueries({ queryKey: ['invoices', companyId] })
          }}
        />
      )}

      {editingInvoice && (
        <PostInvoiceDialog
          invoice={editingInvoice}
          mode="edit"
          onClose={() => setEditingInvoice(null)}
          onPosted={() => {
            setEditingInvoice(null)
            queryClient.invalidateQueries({ queryKey: ['invoices', companyId] })
          }}
        />
      )}

      {detailInvoice && (
        <InvoiceDetailDialog
          invoice={detailInvoice}
          onClose={() => setDetailInvoice(null)}
          onPost={() => {
            setDetailInvoice(null)
            setPostingInvoice(detailInvoice)
          }}
          onEdit={() => {
            setDetailInvoice(null)
            setEditingInvoice(detailInvoice)
          }}
        />
      )}
    </div>
  )
}
