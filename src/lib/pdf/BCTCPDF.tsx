import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import type { Company } from '@/types'
import type { ReportLine } from '@/lib/financialStatements'

// PDF BCTC theo TT133 — nhận số liệu đã tính sẵn (cùng nguồn với màn hình và Excel).
const s = StyleSheet.create({
  page: { padding: 36, fontFamily: 'Helvetica', fontSize: 9 },
  title: { fontSize: 13, fontFamily: 'Helvetica-Bold', textAlign: 'center', marginBottom: 3 },
  subtitle: { fontSize: 9, textAlign: 'center', color: '#444', marginBottom: 3 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#1e3a8a', padding: 5, marginTop: 12 },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderColor: '#e5e7eb', paddingVertical: 4, paddingHorizontal: 4 },
  rowAlt: { flexDirection: 'row', borderBottomWidth: 0.5, borderColor: '#e5e7eb', paddingVertical: 4, paddingHorizontal: 4, backgroundColor: '#f9fafb' },
  colCode: { width: 34, fontSize: 8 },
  colLabel: { flex: 1, fontSize: 8 },
  colValue: { width: 100, textAlign: 'right', fontSize: 8 },
  headerText: { color: 'white', fontFamily: 'Helvetica-Bold', fontSize: 8 },
  bold: { fontFamily: 'Helvetica-Bold' },
  footer: { marginTop: 30, fontSize: 8, color: '#888', textAlign: 'center' },
})

const fmt = (n: number) => (n === 0 ? '—' : n < 0 ? `(${new Intl.NumberFormat('vi-VN').format(-n)})` : new Intl.NumberFormat('vi-VN').format(n))

function ReportPage({ title, form, sub, lines, company, valueLabel }: {
  title: string; form: string; sub: string; lines: ReportLine[]; company: Company; valueLabel: string
}) {
  return (
    <Page size="A4" style={s.page}>
      <Text style={s.title}>{title}</Text>
      <Text style={s.subtitle}>Mẫu số {form} (Ban hành theo Thông tư số 133/2016/TT-BTC)</Text>
      <Text style={s.subtitle}>{company.name} — MST: {company.mst}</Text>
      <Text style={s.subtitle}>{sub} · Đơn vị tính: đồng</Text>
      <View style={s.tableHeader}>
        <Text style={[s.colCode, s.headerText]}>Mã số</Text>
        <Text style={[s.colLabel, s.headerText]}>Chỉ tiêu</Text>
        <Text style={[s.colValue, s.headerText]}>{valueLabel}</Text>
      </View>
      {lines.map((l, i) => (
        <View key={l.code + i} style={i % 2 === 0 ? s.row : s.rowAlt}>
          <Text style={[s.colCode, l.bold ? s.bold : {}]}>{/^[A-Z]+$|^[IVX]+$/.test(l.code) ? '' : l.code}</Text>
          <Text style={[s.colLabel, l.bold ? s.bold : {}, l.indent ? { paddingLeft: 10 } : {}]}>{l.label}</Text>
          <Text style={[s.colValue, l.bold ? s.bold : {}, { color: (l.value ?? 0) < 0 ? '#dc2626' : '#111' }]}>
            {l.value !== undefined ? fmt(l.value) : ''}
          </Text>
        </View>
      ))}
      <Text style={s.footer}>Lập bằng Yen — số liệu tính từ sổ nhật ký chung</Text>
    </Page>
  )
}

export default function BCTCPDF({ company, periodLabel, asOf, b01, b02, b03 }: {
  company: Company
  periodLabel: string
  asOf: string
  b01: ReportLine[]
  b02: ReportLine[]
  b03: ReportLine[]
}) {
  return (
    <Document>
      <ReportPage title="BÁO CÁO TÌNH HÌNH TÀI CHÍNH" form="B01a-DNN" sub={`Tại ngày ${asOf}`} lines={b01} company={company} valueLabel="Số cuối kỳ" />
      <ReportPage title="BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH" form="B02-DNN" sub={`Kỳ: ${periodLabel}`} lines={b02} company={company} valueLabel="Kỳ này" />
      <ReportPage title="BÁO CÁO LƯU CHUYỂN TIỀN TỆ" form="B03-DNN" sub={`Phương pháp trực tiếp · Kỳ: ${periodLabel}`} lines={b03} company={company} valueLabel="Kỳ này" />
    </Document>
  )
}
