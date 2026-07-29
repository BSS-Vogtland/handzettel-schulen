import "server-only";

/*
 * LEXWARE_INVOICE_READ_ONLY_CLIENT_V5
 *
 * Erlaubt sind ausschließlich:
 * - GET einer vorhandenen Lexware-Rechnung
 * - GET der vorhandenen finalen Lexware-PDF-Datei
 *
 * Keine Lexware-Schreiboperation.
 * Kein Mailversand.
 * Keine Datenbankoperation.
 */

import {
  lexwareGetJson,
} from "@/app/lib/lexware/lexwareClient";

import {
  requireLexwareConnectionConfiguration,
  type LexwareMode,
} from "@/app/lib/lexware/lexwareConfig";

export const LEXWARE_INVOICE_READ_CLIENT_VERSION =
  "lexware-invoice-read-client-v5" as const;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_PDF_BYTES = 20 * 1024 * 1024;

type JsonRecord = Record<string, unknown>;

export type LexwareInvoiceLineItem = {
  id: string | null;
  type: string | null;
  name: string | null;
  description: string | null;
  quantity: number | null;
  unitName: string | null;

  unitPrice: {
    currency: string | null;
    netAmount: number | null;
    grossAmount: number | null;
    taxRatePercentage: number | null;
  };

  discountPercentage: number | null;
  lineItemAmount: number | null;
};

export type LexwareInvoiceTaxAmount = {
  taxRatePercentage: number | null;
  taxAmount: number | null;
  netAmount: number | null;
};

export type LexwareInvoiceReadModel = {
  id: string;
  organizationId: string;

  language: string | null;
  archived: boolean | null;

  voucherStatus: string | null;
  voucherNumber: string | null;
  voucherDate: string | null;

  title: string | null;

  lineItems: LexwareInvoiceLineItem[];

  totalPrice: {
    currency: string | null;
    totalNetAmount: number | null;
    totalGrossAmount: number | null;
    totalTaxAmount: number | null;
  };

  taxAmounts: LexwareInvoiceTaxAmount[];

  taxType: string | null;
  shippingType: string | null;
  shippingDate: string | null;
  paymentTermLabel: string | null;
};

export type LexwareInvoicePdfDownload = {
  invoiceId: string;
  content: Buffer;
  byteLength: number;
  contentType: string | null;
  contentLengthHeader: number | null;
  contentDisposition: string | null;
  downloadedAt: string;
};

type LexwareInvoicePdfOptions = {
  timeoutMs?: number;
  maxBytes?: number;
};

type LexwareBinaryReadErrorInput = {
  code: string;
  message: string;
  mode: LexwareMode;
  resourcePath: string;
  httpStatus?: number | null;
  retryAfterSeconds?: number | null;
  originalCause?: unknown;
};

export class LexwareBinaryReadError extends Error {
  readonly code: string;
  readonly mode: LexwareMode;
  readonly resourcePath: string;
  readonly httpStatus: number | null;
  readonly retryAfterSeconds: number | null;
  readonly originalCause: unknown | null;

  constructor(
    input: LexwareBinaryReadErrorInput,
  ) {
    super(input.message);

    this.name = "LexwareBinaryReadError";
    this.code = input.code;
    this.mode = input.mode;
    this.resourcePath = input.resourcePath;
    this.httpStatus = input.httpStatus ?? null;
    this.retryAfterSeconds =
      input.retryAfterSeconds ?? null;
    this.originalCause =
      input.originalCause ?? null;
  }
}

