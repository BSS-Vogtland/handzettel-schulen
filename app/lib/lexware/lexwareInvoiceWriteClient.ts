import "server-only";

import {
  getLexwareRuntimeConfigurationSummary,
  requireLexwareConnectionConfiguration,
} from "@/app/lib/lexware/lexwareConfig";

import {
  type LexwareInvoiceCreatePayload,
} from "@/app/lib/lexware/lexwareInvoicePayloadBuilder";

/*
 * LEXWARE_TEST_INVOICE_WRITE_CLIENT_V1
 *
 * Strikt begrenzter Test-Write-Client.
 *
 * Erlaubt:
 * - POST /v1/invoices
 * - ausschließlich Testmandant
 * - ausschließlich Entwurf
 *
 * Nicht erlaubt:
 * - Produktionsmandant
 * - finalize=true
 * - automatischer Mailversand
 * - Supabase-Schreiboperationen
 * - stillschweigende oder automatische Aufrufe
 */

export const LEXWARE_TEST_INVOICE_WRITE_CLIENT_VERSION =
  "lexware-test-invoice-write-client-v1" as const;

export const LEXWARE_TEST_DRAFT_WRITE_CONFIRMATION =
  "LEXWARE_TEST_DRAFT_WRITE_V1" as const;

const TEST_MODE =
  "test" as const;

const DEFAULT_TIMEOUT_MS =
  20_000;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type JsonRecord =
  Record<string, unknown>;

export type CreateLexwareTestDraftInvoiceInput = {
  payload:
    LexwareInvoiceCreatePayload;

  /*
   * Muss exakt false sein.
   *
   * Der Testclient darf niemals unmittelbar
   * eine offene/finalisierte Rechnung erzeugen.
   */
  finalize: false;

  /*
   * Bewusste Aufrufbestätigung.
   *
   * Verhindert einen versehentlichen Funktionsaufruf
   * aus allgemeinen oder produktiven Codepfaden.
   */
  confirmation:
    typeof LEXWARE_TEST_DRAFT_WRITE_CONFIRMATION;

  timeoutMs?:
    number;
};

export type LexwareInvoiceCreateActionResult = {
  id: string;
  resourceUri: string;
  createdDate: string;
  updatedDate: string | null;
  version: number | null;
};

export type CreateLexwareTestDraftInvoiceResult = {
  version:
    typeof LEXWARE_TEST_INVOICE_WRITE_CLIENT_VERSION;

  mode:
    typeof TEST_MODE;

  finalize:
    false;

  request: {
    method:
      "POST";

    resourcePath:
      "/v1/invoices";

    organizationId:
      string;

    payload:
      LexwareInvoiceCreatePayload;
  };

  response:
    LexwareInvoiceCreateActionResult;

  createdAt:
    string;
};

type LexwareInvoiceWriteErrorInput = {
  code: string;
  message: string;

  resourcePath:
    string;

  httpStatus?:
    number | null;

  retryAfterSeconds?:
    number | null;

  responsePayload?:
    unknown;

  originalCause?:
    unknown;
};

export class LexwareInvoiceWriteError
  extends Error {
  readonly code:
    string;

  readonly mode:
    typeof TEST_MODE;

  readonly resourcePath:
    string;

  readonly httpStatus:
    number | null;

  readonly retryAfterSeconds:
    number | null;

  readonly responsePayload:
    unknown | null;

  readonly originalCause:
    unknown | null;

  constructor(
    input:
      LexwareInvoiceWriteErrorInput,
  ) {
    super(
      input.message,
    );

    this.name =
      "LexwareInvoiceWriteError";

    this.code =
      input.code;

    this.mode =
      TEST_MODE;

    this.resourcePath =
      input.resourcePath;

    this.httpStatus =
      input.httpStatus ??
      null;

    this.retryAfterSeconds =
      input.retryAfterSeconds ??
      null;

    this.responsePayload =
      input.responsePayload ??
      null;

    this.originalCause =
      input.originalCause ??
      null;
  }
}

