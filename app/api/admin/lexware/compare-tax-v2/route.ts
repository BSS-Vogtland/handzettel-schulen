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
  buildLexwareInvoicePayload,
  LexwareInvoicePayloadError,
  type LocalLexwareInvoiceItemSnapshot,
  type LocalLexwareInvoiceSnapshot,
} from "@/app/lib/lexware/lexwareInvoicePayloadBuilder";

import {
  LexwareInvoicePayloadValidationError,
  requireValidLexwareInvoicePayload,
} from "@/app/lib/lexware/lexwareInvoicePayloadValidator";

import {
  InvoiceTaxV2AllocatorError,
  allocateInvoiceTaxV2,
  type InvoiceTaxV2AllocationInput,
  type SupportedInvoiceTaxRateV2,
} from "@/lib/tax-v2";

import {
  supabaseServer,
} from "@/lib/supabase/server";

/*
 * LEXWARE_COMPARE_TAX_V2_READ_ONLY_V1
 *
 * Diese Route:
 *
 * - lädt einen bestehenden lokalen Rechnungssnapshot,
 * - baut daraus den bereits validierten Lexware-Payload,
 * - liest den vorhandenen Lexware-Testentwurf,
 * - berechnet aus denselben Brutto-Positionen den V2-Steuersnapshot,
 * - vergleicht V1, V2 und Lexware centgenau,
 * - führt keine Datenbank-Schreiboperation aus,
 * - führt keinen Lexware-Write aus,
 * - erzeugt keine Rechnung,
 * - lädt kein PDF,
 * - versendet keine E-Mail.
 */

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

const ROUTE_VERSION =
  "lexware-compare-tax-v2-read-only-v1";

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
  | "payload_builder"
  | "payload_validator"
  | "tax_v2"
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

function centsToDecimalString(
  cents: number,
) {
  const negative =
    cents < 0;

  const absolute =
    Math.abs(
      cents,
    );

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
      code?:
        string;

      details?:
        Record<string, unknown>;
    };

  error.name =
    "LexwareCompareTaxV2RequestError";

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

function requireSupportedTaxRate(
  value: unknown,
  position: number,
): SupportedInvoiceTaxRateV2 {
  const parsed =
    Number(value);

  if (
    parsed !== 7 &&
    parsed !== 19
  ) {
    throw new InvoiceTaxV2AllocatorError(
      "PAYLOAD_TAX_RATE_NOT_SUPPORTED",
      `Die Lexware-Payload-Position ${position} besitzt keinen unterstützten Steuersatz.`,
      {
        position,

        receivedTaxRate:
          value,
      },
    );
  }

  return parsed;
}

function buildV2InputsFromPayload(
  payload:
    ReturnType<
      typeof buildLexwareInvoicePayload
    >["payload"],
): InvoiceTaxV2AllocationInput[] {
  return payload.lineItems.map(
    (
      lineItem,
      index,
    ) => {
      const position =
        index + 1;

      const unitGrossCents =
        amountToCents(
          lineItem.unitPrice
            .grossAmount,
        );

      const quantity =
        Number(
          lineItem.quantity,
        );

      if (
        unitGrossCents ===
          null ||
        !Number.isFinite(
          quantity,
        ) ||
        quantity <=
          0
      ) {
        throw new InvoiceTaxV2AllocatorError(
          "PAYLOAD_LINE_AMOUNT_INVALID",
          `Die Lexware-Payload-Position ${position} besitzt keinen gültigen Bruttobetrag oder keine gültige Menge.`,
          {
            position,

            quantity:
              lineItem.quantity,

            grossUnitAmount:
              lineItem.unitPrice
                .grossAmount,
          },
        );
      }

      const grossCents =
        Math.round(
          unitGrossCents *
          quantity,
        );

      const taxRatePercentage =
        requireSupportedTaxRate(
          lineItem.unitPrice
            .taxRatePercentage,
          position,
        );

      return {
        key:
          `payload-line:${position}`,

        kind:
          grossCents < 0
            ? "discount"
            : "other",

        taxRatePercentage,

        grossAmount:
          centsToDecimalString(
            grossCents,
          ),

        metadata: {
          position,

          name:
            lineItem.name,

          quantity:
            lineItem.quantity,

          grossUnitAmount:
            lineItem.unitPrice
              .grossAmount,
        },
      };
    },
  );
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
      "LexwareCompareTaxV2DatabaseError";

    throw error;
  }

  if (!invoiceData) {
    const error =
      new Error(
        `Die lokale Rechnung ${invoiceNumber} wurde nicht gefunden.`,
      );

    error.name =
      "LexwareCompareTaxV2DatabaseError";

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
      "LexwareCompareTaxV2DatabaseError";

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
      "LexwareCompareTaxV2DatabaseError";

    throw error;
  }

  return {
    invoice,
    items,
  };
}

function findV1TaxRate(
  buildResult:
    ReturnType<
      typeof buildLexwareInvoicePayload
    >,

  taxRatePercentage:
    number,
) {
  return (
    buildResult.expected
      .taxRates
      .find(
        (entry) =>
          numberEquals(
            entry.taxRatePercentage,
            taxRatePercentage,
          ),
      ) ||
    null
  );
}

