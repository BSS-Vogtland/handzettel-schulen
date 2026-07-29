import {
  createHash,
} from "node:crypto";

import {
  NextResponse,
} from "next/server";

import {
  requireAdminApiSession,
} from "@/app/lib/adminApiAuth";

import {
  LexwareApiError,
} from "@/app/lib/lexware/lexwareClient";

import {
  LexwareBinaryReadError,
  getLexwareInvoice,
  getLexwareInvoicePdf,
  type LexwareInvoiceLineItem,
  type LexwareInvoiceReadModel,
  type LexwareInvoiceTaxAmount,
} from "@/app/lib/lexware/lexwareInvoiceReadClient";

import {
  LexwareConfigurationError,
  getLexwareRuntimeConfigurationSummary,
} from "@/app/lib/lexware/lexwareConfig";

import {
  supabaseServer,
} from "@/lib/supabase/server";

/*
 * LEXWARE_TEST_INVOICE_READ_ONLY_ROUTE_V5
 *
 * Ausschließlich:
 * - vorhandene Testrechnung lesen
 * - vorhandenes Lexware-Original-PDF lesen
 * - Rechnung, PDF und Datenbankzähler prüfen
 *
 * Keine Rechnungserstellung.
 * Keine Supabase-Schreiboperation.
 * Kein Mailversand.
 * Kein Zugriff auf den Produktionsmandanten.
 */

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

const ROUTE_VERSION =
  "lexware-test-invoice-read-only-v5";

const TEST_MODE =
  "test" as const;

const LEXWARE_REQUEST_DELAY_MS =
  650;

const MAX_PDF_BYTES =
  20 * 1024 * 1024;

