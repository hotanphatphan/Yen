import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { AccountantLayout, PageHeader } from '@/components/shared/AccountantLayout'
import { useCompany } from '@/hooks/useCompanies'
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
import {
  ShieldCheck, TrendingUp, FileText, ArrowLeftRight, Landmark,
  Percent, BarChart3, FolderOpen, BookOpen, FilePlus, CalendarCheck
} from 'lucide-react'

const NAV_GROUPS = [
  {
    label: 'Tổng quan',
    items: [
      { value: 'compliance', label: 'Tuân thủ', icon: ShieldCheck },
      { value: 'snapshot', label: 'Tài chính', icon: TrendingUp },
    ],
  },
  {
    label: 'Nghiệp vụ',
    items: [
      { value: 'parsed-invoices', label: 'Hóa đơn', icon: FileText },
      { value: 'ledger', label: 'Giao dịch', icon: ArrowLeftRight },
      { value: 'bank', label: 'Ngân hàng', icon: Landmark },
    ],
  },
  {
    label: 'Báo cáo',
    items: [
      { value: 'vat', label: 'VAT', icon: Percent },
      { value: 'bctc', label: 'Báo cáo TC', icon: BarChart3 },
    ],
  },
  {
    label: 'Hệ thống',
    items: [
      { value: 'documents', label: 'Chứng từ', icon: FolderOpen },
      { value: 'accounts', label: 'Hệ thống TK', icon: BookOpen },
      { value: 'invoice', label: 'Mẫu hóa đơn', icon: FilePlus },
      { value: 'closing', label: 'Đóng quý', icon: CalendarCheck },
    ],
  },
]

export default function ClientDetailPage() {
  const { companyId } = useParams<{ companyId: string }>()
  const { data: company, isLoading } = useCompany(companyId)
  const [active, setActive] = useState('compliance')

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

      <div className="flex min-h-0 flex-1">
        {/* Left nav */}
        <aside className="w-48 shrink-0 border-r border-gray-100 bg-gray-50/60 px-3 py-4 space-y-5">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {group.items.map(({ value, label, icon: Icon }) => {
                  const isActive = active === value
                  return (
                    <li key={value}>
                      <button
                        onClick={() => setActive(value)}
                        className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm transition-all
                          ${isActive
                            ? 'bg-white shadow-sm text-blue-600 font-medium border border-blue-100'
                            : 'text-gray-500 hover:bg-white hover:text-gray-800'
                          }`}
                      >
                        <Icon size={15} className={isActive ? 'text-blue-500' : 'text-gray-400'} />
                        {label}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </aside>

        {/* Content */}
        <main className="flex-1 min-w-0 p-6 overflow-auto">
          {active === 'compliance' && <ComplianceTab companyId={company.id} />}
          {active === 'snapshot' && <FinancialSnapshotTab companyId={company.id} />}
          {active === 'parsed-invoices' && <InvoicesTab companyId={company.id} companyMst={company.mst} />}
          {active === 'ledger' && <LedgerTab companyId={company.id} />}
          {active === 'bank' && <BankReconciliationTab companyId={company.id} />}
          {active === 'vat' && <VATTab companyId={company.id} />}
          {active === 'bctc' && <BCTCTab companyId={company.id} />}
          {active === 'documents' && <DocumentsTab companyId={company.id} />}
          {active === 'accounts' && <ChartOfAccountsTab companyId={company.id} />}
          {active === 'invoice' && <InvoiceWorkflowTab companyId={company.id} />}
          {active === 'closing' && <QuarterClosingTab companyId={company.id} />}
        </main>
      </div>
    </AccountantLayout>
  )
}
