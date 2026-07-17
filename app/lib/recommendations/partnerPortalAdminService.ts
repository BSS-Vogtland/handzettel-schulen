import "server-only";

import {
  createPartnerPortalAccess,
  type CreatePartnerPortalAccessResult,
} from "@/app/lib/recommendations/partnerPortalService";
import {
  DEFAULT_RECOMMENDATION_PROJECT_KEY,
  getRecommendationAdminClient,
  isRecommendationUuid,
  recommendationProjectKey,
} from "@/app/lib/recommendations/serviceSupport";

const REPORT_FREQUENCIES = [
  "disabled",
  "weekly",
  "monthly",
] as const;

export type PartnerPortalReportFrequency =
  (typeof REPORT_FREQUENCIES)[number];

export type PartnerPortalAdminSettings = {
  partnerId: string;
  projectKey: string;
  partnerName: string;
  contactName: string | null;
  contactEmail: string | null;
  partnerPortalEnabled: boolean;
  reportFrequency: PartnerPortalReportFrequency;
};

export type PartnerPortalAdminAccessRow = {
  id: string;
  label: string | null;
  active: boolean;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PartnerPortalAdminState = {
  settings: PartnerPortalAdminSettings;
  accesses: PartnerPortalAdminAccessRow[];
};

export type UpdatePartnerPortalSettingsInput = {
  contactName?: string | null;
  contactEmail?: string | null;
  partnerPortalEnabled?: boolean;
  reportFrequency?: PartnerPortalReportFrequency;
};

export type CreatePartnerPortalAdminAccessInput = {
  label?: string | null;
  expiresAt?: string | null;
  deactivateExisting?: boolean;
};

type UnknownRecord = Record<string, unknown>;

type DatabaseErrorLike = {
  code?: string;
  message?: string;
  details?: string;
};

export class PartnerPortalAdminServiceError extends Error {
  constructor(
    public readonly code:
      | "VALIDATION"
      | "NOT_FOUND"
      | "DATABASE",
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "PartnerPortalAdminServiceError";
  }
}

function record(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object"
    ? (value as UnknownRecord)
    : {};
}

function validationError(message: string): never {
  throw new PartnerPortalAdminServiceError(
    "VALIDATION",
    message,
    400,
  );
}

function notFoundError(message: string): never {
  throw new PartnerPortalAdminServiceError(
    "NOT_FOUND",
    message,
    404,
  );
}

function databaseError(
  error: DatabaseErrorLike,
  publicMessage: string,
): never {
  console.error("[Partner portal admin] Datenbankfehler", {
    code: error.code ?? null,
    message: error.message ?? null,
    details: error.details ?? null,
  });

  throw new PartnerPortalAdminServiceError(
    "DATABASE",
    publicMessage,
    500,
  );
}

function requiredUuid(value: unknown, label: string) {
  if (!isRecommendationUuid(value)) {
    validationError(`${label} ist ungültig.`);
  }

  return value;
}

function requiredDatabaseText(
  value: unknown,
  label: string,
) {
  if (typeof value !== "string" || !value.trim()) {
    throw new PartnerPortalAdminServiceError(
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

function normalizeEmail(value: unknown) {
  const email = nullableText(
    value,
    "Die Kontakt-E-Mail",
    320,
  );

  if (!email) {
    return null;
  }

  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    validationError(
      "Bitte eine gültige Kontakt-E-Mail eingeben.",
    );
  }

  return email.toLowerCase();
}

function normalizeBoolean(
  value: unknown,
  label: string,
) {
  if (typeof value !== "boolean") {
    validationError(`${label} ist ungültig.`);
  }

  return value;
}

function normalizeReportFrequency(
  value: unknown,
): PartnerPortalReportFrequency {
  if (
    typeof value !== "string" ||
    !REPORT_FREQUENCIES.includes(
      value as PartnerPortalReportFrequency,
    )
  ) {
    validationError(
      "Der Berichtsintervall ist ungültig.",
    );
  }

  return value as PartnerPortalReportFrequency;
}

function normalizeSettingsRow(
  value: unknown,
): PartnerPortalAdminSettings {
  const row = record(value);

  return {
    partnerId: requiredDatabaseText(
      row.id,
      "Partner-ID",
    ),
    projectKey: requiredDatabaseText(
      row.project_key,
      "Projekt",
    ),
    partnerName: requiredDatabaseText(
      row.name,
      "Partnername",
    ),
    contactName: nullableDatabaseText(
      row.contact_name,
    ),
    contactEmail: nullableDatabaseText(
      row.contact_email,
    ),
    partnerPortalEnabled:
      row.partner_portal_enabled === true,
    reportFrequency: normalizeReportFrequency(
      row.report_frequency,
    ),
  };
}

function normalizeAccessRow(
  value: unknown,
): PartnerPortalAdminAccessRow {
  const row = record(value);

  return {
    id: requiredDatabaseText(
      row.id,
      "Zugangs-ID",
    ),
    label: nullableDatabaseText(row.label),
    active: row.active === true,
    expiresAt: nullableDatabaseText(
      row.expires_at,
    ),
    lastUsedAt: nullableDatabaseText(
      row.last_used_at,
    ),
    createdAt: requiredDatabaseText(
      row.created_at,
      "Erstellzeitpunkt",
    ),
    updatedAt: requiredDatabaseText(
      row.updated_at,
      "Änderungszeitpunkt",
    ),
  };
}

async function loadPartnerSettings(
  partnerIdValue: unknown,
  projectKeyValue = DEFAULT_RECOMMENDATION_PROJECT_KEY,
) {
  const partnerId = requiredUuid(
    partnerIdValue,
    "Die Partner-ID",
  );

  const projectKey = recommendationProjectKey(
    projectKeyValue,
  );

  const supabase = getRecommendationAdminClient();

  const { data, error } = await supabase
    .from("recommendation_partners")
    .select(
      [
        "id",
        "project_key",
        "name",
        "contact_name",
        "contact_email",
        "partner_portal_enabled",
        "report_frequency",
      ].join(","),
    )
    .eq("id", partnerId)
    .eq("project_key", projectKey)
    .maybeSingle();

  if (error) {
    databaseError(
      error,
      "Die Partnerportal-Einstellungen konnten nicht geladen werden.",
    );
  }

  if (!data) {
    notFoundError(
      "Der Empfehlungspartner wurde nicht gefunden.",
    );
  }

  return normalizeSettingsRow(data);
}

export async function getPartnerPortalAdminState(
  partnerIdValue: unknown,
  projectKeyValue = DEFAULT_RECOMMENDATION_PROJECT_KEY,
): Promise<PartnerPortalAdminState> {
  const settings = await loadPartnerSettings(
    partnerIdValue,
    projectKeyValue,
  );

  const supabase = getRecommendationAdminClient();

  const { data, error } = await supabase
    .from("recommendation_partner_access")
    .select(
      [
        "id",
        "label",
        "active",
        "expires_at",
        "last_used_at",
        "created_at",
        "updated_at",
      ].join(","),
    )
    .eq("partner_id", settings.partnerId)
    .eq("project_key", settings.projectKey)
    .order("created_at", {
      ascending: false,
    });

  if (error) {
    databaseError(
      error,
      "Die vorhandenen Partnerzugänge konnten nicht geladen werden.",
    );
  }

  return {
    settings,
    accesses: (data ?? []).map(
      normalizeAccessRow,
    ),
  };
}

export async function updatePartnerPortalAdminSettings(
  partnerIdValue: unknown,
  input: UpdatePartnerPortalSettingsInput,
  projectKeyValue = DEFAULT_RECOMMENDATION_PROJECT_KEY,
): Promise<PartnerPortalAdminSettings> {
  const current = await loadPartnerSettings(
    partnerIdValue,
    projectKeyValue,
  );

  const contactName = nullableText(
    Object.prototype.hasOwnProperty.call(
      input,
      "contactName",
    )
      ? input.contactName
      : current.contactName,
    "Der Kontaktname",
    250,
  );

  const contactEmail = normalizeEmail(
    Object.prototype.hasOwnProperty.call(
      input,
      "contactEmail",
    )
      ? input.contactEmail
      : current.contactEmail,
  );

  const partnerPortalEnabled =
    Object.prototype.hasOwnProperty.call(
      input,
      "partnerPortalEnabled",
    )
      ? normalizeBoolean(
          input.partnerPortalEnabled,
          "Der Portalstatus",
        )
      : current.partnerPortalEnabled;

  const reportFrequency =
    Object.prototype.hasOwnProperty.call(
      input,
      "reportFrequency",
    )
      ? normalizeReportFrequency(
          input.reportFrequency,
        )
      : current.reportFrequency;

  const supabase = getRecommendationAdminClient();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("recommendation_partners")
    .update({
      contact_name: contactName,
      contact_email: contactEmail,
      partner_portal_enabled:
        partnerPortalEnabled,
      report_frequency: reportFrequency,
      updated_at: now,
    })
    .eq("id", current.partnerId)
    .eq("project_key", current.projectKey)
    .select(
      [
        "id",
        "project_key",
        "name",
        "contact_name",
        "contact_email",
        "partner_portal_enabled",
        "report_frequency",
      ].join(","),
    )
    .maybeSingle();

  if (error) {
    databaseError(
      error,
      "Die Partnerportal-Einstellungen konnten nicht gespeichert werden.",
    );
  }

  if (!data) {
    notFoundError(
      "Der Empfehlungspartner wurde nicht gefunden.",
    );
  }

  return normalizeSettingsRow(data);
}

export async function createPartnerPortalAdminAccess(
  partnerIdValue: unknown,
  input: CreatePartnerPortalAdminAccessInput,
  projectKeyValue = DEFAULT_RECOMMENDATION_PROJECT_KEY,
): Promise<CreatePartnerPortalAccessResult> {
  const settings = await loadPartnerSettings(
    partnerIdValue,
    projectKeyValue,
  );

  return createPartnerPortalAccess({
    partnerId: settings.partnerId,
    projectKey: settings.projectKey,
    label: input.label,
    expiresAt: input.expiresAt,
    deactivateExisting:
      input.deactivateExisting === true,
  });
}

export async function deactivatePartnerPortalAdminAccess(
  partnerIdValue: unknown,
  accessIdValue: unknown,
  projectKeyValue = DEFAULT_RECOMMENDATION_PROJECT_KEY,
) {
  const settings = await loadPartnerSettings(
    partnerIdValue,
    projectKeyValue,
  );

  const accessId = requiredUuid(
    accessIdValue,
    "Die Zugangs-ID",
  );

  const supabase = getRecommendationAdminClient();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("recommendation_partner_access")
    .update({
      active: false,
      updated_at: now,
    })
    .eq("id", accessId)
    .eq("partner_id", settings.partnerId)
    .eq("project_key", settings.projectKey)
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