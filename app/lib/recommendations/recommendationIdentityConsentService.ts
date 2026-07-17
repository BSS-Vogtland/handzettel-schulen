import "server-only";

import {
  DEFAULT_RECOMMENDATION_PROJECT_KEY,
  getRecommendationAdminClient,
  isRecommendationUuid,
  recommendationProjectKey,
} from "@/app/lib/recommendations/serviceSupport";

export const RECOMMENDATION_IDENTITY_CONSENT_VERSION =
  "partner-identitaetsfreigabe-v1-2026-07-17";

const MAX_OFFER_TOKEN_LENGTH = 250;

export type RecommendationIdentityConsentState = {
  partnerId: string;
  partnerName: string;
  partnerCode: string;
  requestId: string;
  requestItemId: string;
  granted: boolean;
  grantedAt: string | null;
  revokedAt: string | null;
  consentVersion: string | null;
};

type DatabaseErrorLike = {
  code?: string;
  message?: string;
  details?: string;
};

type UnknownRecord = Record<string, unknown>;

export class RecommendationIdentityConsentServiceError extends Error {
  constructor(
    public readonly code:
      | "VALIDATION"
      | "NOT_FOUND"
      | "CONFLICT"
      | "DATABASE",
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name =
      "RecommendationIdentityConsentServiceError";
  }
}

function record(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object"
    ? (value as UnknownRecord)
    : {};
}

function validationError(message: string): never {
  throw new RecommendationIdentityConsentServiceError(
    "VALIDATION",
    message,
    400,
  );
}

function notFoundError(message: string): never {
  throw new RecommendationIdentityConsentServiceError(
    "NOT_FOUND",
    message,
    404,
  );
}

function conflictError(message: string): never {
  throw new RecommendationIdentityConsentServiceError(
    "CONFLICT",
    message,
    409,
  );
}

function databaseError(
  error: DatabaseErrorLike,
  publicMessage: string,
): never {
  console.error(
    "[Recommendation identity consent] Datenbankfehler",
    {
      code: error.code ?? null,
      message: error.message ?? null,
      details: error.details ?? null,
    },
  );

  throw new RecommendationIdentityConsentServiceError(
    "DATABASE",
    publicMessage,
    500,
  );
}

function requiredText(
  value: unknown,
  label: string,
  maxLength = 250,
) {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    validationError(`${label} ist erforderlich.`);
  }

  const text = value.trim();

  if (text.length > maxLength) {
    validationError(
      `${label} darf maximal ${maxLength} Zeichen lang sein.`,
    );
  }

  return text;
}

function requiredUuid(
  value: unknown,
  label: string,
) {
  if (!isRecommendationUuid(value)) {
    validationError(`${label} ist ungültig.`);
  }

  return value;
}

function normalizedOfferToken(value: unknown) {
  const token = requiredText(
    value,
    "Der Angebotszugang",
    MAX_OFFER_TOKEN_LENGTH,
  );

  if (!/^[A-Za-z0-9_-]+$/.test(token)) {
    validationError(
      "Der Angebotszugang ist ungültig.",
    );
  }

  return token;
}

function requiredDatabaseText(
  value: unknown,
  label: string,
) {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw new RecommendationIdentityConsentServiceError(
      "DATABASE",
      `${label} fehlt in der Datenbank.`,
      500,
    );
  }

  return value.trim();
}

function nullableDatabaseText(value: unknown) {
  return typeof value === "string" &&
    value.trim()
    ? value.trim()
    : null;
}

function normalizeConsentState(params: {
  partner: unknown;
  requestId: string;
  requestItemId: string;
  consent?: unknown;
}): RecommendationIdentityConsentState {
  const partner = record(params.partner);
  const consent = record(params.consent);

  const status =
    typeof consent.status === "string"
      ? consent.status
      : null;

  const revokedAt = nullableDatabaseText(
    consent.revoked_at,
  );

  return {
    partnerId: requiredDatabaseText(
      partner.id,
      "Partner-ID",
    ),
    partnerName: requiredDatabaseText(
      partner.name,
      "Partnername",
    ),
    partnerCode: requiredDatabaseText(
      partner.partner_code,
      "Partnerkennung",
    ),
    requestId: params.requestId,
    requestItemId: params.requestItemId,
    granted:
      status === "granted" &&
      revokedAt === null,
    grantedAt: nullableDatabaseText(
      consent.granted_at,
    ),
    revokedAt,
    consentVersion: nullableDatabaseText(
      consent.consent_text_version,
    ),
  };
}

export function buildRecommendationIdentityConsentText(
  partnerName: string,
) {
  return [
    `Ich bin damit einverstanden, dass Handzettel-Schulen.de meinen Namen und meine E-Mail-Adresse zusammen mit dem Vermittlungscode an ${partnerName} übermittelt.`,
    "Der Empfehlungspartner darf diese Daten ausschließlich verwenden, um eine dort erfolgte Bestellung dieser Empfehlung zuzuordnen und den Bestellstatus an Handzettel-Schulen.de zurückzumelden.",
    "Die Einwilligung ist freiwillig und kann jederzeit mit Wirkung für die Zukunft widerrufen werden.",
    "Ohne Einwilligung bleibt die Empfehlung nutzbar; die Zuordnung erfolgt dann ausschließlich über den Vermittlungscode.",
  ].join(" ");
}

