import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import type { Company } from '@/types'

const s = StyleSheet.create({
  page: { padding: 40, fontFamily: 'Helvetica', fontSize: 10 },
  title: { fontSize: 14, fontFamily: 'Helvetica-Bold', textAlign: 'center', marginBottom: 4 },
  subtitle: { fontSize: 10, textAlign: 'center', color: '#555', marginBottom: 20 },
  section: { marginBottom: 12 },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderColor: '#ddd', paddingVertical: 6 },
  label: { flex: 1, color: '#555' },
  value: { width: 150, textAlign: 'right', fontFamily: 'Helvetica-Bold' },
  header: { backgroundColor: '#f0f4ff', padding: 6, marginBottom: 8, fontSize: 11, fontFamily: 'Helvetica-Bold' },
  total: { backgroundColor: '#fef2f2', padding: 8, marginTop: 8 },
  totalLabel: { flex: 1, fontFamily: 'Helvetica-Bold', fontSize: 11 },
  totalValue: { width: 150, textAlign: 'right', fontFamily: 'Helvetica-Bold', fontSize: 14, color: '#dc2626' },
})

function formatVND(amount: number) {
  return new Intl.NumberFormat('vi-VN').format(amount) + ' đ'
}

interface Props {
  company: Company
  period: string
  outputVAT: number
  inputVAT: number
  payable: number
  totalRevenue: number
}

export default function VATPDF({ company, period, outputVAT, inputVAT, payable, totalRevenue }: Props) {
  const [y, q] = period.split('-Q')
  const periodLabel = `Quý ${q}/${y}`

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.title}>TỜ KHAI THUẾ GIÁ TRỊ GIA TĂNG</Text>
        <Text style={s.subtitle}>(Dành cho cơ sở kinh doanh khai thuế GTGT theo phương pháp khấu trừ)</Text>
        <Text style={s.subtitle}>Kỳ tính thuế: {periodLabel}</Text>

        <View style={s.section}>
          <View style={s.header}><Text>THÔNG TIN DOANH NGHIỆP</Text></View>
          <View style={s.row}><Text style={s.label}>Tên người nộp thuế:</Text><Text style={s.value}>{company.name}</Text></View>
          <View style={s.row}><Text style={s.label}>Mã số thuế:</Text><Text style={s.value}>{company.mst}</Text></View>
        </View>

        <View style={s.section}>
          <View style={s.header}><Text>PHẦN I — THUẾ GTGT PHẢI NỘP THEO PHƯƠNG PHÁP KHẤU TRỪ</Text></View>

          <View style={s.row}>
            <Text style={s.label}>Hàng hóa, dịch vụ mua vào trong kỳ (chưa có thuế GTGT):</Text>
            <Text style={s.value}>{formatVND(Math.round(totalRevenue / (1 + company.vat_rate / 100)))}</Text>
          </View>

          <View style={s.row}>
            <Text style={s.label}>Doanh thu hàng hóa, dịch vụ bán ra chịu thuế suất 10%:</Text>
            <Text style={s.value}>{formatVND(totalRevenue)}</Text>
          </View>

          <View style={s.row}>
            <Text style={s.label}>Thuế GTGT đầu ra phát sinh trong kỳ:</Text>
            <Text style={s.value}>{formatVND(outputVAT)}</Text>
          </View>

          <View style={s.row}>
            <Text style={s.label}>Thuế GTGT được khấu trừ kỳ này:</Text>
            <Text style={s.value}>{formatVND(inputVAT)}</Text>
          </View>
        </View>

        <View style={[s.total, { flexDirection: 'row' }]}>
          <Text style={s.totalLabel}>Thuế GTGT phải nộp trong kỳ:</Text>
          <Text style={[s.totalValue, { color: payable < 0 ? '#16a34a' : '#dc2626' }]}>
            {payable < 0 ? '(Được hoàn) ' : ''}{formatVND(Math.abs(payable))}
          </Text>
        </View>

        <View style={{ marginTop: 40, flexDirection: 'row', justifyContent: 'flex-end' }}>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 9, color: '#555' }}>Ngày ......... tháng ......... năm .........</Text>
            <Text style={{ fontSize: 9, color: '#555', marginTop: 40 }}>Người nộp thuế hoặc đại diện hợp pháp</Text>
            <Text style={{ fontSize: 9, color: '#777', marginTop: 4 }}>(Ký, ghi rõ họ tên; chức vụ và đóng dấu)</Text>
          </View>
        </View>

        <Text style={{ position: 'absolute', bottom: 20, left: 40, right: 40, textAlign: 'center', fontSize: 8, color: '#aaa' }}>
          Tài liệu được tạo bởi Yen — Chỉ mang tính tham khảo, không thay thế tờ khai chính thức nộp lên cơ quan thuế
        </Text>
      </Page>
    </Document>
  )
}
