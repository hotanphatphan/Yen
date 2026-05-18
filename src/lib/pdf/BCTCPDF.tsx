import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import type { Company, Transaction, JournalEntry } from '@/types'

const s = StyleSheet.create({
  page: { padding: 36, fontFamily: 'Helvetica', fontSize: 9 },
  title: { fontSize: 13, fontFamily: 'Helvetica-Bold', textAlign: 'center', marginBottom: 3 },
  subtitle: { fontSize: 9, textAlign: 'center', color: '#444', marginBottom: 3 },
  sectionTitle: { fontSize: 11, fontFamily: 'Helvetica-Bold', textAlign: 'center', marginBottom: 8, marginTop: 16 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#1e3a8a', color: 'white', padding: 5 },
  tableRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderColor: '#e5e7eb', paddingVertical: 4, paddingHorizontal: 4 },
  tableRowAlt: { flexDirection: 'row', borderBottomWidth: 0.5, borderColor: '#e5e7eb', paddingVertical: 4, paddingHorizontal: 4, backgroundColor: '#f9fafb' },
  col0: { width: 30, fontSize: 8 },
  col1: { flex: 1, fontSize: 8 },
  col2: { width: 90, textAlign: 'right', fontSize: 8 },
  col3: { width: 90, textAlign: 'right', fontSize: 8 },
  headerText: { color: 'white', fontFamily: 'Helvetica-Bold', fontSize: 8 },
  bold: { fontFamily: 'Helvetica-Bold' },
  b01col1: { flex: 1, fontSize: 8 },
  b01col2: { width: 70, textAlign: 'right', fontSize: 8 },
  footer: { marginTop: 30, fontSize: 8, color: '#aaa', textAlign: 'center' },
})

function fmt(n: number) {
  if (n === 0) return '—'
  return new Intl.NumberFormat('vi-VN').format(Math.abs(n))
}

interface BCTCProps {
  company: Company
  period: string
  transactions: Transaction[]
  journalEntries?: JournalEntry[]
}

