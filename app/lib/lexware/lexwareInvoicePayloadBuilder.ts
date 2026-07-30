import "server-only";

import {
  INVOICE_TAX_SNAPSHOT_SOURCE,
  INVOICE_TAX_SNAPSHOT_VERSION,
  type InvoiceTaxBreakdownSnapshot,
  type SupportedInvoiceTaxRate,
} from "@/lib/invoiceTaxSnapshot";

/*
 * LEXWARE_INVOICE_PAYLOAD_BUILDER_V1
 *
 * Reiner, deterministischer Mapper:
 *
 * lokaler Rechnungs- und Steuer-Snapshot
 * → Lexware POST /v1/invoices Payload
 *
 * Keine Datenbankzugriffe.
 * Keine Lexware-Aufrufe.
 * Kein Mailversand.
 * Keine Rechnungsnummernvergabe.
 */

export const LEXWARE_INVOICE_PAYLOAD_BUILDER_VERSION =
  "lexware-invoice-payload-builder-v1" as const;

const MAX_LEXWARE_LINE_ITEMS = 300;
const MAX_TEXT_LENGTH = 1_000;

type MoneyInput =
  | number
  | string
  | null
  | undefined;

export type LexwareInvoicePayloadAddress = {
  name: string;
  supplement?: string;
  street?: string;
  city?: string;
  zip?: string;
  countryCode: "DE";
};

export type LexwareInvoicePayloadLineItem = {
  type: "custom";
  name: string;
  description?: string;
  quantity: number;
  unitName: string;

  unitPrice: {
    currency: "EUR";
    grossAmount: number;
    taxRatePercentage:
      SupportedInvoiceTaxRate;
  };

  discountPercentage: 0;
};

export type LexwareInvoiceCreatePayload = {
  archived: false;
  voucherDate: string;

  address:
    LexwareInvoicePayloadAddress;

  lineItems:
    LexwareInvoicePayloadLineItem[];

  totalPrice: {
    currency: "EUR";
  };

  taxConditions: {
    taxType: "gross";
  };

  paymentConditions: {
    paymentTermLabel: string;
    paymentTermDuration: number;
  };

  shippingConditions:
    | {
        shippingType: "delivery";
        shippingDate: string;
      }
    | {
        shippingType: "none";
      };

  title: "Rechnung";
  introduction: string;
  remark: string;
};

export type LocalLexwareInvoiceSnapshot = {
  id: string;
  request_id: string;

  invoice_number:
    | string
    | null;

  invoice_provider:
    | string
    | null;

  invoice_cutover_version:
    | string
    | null;

  selected_payment_method:
    | string
    | null;

  fulfillment_method_snapshot:
    | string
    | null;

  billing_name_snapshot:
    | string
    | null;

  billing_street_snapshot:
    | string
    | null;

  billing_postal_code_snapshot:
    | string
    | null;

  billing_city_snapshot:
    | string
    | null;

  customer_email_snapshot:
    | string
    | null;

  child_name_snapshot:
    | string
    | null;

  school_name_snapshot:
    | string
    | null;

  class_name_snapshot:
    | string
    | null;

  customer_note:
    | string
    | null;

  admin_note:
    | string
    | null;

  subtotal_amount:
    MoneyInput;

  shipping_amount:
    MoneyInput;

  book_shipping_amount:
    MoneyInput;

  book_cover_amount:
    MoneyInput;

  discount_amount:
    MoneyInput;

  total_amount:
    MoneyInput;

  currency:
    string | null;

  tax_snapshot_status:
    string | null;

  tax_snapshot_source:
    string | null;

  tax_snapshot_version:
    string | null;

  tax_snapshot_at:
    string | null;

  tax_breakdown_snapshot:
    | InvoiceTaxBreakdownSnapshot
    | null;

  total_net_amount_snapshot:
    MoneyInput;

  total_tax_amount_snapshot:
    MoneyInput;

  created_at:
    string | null;
};

