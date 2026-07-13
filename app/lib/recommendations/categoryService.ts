import "server-only";

import { normalizeRecommendationSlug } from "@/app/lib/recommendations/slug";
import type { RecommendationPartnerCategory } from "@/app/lib/recommendations/types";
import {
  assertRecommendationUuid,
  getRecommendationAdminClient,
  recommendationBoolean,
  recommendationConflictError,
  recommendationHasOwn,
  recommendationInteger,
  recommendationNotFoundError,
  recommendationNullableText,
  recommendationProjectKey,
  recommendationRecord,
  recommendationRequiredText,
  recommendationSearch,
  recommendationValidationError,
  throwRecommendationDatabaseError,
} from "@/app/lib/recommendations/serviceSupport";

const CATEGORY_COLUMNS = [
  "id",
  "project_key",
  "name",
  "slug",
  "description",
  "active",
  "sort_order",
  "created_at",
  "updated_at",
].join(",");

export type RecommendationCategoryAdminRow = RecommendationPartnerCategory & {
  partner_count: number;
  rule_count: number;
};

export type RecommendationCategoryListOptions = {
  projectKey?: string;
  search?: string;
  active?: boolean | null;
  limit?: number;
};

function normalizeCategoryRow(value: unknown): RecommendationPartnerCategory {
  const row = recommendationRecord(value);
  return {
    id: recommendationRequiredText(row.id, "Kategorie-ID"),
    project_key: recommendationRequiredText(row.project_key, "Projekt"),
    name: recommendationRequiredText(row.name, "Name"),
    slug: recommendationRequiredText(row.slug, "Slug"),
    description: typeof row.description === "string" ? row.description : null,
    active: row.active === true,
    sort_order: recommendationInteger(row.sort_order, "Sortierung", 0, 1000000),
    created_at: recommendationRequiredText(row.created_at, "Erstellzeitpunkt"),
    updated_at: recommendationRequiredText(row.updated_at, "Änderungszeitpunkt"),
  };
}

function normalizeCategoryInput(
  input: unknown,
  current?: RecommendationPartnerCategory,
) {
  const body = recommendationRecord(input);
  const projectKey = recommendationProjectKey(
    recommendationHasOwn(body, "projectKey")
      ? body.projectKey
      : current?.project_key,
  );
  const name = recommendationRequiredText(
    recommendationHasOwn(body, "name") ? body.name : current?.name,
    "Name",
  );
  const requestedSlug = recommendationHasOwn(body, "slug")
    ? body.slug
    : current?.slug;
  const slug = normalizeRecommendationSlug(
    typeof requestedSlug === "string" && requestedSlug.trim()
      ? requestedSlug
      : name,
  );
  if (!slug.ok) recommendationValidationError(slug.message);

  return {
    project_key: projectKey,
    name,
    slug: slug.slug,
    description: recommendationNullableText(
      recommendationHasOwn(body, "description")
        ? body.description
        : current?.description,
    ),
    active: recommendationBoolean(
      recommendationHasOwn(body, "active")
        ? body.active
        : current?.active ?? true,
      "Der Aktivstatus",
    ),
    sort_order: recommendationInteger(
      recommendationHasOwn(body, "sortOrder")
        ? body.sortOrder
        : current?.sort_order ?? 0,
      "Die Sortierung",
      0,
      1000000,
    ),
  };
}

function buildCountMap(rows: unknown[] | null) {
  const counts = new Map<string, number>();
  for (const value of rows ?? []) {
    const row = recommendationRecord(value);
    if (typeof row.category_id !== "string") continue;
    counts.set(row.category_id, (counts.get(row.category_id) ?? 0) + 1);
  }
  return counts;
}

export async function listRecommendationCategories(
  options: RecommendationCategoryListOptions = {},
): Promise<RecommendationCategoryAdminRow[]> {
  const projectKey = recommendationProjectKey(options.projectKey);
  const search = recommendationSearch(options.search);
  const limit = Math.min(500, Math.max(1, Math.trunc(options.limit ?? 200)));
  const supabase = getRecommendationAdminClient();
  let query = supabase
    .from("recommendation_partner_categories")
    .select(CATEGORY_COLUMNS)
    .eq("project_key", projectKey);

  if (typeof options.active === "boolean") query = query.eq("active", options.active);
  if (search) {
    query = query.or(
      `name.ilike.%${search}%,slug.ilike.%${search}%,description.ilike.%${search}%`,
    );
  }

  const { data, error } = await query
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true })
    .limit(limit);
  if (error) {
    throwRecommendationDatabaseError(error, {
      fallback: "Empfehlungskategorien konnten nicht geladen werden.",
    });
  }

  const categories = (data ?? []).map(normalizeCategoryRow);
  const [{ data: links, error: linkError }, { data: rules, error: ruleError }] =
    await Promise.all([
      supabase
        .from("recommendation_partner_category_links")
        .select("category_id")
        .eq("project_key", projectKey),
      supabase
        .from("recommendation_rules")
        .select("category_id")
        .eq("project_key", projectKey),
    ]);

  if (linkError) {
    throwRecommendationDatabaseError(linkError, {
      fallback: "Partnerzuordnungen konnten nicht gezählt werden.",
    });
  }
  if (ruleError) {
    throwRecommendationDatabaseError(ruleError, {
      fallback: "Empfehlungsregeln konnten nicht gezählt werden.",
    });
  }

  const partnerCounts = buildCountMap(links);
  const ruleCounts = buildCountMap(rules);
  return categories.map((category) => ({
    ...category,
    partner_count: partnerCounts.get(category.id) ?? 0,
    rule_count: ruleCounts.get(category.id) ?? 0,
  }));
}

