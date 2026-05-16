import { useState } from 'react'
import { Download, Upload, CheckCircle2, XCircle, AlertCircle } from 'lucide-react'
import { Button } from '@/components/shared/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/shared/Card'
import { Badge } from '@/components/shared/Badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/shared/Select'
import { useCategories, useCreateTransaction } from '@/hooks/useTransactions'
import { useCompany } from '@/hooks/useCompanies'
import { generateInvoiceTemplate } from '@/lib/excel/generateInvoiceTemplate'
import { parseInvoiceExcel } from '@/lib/excel/parseInvoiceExcel'
import { formatVND } from '@/lib/utils'
import type { DraftTransaction } from '@/types'

export default function InvoiceWorkflowTab({ companyId }: { companyId: string }) {
  const { data: company } = useCompany(companyId)
  const { data: categories = [] } = useCategories(companyId)
  const createTransaction = useCreateTransaction()

  const [drafts, setDrafts] = useState<DraftTransaction[]>([])
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState('')

  function downloadTemplate() {
    if (!company) return
    const blob = generateInvoiceTemplate(company.name, categories)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `template-hoa-don-${company.name.replace(/\s+/g, '-')}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setParsing(true)
    setParseError('')
    try {
      const buffer = await file.arrayBuffer()
      const parsed = parseInvoiceExcel(buffer, categories)
      if (parsed.length === 0) {
        setParseError('Không tìm thấy dữ liệu trong file. Kiểm tra lại sheet "Dữ liệu hóa đơn".')
      } else {
        setDrafts(parsed)
      }
    } catch {
      setParseError('Lỗi đọc file. Vui lòng kiểm tra file đúng format template.')
    }
    setParsing(false)
    e.target.value = ''
  }

  function updateDraft(index: number, field: keyof DraftTransaction, value: unknown) {
    setDrafts(prev => prev.map((d, i) =>
      i === index ? { ...d, [field]: value, needs_review: false } : d
    ))
  }

  function rejectDraft(index: number) {
    setDrafts(prev => prev.map((d, i) => i === index ? { ...d, rejected: !d.rejected } : d))
  }

  async function approveDraft(draft: DraftTransaction) {
    if (draft.rejected || !draft.date || draft.amount === 0) return
    await createTransaction.mutateAsync({
      company_id: companyId,
      date: draft.date,
      type: draft.type,
      amount: draft.amount,
      vat_amount: draft.vat_amount,
      category_id: draft.matched_category_id,
      account_id: null,
      description: draft.description || null,
      attachment_path: null,
      status: 'official',
      source: 'excel_import',
      invoice_number: draft.invoice_number || null,
      counterparty: draft.counterparty || null,
      bank_transaction_id: null,
      needs_review: false,
    })
    setDrafts(prev => prev.filter((_, i) => drafts.indexOf(draft) !== i))
  }

  async function approveAll() {
    const toApprove = drafts.filter(d => !d.rejected && !d.needs_review && d.date && d.amount > 0)
    for (const draft of toApprove) {
      await createTransaction.mutateAsync({
        company_id: companyId,
        date: draft.date,
        type: draft.type,
        amount: draft.amount,
        vat_amount: draft.vat_amount,
        category_id: draft.matched_category_id,
        account_id: null,
        description: draft.description || null,
        attachment_path: null,
        status: 'official',
        source: 'excel_import',
        invoice_number: draft.invoice_number || null,
        counterparty: draft.counterparty || null,
        bank_transaction_id: null,
        needs_review: false,
      })
    }
    setDrafts(prev => prev.filter(d => d.rejected || d.needs_review))
  }

  const hasNeedsReview = drafts.some(d => d.needs_review && !d.rejected)
  const approveableCount = drafts.filter(d => !d.rejected && !d.needs_review).length

  return (
    <div className="space-y-6">
      {/* Step 1 & 2 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bước 1: Tải template hóa đơn</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-gray-600">
            Template Excel có sẵn danh mục hợp lệ, hướng dẫn điền, và dropdown cho loại thu/chi.
            Khách hàng có thể tự điền hoặc nhờ AI (ChatGPT, Claude) đọc hóa đơn và điền giúp.
          </p>
          <Button onClick={downloadTemplate} variant="outline">
            <Download className="h-4 w-4" /> Tải template Excel
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bước 2: Nhập file đã điền</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-gray-600">
            Sau khi khách hàng điền template và upload qua portal (hoặc gửi trực tiếp), nhập file vào đây để parse.
          </p>
          <div>
            <input
              type="file"
              accept=".xlsx"
              className="hidden"
              id="invoice-upload"
              onChange={handleFileUpload}
            />
            <label htmlFor="invoice-upload">
              <Button asChild variant="outline" disabled={parsing}>
                <span>
                  <Upload className="h-4 w-4" />
                  {parsing ? 'Đang đọc file...' : 'Chọn file Excel đã điền'}
                </span>
              </Button>
            </label>
          </div>
          {parseError && (
            <p className="text-sm text-red-500 flex items-center gap-1">
              <AlertCircle className="h-4 w-4" /> {parseError}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Draft transactions */}
      {drafts.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                Bước 3: Review & approve ({drafts.length} giao dịch)
              </CardTitle>
              <div className="flex items-center gap-2">
                {hasNeedsReview && (
                  <Badge variant="warning" className="text-xs">
                    Có giao dịch cần review thủ công
                  </Badge>
                )}
                <Button
                  size="sm"
                  onClick={approveAll}
                  disabled={approveableCount === 0 || createTransaction.isPending}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Approve tất cả ({approveableCount})
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {drafts.map((draft, i) => (
                <div
                  key={i}
                  className={`p-3 rounded-md border ${
                    draft.rejected ? 'border-gray-200 bg-gray-50 opacity-50' :
                    draft.needs_review ? 'border-amber-200 bg-amber-50' :
                    'border-green-200 bg-green-50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 grid grid-cols-5 gap-2 text-xs">
                      <div>
                        <p className="text-gray-400">Ngày</p>
                        <p className="font-medium">{draft.date || '—'}</p>
                      </div>
                      <div>
                        <p className="text-gray-400">Loại</p>
                        <Badge variant={draft.type === 'income' ? 'success' : 'destructive'} className="text-xs">
                          {draft.type === 'income' ? 'Thu' : 'Chi'}
                        </Badge>
                      </div>
                      <div>
                        <p className="text-gray-400">Số tiền</p>
                        <p className="font-medium">{formatVND(draft.amount)}</p>
                      </div>
                      <div>
                        <p className="text-gray-400">Danh mục</p>
                        {draft.matched_category_id ? (
                          <p className="font-medium">{draft.category_name}</p>
                        ) : (
                          <Select onValueChange={v => updateDraft(i, 'matched_category_id', v)}>
                            <SelectTrigger className="h-6 text-xs">
                              <SelectValue placeholder="Chọn..." />
                            </SelectTrigger>
                            <SelectContent>
                              {categories.map(c => (
                                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                      <div>
                        <p className="text-gray-400">Đối tác</p>
                        <p className="font-medium truncate">{draft.counterparty || '—'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {draft.needs_review && !draft.rejected && (
                        <Badge variant="warning" className="text-xs">Cần review</Badge>
                      )}
                      {!draft.rejected && (
                        <Button size="sm" variant="outline" onClick={() => approveDraft(draft)} className="h-7 text-xs">
                          <CheckCircle2 className="h-3 w-3" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => rejectDraft(i)}
                        className="h-7 text-xs"
                      >
                        <XCircle className={`h-3 w-3 ${draft.rejected ? 'text-green-500' : 'text-red-500'}`} />
                      </Button>
                    </div>
                  </div>
                  {draft.description && (
                    <p className="text-xs text-gray-500 mt-1">{draft.description}</p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
