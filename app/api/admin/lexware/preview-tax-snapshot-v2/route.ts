import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  requireAdminApiSession,
} from "@/app/lib/adminApiAuth";

import {
  LexwareApiError,
} from "@/app/lib/lexware/lexwareClient";

import {
  LexwareConfigurationError,
  getLexwareRuntimeConfigurationSummary,
} from "@/app/lib/lexware/lexwareConfig";

import {
  getLexwareInvoice,
} from "@/app/lib/lexware/lexwareInvoiceReadClient";

import {
  type LocalLexwareInvoiceItemSnapshot,
  type LocalLexwareInvoiceSnapshot,
} from "@/app/lib/lexware/lexwareInvoicePayloadBuilder";

import {
  INVOICE_TAX_SNAPSHOT_V2_VERSION,
  InvoiceTaxSnapshotV2Error,
  buildInvoiceTaxSnapshotV2,
  type InvoiceTaxSnapshotV2EntryInput,
  type SupportedInvoiceTaxRateV2,
} from "@/lib/tax-v2";

import {
  supabaseServer,
} from "@/lib/supabase/server";

/*
 * LEXWARE_PREVIEW_TAX_SNAPSHOT_V2_READ_ONLY_V1
 *
 * Diese Route:
 *
 * - lädt eine bestehende lokale V1-Rechnung,
 * - erzeugt daraus parallel einen vollständigen V2-Steuer-Snapshot,
 * - verändert den bestehenden V1-Snapshot nicht,
 * - liest optional den vorhandenen Lexware-Testentwurf,
 * - vergleicht V2 und Lexware centgenau,
 * - schreibt nicht nach Supabase,
 * - schreibt nicht nach Lexware,
 * - erzeugt keine Rechnung,
 * - lädt kein PDF,
 * - versendet keine E-Mail.
 */

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

const ROUTE_VERSION =
  "lexware-preview-tax-snapshot-v2-read-only-v1";

const TEST_MODE =
  "test" as const;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NO_STORE_HEADERS = {
  "Cache-Control":
    "no-store, no-cache, must-revalidate, max-age=0",
};

type InvoiceLookupResult = {
  invoice:
    LocalLexwareInvoiceSnapshot;

  items:
    LocalLexwareInvoiceItemSnapshot[];
};

type JsonRecord =
  Record<string, unknown>;

type ComparisonCheck = {
  name:
    string;

  passed:
    boolean;

  message:
    string;

  expected?:
    unknown;

  actual?:
    unknown;
};

type RouteFailureKind =
  | "request"
  | "configuration"
  | "database"
  | "snapshot_v2"
  | "lexware_api"
  | "unknown";

type RouteFailure = {
  kind:
    RouteFailureKind;

  code:
    string;

  message:
    string;

  details:
    Record<string, unknown> |
    null;
};

function isRecord(
  value: unknown,
): value is JsonRecord {
  return (
    typeof value ===
      "object" &&
    value !==
      null &&
    !Array.isArray(value)
  );
}

function cleanText(
  value: unknown,
) {
  const text =
    String(
      value ??
      "",
    ).trim();

  return text.length > 0
    ? text
    : null;
}

function normalizeUuid(
  value: unknown,
) {
  return (
    cleanText(value)
      ?.toLowerCase() ||
    null
  );
}

function amountToCents(
  value: unknown,
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const normalized =
    typeof value ===
      "string"
      ? value
          .trim()
          .replace(",", ".")
      : value;

  const parsed =
    Number(normalized);

  if (
    !Number.isFinite(parsed)
  ) {
    return null;
  }

  return Math.round(
    (
      parsed +
      (
        parsed >= 0
          ? Number.EPSILON
          : -Number.EPSILON
      )
    ) * 100,
  );
}

function centsToMoneyString(
  cents: number,
) {
  const negative =
    cents < 0;

  const absolute =
    Math.abs(cents);

  const euros =
    Math.floor(
      absolute / 100,
    );

  const centPart =
    String(
      absolute % 100,
    ).padStart(
      2,
      "0",
    );

  return `${
    negative
      ? "-"
      : ""
  }${euros}.${centPart}`;
}

