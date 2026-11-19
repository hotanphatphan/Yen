const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseNumber(s: string): number {
  if (!s) return 0;
  // Vietnamese format: 1.234.567 (dot = thousands) or 1,234,567 (comma = thousands)
  // Remove all dots (thousands separators), then remove trailing comma+decimals
  const clean = s.replace(/\./g, "").replace(/,\d+$/, "").replace(/,/g, "");
  return Math.round(parseFloat(clean) || 0);
}

function normalizeMst(raw: string): string {
  return raw.replace(/\s+/g, "").replace(/-+$/, "");
}

// Returns true only if the string looks like a real company / person name
// (rejects base64 blobs, binary noise, certificate serial numbers, etc.)
function looksLikeCompanyName(s: string | null): s is string {
  if (!s || s.length < 3 || s.length > 150) return false;
  const letterCount = (s.match(/[\p{L}]/gu) ?? []).length;
  // At least 50% actual letters, and must contain at least one space or
  // known company keyword — avoids accepting single-word cert serials
  return letterCount / s.length >= 0.5 && /[\s,.]|công ty|company|chi nhánh|tnhh|jsc|llc|co\.|ltd/i.test(s);
}

// Extract all MST (tax codes) from text, in order of their appearance.
// Handles both normal ("0319286258") and spaced-digit ("0 3 1 9 2 8 6 2 5 8") formats.
function extractMstList(text: string): string[] {
  // Collect all matches with their start position, then sort by position.
  const hits: Array<{ pos: number; mst: string }> = [];

  // Pattern 1: standard no-space MST
  const re1 = /(?:Mã số thuế|MST|Tax\s+[Cc]ode|VN\s+TIN)[^:]*[:\s]+([0-9]{9,14}(?:-[0-9]{3})?)/g;
  let m: RegExpExecArray | null;
  while ((m = re1.exec(text)) !== null) {
    const mst = normalizeMst(m[1].trim());
    if (mst.length >= 9) hits.push({ pos: m.index, mst });
  }

  // Pattern 2: spaced-digit MST "0 3 1 0 8 2 6 6 9 2 - 0 0 1"
  const re2 =
    /(?:Mã số thuế|MST|Tax\s+[Cc]ode)[^:]*[:\s]+((?:\d\s+){6,}\d(?:\s*-\s*(?:\d\s*){1,4}\d)?)/g;
  while ((m = re2.exec(text)) !== null) {
    const mst = normalizeMst(m[1]);
    if (mst.length >= 9) hits.push({ pos: m.index, mst });
  }

  // Sort by position so seller MST (earlier in document) comes first
  hits.sort((a, b) => a.pos - b.pos);

  // Deduplicate while preserving order
  const seen = new Set<string>();
  const results: string[] = [];
  for (const { mst } of hits) {
    if (!seen.has(mst)) { seen.add(mst); results.push(mst); }
  }
  return results;
}

// ─── XML parser (Vietnamese e-invoice standard, TCVN format) ─────────────────

function parseXml(xmlText: string, companyMst: string) {
  const get = (tag: string) => {
    const m = xmlText.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
    return m ? m[1].trim() : "";
  };

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
  const sellerAddress = getIn(nbanBlock, "DChi") || null;
  const buyerName = getIn(nmuaBlock, "Ten");
  const buyerMst = getIn(nmuaBlock, "MST");
  const buyerAddress = getIn(nmuaBlock, "DChi") || null;

  const invoiceDate = get("NLap") || null;
  // Hóa đơn ngoại tệ (VD USD): số tiền trong XML là nguyên tệ → quy đổi VND theo tỷ giá <TGia> trên hóa đơn.
  const currency = (get("DVTTe") || "VND").toUpperCase();
  const fx = currency !== "VND" ? parseFloat(get("TGia") || "1") || 1 : 1;
  const subtotal = Math.round(parseFloat(get("TgTCThue") || "0") * fx);
  const vatAmount = Math.round(parseFloat(get("TgTThue") || "0") * fx);
  const total = Math.round(parseFloat(get("TgTTTBSo") || "0") * fx);

  const lineItems: object[] = [];
  const itemRegex = /<HHDVu>([\s\S]*?)<\/HHDVu>/gi;
  let itemMatch;
  while ((itemMatch = itemRegex.exec(xmlText)) !== null) {
    const b = itemMatch[1];
    lineItems.push({
      description: getIn(b, "THHDVu"),
      unit: getIn(b, "DVTinh"),
      quantity: parseFloat(getIn(b, "SLuong") || "1"),
      unitPrice: parseFloat(getIn(b, "DGia") || "0") * fx,
      amount: parseFloat(getIn(b, "ThTien") || "0") * fx,
      vatRate: getIn(b, "TSuat"),
    });
  }

  const vatRate = lineItems.length > 0
    ? (lineItems[0] as { vatRate: string }).vatRate
    : get("TSuat");

  return {
    invoiceNumber: get("SHDon"),
    invoiceSeries: get("KHHDon"),
    invoiceDate,
    sellerName,
    sellerMst,
    sellerAddress,
    buyerName,
    buyerMst,
    buyerAddress,
    subtotal,
    vatAmount,
    total,
    vatRate,
    lineItems,
    direction: sellerMst === companyMst ? "outgoing" : "incoming",
  };
}

