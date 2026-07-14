import "server-only";

import {
  evaluateRecommendationEngine,
  type RecommendationEngineCategory,
  type RecommendationEngineLink,
  type RecommendationEnginePartner,
  type RecommendationEngineRule,
} from "@/app/lib/recommendations/recommendationEngineService";
import type { CustomerPartnerRecommendation } from "@/app/lib/recommendations/customerRecommendationTypes";
import type {
  RecommendationMatchField,
  RecommendationPatternType,
  RecommendationSimulationFields,
} from "@/app/lib/recommendations/types";
import {
  DEFAULT_RECOMMENDATION_PROJECT_KEY,
  getRecommendationAdminClient,
} from "@/app/lib/recommendations/serviceSupport";

const MAX_MATERIAL_ITEMS = 500;
const MAX_MATERIAL_TEXT_LENGTH = 50_000;
const MAX_RULES = 500;
const MAX_CATEGORIES = 500;
const MAX_PARTNERS = 1_000;
const MAX_LINKS = 2_000;
const MATCH_FIELDS: RecommendationMatchField[] = [
  "raw_text",
  "normalized_name",
  "category",
  "product_type",
  "notes",
];

export type CustomerRecommendationMaterial = {
  id: string;
  rawText: string | null;
  productName: string | null;
  normalizedName: string | null;
  category: string | null;
  productType: string | null;
  notes: string | null;
  status: string | null;
  adminResolutionStatus: string | null;
  childId: string | null;
};

export type CustomerRecommendationContext = {
  request: {
    isActive: boolean | null;
    status: string | null;
    offerStatus: string | null;
    archivedAt: string | null;
  };
  materials: CustomerRecommendationMaterial[];
  coveredRequestItemIds: string[];
  activeChildIds: string[];
};

export class CustomerRecommendationServiceError extends Error {
  constructor() {
    super("Partnerempfehlungen konnten nicht geladen werden.");
    this.name = "CustomerRecommendationServiceError";
  }
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
}

function requiredText(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    throw new CustomerRecommendationServiceError();
  }
  return value.trim();
}

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function validateCustomerPartnerUrl(value: unknown) {
  const text = optionalText(value);
  if (!text) return null;
  try {
    const parsed = new URL(text);
    if (
      (parsed.protocol !== "https:" && parsed.protocol !== "http:")
      || !parsed.hostname
      || parsed.username
      || parsed.password
    ) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function integer(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed)) throw new CustomerRecommendationServiceError();
  return parsed;
}

function stringArray(value: unknown) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new CustomerRecommendationServiceError();
  }
  return value as string[];
}

function matchFields(value: unknown) {
  const fields = stringArray(value);
  if (fields.length === 0 || fields.some((field) => !MATCH_FIELDS.includes(field as RecommendationMatchField))) {
    throw new CustomerRecommendationServiceError();
  }
  return [...new Set(fields)] as RecommendationMatchField[];
}

function patternType(value: unknown): RecommendationPatternType {
  if (value !== "term" && value !== "phrase") {
    throw new CustomerRecommendationServiceError();
  }
  return value;
}

function normalizeRule(value: unknown): RecommendationEngineRule {
  const row = record(value);
  return {
    id: requiredText(row.id),
    categoryId: requiredText(row.category_id),
    name: requiredText(row.name),
    patternType: patternType(row.pattern_type),
    terms: stringArray(row.terms),
    excludedTerms: stringArray(row.excluded_terms),
    matchFields: matchFields(row.match_fields),
    priority: integer(row.priority),
    active: row.active === true,
  };
}

function normalizeCategory(value: unknown): RecommendationEngineCategory {
  const row = record(value);
  return {
    id: requiredText(row.id),
    name: requiredText(row.name),
    active: row.active === true,
    sortOrder: integer(row.sort_order),
  };
}

function normalizeLink(value: unknown): RecommendationEngineLink {
  const row = record(value);
  return {
    partnerId: requiredText(row.partner_id),
    categoryId: requiredText(row.category_id),
    priority: integer(row.priority),
    active: row.active === true,
  };
}

function normalizePartner(value: unknown): RecommendationEnginePartner {
  const row = record(value);
  return {
    id: requiredText(row.id),
    partnerCode: requiredText(row.partner_code),
    name: requiredText(row.name),
    active: row.active === true,
    description: optionalText(row.description),
    targetUrl: validateCustomerPartnerUrl(row.target_url) ?? undefined,
    logoUrl: validateCustomerPartnerUrl(row.logo_url),
  };
}

function ensureLimit(values: unknown[] | null, maximum: number) {
  if ((values?.length ?? 0) > maximum) {
    throw new CustomerRecommendationServiceError();
  }
}

