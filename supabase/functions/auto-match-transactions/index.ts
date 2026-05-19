import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: "GEMINI_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { bankTxs, invoices } = await req.json();
    if (!bankTxs || !invoices) {
      return new Response(JSON.stringify({ error: "bankTxs and invoices are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prompt = `Bạn là kế toán viên chuyên nghiệp theo chuẩn VAS (Vietnam Accounting Standards).

Nhiệm vụ: Match các giao dịch ngân hàng với hóa đơn tương ứng, và đề xuất tài khoản hạch toán.

QUY TẮC CHỌN TÀI KHOẢN:
- Chi phí quản lý (văn phòng, họp, tiếp khách, nhà hàng, khách sạn) → Nợ 642, Có 112
- Chi phí bán hàng → Nợ 641, Có 112
- Mua hàng hóa → Nợ 156, Có 112
- Mua nguyên vật liệu → Nợ 152, Có 112
- Chi phí tài chính (lãi vay) → Nợ 635, Có 112
- Chi phí khác → Nợ 811, Có 112
- Nếu có VAT đầu vào → thêm vat_account: "133"
- TK Có luôn là "112" (tiền gửi ngân hàng) cho khoản chi từ tài khoản

TIÊU CHÍ MATCH:
1. Số tiền gần khớp (chênh lệch < 1% hoặc = VAT)
2. Ngày giao dịch ngân hàng trong vòng 7 ngày so với ngày hóa đơn
3. Tên nhà cung cấp xuất hiện trong mô tả chuyển khoản
4. Số hóa đơn xuất hiện trong mô tả

BANK TRANSACTIONS (chưa hạch toán):
${JSON.stringify(bankTxs, null, 2)}

INVOICES (chưa được match):
${JSON.stringify(invoices, null, 2)}

Trả về JSON array. Với mỗi bank transaction, trả về 1 object. Nếu không match được invoice nào thì invoice_id = null nhưng vẫn suggest tài khoản dựa trên mô tả.

Format: [{
  "bank_tx_id": "...",
  "invoice_id": "..." hoặc null,
  "debit_account": "642",
  "credit_account": "112",
  "vat_account": "133" hoặc null,
  "confidence": 0.95,
  "reason": "Mô tả ngắn lý do match và chọn TK"
}]

Chỉ trả về JSON array, không thêm text khác.`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1 },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      return new Response(JSON.stringify({ error: `Gemini API error: ${geminiRes.status}`, detail: errText }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const geminiData = await geminiRes.json();
    let text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]";
    // Strip markdown code fences if present
    text = text.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "").trim();

    const results = JSON.parse(text);
    return new Response(JSON.stringify({ data: results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
