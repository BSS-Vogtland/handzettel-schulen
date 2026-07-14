import "server-only";

import {
  evaluateRecommendationEngine,
  normalizeRecommendationText,
  RECOMMENDATION_MATCH_FIELDS,
  type RecommendationEngineCategory,
  type RecommendationEngineEvaluatedRule,
  type RecommendationEngineLink,
  type RecommendationEnginePartner,
  type RecommendationEngineRule,
} from "@/app/lib/recommendations/recommendationEngineService";
import type {
  RecommendationMatchField,
  RecommendationPatternType,
  RecommendationSimulationEvaluatedRule,
  RecommendationSimulationFields,
  RecommendationSimulationResult,
} from "@/app/lib/recommendations/types";
import {
  getRecommendationAdminClient,
  recommendationProjectKey,
  recommendationRecord,
  recommendationRequiredText,
  recommendationValidationError,
  throwRecommendationDatabaseError,
} from "@/app/lib/recommendations/serviceSupport";

const MAX_INPUT_LENGTH = 10_000;
const MAX_RULES = 500;
const MAX_CATEGORIES = 500;
const MAX_PARTNERS = 1_000;
const MAX_LINKS = 2_000;

function isPatternType(value: unknown): value is RecommendationPatternType {
  return value === "term" || value === "phrase";
}

function isMatchField(value: unknown): value is RecommendationMatchField {
  return typeof value === "string"
    && RECOMMENDATION_MATCH_FIELDS.includes(value as RecommendationMatchField);
}

function integer(value: unknown, label: string, minimum: number, maximum: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    recommendationValidationError(`${label} ist ungültig.`);
  }
  return parsed;
}

function stringArray(value: unknown, label: string, required: boolean) {
  if (!Array.isArray(value)) recommendationValidationError(`${label} ist ungültig.`);
  const result = value.filter((entry): entry is string => typeof entry === "string");
  if (result.length !== value.length || (required && result.length === 0)) {
    recommendationValidationError(`${label} ist ungültig.`);
  }
  return result;
}

function matchFieldArray(value: unknown) {
  if (!Array.isArray(value)) recommendationValidationError("Die Matchfelder sind ungültig.");
  const result = value.filter(isMatchField);
  if (result.length !== value.length || result.length === 0) {
    recommendationValidationError("Die Matchfelder sind ungültig.");
  }
  return [...new Set(result)];
}

export const normalizeRecommendationSimulationText = normalizeRecommendationText;

function normalizeInput(input: unknown) {
  const body = recommendationRecord(input);
  const fields = recommendationRecord(body.fields);
  const normalizedFields = {} as RecommendationSimulationFields;
  let totalLength = 0;

  for (const field of RECOMMENDATION_MATCH_FIELDS) {
    const value = fields[field];
    if (value !== undefined && typeof value !== "string") {
      recommendationValidationError(`Das simulierte Feld ${field} ist ungültig.`);
    }
    const text = typeof value === "string" ? value.trim() : "";
    totalLength += text.length;
    normalizedFields[field] = normalizeRecommendationText(text);
  }

  if (!normalizedFields.raw_text) {
    recommendationValidationError("Rohtext ist für die Simulation erforderlich.");
  }
  if (totalLength > MAX_INPUT_LENGTH) {
    recommendationValidationError(
      `Die simulierten Texte dürfen zusammen maximal ${MAX_INPUT_LENGTH.toLocaleString("de-DE")} Zeichen enthalten.`,
    );
  }
  if (body.debug !== undefined && typeof body.debug !== "boolean") {
    recommendationValidationError("Der Debug-Modus ist ungültig.");
  }

  return {
    projectKey: recommendationProjectKey(body.projectKey),
    normalizedFields,
    debug: body.debug === true,
  };
}

function normalizeRule(value: unknown): RecommendationEngineRule {
  const row = recommendationRecord(value);
  if (!isPatternType(row.pattern_type)) {
    recommendationValidationError("Ein gespeicherter Regeltyp ist ungültig.");
  }
  return {
    id: recommendationRequiredText(row.id, "Regel-ID"),
    categoryId: recommendationRequiredText(row.category_id, "Kategorie-ID"),
    name: recommendationRequiredText(row.name, "Regelname"),
    patternType: row.pattern_type,
    terms: stringArray(row.terms, "Die Regelbegriffe", true),
    excludedTerms: stringArray(row.excluded_terms, "Die Ausschlussbegriffe", false),
    matchFields: matchFieldArray(row.match_fields),
    priority: integer(row.priority, "Die Regelpriorität", -1000, 1000),
    active: row.active === true,
  };
}

function normalizeCategory(value: unknown): RecommendationEngineCategory {
  const row = recommendationRecord(value);
  return {
    id: recommendationRequiredText(row.id, "Kategorie-ID"),
    name: recommendationRequiredText(row.name, "Kategoriename"),
    active: row.active === true,
    sortOrder: integer(row.sort_order, "Die Kategoriesortierung", 0, 1_000_000),
  };
}

function normalizeLink(value: unknown): RecommendationEngineLink {
  const row = recommendationRecord(value);
  return {
    partnerId: recommendationRequiredText(row.partner_id, "Partner-ID"),
    categoryId: recommendationRequiredText(row.category_id, "Kategorie-ID"),
    priority: integer(row.priority, "Die Partnerpriorität", -1000, 1000),
    active: row.active === true,
  };
}