function isRecord(
  value: unknown,
): value is JsonRecord {
  return (
    typeof value ===
      "object" &&
    value !==
      null &&
    !Array.isArray(
      value,
    )
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

  return text.length >
    0
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

  const parsed =
    Number(
      value,
    );

  return Number.isFinite(
    parsed,
  )
    ? parsed
    : null;
}

function normalizeTimeoutMs(
  value: unknown,
) {
  const parsed =
    Number(
      value,
    );

  if (
    !Number.isFinite(
      parsed,
    )
  ) {
    return DEFAULT_TIMEOUT_MS;
  }

  return Math.max(
    1_000,
    Math.min(
      30_000,
      Math.trunc(
        parsed,
      ),
    ),
  );
}

function parseResponsePayload(
  responseText:
    string,
) {
  if (
    !responseText.trim()
  ) {
    return null;
  }

  try {
    return JSON.parse(
      responseText,
    ) as unknown;
  } catch {
    return responseText;
  }
}

function parseRetryAfterSeconds(
  value:
    string |
    null,
) {
  if (!value) {
    return null;
  }

  const numericValue =
    Number(
      value,
    );

  if (
    Number.isFinite(
      numericValue,
    ) &&
    numericValue >= 0
  ) {
    return Math.ceil(
      numericValue,
    );
  }

  const timestamp =
    Date.parse(
      value,
    );

  if (
    !Number.isFinite(
      timestamp,
    )
  ) {
    return null;
  }

  return Math.max(
    0,
    Math.ceil(
      (
        timestamp -
        Date.now()
      ) /
      1_000,
    ),
  );
}

function extractApiErrorMessage(
  payload:
    unknown,
  fallback:
    string,
) {
  if (
    !isRecord(
      payload,
    )
  ) {
    const plainText =
      cleanText(
        payload,
      );

    return (
      plainText ||
      fallback
    ).slice(
      0,
      1_000,
    );
  }

  const candidates = [
    payload.message,
    payload.error,
    payload.title,
    payload.detail,
    payload.error_description,
  ];

  for (
    const candidate of
    candidates
  ) {
    const text =
      cleanText(
        candidate,
      );

    if (text) {
      return text.slice(
        0,
        1_000,
      );
    }
  }

  if (
    Array.isArray(
      payload.details,
    )
  ) {
    const detailMessages =
      payload.details
        .map(
          (
            detail,
          ) => {
            if (
              !isRecord(
                detail,
              )
            ) {
              return null;
            }

            return (
              cleanText(
                detail.description,
              ) ||
              cleanText(
                detail.message,
              ) ||
              cleanText(
                detail.issue,
              )
            );
          },
        )
        .filter(
          (
            message,
          ): message is string =>
            Boolean(
              message,
            ),
        );

    if (
      detailMessages.length >
      0
    ) {
      return detailMessages
        .join(
          " | ",
        )
        .slice(
          0,
          1_000,
        );
    }
  }

  return fallback;
}

function requireSafeTestEnvironment() {
  const environment =
    getLexwareRuntimeConfigurationSummary();

  const checks = {
    activeModeIsTest:
      environment.activeMode ===
      TEST_MODE,

    activeModeValid:
      environment.activeModeValid ===
      true,

    integrationFlagValid:
      environment.integrationFlagValid ===
      true,

    /*
     * Der isolierte Test-Write wird bewusst nur erlaubt,
     * solange die allgemeine Integration deaktiviert bleibt.
     */
    integrationGloballyDisabled:
      environment.integrationEnabled ===
      false,

    apiBaseUrlValid:
      environment.apiBaseUrlValid ===
      true,

    testApiKeyConfigured:
      environment.modes.test
        .apiKeyConfigured ===
      true,

    testOrganizationValid:
      environment.modes.test
        .organizationIdValid ===
      true,

    /*
     * Solange dieser Testclient verwendet wird,
     * darf kein Produktionsschlüssel in der Laufzeitumgebung
     * vorhanden sein.
     */
    productionApiKeyNotConfigured:
      environment.modes.production
        .apiKeyConfigured ===
      false,

    credentialSeparationSafe:
      environment
        .credentialSeparation
        .safe ===
      true,
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
          passed !==
          true,
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
    throw new LexwareInvoiceWriteError({
      code:
        "LEXWARE_TEST_WRITE_ENVIRONMENT_UNSAFE",

      message:
        "Der Lexware-Test-Write wurde blockiert, weil die isolierte Testumgebung nicht vollständig sicher konfiguriert ist.",

      resourcePath:
        "/v1/invoices",

      responsePayload: {
        failedChecks,

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

          testOrganizationId:
            environment.modes.test
              .organizationId,

          testOrganizationValid:
            environment.modes.test
              .organizationIdValid,

          productionApiKeyConfigured:
            environment.modes.production
              .apiKeyConfigured,

          credentialSeparationSafe:
            environment
              .credentialSeparation
              .safe,
        },
      },
    });
  }

  return environment;
}

