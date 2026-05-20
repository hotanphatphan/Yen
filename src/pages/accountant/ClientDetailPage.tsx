import { useParams } from 'react-router-dom'
import {
  CheckSquare, BarChart2, FolderOpen, BookOpen,
  Receipt, FileText, Landmark, Layers, Percent, TrendingUp, Lock,
} from 'lucide-react'
import { AccountantLayout, PageHeader } from '@/components/shared/AccountantLayout'
import { Tabs, TabsContent } from '@/components/shared/Tabs'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import { useCompany } from '@/hooks/useCompanies'
import { cn } from '@/lib/utils'
import ComplianceTab from '../client-detail-tabs/ComplianceTab'
import DocumentsTab from '../client-detail-tabs/DocumentsTab'
import LedgerTab from '../client-detail-tabs/LedgerTab'
import InvoiceWorkflowTab from '../client-detail-tabs/InvoiceWorkflowTab'
import BankReconciliationTab from '../client-detail-tabs/BankReconciliationTab'
import ChartOfAccountsTab from '../client-detail-tabs/ChartOfAccountsTab'
import VATTab from '../client-detail-tabs/VATTab'
import BCTCTab from '../client-detail-tabs/BCTCTab'
import FinancialSnapshotTab from '../client-detail-tabs/FinancialSnapshotTab'
import QuarterClosingTab from '../client-detail-tabs/QuarterClosingTab'
import InvoicesTab from '../client-detail-tabs/InvoicesTab'

const TABS = [
  { value: 'compliance',     label: 'Tuân thủ',       sub: 'Deadline & nghĩa vụ',  icon: CheckSquare,  color: 'text-violet-500',  bg: 'bg-violet-50',  ring: 'ring-violet-200' },
  { value: 'snapshot',       label: 'Tài chính',      sub: 'Tổng quan số liệu',    icon: BarChart2,    color: 'text-blue-500',    bg: 'bg-blue-50',    ring: 'ring-blue-200' },
  { value: 'parsed-invoices',label: 'Hóa đơn',        sub: 'Đầu vào & đầu ra',     icon: Receipt,      color: 'text-orange-500',  bg: 'bg-orange-50',  ring: 'ring-orange-200' },
  { value: 'ledger',         label: 'Giao dịch',      sub: 'Sổ chi tiết',          icon: BookOpen,     color: 'text-teal-500',    bg: 'bg-teal-50',    ring: 'ring-teal-200' },
  { value: 'bank',           label: 'Ngân hàng',      sub: 'Đối chiếu sao kê',     icon: Landmark,     color: 'text-sky-500',     bg: 'bg-sky-50',     ring: 'ring-sky-200' },
  { value: 'vat',            label: 'VAT',            sub: 'Thuế GTGT',            icon: Percent,      color: 'text-red-500',     bg: 'bg-red-50',     ring: 'ring-red-200' },
  { value: 'bctc',           label: 'Báo cáo TC',     sub: 'BCTC tổng hợp',        icon: TrendingUp,   color: 'text-emerald-500', bg: 'bg-emerald-50', ring: 'ring-emerald-200' },
  { value: 'documents',      label: 'Chứng từ',       sub: 'File & tài liệu',      icon: FolderOpen,   color: 'text-yellow-500',  bg: 'bg-yellow-50',  ring: 'ring-yellow-200' },
  { value: 'accounts',       label: 'Hệ thống TK',   sub: 'Danh mục tài khoản',   icon: Layers,       color: 'text-slate-500',   bg: 'bg-slate-50',   ring: 'ring-slate-200' },
  { value: 'invoice',        label: 'Mẫu hóa đơn',   sub: 'Template bán hàng',    icon: FileText,     color: 'text-pink-500',    bg: 'bg-pink-50',    ring: 'ring-pink-200' },
  { value: 'closing',        label: 'Đóng quý',       sub: 'Kết sổ & chốt số',     icon: Lock,         color: 'text-indigo-500',  bg: 'bg-indigo-50',  ring: 'ring-indigo-200' },
]