async function loadValidatedContext(input: {
  offerToken: unknown;
  partnerId: unknown;
  requestItemId: unknown;
  projectKey?: unknown;
}) {
  const offerToken = normalizedOfferToken(
    input.offerToken,
  );

  const partnerId = requiredUuid(
    input.partnerId,
    "Die Partner-ID",
  );

  const requestItemId = requiredUuid(
    input.requestItemId,
    "Die Listenpositions-ID",
  );

  const projectKey = recommendationProjectKey(
    input.projectKey ??
      DEFAULT_RECOMMENDATION_PROJECT_KEY,
  );

  const supabase =
    getRecommendationAdminClient();

  const [
    requestResult,
    partnerResult,
    itemResult,
  ] = await Promise.all([
    supabase
      .from("school_requests")
      .select(
        [
          "id",
          "offer_token",
          "customer_name",
          "email",
          "status",
          "offer_status",
          "is_active",
          "archived_at",
        ].join(","),
      )
      .eq("offer_token", offerToken)
      .maybeSingle(),

    supabase
      .from("recommendation_partners")
      .select(
        [
          "id",
          "project_key",
          "partner_code",
          "name",
          "active",
        ].join(","),
      )
      .eq("id", partnerId)
      .eq("project_key", projectKey)
      .maybeSingle(),

    supabase
      .from("school_request_items")
      .select(
        [
          "id",
          "request_id",
          "status",
          "admin_resolution_status",
        ].join(","),
      )
      .eq("id", requestItemId)
      .maybeSingle(),
  ]);

  const firstError = [
    requestResult.error,
    partnerResult.error,
    itemResult.error,
  ].find(Boolean);

  if (firstError) {
    databaseError(
      firstError,
      "Die Einwilligungsdaten konnten nicht geprüft werden.",
    );
  }

  if (
    !requestResult.data ||
    !partnerResult.data ||
    !itemResult.data
  ) {
    notFoundError(
      "Die zugehörige Empfehlung wurde nicht gefunden.",
    );
  }

  const request = record(
    requestResult.data,
  );

  const partner = record(
    partnerResult.data,
  );

  const item = record(itemResult.data);

  if (
    partner.active !== true ||
    request.is_active === false ||
    Boolean(request.archived_at) ||
    item.request_id !== request.id
  ) {
    conflictError(
      "Für diese Empfehlung kann keine Einwilligung gespeichert werden.",
    );
  }

  return {
    supabase,
    projectKey,
    request,
    partner,
    item,
    requestId: requiredDatabaseText(
      request.id,
      "Anfrage-ID",
    ),
    requestItemId: requiredDatabaseText(
      item.id,
      "Listenpositions-ID",
    ),
    partnerId: requiredDatabaseText(
      partner.id,
      "Partner-ID",
    ),
  };
}

export async function getRecommendationIdentityConsentState(
  input: {
    offerToken: unknown;
    partnerId: unknown;
    requestItemId: unknown;
    projectKey?: unknown;
  },
): Promise<RecommendationIdentityConsentState> {
  const context =
    await loadValidatedContext(input);

  const { data, error } =
    await context.supabase
      .from(
        "recommendation_identity_consents",
      )
      .select(
        [
          "id",
          "status",
          "granted_at",
          "revoked_at",
          "consent_text_version",
        ].join(","),
      )
      .eq(
        "project_key",
        context.projectKey,
      )
      .eq(
        "partner_id",
        context.partnerId,
      )
      .eq(
        "request_id",
        context.requestId,
      )
      .eq(
        "request_item_id",
        context.requestItemId,
      )
      .order("created_at", {
        ascending: false,
      })
      .limit(1)
      .maybeSingle();

  if (error) {
    databaseError(
      error,
      "Der Einwilligungsstatus konnte nicht geladen werden.",
    );
  }

  return normalizeConsentState({
    partner: context.partner,
    requestId: context.requestId,
    requestItemId:
      context.requestItemId,
    consent: data,
  });
}