function findV2TaxRate(
  allocation:
    ReturnType<
      typeof allocateInvoiceTaxV2
    >,

  taxRatePercentage:
    number,
) {
  return (
    allocation.rates.find(
      (entry) =>
        numberEquals(
          entry.taxRatePercentage,
          taxRatePercentage,
        ),
    ) ||
    null
  );
}

function findLexwareTaxRate(
  taxAmounts:
    Array<{
      taxRatePercentage:
        number | null;

      taxAmount:
        number | null;

      netAmount:
        number | null;
    }>,

  taxRatePercentage:
    number,
) {
  return (
    taxAmounts.find(
      (entry) =>
        entry.taxRatePercentage !==
          null &&
        numberEquals(
          entry.taxRatePercentage,
          taxRatePercentage,
        ),
    ) ||
    null
  );
}

function buildComparisonChecks(
  buildResult:
    ReturnType<
      typeof buildLexwareInvoicePayload
    >,

  v2Allocation:
    ReturnType<
      typeof allocateInvoiceTaxV2
    >,

  lexwareInvoice:
    Awaited<
      ReturnType<
        typeof getLexwareInvoice
      >
    >,
) {
  const checks:
    ComparisonCheck[] =
      [];

  pushCheck(
    checks,
    "v2GrossMatchesV1",
    moneyEquals(
      v2Allocation.total
        .grossAmount,
      buildResult.expected
        .totalGrossAmount,
    ),
    "Der V2-Gesamtbruttobetrag stimmt mit V1 überein.",
    buildResult.expected
      .totalGrossAmount,
    v2Allocation.total
      .grossAmount,
  );

  pushCheck(
    checks,
    "v2GrossMatchesLexware",
    moneyEquals(
      v2Allocation.total
        .grossAmount,
      lexwareInvoice
        .totalPrice
        .totalGrossAmount,
    ),
    "Der V2-Gesamtbruttobetrag stimmt mit Lexware überein.",
    lexwareInvoice
      .totalPrice
      .totalGrossAmount,
    v2Allocation.total
      .grossAmount,
  );

  pushCheck(
    checks,
    "v2NetMatchesLexware",
    moneyEquals(
      v2Allocation.total
        .netAmount,
      lexwareInvoice
        .totalPrice
        .totalNetAmount,
    ),
    "Der V2-Gesamtnettobetrag stimmt mit Lexware überein.",
    lexwareInvoice
      .totalPrice
      .totalNetAmount,
    v2Allocation.total
      .netAmount,
  );

  pushCheck(
    checks,
    "v2TaxMatchesLexware",
    moneyEquals(
      v2Allocation.total
        .taxAmount,
      lexwareInvoice
        .totalPrice
        .totalTaxAmount,
    ),
    "Der V2-Gesamtsteuerbetrag stimmt mit Lexware überein.",
    lexwareInvoice
      .totalPrice
      .totalTaxAmount,
    v2Allocation.total
      .taxAmount,
  );

  pushCheck(
    checks,
    "lineItemCountMatches",
    v2Allocation
      .diagnostics
      .entryCount ===
      lexwareInvoice
        .lineItems
        .length,
    "Die Anzahl der V2-Positionen stimmt mit Lexware überein.",
    lexwareInvoice
      .lineItems
      .length,
    v2Allocation
      .diagnostics
      .entryCount,
  );

  for (
    const taxRatePercentage of
    [
      7,
      19,
    ] as const
  ) {
    const v1Rate =
      findV1TaxRate(
        buildResult,
        taxRatePercentage,
      );

    const v2Rate =
      findV2TaxRate(
        v2Allocation,
        taxRatePercentage,
      );

    const lexwareRate =
      findLexwareTaxRate(
        lexwareInvoice
          .taxAmounts,
        taxRatePercentage,
      );

    const prefix =
      `taxRate${taxRatePercentage}`;

    pushCheck(
      checks,
      `${prefix}PresenceMatches`,
      Boolean(v2Rate) ===
        Boolean(lexwareRate),
      `Der V2-Steuerbereich ${taxRatePercentage} % besitzt dieselbe Existenz wie Lexware.`,
      Boolean(
        lexwareRate,
      ),
      Boolean(
        v2Rate,
      ),
    );

    if (
      !v2Rate ||
      !lexwareRate
    ) {
      continue;
    }

    pushCheck(
      checks,
      `${prefix}GrossMatchesV1`,
      Boolean(
        v1Rate &&
        moneyEquals(
          v2Rate.grossAmount,
          v1Rate.grossAmount,
        ),
      ),
      `Der V2-Bruttobetrag für ${taxRatePercentage} % stimmt mit V1 überein.`,
      v1Rate
        ?.grossAmount ??
        null,
      v2Rate.grossAmount,
    );

pushCheck(
  checks,
  `${prefix}NetMatchesLexware`,
  lexwareRate.netAmount !==
    null &&
  moneyEquals(
    v2Rate.netAmount,
    lexwareRate.netAmount,
  ),
  `Der V2-Nettobetrag für ${taxRatePercentage} % stimmt mit Lexware überein.`,
  lexwareRate.netAmount,
  v2Rate.netAmount,
);

    pushCheck(
  checks,
  `${prefix}TaxMatchesLexware`,
  lexwareRate.taxAmount !==
    null &&
  moneyEquals(
    v2Rate.taxAmount,
    lexwareRate.taxAmount,
  ),
  `Der V2-Steuerbetrag für ${taxRatePercentage} % stimmt mit Lexware überein.`,
  lexwareRate.taxAmount,
  v2Rate.taxAmount,
);
  }

  return checks;
}

