import { useMemo, useState } from 'react'
import { FileCode2, AlertCircle } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/shared/Dialog'
import { Button } from '@/components/shared/Button'
import { Input } from '@/components/shared/Input'
import { Label } from '@/components/shared/Label'
import { VNDInput } from '@/components/shared/VNDInput'
import { formatVND } from '@/lib/utils'
import {
  computeVat01, buildVat01Xml, vat01FileName, VAT01_LABELS, EMPTY_ADJUST,
  type Vat01Invoice, type Vat01Meta, type Vat01Adjust,
} from '@/lib/vat01'
import type { Company } from '@/types'

type SavedMeta = Pick<Vat01Meta, 'maCQTNoiNop' | 'tenCQTNoiNop' | 'maTinhNNT' | 'tenTinhNNT' | 'dchiNNT' | 'nguoiKy' | 'tenHHDVBanRa' | 'tenHHDVMuaVao'>

const storageKey = (companyId: string) => `yen.vat01.meta.${companyId}`
const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function loadMeta(company: Company): SavedMeta {
  const defaults: SavedMeta = {
    maCQTNoiNop: '', tenCQTNoiNop: '',
    maTinhNNT: '701', tenTinhNNT: 'Thành phố Hồ Chí Minh',
    dchiNNT: company.address?.split(',')[0]?.trim() ?? '',
    nguoiKy: (company.owner_name ?? '').toUpperCase(),
    tenHHDVBanRa: 'Hàng hóa, dịch vụ bán ra',
    tenHHDVMuaVao: 'Hàng hóa, dịch vụ mua vào',
  }
  try {
    const raw = localStorage.getItem(storageKey(company.id))
    return raw ? { ...defaults, ...JSON.parse(raw) } : defaults
  } catch {
    return defaults
  }
}

