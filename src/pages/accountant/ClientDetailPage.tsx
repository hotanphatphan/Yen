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
    iconBg: 'bg-violet-100',
    iconColor: 'text-violet-600',
    items: [
      { value: 'compliance', label: 'Tuân thủ', icon: ShieldCheck },
      { value: 'snapshot', label: 'Tài chính', icon: TrendingUp },
    ],
  },
  {
    label: 'Nghiệp vụ',
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
    items: [
      { value: 'parsed-invoices', label: 'Hóa đơn', icon: FileText },
      { value: 'ledger', label: 'Giao dịch', icon: ArrowLeftRight },
      { value: 'bank', label: 'Ngân hàng', icon: Landmark },
    ],
  },
  {
    label: 'Báo cáo',
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-600',
    items: [
      { value: 'vat', label: 'VAT', icon: Percent },
      { value: 'bctc', label: 'Báo cáo TC', icon: BarChart3 },
    ],
  },
  {
    label: 'Hệ thống',
    iconBg: 'bg-slate-100',
    iconColor: 'text-slate-500',
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

      {/* Mobile horizontal scroll tabs */}
      <div className="sm:hidden border-b border-violet-100 bg-white px-3 py-2 overflow-x-auto">
        <div className="flex gap-1.5 w-max">
          {NAV_GROUPS.flatMap(group => group.items).map(({ value, label, icon: Icon }) => {
            const isActive = active === value
            const group = NAV_GROUPS.find(g => g.items.some(i => i.value === value))!
            return (
              <button
                key={value}
                onClick={() => setActive(value)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all
                  ${isActive
                    ? 'bg-violet-600 text-white shadow-sm'
                    : 'bg-violet-50 text-slate-500 hover:bg-violet-100'
                  }`}
              >
                <Icon size={12} className={isActive ? 'text-white' : group.iconColor} />
                {label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Desktop inner sidebar */}
        <aside className="hidden sm:block w-48 shrink-0 border-r border-violet-100/80 bg-white/60 px-3 py-4 space-y-5">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {group.items.map(({ value, label, icon: Icon }) => {
                  const isActive = active === value
                  return (
                    <li key={value}>
                      <button
                        onClick={() => setActive(value)}
                        className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-xl text-sm transition-all
                          ${isActive
                            ? 'bg-white shadow-sm text-violet-700 font-semibold border border-violet-100'
                            : 'text-slate-500 hover:bg-violet-50 hover:text-violet-700'
                          }`}
                      >
                        <span className={`h-6 w-6 rounded-lg flex items-center justify-center shrink-0 transition-all
                          ${isActive ? 'bg-violet-100' : group.iconBg}`}>
                          <Icon size={13} className={isActive ? 'text-violet-600' : group.iconColor} />
                        </span>
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
