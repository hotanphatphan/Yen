const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY secret not configured. Add it in Supabase Edge Function Secrets.");

    const { sheetPreview } = await req.json();
    if (!sheetPreview) throw new Error("sheetPreview is required");

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

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 1024 },
        }),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      console.error("Gemini error response:", err);
      throw new Error(`Gemini API error: ${err}`);
    }

    const geminiData = await response.json();
    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    const cleaned = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    let mapping;
    try {
      mapping = JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) mapping = JSON.parse(match[0]);
      else throw new Error("Could not parse Gemini response as JSON");
    }

    return new Response(JSON.stringify({ data: mapping }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