export function Vat01ExportDialog({ company, year, quarter, invoices, unpostedCount, onClose }: {
  company: Company
  year: number
  quarter: number
  invoices: Vat01Invoice[]
  /** Số hóa đơn trong kỳ chưa hạch toán (không được tính vào tờ khai) */
  unpostedCount: number
  onClose: () => void
}) {
  const [meta, setMeta] = useState<SavedMeta>(() => loadMeta(company))
  const [adj, setAdj] = useState<Vat01Adjust>(EMPTY_ADJUST)
  const [ngayKy, setNgayKy] = useState(today())
  const [loai, setLoai] = useState<'C' | 'B'>('C')
  const [soLan, setSoLan] = useState(0)

  const values = useMemo(() => computeVat01(invoices, adj), [invoices, adj])
  const missing = !meta.maCQTNoiNop.trim() || !meta.tenCQTNoiNop.trim() || !meta.nguoiKy.trim()

  const set = (k: keyof SavedMeta) => (e: React.ChangeEvent<HTMLInputElement>) => setMeta(m => ({ ...m, [k]: e.target.value }))
  const setAdjField = (k: keyof Vat01Adjust) => (n: number) => setAdj(a => ({ ...a, [k]: n }))

  function download() {
    try { localStorage.setItem(storageKey(company.id), JSON.stringify(meta)) } catch { /* trình duyệt chặn lưu: bỏ qua */ }
    const full: Vat01Meta = {
      ...meta, mst: company.mst, tenNNT: company.name.toUpperCase(),
      ngayKy, ngayLap: today(), year, quarter, loaiTKhai: loai, soLan: loai === 'C' ? 0 : soLan,
    }
    const xml = buildVat01Xml(values, full)
    const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = vat01FileName(full)
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Tờ khai 01/GTGT — Quý {quarter}/{year}</DialogTitle>
          <p className="text-sm text-slate-500">
            File XML theo đúng cấu trúc HTKK 5.8.1 (TT80/2021). Tính từ {invoices.length} hóa đơn đã hạch toán trong kỳ.
          </p>
        </DialogHeader>

        {unpostedCount > 0 && (
          <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            Còn {unpostedCount} hóa đơn trong quý chưa hạch toán nên chưa được tính. Hạch toán xong rồi mới xuất tờ khai.
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div><Label className="text-xs">Mã CQT nơi nộp *</Label><Input value={meta.maCQTNoiNop} onChange={set('maCQTNoiNop')} placeholder="VD: 70127" /></div>
          <div><Label className="text-xs">Tên CQT nơi nộp *</Label><Input value={meta.tenCQTNoiNop} onChange={set('tenCQTNoiNop')} placeholder="VD: Thuế cơ sở 16 Thành phố Hồ Chí Minh" /></div>
          <div><Label className="text-xs">Địa chỉ trụ sở</Label><Input value={meta.dchiNNT} onChange={set('dchiNNT')} /></div>
          <div className="grid grid-cols-[80px_1fr] gap-2">
            <div><Label className="text-xs">Mã tỉnh</Label><Input value={meta.maTinhNNT} onChange={set('maTinhNNT')} /></div>
            <div><Label className="text-xs">Tỉnh/TP</Label><Input value={meta.tenTinhNNT} onChange={set('tenTinhNNT')} /></div>
          </div>
          <div><Label className="text-xs">Người ký *</Label><Input value={meta.nguoiKy} onChange={set('nguoiKy')} /></div>
          <div><Label className="text-xs">Ngày ký</Label><Input type="date" value={ngayKy} onChange={e => setNgayKy(e.target.value)} /></div>
          <div>
            <Label className="text-xs">Loại tờ khai</Label>
            <select value={loai} onChange={e => setLoai(e.target.value as 'C' | 'B')}
              className="flex h-9 w-full rounded-md border border-gray-300 bg-white px-3 text-sm">
              <option value="C">Chính thức</option>
              <option value="B">Bổ sung</option>
            </select>
          </div>
          {loai === 'B' && (
            <div><Label className="text-xs">Bổ sung lần thứ</Label><Input type="number" min={1} value={soLan || 1} onChange={e => setSoLan(Number(e.target.value))} /></div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div><Label className="text-xs">[22] Còn được khấu trừ kỳ trước</Label><VNDInput value={adj.ct22} onChange={setAdjField('ct22')} /></div>
          <div><Label className="text-xs">[37] Điều chỉnh giảm</Label><VNDInput value={adj.ct37} onChange={setAdjField('ct37')} /></div>
          <div><Label className="text-xs">[38] Điều chỉnh tăng</Label><VNDInput value={adj.ct38} onChange={setAdjField('ct38')} /></div>
        </div>

        {(values.reduction.saleBase > 0 || values.reduction.purchaseBase > 0) && (
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Phụ lục giảm thuế — tên HHDV bán ra</Label><Input value={meta.tenHHDVBanRa} onChange={set('tenHHDVBanRa')} /></div>
            <div><Label className="text-xs">Phụ lục giảm thuế — tên HHDV mua vào</Label><Input value={meta.tenHHDVMuaVao} onChange={set('tenHHDVMuaVao')} /></div>
          </div>
        )}

        <div className="rounded-lg border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <tbody>
              {VAT01_LABELS.map(([k, label]) => {
                const v = values[k] as number
                const strong = k === 'ct40' || k === 'ct43'
                return (
                  <tr key={k} className={strong ? 'bg-indigo-50 font-semibold' : 'border-t border-slate-100'}>
                    <td className="px-3 py-1.5 font-mono text-xs text-slate-400 w-14">[{k.slice(2)}]</td>
                    <td className="px-3 py-1.5 text-slate-700">{label}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{v ? formatVND(v) : '—'}</td>
                  </tr>
                )
              })}
              {values.reduction.saleBase > 0 && (
                <tr className="border-t border-slate-200 bg-slate-50">
                  <td className="px-3 py-1.5 font-mono text-xs text-slate-400">PL</td>
                  <td className="px-3 py-1.5 text-slate-700">Thuế GTGT được giảm (10% → 8%) trên {formatVND(values.reduction.saleBase)} doanh thu</td>
                  <td className="px-3 py-1.5 text-right font-mono">{formatVND(values.reduction.saleReduced)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-slate-500">
          Cách nộp: đăng nhập thuedientu.gdt.gov.vn → Khai thuế → Nộp tờ khai XML → chọn file này → ký số → nộp.
          Nếu cổng thuế không nhận file, gõ các chỉ tiêu ở bảng trên vào HTKK.
        </p>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Đóng</Button>
          <Button onClick={download} disabled={missing}>
            <FileCode2 className="h-4 w-4" /> Tải file XML
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
