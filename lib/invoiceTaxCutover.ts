/*
 * INVOICE_TAX_CUTOVER_V1
 *
 * Zentrale, reine Entscheidung für:
 *
 * - Steuer-Snapshot-Version
 * - Rechnungsprovider
 *
 * Harte Regel:
 *
 * Vor dem konfigurierten Cutover-Zeitpunkt:
 *
 * - invoice-tax-snapshot-v1
 * - legacy_internal
 *
 * Ab dem Cutover-Zeitpunkt:
 *
 * - invoice-tax-snapshot-v2
 * - lexware
 *
 * Diese Datei:
 *
 * - liest keine Umgebungsvariablen,
 * - greift nicht auf Supabase zu,
 * - greift nicht auf Lexware zu,
 * - schreibt keine Daten,
 * - versendet keine E-Mail.
 */

export const INVOICE_TAX_CUTOVER_VERSION =
  "invoice-tax-cutover-v1" as const;

export const EXPECTED_INVOICE_CUTOVER_VERSION =
  "invoice-cutover-2026-08-01-v1" as const;

export const EXPECTED_INVOICE_CUTOVER_AT =
  "2026-07-31T22:00:00.000Z" as const;

export const EXPECTED_INVOICE_TIMEZONE =
  "Europe/Berlin" as const;

export type InvoiceTaxSnapshotVersion =
  | "invoice-tax-snapshot-v1"
  | "invoice-tax-snapshot-v2";

export type InvoiceProvider =
  | "legacy_internal"
  | "lexware";

export type ResolveInvoiceTaxCutoverInput = {
  /*
   * Aktueller Serverzeitpunkt.
   *
   * Im produktiven Checkout muss ausdrücklich
   * ein einmal erzeugter Zeitpunkt übergeben werden,
   * damit alle Entscheidungen derselben Anfrage
   * auf exakt demselben Zeitpunkt beruhen.
   */
  now:
    | string
    | Date;

  invoiceCutoverAt:
    string;

  timezoneName:
    string;

  invoiceProviderBefore:
    string;

  invoiceProviderAfter:
    string;

  invoiceCutoverVersion:
    string;
};

export type InvoiceTaxCutoverResult = {
  version:
    typeof INVOICE_TAX_CUTOVER_VERSION;

  now:
    string;

  cutoverAt:
    string;

  timezoneName:
    typeof EXPECTED_INVOICE_TIMEZONE;

  cutoverVersion:
    typeof EXPECTED_INVOICE_CUTOVER_VERSION;

  cutoverReached:
    boolean;

  millisecondsUntilCutover:
    number;

  selectedTaxSnapshotVersion:
    InvoiceTaxSnapshotVersion;

  selectedInvoiceProvider:
    InvoiceProvider;

  beforeCutover: {
    taxSnapshotVersion:
      "invoice-tax-snapshot-v1";

    invoiceProvider:
      "legacy_internal";
  };

  afterCutover: {
    taxSnapshotVersion:
      "invoice-tax-snapshot-v2";

    invoiceProvider:
      "lexware";
  };
};

