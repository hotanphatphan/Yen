// Auto-match: rule-based, không cần API
// Match bank transactions ↔ invoices theo số tiền + ngày + tên vendor
// Suggest tài khoản hạch toán theo từ khóa VAS

export interface GeminiMatchResult {
  bank_tx_id: string
  invoice_id: string | null
  debit_account: string
  credit_account: string
  vat_account: string | null
  confidence: number
  reason: string
}

export interface BankTxInput {
  id: string
  date: string
  description: string
  amount: number
}

export interface InvoiceInput {
  id: string
  date: string
  vendor: string
  amount: number
  vat_amount: number
  invoice_number: string | null
  category: string | null
}

// ─── Suggest tài khoản hạch toán từ mô tả giao dịch ─────────────────────────

const ACCOUNT_RULES: { keywords: string[]; debit: string; hasVAT: boolean; label: string }[] = [
  { keywords: ['luong', 'salary', 'tien luong', 'nhan vien', 'thu nhap'], debit: '334', hasVAT: false, label: 'Lương nhân viên' },
  { keywords: ['thue', 'thue tndn', 'thue gtgt', 'nop thue', 'kho bac'], debit: '333', hasVAT: false, label: 'Nộp thuế' },
  { keywords: ['lai vay', 'lai suat', 'interest', 'vay ngan hang', 'tra lai'], debit: '635', hasVAT: false, label: 'Chi phí tài chính' },
  { keywords: ['mua hang', 'hang hoa', 'nhap hang', 'purchase', 'vendor'], debit: '156', hasVAT: true, label: 'Mua hàng hóa' },
  { keywords: ['nguyen lieu', 'nguyen vat lieu', 'vat tu', 'raw material'], debit: '152', hasVAT: true, label: 'Mua nguyên vật liệu' },
  { keywords: ['ban hang', 'hoa hong', 'marketing', 'quang cao', 'advertis'], debit: '641', hasVAT: false, label: 'Chi phí bán hàng' },
  { keywords: ['thue mat bang', 'tien thue', 'rental', 'rent'], debit: '642', hasVAT: false, label: 'Tiền thuê' },
  { keywords: ['dien', 'nuoc', 'electricity', 'water', 'tien dien', 'tien nuoc'], debit: '642', hasVAT: true, label: 'Điện nước' },
  { keywords: ['internet', 'vien thong', 'dien thoai', 'fpt', 'vnpt', 'viettel', 'mobifone'], debit: '642', hasVAT: true, label: 'Viễn thông' },
  { keywords: ['van phong pham', 'van phong', 'office', 'stationery'], debit: '642', hasVAT: true, label: 'Văn phòng phẩm' },
  { keywords: ['bao hiem', 'insurance', 'bhxh', 'bhyt'], debit: '642', hasVAT: false, label: 'Bảo hiểm' },
  { keywords: ['taxi', 'grab', 'be ', 'gojek', 'xe om', 'di chuyen', 'cong tac', 'travel', 'transport', 'xang', 'petrol'], debit: '642', hasVAT: false, label: 'Đi lại' },
  { keywords: ['nha hang', 'quan an', 'cafe', 'coffee', 'bua an', 'tiep khach', 'entertainment', 'hotel', 'khach san'], debit: '642', hasVAT: false, label: 'Tiếp khách' },
  { keywords: ['sua chua', 'bao tri', 'maintenance', 'repair'], debit: '642', hasVAT: true, label: 'Sửa chữa bảo trì' },
  { keywords: ['dao tao', 'training', 'hoc phi', 'course'], debit: '642', hasVAT: false, label: 'Đào tạo' },
  { keywords: ['phi', 'fee', 'dich vu', 'service'], debit: '642', hasVAT: false, label: 'Chi phí dịch vụ' },
]

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

function suggestAccount(description: string, category: string | null): { debit: string; hasVAT: boolean; label: string } {
  const text = normalize(description + ' ' + (category ?? ''))
  for (const rule of ACCOUNT_RULES) {
    if (rule.keywords.some(k => text.includes(k))) {
      return { debit: rule.debit, hasVAT: rule.hasVAT, label: rule.label }
    }
  }
  return { debit: '642', hasVAT: false, label: 'Chi phí quản lý' }
}

// ─── Match bank tx ↔ invoice ─────────────────────────────────────────────────

function daysDiff(d1: string, d2: string): number {
  return Math.abs((new Date(d1).getTime() - new Date(d2).getTime()) / 86400000)
}

function scoreMatch(bt: BankTxInput, inv: InvoiceInput): number {
  let score = 0

  // Số tiền khớp (quan trọng nhất)
  const btAmt = Math.abs(bt.amount)
  const invTotal = inv.amount + inv.vat_amount
  const diff = Math.abs(btAmt - invTotal) / Math.max(invTotal, 1)
  if (diff < 0.001) score += 60       // khớp chính xác
  else if (diff < 0.01) score += 40   // chênh < 1%
  else if (diff < 0.05) score += 15   // chênh < 5%
  else return 0                        // chênh quá nhiều → không match

  // Ngày giao dịch gần nhau
  const days = daysDiff(bt.date, inv.date)
  if (days <= 1) score += 25
  else if (days <= 3) score += 15
  else if (days <= 7) score += 8
  else if (days > 14) score -= 10

  // Tên vendor xuất hiện trong mô tả
  if (inv.vendor) {
    const vendorNorm = normalize(inv.vendor)
    const descNorm = normalize(bt.description)
    const words = vendorNorm.split(/\s+/).filter(w => w.length > 3)
    const matched = words.filter(w => descNorm.includes(w))
    if (matched.length > 0) score += Math.min(matched.length * 8, 20)
  }

  // Số hóa đơn xuất hiện trong mô tả
  if (inv.invoice_number && normalize(bt.description).includes(normalize(inv.invoice_number))) {
    score += 20
  }

  return score
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function autoMatchTransactions(
  bankTxs: BankTxInput[],
  invoices: InvoiceInput[]
): Promise<GeminiMatchResult[]> {
  const usedInvoices = new Set<string>()

  return bankTxs.map(bt => {
    // Chỉ match khoản chi (số âm)
    let bestInvoice: InvoiceInput | null = null
    let bestScore = 0

    if (bt.amount < 0) {
      for (const inv of invoices) {
        if (usedInvoices.has(inv.id)) continue
        const score = scoreMatch(bt, inv)
        if (score > bestScore) {
          bestScore = score
          bestInvoice = inv
        }
      }
    }

    if (bestInvoice && bestScore >= 40) {
      usedInvoices.add(bestInvoice.id)
    } else {
      bestInvoice = null
    }

    const { debit, hasVAT, label } = suggestAccount(
      bt.description,
      bestInvoice?.category ?? null
    )

    const confidence = bestInvoice
      ? Math.min(Math.round(bestScore) / 100, 0.99)
      : 0.5

    const reason = bestInvoice
      ? `Khớp hóa đơn ${bestInvoice.invoice_number ?? bestInvoice.vendor} (score ${bestScore})`
      : `Không tìm được hóa đơn — đề xuất ${debit} (${label})`

    return {
      bank_tx_id: bt.id,
      invoice_id: bestInvoice?.id ?? null,
      debit_account: debit,
      credit_account: '112',
      vat_account: hasVAT ? '133' : null,
      confidence,
      reason,
    }
  })
}
