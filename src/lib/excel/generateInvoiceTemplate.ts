import * as XLSX from 'xlsx'
import type { Category } from '@/types'

export function generateInvoiceTemplate(
  companyName: string,
  categories: Pick<Category, 'name' | 'type'>[]
): Blob {
  const wb = XLSX.utils.book_new()

  const incomeCategories = categories.filter(c => c.type === 'income').map(c => c.name)
  const expenseCategories = categories.filter(c => c.type === 'expense').map(c => c.name)
  const allCategories = [...incomeCategories, ...expenseCategories]

  // Hidden categories sheet for dropdown validation
  const catWs = XLSX.utils.aoa_to_sheet(allCategories.map(c => [c]))
  XLSX.utils.book_append_sheet(wb, catWs, '_categories')

  // Instruction sheet
  const instructionData = [
    [`HƯỚNG DẪN ĐIỀN TEMPLATE HÓA ĐƠN — ${companyName}`],
    [''],
    ['CÁC CỘT BẮT BUỘC:'],
    ['• Ngày hóa đơn: Định dạng DD/MM/YYYY (VD: 01/05/2026)'],
    ['• Số tiền (chưa VAT): Số nguyên, đơn vị VND, không có dấu phẩy'],
    ['• Tiền VAT: Số nguyên, đơn vị VND. Nếu không có VAT, điền 0'],
    ['• Loại (Thu/Chi): Điền chính xác "Thu" hoặc "Chi"'],
    ['• Danh mục: Chọn từ danh sách sau:'],
    [''],
    ['DANH MỤC THU:'],
    ...incomeCategories.map(c => [`  - ${c}`]),
    [''],
    ['DANH MỤC CHI:'],
    ...expenseCategories.map(c => [`  - ${c}`]),
    [''],
    ['LƯU Ý:'],
    ['• Không xóa hoặc chỉnh sửa hàng tiêu đề (hàng 1 của sheet "Dữ liệu hóa đơn")'],
    ['• Điền từ hàng 2 trở đi'],
    ['• Một hàng = một hóa đơn'],
    ['• Có thể nhờ AI (ChatGPT, Claude) đọc hóa đơn và điền vào template này'],
  ]
  const instrWs = XLSX.utils.aoa_to_sheet(instructionData)
  instrWs['!cols'] = [{ wch: 70 }]
  XLSX.utils.book_append_sheet(wb, instrWs, 'Hướng dẫn')

  // Main data sheet
  const headers = [
    'Ngày hóa đơn',
    'Số hóa đơn',
    'Người bán/mua',
    'Mô tả hàng hóa/dịch vụ',
    'Số tiền (chưa VAT)',
    'Tiền VAT',
    'Tổng tiền',
    'Loại (Thu/Chi)',
    'Danh mục',
  ]
  const dataWs = XLSX.utils.aoa_to_sheet([headers])
  dataWs['!cols'] = [
    { wch: 14 }, { wch: 12 }, { wch: 25 }, { wch: 35 },
    { wch: 18 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 25 },
  ]

  // Data validation for Loại column (H) — rows 2-201
  const typeValidation = {
    type: 'list' as const,
    operator: 'between' as const,
    formula1: '"Thu,Chi"',
    showErrorMessage: true,
    error: 'Chỉ được nhập "Thu" hoặc "Chi"',
    errorTitle: 'Giá trị không hợp lệ',
  }

  // Data validation for Danh mục column (I)
  const catCount = allCategories.length
  const categoryValidation = {
    type: 'list' as const,
    operator: 'between' as const,
    formula1: `_categories!$A$1:$A$${catCount}`,
    showErrorMessage: true,
    error: 'Chọn danh mục từ danh sách',
    errorTitle: 'Danh mục không hợp lệ',
  }

  if (!dataWs['!dataValidation']) dataWs['!dataValidation'] = []
  dataWs['!dataValidation'].push(
    { sqref: 'H2:H201', ...typeValidation },
    { sqref: 'I2:I201', ...categoryValidation }
  )

  XLSX.utils.book_append_sheet(wb, dataWs, 'Dữ liệu hóa đơn')

  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}
