import type { CategoryType } from '@/types'

interface CategorySeed {
  name: string
  type: CategoryType
  account_code: string
}

export const DEFAULT_CATEGORIES: CategorySeed[] = [
  { name: 'Doanh thu bán hàng', type: 'income', account_code: '5111' },
  { name: 'Doanh thu dịch vụ', type: 'income', account_code: '5113' },
  { name: 'Thu nhập tài chính', type: 'income', account_code: '515' },
  { name: 'Thu nhập khác', type: 'income', account_code: '711' },
  { name: 'Nguyên vật liệu', type: 'expense', account_code: '621' },
  { name: 'Nhân công', type: 'expense', account_code: '622' },
  { name: 'Thuê mặt bằng', type: 'expense', account_code: '642' },
  { name: 'Điện/nước', type: 'expense', account_code: '642' },
  { name: 'Vận chuyển', type: 'expense', account_code: '641' },
  { name: 'Quảng cáo/Marketing', type: 'expense', account_code: '641' },
  { name: 'Văn phòng phẩm', type: 'expense', account_code: '642' },
  { name: 'Mua hàng hóa', type: 'expense', account_code: '611' },
  { name: 'Chi phí tài chính', type: 'expense', account_code: '635' },
  { name: 'Chi phí khác', type: 'expense', account_code: '811' },
]
