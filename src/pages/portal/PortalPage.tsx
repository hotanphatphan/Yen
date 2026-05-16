import { useNavigate } from 'react-router-dom'
import { Upload, Download, FileText, LogOut, Clock } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useComplianceItems } from '@/hooks/useCompliance'
import { useDocumentRequests, useDocuments, useUploadDocument, useGetDocumentUrl } from '@/hooks/useDocuments'
import { ComplianceHealthBadge } from '@/components/shared/StatusBadge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/shared/Card'
import { Badge } from '@/components/shared/Badge'
import { Button } from '@/components/shared/Button'
import { formatDate, daysUntil, isOverdue } from '@/lib/utils'

const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
const MAX_SIZE = 10 * 1024 * 1024

export default function PortalPage() {
  const navigate = useNavigate()
  const { user, profile, signOut } = useAuth()
  const companyId = profile?.company_id ?? ''

  const { data: complianceItems = [] } = useComplianceItems(companyId || undefined)
  const { data: docRequests = [] } = useDocumentRequests(companyId)
  const { data: documents = [] } = useDocuments(companyId)
  const uploadDocument = useUploadDocument()
  const getUrl = useGetDocumentUrl()

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  // Compute health status
  const hasOverdue = complianceItems.some(c => c.status !== 'completed' && isOverdue(c.due_date))
  const hasPending = complianceItems.some(c => c.status === 'in_progress' || docRequests.some(r => r.status === 'pending'))
  const healthStatus = hasOverdue ? 'red' : hasPending ? 'yellow' : 'green'

  // Upcoming deadlines
  const upcomingCompliance = complianceItems
    .filter(c => c.status !== 'completed' && daysUntil(c.due_date) <= 30)
    .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())

  // Pending requests
  const pendingRequests = docRequests.filter(r => r.status === 'pending')

  // Shared documents from accountant
  const sharedDocs = documents.filter(d => d.shared_with_client)

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>, requestId: string) {
    const file = e.target.files?.[0]
    if (!file || !user) return

    if (!ALLOWED_TYPES.includes(file.type)) {
      alert('Loại file không được hỗ trợ. Chỉ PDF, JPG, PNG, XLSX, DOCX.')
      return
    }
    if (file.size > MAX_SIZE) {
      alert('File vượt quá 10MB.')
      return
    }

    await uploadDocument.mutateAsync({
      companyId,
      requestId,
      file,
      uploadedBy: user.id,
    })
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

  if (!companyId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center text-gray-500">
          <p className="text-lg font-medium">Tài khoản chưa được liên kết</p>
          <p className="text-sm mt-1">Liên hệ kế toán của bạn để được cấp quyền truy cập.</p>
          <Button className="mt-4" variant="outline" onClick={handleSignOut}>Đăng xuất</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div>
            <h1 className="text-xl font-bold text-blue-700">Yen</h1>
            <p className="text-xs text-gray-500">Portal doanh nghiệp</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">{profile?.full_name ?? profile?.email}</span>
            <button onClick={handleSignOut} className="text-sm text-gray-400 hover:text-gray-600 flex items-center gap-1">
              <LogOut className="h-4 w-4" /> Đăng xuất
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Health Banner */}
        <ComplianceHealthBadge status={healthStatus} />

        {/* Pending document requests */}
        {pendingRequests.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                📋 Yêu cầu từ kế toán ({pendingRequests.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {pendingRequests.map(req => (
                  <div key={req.id} className="p-3 rounded-lg border border-amber-200 bg-amber-50">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-sm text-gray-900">{req.title}</p>
                        {req.description && <p className="text-xs text-gray-500 mt-0.5">{req.description}</p>}
                        {req.deadline && (
                          <p className={`text-xs mt-1 ${isOverdue(req.deadline) ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                            Hạn: {formatDate(req.deadline)}
                          </p>
                        )}
                        {req.type === 'invoice_template' && (
                          <Badge variant="default" className="text-xs mt-1">Template hóa đơn</Badge>
                        )}
                      </div>
                      <div className="flex flex-col gap-1.5 shrink-0">
                        {req.type === 'invoice_template' && (
                          <label>
                            <input type="file" accept=".xlsx" className="hidden" onChange={e => handleUpload(e, req.id)} />
                            <Button size="sm" variant="outline" asChild>
                              <span>
                                <Download className="h-3.5 w-3.5" /> Download template
                              </span>
                            </Button>
                          </label>
                        )}
                        <label>
                          <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png,.xlsx,.docx"
                            className="hidden"
                            onChange={e => handleUpload(e, req.id)}
                          />
                          <Button size="sm" asChild>
                            <span>
                              <Upload className="h-3.5 w-3.5" /> Upload file
                            </span>
                          </Button>
                        </label>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {pendingRequests.length === 0 && (
          <Card className="border-green-200 bg-green-50">
            <CardContent className="py-4 text-center text-sm text-green-700">
              ✅ Không có yêu cầu chứng từ nào đang chờ
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-2 gap-6">
          {/* Upcoming deadlines */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-500" />
                Sắp đến hạn (30 ngày)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {upcomingCompliance.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-3">Không có deadline nào trong 30 ngày tới</p>
              ) : (
                <div className="space-y-2">
                  {upcomingCompliance.map(item => {
                    const days = daysUntil(item.due_date)
                    return (
                      <div key={item.id} className="flex items-center justify-between py-1.5">
                        <div>
                          <p className="text-xs font-medium text-gray-800">{item.name}</p>
                          <p className="text-xs text-gray-400">{formatDate(item.due_date)}</p>
                        </div>
                        <Badge variant={days <= 7 ? 'destructive' : 'warning'} className="text-xs">
                          {days === 0 ? 'Hôm nay' : `${days} ngày`}
                        </Badge>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Reports */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText className="h-4 w-4 text-blue-500" />
                Báo cáo của bạn
              </CardTitle>
            </CardHeader>
            <CardContent>
              {sharedDocs.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-3">Chưa có báo cáo nào</p>
              ) : (
                <div className="space-y-2">
                  {sharedDocs.map(doc => (
                    <div key={doc.id} className="flex items-center justify-between py-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                        <p className="text-xs text-gray-800 truncate">{doc.name}</p>
                      </div>
                      <button
                        onClick={() => handleDownload(doc.file_path, doc.name)}
                        className="text-xs text-blue-600 hover:underline shrink-0 ml-2"
                      >
                        Tải về
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Activity history */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Lịch sử hoạt động gần đây</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {[...docRequests]
                .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                .slice(0, 6)
                .map(r => (
                  <div key={r.id} className="flex items-center gap-2 text-xs text-gray-600 py-1">
                    <span className="text-gray-300">•</span>
                    <span>
                      {r.status === 'reviewed' ? '✅ Kế toán đã xem' : r.status === 'uploaded' ? '📤 Bạn đã upload' : '📋 Kế toán yêu cầu'}
                      {' '}"{r.title}"
                    </span>
                    <span className="text-gray-300 ml-auto">{formatDate(r.created_at)}</span>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