export type LocalLexwareInvoiceItemSnapshot = {
  id: string;
  invoice_id: string;

  product_id:
    | string
    | null;

  product_name: string;

  product_sku:
    | string
    | null;

  quantity:
    MoneyInput;

  unit:
    | string
    | null;

  unit_price:
    MoneyInput;

  total_price:
    MoneyInput;

  tax_rate_snapshot:
    MoneyInput;

  product_gross_amount_snapshot:
    MoneyInput;

  product_net_amount_snapshot:
    MoneyInput;

  product_tax_amount_snapshot:
    MoneyInput;

  tax_snapshot_source:
    | string
    | null;

  tax_snapshot_version:
    | string
    | null;

  tax_snapshot_at:
    | string
    | null;

  is_book_snapshot:
    | boolean
    | null;

  book_isbn13_snapshot:
    | string
    | null;

  book_cover_selected:
    | boolean
    | null;

  book_cover_name_snapshot:
    | string
    | null;

  book_cover_quantity:
    MoneyInput;

  book_cover_unit_price:
    MoneyInput;

  book_cover_total_price:
    MoneyInput;

  book_cover_tax_rate_snapshot:
    MoneyInput;

  book_cover_net_amount_snapshot:
    MoneyInput;

  book_cover_tax_amount_snapshot:
    MoneyInput;

  source:
    | string
    | null;

  notes:
    | string
    | null;
};

export type BuildLexwareInvoicePayloadInput = {
  invoice:
    LocalLexwareInvoiceSnapshot;

  items:
    LocalLexwareInvoiceItemSnapshot[];

  /*
   * Rechnungs- und Lieferdatum.
   *
   * Ohne expliziten Wert wird der unveränderliche
   * Steuer-Snapshot-Zeitpunkt verwendet.
   */
  voucherDate?:
    | string
    | Date
    | null;

  shippingDate?:
    | string
    | Date
    | null;

  paymentTermDays?:
    | number
    | null;

  introduction?:
    | string
    | null;

  remark?:
    | string
    | null;
};

export type LexwarePayloadExpectedTotals = {
  totalGrossAmount: number;
  totalNetAmount: number;
  totalTaxAmount: number;

  taxRates: Array<{
    taxRatePercentage:
      SupportedInvoiceTaxRate;

    grossAmount: number;
    netAmount: number;
    taxAmount: number;
  }>;
};

export type LexwareInvoicePayloadBuildResult = {
  version:
    typeof LEXWARE_INVOICE_PAYLOAD_BUILDER_VERSION;

  payload:
    LexwareInvoiceCreatePayload;

  expected:
    LexwarePayloadExpectedTotals;

  metadata: {
    localInvoiceId: string;
    requestId: string;

    taxSnapshotSource:
      typeof INVOICE_TAX_SNAPSHOT_SOURCE;

    taxSnapshotVersion:
      typeof INVOICE_TAX_SNAPSHOT_VERSION;

    taxSnapshotAt: string;

    lineItemCount: number;

    productLineCount: number;
    bookCoverLineCount: number;
    regularShippingLineCount: number;
    bookShippingLineCount: number;
    discountLineCount: number;
  };
};

export class LexwareInvoicePayloadError
  extends Error {
  readonly code: string;

  readonly details:
    | Record<string, unknown>
    | null;

  constructor(
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);

    this.name =
      "LexwareInvoicePayloadError";

    this.code =
      code;

    this.details =
      details ?? null;
  }
}

function fail(
  code: string,
  message: string,
  details?: Record<string, unknown>,
): never {
  throw new LexwareInvoicePayloadError(
    code,
    message,
    details,
  );
}

function cleanText(
  value: unknown,
  maxLength = MAX_TEXT_LENGTH,
) {
  const text =
    String(value ?? "")
      .replace(/\s+/g, " ")
      .trim();

  if (!text) {
    return null;
  }

  return text.slice(
    0,
    maxLength,
  );
}

function requireText(
  value: unknown,
  label: string,
  maxLength = MAX_TEXT_LENGTH,
) {
  const text =
    cleanText(
      value,
      maxLength,
    );

  if (!text) {
    fail(
      "REQUIRED_TEXT_MISSING",
      `${label} fehlt.`,
      {
        label,
      },
    );
  }

  return text;
}

