import "server-only";

import { createClient } from "@supabase/supabase-js";
import type {
  RecommendationCommissionType,
  RecommendationPartner,
} from "@/app/lib/recommendations/types";
import { normalizeRecommendationSlug } from "@/app/lib/recommendations/slug";
import { validateRecommendationTargetUrl } from "@/app/lib/recommendations/urls";
import { generateAvailableRecommendationPartnerCode } from "@/app/lib/recommendations/partnerCode";

export const DEFAULT_RECOMMENDATION_PROJECT_KEY = "handzettel-schulen";

const PARTNER_COLUMNS = [
  "id",
  "project_key",
  "partner_code",
  "name",
  "slug",
  "description",
  "target_url",
  "logo_url",
  "active",
  "attribution_days",
  "commission_type",
  "commission_value",
  "currency",
  "disclosure_text",
  "internal_note",
  "created_at",
  "updated_at",
].join(",");

export type RecommendationPartnerServiceErrorCode =
  | "VALIDATION"
  | "NOT_FOUND"
  | "CONFLICT"
  | "DATABASE_NOT_READY"
  | "DATABASE";

export class RecommendationPartnerServiceError extends Error {
  constructor(
    public readonly code: RecommendationPartnerServiceErrorCode,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "RecommendationPartnerServiceError";
  }
}

export type RecommendationPartnerListOptions = {
  projectKey?: string;
  search?: string;
  active?: boolean | null;
  sort?: "updated_desc" | "created_desc" | "name_asc";
  page?: number;
  limit?: number;
};

export type RecommendationPartnerListResult = {
  partners: RecommendationPartner[];
  total: number;
  page: number;
  limit: number;
};

type PartnerMutationValues = {
  project_key: string;
  name: string;
  slug: string;
  description: string | null;
  target_url: string;
  logo_url: string | null;
  active: boolean;
  attribution_days: number;
  commission_type: RecommendationCommissionType | null;
  commission_value: number | null;
  currency: string;
  disclosure_text: string | null;
  internal_note: string | null;
};

type DatabaseErrorLike = {
  code?: string;
  message?: string;
  details?: string;
};

function getSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new RecommendationPartnerServiceError(
      "DATABASE",
      "Die serverseitige Datenbankverbindung ist nicht konfiguriert.",
      500,
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function validationError(message: string): never {
  throw new RecommendationPartnerServiceError("VALIDATION", message, 400);
}

function isDatabaseNotReadyError(error: DatabaseErrorLike) {
  return ["42P01", "42703", "PGRST204", "PGRST205"].includes(
    error.code ?? "",
  );
}

function throwDatabaseError(
  error: DatabaseErrorLike,
  publicMessage: string,
): never {
  console.error("Empfehlungspartner-Datenbankfehler:", {
    code: error.code,
    message: error.message,
  });

  if (isDatabaseNotReadyError(error)) {
    throw new RecommendationPartnerServiceError(
      "DATABASE_NOT_READY",
      "Die Empfehlungsdatenbank ist noch nicht vollständig eingerichtet.",
      500,
    );
  }

  if (error.code === "23505") {
    throw new RecommendationPartnerServiceError(
      "CONFLICT",
      "Für dieses Projekt existiert bereits ein Partner mit diesem Slug.",
      409,
    );
  }

  throw new RecommendationPartnerServiceError("DATABASE", publicMessage, 500);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function hasOwn(record: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function requiredText(value: unknown, label: string, maxLength = 250) {
  if (typeof value !== "string" || value.trim() === "") {
    validationError(`${label} ist erforderlich.`);
  }

  const text = value.trim().replace(/\s+/g, " ");
  if (text.length > maxLength) {
    validationError(`${label} darf maximal ${maxLength} Zeichen lang sein.`);
  }

  return text;
}

function nullableText(value: unknown, maxLength = 5000) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") validationError("Ein Textfeld ist ungültig.");

  const text = value.trim();
  if (!text) return null;
  if (text.length > maxLength) {
    validationError(`Ein Textfeld darf maximal ${maxLength} Zeichen lang sein.`);
  }

  return text;
}

function integerInRange(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
) {
  const parsed =
    typeof value === "number" ? value : Number(String(value ?? "").trim());

  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    validationError(`${label} muss zwischen ${minimum} und ${maximum} liegen.`);
  }

  return parsed;
}

function nullableDecimal(value: unknown) {
  if (value === null || value === undefined || value === "") return null;

  const parsed =
    typeof value === "number"
      ? value
      : Number(String(value).trim().replace(",", "."));

  if (!Number.isFinite(parsed)) {
    validationError("Der Provisionswert ist ungültig.");
  }

  return Math.round((parsed + Number.EPSILON) * 100) / 100;
}

function normalizeCommissionType(
  value: unknown,
): RecommendationCommissionType | null {
  if (value === null || value === undefined || value === "") return null;
  if (value === "percentage" || value === "fixed") return value;

  validationError("Bitte einen gültigen Provisionstyp wählen.");
}

function normalizePartnerRow(value: unknown): RecommendationPartner {
  const row = asRecord(value);
  const commissionType = normalizeCommissionType(row.commission_type);

  return {
    id: requiredText(row.id, "Partner-ID"),
    project_key: requiredText(row.project_key, "Projekt"),
    partner_code: requiredText(row.partner_code, "Partnerkennung"),
    name: requiredText(row.name, "Name"),
    slug: requiredText(row.slug, "Slug"),
    description: typeof row.description === "string" ? row.description : null,
    target_url: requiredText(row.target_url, "Ziel-URL", 4000),
    logo_url: typeof row.logo_url === "string" ? row.logo_url : null,
    active: row.active === true,
    attribution_days: integerInRange(
      row.attribution_days,
      "Zuordnungsdauer",
      1,
      365,
    ),
    commission_type: commissionType,
    commission_value:
      row.commission_value === null || row.commission_value === undefined
        ? null
        : typeof row.commission_value === "number" ||
            typeof row.commission_value === "string"
          ? row.commission_value
          : null,
    currency: requiredText(row.currency, "Währung", 3),
    disclosure_text:
      typeof row.disclosure_text === "string" ? row.disclosure_text : null,
    internal_note:
      typeof row.internal_note === "string" ? row.internal_note : null,
    created_at: requiredText(row.created_at, "Erstellzeitpunkt"),
    updated_at: requiredText(row.updated_at, "Änderungszeitpunkt"),
  };
}

function normalizeMutationInput(
  input: unknown,
  current?: RecommendationPartner,
): PartnerMutationValues {
  const body = asRecord(input);

  const projectKey = requiredText(
    hasOwn(body, "projectKey") ? body.projectKey : current?.project_key,
    "Projekt",
    100,
  );
  const name = requiredText(
    hasOwn(body, "name") ? body.name : current?.name,
    "Name",
    250,
  );

  const requestedSlug = hasOwn(body, "slug") ? body.slug : current?.slug;
  const slugResult = normalizeRecommendationSlug(
    typeof requestedSlug === "string" && requestedSlug.trim()
      ? requestedSlug
      : name,
  );
  if (!slugResult.ok) validationError(slugResult.message);

  const targetUrlResult = validateRecommendationTargetUrl(
    hasOwn(body, "targetUrl") ? body.targetUrl : current?.target_url,
  );
  if (!targetUrlResult.ok) validationError(targetUrlResult.message);

  const logoValue = hasOwn(body, "logoUrl") ? body.logoUrl : current?.logo_url;
  let logoUrl: string | null = null;
  if (logoValue !== null && logoValue !== undefined && logoValue !== "") {
    const logoUrlResult = validateRecommendationTargetUrl(logoValue);
    if (!logoUrlResult.ok) {
      validationError(`Logo-URL: ${logoUrlResult.message}`);
    }
    logoUrl = logoUrlResult.normalizedUrl;
  }

  const activeValue = hasOwn(body, "active") ? body.active : current?.active ?? true;
  if (typeof activeValue !== "boolean") {
    validationError("Der Aktivstatus ist ungültig.");
  }

  const attributionDays = integerInRange(
    hasOwn(body, "attributionDays")
      ? body.attributionDays
      : current?.attribution_days ?? 30,
    "Zuordnungsdauer",
    1,
    365,
  );

  const commissionType = normalizeCommissionType(
    hasOwn(body, "commissionType")
      ? body.commissionType
      : current?.commission_type,
  );
  const commissionValue = nullableDecimal(
    hasOwn(body, "commissionValue")
      ? body.commissionValue
      : current?.commission_value,
  );

  if ((commissionType === null) !== (commissionValue === null)) {
    validationError(
      "Provisionstyp und Provisionswert müssen gemeinsam gesetzt oder gemeinsam leer sein.",
    );
  }
  if (commissionValue !== null && commissionValue < 0) {
    validationError("Der Provisionswert darf nicht negativ sein.");
  }
  if (commissionType === "percentage" && commissionValue !== null && commissionValue > 100) {
    validationError("Eine prozentuale Provision darf maximal 100 % betragen.");
  }

  const currency = requiredText(
    hasOwn(body, "currency") ? body.currency : current?.currency ?? "EUR",
    "Währung",
    3,
  ).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    validationError("Die Währung muss aus genau drei Buchstaben bestehen.");
  }

  return {
    project_key: projectKey,
    name,
    slug: slugResult.slug,
    description: nullableText(
      hasOwn(body, "description") ? body.description : current?.description,
    ),
    target_url: targetUrlResult.normalizedUrl,
    logo_url: logoUrl,
    active: activeValue,
    attribution_days: attributionDays,
    commission_type: commissionType,
    commission_value: commissionValue,
    currency,
    disclosure_text: nullableText(
      hasOwn(body, "disclosureText")
        ? body.disclosureText
        : current?.disclosure_text,
    ),
    internal_note: nullableText(
      hasOwn(body, "internalNote") ? body.internalNote : current?.internal_note,
    ),
  };
}

