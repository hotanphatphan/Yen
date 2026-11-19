// Tờ khai thuế GTGT mẫu 01/GTGT (TT80/2021/TT-BTC), phương pháp khấu trừ, khai theo quý.
// Tính các chỉ tiêu [21]–[43] từ hóa đơn và xuất XML đúng cấu trúc file HTKK 5.8.1 (maTKhai 842, pbanTKhaiXML 2.8.3).
// Cấu trúc XML lấy theo tờ khai Q3/2026 thật của SprintWise (đã nộp thành công).

export interface Vat01Invoice {
  direction: 'incoming' | 'outgoing' | string
  subtotal: number
  vat_amount: number
  vat_rate: string | null
  line_items?: unknown
  description?: string | null
}

/** Nhóm thuế suất theo các dòng trên tờ khai. 'r10' gồm cả thuế suất 10% được giảm còn 8%. */
export type RateBucket = 'kct' | 'r0' | 'r5' | 'r10' | 'kkknt'

interface Portion { bucket: RateBucket; reduced: boolean; base: number; vat: number }

/** Đọc thuế suất: "8%", "10%", "0%", "KCT", "KKKNT", "KHAC:5.26%"... Trả về null nếu không rõ. */
export function parseRate(raw: string | null | undefined): { bucket: RateBucket; reduced: boolean } | null {
  const s = (raw ?? '').toUpperCase().replace(/\s/g, '')
  if (!s) return null
  if (s.includes('KKKNT')) return { bucket: 'kkknt', reduced: false }
  if (s.includes('KCT')) return { bucket: 'kct', reduced: false }
  const m = s.match(/(\d+(?:[.,]\d+)?)%?/)
  if (!m) return null
  const pct = parseFloat(m[1].replace(',', '.'))
  if (pct === 0) return { bucket: 'r0', reduced: false }
  if (pct === 5) return { bucket: 'r5', reduced: false }
  if (pct === 8) return { bucket: 'r10', reduced: true }
  if (pct === 10) return { bucket: 'r10', reduced: false }
  return null
}

function rateFromAmounts(base: number, vat: number): { bucket: RateBucket; reduced: boolean } {
  if (!base || !vat) return { bucket: 'r0', reduced: false }
  const pct = (vat / base) * 100
  if (pct < 6.5) return { bucket: 'r5', reduced: false }
  if (pct < 9) return { bucket: 'r10', reduced: true }
  return { bucket: 'r10', reduced: false }
}

const RATE_PCT: Record<string, number> = { r0: 0, r5: 5, r10: 10, kct: 0, kkknt: 0 }

/**
 * Tách 1 hóa đơn thành các phần theo thuế suất. Dùng từng dòng hàng (line_items) nếu tổng dòng khớp
 * tổng tiền chưa thuế; thuế GTGT được phân bổ theo tỷ lệ rồi dồn phần lẻ vào phần lớn nhất để tổng thuế
 * luôn đúng bằng tiền thuế trên hóa đơn.
 */
export function splitByRate(inv: Vat01Invoice): Portion[] {
  const lines = Array.isArray(inv.line_items) ? (inv.line_items as { amount?: number; vatRate?: string }[]) : []
  const usable = lines.filter(l => typeof l.amount === 'number' && parseRate(l.vatRate))
  const lineSum = usable.reduce((s, l) => s + (l.amount ?? 0), 0)
  const fallback = parseRate(inv.vat_rate) ?? rateFromAmounts(inv.subtotal, inv.vat_amount)

  if (usable.length === 0 || Math.abs(lineSum - inv.subtotal) > Math.max(1000, inv.subtotal * 0.005)) {
    return [{ ...fallback, base: inv.subtotal, vat: inv.vat_amount }]
  }
  const map = new Map<string, Portion>()
  for (const l of usable) {
    const r = parseRate(l.vatRate)!
    const k = `${r.bucket}|${r.reduced}`
    const p = map.get(k) ?? { ...r, base: 0, vat: 0 }
    p.base += l.amount ?? 0
    map.set(k, p)
  }
  const portions = [...map.values()]
  // Quy lại theo đúng tổng chưa thuế của hóa đơn (lệch do làm tròn/chiết khấu)
  const scale = inv.subtotal / (lineSum || 1)
  let vatAssigned = 0
  for (const p of portions) {
    p.base = Math.round(p.base * scale)
    const pct = p.reduced ? 8 : RATE_PCT[p.bucket]
    p.vat = Math.round((p.base * pct) / 100)
    vatAssigned += p.vat
  }
  const biggest = portions.reduce((a, b) => (b.base > a.base ? b : a))
  biggest.vat += inv.vat_amount - vatAssigned
  biggest.base += inv.subtotal - portions.reduce((s, p) => s + p.base, 0)
  return portions
}

