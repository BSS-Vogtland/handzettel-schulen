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
  getLexwareInvoice,
  type LexwareInvoiceLineItem,
  type LexwareInvoiceReadModel,
  type LexwareInvoiceTaxAmount,
} from "@/app/lib/lexware/lexwareInvoiceReadClient";

import {
  LexwareConfigurationError,
  getLexwareRuntimeConfigurationSummary,
} from "@/app/lib/lexware/lexwareConfig";

import {
  buildLexwareInvoicePayload,
  LexwareInvoicePayloadError,
  type LexwareInvoicePayloadLineItem,
  type LocalLexwareInvoiceItemSnapshot,
  type LocalLexwareInvoiceSnapshot,
} from "@/app/lib/lexware/lexwareInvoicePayloadBuilder";

import {
  LexwareInvoicePayloadValidationError,
  requireValidLexwareInvoicePayload,
} from "@/app/lib/lexware/lexwareInvoicePayloadValidator";

import {
  supabaseServer,
} from "@/lib/supabase/server";

/*
 * LEXWARE_VERIFY_TEST_DRAFT_READ_ONLY_V1
 *
 * Diese Route:
 * - lädt eine vorhandene lokale Rechnung,
 * - baut daraus erneut deterministisch den erwarteten Lexware-Payload,
 * - validiert den erwarteten Payload,
 * - liest genau einen vorhandenen Lexware-Testentwurf,
 * - vergleicht Lexware-Daten mit dem lokalen Snapshot,
 * - lädt bewusst kein PDF, weil Entwürfe kein finales Rechnungs-PDF besitzen,
 * - schreibt weder nach Lexware noch nach Supabase,
 * - versendet keine E-Mail.
 */

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

const ROUTE_VERSION =
  "lexware-verify-test-draft-read-only-v1";

const TEST_MODE =
  "test" as const;

const NO_STORE_HEADERS = {
  "Cache-Control":
    "no-store, no-cache, must-revalidate, max-age=0",
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type InvoiceLookupResult = {
  invoice:
    LocalLexwareInvoiceSnapshot;

  items:
    LocalLexwareInvoiceItemSnapshot[];
};

type VerificationFailureKind =
  | "request"
  | "configuration"
  | "database"
  | "payload_builder"
  | "payload_validator"
  | "lexware_api"
  | "unknown";

type VerificationFailure = {
  kind:
    VerificationFailureKind;

  code:
    string;

  message:
    string;

  details:
    Record<string, unknown> |
    null;
};

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
    !Number.isFinite(
      parsed,
    )
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
    ) *
      100,
  );
}

function moneyEquals(
  left: unknown,
  right: unknown,
) {
  const leftCents =
    amountToCents(
      left,
    );

  const rightCents =
    amountToCents(
      right,
    );

  return (
    leftCents !== null &&
    rightCents !== null &&
    leftCents ===
      rightCents
  );
}

function numberEquals(
  left: unknown,
  right: unknown,
) {
  const leftNumber =
    Number(left);

  const rightNumber =
    Number(right);

  return (
    Number.isFinite(
      leftNumber,
    ) &&
    Number.isFinite(
      rightNumber,
    ) &&
    Math.abs(
      leftNumber -
      rightNumber,
    ) <
      0.000001
  );
}

function normalizeLineText(
  value: unknown,
) {
  return (
    cleanText(value)
      ?.replace(
        /\s+/g,
        " ",
      )
      .trim() ||
    null
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
    "LexwareVerifyTestDraftRequestError";

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
      "LexwareVerifyTestDraftDatabaseError";

    throw error;
  }

  if (!invoiceData) {
    const error =
      new Error(
        `Die lokale Rechnung ${invoiceNumber} wurde nicht gefunden.`,
      );

    error.name =
      "LexwareVerifyTestDraftDatabaseError";

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
      "LexwareVerifyTestDraftDatabaseError";

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
      "LexwareVerifyTestDraftDatabaseError";

    throw error;
  }

  return {
    invoice,
    items,
  };
}

function findTaxAmount(
  invoice:
    LexwareInvoiceReadModel,

  taxRate:
    number,
): LexwareInvoiceTaxAmount | null {
  return (
    invoice.taxAmounts.find(
      (entry) =>
        numberEquals(
          entry.taxRatePercentage,
          taxRate,
        ),
    ) ||
    null
  );
}

