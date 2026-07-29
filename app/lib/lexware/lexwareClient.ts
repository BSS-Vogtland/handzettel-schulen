import "server-only";

/*
 * LEXWARE_READ_ONLY_GET_ONLY_V1
 *
 * Dieser Client unterstützt in dieser Ausbaustufe
 * ausschließlich HTTP GET.
 */

import {
  type LexwareMode,
  requireLexwareConnectionConfiguration,
} from "@/app/lib/lexware/lexwareConfig";

export const LEXWARE_READ_ONLY_CLIENT_VERSION =
  "lexware-read-only-client-v1" as const;

export type LexwareProfile = {
  organizationId: string;
  companyName: string;
  connectionId: string | null;
  features: string[];
  businessFeatures: string[];
  subscriptionStatus: string | null;
  taxType: string | null;
  distanceSalesPrinciple: string | null;
  smallBusiness: boolean | null;
  retrievedAt: string;
};

type LexwareGetJsonOptions = {
  timeoutMs?: number;
};

type LexwareApiErrorInput = {
  code: string;
  message: string;
  mode: LexwareMode;
  resourcePath: string;
  httpStatus?: number | null;
  retryAfterSeconds?: number | null;
  originalCause?: unknown;
};

const DEFAULT_TIMEOUT_MS =
  15_000;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class LexwareApiError extends Error {
  readonly code: string;
  readonly mode: LexwareMode;
  readonly resourcePath: string;
  readonly httpStatus: number | null;
  readonly retryAfterSeconds:
    | number
    | null;
  readonly originalCause:
    | unknown
    | null;

  constructor(
    input: LexwareApiErrorInput,
  ) {
    super(input.message);

    this.name =
      "LexwareApiError";

    this.code =
      input.code;

    this.mode =
      input.mode;

    this.resourcePath =
      input.resourcePath;

    this.httpStatus =
      input.httpStatus ?? null;

    this.retryAfterSeconds =
      input.retryAfterSeconds ??
      null;

    this.originalCause =
      input.originalCause ??
      null;
  }
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
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

function cleanStringList(
  value: unknown,
) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((entry) =>
          cleanText(entry),
        )
        .filter(
          (
            entry,
          ): entry is string =>
            Boolean(entry),
        ),
    ),
  );
}

function normalizeResourcePath(
  value: string,
) {
  const resourcePath =
    String(value || "").trim();

  if (
    !resourcePath.startsWith(
      "/v1/",
    ) ||
    resourcePath.startsWith("//") ||
    resourcePath.includes("://") ||
    resourcePath.includes("\\") ||
    resourcePath.includes("\0") ||
    resourcePath.includes("#")
  ) {
    throw new Error(
      "Lexware-Ressourcenpfad muss relativ sein und mit /v1/ beginnen.",
    );
  }

  const pathname =
    resourcePath.split("?")[0];

  if (
    pathname
      .split("/")
      .some(
        (segment) =>
          segment === "..",
      )
  ) {
    throw new Error(
      "Lexware-Ressourcenpfad darf keine übergeordneten Pfadsegmente enthalten.",
    );
  }

  return resourcePath;
}

function parseRetryAfterSeconds(
  value: string | null,
) {
  if (!value) {
    return null;
  }

  const numericValue =
    Number(value);

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

  const dateValue =
    Date.parse(value);

  if (
    !Number.isFinite(
      dateValue,
    )
  ) {
    return null;
  }

  return Math.max(
    0,
    Math.ceil(
      (
        dateValue -
        Date.now()
      ) / 1000,
    ),
  );
}

function parseResponsePayload(
  responseText: string,
) {
  if (!responseText.trim()) {
    return null;
  }

  try {
    return JSON.parse(
      responseText,
    ) as unknown;
  } catch {
    return null;
  }
}

function extractApiErrorMessage(
  payload: unknown,
  fallback: string,
) {
  if (!isRecord(payload)) {
    return fallback;
  }

  const candidates = [
    payload.message,
    payload.error_description,
    payload.error,
    payload.title,
    payload.detail,
  ];

  for (const candidate of candidates) {
    const text =
      cleanText(candidate);

    if (text) {
      return text.slice(
        0,
        600,
      );
    }
  }

  if (
    Array.isArray(
      payload.details,
    )
  ) {
    for (
      const detail of
      payload.details
    ) {
      if (!isRecord(detail)) {
        continue;
      }

      const text =
        cleanText(
          detail.description,
        ) ||
        cleanText(
          detail.message,
        ) ||
        cleanText(
          detail.issue,
        );

      if (text) {
        return text.slice(
          0,
          600,
        );
      }
    }
  }

  return fallback;
}