export async function grantRecommendationIdentityConsent(
  input: {
    offerToken: unknown;
    partnerId: unknown;
    requestItemId: unknown;
    projectKey?: unknown;
  },
): Promise<RecommendationIdentityConsentState> {
  const context =
    await loadValidatedContext(input);

  const customerName =
    requiredText(
      context.request.customer_name,
      "Der Kundenname",
      250,
    );

  const customerEmail =
    requiredText(
      context.request.email,
      "Die Kunden-E-Mail-Adresse",
      320,
    ).toLowerCase();

  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      customerEmail,
    )
  ) {
    validationError(
      "Die hinterlegte Kunden-E-Mail-Adresse ist ungültig.",
    );
  }

  const partnerName =
    requiredDatabaseText(
      context.partner.name,
      "Partnername",
    );

  const partnerCode =
    requiredDatabaseText(
      context.partner.partner_code,
      "Partnerkennung",
    );

  const consentText =
    buildRecommendationIdentityConsentText(
      partnerName,
    );

  const now = new Date().toISOString();

  const { data: existing, error: existingError } =
    await context.supabase
      .from(
        "recommendation_identity_consents",
      )
      .select(
        [
          "id",
          "click_id",
          "status",
          "granted_at",
          "revoked_at",
        ].join(","),
      )
      .eq(
        "project_key",
        context.projectKey,
      )
      .eq(
        "partner_id",
        context.partnerId,
      )
      .eq(
        "request_id",
        context.requestId,
      )
      .eq(
        "request_item_id",
        context.requestItemId,
      )
      .order("created_at", {
        ascending: false,
      })
      .limit(1)
      .maybeSingle();

  if (existingError) {
    databaseError(
      existingError,
      "Die bisherige Einwilligung konnte nicht geprüft werden.",
    );
  }

  const existingRow = record(existing);

  if (
    existing &&
    existingRow.click_id
  ) {
    conflictError(
      "Diese Empfehlung wurde bereits geöffnet. Eine nachträgliche Identitätsfreigabe für den bestehenden Klick ist nicht möglich.",
    );
  }

  let savedConsent: unknown;

  if (existing) {
    const { data, error } =
      await context.supabase
        .from(
          "recommendation_identity_consents",
        )
        .update({
          status: "granted",
          customer_name_snapshot:
            customerName,
          customer_email_snapshot:
            customerEmail,
          partner_name_snapshot:
            partnerName,
          partner_code_snapshot:
            partnerCode,
          consent_text_version:
            RECOMMENDATION_IDENTITY_CONSENT_VERSION,
          consent_text_snapshot:
            consentText,
          granted_at: now,
          revoked_at: null,
          updated_at: now,
        })
        .eq(
          "id",
          requiredDatabaseText(
            existingRow.id,
            "Einwilligungs-ID",
          ),
        )
        .select(
          [
            "id",
            "status",
            "granted_at",
            "revoked_at",
            "consent_text_version",
          ].join(","),
        )
        .single();

    if (error) {
      databaseError(
        error,
        "Die Einwilligung konnte nicht gespeichert werden.",
      );
    }

    savedConsent = data;
  } else {
    const { data, error } =
      await context.supabase
        .from(
          "recommendation_identity_consents",
        )
        .insert({
          project_key:
            context.projectKey,
          partner_id:
            context.partnerId,
          request_id:
            context.requestId,
          request_item_id:
            context.requestItemId,
          click_id: null,
          status: "granted",
          customer_name_snapshot:
            customerName,
          customer_email_snapshot:
            customerEmail,
          partner_name_snapshot:
            partnerName,
          partner_code_snapshot:
            partnerCode,
          consent_text_version:
            RECOMMENDATION_IDENTITY_CONSENT_VERSION,
          consent_text_snapshot:
            consentText,
          granted_at: now,
          revoked_at: null,
          created_at: now,
          updated_at: now,
        })
        .select(
          [
            "id",
            "status",
            "granted_at",
            "revoked_at",
            "consent_text_version",
          ].join(","),
        )
        .single();

    if (error) {
      databaseError(
        error,
        "Die Einwilligung konnte nicht gespeichert werden.",
      );
    }

    savedConsent = data;
  }

  return normalizeConsentState({
    partner: context.partner,
    requestId: context.requestId,
    requestItemId:
      context.requestItemId,
    consent: savedConsent,
  });
}

export async function revokeRecommendationIdentityConsent(
  input: {
    offerToken: unknown;
    partnerId: unknown;
    requestItemId: unknown;
    projectKey?: unknown;
  },
): Promise<RecommendationIdentityConsentState> {
  const context =
    await loadValidatedContext(input);

  const now = new Date().toISOString();

  const { data, error } =
    await context.supabase
      .from(
        "recommendation_identity_consents",
      )
      .update({
        status: "revoked",
        revoked_at: now,
        updated_at: now,
      })
      .eq(
        "project_key",
        context.projectKey,
      )
      .eq(
        "partner_id",
        context.partnerId,
      )
      .eq(
        "request_id",
        context.requestId,
      )
      .eq(
        "request_item_id",
        context.requestItemId,
      )
      .eq("status", "granted")
      .is("revoked_at", null)
      .select(
        [
          "id",
          "status",
          "granted_at",
          "revoked_at",
          "consent_text_version",
        ].join(","),
      )
      .maybeSingle();

  if (error) {
    databaseError(
      error,
      "Die Einwilligung konnte nicht widerrufen werden.",
    );
  }

  return normalizeConsentState({
    partner: context.partner,
    requestId: context.requestId,
    requestItemId:
      context.requestItemId,
    consent: data ?? {
      status: "revoked",
      granted_at: null,
      revoked_at: now,
      consent_text_version:
        RECOMMENDATION_IDENTITY_CONSENT_VERSION,
    },
  });
}