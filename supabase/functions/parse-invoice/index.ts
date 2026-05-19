const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── XML parser (Vietnamese e-invoice standard format) ────────────────────────

function parseXml(xmlText: string, companyMst: string) {
  const get = (tag: string) => {
    const m = xmlText.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
    return m ? m[1].trim() : "";
  };

  // Seller: use NBan context
  const nbanMatch = xmlText.match(/<NBan>([\s\S]*?)<\/NBan>/i);
  const nbanBlock = nbanMatch ? nbanMatch[1] : "";
  const nmuaMatch = xmlText.match(/<NMua>([\s\S]*?)<\/NMua>/i);
  const nmuaBlock = nmuaMatch ? nmuaMatch[1] : "";

  const getIn = (block: string, tag: string) => {
    const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
    return m ? m[1].trim() : "";
  };

  const sellerName = getIn(nbanBlock, "Ten");
  const sellerMst = getIn(nbanBlock, "MST");
  const buyerName = getIn(nmuaBlock, "Ten");
  const buyerMst = getIn(nmuaBlock, "MST");

  // Date: NLap = YYYY-MM-DD
  const rawDate = get("NLap");
  const invoiceDate = rawDate || null;

  // Financials
  const subtotal = Math.round(parseFloat(get("TgTCThue") || "0"));
  const vatAmount = Math.round(parseFloat(get("TgTThue") || "0"));
  const total = Math.round(parseFloat(get("TgTTTBSo") || "0"));

  // Line items
  const lineItems: object[] = [];
  const itemRegex = /<HHDVu>([\s\S]*?)<\/HHDVu>/gi;
  let itemMatch;
  while ((itemMatch = itemRegex.exec(xmlText)) !== null) {
    const b = itemMatch[1];
    lineItems.push({
      description: getIn(b, "THHDVu"),
      unit: getIn(b, "DVTinh"),
      quantity: parseFloat(getIn(b, "SLuong") || "1"),
      unitPrice: parseFloat(getIn(b, "DGia") || "0"),
      amount: parseFloat(getIn(b, "ThTien") || "0"),
      vatRate: getIn(b, "TSuat"),
    });
  }

  const vatRate = lineItems.length > 0 ? (lineItems[0] as { vatRate: string }).vatRate : get("TSuat");

  return {
    invoiceNumber: get("SHDon"),
    invoiceSeries: get("KHHDon"),
    invoiceDate,
    sellerName,
    sellerMst,
    buyerName,
    buyerMst,
    subtotal,
    vatAmount,
    total,
    vatRate,
    lineItems,
    direction: sellerMst === companyMst ? "outgoing" : "incoming",
  };
}

// ─── PDF text parser (rule-based regex) ──────────────────────────────────────

function parseNumber(s: string): number {
  // Handle Vietnamese number format: 1.234.567 or 1,234,567
  if (!s) return 0;
  const clean = s.replace(/\./g, "").replace(/,/g, "");
  return Math.round(parseFloat(clean) || 0);
}