function isRecord(
  value: unknown,
): value is JsonRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function cleanText(
  value: unknown,
) {
  const text = String(value ?? "").trim();

  return text.length > 0
    ? text
    : null;
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

  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function toBooleanOrNull(
  value: unknown,
) {
  return typeof value === "boolean"
    ? value
    : null;
}

function requireUuid(
  value: unknown,
  label: string,
) {
  const normalized =
    cleanText(value)?.toLowerCase() ||
    null;

  if (
    !normalized ||
    !UUID_PATTERN.test(normalized)
  ) {
    throw new Error(
      `${label} besitzt kein gültiges UUID-Format.`,
    );
  }

  return normalized;
}

function normalizeLineItem(
  value: unknown,
): LexwareInvoiceLineItem {
  const row = isRecord(value)
    ? value
    : {};

  const unitPrice = isRecord(row.unitPrice)
    ? row.unitPrice
    : {};

  return {
    id: cleanText(row.id),
    type: cleanText(row.type),
    name: cleanText(row.name),
    description: cleanText(row.description),

    quantity:
      toNumberOrNull(row.quantity),

    unitName:
      cleanText(row.unitName),

    unitPrice: {
      currency:
        cleanText(unitPrice.currency),

      netAmount:
        toNumberOrNull(
          unitPrice.netAmount,
        ),

      grossAmount:
        toNumberOrNull(
          unitPrice.grossAmount,
        ),

      taxRatePercentage:
        toNumberOrNull(
          unitPrice.taxRatePercentage,
        ),
    },

    discountPercentage:
      toNumberOrNull(
        row.discountPercentage,
      ),

    lineItemAmount:
      toNumberOrNull(
        row.lineItemAmount,
      ),
  };
}

function normalizeTaxAmount(
  value: unknown,
): LexwareInvoiceTaxAmount {
  const row = isRecord(value)
    ? value
    : {};

  return {
    taxRatePercentage:
      toNumberOrNull(
        row.taxRatePercentage,
      ),

    taxAmount:
      toNumberOrNull(
        row.taxAmount,
      ),

    netAmount:
      toNumberOrNull(
        row.netAmount,
      ),
  };
}

function normalizeInvoice(
  payload: unknown,
): LexwareInvoiceReadModel {
  if (!isRecord(payload)) {
    throw new Error(
      "Lexware hat kein gültiges Rechnungsobjekt geliefert.",
    );
  }

  const totalPrice =
    isRecord(payload.totalPrice)
      ? payload.totalPrice
      : {};

  const taxConditions =
    isRecord(payload.taxConditions)
      ? payload.taxConditions
      : {};

  const shippingConditions =
    isRecord(payload.shippingConditions)
      ? payload.shippingConditions
      : {};

  const paymentConditions =
    isRecord(payload.paymentConditions)
      ? payload.paymentConditions
      : {};

  return {
    id:
      requireUuid(
        payload.id,
        "Lexware-Rechnungs-ID",
      ),

    organizationId:
      requireUuid(
        payload.organizationId,
        "Lexware-Organization-ID",
      ),

    language:
      cleanText(
        payload.language,
      )?.toLowerCase() ||
      null,

    archived:
      toBooleanOrNull(
        payload.archived,
      ),

    voucherStatus:
      cleanText(
        payload.voucherStatus,
      )?.toLowerCase() ||
      null,

    voucherNumber:
      cleanText(
        payload.voucherNumber,
      ),

    voucherDate:
      cleanText(
        payload.voucherDate,
      ),

    title:
      cleanText(
        payload.title,
      ),

    lineItems:
      Array.isArray(payload.lineItems)
        ? payload.lineItems.map(
            normalizeLineItem,
          )
        : [],

    totalPrice: {
      currency:
        cleanText(
          totalPrice.currency,
        ),

      totalNetAmount:
        toNumberOrNull(
          totalPrice.totalNetAmount,
        ),

      totalGrossAmount:
        toNumberOrNull(
          totalPrice.totalGrossAmount,
        ),

      totalTaxAmount:
        toNumberOrNull(
          totalPrice.totalTaxAmount,
        ),
    },

    taxAmounts:
      Array.isArray(payload.taxAmounts)
        ? payload.taxAmounts.map(
            normalizeTaxAmount,
          )
        : [],

    taxType:
      cleanText(
        taxConditions.taxType,
      )?.toLowerCase() ||
      null,

    shippingType:
      cleanText(
        shippingConditions.shippingType,
      )?.toLowerCase() ||
      null,

    shippingDate:
      cleanText(
        shippingConditions.shippingDate,
      ),

    paymentTermLabel:
      cleanText(
        paymentConditions.paymentTermLabel,
      ),
  };
}

function normalizeTimeoutMs(
  value: unknown,
) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return DEFAULT_TIMEOUT_MS;
  }

  return Math.max(
    1_000,
    Math.min(
      30_000,
      Math.trunc(parsed),
    ),
  );
}

function normalizeMaxBytes(
  value: unknown,
) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return DEFAULT_MAX_PDF_BYTES;
  }

  return Math.max(
    1_024,
    Math.min(
      50 * 1024 * 1024,
      Math.trunc(parsed),
    ),
  );
}

function parseContentLength(
  value: string | null,
) {
  if (!value) {
    return null;
  }

  const parsed = Number(value);

  if (
    !Number.isFinite(parsed) ||
    parsed < 0
  ) {
    return null;
  }

  return Math.trunc(parsed);
}

function parseRetryAfterSeconds(
  value: string | null,
) {
  if (!value) {
    return null;
  }

  const numericValue = Number(value);

  if (
    Number.isFinite(numericValue) &&
    numericValue >= 0
  ) {
    return Math.ceil(numericValue);
  }

  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return Math.max(
    0,
    Math.ceil(
      (
        timestamp -
        Date.now()
      ) / 1_000,
    ),
  );
}

function extractErrorMessage(
  responseText: string,
  fallback: string,
) {
  const trimmed = responseText.trim();

  if (!trimmed) {
    return fallback;
  }

  try {
    const payload =
      JSON.parse(trimmed) as unknown;

    if (isRecord(payload)) {
      const candidates = [
        payload.message,
        payload.error,
        payload.title,
        payload.detail,
        payload.error_description,
      ];

      for (const candidate of candidates) {
        const text = cleanText(candidate);

        if (text) {
          return text.slice(0, 600);
        }
      }
    }
  } catch {
    return trimmed.slice(0, 600);
  }

  return fallback;
}

