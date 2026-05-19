import { useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  ChevronLeft, FileText, CreditCard, PieChart,
  BarChart3, CheckSquare, Settings,
} from 'lucide-react'
import { AccountantLayout } from '@/components/shared/AccountantLayout'
import { useCompany } from '@/hooks/useCompanies'
import { cn } from '@/lib/utils'
import CompanyHome from './CompanyHome'
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
import ClosingEntriesTab from '../client-detail-tabs/ClosingEntriesTab'
import InvoicesTab from '../client-detail-tabs/InvoicesTab'

type SectionKey = 'invoices' | 'transactions' | 'tax' | 'financial' | 'progress' | 'settings'
type SubKey = 'invoices' | 'documents' | 'ledger' | 'bank' | 'snapshot' | 'vat' | 'bctc' | 'compliance' | 'closing' | 'accounts' | 'invoice-template' | 'closing-entries'

interface SectionConfig {
  label: string
  icon: React.ElementType
  color: string
  subs: { key: SubKey; label: string }[]
}

const SECTIONS: Record<SectionKey, SectionConfig> = {
  invoices: {
    label: 'Hóa đơn & Chứng từ',
    icon: FileText,
    color: 'from-violet-500 to-purple-600',
    subs: [
      { key: 'invoices', label: 'Hóa đơn' },
      { key: 'documents', label: 'Chứng từ' },
      { key: 'invoice-template', label: 'Mẫu hóa đơn' },
    ],
  },
  transactions: {
    label: 'Sổ giao dịch',
    icon: CreditCard,
    color: 'from-blue-500 to-cyan-500',
    subs: [
      { key: 'ledger', label: 'Sổ chi tiết' },
      { key: 'bank', label: 'Đối chiếu ngân hàng' },
      { key: 'closing-entries', label: 'Bút toán điều chỉnh' },
    ],
  },
  tax: {
    label: 'Thuế VAT',
    icon: PieChart,
    color: 'from-orange-400 to-amber-500',
    subs: [{ key: 'vat', label: 'Kê khai VAT' }],
  },
  financial: {
    label: 'Báo cáo tài chính',
    icon: BarChart3,
    color: 'from-emerald-500 to-teal-500',
    subs: [
      { key: 'snapshot', label: 'Tổng quan' },
      { key: 'bctc', label: 'BCTC theo TT99' },
    ],
  },
  progress: {
    label: 'Tiến độ & Deadline',
    icon: CheckSquare,
    color: 'from-green-500 to-emerald-500',
    subs: [
      { key: 'compliance', label: 'Compliance' },
      { key: 'closing', label: 'Đóng quý' },
    ],
  },
  settings: {
    label: 'Cài đặt',
    icon: Settings,
    color: 'from-slate-400 to-slate-500',
    subs: [{ key: 'accounts', label: 'Hệ thống tài khoản' }],
  },
}

function SubContent({ subKey, companyId, companyMst }: { subKey: SubKey; companyId: string; companyMst: string }) {
  switch (subKey) {
    case 'invoices': return <InvoicesTab companyId={companyId} companyMst={companyMst} />
    case 'documents': return <DocumentsTab companyId={companyId} />
    case 'invoice-template': return <InvoiceWorkflowTab companyId={companyId} />
    case 'ledger': return <LedgerTab companyId={companyId} />
    case 'bank': return <BankReconciliationTab companyId={companyId} />
    case 'vat': return <VATTab companyId={companyId} />
    case 'snapshot': return <FinancialSnapshotTab companyId={companyId} />
    case 'bctc': return <BCTCTab companyId={companyId} />
    case 'compliance': return <ComplianceTab companyId={companyId} />
    case 'closing': return <QuarterClosingTab companyId={companyId} />
    case 'accounts': return <ChartOfAccountsTab companyId={companyId} />
    case 'closing-entries': return <ClosingEntriesTab companyId={companyId} />
  }
}

export default function ClientDetailPage() {
  const { companyId } = useParams<{ companyId: string }>()
  const { data: company, isLoading } = useCompany(companyId)
  const [section, setSection] = useState<SectionKey | null>(null)
  const [activeSub, setActiveSub] = useState<SubKey | null>(null)

  const handleNavigate = (key: SectionKey) => {
    setSection(key)
    setActiveSub(SECTIONS[key].subs[0].key)
  }

  const handleBack = () => {
    setSection(null)
    setActiveSub(null)
  }

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

  const cfg = section ? SECTIONS[section] : null

  return (
    <AccountantLayout>
      {/* ── Header ── */}
      <div className="flex items-center gap-4 px-6 py-4 bg-white border-b border-slate-100">
        {section && (
          <button
            onClick={handleBack}
            className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-indigo-500 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            Tổng quan
          </button>
        )}

        <div className="flex items-center gap-3 flex-1">
          {section && cfg ? (
            <>
              <div className={cn(
                'h-8 w-8 rounded-lg flex items-center justify-center bg-gradient-to-br',
                cfg.color
              )}>
                <cfg.icon className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-xs text-slate-400">{company.name}</p>
                <h2 className="font-bold text-slate-900 text-base leading-tight">{cfg.label}</h2>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-3">
              <div className="h-8 w-1 rounded-full bg-indigo-500" />
              <div>
                <h2 className="text-lg font-bold text-slate-900 leading-tight">{company.name}</h2>
                <p className="text-xs text-slate-400">MST: {company.mst}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Section sub-tabs (when inside a section with multiple subs) ── */}
      {section && cfg && cfg.subs.length > 1 && (
        <div className="flex gap-1 px-6 py-3 bg-white border-b border-slate-100">
          {cfg.subs.map(sub => (
            <button
              key={sub.key}
              onClick={() => setActiveSub(sub.key)}
              className={cn(
                'px-4 py-1.5 rounded-full text-sm font-medium transition-colors',
                activeSub === sub.key
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-500 hover:bg-slate-100'
              )}
            >
              {sub.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Content ── */}
      <div className="flex-1 overflow-auto">
        {!section ? (
          <CompanyHome company={company} onNavigate={handleNavigate} />
        ) : (
          <div className="p-6">
            {activeSub && <SubContent subKey={activeSub} companyId={company.id} companyMst={company.mst} />}
          </div>
        )}
      </div>
    </AccountantLayout>
  )
}