// ─── Address extraction (best-effort, dùng chung cho PDF & HTML) ───────────────
// Lấy các đoạn "Địa chỉ (Address) : ..." theo thứ tự xuất hiện.
// Trên hóa đơn VN, địa chỉ bên bán đứng trước, bên mua đứng sau.
function extractAddresses(text: string): [string | null, string | null] {
  const matches = [
    ...text.matchAll(
      /[ĐD][iị]a\s+ch[iỉ]\s*(?:\([^)]*\))?\s*[:\s]+([^\n]{5,160}?)(?=\s{2,}(?:M[aã]\s+s[oố]|MST|Tax|[ĐD]i[eệ]n\s+tho[aạ]i|Tel|S[oố]\s+t[aà]i|Ng[uư][oờ]i|H[iì]nh\s+th[uứ]c)|\n|$)/gi,
    ),
  ].map((m) => m[1].trim()).filter((s) => s.length >= 5);
  return [matches[0] ?? null, matches[1] ?? null];
}

// ─── PDF text parser (pdfjs plain-text, multiple Vietnamese e-invoice formats) ─

function parsePdfText(text: string, companyMst: string) {
  // ── Series & Number ──
  // Pattern: "Ký hiệu (Serial No) : 1C26MMT  Số (No.) : 242"
  // Also handles IPOS: "Ký hiệu (Serial) : 2C26MLI  Số (No.) : 00001398"
  const seriesMatch = text.match(
    /K[yý]\s*hi[eệ]u\s*(?:\([^)]+\))?\s*[:\s]+([A-Z0-9\/\-]{3,20})/i
  );
  const invoiceSeries = seriesMatch?.[1]?.trim() ?? null;

  // Invoice number: grab digits after "Số (No.) :" — exclude large numbers like dates/MSTs
  const noMatch = text.match(
    /\bS[oố]\s*(?:\([^)]*\))?\s*[:\s]+0*(\d{1,8})\b(?!\s*\/)/i
  );
  const invoiceNumber = noMatch?.[1]?.trim() ?? null;

  // ── Date ──
  let invoiceDate: string | null = null;
  const dateMatch =
    text.match(/Ng[aà]y\s+(\d{1,2})\s+th[aá]ng\s+(\d{1,2})\s+n[aă]m\s+(\d{4})/i) ||
    text.match(/DATE\s+(\d{1,2})\s+MONTH[^0-9]+(\d{1,2})[^0-9]+YEAR[^0-9]+(\d{4})/i);
  if (dateMatch) {
    invoiceDate = `${dateMatch[3]}-${dateMatch[2].padStart(2, "0")}-${dateMatch[1].padStart(2, "0")}`;
  }

  // ── Amounts ──
  // Try all known triple-number total patterns (subtotal + vat + total on one line)
  let subtotal = 0, vatAmount = 0, total = 0, vatRate = "";

  const triplePatterns = [
    // MINVOICE: "Tổng cộng tiền thanh toán (Total payment): 742.716 129.232 871.948"
    // Bkav: "Tổng cộng tiền thanh toán (Grand total) : 1.491.000 119.280 1.610.280"
    /T[oổ]ng\s+c[oộ]ng\s+ti[eề]n\s+thanh\s+to[aá]n\s*(?:\([^)]+\))?\s*[:\s]+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)/gi,
    // MISA: "Cộng tiền thanh toán  42.500.000  3.400.000  45.900.000"
    /C[oộ]ng\s+ti[eề]n\s+thanh\s+to[aá]n\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)/gi,
    // MISA: "Tổng cộng (Total) :  615.852  49.268  665.120" (with optional parenthetical)
    /T[oổ]ng\s+c[oộ]ng\s*(?:\([^)]+\))?\s*[:\s]+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)/gi,
  ];

  for (const re of triplePatterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const t = parseNumber(m[3]);
      if (t > total) {
        subtotal = parseNumber(m[1]);
        vatAmount = parseNumber(m[2]);
        total = t;
      }
    }
    if (total > 0) break;
  }

  // Fallback A: IPOS no-VAT invoice — total appears right after invoice number
  // "Số (No.) : 00001398  955.000  Người mua hàng"
  if (!total) {
    const iposMatch = text.match(
      /S[oố]\s*(?:\([^)]*\))?\s*[:\s]+\d+\s+([\d.,]+)\s+(?:Ng)[uư]/i
    );
    if (iposMatch) {
      total = parseNumber(iposMatch[1]);
      subtotal = total;
    }
  }

  // Fallback B: Single total line (Bkav "Tiền thanh toán  996.786" or single-number Tổng cộng)
  if (!total) {
    const singleMatch =
      // "Tiền" = T+i+ề+n; use Ti[eề]n to match the ề diacritic correctly
      text.match(/Ti[eề]n\s+thanh\s+to[aá]n\s*(?:\([^)]+\))?\s+([\d.,]{4,})/i) ||
      text.match(/T[oổ]ng\s+(?:c[oộ]ng\s+)?ti[eề]n\s+thanh\s+to[aá]n[^:\n]*[:\s]+([\d.,]+)/i);
    if (singleMatch) total = parseNumber(singleMatch[1]);
  }

  // Fallback C: English USD invoice (Anthropic, Stripe, etc.)
  if (!total) {
    const usdMatch =
      text.match(/Amount\s+due\s+\$\s*([\d.,]+)/i) ||
      text.match(/Total\s+\$\s*([\d.,]+)\s*USD/i) ||
      text.match(/Total\s+\$\s*([\d.,]+)/i);
    if (usdMatch) {
      // Store dollar amount × 100 as integer cents; flag with USD vatRate
      total = Math.round(parseFloat(usdMatch[1].replace(/,/g, "")) * 100);
      vatRate = "USD";
    }
  }

  // Fallback D: English/USD invoice — extract VAT and seller name
  if (total > 0 && vatRate === "USD") {
    // VAT: "Tax  10% on $20.00  $2.00"
    const usdVatMatch = text.match(/Tax\s+[\d]+%\s+on\s+\$[\d.]+\s+\$([\d.]+)/i);
    if (usdVatMatch && vatAmount === 0) {
      vatAmount = Math.round(parseFloat(usdVatMatch[1]) * 100);
      subtotal = total - vatAmount;
    }
    // Tên người bán + chiều hóa đơn được gán SAU khi khai báo sellerName/direction (xem khối "USD invoice" bên dưới).
    // Gán ở đây gây lỗi "Cannot access 'sellerName' before initialization".
  }

  // VAT rate from per-line breakdown
  if (!vatRate) {
    const vatRateMatch =
      text.match(/(?:Thu[eế]\s+su[aâ]t|VAT\s+rate)\s*[:\s]*([\d]+%)/i) ||
      text.match(/(\d+)%\s*(?:VAT|thuế\s+GTGT)/i);
    if (vatRateMatch) vatRate = vatRateMatch[1].replace(/(\d+)/, "$1") + (vatRateMatch[1].includes("%") ? "" : "%");
  }

  // If we have total but no vatAmount, try to extract it separately
  if (total > 0 && vatAmount === 0) {
    const vatAmtMatch = text.match(
      /Ti[eề]n\s+thu[eế]\s+(?:GTGT\s+)?[^0-9]*([\d.,]+(?:\.\d{3})+)/i
    );
    if (vatAmtMatch) {
      vatAmount = parseNumber(vatAmtMatch[1]);
      subtotal = total - vatAmount;
    }
  }

  // ── MST extraction ──
  const mstList = extractMstList(text);

  // Also handle "MST/CCCD chủ hộ : 0317505627" (MISA buyer block, appended to list)
  const mstCccd = text.match(/MST\/CCCD[^:]*:\s*([0-9]{9,13})/i);
  if (mstCccd) {
    const v = mstCccd[1].trim();
    if (!mstList.includes(v)) mstList.push(v);
  }

  // ── Direction & MST assignment ──
  // Detect if our company is seller (outgoing) or buyer (incoming)
  let sellerMst: string | null = null;
  let buyerMst: string | null = null;
  let direction = "incoming";

  // Check position of our MST in text — if it appears in the first MST slot → seller
  const ourMstNormal = companyMst;
  // Also check spaced version "0 3 1 9 2 8 6 2 5 8"
  const spacedOurMst = companyMst.split("").join("\\s*");
  const ourMstInText = text.search(new RegExp(spacedOurMst)) !== -1 ||
    text.includes(companyMst);

  if (mstList.length > 0) {
    const firstMstIsOurs =
      normalizeMst(mstList[0]) === ourMstNormal ||
      normalizeMst(mstList[0]).startsWith(ourMstNormal);

    if (firstMstIsOurs) {
      // Our MST is first → we are seller
      sellerMst = companyMst;
      buyerMst = mstList[1] ?? null;
      direction = "outgoing";
    } else {
      sellerMst = mstList[0];
      // Find our MST in remaining list
      const ourIdx = mstList.findIndex(
        (m) => normalizeMst(m) === ourMstNormal || normalizeMst(m).startsWith(ourMstNormal)
      );
      buyerMst = ourIdx >= 0 ? companyMst : (mstList[1] ?? null);
      direction = "incoming";
    }
  } else if (ourMstInText) {
    // MST found in text but not via label — check context
    // If it follows seller label pattern, it's outgoing; otherwise incoming
    const sellerPattern = new RegExp(
      `[ĐD][oơ]n\\s+v[iị]\\s+b[aá]n[^\\n]*${spacedOurMst}`,
      "i"
    );
    if (sellerPattern.test(text)) {
      direction = "outgoing";
      sellerMst = companyMst;
    } else {
      direction = "incoming";
      buyerMst = companyMst;
    }
  }

  // ── Seller name ──
  let sellerName: string | null = null;

  // Pattern 1: "Đơn vị bán hàng (Seller) : NAME  Mã số thuế / MST / Nhà hàng"
  const sellerLabelMatch = text.match(
    /[ĐD][oơ]n\s+v[iị]\s+b[aá]n(?:\s+h[aà]ng)?\s*(?:\([^)]+\))?\s*[:\s]+([^\n]{5,120}?)(?:\s{2,}M[aã]\s+s[oố]|\s{2,}MST\b|\s+Tax\s+[Cc]ode|\s+[ĐD][iị]a\s+ch[iỉ]|\s+Nh[aà]\s+h[aà]ng)/i
  );
  const p1 = sellerLabelMatch?.[1].trim() ?? null;
  if (looksLikeCompanyName(p1)) sellerName = p1;

  // Pattern 2: digital signature block — "Ký bởi: NAME  Ký ngày:" (IPOS, MISA)
  // Only use if name passes validation (avoids base64 cert noise)
  if (!sellerName) {
    const sigMatch =
      text.match(/K[yý]\s+b[oở]i\s*[:\s]+([^\n]{5,80}?)(?:\s+K[yý]\s+ng[aà]y)/i) ||
      text.match(/[ĐD][aã]\s+[dđ][uưừ][oợ]c\s+k[yý]\s+[dđ]i[eệ]n\s+t[uử]\s+b[oở]i\s+([^\n]{5,80}?)(?:\s+Ng[aà]y)/i);
    const p2 = sigMatch?.[1].trim() ?? null;
    if (looksLikeCompanyName(p2)) sellerName = p2;
  }

  // Pattern 3: MISA outgoing — company name at top before "Mã số thuế : 0319286258"
  if (!sellerName) {
    const topCompanyMatch = text.match(
      /^([A-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂĐĨŨƠƯẠẢẤẦẨẪẬẮẰẲẴẶẸẺẼẾỀỂỄỆỈỊỌỎỐỒỔỖỘỚỜỞỠỢỤỦỨỪỬỮỰỲÝỶỸỴ][^\n]{4,80}?)\s+M[aã]\s+s[oố]\s+thu[eế]\s*(?:\([^)]+\))?\s*[:\s]+\d/i
    );
    const p3 = topCompanyMatch?.[1].trim() ?? null;
    if (looksLikeCompanyName(p3)) sellerName = p3;
  }

  // USD invoice (Anthropic, Stripe…): luôn là hóa đơn mua vào, người bán nước ngoài không có MST VN.
  if (vatRate === "USD") {
    // "Anthropic, PBC  548 Market Street..." — số nhà ≥3 chữ số để tránh khớp "Page 1 of 1"
    const billFromMatch = text.match(/([A-Z][A-Za-z\s,\.]{8,50}?)\s+\d{3,}[^\n]+(?:Street|Avenue|Road|Market|Blvd)/i);
    if (billFromMatch) sellerName = billFromMatch[1].trim();
    direction = "incoming";
    buyerMst = companyMst;
    sellerMst = null;
  }

  // Clean English translation suffix from seller name
  if (sellerName) {
    sellerName = sellerName
      .replace(/\s+(?:BRANCH OF|CO\.\s*LTD|CORPORATION|COMPANY|CO\.\,|INC\.?)\s.*$/i, "")
      .trim();
  }

  // ── Buyer name ──
  let buyerName: string | null = null;
  const buyerLabelMatch = text.match(
    /T[eê]n\s+[dđ][oơ]n\s+v[iị]\s*(?:\([^)]+\))?\s*[:\s]+([^\n]{5,80}?)(?:\s+[ĐD][iị]a\s+ch[iỉ]|\s+M[aã]\s+s[oố]|\s+MST|\s+C[aă]n\s+c[uướ]c)/i
  );
  const bRaw = buyerLabelMatch?.[1].trim() ?? null;
  if (looksLikeCompanyName(bRaw)) buyerName = bRaw;

  const [sellerAddress, buyerAddress] = extractAddresses(text);

  return {
    invoiceNumber,
    invoiceSeries,
    invoiceDate,
    sellerName,
    sellerMst,
    sellerAddress,
    buyerName,
    buyerMst,
    buyerAddress,
    subtotal,
    vatAmount,
    total,
    vatRate,
    lineItems: [],
    direction,
  };
}

