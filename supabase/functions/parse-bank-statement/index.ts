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

    const { sheetPreview } = await req.json();
    if (!sheetPreview) {
      return new Response(JSON.stringify({ error: "sheetPreview is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prompt = `Đây là dữ liệu từ file sao kê ngân hàng Việt Nam (30 dòng đầu):

${sheetPreview}

Hãy xác định:
1. headerRowIdx: chỉ số dòng (0-based) chứa tiêu đề cột của bảng giao dịch (không phải dòng thông tin ngân hàng ở đầu file)
2. dateCol: chỉ số cột chứa ngày giao dịch
3. descCol: chỉ số cột chứa mô tả/diễn giải giao dịch
4. creditCol: chỉ số cột "ghi có" / tiền vào (số dương), -1 nếu không có
5. debitCol: chỉ số cột "ghi nợ" / tiền ra (số dương, sẽ được chuyển thành âm), -1 nếu không có
6. amountCol: chỉ số cột số tiền tổng hợp (nếu không tách Nợ/Có riêng), -1 nếu không có
7. balanceCol: chỉ số cột số dư, -1 nếu không có

Trả về JSON duy nhất, không thêm text khác:
{"headerRowIdx": 0, "dateCol": 0, "descCol": 1, "creditCol": 2, "debitCol": 3, "amountCol": -1, "balanceCol": 4}`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0 },
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
    let text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    // Strip markdown code fences if present
    text = text.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "").trim();

    const mapping = JSON.parse(text);
    return new Response(JSON.stringify({ data: mapping }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