function moneyEquals(
  left: unknown,
  right: unknown,
) {
  const leftCents =
    amountToCents(left);

  const rightCents =
    amountToCents(right);

  return (
    leftCents !== null &&
    rightCents !== null &&
    leftCents ===
      rightCents
  );
}

function createRequestError(
  code: string,
  message: string,
  details?:
    Record<string, unknown>,
) {
  const error =
    new Error(
      message,
    ) as Error & {
      code?: string;
      details?: Record<string, unknown>;
    };

  error.name =
    "LexwarePreviewTaxSnapshotV2RequestError";

  error.code =
    code;

  error.details =
    details;

  return error;
}

function pushCheck(
  checks:
    ComparisonCheck[],

  name:
    string,

  passed:
    boolean,

  message:
    string,

  expected?:
    unknown,

  actual?:
    unknown,
) {
  checks.push({
    name,
    passed,
    message,

    ...(
      expected !==
      undefined
        ? {
            expected,
          }
        : {}
    ),

    ...(
      actual !==
      undefined
        ? {
            actual,
          }
        : {}
    ),
  });
}

function requireTaxRate(
  value: unknown,
  context: string,
): SupportedInvoiceTaxRateV2 {
  const parsed =
    Number(value);

  if (
    parsed !== 7 &&
    parsed !== 19
  ) {
    throw new InvoiceTaxSnapshotV2Error(
      "PREVIEW_TAX_RATE_INVALID",
      `${context} besitzt keinen unterstützten Steuersatz.`,
      {
        context,
        receivedTaxRate:
          value,
      },
    );
  }

  return parsed;
}

function requirePositiveInteger(
  value: unknown,
  context: string,
) {
  const parsed =
    Number(value);

  if (
    !Number.isInteger(parsed) ||
    parsed < 1 ||
    parsed > 9_999
  ) {
    throw new InvoiceTaxSnapshotV2Error(
      "PREVIEW_QUANTITY_INVALID",
      `${context} besitzt keine gültige Menge.`,
      {
        context,
        receivedQuantity:
          value,
      },
    );
  }

  return parsed;
}

function requireMoneyString(
  value: unknown,
  context: string,
) {
  const cents =
    amountToCents(value);

  if (cents === null) {
    throw new InvoiceTaxSnapshotV2Error(
      "PREVIEW_MONEY_INVALID",
      `${context} besitzt keinen gültigen Geldbetrag.`,
      {
        context,
        receivedValue:
          value,
      },
    );
  }

  return centsToMoneyString(
    cents,
  );
}

function extractV1Rates(
  breakdownValue: unknown,
) {
  if (
    !isRecord(breakdownValue) ||
    !Array.isArray(
      breakdownValue.rates,
    )
  ) {
    return [];
  }

  return breakdownValue.rates.filter(
    isRecord,
  );
}

function extractComponentMoney(
  rate: JsonRecord,
  component:
    | "regular_shipping"
    | "book_shipping"
    | "discount",
) {
  const value =
    rate[component];

  if (!isRecord(value)) {
    return {
      gross:
        0,

      net:
        0,

      tax:
        0,
    };
  }

  return {
    gross:
      Number(
        value.gross ??
        0,
      ),

    net:
      Number(
        value.net ??
        0,
      ),

    tax:
      Number(
        value.tax ??
        0,
      ),
  };
}

