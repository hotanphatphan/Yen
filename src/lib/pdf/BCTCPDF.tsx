import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import type { Company, Transaction } from '@/types'

const s = StyleSheet.create({
  page: { padding: 36, fontFamily: 'Helvetica', fontSize: 9 },
  title: { fontSize: 13, fontFamily: 'Helvetica-Bold', textAlign: 'center', marginBottom: 3 },
  subtitle: { fontSize: 9, textAlign: 'center', color: '#444', marginBottom: 3 },
  sectionTitle: { fontSize: 11, fontFamily: 'Helvetica-Bold', textAlign: 'center', marginBottom: 8, marginTop: 16 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#1e3a8a', color: 'white', padding: 5 },
  tableRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderColor: '#e5e7eb', paddingVertical: 4 },
  tableRowAlt: { flexDirection: 'row', borderBottomWidth: 0.5, borderColor: '#e5e7eb', paddingVertical: 4, backgroundColor: '#f9fafb' },
  col0: { width: 30, fontSize: 8 },
  col1: { flex: 1, fontSize: 8 },
  col2: { width: 90, textAlign: 'right', fontSize: 8 },
  col3: { width: 90, textAlign: 'right', fontSize: 8 },
  headerText: { color: 'white', fontFamily: 'Helvetica-Bold', fontSize: 8 },
  bold: { fontFamily: 'Helvetica-Bold' },
  totalRow: { flexDirection: 'row', backgroundColor: '#dbeafe', paddingVertical: 5, paddingHorizontal: 4 },
})

function fmt(n: number) {
  if (n === 0) return '—'
  return new Intl.NumberFormat('vi-VN').format(n)
}

interface BCTCProps {
  company: Company
  period: string
  transactions: Transaction[]
}

