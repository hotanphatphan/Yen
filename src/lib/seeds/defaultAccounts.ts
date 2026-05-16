import type { AccountType } from '@/types'

interface AccountSeed {
  code: string
  name: string
  type: AccountType
  parent_code: string | null
}

export const DEFAULT_ACCOUNTS: AccountSeed[] = [
  // Tài sản ngắn hạn
  { code: '111', name: 'Tiền mặt', type: 'asset', parent_code: null },
  { code: '112', name: 'Tiền gửi ngân hàng', type: 'asset', parent_code: null },
  { code: '131', name: 'Phải thu của khách hàng', type: 'asset', parent_code: null },
  { code: '133', name: 'Thuế GTGT được khấu trừ', type: 'asset', parent_code: null },
  { code: '141', name: 'Tạm ứng', type: 'asset', parent_code: null },
  { code: '152', name: 'Nguyên liệu, vật liệu', type: 'asset', parent_code: null },
  { code: '153', name: 'Công cụ, dụng cụ', type: 'asset', parent_code: null },
  { code: '155', name: 'Thành phẩm', type: 'asset', parent_code: null },
  { code: '156', name: 'Hàng hóa', type: 'asset', parent_code: null },
  // Tài sản dài hạn
  { code: '211', name: 'Tài sản cố định hữu hình', type: 'asset', parent_code: null },
  { code: '214', name: 'Hao mòn tài sản cố định', type: 'asset', parent_code: null },
  { code: '242', name: 'Chi phí trả trước', type: 'asset', parent_code: null },
  // Nợ phải trả
  { code: '311', name: 'Vay và nợ thuê tài chính ngắn hạn', type: 'liability', parent_code: null },
  { code: '331', name: 'Phải trả cho người bán', type: 'liability', parent_code: null },
  { code: '333', name: 'Thuế và các khoản phải nộp nhà nước', type: 'liability', parent_code: null },
  { code: '3331', name: 'Thuế GTGT phải nộp', type: 'liability', parent_code: '333' },
  { code: '3334', name: 'Thuế thu nhập doanh nghiệp', type: 'liability', parent_code: '333' },
  { code: '334', name: 'Phải trả người lao động', type: 'liability', parent_code: null },
  { code: '338', name: 'Phải trả, phải nộp khác', type: 'liability', parent_code: null },
  { code: '341', name: 'Vay và nợ thuê tài chính dài hạn', type: 'liability', parent_code: null },
  // Vốn chủ sở hữu
  { code: '411', name: 'Vốn đầu tư của chủ sở hữu', type: 'equity', parent_code: null },
  { code: '421', name: 'Lợi nhuận sau thuế chưa phân phối', type: 'equity', parent_code: null },
  // Doanh thu
  { code: '511', name: 'Doanh thu bán hàng và cung cấp dịch vụ', type: 'revenue', parent_code: null },
  { code: '5111', name: 'Doanh thu bán hàng', type: 'revenue', parent_code: '511' },
  { code: '5113', name: 'Doanh thu cung cấp dịch vụ', type: 'revenue', parent_code: '511' },
  { code: '515', name: 'Doanh thu hoạt động tài chính', type: 'revenue', parent_code: null },
  { code: '711', name: 'Thu nhập khác', type: 'revenue', parent_code: null },
  // Chi phí
  { code: '611', name: 'Mua hàng', type: 'expense', parent_code: null },
  { code: '621', name: 'Chi phí nguyên liệu, vật liệu trực tiếp', type: 'expense', parent_code: null },
  { code: '622', name: 'Chi phí nhân công trực tiếp', type: 'expense', parent_code: null },
  { code: '627', name: 'Chi phí sản xuất chung', type: 'expense', parent_code: null },
  { code: '631', name: 'Giá thành sản xuất', type: 'expense', parent_code: null },
  { code: '641', name: 'Chi phí bán hàng', type: 'expense', parent_code: null },
  { code: '642', name: 'Chi phí quản lý doanh nghiệp', type: 'expense', parent_code: null },
  { code: '635', name: 'Chi phí tài chính', type: 'expense', parent_code: null },
  { code: '811', name: 'Chi phí khác', type: 'expense', parent_code: null },
  { code: '821', name: 'Chi phí thuế thu nhập doanh nghiệp', type: 'expense', parent_code: null },
]