function toMoneyCents(
  value: MoneyInput,
  label: string,
  options?: {
    allowNegative?: boolean;
    allowZero?: boolean;
  },
) {
  const normalized =
    typeof value === "string"
      ? value
          .trim()
          .replace(",", ".")
      : value;

  const parsed =
    Number(normalized);

  if (!Number.isFinite(parsed)) {
    fail(
      "INVALID_MONEY_VALUE",
      `${label} ist kein gültiger Geldbetrag.`,
      {
        label,
        value,
      },
    );
  }

  const cents =
    Math.round(
      (
        parsed +
        (
          parsed >= 0
            ? Number.EPSILON
            : -Number.EPSILON
        )
      ) * 100,
    );

  if (
    options?.allowNegative !== true &&
    cents < 0
  ) {
    fail(
      "NEGATIVE_MONEY_VALUE",
      `${label} darf nicht negativ sein.`,
      {
        label,
        value: parsed,
      },
    );
  }

  if (
    options?.allowZero !== true &&
    cents === 0
  ) {
    fail(
      "ZERO_MONEY_VALUE",
      `${label} muss größer als 0 sein.`,
      {
        label,
      },
    );
  }

  return cents;
}

function optionalMoneyCents(
  value: MoneyInput,
  label: string,
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return 0;
  }

  return toMoneyCents(
    value,
    label,
    {
      allowZero:
        true,
    },
  );
}

function centsToAmount(
  cents: number,
) {
  return cents / 100;
}

function moneyEquals(
  left: MoneyInput,
  right: MoneyInput,
) {
  return (
    toMoneyCents(
      left,
      "Vergleichswert links",
      {
        allowNegative:
          true,

        allowZero:
          true,
      },
    ) ===
    toMoneyCents(
      right,
      "Vergleichswert rechts",
      {
        allowNegative:
          true,

        allowZero:
          true,
      },
    )
  );
}

function requireQuantity(
  value: MoneyInput,
  label: string,
) {
  const parsed =
    Number(value);

  if (
    !Number.isFinite(parsed) ||
    parsed <= 0 ||
    parsed > 9_999 ||
    Math.round(
      parsed * 10_000,
    ) !==
      parsed * 10_000
  ) {
    fail(
      "INVALID_QUANTITY",
      `${label} muss größer als 0 sein und darf höchstens vier Nachkommastellen besitzen.`,
      {
        label,
        value,
      },
    );
  }

  return parsed;
}

function requireTaxRate(
  value: MoneyInput,
  label: string,
): SupportedInvoiceTaxRate {
  const parsed =
    Number(value);

  if (parsed === 7) {
    return 7;
  }

  if (parsed === 19) {
    return 19;
  }

  fail(
    "UNSUPPORTED_TAX_RATE",
    `${label} muss 7 oder 19 Prozent betragen.`,
    {
      label,
      value,
    },
  );
}

function normalizeDateTime(
  value:
    | string
    | Date
    | null
    | undefined,
  label: string,
) {
  const date =
    value instanceof Date
      ? new Date(
          value.getTime(),
        )
      : new Date(
          String(
            value || "",
          ),
        );

  if (
    !Number.isFinite(
      date.getTime(),
    )
  ) {
    fail(
      "INVALID_DATE",
      `${label} ist ungültig.`,
      {
        label,
        value,
      },
    );
  }

  return date.toISOString();
}

/*
 * TIMESTAMP_SEMANTIC_EQUALITY_V1
 *
 * PostgreSQL/Supabase kann denselben UTC-Zeitpunkt beispielsweise
 * als +00:00 ausgeben, während ein JSON-Snapshot denselben Zeitpunkt
 * mit Z speichert.
 *
 * Beispiel:
 * 2026-07-29T22:28:50.235+00:00
 * 2026-07-29T22:28:50.235Z
 *
 * Deshalb werden Zeitstempel semantisch als Unix-Zeit und nicht
 * anhand ihrer Zeichenketten verglichen.
 */
function timestampsEqual(
  left: unknown,
  right: unknown,
) {
  const leftText =
    cleanText(left);

  const rightText =
    cleanText(right);

  if (
    !leftText ||
    !rightText
  ) {
    return false;
  }

  const leftTimestamp =
    Date.parse(leftText);

  const rightTimestamp =
    Date.parse(rightText);

  return (
    Number.isFinite(
      leftTimestamp,
    ) &&
    Number.isFinite(
      rightTimestamp,
    ) &&
    leftTimestamp ===
      rightTimestamp
  );
}