// ─── HTML parser (VNPT e-invoice format) ─────────────────────────────────────

function parseHtml(html: string, companyMst: string) {
  // Remove script/style blocks
  const clean = html.replace(
    /<(style|script)[^>]*>[\s\S]*?<\/(style|script)>/gi,
    ""
  );

  // Convert to structured text: tr → newline, td/th → pipe separator
  const text = clean
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/td>/gi, " ")
    .replace(/<\/th>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ \n/g, "\n")
    .replace(/\n{2,}/g, "\n");

  // ── Series & Number ──
  const serialMatch =
    text.match(/Serial\s+No[.)]+\s*[: ]+([A-Z0-9_\-]+)/i) ||
    text.match(/K[yý]\s+hi[eệ]u[^:]*[:\s]+([A-Z0-9_\-]+)/i);
  const invoiceSeries = serialMatch?.[1]?.trim() ?? null;

  const noMatch =
    text.match(/\(No[.)]+\s*[: ]+0*(\d+)/i) ||
    text.match(/S[oố]\s*[:(]+\s*0*(\d{5,})/i);
  const invoiceNumber = noMatch?.[1]?.trim() ?? null;

  // ── Date: "(Date) : 13/ 04/ 2026" ──
  let invoiceDate: string | null = null;
  const dateMatch =
    text.match(/\(Date\)[^0-9]*(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})/i) ||
    text.match(/Ng[aà]y[^0-9]*(\d{1,2})[^\d]+(\d{1,2})[^\d]+(\d{4})/i);
  if (dateMatch) {
    invoiceDate = `${dateMatch[3]}-${dateMatch[2].padStart(2, "0")}-${dateMatch[1].padStart(2, "0")}`;
  }

  // ── Seller name ──
  // VNPT HTML: the seller company name appears right after the invoice title,
  // before the first "Mã số thuế" line
  let sellerName: string | null = null;

  const firstMstIdx = text.search(/M[aã]\s+s[oố]\s+thu[eế]/i);
  if (firstMstIdx > 0) {
    const beforeMst = text.slice(0, firstMstIdx);
    // Find the last substantial text segment before MST — that's the seller name
    const segs = beforeMst
      .split("\n")
      .map((s) => s.trim())
      .filter(
        (s) =>
          s.length > 4 &&
          /[A-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂĐĨŨƠƯẠẢẤẦẨẪẬẮẰẲẴẶẸẺẼẾỀỂỄỆỈỊỌỎỐỒỔỖỘỚỜỞỠỢỤỦỨỪỬỮỰỲÝỶỸỴ]/.test(s) &&
          !/HÓA ĐƠN|VAT INVOICE|invoice/i.test(s) &&
          !/^\d/.test(s)
      );
    if (segs.length > 0) sellerName = segs[segs.length - 1];
  }

  if (!sellerName) {
    const fallback = text.match(
      /[ĐD][oơ]n\s+v[iị]\s+b[aá]n[^:]*:\s*([^\n]{5,80}?)(?:\s+M[aã]\s+s[oố]|\n)/i
    );
    if (fallback) sellerName = fallback[1].trim();
  }

  // ── Buyer name ──
  let buyerName: string | null = null;
  const buyerMatch =
    text.match(
      /Company['']?s?\s+name[^)]*\)[^:]*[: ]+([^\n]{5,80}?)(?:\s+C[aă]n|\s+M[aã]|\s+[ĐD][iị]a|\n)/i
    ) ||
    text.match(
      /T[eê]n\s+[dđ][oơ]n\s+v[iị][^:]*:\s*([^\n]{5,80}?)(?:\s+[ĐD][iị]a\s+ch[iỉ]|\s+M[aã]|\n)/i
    );
  if (buyerMatch) buyerName = buyerMatch[1].trim();

  // ── MST ──
  const mstList = extractMstList(text);
  const sellerMst = mstList[0] ?? null;
  const buyerMst = mstList[1] ?? null;

  // ── Amounts ──
  let subtotal = 0, vatAmount = 0, total = 0;

  // VNPT: "Tổng cộng tiền thanh toán (Grand total) : 639.485" (single number — total only)
  const singleTotalMatch =
    text.match(
      /T[oổ]ng\s+c[oộ]ng\s+ti[eề]n\s+thanh\s+to[aá]n[^:\n]*[:\s]+([\d.,]+)/i
    ) || text.match(/Grand\s+total[^:\n\d]*[:\s]+([\d.,]+)/i);
  if (singleTotalMatch) total = parseNumber(singleTotalMatch[1]);

  // VAT amount: "Tiền thuế GTGT 8% (VAT amount) : 47.369"
  const vatAmtMatch =
    text.match(/VAT\s+amount[^:\n]*[:\s]+([\d.,]+)/i) ||
    text.match(/Ti[eề]n\s+thu[eế]\s+GTGT[^:\n]*[:\s]+([\d.,]+)/i);
  if (vatAmtMatch) vatAmount = parseNumber(vatAmtMatch[1]);

  subtotal = total - vatAmount;

  // VAT rate: "8% (VAT amount)"
  const vatRateMatch =
    text.match(/(\d+%)\s*\(VAT\s+amount/i) ||
    text.match(/GTGT\s+(\d+%)/i);
  const vatRate = vatRateMatch?.[1] ?? "";

  const [sellerAddress, buyerAddress] = extractAddresses(text);

  return {
    invoiceNumber,
    invoiceSeries,
    invoiceDate,
    sellerName,
    sellerMst,
    sellerAddress,
    buyerName,
    buyerMst,
    buyerAddress,
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
