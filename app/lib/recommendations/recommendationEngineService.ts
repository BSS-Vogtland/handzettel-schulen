import type {
  RecommendationMatchField,
  RecommendationPatternType,
  RecommendationSimulationFields,
  RecommendationSimulationRuleStatus,
} from "@/app/lib/recommendations/types";

export const RECOMMENDATION_MATCH_FIELDS: RecommendationMatchField[] = [
  "raw_text",
  "normalized_name",
  "category",
  "product_type",
  "notes",
];

export type RecommendationEngineDocument = {
  id: string;
  label: string;
  fields: RecommendationSimulationFields;
};

export type RecommendationEngineRule = {
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

export type RecommendationEngineCategory = {
  id: string;
  name: string;
  active: boolean;
  sortOrder: number;
};

export type RecommendationEngineLink = {
  partnerId: string;
  categoryId: string;
  priority: number;
  active: boolean;
};

export type RecommendationEnginePartner = {
  id: string;
  partnerCode: string;
  name: string;
  slug?: string;
  active: boolean;
  description?: string | null;
  targetUrl?: string;
  logoUrl?: string | null;
};

export type RecommendationEngineMatch = {
  term: string;
  normalizedTerm: string;
  field: RecommendationMatchField;
  documentId: string;
  documentLabel: string;
};

export type RecommendationEngineTermCheck = {
  term: string;
  normalizedTerm: string;
  matches: RecommendationEngineMatch[];
};

export type RecommendationEngineEvaluatedRule = {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  patternType: RecommendationPatternType;
  priority: number;
  status: RecommendationSimulationRuleStatus;
  reason: string;
  checkedFields: RecommendationMatchField[];
  termChecks: RecommendationEngineTermCheck[];
  exclusionChecks: RecommendationEngineTermCheck[];
};

export type RecommendationEngineRankedPartner = RecommendationEnginePartner & {
  priority: number;
};

export type RecommendationEngineMatchedCategory = {
  id: string;
  name: string;
  sortOrder: number;
  matchedRules: RecommendationEngineEvaluatedRule[];
  rankedPartners: RecommendationEngineRankedPartner[];
  winner: RecommendationEngineRankedPartner | null;
  winnerReason: string;
  tieBreakerUsed: boolean;
};

export type RecommendationEngineResult = {
  normalizedDocuments: RecommendationEngineDocument[];
  evaluatedRules: RecommendationEngineEvaluatedRule[];
  matchedCategories: RecommendationEngineMatchedCategory[];
};

export function normalizeRecommendationText(value: string) {
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

function normalizeFields(fields: RecommendationSimulationFields) {
  return Object.fromEntries(
    RECOMMENDATION_MATCH_FIELDS.map((field) => [
      field,
      normalizeRecommendationText(fields[field] ?? ""),
    ]),
  ) as RecommendationSimulationFields;
}

function normalizedUniqueTerms(values: string[]) {
  const seen = new Set<string>();
  return values.flatMap((term) => {
    const normalizedTerm = normalizeRecommendationText(term);
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
  documents: RecommendationEngineDocument[],
) {
  return normalizedUniqueTerms(values).map(({ term, normalizedTerm }) => {
    const matches = documents.flatMap((document) =>
      fields.flatMap((field): RecommendationEngineMatch[] =>
        containsTokenSequence(document.fields[field], normalizedTerm)
          ? [{
              term,
              normalizedTerm,
              field,
              documentId: document.id,
              documentLabel: document.label,
            }]
          : [],
      ),
    );
    return { term, normalizedTerm, matches };
  });
}

function evaluateRule(
  rule: RecommendationEngineRule,
  category: RecommendationEngineCategory | undefined,
  documents: RecommendationEngineDocument[],
): RecommendationEngineEvaluatedRule {
  const termChecks = buildTermChecks(rule.terms, rule.matchFields, documents);
  const exclusionChecks = buildTermChecks(rule.excludedTerms, rule.matchFields, documents);
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
  links: RecommendationEngineLink[],
  partners: RecommendationEnginePartner[],
) {
  const partnerMap = new Map(partners.map((partner) => [partner.id, partner]));
  const rankedByPartnerId = new Map<string, RecommendationEngineRankedPartner>();

  for (const link of links) {
    if (link.categoryId !== categoryId || !link.active) continue;
    const partner = partnerMap.get(link.partnerId);
    if (!partner?.active) continue;
    const current = rankedByPartnerId.get(partner.id);
    if (!current || link.priority > current.priority) {
      rankedByPartnerId.set(partner.id, { ...partner, priority: link.priority });
    }
  }

  return [...rankedByPartnerId.values()].sort(
    (left, right) =>
      right.priority - left.priority || left.name.localeCompare(right.name, "de"),
  );
}

export function evaluateRecommendationEngine(input: {
  documents: RecommendationEngineDocument[];
  rules: RecommendationEngineRule[];
  categories: RecommendationEngineCategory[];
  links: RecommendationEngineLink[];
  partners: RecommendationEnginePartner[];
}): RecommendationEngineResult {
  const normalizedDocuments = input.documents.map((document) => ({
    ...document,
    fields: normalizeFields(document.fields),
  }));
  const categoryMap = new Map(input.categories.map((category) => [category.id, category]));
  const evaluatedRules = input.rules.map((rule) =>
    evaluateRule(rule, categoryMap.get(rule.categoryId), normalizedDocuments),
  );
  const matchedRules = evaluatedRules.filter((rule) => rule.status === "matched");
  const matchedCategoryIds = new Set(matchedRules.map((rule) => rule.categoryId));
  const matchedCategories = input.categories
    .filter((category) => category.active && matchedCategoryIds.has(category.id))
    .sort(
      (left, right) =>
        left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, "de"),
    )
    .map((category): RecommendationEngineMatchedCategory => {
      const categoryRules = matchedRules
        .filter((rule) => rule.categoryId === category.id)
        .sort(
          (left, right) =>
            right.priority - left.priority || left.name.localeCompare(right.name, "de"),
        );
      const rankedPartners = rankCategoryPartners(category.id, input.links, input.partners);
      const winner = rankedPartners[0] ?? null;
      const tieBreakerUsed = Boolean(
        winner && rankedPartners[1]?.priority === winner.priority,
      );
      const winnerReason = winner
        ? tieBreakerUsed
          ? `Höchste Priorität ${winner.priority}; bei gleicher Priorität entschied der Partnername als stabiler Tie-Breaker.`
          : `Höchste Partner-Kategorie-Priorität ${winner.priority}.`
        : "Kein aktiver Partner mit aktiver Kategoriezuordnung verfügbar.";

      return {
        id: category.id,
        name: category.name,
        sortOrder: category.sortOrder,
        matchedRules: categoryRules,
        rankedPartners,
        winner,
        winnerReason,
        tieBreakerUsed,
      };
    });

  return { normalizedDocuments, evaluatedRules, matchedCategories };
}