function normalizeUnitName(
  value: unknown,
) {
  const unit =
    cleanText(
      value,
      40,
    )?.toLowerCase();

  switch (unit) {
    case "stk":
    case "stk.":
    case "stück":
    case "stueck":
      return "Stück";

    case "set":
      return "Set";

    case "pack":
    case "packung":
      return "Packung";

    case "paar":
      return "Paar";

    default:
      return (
        cleanText(
          value,
          40,
        ) ||
        "Stück"
      );
  }
}

function buildProductDescription(
  item:
    LocalLexwareInvoiceItemSnapshot,
) {
  const parts: string[] = [];

  const sku =
    cleanText(
      item.product_sku,
      100,
    );

  if (sku) {
    parts.push(
      `Art.-Nr.: ${sku}`,
    );
  }

  const isbn =
    cleanText(
      item.book_isbn13_snapshot,
      20,
    );

  if (
    item.is_book_snapshot ===
      true &&
    isbn
  ) {
    parts.push(
      `ISBN-13: ${isbn}`,
    );
  }

  const notes =
    cleanText(
      item.notes,
      350,
    );

  if (notes) {
    parts.push(notes);
  }

  return parts.length > 0
    ? parts.join("\n")
    : undefined;
}

function makeCustomLine(
  params: {
    name: string;

    description?:
      | string
      | null;

    quantity: number;
    unitName: string;

    grossUnitAmountCents:
      number;

    taxRate:
      SupportedInvoiceTaxRate;
  },
): LexwareInvoicePayloadLineItem {
  const description =
    cleanText(
      params.description,
    );

  return {
    type:
      "custom",

    name:
      requireText(
        params.name,
        "Lexware-Positionsname",
        255,
      ),

    ...(
      description
        ? {
            description,
          }
        : {}
    ),

    quantity:
      params.quantity,

    unitName:
      requireText(
        params.unitName,
        "Lexware-Einheit",
        40,
      ),

    unitPrice: {
      currency:
        "EUR",

      grossAmount:
        centsToAmount(
          params
            .grossUnitAmountCents,
        ),

      taxRatePercentage:
        params.taxRate,
    },

    discountPercentage:
      0,
  };
}