function parsePdfText(text: string, companyMst: string) {
  // ── Invoice number ──
  let invoiceNumber =
    (text.match(/Số \(Invoice No\.\)[:\s]*(\d+)/i) ||
      text.match(/Số[:\s]*0*(\d+)/i) ||
      text.match(/SHDon[:\s]*(\d+)/i))?.[1] ?? null;

  // ── Invoice series ──
  let invoiceSeries =
    (text.match(/Mẫu số.*?Ký hiệu.*?:\s*([A-Z0-9]+)/i) ||
      text.match(/Ký hiệu[:\s]*([A-Z0-9]+)/i) ||
      text.match(/Serial No\..*?:\s*([A-Z0-9]+)/i))?.[1] ?? null;

  // ── Date ──
  let invoiceDate: string | null = null;
  const dateMatch = text.match(/Ngày\s*\(?day\)?\s*(\d+)\s*tháng\s*\(?month\)?\s*(\d+)\s*năm\s*\(?year\)?\s*(\d{4})/i);
  if (dateMatch) {
    invoiceDate = `${dateMatch[3]}-${dateMatch[2].padStart(2, "0")}-${dateMatch[1].padStart(2, "0")}`;
  } else {
    const dateMatch2 = text.match(/Ngày\s*(\d+)\s*tháng\s*(\d+)\s*năm\s*(\d{4})/i);
    if (dateMatch2) {
      invoiceDate = `${dateMatch2[3]}-${dateMatch2[2].padStart(2, "0")}-${dateMatch2[1].padStart(2, "0")}`;
    }
  }

  // ── Seller / Buyer ──
  // Bilingual format (Bkav): "Đơn vị bán (Seller): ..."
  let sellerName =
    (text.match(/Đơn vị bán\s*\(Seller\)\s*[:\s]+(.+?)(?:\n|MST|$)/i) ||
      text.match(/Đơn vị bán[:\s]+(.+?)(?:\n|MST|$)/i))?.[1]?.trim() ?? null;
  let buyerName =
    (text.match(/Đơn vị\s*\(Co\.\s*name\)\s*[:\s]+(.+?)(?:\n|MST|$)/i) ||
      text.match(/Tên đơn vị[:\s]+(.+?)(?:\n|MST|$)/i))?.[1]?.trim() ?? null;

  // ── MST extraction ──
  // Collect all MST occurrences in order
  const mstMatches: string[] = [];
  const mstRe = /MST(?:\s*\(Tax Code\))?\s*[:\s]*([0-9-]{9,14})/gi;
  let m;
  while ((m = mstRe.exec(text)) !== null) {
    mstMatches.push(m[1].trim());
  }
  // Also match "Mã số thuế:" pattern
  const mstRe2 = /Mã số thuế\s*[:\s]*([0-9-]{9,14})/gi;
  while ((m = mstRe2.exec(text)) !== null) {
    mstMatches.push(m[1].trim());
  }

  let sellerMst = mstMatches[0] ?? null;
  let buyerMst = mstMatches[1] ?? null;

  // If no seller name found, first line after "HÓA ĐƠN" might be seller company name
  if (!sellerName) {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    const hdLine = lines.findIndex((l) => l.includes("HÓA ĐƠN GIÁ TRỊ GIA TĂNG"));
    if (hdLine > 0) {
      // For MISA format: seller is above the invoice title
      sellerName = lines[hdLine - 1] || null;
    }
  }

  // ── VAT summary line ── (find totals from the summary table)
  // Pattern: "Tiền chịu thuế suất 8%: 444.445 35.555 480.000"
  // Or: "Thuế suất 8%: 71.620.000 5.729.600 77.349.600"
  let subtotal = 0, vatAmount = 0, total = 0, vatRate = "";

  const vatLineRe = /(?:Tiền chịu thuế suất|Thuế suất)\s*([\d]+%)[:\s]+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)/gi;
  let vatLine;
  while ((vatLine = vatLineRe.exec(text)) !== null) {
    const lineSubtotal = parseNumber(vatLine[2]);
    const lineVat = parseNumber(vatLine[3]);
    const lineTotal = parseNumber(vatLine[4]);
    if (lineTotal > total) {
      subtotal = lineSubtotal;
      vatAmount = lineVat;
      total = lineTotal;
      vatRate = vatLine[1];
    }
  }

  // Fallback: "Tổng cộng: X Y Z"
  if (!total) {
    const totalLine = text.match(/Tổng cộng[:\s]+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)/i);
    if (totalLine) {
      subtotal = parseNumber(totalLine[1]);
      vatAmount = parseNumber(totalLine[2]);
      total = parseNumber(totalLine[3]);
    }
  }

  const direction = sellerMst === companyMst ? "outgoing" : "incoming";

  return {
    invoiceNumber,
    invoiceSeries,
    invoiceDate,
    sellerName,
    sellerMst,
    buyerName,
    buyerMst,
    subtotal,
    vatAmount,
    total,
    vatRate,
    lineItems: [],
    direction,
  };
}

// ─── HTML parser (VNPT e-invoice format) ─────────────────────────────────────

// The amount in VNPT invoices is in the last <td> of the same <tr> as the label.
// After stripping HTML, label and amount end up on the same line separated by spaces.
// Strategy: find the last number on the same line as the keyword.
function getLastNumberOnLine(text: string, keyword: string): number {
  const idx = text.indexOf(keyword);
  if (idx === -1) return 0;
  const lineEnd = text.indexOf("\n", idx);
  const line = text.slice(idx, lineEnd === -1 ? undefined : lineEnd);
  const nums = [...line.matchAll(/\d[\d.,]*/g)];
  if (nums.length === 0) return 0;
  return parseNumber(nums[nums.length - 1][0]);
}

