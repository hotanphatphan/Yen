import { useState, useRef } from 'react'
import { Plus, Upload, Eye, FileText } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/shared/Button'
import { Input } from '@/components/shared/Input'
import { Label } from '@/components/shared/Label'
import { Card, CardContent } from '@/components/shared/Card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/shared/Dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/shared/Select'
import { Textarea } from '@/components/shared/Textarea'
import { DocRequestBadge } from '@/components/shared/StatusBadge'
import { Badge } from '@/components/shared/Badge'
import {
  useDocumentRequests,
  useDocuments,
  useCreateDocumentRequest,
  useUpdateDocumentRequestStatus,
  useUploadDocument,
  useGetDocumentUrl,
} from '@/hooks/useDocuments'
import { useAuth } from '@/hooks/useAuth'
import { formatDate, formatDateTime } from '@/lib/utils'
import type { DocumentRequestType } from '@/types'

const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
const MAX_SIZE = 10 * 1024 * 1024

const requestSchema = z.object({
  title: z.string().min(1, 'Tiêu đề bắt buộc'),
  description: z.string().optional(),
  deadline: z.string().optional(),
  type: z.enum(['general', 'invoice_template']),
})
type RequestForm = z.infer<typeof requestSchema>

export default function DocumentsTab({ companyId }: { companyId: string }) {
  const { user } = useAuth()
  const { data: requests = [] } = useDocumentRequests(companyId)
  const { data: documents = [] } = useDocuments(companyId)
  const createRequest = useCreateDocumentRequest()
  const updateStatus = useUpdateDocumentRequestStatus()
  const uploadDocument = useUploadDocument()
  const getUrl = useGetDocumentUrl()

  const [open, setOpen] = useState(false)
  const [uploadingFor, setUploadingFor] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<RequestForm>({
    resolver: zodResolver(requestSchema),
    defaultValues: { type: 'general' },
  })
  const type = watch('type')

  async function onSubmit(data: RequestForm) {
    await createRequest.mutateAsync({
      company_id: companyId,
      title: data.title,
      description: data.description || undefined,
      deadline: data.deadline || undefined,
      type: data.type,
    })
    reset()
    setOpen(false)
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>, requestId: string) {
    const file = e.target.files?.[0]
    if (!file || !user) return

    if (!ALLOWED_TYPES.includes(file.type)) {
      setUploadError('Loại file không được hỗ trợ. Chỉ PDF, JPG, PNG, XLSX, DOCX.')
      return
    }
    if (file.size > MAX_SIZE) {
      setUploadError('File vượt quá 10MB.')
      return
    }

    setUploadError('')
    await uploadDocument.mutateAsync({
      companyId,
      requestId,
      file,
      uploadedBy: user.id,
    })
    setUploadingFor(null)
    e.target.value = ''
  }

  async function handleDownload(filePath: string, fileName: string) {
    const url = await getUrl(filePath)
    if (!url) return
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
  }

  async function handleShare(docId: string) {
    await import('@/lib/supabase').then(({ supabase }) =>
      supabase.from('documents').update({ shared_with_client: true }).eq('id', docId)
    )
  }

  const docsForRequest = (requestId: string) =>
    documents.filter(d => d.request_id === requestId)

  const sharedDocs = documents.filter(d => d.shared_with_client && !d.request_id)

  return (
    <div className="space-y-6">
      {/* Document Requests */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-gray-900">Yêu cầu chứng từ</h3>
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> Tạo yêu cầu
          </Button>
        </div>

        {requests.length === 0 ? (
          <Card>
            <CardContent className="text-center py-6 text-gray-400 text-sm">
              Chưa có yêu cầu nào. Tạo yêu cầu để khách hàng upload chứng từ.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {requests.map(req => {
              const reqDocs = docsForRequest(req.id)
              return (
                <Card key={req.id} className={req.type === 'invoice_template' ? 'border-blue-200' : ''}>
                  <CardContent className="py-3 px-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{req.title}</span>
                          {req.type === 'invoice_template' && (
                            <Badge variant="default" className="text-xs">Template hóa đơn</Badge>
                          )}
                        </div>
                        {req.description && <p className="text-xs text-gray-500 mt-0.5">{req.description}</p>}
                        {req.deadline && <p className="text-xs text-gray-400 mt-0.5">Hạn: {formatDate(req.deadline)}</p>}

                        {reqDocs.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {reqDocs.map(doc => (
                              <div key={doc.id} className="flex items-center gap-2 text-xs text-gray-600">
                                <FileText className="h-3 w-3" />
                                <span className="truncate">{doc.name}</span>
                                <button
                                  onClick={() => handleDownload(doc.file_path, doc.name)}
                                  className="text-blue-600 hover:underline ml-1"
                                >
                                  Tải về
                                </button>
                                {!doc.shared_with_client && (
                                  <button
                                    onClick={() => handleShare(doc.id)}
                                    className="text-green-600 hover:underline"
                                  >
                                    Chia sẻ KH
                                  </button>
                                )}
                                {doc.shared_with_client && (
                                  <Badge variant="success" className="text-xs">Đã chia sẻ</Badge>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <DocRequestBadge status={req.status} />
                        {req.status === 'uploaded' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateStatus.mutate({ id: req.id, company_id: companyId, status: 'reviewed' })}
                          >
                            <Eye className="h-3.5 w-3.5" /> Đã xem
                          </Button>
                        )}
                        <div>
                          <input
                            type="file"
                            ref={req.id === uploadingFor ? fileInputRef : undefined}
                            accept=".pdf,.jpg,.jpeg,.png,.xlsx,.docx"
                            className="hidden"
                            onChange={e => handleFileUpload(e, req.id)}
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setUploadingFor(req.id)
                              const input = document.createElement('input')
                              input.type = 'file'
                              input.accept = '.pdf,.jpg,.jpeg,.png,.xlsx,.docx'
                              input.onchange = (e) => handleFileUpload(e as unknown as React.ChangeEvent<HTMLInputElement>, req.id)
                              input.click()
                            }}
                          >
                            <Upload className="h-3.5 w-3.5" /> Upload
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
        {uploadError && <p className="text-sm text-red-500">{uploadError}</p>}
      </div>

      {/* Shared documents */}
      {sharedDocs.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-medium text-gray-900">Tài liệu đã chia sẻ với khách hàng</h3>
          <div className="space-y-1">
            {sharedDocs.map(doc => (
              <div key={doc.id} className="flex items-center gap-2 p-2 rounded border border-gray-100 text-sm">
                <FileText className="h-4 w-4 text-gray-400" />
                <span className="flex-1 truncate">{doc.name}</span>
                <span className="text-xs text-gray-400">{formatDateTime(doc.created_at)}</span>
                <button
                  onClick={() => handleDownload(doc.file_path, doc.name)}
                  className="text-blue-600 hover:underline text-xs"
                >
                  Tải về
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tạo yêu cầu chứng từ</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Loại yêu cầu</Label>
              <Select value={type} onValueChange={v => setValue('type', v as DocumentRequestType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">Chứng từ thông thường</SelectItem>
                  <SelectItem value="invoice_template">Template hóa đơn</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tiêu đề *</Label>
              <Input placeholder="VD: Sao kê ngân hàng tháng 5" {...register('title')} />
              {errors.title && <p className="text-xs text-red-500">{errors.title.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Mô tả</Label>
              <Textarea placeholder="Hướng dẫn thêm cho khách hàng..." {...register('description')} />
            </div>
            <div className="space-y-1.5">
              <Label>Ngày hạn</Label>
              <Input type="date" {...register('deadline')} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Hủy</Button>
              <Button type="submit" disabled={isSubmitting}>Tạo yêu cầu</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
