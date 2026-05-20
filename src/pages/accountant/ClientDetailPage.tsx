import { useParams } from 'react-router-dom'
import { AccountantLayout, PageHeader } from '@/components/shared/AccountantLayout'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/shared/Tabs'
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
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="compliance">Compliance</TabsTrigger>
            <TabsTrigger value="snapshot">Tổng quan TC</TabsTrigger>
            <TabsTrigger value="documents">Chứng từ</TabsTrigger>
            <TabsTrigger value="ledger">Sổ giao dịch</TabsTrigger>
            <TabsTrigger value="parsed-invoices">Hóa đơn đầu vào/ra</TabsTrigger>
            <TabsTrigger value="invoice">Template hóa đơn</TabsTrigger>
            <TabsTrigger value="bank">Đối chiếu NH</TabsTrigger>
            <TabsTrigger value="accounts">Hệ thống TK</TabsTrigger>
            <TabsTrigger value="vat">VAT</TabsTrigger>
            <TabsTrigger value="bctc">BCTC</TabsTrigger>
            <TabsTrigger value="closing">Đóng quý</TabsTrigger>
          </TabsList>

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