function buildProductEntries(
  items:
    LocalLexwareInvoiceItemSnapshot[],
): InvoiceTaxSnapshotV2EntryInput[] {
  const entries:
    InvoiceTaxSnapshotV2EntryInput[] =
      [];

  items.forEach(
    (
      item,
      index,
    ) => {
      const position =
        index + 1;

      const itemId =
        cleanText(
          item.id,
        );

      const productId =
        cleanText(
          item.product_id,
        );

      const productName =
        cleanText(
          item.product_name,
        );

      if (
        !itemId ||
        !productId ||
        !productName
      ) {
        throw new InvoiceTaxSnapshotV2Error(
          "PREVIEW_PRODUCT_DATA_INCOMPLETE",
          `Die lokale Rechnungsposition ${position} besitzt unvollständige Produktdaten.`,
          {
            position,
            itemId,
            productId,
            productName,
          },
        );
      }

      const quantity =
        requirePositiveInteger(
          item.quantity,
          `Rechnungsposition ${position}`,
        );

      const productTaxRate =
        requireTaxRate(
          item.tax_rate_snapshot,
          `Rechnungsposition ${position}`,
        );

      const productGrossAmount =
        requireMoneyString(
          item.product_gross_amount_snapshot ??
          item.total_price,
          `Produktbrutto der Rechnungsposition ${position}`,
        );

      entries.push({
        key:
          `product:${itemId}`,

        component:
          "product",

        taxRatePercentage:
          productTaxRate,

        grossAmount:
          productGrossAmount,

        itemKey:
          itemId,

        productId,

        productName,

        quantity,

        isBook:
          item.is_book_snapshot ===
          true,

        metadata: {
          invoiceItemId:
            itemId,

          productSku:
            cleanText(
              item.product_sku,
            ),

          source:
            cleanText(
              item.source,
            ),
        },
      });

      const coverGrossCents =
        amountToCents(
          item.book_cover_total_price,
        );

      const coverQuantity =
        Number(
          item.book_cover_quantity ??
          0,
        );

      const coverSelected =
        item.book_cover_selected ===
          true ||
        (
          coverGrossCents !==
            null &&
          coverGrossCents >
            0
        ) ||
        coverQuantity >
          0;

      if (!coverSelected) {
        return;
      }

      if (
        coverGrossCents ===
          null ||
        coverGrossCents <=
          0
      ) {
        throw new InvoiceTaxSnapshotV2Error(
          "PREVIEW_BOOK_COVER_GROSS_INVALID",
          `Die Buchhülle der Rechnungsposition ${position} besitzt keinen positiven Bruttobetrag.`,
          {
            position,
            bookCoverTotalPrice:
              item.book_cover_total_price,
          },
        );
      }

      const coverTaxRate =
        requireTaxRate(
          item.book_cover_tax_rate_snapshot,
          `Buchhülle der Rechnungsposition ${position}`,
        );

      entries.push({
        key:
          `book-cover:${itemId}`,

        component:
          "book_cover",

        taxRatePercentage:
          coverTaxRate,

        grossAmount:
          centsToMoneyString(
            coverGrossCents,
          ),

        itemKey:
          itemId,

        productId,

        productName:
          cleanText(
            item.book_cover_name_snapshot,
          ) ||
          `Buchhülle zu ${productName}`,

        isBook:
          false,

        metadata: {
          invoiceItemId:
            itemId,

          bookCoverQuantity:
            Number.isFinite(
              coverQuantity,
            )
              ? coverQuantity
              : null,
        },
      });
    },
  );

  return entries;
}

function buildAllocatedComponentEntries(
  invoice:
    LocalLexwareInvoiceSnapshot,
): InvoiceTaxSnapshotV2EntryInput[] {
  const entries:
    InvoiceTaxSnapshotV2EntryInput[] =
      [];

  const rates =
    extractV1Rates(
      invoice.tax_breakdown_snapshot,
    );

  for (
    const rate of
    rates
  ) {
    const taxRatePercentage =
      requireTaxRate(
        rate.tax_rate ??
        rate.taxRatePercentage,
        "V1-Steuerbereich",
      );

    const regularShipping =
      extractComponentMoney(
        rate,
        "regular_shipping",
      );

    const bookShipping =
      extractComponentMoney(
        rate,
        "book_shipping",
      );

    const discount =
      extractComponentMoney(
        rate,
        "discount",
      );

    const regularShippingCents =
      amountToCents(
        regularShipping.gross,
      ) ??
      0;

    if (
      regularShippingCents >
      0
    ) {
      entries.push({
        key:
          `regular-shipping:${taxRatePercentage}`,

        component:
          "regular_shipping",

        taxRatePercentage,

        grossAmount:
          centsToMoneyString(
            regularShippingCents,
          ),

        metadata: {
          source:
            "v1_tax_breakdown_snapshot",
        },
      });
    }

    const bookShippingCents =
      amountToCents(
        bookShipping.gross,
      ) ??
      0;

    if (
      bookShippingCents >
      0
    ) {
      entries.push({
        key:
          `book-shipping:${taxRatePercentage}`,

        component:
          "book_shipping",

        taxRatePercentage,

        grossAmount:
          centsToMoneyString(
            bookShippingCents,
          ),

        metadata: {
          source:
            "v1_tax_breakdown_snapshot",
        },
      });
    }

    const discountCents =
      amountToCents(
        discount.gross,
      ) ??
      0;

    if (
      discountCents >
      0
    ) {
      entries.push({
        key:
          `discount:${taxRatePercentage}`,

        component:
          "discount",

        taxRatePercentage,

        grossAmount:
          centsToMoneyString(
            -discountCents,
          ),

        metadata: {
          source:
            "v1_tax_breakdown_snapshot",
        },
      });
    }
  }

  return entries;
}

