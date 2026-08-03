import { createClient } from "@supabase/supabase-js";
import {
  PDFDocument,
  PDFFont,
  PDFPage,
  RGB,
  StandardFonts,
  rgb,
} from "pdf-lib";
import type {
  InvoiceTaxBreakdownSnapshot,
} from "@/lib/invoiceTaxSnapshot";
import type {
  InvoiceTaxBreakdownSnapshotV2,
} from "@/lib/tax-v2";
import { formatIban, resolveBankTransferDetails } from "@/app/lib/paymentSettings";

type SupportedInvoiceTaxSnapshotVersion =
  | "invoice-tax-snapshot-v1"
  | "invoice-tax-snapshot-v2";

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
  contains_books: boolean | null;
  book_shipping_amount: number | string | null;
  book_cover_amount: number | string | null;
  total_amount: number | string | null;
  currency: string | null;

  tax_snapshot_status: string | null;
  tax_snapshot_source: string | null;
  tax_snapshot_version: string | null;
  tax_snapshot_at: string | null;

  tax_breakdown_snapshot:
    | InvoiceTaxBreakdownSnapshot
    | InvoiceTaxBreakdownSnapshotV2
    | null;

  subtotal_net_amount_snapshot:
    | number
    | string
    | null;

  subtotal_tax_amount_snapshot:
    | number
    | string
    | null;

  shipping_net_amount_snapshot:
    | number
    | string
    | null;

  shipping_tax_amount_snapshot:
    | number
    | string
    | null;

  book_shipping_net_amount_snapshot:
    | number
    | string
    | null;

  book_shipping_tax_amount_snapshot:
    | number
    | string
    | null;

  book_cover_net_amount_snapshot:
    | number
    | string
    | null;

  book_cover_tax_amount_snapshot:
    | number
    | string
    | null;

  discount_net_amount_snapshot:
    | number
    | string
    | null;

  discount_tax_amount_snapshot:
    | number
    | string
    | null;

  total_net_amount_snapshot:
    | number
    | string
    | null;

  total_tax_amount_snapshot:
    | number
    | string
    | null;

  customer_name_snapshot: string | null;
  customer_email_snapshot: string | null;
  customer_phone_snapshot: string | null;
  billing_name_snapshot: string | null;
  billing_email_snapshot: string | null;
  billing_phone_snapshot: string | null;
  billing_street_snapshot: string | null;
  billing_postal_code_snapshot: string | null;
  billing_city_snapshot: string | null;

  shipping_address_differs_snapshot: boolean | null;
  shipping_name_snapshot: string | null;
  shipping_street_snapshot: string | null;
  shipping_postal_code_snapshot: string | null;
  shipping_city_snapshot: string | null;
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
  bank_account_holder_snapshot: string | null;
  bank_name_snapshot: string | null;
  bank_iban_snapshot: string | null;
  bank_bic_snapshot: string | null;
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

  tax_rate_snapshot:
    | number
    | string
    | null;

  product_gross_amount_snapshot:
    | number
    | string
    | null;

  product_net_amount_snapshot:
    | number
    | string
    | null;

  product_tax_amount_snapshot:
    | number
    | string
    | null;

  tax_snapshot_source:
    | string
    | null;

  tax_snapshot_version:
    | string
    | null;

  tax_snapshot_at:
    | string
    | null;

  book_cover_tax_rate_snapshot:
    | number
    | string
    | null;

  book_cover_net_amount_snapshot:
    | number
    | string
    | null;

  book_cover_tax_amount_snapshot:
    | number
    | string
    | null;

  is_book_snapshot: boolean | null;
  book_isbn13_snapshot: string | null;

  book_cover_selected: boolean | null;
  book_cover_name_snapshot: string | null;
  book_cover_quantity: number | string | null;
  book_cover_unit_price: number | string | null;
  book_cover_total_price: number | string | null;
  source: string | null;
  notes: string | null;
  created_at: string | null;
};