function compareLineItem(
  expected:
    LexwareInvoicePayloadLineItem,

  actual:
    LexwareInvoiceLineItem,

  index:
    number,

  checks:
    ComparisonCheck[],
) {
  const position =
    index + 1;

  const prefix =
    `lineItem${position}`;

  pushCheck(
    checks,
    `${prefix}NameMatches`,
    normalizeLineText(
      actual.name,
    ) ===
      normalizeLineText(
        expected.name,
      ),
    `Der Name der Lexware-Position ${position} stimmt mit dem erwarteten Payload überein.`,
    expected.name,
    actual.name,
  );

  pushCheck(
    checks,
    `${prefix}QuantityMatches`,
    numberEquals(
      actual.quantity,
      expected.quantity,
    ),
    `Die Menge der Lexware-Position ${position} stimmt überein.`,
    expected.quantity,
    actual.quantity,
  );

  pushCheck(
    checks,
    `${prefix}UnitNameMatches`,
    normalizeLineText(
      actual.unitName,
    ) ===
      normalizeLineText(
        expected.unitName,
      ),
    `Die Einheit der Lexware-Position ${position} stimmt überein.`,
    expected.unitName,
    actual.unitName,
  );

  pushCheck(
    checks,
    `${prefix}CurrencyMatches`,
    actual.unitPrice
      .currency ===
      expected.unitPrice
        .currency,
    `Die Währung der Lexware-Position ${position} stimmt überein.`,
    expected.unitPrice
      .currency,
    actual.unitPrice
      .currency,
  );

  pushCheck(
    checks,
    `${prefix}GrossUnitPriceMatches`,
    moneyEquals(
      actual.unitPrice
        .grossAmount,
      expected.unitPrice
        .grossAmount,
    ),
    `Der Brutto-Einzelpreis der Lexware-Position ${position} stimmt überein.`,
    expected.unitPrice
      .grossAmount,
    actual.unitPrice
      .grossAmount,
  );

  pushCheck(
    checks,
    `${prefix}TaxRateMatches`,
    numberEquals(
      actual.unitPrice
        .taxRatePercentage,
      expected.unitPrice
        .taxRatePercentage,
    ),
    `Der Steuersatz der Lexware-Position ${position} stimmt überein.`,
    expected.unitPrice
      .taxRatePercentage,
    actual.unitPrice
      .taxRatePercentage,
  );

  pushCheck(
    checks,
    `${prefix}DiscountMatches`,
    numberEquals(
      actual.discountPercentage,
      expected.discountPercentage,
    ),
    `Der Positionsrabatt der Lexware-Position ${position} stimmt überein.`,
    expected.discountPercentage,
    actual.discountPercentage,
  );

  /*
   * Lexware kann Beschreibungen intern normalisieren.
   * Deshalb wird hier nur geprüft, dass eine erwartete
   * Beschreibung nicht vollständig verloren gegangen ist.
   */
  const expectedDescription =
    normalizeLineText(
      expected.description,
    );

  const actualDescription =
    normalizeLineText(
      actual.description,
    );

  pushCheck(
    checks,
    `${prefix}DescriptionPresent`,
    expectedDescription ===
      null ||
    actualDescription !==
      null,
    `Die erwartete Beschreibung der Lexware-Position ${position} ist vorhanden.`,
    expectedDescription,
    actualDescription,
  );
}

