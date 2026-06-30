import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  PDFDocument,
  StandardFonts,
  rgb,
} from "pdf-lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type RequestRow = {
  id: string;
  request_number: string | null;
  customer_name: string | null;
  email: string | null;
  phone: string | null;
  child_name: string | null;
  school_name: string | null;
  class_name: string | null;
  fulfillment_method: string | null;
};

type InvoiceRow = {
  id: string;
  request_id: string;
  invoice_number: string | null;
  invoice_status: string | null;
  payment_status: string | null;
  selected_payment_method: string | null;

  subtotal_amount: number | string | null;
  shipping_amount: number | string | null;
  total_amount: number | string | null;
  currency: string | null;

  customer_name_snapshot: string | null;
  customer_email_snapshot: string | null;
  customer_phone_snapshot: string | null;
  child_name_snapshot: string | null;
  school_name_snapshot: string | null;
  class_name_snapshot: string | null;

  fulfillment_method_snapshot: string | null;
  pickup_location_label_snapshot: string | null;
  pickup_address_snapshot: string | null;

  payment_due_at: string | null;
  cash_pickup_due_at: string | null;

  admin_note: string | null;
  customer_note: string | null;

  created_at: string | null;
  updated_at: string | null;
};

type InvoiceItemRow = {
  id: string;
  invoice_id: string;
  request_id: string;
  offer_item_id: string | null;
  product_id: string | null;
  product_name: string;
  product_sku: string | null;
  quantity: number | string | null;
  unit: string | null;
  unit_price: number | string | null;
  total_price: number | string | null;
  source: string | null;
  notes: string | null;
  created_at: string | null;
};

const COMPANY = {
  name: "Handzettel-Schulen.de",
  legalName: "BÃ¼rotechnik Schwalm & Staffe",
  ownerLine: "Inh. Heike Leopold",
  street: "Zwickauer Str. 167",
  city: "08468 Reichenbach",
  phoneLine: "Tel.: 03765 / 16175 Â· 03765 / 69808",
  email: "kontakt@bss-vogtland.de",
  website: "www.handzettel-schulen.de",
  taxLine: "Steuernummer: 223/244/09843 Â· USt-IdNr.: DE257963936",
  bankLine1: "Bank: Sparkasse Vogtland",
  bankLine2: "IBAN: DE56 8705 8000 3812 0058 82 Â· BIC: WELADED1PLX",
  paypalLine: "PayPal-Zahlung Ã¼ber den Zahlungslink in der Rechnungs-Mail.",
};

const COLORS = {
  text: rgb(16 / 255, 42 / 255, 67 / 255),
  muted: rgb(82 / 255, 97 / 255, 111 / 255),
  red: rgb(181 / 255, 40 / 255, 45 / 255),
  blue: rgb(18 / 255, 57 / 255, 95 / 255),
  green: rgb(47 / 255, 125 / 255, 80 / 255),
  beige: rgb(251 / 255, 247 / 255, 240 / 255),
  border: rgb(232 / 255, 222 / 255, 210 / 255),
  white: rgb(1, 1, 1),
};

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase Umgebungsvariablen fehlen. PrÃ¼fe NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function toNumber(value: unknown, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatMoney(value: unknown) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(toNumber(value, 0));
}