function getErrorPayload(
  error:
    unknown,
): RouteFailure {
  if (
    error instanceof
      Error &&
    error.name ===
      "LexwareCompareTaxV2RequestError"
  ) {
    const typedError =
      error as Error & {
        code?:
          string;

        details?:
          Record<string, unknown>;
      };

    return {
      kind:
        "request",

      code:
        typedError.code ||
        "LEXWARE_COMPARE_TAX_V2_REQUEST_INVALID",

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
      "LexwareCompareTaxV2DatabaseError"
  ) {
    return {
      kind:
        "database",

      code:
        "LEXWARE_COMPARE_TAX_V2_DATABASE_ERROR",

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
    InvoiceTaxV2AllocatorError
  ) {
    return {
      kind:
        "tax_v2",

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
      "LEXWARE_COMPARE_TAX_V2_FAILED",

    message:
      error instanceof Error
        ? error.message
        : "Der Vergleich zwischen V1, V2 und Lexware ist fehlgeschlagen.",

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
      "payload_builder" ||
    failure.kind ===
      "payload_validator" ||
    failure.kind ===
      "tax_v2"
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
        "LEXWARE_COMPARE_LOCAL_INVOICE_NUMBER_MISSING",
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
        "LEXWARE_COMPARE_INVOICE_ID_INVALID",
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
            "Der V2-Vergleich ist nur im deaktivierten Lexware-Testmodus ohne Produktionsschlüssel zulässig.",
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

    const v2Inputs =
      buildV2InputsFromPayload(
        buildResult.payload,
      );

    const v2Allocation =
      allocateInvoiceTaxV2(
        v2Inputs,
      );

    lexwareRequestsPerformed +=
      1;

    const lexwareInvoice =
      await getLexwareInvoice(
        TEST_MODE,
        lexwareInvoiceId,
      );

    const checks =
      buildComparisonChecks(
        buildResult,
        v2Allocation,
        lexwareInvoice,
      );

    pushCheck(
      checks,
      "lexwareStatusIsDraft",
      lexwareInvoice
        .voucherStatus ===
        "draft",
      "Die verglichene Lexware-Rechnung besitzt den Status draft.",
      "draft",
      lexwareInvoice
        .voucherStatus,
    );

    pushCheck(
      checks,
      "lexwareInvoiceIdMatches",
      lexwareInvoice.id ===
        lexwareInvoiceId,
      "Lexware hat exakt die angeforderte Rechnung geliefert.",
      lexwareInvoiceId,
      lexwareInvoice.id,
    );

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

          invoiceProvider:
            localInvoice
              .invoice_provider,

          taxSnapshotVersion:
            localInvoice
              .tax_snapshot_version,

          taxSnapshotStatus:
            localInvoice
              .tax_snapshot_status,

          itemCount:
            localItems.length,
        },

        v1: {
          source:
            "local-immutable-tax-snapshot",

          version:
            buildResult.version,

          total: {
            grossAmount:
              buildResult.expected
                .totalGrossAmount,

            netAmount:
              buildResult.expected
                .totalNetAmount,

            taxAmount:
              buildResult.expected
                .totalTaxAmount,
          },

          rates:
            buildResult.expected
              .taxRates,
        },

        v2: {
          source:
            "lexware-compatible-rate-total-allocation",

          version:
            v2Allocation.version,

          total:
            v2Allocation.total,

          rates:
            v2Allocation.rates.map(
              (rate) => ({
                taxRatePercentage:
                  rate
                    .taxRatePercentage,

                entryCount:
                  rate.entryCount,

                grossAmount:
                  rate.grossAmount,

                netAmount:
                  rate.netAmount,

                taxAmount:
                  rate.taxAmount,

                roundingAdjustmentCents:
                  rate
                    .roundingAdjustmentCents,
              }),
            ),

          diagnostics:
            v2Allocation
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

          total:
            lexwareInvoice
              .totalPrice,

          taxAmounts:
            lexwareInvoice
              .taxAmounts,

          lineItemCount:
            lexwareInvoice
              .lineItems
              .length,
        },

        payloadValidation: {
          version:
            payloadValidation.version,

          valid:
            payloadValidation.valid,

          failedCheckCount:
            payloadValidation
              .failedChecks
              .length,
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
      "lexware_compare_tax_v2_failed",
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