function normalizePartner(value: unknown): RecommendationEnginePartner {
  const row = recommendationRecord(value);
  return {
    id: recommendationRequiredText(row.id, "Partner-ID"),
    partnerCode: recommendationRequiredText(row.partner_code, "Partnerkennung"),
    name: recommendationRequiredText(row.name, "Partnername"),
    active: row.active === true,
  };
}

function ensureLimit(values: unknown[] | null, maximum: number, label: string) {
  if ((values?.length ?? 0) > maximum) {
    recommendationValidationError(
      `${label} überschreiten das Simulationslimit von ${maximum.toLocaleString("de-DE")}.`,
    );
  }
}

async function loadSimulationData(projectKey: string) {
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
      .select("id,partner_code,name,active")
      .eq("project_key", projectKey)
      .limit(MAX_PARTNERS + 1),
  ]);

  const databaseError = [ruleResult, categoryResult, linkResult, partnerResult]
    .find((result) => result.error)?.error;
  if (databaseError) {
    throwRecommendationDatabaseError(databaseError, {
      fallback: "Die Simulationsdaten konnten nicht geladen werden.",
    });
  }

  ensureLimit(ruleResult.data, MAX_RULES, "Die Regeln");
  ensureLimit(categoryResult.data, MAX_CATEGORIES, "Die Kategorien");
  ensureLimit(linkResult.data, MAX_LINKS, "Die Partnerzuordnungen");
  ensureLimit(partnerResult.data, MAX_PARTNERS, "Die Partner");

  return {
    rules: (ruleResult.data ?? []).map(normalizeRule),
    categories: (categoryResult.data ?? []).map(normalizeCategory),
    links: (linkResult.data ?? []).map(normalizeLink),
    partners: (partnerResult.data ?? []).map(normalizePartner),
  };
}

function toSimulationRule(
  rule: RecommendationEngineEvaluatedRule,
): RecommendationSimulationEvaluatedRule {
  const termChecks = rule.termChecks.map((check) => ({
    term: check.term,
    normalizedTerm: check.normalizedTerm,
    matches: check.matches.map(({ term, normalizedTerm, field }) => ({
      term,
      normalizedTerm,
      field,
    })),
  }));
  const exclusionChecks = rule.exclusionChecks.map((check) => ({
    term: check.term,
    normalizedTerm: check.normalizedTerm,
    matches: check.matches.map(({ term, normalizedTerm, field }) => ({
      term,
      normalizedTerm,
      field,
    })),
  }));
  return { ...rule, termChecks, exclusionChecks };
}

export async function simulateRecommendations(input: unknown): Promise<RecommendationSimulationResult> {
  const { projectKey, normalizedFields, debug } = normalizeInput(input);
  const data = await loadSimulationData(projectKey);
  const engineResult = evaluateRecommendationEngine({
    documents: [{ id: "simulation", label: "Simulation", fields: normalizedFields }],
    ...data,
  });
  const allEvaluatedRules = engineResult.evaluatedRules.map(toSimulationRule);
  const visibleRules = debug
    ? allEvaluatedRules
    : allEvaluatedRules.filter((rule) => rule.status === "matched");
  const matchedCategories = engineResult.matchedCategories.map((category) => {
    const matchedRules = category.matchedRules.map(toSimulationRule);
    const rankedPartners = category.rankedPartners.map((partner) => ({
      id: partner.id,
      partnerCode: partner.partnerCode,
      name: partner.name,
      priority: partner.priority,
    }));
    const winnerPartner = rankedPartners[0] ?? null;
    return {
      id: category.id,
      name: category.name,
      matchedRules,
      rankedPartners,
      winner: winnerPartner
        ? {
            partner: winnerPartner,
            reason: category.winnerReason,
            tieBreakerUsed: category.tieBreakerUsed,
          }
        : null,
      winnerReason: category.winnerReason,
    };
  });
  const matchedRuleCount = allEvaluatedRules.filter((rule) => rule.status === "matched").length;
  const eligiblePartnerCount = matchedCategories.reduce(
    (total, category) => total + category.rankedPartners.length,
    0,
  );
  const winnerCount = matchedCategories.filter((category) => category.winner).length;

  return {
    projectKey,
    normalizedFields: engineResult.normalizedDocuments[0].fields,
    evaluatedRules: visibleRules,
    matchedCategories,
    rankedPartners: matchedCategories.map((category) => ({
      categoryId: category.id,
      categoryName: category.name,
      partners: category.rankedPartners,
    })),
    summary: {
      debug,
      evaluatedRuleCount: allEvaluatedRules.length,
      matchedRuleCount,
      excludedRuleCount: allEvaluatedRules.filter((rule) => rule.status === "excluded").length,
      matchedCategoryCount: matchedCategories.length,
      eligiblePartnerCount,
      winnerCount,
      message: matchedCategories.length > 0
        ? `${matchedCategories.length} passende Kategorien wurden gefunden.`
        : "Keine passende Regel gefunden. Keine Kategorie. Keine Empfehlung.",
    },
  };
}
