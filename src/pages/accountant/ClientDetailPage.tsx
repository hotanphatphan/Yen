import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { AccountantLayout, PageHeader } from '@/components/shared/AccountantLayout'
import { useCompany } from '@/hooks/useCompanies'
import ComplianceTab from '../client-detail-tabs/ComplianceTab'
import DocumentsTab from '../client-detail-tabs/DocumentsTab'
import LedgerTab from '../client-detail-tabs/LedgerTab'
import BankReconciliationTab from '../client-detail-tabs/BankReconciliationTab'
import ChartOfAccountsTab from '../client-detail-tabs/ChartOfAccountsTab'
import VATTab from '../client-detail-tabs/VATTab'
import BCTCTab from '../client-detail-tabs/BCTCTab'
import InvoicesTab from '../client-detail-tabs/InvoicesTab'
import InvoiceWorkflowTab from '../client-detail-tabs/InvoiceWorkflowTab'
import CompanyHome from './CompanyHome'
import {
  LayoutDashboard, FileText, CreditCard, Landmark,
  ReceiptText, ShieldCheck, FolderOpen, Settings2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type TabKey = 'home' | 'parsed-invoices' | 'ledger' | 'bank' | 'tax-reports' | 'compliance' | 'documents' | 'settings'
type TaxSub = 'vat' | 'bctc'
type SettingsSub = 'documents-inner' | 'accounts' | 'invoice-template'

const NAV_GROUPS = [
  {
    label: 'Workflow',
    items: [
      { value: 'home' as TabKey,           label: 'Tổng quan',      icon: LayoutDashboard, iconBg: 'bg-violet-100', iconColor: 'text-violet-600' },
      { value: 'parsed-invoices' as TabKey, label: 'Hóa đơn',        icon: FileText,        iconBg: 'bg-blue-100',   iconColor: 'text-blue-600'   },
      { value: 'ledger' as TabKey,          label: 'Giao dịch',      icon: CreditCard,      iconBg: 'bg-cyan-100',   iconColor: 'text-cyan-600'   },
      { value: 'bank' as TabKey,            label: 'Ngân hàng',      icon: Landmark,        iconBg: 'bg-teal-100',   iconColor: 'text-teal-600'   },
      { value: 'tax-reports' as TabKey,     label: 'Thuế & Báo cáo', icon: ReceiptText,     iconBg: 'bg-amber-100',  iconColor: 'text-amber-600'  },
    ],
  },
  {
    label: 'Quản lý',
    items: [
      { value: 'compliance' as TabKey, label: 'Tuân thủ',   icon: ShieldCheck, iconBg: 'bg-red-100',   iconColor: 'text-red-500'   },
      { value: 'documents' as TabKey,  label: 'Chứng từ',   icon: FolderOpen,  iconBg: 'bg-green-100', iconColor: 'text-green-600' },
      { value: 'settings' as TabKey,   label: 'Cài đặt',    icon: Settings2,   iconBg: 'bg-slate-100', iconColor: 'text-slate-500' },
    ],
  },
]

const ALL_ITEMS = NAV_GROUPS.flatMap(g => g.items)

export default function ClientDetailPage() {
  const { companyId } = useParams<{ companyId: string }>()
  const { data: company, isLoading } = useCompany(companyId)
  const [active, setActive] = useState<TabKey>('home')
  const [taxSub, setTaxSub] = useState<TaxSub>('vat')
  const [settingsSub, setSettingsSub] = useState<SettingsSub>('documents-inner')

  if (isLoading) {
    return (
      <AccountantLayout>
        <div className="flex items-center justify-center h-64 text-slate-400">Đang tải...</div>
      </AccountantLayout>
    )
  }

  if (!company) {
    return (
      <AccountantLayout>
        <div className="flex items-center justify-center h-64 text-slate-400">Không tìm thấy khách hàng</div>
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

      {/* Mobile pill tabs */}
      <div className="sm:hidden border-b border-violet-100 bg-white px-3 py-2 overflow-x-auto">
        <div className="flex gap-1.5 w-max">
          {ALL_ITEMS.map(({ value, label, icon: Icon, iconColor }) => {
            const isActive = active === value
            return (
              <button
                key={value}
                onClick={() => setActive(value)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all',
                  isActive ? 'bg-violet-600 text-white shadow-sm' : 'bg-violet-50 text-slate-500 hover:bg-violet-100'
                )}
              >
                <Icon size={12} className={isActive ? 'text-white' : iconColor} />
                {label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Desktop inner sidebar */}
        <aside className="hidden sm:flex flex-col w-48 shrink-0 border-r border-violet-100/80 bg-white/60 px-3 py-4 space-y-5">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {group.items.map(({ value, label, icon: Icon, iconBg, iconColor }) => {
                  const isActive = active === value
                  return (
                    <li key={value}>
                      <button
                        onClick={() => setActive(value)}
                        className={cn(
                          'w-full flex items-center gap-2.5 px-2 py-1.5 rounded-xl text-sm transition-all',
                          isActive
                            ? 'bg-white shadow-sm text-violet-700 font-semibold border border-violet-100'
                            : 'text-slate-500 hover:bg-violet-50 hover:text-violet-700'
                        )}
                      >
                        <span className={cn('h-6 w-6 rounded-lg flex items-center justify-center shrink-0', isActive ? 'bg-violet-100' : iconBg)}>
                          <Icon size={13} className={isActive ? 'text-violet-600' : iconColor} />
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
        <main className="flex-1 min-w-0 overflow-auto">

          {active === 'home' && (
            <CompanyHome company={company} onNavigate={setActive} />
          )}

          {active === 'parsed-invoices' && (
            <div className="p-6">
              <InvoicesTab companyId={company.id} companyMst={company.mst} />
            </div>
          )}

          {active === 'ledger' && (
            <div className="p-6">
              <LedgerTab companyId={company.id} />
            </div>
          )}

          {active === 'bank' && (
            <div className="p-6">
              <BankReconciliationTab companyId={company.id} />
            </div>
          )}

          {active === 'tax-reports' && (
            <div className="p-6 space-y-5">
              {/* Sub-nav */}
              <div className="flex gap-2">
                {([
                  { key: 'vat' as TaxSub, label: 'Kê khai VAT' },
                  { key: 'bctc' as TaxSub, label: 'Báo cáo tài chính' },
                ] as const).map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setTaxSub(key)}
                    className={cn(
                      'px-4 py-1.5 rounded-xl text-sm font-medium transition-all',
                      taxSub === key
                        ? 'bg-violet-600 text-white shadow-sm'
                        : 'bg-violet-50 text-slate-500 hover:bg-violet-100'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {taxSub === 'vat' && <VATTab companyId={company.id} />}
              {taxSub === 'bctc' && <BCTCTab companyId={company.id} />}
            </div>
          )}

          {active === 'compliance' && (
            <div className="p-6">
              <ComplianceTab companyId={company.id} />
            </div>
          )}

          {active === 'documents' && (
            <div className="p-6">
              <DocumentsTab companyId={company.id} />
            </div>
          )}

          {active === 'settings' && (
            <div className="p-6 space-y-5">
              {/* Sub-nav */}
              <div className="flex gap-2 flex-wrap">
                {([
                  { key: 'accounts' as SettingsSub, label: 'Hệ thống TK' },
                  { key: 'invoice-template' as SettingsSub, label: 'Mẫu hóa đơn' },
                ] as const).map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setSettingsSub(key)}
                    className={cn(
                      'px-4 py-1.5 rounded-xl text-sm font-medium transition-all',
                      settingsSub === key
                        ? 'bg-slate-700 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {settingsSub === 'accounts' && <ChartOfAccountsTab companyId={company.id} />}
              {settingsSub === 'invoice-template' && <InvoiceWorkflowTab companyId={company.id} />}
            </div>
          )}

        </main>
      </div>
    </AccountantLayout>
  )
}
