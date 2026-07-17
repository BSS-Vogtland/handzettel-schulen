import "server-only";

import {
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import {
  DEFAULT_RECOMMENDATION_PROJECT_KEY,
  getRecommendationAdminClient,
  isRecommendationUuid,
  recommendationProjectKey,
} from "@/app/lib/recommendations/serviceSupport";

const ACCESS_TOKEN_BYTES = 32;
const ACCESS_TOKEN_MIN_LENGTH = 40;
const ACCESS_TOKEN_MAX_LENGTH = 200;

const MAX_ACCESS_LABEL_LENGTH = 250;
const MAX_ORDER_REFERENCE_LENGTH = 250;
const MAX_PARTNER_NOTE_LENGTH = 2000;
const MAX_SUBMITTED_BY_LENGTH = 250;

const FEEDBACK_STATUSES = [
  "open",
  "ordered",
  "not_ordered",
  "cancelled",
] as const;

export type PartnerReferralFeedbackStatus =
  (typeof FEEDBACK_STATUSES)[number];

export type PartnerPortalPartner = {
  id: string;
  projectKey: string;
  partnerCode: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  contactName: string | null;
  contactEmail: string | null;
  currency: string;
};

export type PartnerPortalAccess = {
  id: string;
  partnerId: string;
  projectKey: string;
  label: string | null;
  active: boolean;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
};

export type PartnerPortalReferral = {
  feedbackId: string;
  clickId: string;
  referralCode: string;
  categoryName: string;
  matchedTerm: string | null;
  clickedAt: string;
  attributionExpiresAt: string;
  status: PartnerReferralFeedbackStatus;
  externalOrderReference: string | null;
  orderDate: string | null;
  grossRevenue: number | null;
  currency: string;
  partnerNote: string | null;
  submittedAt: string | null;
  updatedAt: string;
};

export type PartnerPortalSession = {
  partner: PartnerPortalPartner;
  access: PartnerPortalAccess;
};

export type PartnerPortalReferralList = PartnerPortalSession & {
  referrals: PartnerPortalReferral[];
  summary: {
    total: number;
    open: number;
    ordered: number;
    notOrdered: number;
    cancelled: number;
    grossRevenue: number;
  };
};

export type CreatePartnerPortalAccessResult = {
  accessId: string;
  partnerId: string;
  partnerName: string;
  token: string;
  path: string;
  expiresAt: string | null;
};

export type CreatePartnerPortalAccessInput = {
  partnerId: string;
  projectKey?: string;
  label?: string | null;
  expiresAt?: string | null;
  deactivateExisting?: boolean;
};

export type UpdatePartnerReferralFeedbackInput = {
  status: PartnerReferralFeedbackStatus;
  externalOrderReference?: string | null;
  orderDate?: string | null;
  grossRevenue?: number | string | null;
  currency?: string | null;
  partnerNote?: string | null;
  submittedBy?: string | null;
};

type UnknownRecord = Record<string, unknown>;

type DatabaseErrorLike = {
  code?: string;
  message?: string;
  details?: string;
};

export class PartnerPortalServiceError extends Error {
  constructor(
    public readonly code:
      | "VALIDATION"
      | "UNAUTHORIZED"
      | "NOT_FOUND"
      | "CONFLICT"
      | "DATABASE",
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "PartnerPortalServiceError";
  }
}

function record(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object"
    ? (value as UnknownRecord)
    : {};
}

function validationError(message: string): never {
  throw new PartnerPortalServiceError(
    "VALIDATION",
    message,
    400,
  );
}

function unauthorizedError(): never {
  throw new PartnerPortalServiceError(
    "UNAUTHORIZED",
    "Der Partnerzugang ist ungültig oder nicht mehr aktiv.",
    401,
  );
}

function notFoundError(message: string): never {
  throw new PartnerPortalServiceError(
    "NOT_FOUND",
    message,
    404,
  );
}

function databaseError(
  error: DatabaseErrorLike,
  publicMessage: string,
): never {
  console.error("[Partner portal] Datenbankfehler", {
    code: error.code ?? null,
    message: error.message ?? null,
    details: error.details ?? null,
  });

  throw new PartnerPortalServiceError(
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
  if (typeof value !== "string" || !value.trim()) {
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

function nullableText(
  value: unknown,
  label: string,
  maxLength: number,
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  if (typeof value !== "string") {
    validationError(`${label} ist ungültig.`);
  }

  const text = value.trim();

  if (!text) {
    return null;
  }

  if (text.length > maxLength) {
    validationError(
      `${label} darf maximal ${maxLength} Zeichen lang sein.`,
    );
  }

  return text;
}

function requiredUuid(value: unknown, label: string) {
  if (!isRecommendationUuid(value)) {
    validationError(`${label} ist ungültig.`);
  }

  return value;
}

function normalizedCurrency(value: unknown) {
  const currency = requiredText(
    value ?? "EUR",
    "Die Währung",
    3,
  ).toUpperCase();

  if (!/^[A-Z]{3}$/.test(currency)) {
    validationError(
      "Die Währung muss aus genau drei Buchstaben bestehen.",
    );
  }

  return currency;
}

function normalizedStatus(
  value: unknown,
): PartnerReferralFeedbackStatus {
  if (
    typeof value !== "string" ||
    !FEEDBACK_STATUSES.includes(
      value as PartnerReferralFeedbackStatus,
    )
  ) {
    validationError("Der Rückmeldestatus ist ungültig.");
  }

  return value as PartnerReferralFeedbackStatus;
}

function normalizedDate(
  value: unknown,
  label: string,
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    validationError(`${label} ist ungültig.`);
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(parsed.getTime())) {
    validationError(`${label} ist ungültig.`);
  }

  return value;
}

function normalizedTimestamp(
  value: unknown,
  label: string,
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  if (typeof value !== "string") {
    validationError(`${label} ist ungültig.`);
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    validationError(`${label} ist ungültig.`);
  }

  return parsed.toISOString();
}

function normalizedRevenue(value: unknown) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const parsed =
    typeof value === "number"
      ? value
      : Number(
          String(value)
            .trim()
            .replace(/\s/g, "")
            .replace(",", "."),
        );

  if (
    !Number.isFinite(parsed) ||
    parsed < 0 ||
    parsed > 9999999999.99
  ) {
    validationError(
      "Der gemeldete Bruttoumsatz ist ungültig.",
    );
  }

  return Math.round((parsed + Number.EPSILON) * 100) / 100;
}

function normalizedAccessToken(value: unknown) {
  if (
    typeof value !== "string" ||
    value.length < ACCESS_TOKEN_MIN_LENGTH ||
    value.length > ACCESS_TOKEN_MAX_LENGTH ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    unauthorizedError();
  }

  return value;
}

function tokenHash(token: string) {
  return createHash("sha256")
    .update(
      `handzettel-schulen:partner-portal-access:v1:${token}`,
      "utf8",
    )
    .digest("hex");
}

function secureHashEqual(
  leftHash: string,
  rightHash: string,
) {
  if (
    !/^[a-f0-9]{64}$/.test(leftHash) ||
    !/^[a-f0-9]{64}$/.test(rightHash)
  ) {
    return false;
  }

  return timingSafeEqual(
    Buffer.from(leftHash, "hex"),
    Buffer.from(rightHash, "hex"),
  );
}

function requiredDatabaseText(
  value: unknown,
  label: string,
) {
  if (typeof value !== "string" || !value.trim()) {
    throw new PartnerPortalServiceError(
      "DATABASE",
      `${label} fehlt in der Datenbank.`,
      500,
    );
  }

  return value.trim();
}

function nullableDatabaseText(value: unknown) {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : null;
}

function numericDatabaseValue(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed =
    typeof value === "number"
      ? value
      : Number(value);

  if (!Number.isFinite(parsed)) {
    throw new PartnerPortalServiceError(
      "DATABASE",
      "Ein Umsatzwert in der Datenbank ist ungültig.",
      500,
    );
  }

  return parsed;
}

function normalizeAccessRow(
  value: unknown,
): PartnerPortalAccess {
  const row = record(value);

  return {
    id: requiredDatabaseText(row.id, "Zugangs-ID"),
    partnerId: requiredDatabaseText(
      row.partner_id,
      "Partner-ID",
    ),
    projectKey: requiredDatabaseText(
      row.project_key,
      "Projekt",
    ),
    label: nullableDatabaseText(row.label),
    active: row.active === true,
    expiresAt: nullableDatabaseText(row.expires_at),
    lastUsedAt: nullableDatabaseText(row.last_used_at),
    createdAt: requiredDatabaseText(
      row.created_at,
      "Erstellzeitpunkt",
    ),
  };
}

function normalizePartnerRow(
  value: unknown,
): PartnerPortalPartner {
  const row = record(value);

  return {
    id: requiredDatabaseText(row.id, "Partner-ID"),
    projectKey: requiredDatabaseText(
      row.project_key,
      "Projekt",
    ),
    partnerCode: requiredDatabaseText(
      row.partner_code,
      "Partnerkennung",
    ),
    name: requiredDatabaseText(row.name, "Partnername"),
    slug: requiredDatabaseText(row.slug, "Partner-Slug"),
    logoUrl: nullableDatabaseText(row.logo_url),
    contactName: nullableDatabaseText(row.contact_name),
    contactEmail: nullableDatabaseText(row.contact_email),
    currency: requiredDatabaseText(
      row.currency,
      "Währung",
    ),
  };
}

function normalizeReferralRow(
  feedbackValue: unknown,
  clickValue: unknown,
): PartnerPortalReferral {
  const feedback = record(feedbackValue);
  const click = record(clickValue);

  return {
    feedbackId: requiredDatabaseText(
      feedback.id,
      "Rückmeldungs-ID",
    ),
    clickId: requiredDatabaseText(
      feedback.click_id,
      "Klick-ID",
    ),
    referralCode: requiredDatabaseText(
      click.referral_code,
      "Vermittlungscode",
    ),
    categoryName: requiredDatabaseText(
      click.category_name_snapshot,
      "Empfehlungskategorie",
    ),
    matchedTerm: nullableDatabaseText(
      click.matched_term,
    ),
    clickedAt: requiredDatabaseText(
      click.clicked_at,
      "Klickzeitpunkt",
    ),
    attributionExpiresAt: requiredDatabaseText(
      click.attribution_expires_at,
      "Zuordnungsende",
    ),
    status: normalizedStatus(feedback.status),
    externalOrderReference: nullableDatabaseText(
      feedback.external_order_reference,
    ),
    orderDate: nullableDatabaseText(
      feedback.order_date,
    ),
    grossRevenue: numericDatabaseValue(
      feedback.gross_revenue,
    ),
    currency: requiredDatabaseText(
      feedback.currency,
      "Währung",
    ),
    partnerNote: nullableDatabaseText(
      feedback.partner_note,
    ),
    submittedAt: nullableDatabaseText(
      feedback.submitted_at,
    ),
    updatedAt: requiredDatabaseText(
      feedback.updated_at,
      "Änderungszeitpunkt",
    ),
  };
}

export function createPartnerPortalToken() {
  return randomBytes(ACCESS_TOKEN_BYTES).toString(
    "base64url",
  );
}

export async function createPartnerPortalAccess(
  input: CreatePartnerPortalAccessInput,
): Promise<CreatePartnerPortalAccessResult> {
  const partnerId = requiredUuid(
    input.partnerId,
    "Die Partner-ID",
  );

  const projectKey = recommendationProjectKey(
    input.projectKey ??
      DEFAULT_RECOMMENDATION_PROJECT_KEY,
  );

  const label = nullableText(
    input.label,
    "Die Zugangsbezeichnung",
    MAX_ACCESS_LABEL_LENGTH,
  );

  const expiresAt = normalizedTimestamp(
    input.expiresAt,
    "Das Ablaufdatum",
  );

  if (
    expiresAt &&
    new Date(expiresAt).getTime() <= Date.now()
  ) {
    validationError(
      "Das Ablaufdatum muss in der Zukunft liegen.",
    );
  }

  const supabase = getRecommendationAdminClient();

  const { data: partnerData, error: partnerError } =
    await supabase
      .from("recommendation_partners")
      .select(
        "id,project_key,name,partner_portal_enabled",
      )
      .eq("id", partnerId)
      .eq("project_key", projectKey)
      .maybeSingle();

  if (partnerError) {
    databaseError(
      partnerError,
      "Der Partner konnte nicht geprüft werden.",
    );
  }

  if (!partnerData) {
    notFoundError(
      "Der Empfehlungspartner wurde nicht gefunden.",
    );
  }

  if (input.deactivateExisting === true) {
    const { error: deactivateError } = await supabase
      .from("recommendation_partner_access")
      .update({
        active: false,
        updated_at: new Date().toISOString(),
      })
      .eq("partner_id", partnerId)
      .eq("project_key", projectKey)
      .eq("active", true);

    if (deactivateError) {
      databaseError(
        deactivateError,
        "Bestehende Partnerzugänge konnten nicht deaktiviert werden.",
      );
    }
  }

  const token = createPartnerPortalToken();
  const hashedToken = tokenHash(token);
  const now = new Date().toISOString();

  const { data: accessData, error: accessError } =
    await supabase
      .from("recommendation_partner_access")
      .insert({
        partner_id: partnerId,
        project_key: projectKey,
        token_hash: hashedToken,
        label,
        active: true,
        expires_at: expiresAt,
        created_at: now,
        updated_at: now,
      })
      .select("id")
      .single();

  if (accessError || !accessData) {
    databaseError(
      accessError ?? {},
      "Der Partnerzugang konnte nicht erstellt werden.",
    );
  }

  if (partnerData.partner_portal_enabled !== true) {
    const { error: enableError } = await supabase
      .from("recommendation_partners")
      .update({
        partner_portal_enabled: true,
        updated_at: now,
      })
      .eq("id", partnerId)
      .eq("project_key", projectKey);

    if (enableError) {
      databaseError(
        enableError,
        "Der Partnerbereich konnte nicht aktiviert werden.",
      );
    }
  }

  return {
    accessId: requiredDatabaseText(
      accessData.id,
      "Zugangs-ID",
    ),
    partnerId,
    partnerName: requiredDatabaseText(
      partnerData.name,
      "Partnername",
    ),
    token,
    path: `/partnerportal/${encodeURIComponent(token)}`,
    expiresAt,
  };
}

export async function resolvePartnerPortalAccess(
  tokenValue: unknown,
  options?: {
    touchLastUsed?: boolean;
  },
): Promise<PartnerPortalSession> {
  const token = normalizedAccessToken(tokenValue);
  const expectedHash = tokenHash(token);
  const supabase = getRecommendationAdminClient();

  const { data: accessData, error: accessError } =
    await supabase
      .from("recommendation_partner_access")
      .select(
        "id,partner_id,project_key,token_hash,label,active,expires_at,last_used_at,created_at",
      )
      .eq("token_hash", expectedHash)
      .maybeSingle();

  if (accessError) {
    databaseError(
      accessError,
      "Der Partnerzugang konnte nicht geprüft werden.",
    );
  }

  if (!accessData) {
    unauthorizedError();
  }

  const storedHash = requiredDatabaseText(
    accessData.token_hash,
    "Token-Hash",
  );

  if (!secureHashEqual(expectedHash, storedHash)) {
    unauthorizedError();
  }

  const access = normalizeAccessRow(accessData);

  if (!access.active) {
    unauthorizedError();
  }

  if (
    access.expiresAt &&
    new Date(access.expiresAt).getTime() <= Date.now()
  ) {
    unauthorizedError();
  }

  const { data: partnerData, error: partnerError } =
    await supabase
      .from("recommendation_partners")
      .select(
        "id,project_key,partner_code,name,slug,logo_url,contact_name,contact_email,currency,active,partner_portal_enabled",
      )
      .eq("id", access.partnerId)
      .eq("project_key", access.projectKey)
      .maybeSingle();

  if (partnerError) {
    databaseError(
      partnerError,
      "Der Partner konnte nicht geladen werden.",
    );
  }

  if (
    !partnerData ||
    partnerData.active !== true ||
    partnerData.partner_portal_enabled !== true
  ) {
    unauthorizedError();
  }

  if (options?.touchLastUsed === true) {
    const now = new Date().toISOString();

    const { error: touchError } = await supabase
      .from("recommendation_partner_access")
      .update({
        last_used_at: now,
        updated_at: now,
      })
      .eq("id", access.id)
      .eq("active", true);

    if (touchError) {
      console.error(
        "[Partner portal] last_used_at konnte nicht aktualisiert werden",
        {
          accessId: access.id,
          errorCode: touchError.code ?? null,
          errorMessage: touchError.message ?? null,
        },
      );
    }

    access.lastUsedAt = now;
  }

  return {
    partner: normalizePartnerRow(partnerData),
    access,
  };
}

export async function listPartnerPortalReferrals(
  tokenValue: unknown,
): Promise<PartnerPortalReferralList> {
  const session = await resolvePartnerPortalAccess(
    tokenValue,
    {
      touchLastUsed: true,
    },
  );

  const supabase = getRecommendationAdminClient();

  const { data: feedbackData, error: feedbackError } =
    await supabase
      .from("recommendation_referral_feedback")
      .select(
        "id,click_id,partner_id,status,external_order_reference,order_date,gross_revenue,currency,partner_note,submitted_at,updated_at",
      )
      .eq("partner_id", session.partner.id)
      .order("updated_at", { ascending: false })
      .limit(500);

  if (feedbackError) {
    databaseError(
      feedbackError,
      "Die Vermittlungen konnten nicht geladen werden.",
    );
  }

  const feedbackRows = feedbackData ?? [];
  const clickIds = feedbackRows
    .map((value) => record(value).click_id)
    .filter(
      (value): value is string =>
        typeof value === "string" &&
        isRecommendationUuid(value),
    );

  if (clickIds.length === 0) {
    return {
      ...session,
      referrals: [],
      summary: {
        total: 0,
        open: 0,
        ordered: 0,
        notOrdered: 0,
        cancelled: 0,
        grossRevenue: 0,
      },
    };
  }

  const { data: clickData, error: clickError } =
    await supabase
      .from("recommendation_clicks")
      .select(
        "id,partner_id,referral_code,category_name_snapshot,matched_term,clicked_at,attribution_expires_at,is_probable_bot",
      )
      .eq("partner_id", session.partner.id)
      .eq("is_probable_bot", false)
      .in("id", clickIds);

  if (clickError) {
    databaseError(
      clickError,
      "Die zugehörigen Vermittlungsklicks konnten nicht geladen werden.",
    );
  }

  const clickMap = new Map(
    (clickData ?? []).map((value) => {
      const row = record(value);

      return [
        requiredDatabaseText(row.id, "Klick-ID"),
        value,
      ] as const;
    }),
  );

  const referrals = feedbackRows
    .map((feedback) => {
      const feedbackRow = record(feedback);
      const clickId = requiredDatabaseText(
        feedbackRow.click_id,
        "Klick-ID",
      );

      const click = clickMap.get(clickId);

      if (!click) {
        return null;
      }

      return normalizeReferralRow(feedback, click);
    })
    .filter(
      (
        value,
      ): value is PartnerPortalReferral =>
        value !== null,
    )
    .sort(
      (left, right) =>
        new Date(right.clickedAt).getTime() -
        new Date(left.clickedAt).getTime(),
    );

  const summary = referrals.reduce(
    (result, referral) => {
      result.total += 1;

      if (referral.status === "open") {
        result.open += 1;
      }

      if (referral.status === "ordered") {
        result.ordered += 1;
        result.grossRevenue +=
          referral.grossRevenue ?? 0;
      }

      if (referral.status === "not_ordered") {
        result.notOrdered += 1;
      }

      if (referral.status === "cancelled") {
        result.cancelled += 1;
      }

      return result;
    },
    {
      total: 0,
      open: 0,
      ordered: 0,
      notOrdered: 0,
      cancelled: 0,
      grossRevenue: 0,
    },
  );

  summary.grossRevenue =
    Math.round(
      (summary.grossRevenue + Number.EPSILON) * 100,
    ) / 100;

  return {
    ...session,
    referrals,
    summary,
  };
}

export async function updatePartnerReferralFeedback(
  tokenValue: unknown,
  feedbackIdValue: unknown,
  input: UpdatePartnerReferralFeedbackInput,
): Promise<PartnerPortalReferral> {
  const session = await resolvePartnerPortalAccess(
    tokenValue,
  );

  const feedbackId = requiredUuid(
    feedbackIdValue,
    "Die Rückmeldungs-ID",
  );

  const status = normalizedStatus(input.status);

  const externalOrderReference = nullableText(
    input.externalOrderReference,
    "Die Bestellreferenz",
    MAX_ORDER_REFERENCE_LENGTH,
  );

  const orderDate = normalizedDate(
    input.orderDate,
    "Das Bestelldatum",
  );

  const grossRevenue = normalizedRevenue(
    input.grossRevenue,
  );

  const currency = normalizedCurrency(
    input.currency ?? session.partner.currency,
  );

  const partnerNote = nullableText(
    input.partnerNote,
    "Die Partnernotiz",
    MAX_PARTNER_NOTE_LENGTH,
  );

  const submittedBy =
    nullableText(
      input.submittedBy,
      "Der Bearbeiter",
      MAX_SUBMITTED_BY_LENGTH,
    ) ??
    session.partner.contactName ??
    session.partner.name;

  if (
    status === "ordered" &&
    (!orderDate || grossRevenue === null)
  ) {
    validationError(
      "Bei einer Bestellung sind Bestelldatum und Bruttoumsatz erforderlich.",
    );
  }

  const values =
    status === "ordered"
      ? {
          status,
          external_order_reference:
            externalOrderReference,
          order_date: orderDate,
          gross_revenue: grossRevenue,
          currency,
          partner_note: partnerNote,
          submitted_by: "partner",
          submitted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
      : {
          status,
          external_order_reference:
            externalOrderReference,
          order_date: null,
          gross_revenue: null,
          currency,
          partner_note: partnerNote,
          submitted_by: "partner",
          submitted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

  const supabase = getRecommendationAdminClient();

  const { data: feedbackData, error: feedbackError } =
    await supabase
      .from("recommendation_referral_feedback")
      .update(values)
      .eq("id", feedbackId)
      .eq("partner_id", session.partner.id)
      .select(
        "id,click_id,partner_id,status,external_order_reference,order_date,gross_revenue,currency,partner_note,submitted_at,updated_at",
      )
      .maybeSingle();

  if (feedbackError) {
    databaseError(
      feedbackError,
      "Die Rückmeldung konnte nicht gespeichert werden.",
    );
  }

  if (!feedbackData) {
    notFoundError(
      "Die Vermittlung wurde für diesen Partner nicht gefunden.",
    );
  }

  const feedbackRow = record(feedbackData);
  const clickId = requiredDatabaseText(
    feedbackRow.click_id,
    "Klick-ID",
  );

  const { data: clickData, error: clickError } =
    await supabase
      .from("recommendation_clicks")
      .select(
        "id,partner_id,referral_code,category_name_snapshot,matched_term,clicked_at,attribution_expires_at,is_probable_bot",
      )
      .eq("id", clickId)
      .eq("partner_id", session.partner.id)
      .eq("is_probable_bot", false)
      .maybeSingle();

  if (clickError) {
    databaseError(
      clickError,
      "Der Vermittlungsklick konnte nicht geladen werden.",
    );
  }

  if (!clickData) {
    notFoundError(
      "Der zugehörige Vermittlungsklick wurde nicht gefunden.",
    );
  }

  console.info(
    "[Partner portal] Rückmeldung gespeichert",
    {
      partnerId: session.partner.id,
      feedbackId,
      status,
      submittedBy,
    },
  );

  return normalizeReferralRow(
    feedbackData,
    clickData,
  );
}

export async function deactivatePartnerPortalAccess(
  accessIdValue: unknown,
  projectKeyValue = DEFAULT_RECOMMENDATION_PROJECT_KEY,
) {
  const accessId = requiredUuid(
    accessIdValue,
    "Die Zugangs-ID",
  );

  const projectKey = recommendationProjectKey(
    projectKeyValue,
  );

  const supabase = getRecommendationAdminClient();

  const { data, error } = await supabase
    .from("recommendation_partner_access")
    .update({
      active: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", accessId)
    .eq("project_key", projectKey)
    .select("id")
    .maybeSingle();

  if (error) {
    databaseError(
      error,
      "Der Partnerzugang konnte nicht deaktiviert werden.",
    );
  }

  if (!data) {
    notFoundError(
      "Der Partnerzugang wurde nicht gefunden.",
    );
  }

  return {
    ok: true as const,
    accessId,
  };
}