const NO_STORE_HEADERS = {
  "Cache-Control":
    "no-store, no-cache, must-revalidate, max-age=0",
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RuntimeSettingsRow = {
  lexware_test_organization_id:
    | string
    | null;

  lexware_production_write_enabled:
    boolean;

  lexware_automatic_mail_enabled:
    boolean;

  lexware_outbox_schema_version:
    | string
    | null;
};

type OutboxCounts = {
  invoiceJobs: number;
  mailJobs: number;
  outboxEvents: number;
  legacyInvoices: number;
  lexwareInvoices: number;
};

type TestInvoiceFixture = {
  invoiceId: string;
  invoiceNumber: string;
  invoiceStatus:
    | "open"
    | "paid"
    | "voided";

  totalGrossAmount: number;
};

type ReadFailure = {
  kind:
    | "configuration"
    | "fixture"
    | "api"
    | "binary"
    | "unknown";

  code: string;
  message: string;

  httpStatus:
    | number
    | null;

  retryAfterSeconds:
    | number
    | null;
};

class LexwareTestFixtureError extends Error {
  readonly code: string;

  constructor(
    code: string,
    message: string,
  ) {
    super(message);

    this.name =
      "LexwareTestFixtureError";

    this.code =
      code;
  }
}

function cleanText(
  value: unknown,
) {
  const text =
    String(value ?? "").trim();

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

function toNumberOrNull(
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
    String(value)
      .trim()
      .replace(",", ".");

  const parsed =
    Number(normalized);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function moneyEquals(
  actual: unknown,
  expected: number,
) {
  const parsed =
    toNumberOrNull(actual);

  return (
    parsed !== null &&
    Math.abs(
      parsed -
      expected,
    ) < 0.005
  );
}

function sleep(
  milliseconds: number,
) {
  return new Promise<void>(
    (resolve) => {
      setTimeout(
        resolve,
        milliseconds,
      );
    },
  );
}

function requireEnvironmentValue(
  name: string,
) {
  const value =
    cleanText(
      process.env[name],
    );

  if (!value) {
    throw new LexwareTestFixtureError(
      "LEXWARE_TEST_FIXTURE_VALUE_MISSING",
      `${name} fehlt in der Laufzeitumgebung.`,
    );
  }

  return value;
}

function loadTestInvoiceFixture(): TestInvoiceFixture {
  const invoiceId =
    requireEnvironmentValue(
      "LEXWARE_TEST_INVOICE_LARGE_ID",
    ).toLowerCase();

  if (
    !UUID_PATTERN.test(
      invoiceId,
    )
  ) {
    throw new LexwareTestFixtureError(
      "LEXWARE_TEST_INVOICE_ID_INVALID",
      "LEXWARE_TEST_INVOICE_LARGE_ID besitzt kein gültiges UUID-Format.",
    );
  }

  const invoiceNumber =
    requireEnvironmentValue(
      "LEXWARE_TEST_INVOICE_LARGE_NUMBER",
    );

  const invoiceStatus =
    requireEnvironmentValue(
      "LEXWARE_TEST_INVOICE_LARGE_STATUS",
    ).toLowerCase();

  if (
    invoiceStatus !== "open" &&
    invoiceStatus !== "paid" &&
    invoiceStatus !== "voided"
  ) {
    throw new LexwareTestFixtureError(
      "LEXWARE_TEST_INVOICE_STATUS_INVALID",
      "LEXWARE_TEST_INVOICE_LARGE_STATUS muss open, paid oder voided sein.",
    );
  }

  const totalGrossAmount =
    toNumberOrNull(
      requireEnvironmentValue(
        "LEXWARE_TEST_INVOICE_LARGE_TOTAL_GROSS",
      ),
    );

  if (
    totalGrossAmount === null ||
    totalGrossAmount <= 0
  ) {
    throw new LexwareTestFixtureError(
      "LEXWARE_TEST_INVOICE_TOTAL_INVALID",
      "LEXWARE_TEST_INVOICE_LARGE_TOTAL_GROSS ist ungültig.",
    );
  }

  return {
    invoiceId,
    invoiceNumber,
    invoiceStatus,
    totalGrossAmount,
  };
}

async function loadRuntimeSettings() {
  const {
    data,
    error,
  } =
    await supabaseServer
      .from(
        "business_runtime_settings",
      )
      .select(
        [
          "lexware_test_organization_id",
          "lexware_production_write_enabled",
          "lexware_automatic_mail_enabled",
          "lexware_outbox_schema_version",
        ].join(", "),
      )
      .eq(
        "id",
        "default",
      )
      .maybeSingle();

  if (error) {
    throw new Error(
      "Lexware-Laufzeiteinstellungen konnten nicht geladen werden: " +
        error.message,
    );
  }

  if (!data) {
    throw new Error(
      "business_runtime_settings/default fehlt.",
    );
  }

  return data as unknown as
    RuntimeSettingsRow;
}

async function countRows(
  tableName: string,
  invoiceProvider?:
    | "legacy_internal"
    | "lexware",
) {
  const query =
    supabaseServer
      .from(tableName)
      .select(
        "id",
        {
          count:
            "exact",

          head:
            true,
        },
      );

  const result =
    invoiceProvider
      ? await query.eq(
          "invoice_provider",
          invoiceProvider,
        )
      : await query;

  if (result.error) {
    throw new Error(
      `${tableName} konnte nicht gezählt werden: ${result.error.message}`,
    );
  }

  return result.count || 0;
}

async function loadOutboxCounts(): Promise<OutboxCounts> {
  const [
    invoiceJobs,
    mailJobs,
    outboxEvents,
    legacyInvoices,
    lexwareInvoices,
  ] =
    await Promise.all([
      countRows(
        "school_lexware_invoice_jobs",
      ),

      countRows(
        "school_lexware_invoice_mail_jobs",
      ),

      countRows(
        "school_lexware_outbox_events",
      ),

      countRows(
        "school_request_invoices",
        "legacy_internal",
      ),

      countRows(
        "school_request_invoices",
        "lexware",
      ),
    ]);

  return {
    invoiceJobs,
    mailJobs,
    outboxEvents,
    legacyInvoices,
    lexwareInvoices,
  };
}

function countsAreEqual(
  before: OutboxCounts,
  after: OutboxCounts,
) {
  return (
    before.invoiceJobs ===
      after.invoiceJobs &&
    before.mailJobs ===
      after.mailJobs &&
    before.outboxEvents ===
      after.outboxEvents &&
    before.legacyInvoices ===
      after.legacyInvoices &&
    before.lexwareInvoices ===
      after.lexwareInvoices
  );
}

function findLineItem(
  invoice: LexwareInvoiceReadModel,
  expectedName: string,
): LexwareInvoiceLineItem | null {
  return (
    invoice.lineItems.find(
      (lineItem) =>
        lineItem.name ===
        expectedName,
    ) ||
    null
  );
}

function findTaxAmount(
  invoice: LexwareInvoiceReadModel,
  expectedTaxRate: number,
): LexwareInvoiceTaxAmount | null {
  return (
    invoice.taxAmounts.find(
      (taxAmount) =>
        moneyEquals(
          taxAmount
            .taxRatePercentage,
          expectedTaxRate,
        ),
    ) ||
    null
  );
}

function normalizeContentType(
  value: string | null,
) {
  return (
    cleanText(value)
      ?.split(";")[0]
      ?.trim()
      .toLowerCase() ||
    null
  );
}

function extractSuggestedFilename(
  contentDisposition:
    | string
    | null,
) {
  if (!contentDisposition) {
    return null;
  }

  const utf8Match =
    contentDisposition.match(
      /filename\*=UTF-8''([^;]+)/i,
    );

  if (utf8Match?.[1]) {
    const encodedFilename =
      utf8Match[1]
        .trim()
        .replace(
          /^"|"$/g,
          "",
        );

    try {
      return decodeURIComponent(
        encodedFilename,
      );
    } catch {
      return encodedFilename;
    }
  }

  const regularMatch =
    contentDisposition.match(
      /filename="?([^";]+)"?/i,
    );

  return (
    regularMatch?.[1]
      ?.trim() ||
    null
  );
}

function toReadFailure(
  error: unknown,
): ReadFailure {
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

      httpStatus:
        null,

      retryAfterSeconds:
        null,
    };
  }

  if (
    error instanceof
    LexwareTestFixtureError
  ) {
    return {
      kind:
        "fixture",

      code:
        error.code,

      message:
        error.message,

      httpStatus:
        null,

      retryAfterSeconds:
        null,
    };
  }

  if (
    error instanceof
    LexwareApiError
  ) {
    return {
      kind:
        "api",

      code:
        error.code,

      message:
        error.message,

      httpStatus:
        error.httpStatus,

      retryAfterSeconds:
        error.retryAfterSeconds,
    };
  }

  if (
    error instanceof
    LexwareBinaryReadError
  ) {
    return {
      kind:
        "binary",

      code:
        error.code,

      message:
        error.message,

      httpStatus:
        error.httpStatus,

      retryAfterSeconds:
        error.retryAfterSeconds,
    };
  }

  return {
    kind:
      "unknown",

    code:
      "LEXWARE_TEST_INVOICE_UNKNOWN_ERROR",

    message:
      error instanceof Error
        ? error.message
        : "Unbekannter Fehler beim read-only Rechnungstest.",

    httpStatus:
      null,

    retryAfterSeconds:
      null,
  };
}