function validateSnapshot(
  invoice:
    LocalLexwareInvoiceSnapshot,

  items:
    LocalLexwareInvoiceItemSnapshot[],
) {
  if (
    invoice.tax_snapshot_status !==
    "complete"
  ) {
    fail(
      "TAX_SNAPSHOT_NOT_COMPLETE",
      "Für den Lexware-Payload ist ein vollständiger Steuer-Snapshot erforderlich.",
      {
        status:
          invoice
            .tax_snapshot_status,
      },
    );
  }

  if (
    invoice.tax_snapshot_source !==
    INVOICE_TAX_SNAPSHOT_SOURCE
  ) {
    fail(
      "TAX_SNAPSHOT_SOURCE_INVALID",
      "Die Steuer-Snapshot-Quelle wird nicht unterstützt.",
      {
        source:
          invoice
            .tax_snapshot_source,
      },
    );
  }

  if (
    invoice.tax_snapshot_version !==
    INVOICE_TAX_SNAPSHOT_VERSION
  ) {
    fail(
      "TAX_SNAPSHOT_VERSION_INVALID",
      "Die Steuer-Snapshot-Version wird nicht unterstützt.",
      {
        version:
          invoice
            .tax_snapshot_version,
      },
    );
  }

  if (!invoice.tax_snapshot_at) {
    fail(
      "TAX_SNAPSHOT_TIMESTAMP_MISSING",
      "Der Steuer-Snapshot-Zeitpunkt fehlt.",
    );
  }

  if (
    invoice.currency !==
    "EUR"
  ) {
    fail(
      "UNSUPPORTED_CURRENCY",
      "Lexware-Rechnungen werden derzeit ausschließlich in EUR erzeugt.",
      {
        currency:
          invoice.currency,
      },
    );
  }

  const breakdown =
    invoice.tax_breakdown_snapshot;

  if (
    !breakdown ||
    breakdown.version !==
      INVOICE_TAX_SNAPSHOT_VERSION ||
    breakdown.source !==
      INVOICE_TAX_SNAPSHOT_SOURCE ||
    !timestampsEqual(
      breakdown.generated_at,
      invoice.tax_snapshot_at,
    ) ||
    breakdown.currency !==
      "EUR" ||
    !Array.isArray(
      breakdown.rates,
    )
  ) {
    fail(
      "TAX_BREAKDOWN_INVALID",
      "Die gespeicherte Steueraufschlüsselung ist unvollständig oder widersprüchlich.",
      {
        invoiceTaxSnapshotAt:
          invoice.tax_snapshot_at,

        breakdownGeneratedAt:
          breakdown?.generated_at ??
          null,

        invoiceTaxSnapshotSource:
          invoice.tax_snapshot_source,

        breakdownSource:
          breakdown?.source ??
          null,

        invoiceTaxSnapshotVersion:
          invoice.tax_snapshot_version,

        breakdownVersion:
          breakdown?.version ??
          null,

        breakdownCurrency:
          breakdown?.currency ??
          null,

        breakdownRatesIsArray:
          Array.isArray(
            breakdown?.rates,
          ),
      },
    );
  }

  if (
    !Array.isArray(items) ||
    items.length === 0
  ) {
    fail(
      "INVOICE_ITEMS_MISSING",
      "Für den Lexware-Payload ist mindestens eine Rechnungsposition erforderlich.",
    );
  }

  for (const item of items) {
    if (
      item.invoice_id !==
      invoice.id
    ) {
      fail(
        "INVOICE_ITEM_LINK_MISMATCH",
        "Eine Rechnungsposition gehört nicht zur übergebenen Rechnung.",
        {
          itemId:
            item.id,

          itemInvoiceId:
            item.invoice_id,

          expectedInvoiceId:
            invoice.id,
        },
      );
    }

    if (
      item.tax_snapshot_source !==
        invoice.tax_snapshot_source ||
      item.tax_snapshot_version !==
        invoice.tax_snapshot_version ||
      !timestampsEqual(
        item.tax_snapshot_at,
        invoice.tax_snapshot_at,
      )
    ) {
      fail(
        "INVOICE_ITEM_SNAPSHOT_MISMATCH",
        `Die Snapshot-Metadaten der Position ${item.product_name} stimmen nicht mit der Rechnung überein.`,
        {
          itemId:
            item.id,

          invoiceSnapshotSource:
            invoice
              .tax_snapshot_source,

          itemSnapshotSource:
            item
              .tax_snapshot_source,

          invoiceSnapshotVersion:
            invoice
              .tax_snapshot_version,

          itemSnapshotVersion:
            item
              .tax_snapshot_version,

          invoiceSnapshotAt:
            invoice
              .tax_snapshot_at,

          itemSnapshotAt:
            item
              .tax_snapshot_at,
        },
      );
    }

    const grossCents =
      toMoneyCents(
        item
          .product_gross_amount_snapshot,
        `Produkt-Brutto ${item.product_name}`,
      );

    const netCents =
      toMoneyCents(
        item
          .product_net_amount_snapshot,
        `Produkt-Netto ${item.product_name}`,
        {
          allowZero:
            true,
        },
      );

    const taxCents =
      toMoneyCents(
        item
          .product_tax_amount_snapshot,
        `Produkt-Steuer ${item.product_name}`,
        {
          allowZero:
            true,
        },
      );

    if (
      netCents +
        taxCents !==
      grossCents
    ) {
      fail(
        "INVOICE_ITEM_MONEY_IDENTITY_FAILED",
        `Bei ${item.product_name} entspricht Netto plus Steuer nicht Brutto.`,
        {
          itemId:
            item.id,

          grossAmount:
            centsToAmount(
              grossCents,
            ),

          netAmount:
            centsToAmount(
              netCents,
            ),

          taxAmount:
            centsToAmount(
              taxCents,
            ),
        },
      );
    }

    requireTaxRate(
      item.tax_rate_snapshot,
      `Steuersatz ${item.product_name}`,
    );
  }

  if (
    !moneyEquals(
      breakdown
        .totals
        .total
        .gross,
      invoice.total_amount,
    ) ||
    !moneyEquals(
      breakdown
        .totals
        .total
        .net,
      invoice
        .total_net_amount_snapshot,
    ) ||
    !moneyEquals(
      breakdown
        .totals
        .total
        .tax,
      invoice
        .total_tax_amount_snapshot,
    )
  ) {
    fail(
      "INVOICE_TOTAL_SNAPSHOT_MISMATCH",
      "Die Rechnungssummen stimmen nicht mit der Steueraufschlüsselung überein.",
      {
        invoice: {
          gross:
            invoice.total_amount,

          net:
            invoice
              .total_net_amount_snapshot,

          tax:
            invoice
              .total_tax_amount_snapshot,
        },

        breakdown: {
          gross:
            breakdown
              .totals
              .total
              .gross,

          net:
            breakdown
              .totals
              .total
              .net,

          tax:
            breakdown
              .totals
              .total
              .tax,
        },
      },
    );
  }

  return breakdown;
}