async function loadRecommendationData(projectKey: string) {
  const supabase = getRecommendationAdminClient();
  const [ruleResult, categoryResult, linkResult, partnerResult] = await Promise.all([
    supabase
      .from("recommendation_rules")
      .select("id,category_id,name,pattern_type,terms,excluded_terms,match_fields,priority,active")
      .eq("project_key", projectKey)
      .limit(MAX_RULES + 1),
    supabase
      .from("recommendation_partner_categories")
      .select("id,name,active,sort_order")
      .eq("project_key", projectKey)
      .limit(MAX_CATEGORIES + 1),
    supabase
      .from("recommendation_partner_category_links")
      .select("partner_id,category_id,priority,active")
      .eq("project_key", projectKey)
      .limit(MAX_LINKS + 1),
    supabase
      .from("recommendation_partners")
      .select("id,partner_code,name,description,target_url,logo_url,active")
      .eq("project_key", projectKey)
      .limit(MAX_PARTNERS + 1),
  ]);

  if ([ruleResult, categoryResult, linkResult, partnerResult].some((result) => result.error)) {
    throw new CustomerRecommendationServiceError();
  }
  ensureLimit(ruleResult.data, MAX_RULES);
  ensureLimit(categoryResult.data, MAX_CATEGORIES);
  ensureLimit(linkResult.data, MAX_LINKS);
  ensureLimit(partnerResult.data, MAX_PARTNERS);

  return {
    rules: (ruleResult.data ?? []).map(normalizeRule),
    categories: (categoryResult.data ?? []).map(normalizeCategory),
    links: (linkResult.data ?? []).map(normalizeLink),
    partners: (partnerResult.data ?? []).map(normalizePartner),
  };
}

function materialFields(material: CustomerRecommendationMaterial): RecommendationSimulationFields {
  return {
    raw_text: material.rawText || "",
    normalized_name: material.normalizedName || material.productName || "",
    category: material.category || "",
    product_type: material.productType || "",
    notes: material.notes || "",
  };
}

const EXCLUDED_MATERIAL_STATUSES = new Set([
  "covered_by_alternative",
  "not_needed",
  "resolved",
  "done",
  "ignored",
]);

const CLOSED_REQUEST_STATUSES = new Set([
  "archived",
  "confirmed",
  "completed",
  "complete",
  "ordered",
  "order_completed",
  "checkout_completed",
]);

function normalizedStatus(value: string | null) {
  return String(value || "").trim().toLowerCase();
}

function relevantMaterials(context: CustomerRecommendationContext) {
  const requestStatus = normalizedStatus(context.request.status);
  const offerStatus = normalizedStatus(context.request.offerStatus);
  if (
    context.request.isActive === false
    || Boolean(context.request.archivedAt)
    || CLOSED_REQUEST_STATUSES.has(requestStatus)
    || CLOSED_REQUEST_STATUSES.has(offerStatus)
  ) {
    return [];
  }

  const coveredRequestItemIds = new Set(context.coveredRequestItemIds);
  const activeChildIds = new Set(context.activeChildIds);
  return context.materials.filter((material) => {
    if (coveredRequestItemIds.has(material.id)) return false;
    if (material.childId && !activeChildIds.has(material.childId)) return false;
    if (EXCLUDED_MATERIAL_STATUSES.has(normalizedStatus(material.status))) return false;
    if (EXCLUDED_MATERIAL_STATUSES.has(normalizedStatus(material.adminResolutionStatus))) {
      return false;
    }
    return true;
  });
}

function categoryReason(labels: string[]) {
  const uniqueLabels = [...new Set(labels.filter(Boolean))];
  if (uniqueLabels.length === 1) {
    return `Passend zu „${uniqueLabels[0]}“ in Deiner Materialliste.`;
  }
  if (uniqueLabels.length > 1) {
    return `Passend zu ${uniqueLabels.length} Positionen in Deiner Materialliste.`;
  }
  return "Passend zu den Angaben in Deiner Materialliste.";
}

export async function getCustomerPartnerRecommendations(
  context: CustomerRecommendationContext,
  projectKey = DEFAULT_RECOMMENDATION_PROJECT_KEY,
): Promise<CustomerPartnerRecommendation[]> {
  const materials = relevantMaterials(context);
  if (materials.length === 0) return [];
  if (materials.length > MAX_MATERIAL_ITEMS) {
    throw new CustomerRecommendationServiceError();
  }
  const totalTextLength = materials.reduce(
    (total, material) => total + [
      material.productName,
      material.rawText,
      material.normalizedName,
      material.category,
      material.productType,
      material.notes,
    ].reduce<number>((sum, value) => sum + (value?.length ?? 0), 0),
    0,
  );
  if (totalTextLength > MAX_MATERIAL_TEXT_LENGTH) {
    throw new CustomerRecommendationServiceError();
  }

  const data = await loadRecommendationData(projectKey);
  const engineResult = evaluateRecommendationEngine({
    documents: materials.map((material) => ({
      id: material.id,
      label: material.productName || material.normalizedName || "Materiallistenposition",
      fields: materialFields(material),
    })),
    ...data,
  });

  return engineResult.matchedCategories
    .filter((category) => category.winner?.targetUrl)
    .sort((left, right) => left.name.localeCompare(right.name, "de"))
    .map((category) => {
      const winner = category.winner!;
      const labels = category.matchedRules.flatMap((rule) =>
        rule.termChecks.flatMap((check) => check.matches.map((match) => match.documentLabel)),
      );
      return {
        category: category.name,
        categoryReason: categoryReason(labels),
        partner: {
          name: winner.name,
          partnerCode: winner.partnerCode,
          description: winner.description ?? null,
          logoUrl: winner.logoUrl ?? null,
          targetUrl: winner.targetUrl!,
        },
      };
    });
}