function normalizeProjectKey(value: unknown) {
  return requiredText(value ?? DEFAULT_RECOMMENDATION_PROJECT_KEY, "Projekt", 100);
}

function normalizeSearch(value: unknown) {
  if (typeof value !== "string") return "";

  return value
    .trim()
    .slice(0, 100)
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isRecommendationPartnerUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function assertPartnerId(id: unknown): asserts id is string {
  if (!isRecommendationPartnerUuid(id)) {
    validationError("Die Partner-ID ist ungültig.");
  }
}

export async function listRecommendationPartners(
  options: RecommendationPartnerListOptions = {},
): Promise<RecommendationPartnerListResult> {
  const projectKey = normalizeProjectKey(options.projectKey);
  const search = normalizeSearch(options.search);
  const page = Math.max(1, Math.trunc(options.page ?? 1));
  const limit = Math.min(100, Math.max(1, Math.trunc(options.limit ?? 50)));
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const supabase = getSupabaseAdminClient();

  let query = supabase
    .from("recommendation_partners")
    .select(PARTNER_COLUMNS, { count: "exact" })
    .eq("project_key", projectKey);

  if (typeof options.active === "boolean") {
    query = query.eq("active", options.active);
  }
  if (search) {
    query = query.or(
      `name.ilike.%${search}%,partner_code.ilike.%${search}%,slug.ilike.%${search}%,description.ilike.%${search}%`,
    );
  }

  if (options.sort === "name_asc") {
    query = query.order("name", { ascending: true });
  } else if (options.sort === "created_desc") {
    query = query.order("created_at", { ascending: false });
  } else {
    query = query.order("updated_at", { ascending: false });
  }

  const { data, error, count } = await query.range(from, to);
  if (error) {
    throwDatabaseError(error, "Empfehlungspartner konnten nicht geladen werden.");
  }

  return {
    partners: (data ?? []).map((row) => normalizePartnerRow(row)),
    total: count ?? 0,
    page,
    limit,
  };
}

export async function getRecommendationPartnerById(
  id: string,
  projectKey = DEFAULT_RECOMMENDATION_PROJECT_KEY,
): Promise<RecommendationPartner> {
  assertPartnerId(id);
  const normalizedProjectKey = normalizeProjectKey(projectKey);
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("recommendation_partners")
    .select(PARTNER_COLUMNS)
    .eq("id", id)
    .eq("project_key", normalizedProjectKey)
    .maybeSingle();

  if (error) {
    throwDatabaseError(error, "Der Empfehlungspartner konnte nicht geladen werden.");
  }
  if (!data) {
    throw new RecommendationPartnerServiceError(
      "NOT_FOUND",
      "Der Empfehlungspartner wurde nicht gefunden.",
      404,
    );
  }

  return normalizePartnerRow(data);
}

export async function createRecommendationPartner(
  input: unknown,
): Promise<RecommendationPartner> {
  const values = normalizeMutationInput(input);
  const supabase = getSupabaseAdminClient();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const partnerCode = await generateAvailableRecommendationPartnerCode(
      supabase,
      values.project_key,
    );
    const { data, error } = await supabase
      .from("recommendation_partners")
      .insert({ ...values, partner_code: partnerCode })
      .select(PARTNER_COLUMNS)
      .single();

    if (!error) return normalizePartnerRow(data);

    const errorText = `${error.message ?? ""} ${error.details ?? ""}`;
    if (
      error.code === "23505" &&
      errorText.includes("recommendation_partners_project_partner_code_unique")
    ) {
      continue;
    }

    throwDatabaseError(error, "Der Empfehlungspartner konnte nicht angelegt werden.");
  }

  throw new RecommendationPartnerServiceError(
    "CONFLICT",
    "Es konnte keine freie Partnerkennung erzeugt werden. Bitte erneut versuchen.",
    409,
  );
}