export interface Vat01Adjust {
  ct22: number   // Thuế GTGT còn được khấu trừ kỳ trước chuyển sang
  ct37: number   // Điều chỉnh giảm
  ct38: number   // Điều chỉnh tăng
  ct39a: number  // Thuế GTGT nhận bàn giao được khấu trừ
  ct40b: number  // Thuế GTGT mua vào của dự án đầu tư được bù trừ
  ct42: number   // Đề nghị hoàn
}

export interface Vat01Values {
  ct21: 0 | 1
  ct22: number; ct23: number; ct24: number; ct23a: number; ct24a: number; ct25: number
  ct26: number; ct27: number; ct28: number; ct29: number; ct30: number; ct31: number
  ct32: number; ct33: number; ct32a: number; ct34: number; ct35: number; ct36: number
  ct37: number; ct38: number; ct39a: number; ct40a: number; ct40b: number; ct40: number
  ct41: number; ct42: number; ct43: number
  /** Phụ lục giảm thuế (thuế suất 10% giảm còn 8%) */
  reduction: { saleBase: number; saleReduced: number; purchaseBase: number; purchaseVat: number }
}

export const EMPTY_ADJUST: Vat01Adjust = { ct22: 0, ct37: 0, ct38: 0, ct39a: 0, ct40b: 0, ct42: 0 }

export function computeVat01(invoices: Vat01Invoice[], adj: Vat01Adjust = EMPTY_ADJUST): Vat01Values {
  const v = {
    ct23: 0, ct24: 0, ct26: 0, ct29: 0, ct30: 0, ct31: 0, ct32: 0, ct33: 0, ct32a: 0,
    saleReducedBase: 0, purchaseReducedBase: 0, purchaseReducedVat: 0,
  }
  for (const inv of invoices) {
    const parts = splitByRate(inv)
    if (inv.direction === 'incoming') {
      // [23]/[24] chỉ gồm HHDV mua vào có thuế GTGT được khấu trừ; hóa đơn bán hàng, hàng KCT (thuế = 0) không kê.
      if (!inv.vat_amount) continue
      v.ct23 += inv.subtotal
      v.ct24 += inv.vat_amount
      for (const p of parts) if (p.reduced) { v.purchaseReducedBase += p.base; v.purchaseReducedVat += p.vat }
      continue
    }
    for (const p of parts) {
      if (p.bucket === 'kct') v.ct26 += p.base
      else if (p.bucket === 'r0') v.ct29 += p.base
      else if (p.bucket === 'r5') { v.ct30 += p.base; v.ct31 += p.vat }
      else if (p.bucket === 'kkknt') v.ct32a += p.base
      else { v.ct32 += p.base; v.ct33 += p.vat; if (p.reduced) v.saleReducedBase += p.base }
    }
  }
  const ct25 = v.ct24 // toàn bộ thuế đầu vào trên hóa đơn hợp lệ được khấu trừ
  const ct27 = v.ct29 + v.ct30 + v.ct32 + v.ct32a
  const ct28 = v.ct31 + v.ct33
  const ct34 = v.ct26 + ct27
  const ct35 = ct28
  const ct36 = ct35 - ct25
  const net = ct36 - adj.ct22 + adj.ct37 - adj.ct38 - adj.ct39a
  const ct40a = Math.max(0, net)
  const ct40 = Math.max(0, ct40a - adj.ct40b)
  const ct41 = Math.max(0, -net)
  const ct42 = Math.min(adj.ct42, ct41)
  return {
    ct21: invoices.length === 0 ? 1 : 0,
    ct22: adj.ct22, ct23: v.ct23, ct24: v.ct24, ct23a: 0, ct24a: 0, ct25,
    ct26: v.ct26, ct27, ct28, ct29: v.ct29, ct30: v.ct30, ct31: v.ct31,
    ct32: v.ct32, ct33: v.ct33, ct32a: v.ct32a, ct34, ct35, ct36,
    ct37: adj.ct37, ct38: adj.ct38, ct39a: adj.ct39a, ct40a, ct40b: adj.ct40b, ct40,
    ct41, ct42, ct43: ct41 - ct42,
    reduction: {
      saleBase: v.saleReducedBase,
      saleReduced: Math.round(v.saleReducedBase * 0.02),
      purchaseBase: v.purchaseReducedBase,
      purchaseVat: v.purchaseReducedVat,
    },
  }
}

