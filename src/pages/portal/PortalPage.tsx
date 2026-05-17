import { useNavigate } from 'react-router-dom'
import { Upload, Download, FileText, LogOut, Clock, CheckCircle2, AlertTriangle, Bell } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useComplianceItems } from '@/hooks/useCompliance'
import { useDocumentRequests, useDocuments, useUploadDocument, useGetDocumentUrl } from '@/hooks/useDocuments'
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

  const hasOverdue = complianceItems.some(c => c.status !== 'completed' && isOverdue(c.due_date))
  const hasPending = complianceItems.some(c => c.status === 'in_progress' || docRequests.some(r => r.status === 'pending'))
  const healthStatus = hasOverdue ? 'red' : hasPending ? 'yellow' : 'green'

  const upcomingCompliance = complianceItems
    .filter(c => c.status !== 'completed' && daysUntil(c.due_date) <= 30)
    .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())

  const pendingRequests = docRequests.filter(r => r.status === 'pending')
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
      <div className="flex min-h-screen items-center justify-center" style={{ background: 'hsl(214 32% 97%)' }}>
        <div className="text-center">
          <div className="h-16 w-16 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #6366F1, #8B5CF6)' }}>
            <span className="text-white text-2xl font-black">Y</span>
          </div>
          <p className="text-lg font-semibold text-slate-700">Tài khoản chưa được liên kết</p>
          <p className="text-sm text-slate-400 mt-1">Liên hệ kế toán của bạn để được cấp quyền truy cập.</p>
          <Button className="mt-4" variant="outline" onClick={handleSignOut}>Đăng xuất</Button>
        </div>
      </div>
    )
  }

  const healthConfig = {
    green: { bg: 'from-emerald-500 to-teal-500', icon: CheckCircle2, text: 'Tài chính ổn định', sub: 'Không có vấn đề cần xử lý' },
    yellow: { bg: 'from-amber-400 to-orange-400', icon: Bell, text: 'Cần chú ý', sub: 'Có một số việc đang chờ xử lý' },
    red: { bg: 'from-red-500 to-rose-500', icon: AlertTriangle, text: 'Cần xử lý ngay', sub: 'Có deadline đã quá hạn' },
  }[healthStatus]

  const HealthIcon = healthConfig.icon

  return (
    <div className="min-h-screen" style={{ background: 'hsl(214 32% 97%)' }}>
      {/* Header */}
      <header style={{ background: '#0F172A' }} className="px-6 py-4">
        <div className="flex items-center justify-between max-w-3xl mx-auto">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #6366F1, #8B5CF6)' }}>
              <span className="text-white font-bold text-sm">Y</span>
            </div>
            <div>
              <h1 className="text-white font-bold text-base leading-none">Yen</h1>
              <p className="text-slate-400 text-xs mt-0.5">Portal doanh nghiệp</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-white text-sm font-medium">{profile?.full_name ?? profile?.email}</p>
              <p className="text-slate-400 text-xs">Khách hàng</p>
            </div>
            <button onClick={handleSignOut}
              className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors text-sm">
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Đăng xuất</span>
            </button>
          </div>
        </div>
      </header>

      {/* Hero health banner */}
      <div className={`bg-gradient-to-r ${healthConfig.bg} px-6 py-5`}>
        <div className="max-w-3xl mx-auto flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
            <HealthIcon className="h-6 w-6 text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-lg">{healthConfig.text}</p>
            <p className="text-white/80 text-sm">{healthConfig.sub}</p>
          </div>
          <div className="ml-auto hidden sm:block">
            {/* Simple SVG illustration */}
            <svg width="80" height="60" viewBox="0 0 80 60" fill="none" className="opacity-30">
              <rect x="5" y="10" width="50" height="40" rx="6" stroke="white" strokeWidth="2.5"/>
              <path d="M14 28 L24 20 L34 26 L44 18" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="44" cy="18" r="3" fill="white"/>
              <path d="M60 15 L73 15" stroke="white" strokeWidth="2" strokeLinecap="round"/>
              <path d="M60 22 L73 22" stroke="white" strokeWidth="2" strokeLinecap="round"/>
              <path d="M60 29 L68 29" stroke="white" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-6 space-y-5">
        {/* Pending document requests */}
        {pendingRequests.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                  <Bell className="h-4 w-4 text-amber-500" />
                </div>
                Yêu cầu từ kế toán
                <span className="ml-1 h-5 w-5 rounded-full bg-amber-500 text-white text-xs flex items-center justify-center font-bold">
                  {pendingRequests.length}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {pendingRequests.map(req => (
                  <div key={req.id} className="rounded-xl border border-amber-100 bg-amber-50/60 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-slate-800">{req.title}</p>
                        {req.description && <p className="text-xs text-slate-500 mt-1">{req.description}</p>}
                        {req.deadline && (
                          <p className={`text-xs mt-1.5 font-medium ${isOverdue(req.deadline) ? 'text-red-500' : 'text-slate-400'}`}>
                            Hạn: {formatDate(req.deadline)}
                          </p>
                        )}
                        {req.type === 'invoice_template' && (
                          <Badge variant="default" className="text-xs mt-1.5">Template hóa đơn</Badge>
                        )}
                      </div>
                      <div className="flex flex-col gap-2 shrink-0">
                        {req.type === 'invoice_template' && (
                          <label>
                            <input type="file" accept=".xlsx" className="hidden" onChange={e => handleUpload(e, req.id)} />
                            <Button size="sm" variant="outline" asChild>
                              <span><Download className="h-3.5 w-3.5" /> Template</span>
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
                            <span><Upload className="h-3.5 w-3.5" /> Upload</span>
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
          <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-100 rounded-2xl p-4">
            <div className="h-9 w-9 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            </div>
            <p className="text-sm font-medium text-emerald-700">Không có yêu cầu chứng từ nào đang chờ</p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Upcoming deadlines */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-amber-100 flex items-center justify-center">
                  <Clock className="h-4 w-4 text-amber-500" />
                </div>
                Sắp đến hạn (30 ngày)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {upcomingCompliance.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">Không có deadline nào trong 30 ngày tới</p>
              ) : (
                <div className="space-y-2">
                  {upcomingCompliance.map(item => {
                    const days = daysUntil(item.due_date)
                    return (
                      <div key={item.id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                        <div>
                          <p className="text-xs font-semibold text-slate-700">{item.name}</p>
                          <p className="text-xs text-slate-400">{formatDate(item.due_date)}</p>
                        </div>
                        <Badge variant={days <= 7 ? 'destructive' : 'warning'} className="text-xs shrink-0">
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
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-indigo-100 flex items-center justify-center">
                  <FileText className="h-4 w-4 text-indigo-500" />
                </div>
                Báo cáo của bạn
              </CardTitle>
            </CardHeader>
            <CardContent>
              {sharedDocs.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">Chưa có báo cáo nào</p>
              ) : (
                <div className="space-y-2">
                  {sharedDocs.map(doc => (
                    <div key={doc.id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="h-3.5 w-3.5 text-slate-300 shrink-0" />
                        <p className="text-xs font-medium text-slate-700 truncate">{doc.name}</p>
                      </div>
                      <button
                        onClick={() => handleDownload(doc.file_path, doc.name)}
                        className="text-xs text-indigo-500 hover:text-indigo-700 font-semibold shrink-0 ml-2 transition-colors"
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
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Lịch sử hoạt động gần đây</CardTitle>
          </CardHeader>
          <CardContent>
            {docRequests.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-3">Chưa có hoạt động</p>
            ) : (
              <div className="space-y-1">
                {[...docRequests]
                  .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                  .slice(0, 6)
                  .map(r => {
                    const icon = r.status === 'reviewed' ? '✅' : r.status === 'uploaded' ? '📤' : '📋'
                    const label = r.status === 'reviewed' ? 'Kế toán đã xem' : r.status === 'uploaded' ? 'Bạn đã upload' : 'Kế toán yêu cầu'
                    return (
                      <div key={r.id} className="flex items-start gap-3 py-2 border-b border-slate-50 last:border-0">
                        <span className="text-base shrink-0">{icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-slate-600">{label} <span className="font-medium">"{r.title}"</span></p>
                          <p className="text-xs text-slate-300 mt-0.5">{formatDate(r.created_at)}</p>
                        </div>
                      </div>
                    )
                  })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