export async function lexwareGetJson<T>(
  mode: LexwareMode,
  resourcePathInput: string,
  options: LexwareGetJsonOptions = {},
): Promise<T> {
  let resourcePath: string;

  try {
    resourcePath =
      normalizeResourcePath(
        resourcePathInput,
      );
  } catch (error) {
    throw new LexwareApiError({
      code:
        "LEXWARE_RESOURCE_PATH_INVALID",

      message:
        error instanceof Error
          ? error.message
          : "Ungültiger Lexware-Ressourcenpfad.",

      mode,

      resourcePath:
        String(
          resourcePathInput ||
          "",
        ),

      originalCause:
        error,
    });
  }

  const configuration =
    requireLexwareConnectionConfiguration(
      mode,
    );

  const requestedTimeout =
    Number(
      options.timeoutMs ??
      DEFAULT_TIMEOUT_MS,
    );

  const timeoutMs =
    Math.max(
      1_000,
      Math.min(
        30_000,
        Number.isFinite(
          requestedTimeout,
        )
          ? Math.trunc(
              requestedTimeout,
            )
          : DEFAULT_TIMEOUT_MS,
      ),
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

  let response: Response;

  try {
    /*
     * LEXWARE_READ_ONLY_GET_ONLY_V1
     */
    response =
      await fetch(
        `${configuration.apiBaseUrl}${resourcePath}`,
        {
          method: "GET",

          headers: {
            Authorization:
              `Bearer ${configuration.apiKey}`,

            Accept:
              "application/json",
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
      error.name ===
        "AbortError";

    throw new LexwareApiError({
      code:
        timedOut
          ? "LEXWARE_REQUEST_TIMEOUT"
          : "LEXWARE_NETWORK_ERROR",

      message:
        timedOut
          ? `Lexware hat innerhalb von ${timeoutMs} ms nicht geantwortet.`
          : "Die Verbindung zur Lexware API ist fehlgeschlagen.",

      mode,
      resourcePath,

      originalCause:
        error,
    });
  } finally {
    clearTimeout(timeout);
  }

  const responseText =
    await response.text();

  const payload =
    parseResponsePayload(
      responseText,
    );

  if (!response.ok) {
    const retryAfterSeconds =
      parseRetryAfterSeconds(
        response.headers.get(
          "retry-after",
        ),
      );

    const fallbackMessage =
      response.status === 401
        ? "Lexware hat den API-Schlüssel abgelehnt oder die Verbindung wurde getrennt."
        : response.status === 403
          ? "Der Lexware API-Schlüssel besitzt nicht die benötigte Leseberechtigung."
          : response.status === 429
            ? "Das Lexware-Rate-Limit wurde erreicht. Der Aufruf muss später wiederholt werden."
            : `Lexware antwortete mit HTTP ${response.status}.`;

    throw new LexwareApiError({
      code:
        response.status === 429
          ? "LEXWARE_RATE_LIMITED"
          : "LEXWARE_HTTP_ERROR",

      message:
        extractApiErrorMessage(
          payload,
          fallbackMessage,
        ),

      mode,
      resourcePath,

      httpStatus:
        response.status,

      retryAfterSeconds,
    });
  }

  if (payload === null) {
    throw new LexwareApiError({
      code:
        "LEXWARE_INVALID_JSON",

      message:
        "Lexware hat keine gültige JSON-Antwort geliefert.",

      mode,
      resourcePath,

      httpStatus:
        response.status,
    });
  }

  return payload as T;
}

export async function getLexwareProfile(
  mode: LexwareMode,
): Promise<LexwareProfile> {
  const payload =
    await lexwareGetJson<unknown>(
      mode,
      "/v1/profile",
    );

  if (!isRecord(payload)) {
    throw new LexwareApiError({
      code:
        "LEXWARE_PROFILE_INVALID",

      message:
        "Das Lexware-Profil besitzt kein gültiges Objektformat.",

      mode,

      resourcePath:
        "/v1/profile",
    });
  }

  const organizationId =
    cleanText(
      payload.organizationId,
    )?.toLowerCase() ||
    null;

  const companyName =
    cleanText(
      payload.companyName,
    );

  if (
    !organizationId ||
    !UUID_PATTERN.test(
      organizationId,
    ) ||
    !companyName
  ) {
    throw new LexwareApiError({
      code:
        "LEXWARE_PROFILE_INCOMPLETE",

      message:
        "Das Lexware-Profil enthält keine gültige Organization-ID oder keinen Unternehmensnamen.",

      mode,

      resourcePath:
        "/v1/profile",
    });
  }

  return {
    organizationId,

    companyName,

    connectionId:
      cleanText(
        payload.connectionId,
      )?.toLowerCase() ||
      null,

    features:
      cleanStringList(
        payload.features,
      ),

    businessFeatures:
      cleanStringList(
        payload.businessFeatures,
      ),

    subscriptionStatus:
      cleanText(
        payload.subscriptionStatus,
      ),

    taxType:
      cleanText(
        payload.taxType,
      ),

    distanceSalesPrinciple:
      cleanText(
        payload.distanceSalesPrinciple,
      ),

    smallBusiness:
      typeof payload.smallBusiness ===
      "boolean"
        ? payload.smallBusiness
        : null,

    retrievedAt:
      new Date().toISOString(),
  };
}