export class InvoiceTaxCutoverError
  extends Error {
  readonly code:
    string;

  readonly details:
    Record<string, unknown> | null;

  constructor(
    code: string,
    message: string,
    details?:
      Record<string, unknown>,
  ) {
    super(message);

    this.name =
      "InvoiceTaxCutoverError";

    this.code =
      code;

    this.details =
      details ??
      null;
  }
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

function normalizeDate(
  value:
    string |
    Date,

  label:
    string,
) {
  const timestamp =
    value instanceof Date
      ? value.getTime()
      : Date.parse(value);

  if (
    !Number.isFinite(
      timestamp,
    )
  ) {
    throw new InvoiceTaxCutoverError(
      "CUTOVER_DATE_INVALID",
      `${label} ist kein gültiger Zeitpunkt.`,
      {
        label,

        value:
          value instanceof Date
            ? value.toString()
            : value,
      },
    );
  }

  return {
    timestamp,

    iso:
      new Date(
        timestamp,
      ).toISOString(),
  };
}

function requireExactConfiguration(
  input:
    ResolveInvoiceTaxCutoverInput,
) {
  const timezoneName =
    cleanText(
      input.timezoneName,
    );

  const invoiceProviderBefore =
    cleanText(
      input.invoiceProviderBefore,
    );

  const invoiceProviderAfter =
    cleanText(
      input.invoiceProviderAfter,
    );

  const invoiceCutoverVersion =
    cleanText(
      input.invoiceCutoverVersion,
    );

  const normalizedCutover =
    normalizeDate(
      input.invoiceCutoverAt,
      "invoiceCutoverAt",
    );

  const expectedCutoverTimestamp =
    Date.parse(
      EXPECTED_INVOICE_CUTOVER_AT,
    );

  const checks = {
    timezoneMatches:
      timezoneName ===
      EXPECTED_INVOICE_TIMEZONE,

    providerBeforeMatches:
      invoiceProviderBefore ===
      "legacy_internal",

    providerAfterMatches:
      invoiceProviderAfter ===
      "lexware",

    cutoverVersionMatches:
      invoiceCutoverVersion ===
      EXPECTED_INVOICE_CUTOVER_VERSION,

    cutoverTimestampMatches:
      normalizedCutover.timestamp ===
      expectedCutoverTimestamp,
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

  if (
    failedChecks.length >
    0
  ) {
    throw new InvoiceTaxCutoverError(
      "CUTOVER_CONFIGURATION_MISMATCH",
      "Die Rechnungs-Cutover-Konfiguration entspricht nicht dem verbindlichen Stichtag 01.08.2026, 00:00 Uhr Europe/Berlin.",
      {
        failedChecks,

        expected: {
          timezoneName:
            EXPECTED_INVOICE_TIMEZONE,

          invoiceProviderBefore:
            "legacy_internal",

          invoiceProviderAfter:
            "lexware",

          invoiceCutoverVersion:
            EXPECTED_INVOICE_CUTOVER_VERSION,

          invoiceCutoverAt:
            EXPECTED_INVOICE_CUTOVER_AT,
        },

        received: {
          timezoneName,

          invoiceProviderBefore,

          invoiceProviderAfter,

          invoiceCutoverVersion,

          invoiceCutoverAt:
            normalizedCutover.iso,
        },
      },
    );
  }

  return {
    timezoneName:
      EXPECTED_INVOICE_TIMEZONE,

    invoiceProviderBefore:
      "legacy_internal" as const,

    invoiceProviderAfter:
      "lexware" as const,

    invoiceCutoverVersion:
      EXPECTED_INVOICE_CUTOVER_VERSION,

    cutoverAt:
      EXPECTED_INVOICE_CUTOVER_AT,

    cutoverTimestamp:
      expectedCutoverTimestamp,
  };
}

export function resolveInvoiceTaxCutover(
  input:
    ResolveInvoiceTaxCutoverInput,
): InvoiceTaxCutoverResult {
  if (
    typeof input !==
      "object" ||
    input ===
      null ||
    Array.isArray(
      input,
    )
  ) {
    throw new InvoiceTaxCutoverError(
      "CUTOVER_INPUT_INVALID",
      "Die Cutover-Eingabe besitzt kein gültiges Objektformat.",
    );
  }

  const configuration =
    requireExactConfiguration(
      input,
    );

  const normalizedNow =
    normalizeDate(
      input.now,
      "now",
    );

  const cutoverReached =
    normalizedNow.timestamp >=
    configuration
      .cutoverTimestamp;

  const millisecondsUntilCutover =
    Math.max(
      0,
      configuration
        .cutoverTimestamp -
      normalizedNow.timestamp,
    );

  return {
    version:
      INVOICE_TAX_CUTOVER_VERSION,

    now:
      normalizedNow.iso,

    cutoverAt:
      configuration
        .cutoverAt,

    timezoneName:
      configuration
        .timezoneName,

    cutoverVersion:
      configuration
        .invoiceCutoverVersion,

    cutoverReached,

    millisecondsUntilCutover,

    selectedTaxSnapshotVersion:
      cutoverReached
        ? "invoice-tax-snapshot-v2"
        : "invoice-tax-snapshot-v1",

    selectedInvoiceProvider:
      cutoverReached
        ? "lexware"
        : "legacy_internal",

    beforeCutover: {
      taxSnapshotVersion:
        "invoice-tax-snapshot-v1",

      invoiceProvider:
        "legacy_internal",
    },

    afterCutover: {
      taxSnapshotVersion:
        "invoice-tax-snapshot-v2",

      invoiceProvider:
        "lexware",
    },
  };
}