const COMPANY = {
  name: "Handzettel-Schulen.de",
  legalName: "Bürotechnik Schwalm & Staffe",
  ownerLine: "Inh. Heike Leopold",
  street: "Zwickauer Str. 167",
  city: "08468 Reichenbach",
  phoneLine: "Tel.: 03765 / 16175 · 03765 / 69808",
  email: "kontakt@bss-vogtland.de",
  website: "www.handzettel-schulen.de",
  taxLine: "Steuernummer: 223/244/09843 · USt-IdNr.: DE257963936",
  paypalLine: "PayPal-Zahlung über den Zahlungslink in der Rechnungs-Mail.",
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
      "Supabase Umgebungsvariablen fehlen. Prüfe NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY."
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

function formatNegativeMoney(
  value: unknown,
) {
  return `-${formatMoney(
    Math.abs(
      toNumber(value, 0),
    ),
  )}`;
}

function toMoneyCents(
  value: unknown,
) {
  return Math.round(
    (
      toNumber(value, 0) +
      Number.EPSILON
    ) * 100,
  );
}

function assertMoneyIdentity(params: {
  gross: unknown;
  net: unknown;
  tax: unknown;
  label: string;
}) {
  const grossCents =
    toMoneyCents(params.gross);

  const netCents =
    toMoneyCents(params.net);

  const taxCents =
    toMoneyCents(params.tax);

  if (
    netCents + taxCents !==
    grossCents
  ) {
    throw new Error(
      `${params.label}: Netto plus Umsatzsteuer entspricht nicht Brutto.`,
    );
  }
}

function isSupportedInvoiceTaxSnapshotVersion(
  value: unknown,
): value is SupportedInvoiceTaxSnapshotVersion {
  return (
    value === "invoice-tax-snapshot-v1" ||
    value === "invoice-tax-snapshot-v2"
  );
}

function validateInvoiceTaxSnapshot(
  invoice: InvoiceRow,
  invoiceItems: InvoiceItemRow[],
) {
  /*
   * INVOICE_PDF_TAX_SNAPSHOT_READ_MODEL_V1
   *
   * Die PDF ist ausschließlich ein read-only Verbraucher
   * des beim Checkout gespeicherten Steuer-Snapshots.
   *
   * Keine aktuellen Produktdaten.
   * Keine erneute Steuerberechnung.
   * Keine stillen Standardwerte.
   */
  if (
    invoice.tax_snapshot_status !==
    "complete"
  ) {
    throw new Error(
      `Die Rechnung ${
        invoice.invoice_number || invoice.id
      } besitzt keinen vollständigen Steuer-Snapshot und darf nicht als PDF erzeugt werden.`,
    );
  }

  if (
    invoice.tax_snapshot_source !==
    "product_catalog_at_checkout"
  ) {
    throw new Error(
      "Die Steuer-Snapshot-Quelle der Rechnung ist ungültig.",
    );
  }

  const taxSnapshotVersion =
    invoice.tax_snapshot_version;

  if (
    !isSupportedInvoiceTaxSnapshotVersion(
      taxSnapshotVersion,
    )
  ) {
    throw new Error(
      "Die Steuer-Snapshot-Version der Rechnung wird von der PDF-Erzeugung nicht unterstützt.",
    );
  }

  if (
    !invoice.tax_snapshot_at
  ) {
    throw new Error(
      "Der Zeitpunkt des Steuer-Snapshots fehlt.",
    );
  }

  const breakdown =
    invoice.tax_breakdown_snapshot;

  if (
    !breakdown ||
    breakdown.version !==
      taxSnapshotVersion ||
    breakdown.source !==
      invoice.tax_snapshot_source ||
    breakdown.generated_at !==
      invoice.tax_snapshot_at ||
    breakdown.currency !== "EUR" ||
    !Array.isArray(
      breakdown.rates,
    )
  ) {
    throw new Error(
      "Die gespeicherte Steueraufschlüsselung ist unvollständig oder widersprüchlich.",
    );
  }

  if (
    taxSnapshotVersion ===
    "invoice-tax-snapshot-v2"
  ) {
    const v2Breakdown =
      breakdown as InvoiceTaxBreakdownSnapshotV2;

    if (
      v2Breakdown.rounding_method !==
        "gross_tax_rate_total_with_deterministic_line_allocation_v1" ||
      v2Breakdown.allocation_methods
        ?.regular_shipping !==
        "preallocated_by_checkout_adapter_v2" ||
      v2Breakdown.allocation_methods
        ?.book_shipping !==
        "preallocated_by_checkout_adapter_v2" ||
      v2Breakdown.allocation_methods
        ?.discount !==
        "preallocated_by_checkout_adapter_v2"
    ) {
      throw new Error(
        "Die V2-Rundungs- oder Allokationsmetadaten der Rechnung sind ungültig.",
      );
    }
  }

  const supportedRates =
    new Set([7, 19]);

  for (
    const rate of
    breakdown.rates
  ) {
    if (
      !supportedRates.has(
        rate.tax_rate,
      )
    ) {
      throw new Error(
        `Nicht unterstützter Umsatzsteuersatz im Rechnungssnapshot: ${rate.tax_rate} %.`,
      );
    }

    assertMoneyIdentity({
      gross:
        rate.total.gross,

      net:
        rate.total.net,

      tax:
        rate.total.tax,

      label:
        `Steuerbereich ${rate.tax_rate} %`,
    });
  }

  assertMoneyIdentity({
    gross:
      breakdown.totals.subtotal.gross,

    net:
      breakdown.totals.subtotal.net,

    tax:
      breakdown.totals.subtotal.tax,

    label:
      "Produkt-Zwischensumme",
  });

  assertMoneyIdentity({
    gross:
      breakdown.totals
        .regular_shipping
        .gross,

    net:
      breakdown.totals
        .regular_shipping
        .net,

    tax:
      breakdown.totals
        .regular_shipping
        .tax,

    label:
      "Versandpauschale",
  });

  assertMoneyIdentity({
    gross:
      breakdown.totals
        .book_shipping
        .gross,

    net:
      breakdown.totals
        .book_shipping
        .net,

    tax:
      breakdown.totals
        .book_shipping
        .tax,

    label:
      "Buchversand",
  });

  assertMoneyIdentity({
    gross:
      breakdown.totals
        .book_covers
        .gross,

    net:
      breakdown.totals
        .book_covers
        .net,

    tax:
      breakdown.totals
        .book_covers
        .tax,

    label:
      "Buchhüllen",
  });

  assertMoneyIdentity({
    gross:
      breakdown.totals
        .discount
        .gross,

    net:
      breakdown.totals
        .discount
        .net,

    tax:
      breakdown.totals
        .discount
        .tax,

    label:
      "Rabatt",
  });

  assertMoneyIdentity({
    gross:
      breakdown.totals.total.gross,

    net:
      breakdown.totals.total.net,

    tax:
      breakdown.totals.total.tax,

    label:
      "Rechnungsgesamtbetrag",
  });

  if (
    toMoneyCents(
      breakdown.totals.total.gross,
    ) !==
    toMoneyCents(
      invoice.total_amount,
    )
  ) {
    throw new Error(
      "Der Gesamtbruttobetrag des Steuer-Snapshots stimmt nicht mit der Rechnung überein.",
    );
  }

  if (
    toMoneyCents(
      breakdown.totals.total.net,
    ) !==
    toMoneyCents(
      invoice.total_net_amount_snapshot,
    ) ||
    toMoneyCents(
      breakdown.totals.total.tax,
    ) !==
    toMoneyCents(
      invoice.total_tax_amount_snapshot,
    )
  ) {
    throw new Error(
      "Die Gesamtnetto- oder Umsatzsteuerwerte widersprechen der gespeicherten Steueraufschlüsselung.",
    );
  }

  if (
    invoiceItems.length === 0
  ) {
    throw new Error(
      "Die Rechnung besitzt keine Rechnungspositionen.",
    );
  }

  let productGrossCents = 0;
  let productNetCents = 0;
  let productTaxCents = 0;

  let coverGrossCents = 0;
  let coverNetCents = 0;
  let coverTaxCents = 0;

  for (
    const item of
    invoiceItems
  ) {
    const itemLabel =
      item.product_name ||
      item.id;

    const taxRate =
      Number(
        item.tax_rate_snapshot,
      );

    if (
      taxRate !== 7 &&
      taxRate !== 19
    ) {
      throw new Error(
        `Für die Rechnungsposition ${itemLabel} fehlt ein gültiger Steuersatz.`,
      );
    }

    if (
      item.tax_snapshot_source !==
        invoice.tax_snapshot_source ||
      item.tax_snapshot_version !==
        invoice.tax_snapshot_version ||
      item.tax_snapshot_at !==
        invoice.tax_snapshot_at
    ) {
      throw new Error(
        `Die Snapshot-Metadaten der Rechnungsposition ${itemLabel} stimmen nicht mit der Rechnung überein.`,
      );
    }

    assertMoneyIdentity({
      gross:
        item.product_gross_amount_snapshot,

      net:
        item.product_net_amount_snapshot,

      tax:
        item.product_tax_amount_snapshot,

      label:
        `Rechnungsposition ${itemLabel}`,
    });

    productGrossCents +=
      toMoneyCents(
        item.product_gross_amount_snapshot,
      );

    productNetCents +=
      toMoneyCents(
        item.product_net_amount_snapshot,
      );

    productTaxCents +=
      toMoneyCents(
        item.product_tax_amount_snapshot,
      );

    const coverGross =
      toMoneyCents(
        item.book_cover_total_price,
      );

    const coverNet =
      toMoneyCents(
        item.book_cover_net_amount_snapshot,
      );

    const coverTax =
      toMoneyCents(
        item.book_cover_tax_amount_snapshot,
      );

    if (coverGross > 0) {
      if (
        Number(
          item.book_cover_tax_rate_snapshot,
        ) !== 19
      ) {
        throw new Error(
          `Die Buchhülle zu ${itemLabel} besitzt keinen gültigen Steuersatz von 19 %.`,
        );
      }

      if (
        coverNet + coverTax !==
        coverGross
      ) {
        throw new Error(
          `Buchhülle zu ${itemLabel}: Netto plus Umsatzsteuer entspricht nicht Brutto.`,
        );
      }
    } else if (
      coverNet !== 0 ||
      coverTax !== 0
    ) {
      throw new Error(
        `Die nicht berechnete Buchhülle zu ${itemLabel} besitzt unerwartete Steuerwerte.`,
      );
    }

    coverGrossCents +=
      coverGross;

    coverNetCents +=
      coverNet;

    coverTaxCents +=
      coverTax;
  }

  if (
    productGrossCents !==
      toMoneyCents(
        breakdown.totals
          .subtotal
          .gross,
      ) ||
    productNetCents !==
      toMoneyCents(
        breakdown.totals
          .subtotal
          .net,
      ) ||
    productTaxCents !==
      toMoneyCents(
        breakdown.totals
          .subtotal
          .tax,
      )
  ) {
    throw new Error(
      "Die Summe der Produkt-Positionssnapshots stimmt nicht mit dem Rechnungssnapshot überein.",
    );
  }

  if (
    coverGrossCents !==
      toMoneyCents(
        breakdown.totals
          .book_covers
          .gross,
      ) ||
    coverNetCents !==
      toMoneyCents(
        breakdown.totals
          .book_covers
          .net,
      ) ||
    coverTaxCents !==
      toMoneyCents(
        breakdown.totals
          .book_covers
          .tax,
      )
  ) {
    throw new Error(
      "Die Summe der Buchhüllen-Snapshots stimmt nicht mit dem Rechnungssnapshot überein.",
    );
  }

  return breakdown;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";

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
      return "Überweisung Vorkasse";
    case "cash_on_pickup":
      return "Barzahlung bei Abholung";
    default:
      return "Noch nicht gewählt";
  }
}

