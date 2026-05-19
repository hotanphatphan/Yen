import { useState, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Upload, FileText, X, CheckCircle2, ArrowDownCircle,
  ArrowUpCircle, AlertCircle, BookOpen, ChevronDown, ChevronUp,
} from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/shared/Dialog'
import { Button } from '@/components/shared/Button'
import { supabase } from '@/lib/supabase'
import { suggestAccounts, COMMON_ACCOUNTS } from '@/lib/accountSuggestion'
import { cn } from '@/lib/utils'
import type { Invoice } from '@/types'

// ─── PDF text extraction ──────────────────────────────────────────────────────

async function extractPdfText(buffer: ArrayBuffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`
  const pdf = await pdfjs.getDocument({ data: buffer }).promise
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
  buyerName: string | null
  buyerMst: string | null
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

function PostInvoiceDialog({ invoice, onClose, onPosted }: {
  invoice: Invoice
  onClose: () => void
  onPosted: () => void
}) {
  const suggestion = suggestAccounts(invoice)
  const [debitAccount, setDebitAccount] = useState(suggestion.debitAccount)
  const [creditAccount, setCreditAccount] = useState(suggestion.creditAccount)
  const [vatDebit, setVatDebit] = useState(suggestion.vatDebitAccount ?? '')
  const [vatCredit, setVatCredit] = useState(suggestion.vatCreditAccount ?? '')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const isIncoming = invoice.direction === 'incoming'

  async function handlePost() {
    setLoading(true)
    try {
      const { error: e1 } = await supabase.from('journal_entries').insert({
        company_id: invoice.company_id,
        date: invoice.invoice_date ?? new Date().toISOString().split('T')[0],
        description: isIncoming
          ? `Mua hàng từ ${invoice.seller_name ?? 'NCC'} - HĐ ${invoice.invoice_series}/${invoice.invoice_number}`
          : `Bán hàng cho ${invoice.buyer_name ?? 'KH'} - HĐ ${invoice.invoice_series}/${invoice.invoice_number}`,
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
      })
      if (e1) throw e1

      const { error: e2 } = await supabase
        .from('invoices').update({ status: 'posted' }).eq('id', invoice.id)
      if (e2) throw e2

      onPosted()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Hạch toán hóa đơn</DialogTitle>
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
          <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 text-sm overflow-hidden">
            {[
              { label: 'Nợ', value: debitAccount, onChange: setDebitAccount, amount: invoice.subtotal },
              { label: 'Có', value: creditAccount, onChange: setCreditAccount, amount: invoice.subtotal },
            ].map(({ label, value, onChange, amount }) => (
              <div key={label} className="flex items-center gap-3 px-4 py-2.5 odd:bg-slate-50">
                <span className="w-8 text-xs font-bold text-slate-400">{label}</span>
                <select value={value} onChange={e => onChange(e.target.value)}
                  className="flex-1 bg-transparent text-slate-700 focus:outline-none text-sm">
                  {COMMON_ACCOUNTS.map(a => <option key={a.code} value={a.code}>{a.label}</option>)}
                </select>
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
                    <select value={value} onChange={e => onChange(e.target.value)}
                      className="flex-1 bg-transparent text-slate-700 focus:outline-none text-sm">
                      <option value="">— Không có —</option>
                      {COMMON_ACCOUNTS.map(a => <option key={a.code} value={a.code}>{a.label}</option>)}
                    </select>
                    <span className="font-mono text-slate-600 text-xs">{fmt(invoice.vat_amount)}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          <textarea value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Ghi chú (không bắt buộc)" rows={2}
            className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2
              focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none" />
        </div>

        <div className="flex gap-2 justify-end pt-1">
          <Button variant="ghost" onClick={onClose} disabled={loading}>Hủy</Button>
          <Button onClick={handlePost} disabled={loading}>
            <BookOpen className="h-4 w-4 mr-1.5" />
            {loading ? 'Đang hạch toán...' : 'Hạch toán'}
          </Button>
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
  const [postingInvoice, setPostingInvoice] = useState<Invoice | null>(null)
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

  const saveMutation = useMutation({
    mutationFn: async (parsed: ParsedInvoice) => {
      const { error } = await supabase.from('invoices').insert({
        company_id: companyId,
        direction: parsed.direction,
        invoice_number: parsed.invoiceNumber,
        invoice_series: parsed.invoiceSeries,
        invoice_date: parsed.invoiceDate,
        seller_name: parsed.sellerName,
        seller_mst: parsed.sellerMst,
        buyer_name: parsed.buyerName,
        buyer_mst: parsed.buyerMst,
        subtotal: parsed.subtotal,
        vat_amount: parsed.vatAmount,
        total: parsed.total,
        vat_rate: parsed.vatRate,
        line_items: parsed.lineItems,
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
          <h3 className="text-sm font-semibold text-slate-700">
            Danh sách hóa đơn
            <span className="ml-2 text-xs font-normal text-slate-400">({invoices.length})</span>
          </h3>
          <div className="flex gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1"><ArrowDownCircle className="h-3.5 w-3.5 text-orange-400" /> Mua vào</span>
            <span className="flex items-center gap-1"><ArrowUpCircle className="h-3.5 w-3.5 text-green-500" /> Bán ra</span>
          </div>
        </div>

        {invoices.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-sm">
            Chưa có hóa đơn — upload file ở trên để bắt đầu
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {invoices.map(inv => {
              const suggestion = suggestAccounts(inv)
              const expanded = expandedId === inv.id
              return (
                <div key={inv.id}>
                  <div className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors">
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
                        <p className="text-sm font-medium text-slate-700 truncate">
                          {inv.direction === 'incoming' ? inv.seller_name : inv.buyer_name}
                        </p>
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
                      {inv.status === 'pending' && (
                        <button onClick={() => setPostingInvoice(inv)}
                          className="flex items-center gap-1 px-3 py-1 bg-indigo-600 hover:bg-indigo-700
                            text-white text-xs font-medium rounded-lg transition-colors">
                          <BookOpen className="h-3 w-3" /> Hạch toán
                        </button>
                      )}
                      <button onClick={() => setExpandedId(expanded ? null : inv.id)}
                        className="text-slate-300 hover:text-slate-500">
                        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
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
    </div>
  )
}