export async function updateRecommendationPartner(
  id: string,
  input: unknown,
  currentProjectKey = DEFAULT_RECOMMENDATION_PROJECT_KEY,
): Promise<RecommendationPartner> {
  const current = await getRecommendationPartnerById(id, currentProjectKey);
  const values = normalizeMutationInput(input, current);
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("recommendation_partners")
    .update(values)
    .eq("id", id)
    .eq("project_key", current.project_key)
    .select(PARTNER_COLUMNS)
    .single();

  if (error) {
    throwDatabaseError(error, "Der Empfehlungspartner konnte nicht gespeichert werden.");
  }

  return normalizePartnerRow(data);
}

export async function setRecommendationPartnerActive(
  id: string,
  active: boolean,
  projectKey = DEFAULT_RECOMMENDATION_PROJECT_KEY,
): Promise<RecommendationPartner> {
  if (typeof active !== "boolean") validationError("Der Aktivstatus ist ungültig.");
  const current = await getRecommendationPartnerById(id, projectKey);
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("recommendation_partners")
    .update({ active })
    .eq("id", id)
    .eq("project_key", current.project_key)
    .select(PARTNER_COLUMNS)
    .single();

  if (error) {
    throwDatabaseError(error, "Der Aktivstatus konnte nicht geändert werden.");
  }

  return normalizePartnerRow(data);
}

export async function deleteRecommendationPartner(
  id: string,
  projectKey = DEFAULT_RECOMMENDATION_PROJECT_KEY,
): Promise<void> {
  const current = await getRecommendationPartnerById(id, projectKey);
  const supabase = getSupabaseAdminClient();
  const { count, error: countError } = await supabase
    .from("recommendation_partner_category_links")
    .select("id", { count: "exact", head: true })
    .eq("partner_id", id)
    .eq("project_key", current.project_key);

  if (countError) {
    throwDatabaseError(
      countError,
      "Abhängige Partnerkategorien konnten nicht geprüft werden.",
    );
  }
  if ((count ?? 0) > 0) {
    throw new RecommendationPartnerServiceError(
      "CONFLICT",
      "Dieser Partner ist Kategorien zugeordnet und kann nicht gelöscht werden. Bitte stattdessen deaktivieren.",
      409,
    );
  }

  const { error } = await supabase
    .from("recommendation_partners")
    .delete()
    .eq("id", id)
    .eq("project_key", current.project_key);

  if (error) {
    throwDatabaseError(error, "Der Empfehlungspartner konnte nicht gelöscht werden.");
  }
}