function getFulfillmentLabel(method: string | null) {
  if (method === "pickup") return "Abholung im Laden";
  if (method === "shipping") return "Versand";
  return "Noch nicht gewählt";
}

function safeText(value: unknown, fallback = "—") {
  const text = String(value || "").trim();
  return text.length > 0 ? text : fallback;
}

function cleanOptionalText(value: unknown) {
  const text = String(value || "").trim();
  return text.length > 0 ? text : null;
}

function cleanFileName(value: string) {
  return value
    .replace(/[^\wäöüÄÖÜß\-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);
}

function drawRightAlignedText(params: {
  page: PDFPage;
  text: string;
  rightX: number;
  y: number;
  size: number;
  font: PDFFont;
  color?: RGB;
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
  font: PDFFont;
  size: number;
  maxWidth: number;
}) {
  const { text, font, size, maxWidth } = params;
  const clean = String(text || "").trim();

  if (!clean) return "—";

  if (font.widthOfTextAtSize(clean, size) <= maxWidth) {
    return clean;
  }

  let shortened = clean;

  while (
    shortened.length > 0 &&
    font.widthOfTextAtSize(shortened + "…", size) > maxWidth
  ) {
    shortened = shortened.slice(0, -1);
  }

  return shortened ? shortened + "…" : "…";
}

function drawText(params: {
  page: PDFPage;
  text: string;
  x: number;
  y: number;
  size: number;
  font: PDFFont;
  color?: RGB;
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

  const taxBreakdown =
    validateInvoiceTaxSnapshot(
      invoice,
      invoiceItems,
    );

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

  page.drawText(`${COMPANY.street} · ${COMPANY.city}`, {
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

  page.drawText(`${COMPANY.email} · ${COMPANY.website}`, {
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

  const billingName =
    cleanOptionalText(invoice.billing_name_snapshot) ||
    cleanOptionalText(invoice.customer_name_snapshot) ||
    cleanOptionalText(requestRow.customer_name) ||
    "Kunde";
  const billingEmail =
    cleanOptionalText(invoice.billing_email_snapshot) ||
    cleanOptionalText(invoice.customer_email_snapshot) ||
    cleanOptionalText(requestRow.email) ||
    "Keine E-Mail";
  const billingPhone =
    cleanOptionalText(invoice.billing_phone_snapshot) ||
    cleanOptionalText(invoice.customer_phone_snapshot) ||
    cleanOptionalText(requestRow.phone);
  const billingStreet = cleanOptionalText(invoice.billing_street_snapshot);
  const billingPostalLine = [
    cleanOptionalText(invoice.billing_postal_code_snapshot),
    cleanOptionalText(invoice.billing_city_snapshot),
  ]
    .filter(Boolean)
    .join(" ");

  const showShippingAddress =
    Boolean(invoice.shipping_address_differs_snapshot) &&
    Boolean(
      invoice.shipping_name_snapshot ||
        invoice.shipping_street_snapshot ||
        invoice.shipping_postal_code_snapshot ||
        invoice.shipping_city_snapshot
    );

  const shippingName =
    cleanOptionalText(invoice.shipping_name_snapshot) || billingName;
  const shippingStreet =
    cleanOptionalText(invoice.shipping_street_snapshot) || billingStreet;
  const shippingPostalLine = [
    cleanOptionalText(invoice.shipping_postal_code_snapshot),
    cleanOptionalText(invoice.shipping_city_snapshot),
  ]
    .filter(Boolean)
    .join(" ");

  page.drawText("Rechnung an", {
    x: marginX,
    y,
    size: 10,
    font: fontBold,
    color: COLORS.muted,
  });

  y -= 18;

  const billingLines = [
    billingName,
    billingStreet,
    billingPostalLine,
    billingEmail,
    billingPhone,
  ].filter((line): line is string => Boolean(line));

  for (const [index, line] of billingLines.entries()) {
    page.drawText(safeText(line), {
      x: marginX,
      y,
      size: index === 0 ? 12 : 10,
      font: index === 0 ? fontBold : fontRegular,
      color: COLORS.text,
    });

    y -= index === 0 ? 16 : 14;
  }

  if (showShippingAddress) {
    y -= 6;

    page.drawText("Lieferadresse", {
      x: marginX,
      y,
      size: 9,
      font: fontBold,
      color: COLORS.muted,
    });

    y -= 14;

    const shippingLines = [shippingName, shippingStreet, shippingPostalLine].filter(
      (line): line is string => Boolean(line)
    );

    for (const line of shippingLines) {
      page.drawText(safeText(line), {
        x: marginX,
        y,
        size: 9,
        font: fontRegular,
        color: COLORS.text,
      });

      y -= 12;
    }
  }

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
  const skuX = tableX + 268;
  const unitRightX = tableX + 448;
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
    const totalPrice = toNumber(
      item.product_gross_amount_snapshot,
      0,
    );

    const hasBookIsbn =
      item.is_book_snapshot === true &&
      Boolean(
        cleanOptionalText(
          item.book_isbn13_snapshot
        )
      );

    const hasBookCover =
      item.book_cover_selected === true;

    const hasTaxRate =
      Number(
        item.tax_rate_snapshot,
      ) === 7 ||
      Number(
        item.tax_rate_snapshot,
      ) === 19;

    const additionalLineCount =
      (hasBookIsbn ? 1 : 0) +
      (hasTaxRate ? 1 : 0) +
      (hasBookCover ? 1 : 0) +
      (item.notes ? 1 : 0);

    const rowTopY = y + 8;

    const rowHeight =
      42 + additionalLineCount * 14;

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
      maxWidth: 104,
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

    let detailY = y - 14;

    if (hasBookIsbn) {
      page.drawText(
        `ISBN-13: ${safeText(
          item.book_isbn13_snapshot
        )}`,
        {
          x: nameX,
          y: detailY,
          size: 7.5,
          font: fontRegular,
          color: COLORS.blue,
        }
      );

      detailY -= 14;
    }

    if (hasTaxRate) {
      page.drawText(
        `inkl. ${Number(
          item.tax_rate_snapshot,
        )} % USt.`,
        {
          x: nameX,
          y: detailY,
          size: 7.5,
          font: fontRegular,
          color: COLORS.muted,
        },
      );

      detailY -= 14;
    }

    if (hasBookCover) {
      const bookCoverQuantity = toNumber(
        item.book_cover_quantity,
        quantity
      );

      const bookCoverUnitPrice = toNumber(
        item.book_cover_unit_price,
        0
      );

      const bookCoverTotalPrice = toNumber(
        item.book_cover_total_price,
        bookCoverQuantity *
          bookCoverUnitPrice
      );

      const bookCoverName = safeText(
        item.book_cover_name_snapshot,
        "Passende Buchh\u00fclle"
      );

      page.drawText(
        `${bookCoverName}: ${bookCoverQuantity} x ${formatMoney(
          bookCoverUnitPrice
        )} = ${formatMoney(
          bookCoverTotalPrice
        )}`,
        {
          x: nameX,
          y: detailY,
          size: 7.5,
          font: fontBold,
          color: COLORS.green,
        }
      );

      detailY -= 14;
    }

    if (item.notes) {
      page.drawText(
        `Hinweis: ${String(
          item.notes
        ).slice(0, 95)}`,
        {
          x: nameX,
          y: detailY,
          size: 7.5,
          font: fontRegular,
          color: COLORS.muted,
        }
      );
    }

    y = rowTopY - rowHeight - 12;
  }

  addPageIfNeeded(300);

  const summaryX =
    pageWidth - marginX - 220;

  y -= 10;

  const bookCoverAmount =
    taxBreakdown
      .totals
      .book_covers
      .gross;

  const bookShippingAmount =
    taxBreakdown
      .totals
      .book_shipping
      .gross;

  const regularShippingAmount =
    taxBreakdown
      .totals
      .regular_shipping
      .gross;

  const discountAmount =
    taxBreakdown
      .totals
      .discount
      .gross;

  const totalNetAmount =
    taxBreakdown
      .totals
      .total
      .net;

  const totalGrossAmount =
    taxBreakdown
      .totals
      .total
      .gross;

  const summaryRows: Array<
    [string, string]
  > = [
    [
      "Paketbetrag",
      formatMoney(
        taxBreakdown
          .totals
          .subtotal
          .gross,
      ),
    ],
  ];

  if (bookCoverAmount > 0) {
    summaryRows.push([
      "Buchhüllen",
      formatMoney(
        bookCoverAmount,
      ),
    ]);
  }

  if (regularShippingAmount > 0) {
    summaryRows.push([
      "Versandkosten",
      formatMoney(
        regularShippingAmount,
      ),
    ]);
  }

  if (bookShippingAmount > 0) {
    summaryRows.push([
      "Buchversand",
      formatMoney(
        bookShippingAmount,
      ),
    ]);
  }

  if (discountAmount > 0) {
    summaryRows.push([
      "Rabatt",
      formatNegativeMoney(
        discountAmount,
      ),
    ]);
  }

  summaryRows.push([
    "Nettobetrag",
    formatMoney(
      totalNetAmount,
    ),
  ]);

  for (
    const rate of
    taxBreakdown.rates
  ) {
    if (
      rate.total.tax > 0
    ) {
      summaryRows.push([
        `zzgl. ${rate.tax_rate} % USt.`,
        formatMoney(
          rate.total.tax,
        ),
      ]);
    }
  }

  summaryRows.push([
    "Gesamtbetrag",
    formatMoney(
      totalGrossAmount,
    ),
  ]);

  const summaryBoxHeight =
    summaryRows.length * 20 + 28;

  page.drawRectangle({
    x: summaryX - 16,
    y: y + 12 - summaryBoxHeight,
    width: 236,
    height: summaryBoxHeight,
    color: COLORS.beige,
    borderColor: COLORS.border,
    borderWidth: 1,
  });

  let summaryY = y - 18;

  for (
    const [label, value] of summaryRows
  ) {
    const isTotal =
      label === "Gesamtbetrag";

    page.drawText(label, {
      x: summaryX,
      y: summaryY,
      size: isTotal ? 11 : 9,
      font: isTotal
        ? fontBold
        : fontRegular,
      color: isTotal
        ? COLORS.text
        : COLORS.muted,
    });

    drawRightAlignedText({
      page,
      text: value,
      rightX: summaryX + 204,
      y: summaryY,
      size: isTotal ? 13 : 9,
      font: fontBold,
      color: isTotal
        ? COLORS.red
        : COLORS.text,
    });

    summaryY -=
      isTotal ? 24 : 20;
  }

  y -= summaryBoxHeight + 26;

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
      ? "PayPal ist als bevorzugter Zahlungsweg vorgesehen. Den Zahlungslink erhältst Du in der Rechnungs-Mail."
      : invoice.selected_payment_method === "bank_transfer"
      ? "Bitte überweise den Gesamtbetrag vorab. Die Bearbeitung startet nach Zahlungseingang."
      : invoice.selected_payment_method === "cash_on_pickup"
      ? "Barzahlung ist nur bei Abholung möglich. Bitte hole Dein Paket innerhalb der angegebenen Frist ab."
      : "Bitte wähle Deine Zahlungsart über den Zahlungslink in der Rechnungs-Mail.";

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
    const bankDetails = resolveBankTransferDetails(invoice);
    page.drawText(`Bank: ${bankDetails.bankName} · Kontoinhaber: ${bankDetails.accountHolder}`, {
      x: marginX,
      y,
      size: 8.5,
      font: fontRegular,
      color: COLORS.muted,
    });

    y -= 13;

    page.drawText(`IBAN: ${formatIban(bankDetails.iban)} · BIC: ${bankDetails.bic}`, {
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

    pdfPage.drawText(`${COMPANY.legalName} · ${COMPANY.taxLine}`, {
      x: marginX,
      y: footerY,
      size: 7.5,
      font: fontRegular,
      color: COLORS.muted,
    });
  }

  return await pdfDoc.save();
}

export type RequestInvoicePdf = {
  buffer: Buffer;
  filename: string;
};

export async function generateRequestInvoicePdf(input: {
  requestId: string;
}): Promise<RequestInvoicePdf> {
  const requestId = String(input.requestId || "").trim();

  if (!requestId) {
    throw new Error("Ungültige Anfrage-ID.");
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

  return {
    buffer: Buffer.from(pdfBytes),
    filename: cleanFileName(`${invoiceNumber}.pdf`),
  };
}