function getFailureStatus(
  failure: ReadFailure,
) {
  if (
    failure.kind ===
      "configuration" ||
    failure.kind ===
      "fixture"
  ) {
    return 503;
  }

  if (
    failure.httpStatus !== null &&
    failure.httpStatus >= 400 &&
    failure.httpStatus < 600
  ) {
    return failure.httpStatus;
  }

  if (
    failure.kind === "api" ||
    failure.kind === "binary"
  ) {
    return 502;
  }

  return 500;
}

export async function GET() {
  const unauthorized =
    await requireAdminApiSession();

  if (unauthorized) {
    return unauthorized;
  }

  let lexwareRequestsPerformed =
    0;

  try {
    const environment =
      getLexwareRuntimeConfigurationSummary();

    /*
     * Fail closed:
     *
     * Diese Route darf nur laufen, solange
     * - der aktive Modus test ist,
     * - die Integration als Ganzes deaktiviert ist,
     * - der Testschlüssel vorhanden ist,
     * - kein Produktionsschlüssel vorhanden ist.
     */
    const testEnvironmentIsSafe =
      environment.activeMode ===
        "test" &&
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

    if (!testEnvironmentIsSafe) {
      return NextResponse.json(
        {
          ok:
            false,

          readOnly:
            true,

          writeOperationsPerformed:
            false,

          lexwareRequestsPerformed,

          version:
            ROUTE_VERSION,

          message:
            "Der Testrechnungs-Endpunkt ist nur im deaktivierten Lexware-Testmodus ohne Produktionsschlüssel zulässig.",

          environment: {
            activeMode:
              environment.activeMode,

            activeModeValid:
              environment.activeModeValid,

            integrationEnabled:
              environment.integrationEnabled,

            integrationFlagValid:
              environment.integrationFlagValid,

            apiBaseUrlValid:
              environment.apiBaseUrlValid,

            testApiKeyConfigured:
              environment.modes.test
                .apiKeyConfigured,

            testOrganizationValid:
              environment.modes.test
                .organizationIdValid,

            productionApiKeyConfigured:
              environment.modes
                .production
                .apiKeyConfigured,

            credentialSeparationSafe:
              environment
                .credentialSeparation
                .safe,
          },
        },
        {
          status:
            409,

          headers:
            NO_STORE_HEADERS,
        },
      );
    }

    const fixture =
      loadTestInvoiceFixture();

    const [
      runtimeSettings,
      countsBefore,
    ] =
      await Promise.all([
        loadRuntimeSettings(),
        loadOutboxCounts(),
      ]);

    const databaseOrganizationId =
      normalizeUuid(
        runtimeSettings
          .lexware_test_organization_id,
      );

    const environmentOrganizationId =
      normalizeUuid(
        environment.modes.test
          .organizationId,
      );

    if (
      !databaseOrganizationId ||
      !UUID_PATTERN.test(
        databaseOrganizationId,
      )
    ) {
      throw new LexwareTestFixtureError(
        "LEXWARE_TEST_DATABASE_ORGANIZATION_INVALID",
        "Die Lexware-Test-Organization-ID in der Datenbank fehlt oder ist ungültig.",
      );
    }

    if (
      !environmentOrganizationId ||
      !UUID_PATTERN.test(
        environmentOrganizationId,
      )
    ) {
      throw new LexwareTestFixtureError(
        "LEXWARE_TEST_ENVIRONMENT_ORGANIZATION_INVALID",
        "Die Lexware-Test-Organization-ID in der Laufzeitumgebung fehlt oder ist ungültig.",
      );
    }

    /*
     * Lexware-Aufruf 1 von 2:
     * vorhandene Testrechnung lesen.
     */
    lexwareRequestsPerformed +=
      1;

    const invoice =
      await getLexwareInvoice(
        TEST_MODE,
        fixture.invoiceId,
      );

    /*
     * Puffer zum Lexware-Rate-Limit.
     */
    await sleep(
      LEXWARE_REQUEST_DELAY_MS,
    );

    /*
     * Lexware-Aufruf 2 von 2:
     * vorhandenes Original-PDF lesen.
     */
    lexwareRequestsPerformed +=
      1;

    const pdf =
      await getLexwareInvoicePdf(
        TEST_MODE,
        fixture.invoiceId,
        {
          timeoutMs:
            20_000,

          maxBytes:
            MAX_PDF_BYTES,
        },
      );

    const countsAfter =
      await loadOutboxCounts();

    const bookLine =
      findLineItem(
        invoice,
        "Schulbuch-Testsortiment",
      );

    const materialLine =
      findLineItem(
        invoice,
        "Schulmaterial-Testsortiment",
      );

    const sevenPercentTax =
      findTaxAmount(
        invoice,
        7,
      );

    const nineteenPercentTax =
      findTaxAmount(
        invoice,
        19,
      );

    const normalizedPdfContentType =
      normalizeContentType(
        pdf.contentType,
      );

    const pdfSignature =
      pdf.content
        .subarray(
          0,
          5,
        )
        .toString(
          "ascii",
        );

    const pdfSha256 =
      createHash(
        "sha256",
      )
        .update(
          pdf.content,
        )
        .digest(
          "hex",
        );

    const checks = {
      activeModeIsTest:
        environment.activeMode ===
        "test",

      integrationEnvironmentFlagIsFalse:
        environment
          .integrationEnabled ===
        false,

      testApiKeyConfigured:
        environment.modes.test
          .apiKeyConfigured ===
        true,

      productionApiKeyNotConfigured:
        environment.modes
          .production
          .apiKeyConfigured ===
        false,

      credentialSeparationSafe:
        environment
          .credentialSeparation
          .safe ===
        true,

      productionWriteDisabledInDatabase:
        runtimeSettings
          .lexware_production_write_enabled ===
        false,

      automaticMailDisabledInDatabase:
        runtimeSettings
          .lexware_automatic_mail_enabled ===
        false,

      outboxSchemaVersionCorrect:
        runtimeSettings
          .lexware_outbox_schema_version ===
        "lexware-outbox-mail-v1",

      databaseAndEnvironmentOrganizationMatch:
        databaseOrganizationId ===
        environmentOrganizationId,

      invoiceIdMatches:
        invoice.id ===
        fixture.invoiceId,

      invoiceOrganizationMatchesDatabase:
        invoice.organizationId ===
        databaseOrganizationId,

      invoiceOrganizationMatchesEnvironment:
        invoice.organizationId ===
        environmentOrganizationId,

      invoiceNumberMatches:
        invoice.voucherNumber ===
        fixture.invoiceNumber,

      invoiceStatusMatches:
        invoice.voucherStatus ===
        fixture.invoiceStatus,

      invoiceStatusSupportsPdf:
        invoice.voucherStatus ===
          "open" ||
        invoice.voucherStatus ===
          "paid" ||
        invoice.voucherStatus ===
          "voided",

      invoiceIsNotArchived:
        invoice.archived ===
        false,

      invoiceLanguageIsGerman:
        invoice.language ===
        "de",

      invoiceTitleIsCorrect:
        invoice.title ===
        "Rechnung",

      invoiceTaxTypeIsGross:
        invoice.taxType ===
        "gross",

      invoiceShippingTypeIsDelivery:
        invoice.shippingType ===
        "delivery",

      invoiceCurrencyIsEur:
        invoice.totalPrice
          .currency ===
        "EUR",

      exactlyTwoLineItems:
        invoice.lineItems.length ===
        2,

      bookLineExists:
        Boolean(bookLine),

      bookLineQuantityCorrect:
        moneyEquals(
          bookLine?.quantity,
          10,
        ),

      bookLineGrossUnitPriceCorrect:
        moneyEquals(
          bookLine?.unitPrice
            .grossAmount,
          10.7,
        ),

      bookLineTaxRateCorrect:
        moneyEquals(
          bookLine?.unitPrice
            .taxRatePercentage,
          7,
        ),

      bookLineHasNoDiscount:
        moneyEquals(
          bookLine
            ?.discountPercentage,
          0,
        ),

      materialLineExists:
        Boolean(materialLine),

      materialLineQuantityCorrect:
        moneyEquals(
          materialLine?.quantity,
          20,
        ),

      materialLineGrossUnitPriceCorrect:
        moneyEquals(
          materialLine?.unitPrice
            .grossAmount,
          11.9,
        ),

      materialLineTaxRateCorrect:
        moneyEquals(
          materialLine?.unitPrice
            .taxRatePercentage,
          19,
        ),

      materialLineHasNoDiscount:
        moneyEquals(
          materialLine
            ?.discountPercentage,
          0,
        ),

      totalNetCorrect:
        moneyEquals(
          invoice.totalPrice
            .totalNetAmount,
          300,
        ),

      totalTaxCorrect:
        moneyEquals(
          invoice.totalPrice
            .totalTaxAmount,
          45,
        ),

      totalGrossCorrect:
        moneyEquals(
          invoice.totalPrice
            .totalGrossAmount,
          fixture
            .totalGrossAmount,
        ),

      exactlyTwoTaxRows:
        invoice.taxAmounts.length ===
        2,

      sevenPercentTaxRowExists:
        Boolean(
          sevenPercentTax,
        ),

      sevenPercentTaxNetCorrect:
        moneyEquals(
          sevenPercentTax
            ?.netAmount,
          100,
        ),

      sevenPercentTaxAmountCorrect:
        moneyEquals(
          sevenPercentTax
            ?.taxAmount,
          7,
        ),

      nineteenPercentTaxRowExists:
        Boolean(
          nineteenPercentTax,
        ),

      nineteenPercentTaxNetCorrect:
        moneyEquals(
          nineteenPercentTax
            ?.netAmount,
          200,
        ),

      nineteenPercentTaxAmountCorrect:
        moneyEquals(
          nineteenPercentTax
            ?.taxAmount,
          38,
        ),

      paymentTermLabelPresent:
        Boolean(
          cleanText(
            invoice
              .paymentTermLabel,
          ),
        ),

      pdfBelongsToRequestedInvoice:
        pdf.invoiceId ===
        fixture.invoiceId,

      pdfContentTypeIsPdf:
        normalizedPdfContentType ===
        "application/pdf",

      pdfSignatureIsCorrect:
        pdfSignature ===
        "%PDF-",

      pdfHasSubstantialContent:
        pdf.byteLength >
        1_000,

      pdfIsWithinSafetyLimit:
        pdf.byteLength <=
        MAX_PDF_BYTES,

      pdfContentLengthMatches:
        pdf.contentLengthHeader ===
          null ||
        pdf.contentLengthHeader ===
          pdf.byteLength,

      pdfSha256IsValid:
        /^[a-f0-9]{64}$/.test(
          pdfSha256,
        ),

      databaseCountsUnchanged:
        countsAreEqual(
          countsBefore,
          countsAfter,
        ),

      noInvoiceJobsCreated:
        countsAfter.invoiceJobs ===
        0,

      noMailJobsCreated:
        countsAfter.mailJobs ===
        0,

      noOutboxEventsCreated:
        countsAfter.outboxEvents ===
        0,

      noLocalLexwareInvoiceCreated:
        countsAfter.lexwareInvoices ===
        0,

      legacyInvoiceCountUnchanged:
        countsAfter.legacyInvoices ===
        countsBefore.legacyInvoices,
    };

    const failedChecks =
      Object.entries(
        checks,
      )
        .filter(
          (
            [
              ,
              passed,
            ],
          ) =>
            passed !== true,
        )
        .map(
          (
            [
              name,
            ],
          ) =>
            name,
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

        version:
          ROUTE_VERSION,

        checkedAt:
          new Date().toISOString(),

        fixture: {
          invoiceId:
            fixture.invoiceId,

          expectedInvoiceNumber:
            fixture.invoiceNumber,

          expectedInvoiceStatus:
            fixture.invoiceStatus,

          expectedTotalGrossAmount:
            fixture.totalGrossAmount,
        },

        invoice: {
          id:
            invoice.id,

          organizationId:
            invoice.organizationId,

          voucherNumber:
            invoice.voucherNumber,

          voucherStatus:
            invoice.voucherStatus,

          voucherDate:
            invoice.voucherDate,

          title:
            invoice.title,

          language:
            invoice.language,

          archived:
            invoice.archived,

          taxType:
            invoice.taxType,

          shippingType:
            invoice.shippingType,

          shippingDate:
            invoice.shippingDate,

          paymentTermLabel:
            invoice.paymentTermLabel,

          lineItemCount:
            invoice.lineItems.length,

          lineItems:
            invoice.lineItems.map(
              (lineItem) => ({
                name:
                  lineItem.name,

                quantity:
                  lineItem.quantity,

                unitName:
                  lineItem.unitName,

                currency:
                  lineItem.unitPrice
                    .currency,

                netUnitPrice:
                  lineItem.unitPrice
                    .netAmount,

                grossUnitPrice:
                  lineItem.unitPrice
                    .grossAmount,

                taxRatePercentage:
                  lineItem.unitPrice
                    .taxRatePercentage,

                discountPercentage:
                  lineItem
                    .discountPercentage,

                lineItemAmount:
                  lineItem
                    .lineItemAmount,
              }),
            ),

          totalPrice:
            invoice.totalPrice,

          taxAmounts:
            invoice.taxAmounts,
        },

        pdf: {
          contentType:
            pdf.contentType,

          normalizedContentType:
            normalizedPdfContentType,

          contentLengthHeader:
            pdf.contentLengthHeader,

          byteLength:
            pdf.byteLength,

          signature:
            pdfSignature,

          sha256:
            pdfSha256,

          contentDispositionPresent:
            Boolean(
              pdf.contentDisposition,
            ),

          suggestedFilename:
            extractSuggestedFilename(
              pdf.contentDisposition,
            ),

          downloadedAt:
            pdf.downloadedAt,
        },

        database: {
          countsBefore,
          countsAfter,
        },

        checks,
        failedChecks,
        allChecksPassed,
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
      toReadFailure(
        error,
      );

    console.error(
      "lexware_test_invoice_read_failed",
      {
        kind:
          failure.kind,

        code:
          failure.code,

        message:
          failure.message,

        httpStatus:
          failure.httpStatus,

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

      version:
        ROUTE_VERSION,

      message:
        "Dieser Endpunkt ist ausschließlich read-only und kann nur per GET verwendet werden.",
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