export async function getRecommendationCategoryById(
  id: string,
  projectKeyValue?: string,
): Promise<RecommendationPartnerCategory> {
  assertRecommendationUuid(id, "Die Kategorie-ID");
  const projectKey = recommendationProjectKey(projectKeyValue);
  const supabase = getRecommendationAdminClient();
  const { data, error } = await supabase
    .from("recommendation_partner_categories")
    .select(CATEGORY_COLUMNS)
    .eq("id", id)
    .eq("project_key", projectKey)
    .maybeSingle();

  if (error) {
    throwRecommendationDatabaseError(error, {
      fallback: "Die Empfehlungskategorie konnte nicht geladen werden.",
    });
  }
  if (!data) recommendationNotFoundError("Die Empfehlungskategorie wurde nicht gefunden.");
  return normalizeCategoryRow(data);
}

export async function createRecommendationCategory(input: unknown) {
  const values = normalizeCategoryInput(input);
  const supabase = getRecommendationAdminClient();
  const { data, error } = await supabase
    .from("recommendation_partner_categories")
    .insert(values)
    .select(CATEGORY_COLUMNS)
    .single();
  if (error) {
    throwRecommendationDatabaseError(error, {
      fallback: "Die Empfehlungskategorie konnte nicht angelegt werden.",
      duplicate: "Für dieses Projekt existiert bereits eine Kategorie mit diesem Slug.",
    });
  }
  return normalizeCategoryRow(data);
}

export async function updateRecommendationCategory(
  id: string,
  input: unknown,
  currentProjectKey?: string,
) {
  const current = await getRecommendationCategoryById(id, currentProjectKey);
  const values = normalizeCategoryInput(input, current);
  const supabase = getRecommendationAdminClient();
  const { data, error } = await supabase
    .from("recommendation_partner_categories")
    .update(values)
    .eq("id", id)
    .eq("project_key", current.project_key)
    .select(CATEGORY_COLUMNS)
    .single();
  if (error) {
    throwRecommendationDatabaseError(error, {
      fallback: "Die Empfehlungskategorie konnte nicht gespeichert werden.",
      duplicate: "Für dieses Projekt existiert bereits eine Kategorie mit diesem Slug.",
    });
  }
  return normalizeCategoryRow(data);
}

export async function setRecommendationCategoryActive(
  id: string,
  active: boolean,
  projectKey?: string,
) {
  recommendationBoolean(active, "Der Aktivstatus");
  return updateRecommendationCategory(id, { active }, projectKey);
}

export async function deleteRecommendationCategory(
  id: string,
  projectKeyValue?: string,
) {
  const category = await getRecommendationCategoryById(id, projectKeyValue);
  const supabase = getRecommendationAdminClient();
  const [{ count: linkCount, error: linkError }, { count: ruleCount, error: ruleError }] =
    await Promise.all([
      supabase
        .from("recommendation_partner_category_links")
        .select("id", { count: "exact", head: true })
        .eq("project_key", category.project_key)
        .eq("category_id", id),
      supabase
        .from("recommendation_rules")
        .select("id", { count: "exact", head: true })
        .eq("project_key", category.project_key)
        .eq("category_id", id),
    ]);

  if (linkError) {
    throwRecommendationDatabaseError(linkError, {
      fallback: "Partnerzuordnungen konnten nicht geprüft werden.",
    });
  }
  if (ruleError) {
    throwRecommendationDatabaseError(ruleError, {
      fallback: "Empfehlungsregeln konnten nicht geprüft werden.",
    });
  }
  if ((linkCount ?? 0) > 0 || (ruleCount ?? 0) > 0) {
    recommendationConflictError(
      "Diese Kategorie besitzt Partnerzuordnungen oder Regeln und kann nicht gelöscht werden. Bitte stattdessen deaktivieren.",
    );
  }

  const { error } = await supabase
    .from("recommendation_partner_categories")
    .delete()
    .eq("id", id)
    .eq("project_key", category.project_key);
  if (error) {
    throwRecommendationDatabaseError(error, {
      fallback: "Die Empfehlungskategorie konnte nicht gelöscht werden.",
    });
  }
}