function buildSnapshotEntries(
  invoice:
    LocalLexwareInvoiceSnapshot,

  items:
    LocalLexwareInvoiceItemSnapshot[],
) {
  const productEntries =
    buildProductEntries(
      items,
    );

  const allocatedComponentEntries =
    buildAllocatedComponentEntries(
      invoice,
    );

  return [
    ...productEntries,
    ...allocatedComponentEntries,
  ];
}

async function loadInvoiceSnapshot(
  invoiceNumber:
    string,
): Promise<InvoiceLookupResult> {
  const {
    data: invoiceData,
    error: invoiceError,
  } =
    await supabaseServer
      .from(
        "school_request_invoices",
      )
      .select(
        [
          "id",
          "request_id",
          "invoice_number",
          "invoice_provider",
          "invoice_cutover_version",
          "selected_payment_method",
          "fulfillment_method_snapshot",
          "billing_name_snapshot",
          "billing_street_snapshot",
          "billing_postal_code_snapshot",
          "billing_city_snapshot",
          "customer_email_snapshot",
          "child_name_snapshot",
          "school_name_snapshot",
          "class_name_snapshot",
          "customer_note",
          "admin_note",
          "subtotal_amount",
          "shipping_amount",
          "book_shipping_amount",
          "book_cover_amount",
          "discount_amount",
          "total_amount",
          "currency",
          "tax_snapshot_status",
          "tax_snapshot_source",
          "tax_snapshot_version",
          "tax_snapshot_at",
          "tax_breakdown_snapshot",
          "total_net_amount_snapshot",
          "total_tax_amount_snapshot",
          "created_at",
        ].join(
          ", ",
        ),
      )
      .eq(
        "invoice_number",
        invoiceNumber,
      )
      .maybeSingle();

  if (invoiceError) {
    const error =
      new Error(
        "Die lokale Rechnung konnte nicht geladen werden: " +
          invoiceError.message,
      );

    error.name =
      "LexwarePreviewTaxSnapshotV2DatabaseError";

    throw error;
  }

  if (!invoiceData) {
    const error =
      new Error(
        `Die lokale Rechnung ${invoiceNumber} wurde nicht gefunden.`,
      );

    error.name =
      "LexwarePreviewTaxSnapshotV2DatabaseError";

    throw error;
  }

  const invoice =
    invoiceData as unknown as
      LocalLexwareInvoiceSnapshot;

  const {
    data: itemData,
    error: itemError,
  } =
    await supabaseServer
      .from(
        "school_request_invoice_items",
      )
      .select(
        [
          "id",
          "invoice_id",
          "product_id",
          "product_name",
          "product_sku",
          "quantity",
          "unit",
          "unit_price",
          "total_price",
          "tax_rate_snapshot",
          "product_gross_amount_snapshot",
          "product_net_amount_snapshot",
          "product_tax_amount_snapshot",
          "tax_snapshot_source",
          "tax_snapshot_version",
          "tax_snapshot_at",
          "is_book_snapshot",
          "book_isbn13_snapshot",
          "book_cover_selected",
          "book_cover_name_snapshot",
          "book_cover_quantity",
          "book_cover_unit_price",
          "book_cover_total_price",
          "book_cover_tax_rate_snapshot",
          "book_cover_net_amount_snapshot",
          "book_cover_tax_amount_snapshot",
          "source",
          "notes",
          "created_at",
        ].join(
          ", ",
        ),
      )
      .eq(
        "invoice_id",
        invoice.id,
      )
      .order(
        "created_at",
        {
          ascending:
            true,
        },
      );

  if (itemError) {
    const error =
      new Error(
        "Die lokalen Rechnungspositionen konnten nicht geladen werden: " +
          itemError.message,
      );

    error.name =
      "LexwarePreviewTaxSnapshotV2DatabaseError";

    throw error;
  }

  const items =
    (
      itemData ||
      []
    ) as unknown as
      LocalLexwareInvoiceItemSnapshot[];

  if (
    items.length ===
    0
  ) {
    const error =
      new Error(
        `Die lokale Rechnung ${invoiceNumber} besitzt keine Rechnungspositionen.`,
      );

    error.name =
      "LexwarePreviewTaxSnapshotV2DatabaseError";

    throw error;
  }

  return {
    invoice,
    items,
  };
}