function buildComparisonChecks(
  invoice:
    LexwareInvoiceReadModel,

  expectedPayload:
    ReturnType<
      typeof buildLexwareInvoicePayload
    >,
) {
  const checks:
    ComparisonCheck[] =
      [];

  const payload =
    expectedPayload.payload;

  pushCheck(
    checks,
    "invoiceStatusIsDraft",
    invoice.voucherStatus ===
      "draft",
    "Die Lexware-Rechnung besitzt den Status draft.",
    "draft",
    invoice.voucherStatus,
  );

  pushCheck(
    checks,
    "invoiceIsNotArchived",
    invoice.archived ===
      false,
    "Der Lexware-Entwurf ist nicht archiviert.",
    false,
    invoice.archived,
  );

  pushCheck(
    checks,
    "invoiceTitleMatches",
    invoice.title ===
      payload.title,
    "Der Titel des Lexware-Entwurfs stimmt überein.",
    payload.title,
    invoice.title,
  );

  pushCheck(
    checks,
    "invoiceTaxTypeMatches",
    invoice.taxType ===
      payload.taxConditions
        .taxType,
    "Die Steuerberechnungsart des Lexware-Entwurfs stimmt überein.",
    payload.taxConditions
      .taxType,
    invoice.taxType,
  );

  pushCheck(
    checks,
    "invoiceCurrencyIsEur",
    invoice.totalPrice
      .currency ===
      "EUR",
    "Der Lexware-Entwurf verwendet EUR.",
    "EUR",
    invoice.totalPrice
      .currency,
  );

  pushCheck(
    checks,
    "invoiceShippingTypeMatches",
    invoice.shippingType ===
      payload.shippingConditions
        .shippingType,
    "Die Lieferbedingung des Lexware-Entwurfs stimmt überein.",
    payload.shippingConditions
      .shippingType,
    invoice.shippingType,
  );

  pushCheck(
    checks,
    "paymentTermLabelMatches",
    normalizeLineText(
      invoice.paymentTermLabel,
    ) ===
      normalizeLineText(
        payload.paymentConditions
          .paymentTermLabel,
      ),
    "Die Zahlungsbedingung des Lexware-Entwurfs stimmt überein.",
    payload.paymentConditions
      .paymentTermLabel,
    invoice.paymentTermLabel,
  );

  pushCheck(
    checks,
    "lineItemCountMatches",
    invoice.lineItems.length ===
      payload.lineItems.length,
    "Die Positionsanzahl des Lexware-Entwurfs stimmt überein.",
    payload.lineItems.length,
    invoice.lineItems.length,
  );

  const comparableLineCount =
    Math.min(
      invoice.lineItems.length,
      payload.lineItems.length,
    );

  for (
    let index =
      0;
    index <
      comparableLineCount;
    index +=
      1
  ) {
    compareLineItem(
      payload.lineItems[
        index
      ],
      invoice.lineItems[
        index
      ],
      index,
      checks,
    );
  }

  pushCheck(
    checks,
    "totalGrossMatches",
    moneyEquals(
      invoice.totalPrice
        .totalGrossAmount,
      expectedPayload.expected
        .totalGrossAmount,
    ),
    "Der Lexware-Gesamtbruttobetrag stimmt mit dem lokalen Steuer-Snapshot überein.",
    expectedPayload.expected
      .totalGrossAmount,
    invoice.totalPrice
      .totalGrossAmount,
  );

  pushCheck(
    checks,
    "totalNetMatches",
    moneyEquals(
      invoice.totalPrice
        .totalNetAmount,
      expectedPayload.expected
        .totalNetAmount,
    ),
    "Der Lexware-Gesamtnettobetrag stimmt mit dem lokalen Steuer-Snapshot überein.",
    expectedPayload.expected
      .totalNetAmount,
    invoice.totalPrice
      .totalNetAmount,
  );

  pushCheck(
    checks,
    "totalTaxMatches",
    moneyEquals(
      invoice.totalPrice
        .totalTaxAmount,
      expectedPayload.expected
        .totalTaxAmount,
    ),
    "Der Lexware-Gesamtsteuerbetrag stimmt mit dem lokalen Steuer-Snapshot überein.",
    expectedPayload.expected
      .totalTaxAmount,
    invoice.totalPrice
      .totalTaxAmount,
  );

  pushCheck(
    checks,
    "taxRowCountMatches",
    invoice.taxAmounts.length ===
      expectedPayload.expected
        .taxRates
        .length,
    "Die Anzahl der Steuerbereiche stimmt überein.",
    expectedPayload.expected
      .taxRates
      .length,
    invoice.taxAmounts
      .length,
  );

  for (
    const expectedTaxRate of
    expectedPayload.expected
      .taxRates
  ) {
    const actualTaxRate =
      findTaxAmount(
        invoice,
        expectedTaxRate
          .taxRatePercentage,
      );

    const prefix =
      `taxRate${expectedTaxRate.taxRatePercentage}`;

    pushCheck(
      checks,
      `${prefix}Exists`,
      Boolean(
        actualTaxRate,
      ),
      `Der Steuerbereich ${expectedTaxRate.taxRatePercentage} % ist in Lexware vorhanden.`,
      expectedTaxRate
        .taxRatePercentage,
      actualTaxRate
        ?.taxRatePercentage ??
        null,
    );

    if (!actualTaxRate) {
      continue;
    }

    pushCheck(
      checks,
      `${prefix}NetMatches`,
      moneyEquals(
        actualTaxRate
          .netAmount,
        expectedTaxRate
          .netAmount,
      ),
      `Der Nettobetrag des Steuerbereichs ${expectedTaxRate.taxRatePercentage} % stimmt überein.`,
      expectedTaxRate
        .netAmount,
      actualTaxRate
        .netAmount,
    );

    pushCheck(
      checks,
      `${prefix}TaxMatches`,
      moneyEquals(
        actualTaxRate
          .taxAmount,
        expectedTaxRate
          .taxAmount,
      ),
      `Der Steuerbetrag des Steuerbereichs ${expectedTaxRate.taxRatePercentage} % stimmt überein.`,
      expectedTaxRate
        .taxAmount,
      actualTaxRate
        .taxAmount,
    );
  }

  return checks;
}