function buildPaymentConditions(
  paymentMethod:
    | string
    | null,

  paymentTermDays:
    number,
) {
  switch (paymentMethod) {
    case "paypal":
      return {
        paymentTermLabel:
          "Zahlbar per PayPal ohne Abzug.",

        paymentTermDuration:
          paymentTermDays,
      };

    case "cash_on_pickup":
      return {
        paymentTermLabel:
          `Zahlbar bei Abholung innerhalb von ${paymentTermDays} Tagen.`,

        paymentTermDuration:
          paymentTermDays,
      };

    case "bank_transfer":
    default:
      return {
        paymentTermLabel:
          `Zahlbar per Überweisung innerhalb von ${paymentTermDays} Tagen ohne Abzug.`,

        paymentTermDuration:
          paymentTermDays,
      };
  }
}

export function buildLexwareInvoicePayload(
  input:
    BuildLexwareInvoicePayloadInput,
): LexwareInvoicePayloadBuildResult {
  const invoice =
    input.invoice;

  const items =
    input.items;

  const invoiceId =
    requireText(
      invoice.id,
      "Lokale Rechnungs-ID",
      100,
    );

  const requestId =
    requireText(
      invoice.request_id,
      "Anfrage-ID",
      100,
    );

  const taxBreakdown =
    validateSnapshot(
      invoice,
      items,
    );

  const billingName =
    requireText(
      invoice
        .billing_name_snapshot,
      "Rechnungsempfänger",
      255,
    );

  const billingPostalCode =
    requireText(
      invoice
        .billing_postal_code_snapshot,
      "Postleitzahl",
      20,
    );

  const billingCity =
    requireText(
      invoice
        .billing_city_snapshot,
      "Ort",
      100,
    );

  const billingStreet =
    cleanText(
      invoice
        .billing_street_snapshot,
      255,
    );

  const paymentTermDaysRaw =
    input.paymentTermDays ??
    7;

  if (
    !Number.isInteger(
      paymentTermDaysRaw,
    ) ||
    paymentTermDaysRaw < 0 ||
    paymentTermDaysRaw > 365
  ) {
    fail(
      "PAYMENT_TERM_INVALID",
      "Das Zahlungsziel muss eine ganze Zahl zwischen 0 und 365 Tagen sein.",
      {
        paymentTermDays:
          paymentTermDaysRaw,
      },
    );
  }

  const voucherDate =
    normalizeDateTime(
      input.voucherDate ||
        invoice.tax_snapshot_at ||
        invoice.created_at,
      "Rechnungsdatum",
    );

  const shippingDate =
    normalizeDateTime(
      input.shippingDate ||
        invoice.tax_snapshot_at ||
        invoice.created_at,
      "Lieferdatum",
    );

  const productLines:
    LexwareInvoicePayloadLineItem[] =
      [];

  const bookCoverLines:
    LexwareInvoicePayloadLineItem[] =
      [];

  for (const item of items) {
    const quantity =
      requireQuantity(
        item.quantity,
        `Menge ${item.product_name}`,
      );

    const unitPriceCents =
      toMoneyCents(
        item.unit_price,
        `Brutto-Einzelpreis ${item.product_name}`,
      );

    const expectedGrossCents =
      toMoneyCents(
        item
          .product_gross_amount_snapshot,
        `Produkt-Brutto ${item.product_name}`,
      );

    const calculatedGrossCents =
      Math.round(
        unitPriceCents *
          quantity,
      );

    if (
      calculatedGrossCents !==
      expectedGrossCents
    ) {
      fail(
        "PRODUCT_LINE_GROSS_MISMATCH",
        `Menge mal Brutto-Einzelpreis stimmt bei ${item.product_name} nicht mit dem Snapshot überein.`,
        {
          itemId:
            item.id,

          quantity,

          unitPrice:
            centsToAmount(
              unitPriceCents,
            ),

          calculatedGross:
            centsToAmount(
              calculatedGrossCents,
            ),

          expectedGross:
            centsToAmount(
              expectedGrossCents,
            ),
        },
      );
    }

    const taxRate =
      requireTaxRate(
        item.tax_rate_snapshot,
        `Steuersatz ${item.product_name}`,
      );

    productLines.push(
      makeCustomLine({
        name:
          item.product_name,

        description:
          buildProductDescription(
            item,
          ),

        quantity,

        unitName:
          normalizeUnitName(
            item.unit,
          ),

        grossUnitAmountCents:
          unitPriceCents,

        taxRate,
      }),
    );

    const bookCoverGrossCents =
      optionalMoneyCents(
        item
          .book_cover_total_price,
        `Buchhüllen-Brutto ${item.product_name}`,
      );

    if (
      bookCoverGrossCents > 0
    ) {
      if (
        item.book_cover_selected !==
        true
      ) {
        fail(
          "BOOK_COVER_SELECTION_MISSING",
          `Zu ${item.product_name} ist ein Buchhüllenbetrag gespeichert, aber keine Buchhülle ausgewählt.`,
          {
            itemId:
              item.id,
          },
        );
      }

      const coverQuantity =
        requireQuantity(
          item.book_cover_quantity,
          `Buchhüllenmenge ${item.product_name}`,
        );

      const coverUnitPriceCents =
        toMoneyCents(
          item
            .book_cover_unit_price,
          `Buchhüllen-Einzelpreis ${item.product_name}`,
        );

      const calculatedCoverGrossCents =
        Math.round(
          coverQuantity *
            coverUnitPriceCents,
        );

      if (
        calculatedCoverGrossCents !==
        bookCoverGrossCents
      ) {
        fail(
          "BOOK_COVER_GROSS_MISMATCH",
          `Menge mal Einzelpreis der Buchhülle zu ${item.product_name} stimmt nicht mit dem Snapshot überein.`,
          {
            itemId:
              item.id,

            quantity:
              coverQuantity,

            unitPrice:
              centsToAmount(
                coverUnitPriceCents,
              ),

            calculatedGross:
              centsToAmount(
                calculatedCoverGrossCents,
              ),

            expectedGross:
              centsToAmount(
                bookCoverGrossCents,
              ),
          },
        );
      }

      const coverTaxRate =
        requireTaxRate(
          item
            .book_cover_tax_rate_snapshot,
          `Buchhüllen-Steuersatz ${item.product_name}`,
        );

      bookCoverLines.push(
        makeCustomLine({
          name:
            cleanText(
              item
                .book_cover_name_snapshot,
              255,
            ) ||
            `Buchhülle zu ${item.product_name}`,

          description:
            `Zugeordnet zu: ${item.product_name}`,

          quantity:
            coverQuantity,

          unitName:
            "Stück",

          grossUnitAmountCents:
            coverUnitPriceCents,

          taxRate:
            coverTaxRate,
        }),
      );
    }
  }

  const regularShippingLines:
    LexwareInvoicePayloadLineItem[] =
      [];

  const bookShippingLines:
    LexwareInvoicePayloadLineItem[] =
      [];

  const discountLines:
    LexwareInvoicePayloadLineItem[] =
      [];

  for (
    const rate of
    taxBreakdown.rates
  ) {
    const taxRate =
      requireTaxRate(
        rate.tax_rate,
        "Steuerbereich",
      );

    const regularShippingGrossCents =
      optionalMoneyCents(
        rate
          .regular_shipping
          .gross,
        `Versand ${taxRate} %`,
      );

    if (
      regularShippingGrossCents >
      0
    ) {
      regularShippingLines.push(
        makeCustomLine({
          name:
            "Versandkosten",

          description:
            `Steueranteil ${taxRate} % gemäß Warenwertverteilung`,

          quantity:
            1,

          unitName:
            "Pauschale",

          grossUnitAmountCents:
            regularShippingGrossCents,

          taxRate,
        }),
      );
    }

    const bookShippingGrossCents =
      optionalMoneyCents(
        rate
          .book_shipping
          .gross,
        `Buchversand ${taxRate} %`,
      );

    if (
      bookShippingGrossCents >
      0
    ) {
      bookShippingLines.push(
        makeCustomLine({
          name:
            "Buchversand",

          description:
            `Steueranteil ${taxRate} % gemäß Buchwarenwertverteilung`,

          quantity:
            1,

          unitName:
            "Pauschale",

          grossUnitAmountCents:
            bookShippingGrossCents,

          taxRate,
        }),
      );
    }

    const discountGrossCents =
      optionalMoneyCents(
        rate.discount.gross,
        `Rabatt ${taxRate} %`,
      );

    if (
      discountGrossCents >
      0
    ) {
      discountLines.push(
        makeCustomLine({
          name:
            "Rabatt",

          description:
            `Rabattanteil für Waren mit ${taxRate} % Umsatzsteuer`,

          quantity:
            1,

          unitName:
            "Pauschale",

          grossUnitAmountCents:
            -discountGrossCents,

          taxRate,
        }),
      );
    }
  }

  const lineItems = [
    ...productLines,
    ...bookCoverLines,
    ...regularShippingLines,
    ...bookShippingLines,
    ...discountLines,
  ];

  if (
    lineItems.length >
    MAX_LEXWARE_LINE_ITEMS
  ) {
    fail(
      "TOO_MANY_LEXWARE_LINE_ITEMS",
      `Der Lexware-Payload enthält ${lineItems.length} Positionen. Erlaubt sind höchstens ${MAX_LEXWARE_LINE_ITEMS}.`,
      {
        lineItemCount:
          lineItems.length,
      },
    );
  }

  const payload:
    LexwareInvoiceCreatePayload = {
      archived:
        false,

      voucherDate,

      address: {
        name:
          billingName,

        ...(
          billingStreet
            ? {
                street:
                  billingStreet,
              }
            : {}
        ),

        city:
          billingCity,

        zip:
          billingPostalCode,

        countryCode:
          "DE",
      },

      lineItems,

      totalPrice: {
        currency:
          "EUR",
      },

      taxConditions: {
        taxType:
          "gross",
      },

      paymentConditions:
        buildPaymentConditions(
          invoice
            .selected_payment_method,
          paymentTermDaysRaw,
        ),

      shippingConditions:
        invoice
          .fulfillment_method_snapshot ===
          "shipping"
          ? {
              shippingType:
                "delivery",

              shippingDate,
            }
          : {
              shippingType:
                "none",
            },

      title:
        "Rechnung",

      introduction:
        cleanText(
          input.introduction,
        ) ||
        "Deine bestellten Schulmaterialien stellen wir Dir hiermit in Rechnung.",

      remark:
        cleanText(
          input.remark,
        ) ||
        "Vielen Dank für Deine Bestellung bei Handzettel-Schulen.de.",
    };

  const expectedTaxRates =
    taxBreakdown.rates
      .filter(
        (rate) =>
          toMoneyCents(
            rate
              .total
              .gross,
            `Gesamtbrutto ${rate.tax_rate} %`,
            {
              allowZero:
                true,
            },
          ) !== 0,
      )
      .map(
        (rate) => ({
          taxRatePercentage:
            rate.tax_rate,

          grossAmount:
            rate
              .total
              .gross,

          netAmount:
            rate
              .total
              .net,

          taxAmount:
            rate
              .total
              .tax,
        }),
      );

  return {
    version:
      LEXWARE_INVOICE_PAYLOAD_BUILDER_VERSION,

    payload,

    expected: {
      totalGrossAmount:
        taxBreakdown
          .totals
          .total
          .gross,

      totalNetAmount:
        taxBreakdown
          .totals
          .total
          .net,

      totalTaxAmount:
        taxBreakdown
          .totals
          .total
          .tax,

      taxRates:
        expectedTaxRates,
    },

    metadata: {
      localInvoiceId:
        invoiceId,

      requestId,

      taxSnapshotSource:
        INVOICE_TAX_SNAPSHOT_SOURCE,

      taxSnapshotVersion:
        INVOICE_TAX_SNAPSHOT_VERSION,

      taxSnapshotAt:
        invoice.tax_snapshot_at!,

      lineItemCount:
        lineItems.length,

      productLineCount:
        productLines.length,

      bookCoverLineCount:
        bookCoverLines.length,

      regularShippingLineCount:
        regularShippingLines.length,

      bookShippingLineCount:
        bookShippingLines.length,

      discountLineCount:
        discountLines.length,
    },
  };
}