export default function ClientDetailPage() {
  const { companyId } = useParams<{ companyId: string }>()
  const { data: company, isLoading } = useCompany(companyId)

  if (isLoading) {
    return (
      <AccountantLayout>
        <div className="flex items-center justify-center h-64 text-gray-400">Đang tải...</div>
      </AccountantLayout>
    )
  }

  if (!company) {
    return (
      <AccountantLayout>
        <div className="flex items-center justify-center h-64 text-gray-400">Không tìm thấy khách hàng</div>
      </AccountantLayout>
    )
  }

  return (
    <AccountantLayout>
      <PageHeader
        title={company.name}
        subtitle={`MST: ${company.mst}`}
        breadcrumb={[
          { label: 'Khách hàng', to: '/clients' },
          { label: company.name },
        ]}
      />

      <div className="p-6">
        <Tabs defaultValue="compliance">
          {/* Icon tab bar */}
          <TabsPrimitive.List className="flex gap-2 overflow-x-auto pb-2 mb-2 scrollbar-hide">
            {TABS.map(({ value, label, sub, icon: Icon, color, bg, ring }) => (
              <TabsPrimitive.Trigger
                key={value}
                value={value}
                className={cn(
                  'group flex-shrink-0 flex flex-col items-center gap-1.5 px-4 py-3 rounded-2xl border border-transparent',
                  'text-slate-400 bg-white hover:bg-slate-50 transition-all duration-150 cursor-pointer',
                  'data-[state=active]:border-slate-200 data-[state=active]:shadow-sm',
                  `data-[state=active]:${bg}`,
                )}
              >
                <div className={cn(
                  'h-9 w-9 rounded-xl flex items-center justify-center transition-colors',
                  'bg-slate-100 group-data-[state=active]:bg-white group-data-[state=active]:shadow-sm',
                  `group-data-[state=active]:ring-2 group-data-[state=active]:${ring}`,
                )}>
                  <Icon className={cn('h-4 w-4 text-slate-400', `group-data-[state=active]:${color}`)} />
                </div>
                <div className="text-center">
                  <p className={cn('text-xs font-semibold text-slate-500 leading-none mb-0.5', `group-data-[state=active]:${color}`)}>{label}</p>
                  <p className="text-[10px] text-slate-400 leading-none whitespace-nowrap">{sub}</p>
                </div>
              </TabsPrimitive.Trigger>
            ))}
          </TabsPrimitive.List>

          <TabsContent value="compliance">
            <ComplianceTab companyId={company.id} />
          </TabsContent>
          <TabsContent value="snapshot">
            <FinancialSnapshotTab companyId={company.id} />
          </TabsContent>
          <TabsContent value="documents">
            <DocumentsTab companyId={company.id} />
          </TabsContent>
          <TabsContent value="ledger">
            <LedgerTab companyId={company.id} />
          </TabsContent>
          <TabsContent value="parsed-invoices">
            <InvoicesTab companyId={company.id} companyMst={company.mst} />
          </TabsContent>
          <TabsContent value="invoice">
            <InvoiceWorkflowTab companyId={company.id} />
          </TabsContent>
          <TabsContent value="bank">
            <BankReconciliationTab companyId={company.id} />
          </TabsContent>
          <TabsContent value="accounts">
            <ChartOfAccountsTab companyId={company.id} />
          </TabsContent>
          <TabsContent value="vat">
            <VATTab companyId={company.id} />
          </TabsContent>
          <TabsContent value="bctc">
            <BCTCTab companyId={company.id} />
          </TabsContent>
          <TabsContent value="closing">
            <QuarterClosingTab companyId={company.id} />
          </TabsContent>
        </Tabs>
      </div>
    </AccountantLayout>
  )
}
