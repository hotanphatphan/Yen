import type { Invoice } from '@/types'

export interface AccountingSuggestion {
  // Main line
  debitAccount: string
  debitAccountName: string
  creditAccount: string
  creditAccountName: string
  // VAT line (null if no VAT)
  vatDebitAccount: string | null
  vatCreditAccount: string | null
}

const ACCOUNT_NAMES: Record<string, string> = {
  '111': 'Tiền mặt',
  '112': 'Tiền gửi ngân hàng',
  '131': 'Phải thu khách hàng',
  '1331': 'Thuế GTGT đầu vào được khấu trừ',
  '133': 'Thuế GTGT được khấu trừ',
  '152': 'Nguyên vật liệu',
  '153': 'Công cụ dụng cụ',
  '156': 'Hàng hóa',
  '211': 'Tài sản cố định',
  '331': 'Phải trả người bán',
  '3311': 'Phải trả người bán trong nước',
  '511': 'Doanh thu bán hàng',
  '5111': 'Doanh thu bán hàng hóa',
  '515': 'Doanh thu hoạt động tài chính',
  '3331': 'Thuế GTGT phải nộp',
  '33311': 'Thuế GTGT đầu ra',
  '621': 'Chi phí nguyên vật liệu',
  '627': 'Chi phí sản xuất chung',
  '641': 'Chi phí bán hàng',
  '642': 'Chi phí quản lý doanh nghiệp',
  '635': 'Chi phí tài chính',
  '811': 'Chi phí khác',
}

// Keywords → expense account mapping
const EXPENSE_KEYWORDS: [RegExp, string][] = [
  [/nhà hàng|restaurant|bbq|ăn uống|tiếp khách|coffee|cafe|quán|bar|bistro|pizza|sushi|lẩu|nướng|hải sản/i, '642'],
  [/khách sạn|hotel|resort|villa|homestay|lưu trú/i, '642'],
  [/vé bay|airline|vietnam airlines|vietjet|bamboo|jetstar|máy bay|flight/i, '642'],
  [/taxi|grab|gojek|xăng|nhiên liệu|parking|bãi đỗ/i, '642'],
  [/văn phòng|phòng họp|coworking|office|thuê mặt bằng|thuê văn phòng/i, '642'],
  [/phần mềm|software|cloud|aws|google|microsoft|saas|subscription|app/i, '642'],
  [/quảng cáo|marketing|facebook|google ads|tiktok|promotion|banner|print/i, '641'],
  [/bảo hiểm|insurance/i, '642'],
  [/điện|nước|internet|viễn thông|điện thoại|viettel|vnpt|mobifone/i, '642'],
  [/văn phòng phẩm|stationery|printing|in ấn|photocopy/i, '642'],
  [/vật tư|nguyên vật liệu|nguyên liệu|raw material/i, '152'],
  [/hàng hóa|goods|sản phẩm|merchandise/i, '156'],
  [/lãi vay|interest|bank charge|phí ngân hàng/i, '635'],
  [/thuê xe|car rental|xe công ty/i, '642'],
  [/bảo trì|maintenance|sửa chữa|repair/i, '627'],
]

function suggestExpenseAccount(vendorName: string): string {
  const lower = vendorName.toLowerCase()
  for (const [pattern, account] of EXPENSE_KEYWORDS) {
    if (pattern.test(lower)) return account
  }
  return '642' // default: management expense
}

export function suggestAccounts(invoice: Invoice): AccountingSuggestion {
  const hasVat = invoice.vat_amount > 0

  if (invoice.direction === 'incoming') {
    // Purchase invoice (mua vào):
    //   Nợ 641/642 (expense)  + Nợ 1331 (input VAT) / Có 331 (accounts payable)
    const expenseAccount = suggestExpenseAccount(invoice.seller_name ?? '')
    return {
      debitAccount: expenseAccount,
      debitAccountName: ACCOUNT_NAMES[expenseAccount] ?? expenseAccount,
      creditAccount: '331',
      creditAccountName: ACCOUNT_NAMES['331'],
      vatDebitAccount: hasVat ? '1331' : null,
      vatCreditAccount: hasVat ? '331' : null,
    }
  } else {
    // Sale invoice (bán ra):
    //   Nợ 131 (receivable) / Có 511 (revenue) + Có 33311 (output VAT)
    return {
      debitAccount: '131',
      debitAccountName: ACCOUNT_NAMES['131'],
      creditAccount: '511',
      creditAccountName: ACCOUNT_NAMES['511'],
      vatDebitAccount: hasVat ? '131' : null,
      vatCreditAccount: hasVat ? '33311' : null,
    }
  }
}

export function getAccountName(code: string): string {
  return ACCOUNT_NAMES[code] ?? code
}

export const COMMON_ACCOUNTS = Object.entries(ACCOUNT_NAMES).map(([code, name]) => ({
  code,
  name,
  label: `${code} — ${name}`,
}))
