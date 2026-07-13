import "server-only";

import type { RecommendationPartnerCategoryLink } from "@/app/lib/recommendations/types";
import {
  assertRecommendationUuid,
  getRecommendationAdminClient,
  recommendationBoolean,
  recommendationHasOwn,
  recommendationInteger,
  recommendationNotFoundError,
  recommendationProjectKey,
  recommendationRecord,
  recommendationRequiredText,
  throwRecommendationDatabaseError,
} from "@/app/lib/recommendations/serviceSupport";

const LINK_COLUMNS = [
  "id",
  "project_key",
  "partner_id",
  "category_id",
  "priority",
  "active",
  "created_at",
  "updated_at",
].join(",");

export type RecommendationCategoryPartnerLinkAdmin =
  RecommendationPartnerCategoryLink & {
    partner_name: string;
    partner_code: string;
    partner_active: boolean;
    category_name: string;
    category_active: boolean;
  };

export type CategoryPartnerLinkListOptions = {
  projectKey?: string;
  partnerId?: string;
  categoryId?: string;
};

function normalizeLinkRow(value: unknown): RecommendationPartnerCategoryLink {
  const row = recommendationRecord(value);
  return {
    id: recommendationRequiredText(row.id, "Zuordnungs-ID"),
    project_key: recommendationRequiredText(row.project_key, "Projekt"),
    partner_id: recommendationRequiredText(row.partner_id, "Partner-ID"),
    category_id: recommendationRequiredText(row.category_id, "Kategorie-ID"),
    priority: recommendationInteger(row.priority, "Die Priorität", -1000, 1000),
    active: row.active === true,
    created_at: recommendationRequiredText(row.created_at, "Erstellzeitpunkt"),
    updated_at: recommendationRequiredText(row.updated_at, "Änderungszeitpunkt"),
  };
}

async function assertPartnerAndCategory(
  projectKey: string,
  partnerId: string,
  categoryId: string,
) {
  assertRecommendationUuid(partnerId, "Die Partner-ID");
  assertRecommendationUuid(categoryId, "Die Kategorie-ID");
  const supabase = getRecommendationAdminClient();
  const [{ data: partner, error: partnerError }, { data: category, error: categoryError }] =
    await Promise.all([
      supabase
        .from("recommendation_partners")
        .select("id")
        .eq("id", partnerId)
        .eq("project_key", projectKey)
        .maybeSingle(),
      supabase
        .from("recommendation_partner_categories")
        .select("id")
        .eq("id", categoryId)
        .eq("project_key", projectKey)
        .maybeSingle(),
    ]);

  if (partnerError) {
    throwRecommendationDatabaseError(partnerError, {
      fallback: "Der Empfehlungspartner konnte nicht geprüft werden.",
    });
  }
  if (categoryError) {
    throwRecommendationDatabaseError(categoryError, {
      fallback: "Die Empfehlungskategorie konnte nicht geprüft werden.",
    });
  }
  if (!partner) recommendationNotFoundError("Der Empfehlungspartner wurde nicht gefunden.");
  if (!category) recommendationNotFoundError("Die Empfehlungskategorie wurde nicht gefunden.");
}

export async function listCategoryPartnerLinks(
  options: CategoryPartnerLinkListOptions = {},
): Promise<RecommendationCategoryPartnerLinkAdmin[]> {
  const projectKey = recommendationProjectKey(options.projectKey);
  if (options.partnerId) assertRecommendationUuid(options.partnerId, "Die Partner-ID");
  if (options.categoryId) assertRecommendationUuid(options.categoryId, "Die Kategorie-ID");
  const supabase = getRecommendationAdminClient();
  let query = supabase
    .from("recommendation_partner_category_links")
    .select(LINK_COLUMNS)
    .eq("project_key", projectKey);
  if (options.partnerId) query = query.eq("partner_id", options.partnerId);
  if (options.categoryId) query = query.eq("category_id", options.categoryId);

  const { data, error } = await query.order("priority", { ascending: false });
  if (error) {
    throwRecommendationDatabaseError(error, {
      fallback: "Partner-Kategorie-Zuordnungen konnten nicht geladen werden.",
    });
  }

  const links = (data ?? []).map(normalizeLinkRow);
  if (links.length === 0) return [];
  const partnerIds = [...new Set(links.map((link) => link.partner_id))];
  const categoryIds = [...new Set(links.map((link) => link.category_id))];
  const [{ data: partners, error: partnerError }, { data: categories, error: categoryError }] =
    await Promise.all([
      supabase
        .from("recommendation_partners")
        .select("id,name,partner_code,active")
        .eq("project_key", projectKey)
        .in("id", partnerIds),
      supabase
        .from("recommendation_partner_categories")
        .select("id,name,active")
        .eq("project_key", projectKey)
        .in("id", categoryIds),
    ]);

  if (partnerError) {
    throwRecommendationDatabaseError(partnerError, {
      fallback: "Partnerdaten der Zuordnungen konnten nicht geladen werden.",
    });
  }
  if (categoryError) {
    throwRecommendationDatabaseError(categoryError, {
      fallback: "Kategoriedaten der Zuordnungen konnten nicht geladen werden.",
    });
  }

  const partnerMap = new Map(
    (partners ?? []).map((value) => {
      const row = recommendationRecord(value);
      return [String(row.id ?? ""), row] as const;
    }),
  );
  const categoryMap = new Map(
    (categories ?? []).map((value) => {
      const row = recommendationRecord(value);
      return [String(row.id ?? ""), row] as const;
    }),
  );

  return links
    .map((link) => {
      const partner = partnerMap.get(link.partner_id) ?? {};
      const category = categoryMap.get(link.category_id) ?? {};
      return {
        ...link,
        partner_name: recommendationRequiredText(partner.name, "Partnername"),
        partner_code: recommendationRequiredText(partner.partner_code, "Partnerkennung"),
        partner_active: partner.active === true,
        category_name: recommendationRequiredText(category.name, "Kategoriename"),
        category_active: category.active === true,
      };
    })
    .sort(
      (left, right) =>
        right.priority - left.priority ||
        left.partner_name.localeCompare(right.partner_name, "de"),
    );
}