export default function BCTCPDF({ company, period, transactions }: BCTCProps) {
  const [y, q] = period.includes('-Q') ? period.split('-Q') : [period, '']
  const periodLabel = q ? `Quý ${q}/${y}` : `Năm ${y}`

  const totalRevenue = transactions.filter(t => t.type === 'income' && t.status === 'official').reduce((s, t) => s + t.amount, 0)
  const totalExpense = transactions.filter(t => t.type === 'expense' && t.status === 'official').reduce((s, t) => s + t.amount, 0)
  const netProfit = totalRevenue - totalExpense

  const cash = transactions.filter(t => t.type === 'income' && t.status === 'official').reduce((s, t) => s + t.amount, 0)
    - transactions.filter(t => t.type === 'expense' && t.status === 'official').reduce((s, t) => s + t.amount, 0)

  return (
    <Document>
      {/* B02-DNN — Income Statement */}
      <Page size="A4" style={s.page}>
        <Text style={s.title}>BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH</Text>
        <Text style={s.subtitle}>B02-DNN (Ban hành theo Thông tư số 99/2016/TT-BTC)</Text>
        <Text style={s.subtitle}>Kỳ báo cáo: {periodLabel} — Đơn vị: {company.name} — MST: {company.mst}</Text>

        <Text style={s.sectionTitle}>KẾT QUẢ KINH DOANH</Text>

        <View style={s.tableHeader}>
          <Text style={[s.col0, s.headerText]}>Mã số</Text>
          <Text style={[s.col1, s.headerText]}>Chỉ tiêu</Text>
          <Text style={[s.col2, s.headerText]}>Kỳ này</Text>
          <Text style={[s.col3, s.headerText]}>Lũy kế năm</Text>
        </View>

        {[
          { code: '01', label: '1. Doanh thu bán hàng và cung cấp dịch vụ', value: totalRevenue, bold: true },
          { code: '02', label: '2. Các khoản giảm trừ doanh thu', value: 0 },
          { code: '10', label: '3. Doanh thu thuần (10 = 01 - 02)', value: totalRevenue, bold: true },
          { code: '11', label: '4. Giá vốn hàng bán', value: 0 },
          { code: '20', label: '5. Lợi nhuận gộp về bán hàng và CCDV (20 = 10 - 11)', value: totalRevenue, bold: true },
          { code: '21', label: '6. Doanh thu hoạt động tài chính', value: 0 },
          { code: '22', label: '7. Chi phí tài chính', value: 0 },
          { code: '24', label: '8. Chi phí bán hàng', value: 0 },
          { code: '25', label: '9. Chi phí quản lý doanh nghiệp', value: totalExpense },
          { code: '30', label: '10. Lợi nhuận thuần từ hoạt động kinh doanh (30 = 20+21-22-24-25)', value: netProfit, bold: true },
          { code: '31', label: '11. Thu nhập khác', value: 0 },
          { code: '32', label: '12. Chi phí khác', value: 0 },
          { code: '40', label: '13. Lợi nhuận khác (40 = 31 - 32)', value: 0, bold: true },
          { code: '50', label: '14. Tổng lợi nhuận kế toán trước thuế (50 = 30 + 40)', value: netProfit, bold: true },
          { code: '51', label: '15. Chi phí thuế TNDN hiện hành', value: 0 },
          { code: '60', label: '16. Lợi nhuận sau thuế thu nhập doanh nghiệp (60 = 50 - 51)', value: netProfit, bold: true },
        ].map((row, i) => (
          <View key={row.code} style={i % 2 === 0 ? s.tableRow : s.tableRowAlt}>
            <Text style={[s.col0, row.bold ? s.bold : {}]}>{row.code}</Text>
            <Text style={[s.col1, row.bold ? s.bold : {}]}>{row.label}</Text>
            <Text style={[s.col2, row.bold ? s.bold : {}, { color: row.value < 0 ? '#dc2626' : '#111' }]}>{fmt(row.value)}</Text>
            <Text style={[s.col3, row.bold ? s.bold : {}]}>{fmt(row.value)}</Text>
          </View>
        ))}

        <Text style={{ marginTop: 30, fontSize: 8, color: '#aaa', textAlign: 'center' }}>
          Tài liệu được tạo bởi Yen — Chỉ mang tính tham khảo
        </Text>
      </Page>

      {/* B03-DNN — Cash Flow */}
      <Page size="A4" style={s.page}>
        <Text style={s.title}>BÁO CÁO LƯU CHUYỂN TIỀN TỆ</Text>
        <Text style={s.subtitle}>B03-DNN (Phương pháp trực tiếp) — Kỳ: {periodLabel}</Text>
        <Text style={s.subtitle}>Đơn vị: {company.name} — MST: {company.mst}</Text>

        <View style={[s.tableHeader, { marginTop: 12 }]}>
          <Text style={[s.col0, s.headerText]}>Mã số</Text>
          <Text style={[s.col1, s.headerText]}>Chỉ tiêu</Text>
          <Text style={[s.col2, s.headerText]}>Kỳ này</Text>
          <Text style={[s.col3, s.headerText]}>Kỳ trước</Text>
        </View>

        {[
          { code: 'I', label: 'I. Lưu chuyển tiền từ hoạt động kinh doanh', value: null, bold: true },
          { code: '01', label: '1. Tiền thu từ bán hàng, cung cấp dịch vụ', value: totalRevenue },
          { code: '02', label: '2. Tiền chi trả cho người cung cấp hàng hóa, DV', value: -totalExpense },
          { code: '03', label: '3. Tiền chi trả cho người lao động', value: 0 },
          { code: '04', label: '4. Tiền chi trả lãi vay', value: 0 },
          { code: '05', label: '5. Tiền chi nộp thuế thu nhập doanh nghiệp', value: 0 },
          { code: '06', label: '6. Tiền thu khác từ hoạt động kinh doanh', value: 0 },
          { code: '07', label: '7. Tiền chi khác cho hoạt động kinh doanh', value: 0 },
          { code: '20', label: 'Lưu chuyển tiền thuần từ hoạt động kinh doanh (20=01+02+..+07)', value: cash, bold: true },
          { code: 'II', label: 'II. Lưu chuyển tiền từ hoạt động đầu tư', value: null, bold: true },
          { code: '30', label: 'Lưu chuyển tiền thuần từ hoạt động đầu tư', value: 0, bold: true },
          { code: 'III', label: 'III. Lưu chuyển tiền từ hoạt động tài chính', value: null, bold: true },
          { code: '40', label: 'Lưu chuyển tiền thuần từ hoạt động tài chính', value: 0, bold: true },
          { code: '50', label: 'Lưu chuyển tiền thuần trong kỳ (50 = 20 + 30 + 40)', value: cash, bold: true },
          { code: '60', label: 'Tiền và tương đương tiền đầu kỳ', value: 0 },
          { code: '70', label: 'Tiền và tương đương tiền cuối kỳ (70 = 50 + 60)', value: cash, bold: true },
        ].map((row, i) => (
          <View key={row.code} style={i % 2 === 0 ? s.tableRow : s.tableRowAlt}>
            <Text style={[s.col0, row.bold ? s.bold : {}]}>{row.code}</Text>
            <Text style={[s.col1, row.bold ? s.bold : {}]}>{row.label}</Text>
            <Text style={[s.col2, row.bold ? s.bold : {}, { color: row.value !== null && row.value < 0 ? '#dc2626' : '#111' }]}>
              {row.value !== null ? fmt(row.value) : ''}
            </Text>
            <Text style={s.col3}></Text>
          </View>
        ))}
      </Page>
    </Document>
  )
}
