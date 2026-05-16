import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import type { Company, Transaction } from '@/types'

const s = StyleSheet.create({
  page: { padding: 40, fontFamily: 'Helvetica', fontSize: 10 },
  title: { fontSize: 16, fontFamily: 'Helvetica-Bold', textAlign: 'center', marginBottom: 4 },
  subtitle: { fontSize: 10, textAlign: 'center', color: '#555', marginBottom: 20 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 0.5, borderColor: '#e5e7eb' },
  label: { flex: 1, color: '#555' },
  value: { fontFamily: 'Helvetica-Bold' },
  separator: { marginVertical: 12, borderTopWidth: 1, borderColor: '#ddd' },
})

function fmt(n: number) {
  return new Intl.NumberFormat('vi-VN').format(n) + ' đ'
}

interface Props {
  company: Company
  period: string
  transactions: Transaction[]
  vatPayable: number
}

export default function FinancialSummaryPDF({ company, period, transactions, vatPayable }: Props) {
  const revenue = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const expense = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const net = revenue - expense

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.title}>BÁO CÁO TÀI CHÍNH TÓM TẮT</Text>
        <Text style={s.subtitle}>{company.name} — MST: {company.mst}</Text>
        <Text style={s.subtitle}>Kỳ báo cáo: {period}</Text>

        <View style={s.row}><Text style={s.label}>Tổng doanh thu:</Text><Text style={[s.value, { color: '#16a34a' }]}>{fmt(revenue)}</Text></View>
        <View style={s.row}><Text style={s.label}>Tổng chi phí:</Text><Text style={[s.value, { color: '#dc2626' }]}>{fmt(expense)}</Text></View>
        <View style={[s.row, { backgroundColor: '#f0f9ff' }]}>
          <Text style={[s.label, { fontFamily: 'Helvetica-Bold' }]}>Lãi/lỗ ròng:</Text>
          <Text style={[s.value, { color: net >= 0 ? '#16a34a' : '#dc2626', fontSize: 14 }]}>{fmt(Math.abs(net))}{net < 0 ? ' (lỗ)' : ''}</Text>
        </View>
        <View style={s.row}><Text style={s.label}>VAT ước tính phải nộp:</Text><Text style={s.value}>{fmt(vatPayable)}</Text></View>

        <Text style={{ marginTop: 40, fontSize: 8, color: '#aaa', textAlign: 'center' }}>
          Tài liệu được tạo bởi Yen — Chỉ mang tính tham khảo
        </Text>
      </Page>
    </Document>
  )
}