function validateCreateInput(
  input:
    CreateLexwareTestDraftInvoiceInput,
) {
  if (
    input.confirmation !==
    LEXWARE_TEST_DRAFT_WRITE_CONFIRMATION
  ) {
    throw new LexwareInvoiceWriteError({
      code:
        "LEXWARE_TEST_WRITE_CONFIRMATION_INVALID",

      message:
        "Die Bestätigungsphrase für den Lexware-Testentwurf fehlt oder ist ungültig.",

      resourcePath:
        "/v1/invoices",
    });
  }

  if (
    input.finalize !==
    false
  ) {
    throw new LexwareInvoiceWriteError({
      code:
        "LEXWARE_TEST_FINALIZE_FORBIDDEN",

      message:
        "Der isolierte Lexware-Testclient darf ausschließlich Entwürfe mit finalize=false erzeugen.",

      resourcePath:
        "/v1/invoices",
    });
  }

  if (
    !isRecord(
      input.payload,
    )
  ) {
    throw new LexwareInvoiceWriteError({
      code:
        "LEXWARE_TEST_PAYLOAD_INVALID",

      message:
        "Der Lexware-Rechnungspayload besitzt kein gültiges Objektformat.",

      resourcePath:
        "/v1/invoices",
    });
  }

  if (
    input.payload.archived !==
    false
  ) {
    throw new LexwareInvoiceWriteError({
      code:
        "LEXWARE_TEST_PAYLOAD_ARCHIVED_INVALID",

      message:
        "Eine neue Lexware-Testrechnung darf nicht archiviert angelegt werden.",

      resourcePath:
        "/v1/invoices",
    });
  }

  if (
    !Array.isArray(
      input.payload.lineItems,
    ) ||
    input.payload.lineItems.length ===
    0
  ) {
    throw new LexwareInvoiceWriteError({
      code:
        "LEXWARE_TEST_PAYLOAD_LINES_MISSING",

      message:
        "Der Lexware-Testpayload besitzt keine Rechnungspositionen.",

      resourcePath:
        "/v1/invoices",
    });
  }

  if (
    input.payload
      .taxConditions
      ?.taxType !==
    "gross"
  ) {
    throw new LexwareInvoiceWriteError({
      code:
        "LEXWARE_TEST_PAYLOAD_TAX_TYPE_INVALID",

      message:
        "Der aktuelle Lexware-Testclient unterstützt ausschließlich Bruttorechnungen.",

      resourcePath:
        "/v1/invoices",
    });
  }
}

function normalizeCreateResponse(
  payload:
    unknown,
): LexwareInvoiceCreateActionResult {
  if (
    !isRecord(
      payload,
    )
  ) {
    throw new LexwareInvoiceWriteError({
      code:
        "LEXWARE_CREATE_RESPONSE_INVALID",

      message:
        "Lexware hat nach der Rechnungserstellung kein gültiges Antwortobjekt geliefert.",

      resourcePath:
        "/v1/invoices",

      responsePayload:
        payload,
    });
  }

  const id =
    cleanText(
      payload.id,
    )?.toLowerCase() ||
    null;

  const resourceUri =
    cleanText(
      payload.resourceUri,
    );

  const createdDate =
    cleanText(
      payload.createdDate,
    );

  const updatedDate =
    cleanText(
      payload.updatedDate,
    );

  const version =
    toNumberOrNull(
      payload.version,
    );

  if (
    !id ||
    !UUID_PATTERN.test(
      id,
    )
  ) {
    throw new LexwareInvoiceWriteError({
      code:
        "LEXWARE_CREATE_RESPONSE_ID_INVALID",

      message:
        "Lexware hat keine gültige Rechnungs-ID zurückgegeben.",

      resourcePath:
        "/v1/invoices",

      responsePayload:
        payload,
    });
  }

  if (
    !resourceUri
  ) {
    throw new LexwareInvoiceWriteError({
      code:
        "LEXWARE_CREATE_RESPONSE_URI_MISSING",

      message:
        "Lexware hat keine Ressourcen-URI für die erzeugte Rechnung zurückgegeben.",

      resourcePath:
        "/v1/invoices",

      responsePayload:
        payload,
    });
  }

  let parsedResourceUri:
    URL;

  try {
    parsedResourceUri =
      new URL(
        resourceUri,
      );
  } catch {
    throw new LexwareInvoiceWriteError({
      code:
        "LEXWARE_CREATE_RESPONSE_URI_INVALID",

      message:
        "Die von Lexware zurückgegebene Ressourcen-URI ist ungültig.",

      resourcePath:
        "/v1/invoices",

      responsePayload:
        payload,
    });
  }

  if (
    parsedResourceUri.protocol !==
      "https:" ||
    parsedResourceUri.hostname
      .toLowerCase() !==
      "api.lexware.io" ||
    parsedResourceUri.pathname !==
      `/v1/invoices/${id}`
  ) {
    throw new LexwareInvoiceWriteError({
      code:
        "LEXWARE_CREATE_RESPONSE_URI_MISMATCH",

      message:
        "Die von Lexware zurückgegebene Ressourcen-URI stimmt nicht mit der Rechnungs-ID überein.",

      resourcePath:
        "/v1/invoices",

      responsePayload:
        payload,
    });
  }

  if (
    !createdDate ||
    !Number.isFinite(
      Date.parse(
        createdDate,
      ),
    )
  ) {
    throw new LexwareInvoiceWriteError({
      code:
        "LEXWARE_CREATE_RESPONSE_DATE_INVALID",

      message:
        "Lexware hat keinen gültigen Erstellungszeitpunkt zurückgegeben.",

      resourcePath:
        "/v1/invoices",

      responsePayload:
        payload,
    });
  }

  return {
    id,

    resourceUri,

    createdDate,

    updatedDate:
      updatedDate &&
      Number.isFinite(
        Date.parse(
          updatedDate,
        ),
      )
        ? updatedDate
        : null,

    version:
      version !==
        null &&
      Number.isInteger(
        version,
      )
        ? version
        : null,
  };
}