export default function BCTCPDF({ company, period, transactions, journalEntries = [] }: BCTCProps) {
  const [y, q] = period.includes('-Q') ? period.split('-Q') : [period, '']
  const periodLabel = q ? `Quý ${q}/${y}` : `Năm ${y}`

  const totalRevenue = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const totalExpense = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const netProfit = totalRevenue - totalExpense
  const cash = netProfit

  // B01 — simplified proxy from transactions
  const incomeTotal = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const expenseTotal = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const vatInput = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.vat_amount, 0)
  const vatOutput = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.vat_amount, 0)
  const jeDebit642 = journalEntries.filter(e => e.debit_account === '642').reduce((s, e) => s + e.amount, 0)

  const totalAssets = incomeTotal + vatInput
  const totalLiabilities = vatOutput
  const totalEquity = totalAssets - totalLiabilities

  return (
    <Document>
      {/* B01-DNN — Balance Sheet */}
      <Page size="A4" style={s.page}>
        <Text style={s.title}>BẢNG CÂN ĐỐI KẾ TOÁN</Text>
        <Text style={s.subtitle}>B01-DNN (Ban hành theo Thông tư số 99/2016/TT-BTC)</Text>
        <Text style={s.subtitle}>Kỳ: {periodLabel} — Đơn vị: {company.name} — MST: {company.mst}</Text>

        <Text style={[s.sectionTitle, { fontSize: 10 }]}>TÀI SẢN</Text>
        <View style={s.tableHeader}>
          <Text style={[s.col0, s.headerText]}>Mã</Text>
          <Text style={[s.b01col1, s.headerText]}>Chỉ tiêu</Text>
          <Text style={[s.b01col2, s.headerText]}>Cuối kỳ</Text>
          <Text style={[s.b01col2, s.headerText]}>Đầu năm</Text>
        </View>
        {[
          { code: 'A', label: 'A. TÀI SẢN NGẮN HẠN', bold: true },
          { code: '110', label: 'Tiền và tương đương tiền (111+112)', value: incomeTotal - expenseTotal },
          { code: '131', label: 'Phải thu của khách hàng', value: 0 },
          { code: '133', label: 'Thuế GTGT được khấu trừ', value: vatInput },
          { code: '156', label: 'Hàng tồn kho', value: 0 },
          { code: 'B', label: 'B. TÀI SẢN DÀI HẠN', bold: true },
          { code: '211', label: 'Tài sản cố định hữu hình', value: 0 },
          { code: '242', label: 'Chi phí trả trước dài hạn', value: 0 },
          { code: '270', label: 'TỔNG CỘNG TÀI SẢN (270 = A + B)', value: totalAssets, bold: true },
        ].map((row, i) => (
          <View key={row.code} style={i % 2 === 0 ? s.tableRow : s.tableRowAlt}>
            <Text style={[s.col0, row.bold ? s.bold : {}, { fontSize: 8 }]}>{row.code}</Text>
            <Text style={[s.b01col1, row.bold ? s.bold : {}]}>{row.label}</Text>
            <Text style={[s.b01col2, row.bold ? s.bold : {}]}>{row.value !== undefined ? fmt(row.value) : ''}</Text>
            <Text style={s.b01col2}></Text>
          </View>
        ))}

        <Text style={[s.sectionTitle, { fontSize: 10 }]}>NGUỒN VỐN</Text>
        <View style={s.tableHeader}>
          <Text style={[s.col0, s.headerText]}>Mã</Text>
          <Text style={[s.b01col1, s.headerText]}>Chỉ tiêu</Text>
          <Text style={[s.b01col2, s.headerText]}>Cuối kỳ</Text>
          <Text style={[s.b01col2, s.headerText]}>Đầu năm</Text>
        </View>
        {[
          { code: 'A', label: 'A. NỢ PHẢI TRẢ', bold: true },
          { code: '311', label: 'Vay và nợ ngắn hạn', value: 0 },
          { code: '331', label: 'Phải trả người bán', value: 0 },
          { code: '3331', label: 'Thuế GTGT phải nộp', value: vatOutput },
          { code: '300', label: 'TỔNG NỢ PHẢI TRẢ', value: totalLiabilities, bold: true },
          { code: 'B', label: 'B. VỐN CHỦ SỞ HỮU', bold: true },
          { code: '411', label: 'Vốn góp của chủ sở hữu', value: 0 },
          { code: '421', label: 'Lợi nhuận chưa phân phối', value: netProfit },
          { code: '400', label: 'TỔNG VỐN CHỦ SỞ HỮU', value: totalEquity, bold: true },
          { code: '440', label: 'TỔNG CỘNG NGUỒN VỐN (440 = A + B)', value: totalAssets, bold: true },
        ].map((row, i) => (
          <View key={row.code} style={i % 2 === 0 ? s.tableRow : s.tableRowAlt}>
            <Text style={[s.col0, row.bold ? s.bold : {}, { fontSize: 8 }]}>{row.code}</Text>
            <Text style={[s.b01col1, row.bold ? s.bold : {}]}>{row.label}</Text>
            <Text style={[s.b01col2, row.bold ? s.bold : {}]}>{row.value !== undefined ? fmt(row.value) : ''}</Text>
            <Text style={s.b01col2}></Text>
          </View>
        ))}
        <Text style={s.footer}>Tài liệu được tạo bởi Yen — Số liệu tạm tính, chỉ mang tính tham khảo</Text>
      </Page>

      {/* B02-DNN — Income Statement */}
      <Page size="A4" style={s.page}>
        <Text style={s.title}>BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH</Text>
        <Text style={s.subtitle}>B02-DNN (Ban hành theo Thông tư số 99/2016/TT-BTC)</Text>
        <Text style={s.subtitle}>Kỳ: {periodLabel} — Đơn vị: {company.name} — MST: {company.mst}</Text>

        <View style={[s.tableHeader, { marginTop: 12 }]}>
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
          { code: '20', label: '5. Lợi nhuận gộp (20 = 10 - 11)', value: totalRevenue, bold: true },
          { code: '21', label: '6. Doanh thu hoạt động tài chính', value: 0 },
          { code: '22', label: '7. Chi phí tài chính', value: 0 },
          { code: '24', label: '8. Chi phí bán hàng', value: 0 },
          { code: '25', label: '9. Chi phí QLDN', value: totalExpense + jeDebit642 },
          { code: '30', label: '10. Lợi nhuận thuần từ HĐKD', value: netProfit - jeDebit642, bold: true },
          { code: '31', label: '11. Thu nhập khác', value: 0 },
          { code: '32', label: '12. Chi phí khác', value: 0 },
          { code: '50', label: '13. Tổng lợi nhuận trước thuế', value: netProfit - jeDebit642, bold: true },
          { code: '51', label: '14. Chi phí thuế TNDN', value: 0 },
          { code: '60', label: '15. Lợi nhuận sau thuế (60 = 50 - 51)', value: netProfit - jeDebit642, bold: true },
        ].map((row, i) => (
          <View key={row.code} style={i % 2 === 0 ? s.tableRow : s.tableRowAlt}>
            <Text style={[s.col0, row.bold ? s.bold : {}]}>{row.code}</Text>
            <Text style={[s.col1, row.bold ? s.bold : {}]}>{row.label}</Text>
            <Text style={[s.col2, row.bold ? s.bold : {}, { color: row.value < 0 ? '#dc2626' : '#111' }]}>{fmt(row.value)}</Text>
            <Text style={[s.col3, row.bold ? s.bold : {}]}>{fmt(row.value)}</Text>
          </View>
        ))}
        <Text style={s.footer}>Tài liệu được tạo bởi Yen</Text>
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
          { code: 'I', label: 'I. Lưu chuyển tiền từ hoạt động kinh doanh', bold: true },
          { code: '01', label: '1. Tiền thu từ bán hàng, cung cấp dịch vụ', value: totalRevenue },
          { code: '02', label: '2. Tiền chi trả cho người cung cấp', value: -totalExpense },
          { code: '03', label: '3. Tiền chi trả cho người lao động', value: 0 },
          { code: '05', label: '4. Tiền chi nộp thuế TNDN', value: 0 },
          { code: '20', label: 'Lưu chuyển tiền thuần từ HĐKD (20=01+...+07)', value: cash, bold: true },
          { code: 'II', label: 'II. Lưu chuyển tiền từ hoạt động đầu tư', bold: true },
          { code: '30', label: 'Lưu chuyển tiền thuần từ hoạt động đầu tư', value: 0, bold: true },
          { code: 'III', label: 'III. Lưu chuyển tiền từ hoạt động tài chính', bold: true },
          { code: '40', label: 'Lưu chuyển tiền thuần từ hoạt động tài chính', value: 0, bold: true },
          { code: '50', label: 'Lưu chuyển tiền thuần trong kỳ (50 = 20+30+40)', value: cash, bold: true },
          { code: '60', label: 'Tiền và tương đương tiền đầu kỳ', value: 0 },
          { code: '70', label: 'Tiền và tương đương tiền cuối kỳ (70 = 50+60)', value: cash, bold: true },
        ].map((row, i) => (
          <View key={row.code} style={i % 2 === 0 ? s.tableRow : s.tableRowAlt}>
            <Text style={[s.col0, row.bold ? s.bold : {}]}>{row.code}</Text>
            <Text style={[s.col1, row.bold ? s.bold : {}]}>{row.label}</Text>
            <Text style={[s.col2, row.bold ? s.bold : {}, { color: (row.value ?? 0) < 0 ? '#dc2626' : '#111' }]}>
              {row.value !== undefined ? fmt(row.value) : ''}
            </Text>
            <Text style={s.col3}></Text>
          </View>
        ))}
        <Text style={s.footer}>Tài liệu được tạo bởi Yen</Text>
      </Page>
    </Document>
  )
}