function getErrorPayload(
  error:
    unknown,
): VerificationFailure {
  if (
    error instanceof
      Error &&
    error.name ===
      "LexwareVerifyTestDraftRequestError"
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
        "LEXWARE_VERIFY_TEST_DRAFT_REQUEST_INVALID",

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
    error instanceof
      Error &&
    error.name ===
      "LexwareVerifyTestDraftDatabaseError"
  ) {
    return {
      kind:
        "database",

      code:
        "LEXWARE_VERIFY_TEST_DRAFT_DATABASE_ERROR",

      message:
        error.message,

      details:
        null,
    };
  }

  if (
    error instanceof
    LexwareInvoicePayloadError
  ) {
    return {
      kind:
        "payload_builder",

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
    LexwareInvoicePayloadValidationError
  ) {
    return {
      kind:
        "payload_validator",

      code:
        error.code,

      message:
        error.message,

      details: {
        version:
          error.validation
            .version,

        valid:
          error.validation
            .valid,

        failedCheckCount:
          error.validation
            .failedChecks
            .length,

        failedChecks:
          error.validation
            .failedChecks,

        calculated:
          error.validation
            .calculated,
      },
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
      "LEXWARE_VERIFY_TEST_DRAFT_FAILED",

    message:
      error instanceof Error
        ? error.message
        : "Der Lexware-Testentwurf konnte nicht geprüft werden.",

    details:
      null,
  };
}

function getFailureStatus(
  failure:
    VerificationFailure,
) {
  if (
    failure.kind ===
    "request"
  ) {
    return 400;
  }

  if (
    failure.kind ===
      "payload_builder" ||
    failure.kind ===
      "payload_validator"
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
        "LEXWARE_VERIFY_LOCAL_INVOICE_NUMBER_MISSING",
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
        "LEXWARE_VERIFY_INVOICE_ID_INVALID",
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

          version:
            ROUTE_VERSION,

          message:
            "Die Draft-Prüfung ist nur im deaktivierten Lexware-Testmodus ohne Produktionsschlüssel zulässig.",
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

    const buildResult =
      buildLexwareInvoicePayload({
        invoice:
          localInvoice,

        items:
          localItems,

        paymentTermDays:
          7,

        introduction:
          "Deine bestellten Schulmaterialien stellen wir Dir hiermit in Rechnung.",

        remark:
          "Vielen Dank für Deine Bestellung bei Handzettel-Schulen.de.",
      });

    const payloadValidation =
      requireValidLexwareInvoicePayload(
        buildResult,
      );

    lexwareRequestsPerformed +=
      1;

    const lexwareInvoice =
      await getLexwareInvoice(
        TEST_MODE,
        lexwareInvoiceId,
      );

    const expectedOrganizationId =
      normalizeUuid(
        environment.modes.test
          .organizationId,
      );

    const comparisonChecks =
      buildComparisonChecks(
        lexwareInvoice,
        buildResult,
      );

    pushCheck(
      comparisonChecks,
      "lexwareInvoiceIdMatches",
      lexwareInvoice.id ===
        lexwareInvoiceId,
      "Lexware hat exakt die angeforderte Rechnungs-ID geliefert.",
      lexwareInvoiceId,
      lexwareInvoice.id,
    );

    pushCheck(
      comparisonChecks,
      "lexwareOrganizationMatchesTestEnvironment",
      Boolean(
        expectedOrganizationId &&
        lexwareInvoice
          .organizationId ===
          expectedOrganizationId,
      ),
      "Die Lexware-Rechnung gehört zum konfigurierten Testmandanten.",
      expectedOrganizationId,
      lexwareInvoice
        .organizationId,
    );

    const failedChecks =
      comparisonChecks.filter(
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

          invoiceProvider:
            localInvoice
              .invoice_provider,

          taxSnapshotStatus:
            localInvoice
              .tax_snapshot_status,

          taxSnapshotVersion:
            localInvoice
              .tax_snapshot_version,

          itemCount:
            localItems.length,
        },

        payload: {
          builderVersion:
            buildResult.version,

          validatorVersion:
            payloadValidation.version,

          validatorPassed:
            payloadValidation.valid,

          expected:
            buildResult.expected,

          expectedLineItemCount:
            buildResult.payload
              .lineItems
              .length,
        },

        lexwareInvoice: {
          id:
            lexwareInvoice.id,

          organizationId:
            lexwareInvoice
              .organizationId,

          voucherNumber:
            lexwareInvoice
              .voucherNumber,

          voucherStatus:
            lexwareInvoice
              .voucherStatus,

          voucherDate:
            lexwareInvoice
              .voucherDate,

          title:
            lexwareInvoice.title,

          language:
            lexwareInvoice
              .language,

          archived:
            lexwareInvoice
              .archived,

          taxType:
            lexwareInvoice
              .taxType,

          shippingType:
            lexwareInvoice
              .shippingType,

          paymentTermLabel:
            lexwareInvoice
              .paymentTermLabel,

          lineItemCount:
            lexwareInvoice
              .lineItems
              .length,

          totalPrice:
            lexwareInvoice
              .totalPrice,

          taxAmounts:
            lexwareInvoice
              .taxAmounts,
        },

        checks: {
          checkCount:
            comparisonChecks.length,

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
      "lexware_verify_test_draft_failed",
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