export async function createLexwareTestDraftInvoice(
  input:
    CreateLexwareTestDraftInvoiceInput,
): Promise<CreateLexwareTestDraftInvoiceResult> {
  validateCreateInput(
    input,
  );

  requireSafeTestEnvironment();

  const configuration =
    requireLexwareConnectionConfiguration(
      TEST_MODE,
    );

  const resourcePath =
    "/v1/invoices";

  const timeoutMs =
    normalizeTimeoutMs(
      input.timeoutMs,
    );

  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () => {
        controller.abort();
      },
      timeoutMs,
    );

  let response:
    Response;

  try {
    /*
     * Absichtlich kein finalize-Queryparameter.
     *
     * Dadurch erzeugt Lexware ausschließlich einen Entwurf.
     */
    response =
      await fetch(
        `${configuration.apiBaseUrl}${resourcePath}`,
        {
          method:
            "POST",

          headers: {
            Authorization:
              `Bearer ${configuration.apiKey}`,

            Accept:
              "application/json",

            "Content-Type":
              "application/json",
          },

          body:
            JSON.stringify(
              input.payload,
            ),

          cache:
            "no-store",

          signal:
            controller.signal,
        },
      );
  } catch (error) {
    const timedOut =
      error instanceof
        Error &&
      error.name ===
        "AbortError";

    throw new LexwareInvoiceWriteError({
      code:
        timedOut
          ? "LEXWARE_TEST_CREATE_TIMEOUT"
          : "LEXWARE_TEST_CREATE_NETWORK_ERROR",

      message:
        timedOut
          ? `Lexware hat den Testentwurf nicht innerhalb von ${timeoutMs} ms beantwortet.`
          : "Die Verbindung zum Lexware-Testmandanten ist bei der Rechnungserstellung fehlgeschlagen.",

      resourcePath,

      originalCause:
        error,
    });
  } finally {
    clearTimeout(
      timeout,
    );
  }

  const responseText =
    await response.text();

  const responsePayload =
    parseResponsePayload(
      responseText,
    );

  if (
    !response.ok
  ) {
    const retryAfterSeconds =
      parseRetryAfterSeconds(
        response.headers.get(
          "retry-after",
        ),
      );

    const fallbackMessage =
      response.status ===
        400
        ? "Lexware hat den Rechnungspayload als syntaktisch ungültig abgelehnt."
        : response.status ===
            401
          ? "Lexware hat den Test-API-Schlüssel abgelehnt."
          : response.status ===
              403
            ? "Der Lexware-Test-API-Schlüssel besitzt keine Berechtigung zur Rechnungserstellung."
            : response.status ===
                406
              ? "Lexware hat den Rechnungspayload fachlich abgelehnt."
              : response.status ===
                  409
                ? "Lexware meldet einen Konflikt bei der Rechnungserstellung."
                : response.status ===
                    429
                  ? "Das Lexware-Rate-Limit wurde erreicht."
                  : `Lexware antwortete bei der Rechnungserstellung mit HTTP ${response.status}.`;

    throw new LexwareInvoiceWriteError({
      code:
        response.status ===
        429
          ? "LEXWARE_TEST_CREATE_RATE_LIMITED"
          : "LEXWARE_TEST_CREATE_HTTP_ERROR",

      message:
        extractApiErrorMessage(
          responsePayload,
          fallbackMessage,
        ),

      resourcePath,

      httpStatus:
        response.status,

      retryAfterSeconds,

      responsePayload,
    });
  }

  const createResponse =
    normalizeCreateResponse(
      responsePayload,
    );

  return {
    version:
      LEXWARE_TEST_INVOICE_WRITE_CLIENT_VERSION,

    mode:
      TEST_MODE,

    finalize:
      false,

    request: {
      method:
        "POST",

      resourcePath,

      organizationId:
        configuration.organizationId,

      payload:
        input.payload,
    },

    response:
      createResponse,

    createdAt:
      new Date()
        .toISOString(),
  };
}