function getErrorPayload(
  error: unknown,
): RouteFailure {
  if (
    error instanceof Error &&
    error.name ===
      "LexwarePreviewTaxSnapshotV2RequestError"
  ) {
    const typedError =
      error as Error & {
        code?: string;
        details?: Record<string, unknown>;
      };

    return {
      kind:
        "request",

      code:
        typedError.code ||
        "LEXWARE_PREVIEW_TAX_SNAPSHOT_V2_REQUEST_INVALID",

      message:
        typedError.message,

      details:
        typedError.details ||
        null,
    };
  }

  if (
    error instanceof
    LexwareConfigurationError
  ) {
    return {
      kind:
        "configuration",

      code:
        error.code,

      message:
        error.message,

      details:
        null,
    };
  }

  if (
    error instanceof Error &&
    error.name ===
      "LexwarePreviewTaxSnapshotV2DatabaseError"
  ) {
    return {
      kind:
        "database",

      code:
        "LEXWARE_PREVIEW_TAX_SNAPSHOT_V2_DATABASE_ERROR",

      message:
        error.message,

      details:
        null,
    };
  }

  if (
    error instanceof
    InvoiceTaxSnapshotV2Error
  ) {
    return {
      kind:
        "snapshot_v2",

      code:
        error.code,

      message:
        error.message,

      details:
        error.details,
    };
  }

  if (
    error instanceof
    LexwareApiError
  ) {
    return {
      kind:
        "lexware_api",

      code:
        error.code,

      message:
        error.message,

      details: {
        mode:
          error.mode,

        resourcePath:
          error.resourcePath,

        httpStatus:
          error.httpStatus,

        retryAfterSeconds:
          error.retryAfterSeconds,
      },
    };
  }

  return {
    kind:
      "unknown",

    code:
      "LEXWARE_PREVIEW_TAX_SNAPSHOT_V2_FAILED",

    message:
      error instanceof Error
        ? error.message
        : "Die Vorschau des Steuer-Snapshots V2 ist fehlgeschlagen.",

    details:
      null,
  };
}

function getFailureStatus(
  failure:
    RouteFailure,
) {
  if (
    failure.kind ===
    "request"
  ) {
    return 400;
  }

  if (
    failure.kind ===
    "snapshot_v2"
  ) {
    return 422;
  }

  if (
    failure.kind ===
    "configuration"
  ) {
    return 503;
  }

  if (
    failure.kind ===
    "lexware_api"
  ) {
    const upstreamStatus =
      Number(
        failure.details
          ?.httpStatus,
      );

    if (
      Number.isInteger(
        upstreamStatus,
      ) &&
      upstreamStatus >=
        400 &&
      upstreamStatus <=
        599
    ) {
      return upstreamStatus;
    }

    return 502;
  }

  return 500;
}

