import type { ComplianceStatus, DocumentRequestStatus, TransactionStatus } from '@/types'
import { Badge } from './Badge'

const complianceLabels: Record<ComplianceStatus, string> = {
  not_started: 'Chưa bắt đầu',
  in_progress: 'Đang thực hiện',
  completed: 'Hoàn tất',
  overdue: 'Quá hạn',
}

const complianceVariants: Record<ComplianceStatus, 'secondary' | 'default' | 'success' | 'destructive'> = {
  not_started: 'secondary',
  in_progress: 'default',
  completed: 'success',
  overdue: 'destructive',
}

export function ComplianceBadge({ status }: { status: ComplianceStatus }) {
  return <Badge variant={complianceVariants[status]}>{complianceLabels[status]}</Badge>
}

const docRequestLabels: Record<DocumentRequestStatus, string> = {
  pending: 'Chờ upload',
  uploaded: 'Đã upload',
  reviewed: 'Đã xem',
}

const docRequestVariants: Record<DocumentRequestStatus, 'warning' | 'default' | 'success'> = {
  pending: 'warning',
  uploaded: 'default',
  reviewed: 'success',
}

export function DocRequestBadge({ status }: { status: DocumentRequestStatus }) {
  return <Badge variant={docRequestVariants[status]}>{docRequestLabels[status]}</Badge>
}

const txStatusLabels: Record<TransactionStatus, string> = {
  draft: 'Nháp',
  official: 'Chính thức',
}

export function TransactionStatusBadge({ status }: { status: TransactionStatus }) {
  return (
    <Badge variant={status === 'official' ? 'success' : 'warning'}>
      {txStatusLabels[status]}
    </Badge>
  )
}

export function ComplianceHealthBadge({ status }: { status: 'green' | 'yellow' | 'red' }) {
  if (status === 'green') {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-4 py-3">
        <span className="text-2xl">🟢</span>
        <span className="font-medium text-green-800">Doanh nghiệp bạn đang ổn</span>
      </div>
    )
  }
  if (status === 'yellow') {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
        <span className="text-2xl">🟡</span>
        <span className="font-medium text-amber-800">Có một số việc cần hoàn tất</span>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
      <span className="text-2xl">🔴</span>
      <span className="font-medium text-red-800">Cần chú ý ngay</span>
    </div>
  )
}