function formatDate(value: string | null | undefined) {
  if (!value) return "â€”";

  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function getPaymentMethodLabel(method: string | null) {
  switch (method) {
    case "paypal":
      return "PayPal";
    case "bank_transfer":
      return "Ãœberweisung Vorkasse";
    case "cash_on_pickup":
      return "Barzahlung bei Abholung";
    default:
      return "Noch nicht gewÃ¤hlt";
  }
}

function getFulfillmentLabel(method: string | null) {
  if (method === "pickup") return "Abholung im Laden";
  if (method === "shipping") return "Versand";
  return "Noch nicht gewÃ¤hlt";
}

function safeText(value: unknown, fallback = "â€”") {
  const text = String(value || "").trim();
  return text.length > 0 ? text : fallback;
}

function cleanFileName(value: string) {
  return value
    .replace(/[^\wÃ¤Ã¶Ã¼Ã„Ã–ÃœÃŸ\-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);
}

function drawRightAlignedText(params: {
  page: any;
  text: string;
  rightX: number;
  y: number;
  size: number;
  font: any;
  color?: any;
}) {
  const { page, text, rightX, y, size, font, color = COLORS.text } = params;
  const width = font.widthOfTextAtSize(text, size);

  page.drawText(text, {
    x: rightX - width,
    y,
    size,
    font,
    color,
  });
}

function truncateTextToWidth(params: {
  text: string;
  font: any;
  size: number;
  maxWidth: number;
}) {
  const { text, font, size, maxWidth } = params;
  const clean = String(text || "").trim();

  if (!clean) return "â€”";

  if (font.widthOfTextAtSize(clean, size) <= maxWidth) {
    return clean;
  }

  let shortened = clean;

  while (
    shortened.length > 0 &&
    font.widthOfTextAtSize(shortened + "â€¦", size) > maxWidth
  ) {
    shortened = shortened.slice(0, -1);
  }

  return shortened ? shortened + "â€¦" : "â€¦";
}

function drawText(params: {
  page: any;
  text: string;
  x: number;
  y: number;
  size: number;
  font: any;
  color?: any;
  maxWidth?: number;
  lineHeight?: number;
}) {
  const {
    page,
    text,
    x,
    y,
    size,
    font,
    color = COLORS.text,
    maxWidth,
    lineHeight = size + 4,
  } = params;

  if (!maxWidth) {
    page.drawText(text, { x, y, size, font, color });
    return y - lineHeight;
  }

  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const width = font.widthOfTextAtSize(testLine, size);

    if (width <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }

  if (currentLine) lines.push(currentLine);

  let nextY = y;

  for (const line of lines) {
    page.drawText(line, { x, y: nextY, size, font, color });
    nextY -= lineHeight;
  }

  return nextY;
}

async function loadLatestInvoice(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  requestId: string;
}) {
  const { supabase, requestId } = params;

  const { data: requestData, error: requestError } = await supabase
    .from("school_requests")
    .select(
      [
        "id",
        "request_number",
        "customer_name",
        "email",
        "phone",
        "child_name",
        "school_name",
        "class_name",
        "fulfillment_method",
      ].join(", ")
    )
    .eq("id", requestId)
    .maybeSingle();

  if (requestError || !requestData) {
    throw new Error(requestError?.message || "Die Anfrage wurde nicht gefunden.");
  }

  const requestRow = requestData as unknown as RequestRow;

  const { data: invoiceData, error: invoiceError } = await supabase
    .from("school_request_invoices")
    .select("*")
    .eq("request_id", requestId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (invoiceError || !invoiceData) {
    throw new Error(
      invoiceError?.message ||
        "Zu dieser Anfrage wurde noch keine Rechnung vorbereitet."
    );
  }

  const invoice = invoiceData as unknown as InvoiceRow;

  const { data: itemsData, error: itemsError } = await supabase
    .from("school_request_invoice_items")
    .select("*")
    .eq("invoice_id", invoice.id)
    .order("created_at", { ascending: true });

  if (itemsError) {
    throw new Error(
      `Rechnungspositionen konnten nicht geladen werden: ${itemsError.message}`
    );
  }

  const invoiceItems = (itemsData || []) as unknown as InvoiceItemRow[];

  return {
    requestRow,
    invoice,
    invoiceItems,
  };
}

async function createInvoicePdf(params: {
  requestRow: RequestRow;
  invoice: InvoiceRow;
  invoiceItems: InvoiceItemRow[];
}) {
  const { requestRow, invoice, invoiceItems } = params;

  const isShopInvoice =
    String(invoice.admin_note || "").toLowerCase().includes("shop") ||
    invoiceItems.some((item) => String(item.source || "").startsWith("shop"));

  const pdfDoc = await PDFDocument.create();

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let page = pdfDoc.addPage([595.28, 841.89]);
  const pageWidth = page.getWidth();
  const pageHeight = page.getHeight();

  const marginX = 44;
  let y = pageHeight - 48;

  function addPageIfNeeded(requiredHeight = 90) {
    if (y > requiredHeight) return;

    page = pdfDoc.addPage([595.28, 841.89]);
    y = pageHeight - 48;

    page.drawText(COMPANY.name, {
      x: marginX,
      y,
      size: 11,
      font: fontBold,
      color: COLORS.red,
    });

    page.drawText(`Rechnung ${safeText(invoice.invoice_number)}`, {
      x: pageWidth - marginX - 180,
      y,
      size: 10,
      font: fontRegular,
      color: COLORS.muted,
    });

    y -= 34;
  }

  page.drawRectangle({
    x: 0,
    y: pageHeight - 120,
    width: pageWidth,
    height: 120,
    color: COLORS.beige,
  });

  page.drawText(COMPANY.name, {
    x: marginX,
    y,
    size: 24,
    font: fontBold,
    color: COLORS.red,
  });

  y -= 24;

  page.drawText(COMPANY.legalName, {
    x: marginX,
    y,
    size: 10,
    font: fontRegular,
    color: COLORS.text,
  });

  y -= 13;

  page.drawText(COMPANY.ownerLine, {
    x: marginX,
    y,
    size: 8.5,
    font: fontRegular,
    color: COLORS.muted,
  });

  y -= 13;

  page.drawText(`${COMPANY.street} Â· ${COMPANY.city}`, {
    x: marginX,
    y,
    size: 8.5,
    font: fontRegular,
    color: COLORS.muted,
  });

  y -= 13;

  page.drawText(COMPANY.phoneLine, {
    x: marginX,
    y,
    size: 8.5,
    font: fontRegular,
    color: COLORS.muted,
  });

  y -= 13;

  page.drawText(`${COMPANY.email} Â· ${COMPANY.website}`, {
    x: marginX,
    y,
    size: 8.5,
    font: fontRegular,
    color: COLORS.muted,
  });

  page.drawText("RECHNUNG", {
    x: pageWidth - marginX - 128,
    y: pageHeight - 58,
    size: 22,
    font: fontBold,
    color: COLORS.blue,
  });

  y = pageHeight - 158;

  const customerName =
    invoice.customer_name_snapshot || requestRow.customer_name || "Kunde";
  const customerEmail =
    invoice.customer_email_snapshot || requestRow.email || "Keine E-Mail";
  const customerPhone =
    invoice.customer_phone_snapshot || requestRow.phone || null;

  page.drawText("Rechnung an", {
    x: marginX,
    y,
    size: 10,
    font: fontBold,
    color: COLORS.muted,
  });

  y -= 18;

  page.drawText(safeText(customerName), {
    x: marginX,
    y,
    size: 12,
    font: fontBold,
    color: COLORS.text,
  });

  y -= 16;

  page.drawText(safeText(customerEmail), {
    x: marginX,
    y,
    size: 10,
    font: fontRegular,
    color: COLORS.text,
  });

  if (customerPhone) {
    y -= 14;
    page.drawText(customerPhone, {
      x: marginX,
      y,
      size: 10,
      font: fontRegular,
      color: COLORS.text,
    });
  }

  let rightY = pageHeight - 158;

  const metaX = pageWidth - marginX - 210;

  const metaRows = [
    ["Rechnungsnummer", safeText(invoice.invoice_number)],
    ["Rechnungsdatum", formatDate(invoice.created_at)],
    ["Anfrage", safeText(requestRow.request_number)],
    ["Zahlungsart", getPaymentMethodLabel(invoice.selected_payment_method)],
    ["Ãœbergabe", getFulfillmentLabel(invoice.fulfillment_method_snapshot)],
  ];

  for (const [label, value] of metaRows) {
    page.drawText(label, {
      x: metaX,
      y: rightY,
      size: 9,
      font: fontBold,
      color: COLORS.muted,
    });

    page.drawText(value, {
      x: metaX + 92,
      y: rightY,
      size: 9,
      font: fontRegular,
      color: COLORS.text,
    });

    rightY -= 16;
  }

  y -= 42;

  page.drawRectangle({
    x: marginX,
    y: y - 64,
    width: pageWidth - marginX * 2,
    height: 70,
    color: COLORS.beige,
    borderColor: COLORS.border,
    borderWidth: 1,
  });

  let childY = y - 18;

  page.drawText(isShopInvoice ? "Shop-Bestellung" : "Schulpaket", {
    x: marginX + 14,
    y: childY,
    size: 10,
    font: fontBold,
    color: COLORS.red,
  });

  childY -= 16;

  const childName =
    invoice.child_name_snapshot || requestRow.child_name || "Kind nicht angegeben";
  const schoolName =
    invoice.school_name_snapshot ||
    requestRow.school_name ||
    "Schule nicht angegeben";
  const className =
    invoice.class_name_snapshot || requestRow.class_name || "Klasse nicht angegeben";

  const contextLine = isShopInvoice
    ? "Direkte Bestellung Ã¼ber den Shop"
    : `${safeText(childName)} Â· ${safeText(schoolName)} Â· ${safeText(className)}`;

  page.drawText(contextLine, {
    x: marginX + 14,
    y: childY,
    size: 10,
    font: fontRegular,
    color: COLORS.text,
  });

  childY -= 16;

  page.drawText(
    "Vielen Dank fÃ¼r Deinen Auftrag. Die Positionen wurden auf Basis Deiner Schulmaterialliste zusammengestellt.",
    {
      x: marginX + 14,
      y: childY,
      size: 8.5,
      font: fontRegular,
      color: COLORS.muted,
    }
  );

  y -= 100;

  page.drawText("Positionen", {
    x: marginX,
    y,
    size: 15,
    font: fontBold,
    color: COLORS.text,
  });

  y -= 24;

  const tableX = marginX;
  const tableWidth = pageWidth - marginX * 2;
  const qtyX = tableX;
  const nameX = tableX + 54;
  const skuX = tableX + 276;
  const unitRightX = tableX + 472;
  const totalRightX = tableX + tableWidth - 12;

  page.drawRectangle({
    x: tableX,
    y: y - 10,
    width: tableWidth,
    height: 24,
    color: COLORS.blue,
  });

  page.drawText("Menge", {
    x: qtyX + 8,
    y: y - 2,
    size: 8,
    font: fontBold,
    color: COLORS.white,
  });

  page.drawText("Artikel", {
    x: nameX,
    y: y - 2,
    size: 8,
    font: fontBold,
    color: COLORS.white,
  });

  page.drawText("Art.-Nr.", {
    x: skuX,
    y: y - 2,
    size: 8,
    font: fontBold,
    color: COLORS.white,
  });

  drawRightAlignedText({
    page,
    text: "Einzel",
    rightX: unitRightX,
    y: y - 2,
    size: 8,
    font: fontBold,
    color: COLORS.white,
  });

  drawRightAlignedText({
    page,
    text: "Gesamt",
    rightX: totalRightX,
    y: y - 2,
    size: 8,
    font: fontBold,
    color: COLORS.white,
  });

  y -= 34;

  if (invoiceItems.length === 0) {
    page.drawText("Keine Rechnungspositionen vorhanden.", {
      x: marginX,
      y,
      size: 10,
      font: fontRegular,
      color: COLORS.muted,
    });

    y -= 24;
  }

  for (const item of invoiceItems) {
    addPageIfNeeded(120);

    const quantity = toNumber(item.quantity, 1);
    const unitPrice = toNumber(item.unit_price, 0);
    const totalPrice = toNumber(item.total_price, quantity * unitPrice);

    const rowTopY = y + 8;
    const rowHeight = item.notes ? 48 : 34;

    page.drawRectangle({
      x: tableX,
      y: rowTopY - rowHeight,
      width: tableWidth,
      height: rowHeight,
      color: COLORS.white,
      borderColor: COLORS.border,
      borderWidth: 0.5,
    });

    page.drawText(`${quantity}${item.unit ? ` ${item.unit}` : ""}`, {
      x: qtyX + 8,
      y,
      size: 8.5,
      font: fontBold,
      color: COLORS.text,
    });

    y = drawText({
      page,
      text: item.product_name,
      x: nameX,
      y,
      size: 8.5,
      font: fontBold,
      color: COLORS.text,
      maxWidth: 205,
      lineHeight: 11,
    }) + 11;

    const skuText = truncateTextToWidth({
      text: safeText(item.product_sku),
      font: fontRegular,
      size: 7.5,
      maxWidth: 118,
    });

    page.drawText(skuText, {
      x: skuX,
      y,
      size: 7.5,
      font: fontRegular,
      color: COLORS.muted,
    });

    drawRightAlignedText({
      page,
      text: formatMoney(unitPrice),
      rightX: unitRightX,
      y,
      size: 8,
      font: fontRegular,
      color: COLORS.text,
    });

    drawRightAlignedText({
      page,
      text: formatMoney(totalPrice),
      rightX: totalRightX,
      y,
      size: 8,
      font: fontBold,
      color: COLORS.text,
    });

    if (item.notes) {
      page.drawText(`Hinweis: ${String(item.notes).slice(0, 95)}`, {
        x: nameX,
        y: y - 14,
        size: 7.5,
        font: fontRegular,
        color: COLORS.muted,
      });
    }

    y = rowTopY - rowHeight - 12;
  }

  addPageIfNeeded(220);

  const summaryX = pageWidth - marginX - 220;
  y -= 10;

  page.drawRectangle({
    x: summaryX - 16,
    y: y - 116,
    width: 236,
    height: 128,
    color: COLORS.beige,
    borderColor: COLORS.border,
    borderWidth: 1,
  });

  const summaryRows = [
    ["Paketbetrag", formatMoney(invoice.subtotal_amount)],
    ["Versandkosten", formatMoney(invoice.shipping_amount)],
    ["Gesamtbetrag", formatMoney(invoice.total_amount)],
  ];

  let summaryY = y - 18;

  for (const [label, value] of summaryRows) {
    page.drawText(label, {
      x: summaryX,
      y: summaryY,
      size: label === "Gesamtbetrag" ? 11 : 9,
      font: label === "Gesamtbetrag" ? fontBold : fontRegular,
      color: label === "Gesamtbetrag" ? COLORS.text : COLORS.muted,
    });

    page.drawText(value, {
      x: summaryX + 120,
      y: summaryY,
      size: label === "Gesamtbetrag" ? 13 : 9,
      font: fontBold,
      color: label === "Gesamtbetrag" ? COLORS.red : COLORS.text,
    });

    summaryY -= label === "Gesamtbetrag" ? 24 : 18;
  }

  y -= 154;

  addPageIfNeeded(180);

  page.drawText("Zahlungshinweise", {
    x: marginX,
    y,
    size: 14,
    font: fontBold,
    color: COLORS.text,
  });

  y -= 22;

  const paymentText =
    invoice.selected_payment_method === "paypal"
      ? "PayPal ist als bevorzugter Zahlungsweg vorgesehen. Den Zahlungslink erhÃ¤ltst Du in der Rechnungs-Mail."
      : invoice.selected_payment_method === "bank_transfer"
      ? "Bitte Ã¼berweise den Gesamtbetrag vorab. Die Bearbeitung startet nach Zahlungseingang."
      : invoice.selected_payment_method === "cash_on_pickup"
      ? "Barzahlung ist nur bei Abholung mÃ¶glich. Bitte hole Dein Paket innerhalb der angegebenen Frist ab."
      : "Bitte wÃ¤hle Deine Zahlungsart Ã¼ber den Zahlungslink in der Rechnungs-Mail.";

  y = drawText({
    page,
    text: paymentText,
    x: marginX,
    y,
    size: 10,
    font: fontRegular,
    color: COLORS.text,
    maxWidth: pageWidth - marginX * 2,
    lineHeight: 15,
  });

  y -= 12;

  if (invoice.selected_payment_method === "bank_transfer") {
    page.drawText(COMPANY.bankLine1, {
      x: marginX,
      y,
      size: 8.5,
      font: fontRegular,
      color: COLORS.muted,
    });

    y -= 13;

    page.drawText(COMPANY.bankLine2, {
      x: marginX,
      y,
      size: 8.5,
      font: fontRegular,
      color: COLORS.muted,
    });
  } else if (invoice.selected_payment_method === "paypal") {
    page.drawText(COMPANY.paypalLine, {
      x: marginX,
      y,
      size: 8.5,
      font: fontRegular,
      color: COLORS.muted,
    });
  }

  const footerY = 34;

  for (const pdfPage of pdfDoc.getPages()) {
    pdfPage.drawLine({
      start: { x: marginX, y: footerY + 18 },
      end: { x: pageWidth - marginX, y: footerY + 18 },
      thickness: 0.5,
      color: COLORS.border,
    });

    pdfPage.drawText(`${COMPANY.legalName} Â· ${COMPANY.taxLine}`, {
      x: marginX,
      y: footerY,
      size: 7.5,
      font: fontRegular,
      color: COLORS.muted,
    });
  }

  return await pdfDoc.save();
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const requestId = String(id || "").trim();

    if (!requestId) {
      return NextResponse.json(
        {
          ok: false,
          message: "UngÃ¼ltige Anfrage-ID.",
        },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { requestRow, invoice, invoiceItems } = await loadLatestInvoice({
      supabase,
      requestId,
    });

    const pdfBytes = await createInvoicePdf({
      requestRow,
      invoice,
      invoiceItems,
    });

    const invoiceNumber = invoice.invoice_number || `rechnung-${requestId}`;
    const filename = cleanFileName(`${invoiceNumber}.pdf`);

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Invoice PDF error:", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Die Rechnungs-PDF konnte nicht erzeugt werden.",
      },
      { status: 500 }
    );
  }
}
