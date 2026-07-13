import "server-only";

import type {
  RecommendationMatchField,
  RecommendationPatternType,
  RecommendationSimulationCategory,
  RecommendationSimulationEvaluatedRule,
  RecommendationSimulationFields,
  RecommendationSimulationMatch,
  RecommendationSimulationPartner,
  RecommendationSimulationResult,
  RecommendationSimulationRuleStatus,
  RecommendationSimulationTermCheck,
} from "@/app/lib/recommendations/types";
import {
  getRecommendationAdminClient,
  recommendationProjectKey,
  recommendationRecord,
  recommendationRequiredText,
  recommendationValidationError,
  throwRecommendationDatabaseError,
} from "@/app/lib/recommendations/serviceSupport";

const MATCH_FIELDS: RecommendationMatchField[] = [
  "raw_text",
  "normalized_name",
  "category",
  "product_type",
  "notes",
];
const MAX_INPUT_LENGTH = 10_000;
const MAX_RULES = 500;
const MAX_CATEGORIES = 500;
const MAX_PARTNERS = 1_000;
const MAX_LINKS = 2_000;

type SimulationRuleRow = {
  id: string;
  categoryId: string;
  name: string;
  patternType: RecommendationPatternType;
  terms: string[];
  excludedTerms: string[];
  matchFields: RecommendationMatchField[];
  priority: number;
  active: boolean;
};

type SimulationCategoryRow = {
  id: string;
  name: string;
  active: boolean;
  sortOrder: number;
};

type SimulationLinkRow = {
  partnerId: string;
  categoryId: string;
  priority: number;
  active: boolean;
};

type SimulationPartnerRow = {
  id: string;
  partnerCode: string;
  name: string;
  active: boolean;
};

function isPatternType(value: unknown): value is RecommendationPatternType {
  return value === "term" || value === "phrase";
}

