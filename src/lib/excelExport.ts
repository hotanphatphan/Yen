// Xuất Excel dùng chung cho mọi bảng trong app.
import * as XLSX from 'xlsx'

export type Cell = string | number | null | undefined

export interface SheetSpec {
  name: string             // tên sheet (≤ 31 ký tự)
  title?: string[]         // các dòng tiêu đề phía trên bảng (VD tên công ty, kỳ)
  header: string[]
  rows: Cell[][]
  widths?: number[]        // độ rộng cột (ký tự)
}

/** yyyy-mm-dd → dd/mm/yyyy để Excel hiển thị đúng kiểu Việt Nam */
export const vnDate = (d: string | null | undefined) => {
  if (!d) return ''
  const [y, m, day] = d.slice(0, 10).split('-')
  return day ? `${day}/${m}/${y}` : d
}

export function downloadExcel(fileBase: string, sheets: SheetSpec[]) {
  const wb = XLSX.utils.book_new()
  for (const s of sheets) {
    const aoa: Cell[][] = [...(s.title ?? []).map(t => [t]), ...(s.title?.length ? [[]] : []), s.header, ...s.rows]
    const ws = XLSX.utils.aoa_to_sheet(aoa.map(r => r.map(c => c ?? '')))
    ws['!cols'] = (s.widths ?? s.header.map(h => Math.max(10, h.length + 2))).map(wch => ({ wch }))
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31))
  }
  const safe = fileBase.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .replace(/[^\w-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase()
  XLSX.writeFile(wb, `${safe}-${new Date().toISOString().slice(0, 10)}.xlsx`)
}