export async function getLexwareInvoice(
  mode: LexwareMode,
  invoiceIdInput: string,
): Promise<LexwareInvoiceReadModel> {
  const invoiceId =
    requireUuid(
      invoiceIdInput,
      "Angeforderte Rechnungs-ID",
    );

  const payload =
    await lexwareGetJson<unknown>(
      mode,
      `/v1/invoices/${invoiceId}`,
    );

  const invoice =
    normalizeInvoice(payload);

  if (invoice.id !== invoiceId) {
    throw new Error(
      "Lexware hat eine andere Rechnungs-ID als angefordert geliefert.",
    );
  }

  return invoice;
}

export async function getLexwareInvoicePdf(
  mode: LexwareMode,
  invoiceIdInput: string,
  options: LexwareInvoicePdfOptions = {},
): Promise<LexwareInvoicePdfDownload> {
  const invoiceId =
    requireUuid(
      invoiceIdInput,
      "PDF-Rechnungs-ID",
    );

  const configuration =
    requireLexwareConnectionConfiguration(
      mode,
    );

  const resourcePath =
    `/v1/invoices/${invoiceId}/file`;

  const timeoutMs =
    normalizeTimeoutMs(
      options.timeoutMs,
    );

  const maxBytes =
    normalizeMaxBytes(
      options.maxBytes,
    );

  const controller =
    new AbortController();

  const timeout = setTimeout(
    () => {
      controller.abort();
    },
    timeoutMs,
  );

  let response: Response;

  try {
    /*
     * LEXWARE_INVOICE_READ_ONLY_CLIENT_V5
     *
     * Ausschließlich HTTP GET.
     */
    response = await fetch(
      `${configuration.apiBaseUrl}${resourcePath}`,
      {
        method: "GET",

        headers: {
          Authorization:
            `Bearer ${configuration.apiKey}`,

          Accept:
            "application/pdf",
        },

        cache:
          "no-store",

        signal:
          controller.signal,
      },
    );
  } catch (error) {
    const timedOut =
      error instanceof Error &&
      error.name === "AbortError";

    throw new LexwareBinaryReadError({
      code:
        timedOut
          ? "LEXWARE_PDF_REQUEST_TIMEOUT"
          : "LEXWARE_PDF_NETWORK_ERROR",

      message:
        timedOut
          ? `Lexware hat das PDF nicht innerhalb von ${timeoutMs} ms geliefert.`
          : "Die Verbindung zum Lexware-PDF-Endpunkt ist fehlgeschlagen.",

      mode,
      resourcePath,
      originalCause: error,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const responseText =
      await response
        .text()
        .catch(() => "");

    const fallbackMessage =
      response.status === 401
        ? "Lexware hat den API-Schlüssel beim PDF-Abruf abgelehnt."
        : response.status === 403
          ? "Der Lexware-Schlüssel besitzt keine Berechtigung zum PDF-Abruf."
          : response.status === 404
            ? "Die Lexware-Rechnung oder ihre PDF-Datei wurde nicht gefunden."
            : response.status === 409
              ? "Für diese Lexware-Rechnung steht noch keine finale PDF-Datei bereit."
              : response.status === 429
                ? "Das Lexware-Rate-Limit wurde beim PDF-Abruf erreicht."
                : `Lexware antwortete beim PDF-Abruf mit HTTP ${response.status}.`;

    throw new LexwareBinaryReadError({
      code:
        response.status === 429
          ? "LEXWARE_PDF_RATE_LIMITED"
          : "LEXWARE_PDF_HTTP_ERROR",

      message:
        extractErrorMessage(
          responseText,
          fallbackMessage,
        ),

      mode,
      resourcePath,

      httpStatus:
        response.status,

      retryAfterSeconds:
        parseRetryAfterSeconds(
          response.headers.get(
            "retry-after",
          ),
        ),
    });
  }

  const contentLengthHeader =
    parseContentLength(
      response.headers.get(
        "content-length",
      ),
    );

  if (
    contentLengthHeader !== null &&
    contentLengthHeader > maxBytes
  ) {
    if (response.body) {
      try {
        await response.body.cancel();
      } catch {
        // Best-Effort-Abbruch.
      }
    }

    throw new LexwareBinaryReadError({
      code:
        "LEXWARE_PDF_TOO_LARGE",

      message:
        `Das Lexware-PDF überschreitet mit ${contentLengthHeader} Bytes das erlaubte Limit von ${maxBytes} Bytes.`,

      mode,
      resourcePath,
      httpStatus: response.status,
    });
  }

  const content = Buffer.from(
    await response.arrayBuffer(),
  );

  if (content.byteLength > maxBytes) {
    throw new LexwareBinaryReadError({
      code:
        "LEXWARE_PDF_TOO_LARGE",

      message:
        `Das geladene Lexware-PDF überschreitet mit ${content.byteLength} Bytes das erlaubte Limit von ${maxBytes} Bytes.`,

      mode,
      resourcePath,
      httpStatus: response.status,
    });
  }

  return {
    invoiceId,
    content,

    byteLength:
      content.byteLength,

    contentType:
      cleanText(
        response.headers.get(
          "content-type",
        ),
      ),

    contentLengthHeader,

    contentDisposition:
      cleanText(
        response.headers.get(
          "content-disposition",
        ),
      ),

    downloadedAt:
      new Date().toISOString(),
  };
}