function isMatchField(value: unknown): value is RecommendationMatchField {
  return typeof value === "string" && MATCH_FIELDS.includes(value as RecommendationMatchField);
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

export function normalizeRecommendationSimulationText(value: string) {
  return value
    .normalize("NFC")
    .toLocaleLowerCase("de-DE")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedUniqueTerms(values: string[]) {
  const seen = new Set<string>();
  return values.flatMap((term) => {
    const normalizedTerm = normalizeRecommendationSimulationText(term);
    if (!normalizedTerm || seen.has(normalizedTerm)) return [];
    seen.add(normalizedTerm);
    return [{ term: term.trim(), normalizedTerm }];
  });
}

function containsTokenSequence(fieldValue: string, normalizedTerm: string) {
  if (!fieldValue || !normalizedTerm) return false;
  const fieldTokens = fieldValue.split(" ");
  const termTokens = normalizedTerm.split(" ");
  if (termTokens.length > fieldTokens.length) return false;
  return fieldTokens.some((_, start) =>
    termTokens.every((token, offset) => fieldTokens[start + offset] === token),
  );
}

function buildTermChecks(
  values: string[],
  fields: RecommendationMatchField[],
  normalizedFields: RecommendationSimulationFields,
): RecommendationSimulationTermCheck[] {
  return normalizedUniqueTerms(values).map(({ term, normalizedTerm }) => {
    const matches: RecommendationSimulationMatch[] = fields.flatMap((field) =>
      containsTokenSequence(normalizedFields[field], normalizedTerm)
        ? [{ term, normalizedTerm, field }]
        : [],
    );
    return { term, normalizedTerm, matches };
  });
}

function normalizeInput(input: unknown) {
  const body = recommendationRecord(input);
  const fields = recommendationRecord(body.fields);
  const normalizedInputFields = {} as RecommendationSimulationFields;
  let totalLength = 0;

  for (const field of MATCH_FIELDS) {
    const value = fields[field];
    if (value !== undefined && typeof value !== "string") {
      recommendationValidationError(`Das simulierte Feld ${field} ist ungültig.`);
    }
    const text = typeof value === "string" ? value.trim() : "";
    totalLength += text.length;
    normalizedInputFields[field] = normalizeRecommendationSimulationText(text);
  }

  if (!normalizedInputFields.raw_text) {
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
    normalizedFields: normalizedInputFields,
    debug: body.debug === true,
  };
}

function normalizeRule(value: unknown): SimulationRuleRow {
  const row = recommendationRecord(value);
  if (!isPatternType(row.pattern_type)) recommendationValidationError("Ein gespeicherter Regeltyp ist ungültig.");
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

function normalizeCategory(value: unknown): SimulationCategoryRow {
  const row = recommendationRecord(value);
  return {
    id: recommendationRequiredText(row.id, "Kategorie-ID"),
    name: recommendationRequiredText(row.name, "Kategoriename"),
    active: row.active === true,
    sortOrder: integer(row.sort_order, "Die Kategoriesortierung", 0, 1_000_000),
  };
}

function normalizeLink(value: unknown): SimulationLinkRow {
  const row = recommendationRecord(value);
  return {
    partnerId: recommendationRequiredText(row.partner_id, "Partner-ID"),
    categoryId: recommendationRequiredText(row.category_id, "Kategorie-ID"),
    priority: integer(row.priority, "Die Partnerpriorität", -1000, 1000),
    active: row.active === true,
  };
}

function normalizePartner(value: unknown): SimulationPartnerRow {
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

  const results = [ruleResult, categoryResult, linkResult, partnerResult];
  const databaseError = results.find((result) => result.error)?.error;
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

function evaluateRule(
  rule: SimulationRuleRow,
  category: SimulationCategoryRow | undefined,
  normalizedFields: RecommendationSimulationFields,
): RecommendationSimulationEvaluatedRule {
  const termChecks = buildTermChecks(rule.terms, rule.matchFields, normalizedFields);
  const exclusionChecks = buildTermChecks(rule.excludedTerms, rule.matchFields, normalizedFields);
  const matchedTerms = termChecks.flatMap((check) => check.matches);
  const matchedExclusions = exclusionChecks.flatMap((check) => check.matches);
  let status: RecommendationSimulationRuleStatus;
  let reason: string;

  if (!rule.active) {
    status = "disabled";
    reason = "Die Regel ist deaktiviert und kann keine Kategorie aktivieren.";
  } else if (!category?.active) {
    status = "category_disabled";
    reason = category
      ? "Die zugehörige Kategorie ist deaktiviert."
      : "Die zugehörige Kategorie wurde nicht gefunden.";
  } else if (matchedExclusions.length > 0) {
    status = "excluded";
    const first = matchedExclusions[0];
    reason = `Ausschlussbegriff „${first.term}“ traf im Feld ${first.field}.`;
  } else if (matchedTerms.length > 0) {
    status = "matched";
    reason = rule.patternType === "phrase"
      ? "Mindestens eine zusammenhängende Wortfolge traf in einem konfigurierten Feld."
      : "Mindestens ein vollständiger Begriff traf an Wortgrenzen in einem konfigurierten Feld.";
  } else {
    status = "not_matched";
    reason = "Kein Regelbegriff traf in den konfigurierten Feldern.";
  }

  return {
    id: rule.id,
    name: rule.name,
    categoryId: rule.categoryId,
    categoryName: category?.name ?? "Unbekannte Kategorie",
    patternType: rule.patternType,
    priority: rule.priority,
    status,
    reason,
    checkedFields: rule.matchFields,
    termChecks,
    exclusionChecks,
  };
}

function rankCategoryPartners(
  categoryId: string,
  links: SimulationLinkRow[],
  partners: SimulationPartnerRow[],
) {
  const partnerMap = new Map(partners.map((partner) => [partner.id, partner]));
  return links
    .filter((link) => link.categoryId === categoryId && link.active)
    .flatMap((link): RecommendationSimulationPartner[] => {
      const partner = partnerMap.get(link.partnerId);
      if (!partner?.active) return [];
      return [{
        id: partner.id,
        partnerCode: partner.partnerCode,
        name: partner.name,
        priority: link.priority,
      }];
    })
    .sort(
      (left, right) =>
        right.priority - left.priority || left.name.localeCompare(right.name, "de"),
    );
}

function buildMatchedCategory(
  category: SimulationCategoryRow,
  matchedRules: RecommendationSimulationEvaluatedRule[],
  links: SimulationLinkRow[],
  partners: SimulationPartnerRow[],
): RecommendationSimulationCategory {
  const rankedPartners = rankCategoryPartners(category.id, links, partners);
  const first = rankedPartners[0];
  const tieBreakerUsed = Boolean(first && rankedPartners[1]?.priority === first.priority);
  const winnerReason = first
    ? tieBreakerUsed
      ? `Höchste Priorität ${first.priority}; bei gleicher Priorität entschied der Partnername als stabiler Tie-Breaker.`
      : `Höchste Partner-Kategorie-Priorität ${first.priority}.`
    : "Kein aktiver Partner mit aktiver Kategoriezuordnung verfügbar.";

  return {
    id: category.id,
    name: category.name,
    matchedRules: matchedRules.sort(
      (left, right) => right.priority - left.priority || left.name.localeCompare(right.name, "de"),
    ),
    rankedPartners,
    winner: first
      ? { partner: first, reason: winnerReason, tieBreakerUsed }
      : null,
    winnerReason,
  };
}

export async function simulateRecommendations(input: unknown): Promise<RecommendationSimulationResult> {
  const { projectKey, normalizedFields, debug } = normalizeInput(input);
  const { rules, categories, links, partners } = await loadSimulationData(projectKey);
  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  const allEvaluatedRules = rules.map((rule) =>
    evaluateRule(rule, categoryMap.get(rule.categoryId), normalizedFields),
  );
  const matchedRules = allEvaluatedRules.filter((rule) => rule.status === "matched");
  const matchedCategoryIds = new Set(matchedRules.map((rule) => rule.categoryId));
  const matchedCategories = categories
    .filter((category) => category.active && matchedCategoryIds.has(category.id))
    .sort(
      (left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, "de"),
    )
    .map((category) =>
      buildMatchedCategory(
        category,
        matchedRules.filter((rule) => rule.categoryId === category.id),
        links,
        partners,
      ),
    );
  const eligiblePartnerCount = matchedCategories.reduce(
    (total, category) => total + category.rankedPartners.length,
    0,
  );
  const winnerCount = matchedCategories.filter((category) => category.winner).length;

  return {
    projectKey,
    normalizedFields,
    evaluatedRules: debug ? allEvaluatedRules : matchedRules,
    matchedCategories,
    rankedPartners: matchedCategories.map((category) => ({
      categoryId: category.id,
      categoryName: category.name,
      partners: category.rankedPartners,
    })),
    summary: {
      debug,
      evaluatedRuleCount: allEvaluatedRules.length,
      matchedRuleCount: matchedRules.length,
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