export async function assignPartnerToCategory(input: unknown) {
  const body = recommendationRecord(input);
  const projectKey = recommendationProjectKey(body.projectKey);
  const partnerId = recommendationRequiredText(body.partnerId, "Partner-ID");
  const categoryId = recommendationRequiredText(body.categoryId, "Kategorie-ID");
  await assertPartnerAndCategory(projectKey, partnerId, categoryId);
  const values = {
    project_key: projectKey,
    partner_id: partnerId,
    category_id: categoryId,
    priority: recommendationInteger(body.priority ?? 0, "Die Priorität", -1000, 1000),
    active: recommendationBoolean(body.active ?? true, "Der Aktivstatus"),
  };
  const supabase = getRecommendationAdminClient();
  const { data, error } = await supabase
    .from("recommendation_partner_category_links")
    .insert(values)
    .select(LINK_COLUMNS)
    .single();
  if (error) {
    throwRecommendationDatabaseError(error, {
      fallback: "Der Partner konnte der Kategorie nicht zugeordnet werden.",
      duplicate: "Dieser Partner ist der Kategorie bereits zugeordnet.",
    });
  }
  return normalizeLinkRow(data);
}

export async function updateCategoryPartnerLink(
  id: string,
  input: unknown,
  projectKeyValue?: string,
) {
  assertRecommendationUuid(id, "Die Zuordnungs-ID");
  const projectKey = recommendationProjectKey(projectKeyValue);
  const body = recommendationRecord(input);
  const supabase = getRecommendationAdminClient();
  const { data: currentData, error: currentError } = await supabase
    .from("recommendation_partner_category_links")
    .select(LINK_COLUMNS)
    .eq("id", id)
    .eq("project_key", projectKey)
    .maybeSingle();
  if (currentError) {
    throwRecommendationDatabaseError(currentError, {
      fallback: "Die Partnerzuordnung konnte nicht geladen werden.",
    });
  }
  if (!currentData) recommendationNotFoundError("Die Partnerzuordnung wurde nicht gefunden.");
  const current = normalizeLinkRow(currentData);
  const values = {
    priority: recommendationInteger(
      recommendationHasOwn(body, "priority") ? body.priority : current.priority,
      "Die Priorität",
      -1000,
      1000,
    ),
    active: recommendationBoolean(
      recommendationHasOwn(body, "active") ? body.active : current.active,
      "Der Aktivstatus",
    ),
  };
  const { data, error } = await supabase
    .from("recommendation_partner_category_links")
    .update(values)
    .eq("id", id)
    .eq("project_key", projectKey)
    .select(LINK_COLUMNS)
    .single();
  if (error) {
    throwRecommendationDatabaseError(error, {
      fallback: "Die Partnerzuordnung konnte nicht gespeichert werden.",
    });
  }
  return normalizeLinkRow(data);
}

export async function removePartnerFromCategory(
  id: string,
  projectKeyValue?: string,
) {
  assertRecommendationUuid(id, "Die Zuordnungs-ID");
  const projectKey = recommendationProjectKey(projectKeyValue);
  const supabase = getRecommendationAdminClient();
  const { data, error } = await supabase
    .from("recommendation_partner_category_links")
    .delete()
    .eq("id", id)
    .eq("project_key", projectKey)
    .select("id")
    .maybeSingle();
  if (error) {
    throwRecommendationDatabaseError(error, {
      fallback: "Die Partnerzuordnung konnte nicht entfernt werden.",
    });
  }
  if (!data) recommendationNotFoundError("Die Partnerzuordnung wurde nicht gefunden.");
}