export async function GET(
  request:
    NextRequest,
) {
  const unauthorized =
    await requireAdminApiSession();

  if (unauthorized) {
    return unauthorized;
  }

  let lexwareRequestsPerformed =
    0;

  try {
    const requestUrl =
      new URL(
        request.url,
      );

    const invoiceNumber =
      cleanText(
        requestUrl
          .searchParams
          .get(
            "invoiceNumber",
          ),
      );

    const lexwareInvoiceId =
      normalizeUuid(
        requestUrl
          .searchParams
          .get(
            "lexwareInvoiceId",
          ),
      );

    if (!invoiceNumber) {
      throw createRequestError(
        "LEXWARE_PREVIEW_LOCAL_INVOICE_NUMBER_MISSING",
        "Der Queryparameter invoiceNumber fehlt.",
      );
    }

    if (
      !lexwareInvoiceId ||
      !UUID_PATTERN.test(
        lexwareInvoiceId,
      )
    ) {
      throw createRequestError(
        "LEXWARE_PREVIEW_INVOICE_ID_INVALID",
        "Der Queryparameter lexwareInvoiceId fehlt oder besitzt kein gültiges UUID-Format.",
        {
          lexwareInvoiceId,
        },
      );
    }

    const environment =
      getLexwareRuntimeConfigurationSummary();

    const safeTestEnvironment =
      environment.activeMode ===
        TEST_MODE &&
      environment.activeModeValid ===
        true &&
      environment.integrationEnabled ===
        false &&
      environment.integrationFlagValid ===
        true &&
      environment.apiBaseUrlValid ===
        true &&
      environment.modes.test
        .apiKeyConfigured ===
        true &&
      environment.modes.test
        .organizationIdValid ===
        true &&
      environment.modes.production
        .apiKeyConfigured ===
        false &&
      environment
        .credentialSeparation
        .safe ===
        true;

    if (!safeTestEnvironment) {
      return NextResponse.json(
        {
          ok:
            false,

          readOnly:
            true,

          writeOperationsPerformed:
            false,

          lexwareRequestsPerformed,

          databaseWritesPerformed:
            0,

          mailOperationsPerformed:
            0,

          pdfRequestsPerformed:
            0,

          version:
            ROUTE_VERSION,

          message:
            "Die V2-Snapshot-Vorschau ist nur im deaktivierten Lexware-Testmodus ohne Produktionsschlüssel zulässig.",
        },
        {
          status:
            409,

          headers:
            NO_STORE_HEADERS,
        },
      );
    }

    const {
      invoice:
        localInvoice,

      items:
        localItems,
    } =
      await loadInvoiceSnapshot(
        invoiceNumber,
      );

    const entries =
      buildSnapshotEntries(
        localInvoice,
        localItems,
      );

    const snapshot =
      buildInvoiceTaxSnapshotV2({
        currency:
          cleanText(
            localInvoice.currency,
          ) ||
          "EUR",

        snapshotAt:
          localInvoice.tax_snapshot_at ||
          localInvoice.created_at,

        entries,
      });

    lexwareRequestsPerformed +=
      1;

    const lexwareInvoice =
      await getLexwareInvoice(
        TEST_MODE,
        lexwareInvoiceId,
      );

    const checks:
      ComparisonCheck[] =
      [];

    pushCheck(
      checks,
      "snapshotVersionIsV2",
      snapshot.version ===
        INVOICE_TAX_SNAPSHOT_V2_VERSION,
      "Die erzeugte Snapshot-Version ist invoice-tax-snapshot-v2.",
      INVOICE_TAX_SNAPSHOT_V2_VERSION,
      snapshot.version,
    );

    pushCheck(
      checks,
      "snapshotStatusComplete",
      snapshot
        .invoiceSnapshotPayload
        .tax_snapshot_status ===
        "complete",
      "Der erzeugte V2-Snapshot besitzt den Status complete.",
      "complete",
      snapshot
        .invoiceSnapshotPayload
        .tax_snapshot_status,
    );

    pushCheck(
      checks,
      "itemCountMatchesLocalInvoice",
      snapshot.items.length ===
        localItems.length,
      "Die Anzahl der V2-Positionssnapshots stimmt mit der lokalen Rechnung überein.",
      localItems.length,
      snapshot.items.length,
    );

    pushCheck(
      checks,
      "entryCountMatchesAllocator",
      snapshot
        .diagnostics
        .inputEntryCount ===
        snapshot
          .allocator
          .diagnostics
          .entryCount,
      "Die Eingabeanzahl stimmt mit der Allocator-Positionsanzahl überein.",
      snapshot
        .diagnostics
        .inputEntryCount,
      snapshot
        .allocator
        .diagnostics
        .entryCount,
    );

    pushCheck(
      checks,
      "allSnapshotInvariantsPassed",
      snapshot
        .diagnostics
        .allInvariantsPassed ===
        true,
      "Alle internen V2-Snapshot-Regeln wurden erfüllt.",
      true,
      snapshot
        .diagnostics
        .allInvariantsPassed,
    );

    pushCheck(
      checks,
      "lexwareStatusIsDraft",
      lexwareInvoice
        .voucherStatus ===
        "draft",
      "Die verglichene Lexware-Rechnung besitzt weiterhin den Status draft.",
      "draft",
      lexwareInvoice
        .voucherStatus,
    );

    pushCheck(
      checks,
      "lexwareInvoiceIdMatches",
      lexwareInvoice.id ===
        lexwareInvoiceId,
      "Lexware hat exakt die angeforderte Testrechnung geliefert.",
      lexwareInvoiceId,
      lexwareInvoice.id,
    );

    pushCheck(
      checks,
      "totalGrossMatchesLexware",
      moneyEquals(
        snapshot
          .breakdown
          .totals
          .total
          .gross,
        lexwareInvoice
          .totalPrice
          .totalGrossAmount,
      ),
      "Der V2-Gesamtbruttobetrag stimmt mit Lexware überein.",
      lexwareInvoice
        .totalPrice
        .totalGrossAmount,
      snapshot
        .breakdown
        .totals
        .total
        .gross,
    );

    pushCheck(
      checks,
      "totalNetMatchesLexware",
      moneyEquals(
        snapshot
          .invoiceSnapshotPayload
          .total_net_amount_snapshot,
        lexwareInvoice
          .totalPrice
          .totalNetAmount,
      ),
      "Der V2-Gesamtnettobetrag stimmt mit Lexware überein.",
      lexwareInvoice
        .totalPrice
        .totalNetAmount,
      snapshot
        .invoiceSnapshotPayload
        .total_net_amount_snapshot,
    );

    pushCheck(
      checks,
      "totalTaxMatchesLexware",
      moneyEquals(
        snapshot
          .invoiceSnapshotPayload
          .total_tax_amount_snapshot,
        lexwareInvoice
          .totalPrice
          .totalTaxAmount,
      ),
      "Der V2-Gesamtsteuerbetrag stimmt mit Lexware überein.",
      lexwareInvoice
        .totalPrice
        .totalTaxAmount,
      snapshot
        .invoiceSnapshotPayload
        .total_tax_amount_snapshot,
    );

    for (
      const rate of
      snapshot.breakdown.rates
    ) {
      const lexwareRate =
        lexwareInvoice
          .taxAmounts
          .find(
            (entry) =>
              entry
                .taxRatePercentage ===
              rate.tax_rate,
          ) ||
        null;

      const prefix =
        `taxRate${rate.tax_rate}`;

      pushCheck(
        checks,
        `${prefix}ExistsInLexware`,
        Boolean(lexwareRate),
        `Der Steuerbereich ${rate.tax_rate} % ist in Lexware vorhanden.`,
        true,
        Boolean(lexwareRate),
      );

      if (!lexwareRate) {
        continue;
      }

      pushCheck(
        checks,
        `${prefix}NetMatchesLexware`,
        lexwareRate.netAmount !==
          null &&
        moneyEquals(
          rate.total.net,
          lexwareRate.netAmount,
        ),
        `Der V2-Nettobetrag für ${rate.tax_rate} % stimmt mit Lexware überein.`,
        lexwareRate.netAmount,
        rate.total.net,
      );

      pushCheck(
        checks,
        `${prefix}TaxMatchesLexware`,
        lexwareRate.taxAmount !==
          null &&
        moneyEquals(
          rate.total.tax,
          lexwareRate.taxAmount,
        ),
        `Der V2-Steuerbetrag für ${rate.tax_rate} % stimmt mit Lexware überein.`,
        lexwareRate.taxAmount,
        rate.total.tax,
      );
    }

    const failedChecks =
      checks.filter(
        (check) =>
          check.passed !==
          true,
      );

    const allChecksPassed =
      failedChecks.length ===
      0;

    return NextResponse.json(
      {
        ok:
          allChecksPassed,

        readOnly:
          true,

        writeOperationsPerformed:
          false,

        lexwareRequestsPerformed,

        databaseReadsPerformed:
          true,

        databaseWritesPerformed:
          0,

        mailOperationsPerformed:
          0,

        pdfRequestsPerformed:
          0,

        version:
          ROUTE_VERSION,

        checkedAt:
          new Date()
            .toISOString(),

        localInvoice: {
          id:
            localInvoice.id,

          invoiceNumber:
            localInvoice
              .invoice_number,

          existingTaxSnapshotVersion:
            localInvoice
              .tax_snapshot_version,

          existingTaxSnapshotStatus:
            localInvoice
              .tax_snapshot_status,

          localItemCount:
            localItems.length,
        },

        snapshotV2: {
          version:
            snapshot.version,

          source:
            snapshot.source,

          snapshotAt:
            snapshot.snapshotAt,

          currency:
            snapshot.currency,

          itemCount:
            snapshot.items.length,

          inputEntryCount:
            snapshot
              .diagnostics
              .inputEntryCount,

          rateCount:
            snapshot
              .diagnostics
              .rateCount,

          total: {
            grossAmount:
              snapshot
                .breakdown
                .totals
                .total
                .gross,

            netAmount:
              snapshot
                .invoiceSnapshotPayload
                .total_net_amount_snapshot,

            taxAmount:
              snapshot
                .invoiceSnapshotPayload
                .total_tax_amount_snapshot,
          },

          rates:
            snapshot
              .breakdown
              .rates
              .map(
                (rate) => ({
                  taxRatePercentage:
                    rate.tax_rate,

                  grossAmount:
                    rate.total.gross,

                  netAmount:
                    rate.total.net,

                  taxAmount:
                    rate.total.tax,
                }),
              ),

          invoiceSnapshotPayload:
            snapshot
              .invoiceSnapshotPayload,

          itemSnapshotPayloads:
            snapshot.items.map(
              (item) => ({
                itemKey:
                  item.key,

                productId:
                  item.productId,

                productName:
                  item.productName,

                quantity:
                  item.quantity,

                isBook:
                  item.isBook,

                snapshotPayload:
                  item.snapshotPayload,
              }),
            ),

          diagnostics:
            snapshot.diagnostics,

          allocatorDiagnostics:
            snapshot
              .allocator
              .diagnostics,
        },

        lexware: {
          invoiceId:
            lexwareInvoice.id,

          voucherNumber:
            lexwareInvoice
              .voucherNumber,

          voucherStatus:
            lexwareInvoice
              .voucherStatus,

          lineItemCount:
            lexwareInvoice
              .lineItems
              .length,

          total:
            lexwareInvoice
              .totalPrice,

          taxAmounts:
            lexwareInvoice
              .taxAmounts,
        },

        checks: {
          checkCount:
            checks.length,

          failedCheckCount:
            failedChecks.length,

          failedChecks,

          allChecksPassed,
        },
      },
      {
        status:
          allChecksPassed
            ? 200
            : 422,

        headers:
          NO_STORE_HEADERS,
      },
    );
  } catch (error) {
    const failure =
      getErrorPayload(
        error,
      );

    console.error(
      "lexware_preview_tax_snapshot_v2_failed",
      {
        kind:
          failure.kind,

        code:
          failure.code,

        message:
          failure.message,

        details:
          failure.details,

        lexwareRequestsPerformed,
      },
    );

    return NextResponse.json(
      {
        ok:
          false,

        readOnly:
          true,

        writeOperationsPerformed:
          false,

        lexwareRequestsPerformed,

        databaseWritesPerformed:
          0,

        mailOperationsPerformed:
          0,

        pdfRequestsPerformed:
          0,

        version:
          ROUTE_VERSION,

        error:
          failure,
      },
      {
        status:
          getFailureStatus(
            failure,
          ),

        headers:
          NO_STORE_HEADERS,
      },
    );
  }
}

export async function POST() {
  const unauthorized =
    await requireAdminApiSession();

  if (unauthorized) {
    return unauthorized;
  }

  return NextResponse.json(
    {
      ok:
        false,

      readOnly:
        true,

      writeOperationsPerformed:
        false,

      lexwareRequestsPerformed:
        0,

      databaseWritesPerformed:
        0,

      mailOperationsPerformed:
        0,

      pdfRequestsPerformed:
        0,

      version:
        ROUTE_VERSION,

      message:
        "Diese Route ist ausschließlich read-only und kann nur per GET verwendet werden.",
    },
    {
      status:
        405,

      headers: {
        ...NO_STORE_HEADERS,

        Allow:
          "GET",
      },
    },
  );
}