export interface Vat01Meta {
  mst: string
  tenNNT: string
  dchiNNT: string
  maTinhNNT: string     // VD 701 = TP.HCM
  tenTinhNNT: string
  maCQTNoiNop: string   // VD 70127
  tenCQTNoiNop: string  // VD "Thuế cơ sở 16 Thành phố Hồ Chí Minh"
  nguoiKy: string
  ngayKy: string        // yyyy-mm-dd
  ngayLap: string       // yyyy-mm-dd
  year: number
  quarter: number
  loaiTKhai: 'C' | 'B'  // C = chính thức, B = bổ sung
  soLan: number
  tenHHDVBanRa: string  // tên nhóm HHDV bán ra trên phụ lục giảm thuế
  tenHHDVMuaVao: string
}

/** Danh sách chỉ tiêu để hiển thị/đối chiếu khi gõ tay vào HTKK. */
export const VAT01_LABELS: [keyof Vat01Values, string][] = [
  ['ct22', 'Thuế GTGT còn được khấu trừ kỳ trước chuyển sang'],
  ['ct23', 'Giá trị HHDV mua vào'], ['ct24', 'Thuế GTGT HHDV mua vào'],
  ['ct25', 'Tổng số thuế GTGT được khấu trừ kỳ này'],
  ['ct26', 'HHDV bán ra không chịu thuế'],
  ['ct27', 'HHDV bán ra chịu thuế — doanh thu'], ['ct28', 'HHDV bán ra chịu thuế — thuế GTGT'],
  ['ct29', 'Bán ra thuế suất 0%'], ['ct30', 'Bán ra thuế suất 5% — doanh thu'], ['ct31', 'Bán ra thuế suất 5% — thuế'],
  ['ct32', 'Bán ra thuế suất 10% (gồm giảm còn 8%) — doanh thu'], ['ct33', 'Bán ra thuế suất 10% (gồm giảm còn 8%) — thuế'],
  ['ct32a', 'Bán ra không phải kê khai, tính nộp thuế'],
  ['ct34', 'Tổng doanh thu bán ra'], ['ct35', 'Tổng thuế GTGT bán ra'],
  ['ct36', 'Thuế GTGT phát sinh trong kỳ'],
  ['ct37', 'Điều chỉnh giảm'], ['ct38', 'Điều chỉnh tăng'], ['ct39a', 'Thuế nhận bàn giao được khấu trừ'],
  ['ct40a', 'Thuế GTGT phải nộp của hoạt động SXKD'], ['ct40b', 'Thuế mua vào dự án đầu tư được bù trừ'],
  ['ct40', 'THUẾ GTGT CÒN PHẢI NỘP'],
  ['ct41', 'Thuế GTGT chưa khấu trừ hết kỳ này'], ['ct42', 'Đề nghị hoàn'], ['ct43', 'Còn được khấu trừ chuyển kỳ sau'],
]

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const pad = (n: number) => String(n).padStart(2, '0')

export function vat01FileName(meta: Pick<Vat01Meta, 'mst' | 'year' | 'quarter' | 'soLan'>): string {
  return `${meta.mst}000-01_GTGT_TT80-Q${meta.quarter}${meta.year}-L${pad(meta.soLan)}.xml`
}