function parseHtml(html: string, companyMst: string) {
  // Extract seller name from <b> tag before stripping (it's the company name in bold)
  const boldMatch = html.match(/<b[^>]*>([^<]{5,})<\/b>/i);
  const sellerNameFromBold = boldMatch ? boldMatch[1].trim() : null;

  // Strip style/script blocks first to avoid false matches
  const clean = html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");

  // Convert to plain text: each <tr> becomes a line, each <td> adds a space
  const text = clean
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/td>/gi, " ")
    .replace(/<\/th>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]{2,}/g, " ")   // collapse horizontal whitespace only
    .replace(/ \n/g, "\n")
    .replace(/\n{2,}/g, "\n");

  // ── Series & Number ──
  // VNPT format: "(Serial No.) : 1C26MFO   (No.) : 00013654" — all on one line
  let invoiceSeries: string | null = null;
  let invoiceNumber: string | null = null;

  const serialMatch = text.match(/Serial No[.)]+\s*[: ]+([A-Z0-9]+)/i);
  if (serialMatch) invoiceSeries = serialMatch[1].trim();
  else {
    const khMatch = text.match(/K[yý] hi[eệ]u\s*[:(]+\s*([A-Z0-9]+)/i);
    if (khMatch) invoiceSeries = khMatch[1].trim();
  }

  const noMatch = text.match(/\(No[.)]+\s*[: ]+0*(\d+)/i);
  if (noMatch) invoiceNumber = noMatch[1].trim();
  else {
    // fallback: first long digit sequence after series
    const numFallback = text.match(/S[oố]\s*[:(]+\s*0*(\d{5,})/i);
    if (numFallback) invoiceNumber = numFallback[1].trim();
  }

  // ── Date: "(Date) : 13/ 04/ 2026" ──
  let invoiceDate: string | null = null;
  const dateMatch = text.match(/\(Date\)[^0-9]*(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})/i);
  if (dateMatch) {
    invoiceDate = `${dateMatch[3]}-${dateMatch[2].padStart(2, "0")}-${dateMatch[1].padStart(2, "0")}`;
  } else {
    const d2 = text.match(/Ng[aà]y\s+(\d{1,2})\s+th[aá]ng\s+(\d{1,2})\s+n[aă]m\s+(\d{4})/i);
    if (d2) invoiceDate = `${d2[3]}-${d2[2].padStart(2, "0")}-${d2[1].padStart(2, "0")}`;
  }

  // ── Seller / Buyer ──
  const sellerName = sellerNameFromBold ??
    text.match(/[ĐD][oơ]n v[iị] b[aá]n[^:]*[:\s]+([^\n]+)/i)?.[1]?.trim() ?? null;
  const buyerName =
    text.match(/Company['']s name[^)]*[):\s]+([^\n]+?)(?:C[aă]n|M[aã]|$)/i)?.[1]?.trim() ??
    text.match(/T[eê]n [dđ][oơ]n v[iị][^:]*:\s*([^\n]+)/i)?.[1]?.trim() ?? null;

  // ── MST (tax code) — collect all occurrences in order ──
  const mstMatches: string[] = [];
  const mstRe = /M[aã] s[oố] thu[eế][:\s]*([0-9]{9,14})/gi;
  let m: RegExpExecArray | null;
  while ((m = mstRe.exec(text)) !== null) mstMatches.push(m[1].trim());
  const mstInline = /MST[:\s]*([0-9]{9,14})/gi;
  while ((m = mstInline.exec(text)) !== null) {
    if (!mstMatches.includes(m[1].trim())) mstMatches.push(m[1].trim());
  }
  const sellerMst = mstMatches[0] ?? null;
  const buyerMst = mstMatches[1] ?? null;

  // ── Amounts ──
  // The label and its amount are on the same <tr> line after stripping.
  // getLastNumberOnLine picks the rightmost number on that line (the amount cell).
  const subtotal = getLastNumberOnLine(text, "Cộng tiền hàng");
  const vatAmount = getLastNumberOnLine(text, "Tiền thuế GTGT");
  const total = getLastNumberOnLine(text, "Tổng cộng tiền thanh toán");

  // VAT rate: find "8%" or "10%" near "VAT amount" or "GTGT"
  const vatRateMatch = text.match(/(\d+%)\s*\(?VAT amount/i) ??
                       text.match(/GTGT[^0-9]*(\d+%)/i);
  const vatRate = vatRateMatch?.[1] ?? "";

  return {
    invoiceNumber,
    invoiceSeries,
    invoiceDate,
    sellerName,
    sellerMst,
    buyerName,
    buyerMst,
    subtotal,
    vatAmount,
    total,
    vatRate,
    lineItems: [],
    direction: sellerMst === companyMst ? "outgoing" : "incoming",
  };
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const contentType = req.headers.get("content-type") ?? "";
    let fileName = "";
    let fileText = "";
    let companyMst = "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      companyMst = (formData.get("company_mst") as string) ?? "";
      if (!file) throw new Error("No file provided");
      fileName = file.name;
      fileText = await file.text();
    } else {
      // JSON body: { fileName, fileText, company_mst }
      const body = await req.json();
      fileName = body.fileName ?? "";
      fileText = body.fileText ?? "";
      companyMst = body.company_mst ?? "";
    }

    if (!fileText) throw new Error("Empty file content");

    const ext = fileName.split(".").pop()?.toLowerCase() ?? "";

    let result;
    if (ext === "xml") {
      result = parseXml(fileText, companyMst);
    } else if (ext === "html" || ext === "htm") {
      result = parseHtml(fileText, companyMst);
    } else {
      // PDF and unknown: treat as plain text (PDF text sent from client-side extraction)
      result = parsePdfText(fileText, companyMst);
    }

    return new Response(JSON.stringify({ ok: true, data: result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
