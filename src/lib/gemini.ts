const API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`

async function callGemini(prompt: string, maxTokens = 8192): Promise<string> {
  if (!API_KEY) throw new Error('VITE_GEMINI_API_KEY chưa được cấu hình trong file .env')

  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: maxTokens },
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Gemini API lỗi ${res.status}: ${err}`)
  }

  const json = await res.json()
  return json?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
}

function extractJSON(text: string, isArray: boolean): unknown {
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    const pattern = isArray ? /\[[\s\S]*\]/ : /\{[\s\S]*\}/
    const match = cleaned.match(pattern)
    if (match) return JSON.parse(match[0])
    throw new Error('Không thể parse kết quả từ Gemini')
  }
}

// ─── Bank Statement Column Detection ──────────────────────────────────────────

export interface ColumnMapping {
  dateCol: number
  descCol: number
  creditCol: number
  debitCol: number
  amountCol: number
  balanceCol: number
  headerRowIdx: number
}

export async function detectBankColumns(sheetPreview: string): Promise<ColumnMapping> {
  const prompt = `Đây là dữ liệu từ file sao kê ngân hàng Việt Nam (30 dòng đầu):

${sheetPreview}

Hãy xác định:
1. headerRowIdx: chỉ số dòng (0-based) chứa tiêu đề cột của bảng giao dịch
2. dateCol: chỉ số cột chứa ngày giao dịch
3. descCol: chỉ số cột chứa mô tả/diễn giải giao dịch
4. creditCol: chỉ số cột "ghi có" / tiền vào (số dương), -1 nếu không có
5. debitCol: chỉ số cột "ghi nợ" / tiền ra (số dương), -1 nếu không có
6. amountCol: chỉ số cột số tiền tổng hợp (nếu không tách Nợ/Có riêng), -1 nếu không có
7. balanceCol: chỉ số cột số dư, -1 nếu không có

Trả về JSON duy nhất, không thêm text khác:
{"headerRowIdx": 0, "dateCol": 0, "descCol": 1, "creditCol": 2, "debitCol": 3, "amountCol": -1, "balanceCol": 4}`

  const text = await callGemini(prompt, 512)
  return extractJSON(text, false) as ColumnMapping
}

// ─── Auto-match Transactions ───────────────────────────────────────────────────

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

export async function autoMatchTransactions(
  bankTxs: BankTxInput[],
  invoices: InvoiceInput[]
): Promise<GeminiMatchResult[]> {
  const prompt = `Bạn là kế toán viên chuyên nghiệp theo chuẩn VAS (Vietnam Accounting Standards).

Nhiệm vụ: Match các giao dịch ngân hàng với hóa đơn, và đề xuất tài khoản hạch toán.

QUY TẮC CHỌN TÀI KHOẢN:
- Chi phí quản lý (văn phòng, họp, tiếp khách, nhà hàng, khách sạn) → Nợ 642, Có 112
- Chi phí bán hàng → Nợ 641, Có 112
- Mua hàng hóa → Nợ 156, Có 112
- Mua nguyên vật liệu → Nợ 152, Có 112
- Chi phí tài chính (lãi vay) → Nợ 635, Có 112
- Chi phí khác → Nợ 811, Có 112
- Nếu có VAT đầu vào → thêm vat_account: "133"
- TK Có luôn là "112" (tiền gửi ngân hàng)

TIÊU CHÍ MATCH:
1. Số tiền gần khớp (chênh lệch < 1% hoặc = VAT)
2. Ngày giao dịch ngân hàng trong vòng 7 ngày so với ngày hóa đơn
3. Tên nhà cung cấp xuất hiện trong mô tả chuyển khoản
4. Số hóa đơn xuất hiện trong mô tả

BANK TRANSACTIONS:
${JSON.stringify(bankTxs, null, 2)}

INVOICES:
${JSON.stringify(invoices, null, 2)}

Trả về JSON array. Với mỗi bank transaction, trả về 1 object. invoice_id = null nếu không match được.

Format: [{"bank_tx_id":"...","invoice_id":"..." hoặc null,"debit_account":"642","credit_account":"112","vat_account":"133" hoặc null,"confidence":0.95,"reason":"..."}]

Chỉ trả về JSON array, không thêm text khác.`

  const text = await callGemini(prompt, 8192)
  return extractJSON(text, true) as GeminiMatchResult[]
}