export function buildVat01Xml(v: Vat01Values, m: Vat01Meta): string {
  const fromM = (m.quarter - 1) * 3 + 1
  const lastDay = new Date(m.year, m.quarter * 3, 0).getDate()
  const tu = `01/${pad(fromM)}/${m.year}`
  const den = `${pad(lastDay)}/${pad(m.quarter * 3)}/${m.year}`
  const r = v.reduction
  const hasReduction = r.saleBase > 0 || r.purchaseBase > 0
  const pl = hasReduction ? `
    <PLuc>
      <PL_NQ142_GTGT>
        <HH_DV_MuaVaoTrongKy>${r.purchaseBase > 0 ? `
          <BangKeTenHHDV ID="ID_1">
            <tenHHDVMuaVao>${esc(m.tenHHDVMuaVao)}</tenHHDVMuaVao>
            <giaTriHHDVMuaVao>${r.purchaseBase}</giaTriHHDVMuaVao>
            <thueGTGTHHDV>${r.purchaseVat}</thueGTGTHHDV>
          </BangKeTenHHDV>` : ''}
          <tongCongGiaTriHHDVMuaVao>${r.purchaseBase}</tongCongGiaTriHHDVMuaVao>
          <tongCongThueGTGTHHDV>${r.purchaseVat}</tongCongThueGTGTHHDV>
        </HH_DV_MuaVaoTrongKy>
        <HH_DV_BanRaTrongKy>${r.saleBase > 0 ? `
          <BangKeTenHHDV ID="ID_1">
            <tenHHDV>${esc(m.tenHHDVBanRa)}</tenHHDV>
            <giaTriHHDV>${r.saleBase}</giaTriHHDV>
            <thueSuatTheoQuyDinh>10</thueSuatTheoQuyDinh>
            <thueSuatSauGiam>8</thueSuatSauGiam>
            <thueGTGTDuocGiam>${r.saleReduced}</thueGTGTDuocGiam>
          </BangKeTenHHDV>` : ''}
          <tongCongGiaTriHHDV>${r.saleBase}</tongCongGiaTriHHDV>
          <tongCongThueGTGTDuocGiam>${r.saleReduced}</tongCongThueGTGTDuocGiam>
        </HH_DV_BanRaTrongKy>
        <ChenhLech>
          <ct9>${r.saleReduced - r.purchaseVat}</ct9>
        </ChenhLech>
      </PL_NQ142_GTGT>
    </PLuc>` : ''

  return `<?xml version="1.0" encoding="UTF-8"?>
<HSoThueDTu xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns="http://kekhaithue.gdt.gov.vn/TKhaiThue">
  <HSoKhaiThue id="ID_1">
    <TTinChung>
      <TTinDVu>
        <maDVu>HTKK</maDVu>
        <tenDVu>HỖ TRỢ KÊ KHAI THUẾ</tenDVu>
        <pbanDVu>5.8.1</pbanDVu>
        <ttinNhaCCapDVu />
      </TTinDVu>
      <TTinTKhaiThue>
        <TKhaiThue>
          <maTKhai>842</maTKhai>
          <tenTKhai>TỜ KHAI THUẾ GIÁ TRỊ GIA TĂNG (Mẫu số 01/GTGT)</tenTKhai>
          <moTaBMau>(Ban hành kèm theo Thông tư số 80/2021/TT-BTC ngày 29 tháng 9 năm 2021 của Bộ trưởng Bộ Tài chính)</moTaBMau>
          <pbanTKhaiXML>2.8.3</pbanTKhaiXML>
          <loaiTKhai>${m.loaiTKhai}</loaiTKhai>
          <soLan>${m.soLan}</soLan>
          <KyKKhaiThue>
            <kieuKy>Q</kieuKy>
            <kyKKhai>${m.quarter}/${m.year}</kyKKhai>
            <kyKKhaiTuNgay>${tu}</kyKKhaiTuNgay>
            <kyKKhaiDenNgay>${den}</kyKKhaiDenNgay>
            <kyKKhaiTuThang />
            <kyKKhaiDenThang />
          </KyKKhaiThue>
          <maCQTNoiNop>${esc(m.maCQTNoiNop)}</maCQTNoiNop>
          <tenCQTNoiNop>${esc(m.tenCQTNoiNop)}</tenCQTNoiNop>
          <ngayLapTKhai>${m.ngayLap}</ngayLapTKhai>
          <GiaHan>
            <maLyDoGiaHan />
            <lyDoGiaHan />
          </GiaHan>
          <nguoiKy>${esc(m.nguoiKy)}</nguoiKy>
          <ngayKy>${m.ngayKy}</ngayKy>
          <nganhNgheKD />
        </TKhaiThue>
        <NNT>
          <mst>${esc(m.mst)}</mst>
          <tenNNT>${esc(m.tenNNT)}</tenNNT>
          <dchiNNT>${esc(m.dchiNNT)}</dchiNNT>
          <phuongXa />
          <maHuyenNNT />
          <tenHuyenNNT />
          <maTinhNNT>${esc(m.maTinhNNT)}</maTinhNNT>
          <tenTinhNNT>${esc(m.tenTinhNNT)}</tenTinhNNT>
          <dthoaiNNT />
          <faxNNT />
          <emailNNT />
        </NNT>
      </TTinTKhaiThue>
    </TTinChung>
    <CTieuTKhaiChinh>
      <ma_NganhNghe>00</ma_NganhNghe>
      <ten_NganhNghe>Hoạt động sản xuất kinh doanh thông thường</ten_NganhNghe>
      <tieuMucHachToan>1701</tieuMucHachToan>
      <Header>
        <ct09 />
        <ct10 />
        <DiaChiHDSXKDKhacTinhNDTSC>
          <ct11a_phuongXa_ma />
          <ct11a_phuongXa_ten />
          <ct11b_quanHuyen_ma />
          <ct11b_quanHuyen_ten />
          <ct11c_tinhTP_ma />
          <ct11c_tinhTP_ten />
        </DiaChiHDSXKDKhacTinhNDTSC>
      </Header>
      <ct21>${v.ct21}</ct21>
      <ct22>${v.ct22}</ct22>
      <GiaTriVaThueGTGTHHDVMuaVao>
        <ct23>${v.ct23}</ct23>
        <ct24>${v.ct24}</ct24>
      </GiaTriVaThueGTGTHHDVMuaVao>
      <HangHoaDichVuNhapKhau>
        <ct23a>${v.ct23a}</ct23a>
        <ct24a>${v.ct24a}</ct24a>
      </HangHoaDichVuNhapKhau>
      <ct25>${v.ct25}</ct25>
      <ct26>${v.ct26}</ct26>
      <HHDVBRaChiuThueGTGT>
        <ct27>${v.ct27}</ct27>
        <ct28>${v.ct28}</ct28>
      </HHDVBRaChiuThueGTGT>
      <ct29>${v.ct29}</ct29>
      <HHDVBRaChiuTSuat5>
        <ct30>${v.ct30}</ct30>
        <ct31>${v.ct31}</ct31>
      </HHDVBRaChiuTSuat5>
      <HHDVBRaChiuTSuat10>
        <ct32>${v.ct32}</ct32>
        <ct33>${v.ct33}</ct33>
      </HHDVBRaChiuTSuat10>
      <ct32a>${v.ct32a}</ct32a>
      <TongDThuVaThueGTGTHHDVBRa>
        <ct34>${v.ct34}</ct34>
        <ct35>${v.ct35}</ct35>
      </TongDThuVaThueGTGTHHDVBRa>
      <ct36>${v.ct36}</ct36>
      <ct37>${v.ct37}</ct37>
      <ct38>${v.ct38}</ct38>
      <ct39a>${v.ct39a}</ct39a>
      <ct40a>${v.ct40a}</ct40a>
      <ct40b>${v.ct40b}</ct40b>
      <ct40>${v.ct40}</ct40>
      <ct41>${v.ct41}</ct41>
      <ct42>${v.ct42}</ct42>
      <ct43>${v.ct43}</ct43>
    </CTieuTKhaiChinh>${pl}
  </HSoKhaiThue>
</HSoThueDTu>
`
}
