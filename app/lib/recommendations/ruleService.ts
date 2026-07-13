import "server-only";

import type {
  RecommendationMatchField,
  RecommendationPatternType,
  RecommendationRule,
} from "@/app/lib/recommendations/types";
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
  recommendationSearch,
  recommendationValidationError,
  throwRecommendationDatabaseError,
} from "@/app/lib/recommendations/serviceSupport";

const RULE_COLUMNS = [
  "id",
  "project_key",
  "category_id",
  "name",
  "pattern_type",
  "terms",
  "excluded_terms",
  "match_fields",
  "priority",
  "active",
  "created_at",
  "updated_at",
].join(",");

const MATCH_FIELDS: RecommendationMatchField[] = [
  "raw_text",
  "normalized_name",
  "category",
  "product_type",
  "notes",
];

export type RecommendationRuleAdminRow = RecommendationRule & {
  category_name: string;
};

export type RecommendationRuleListOptions = {
  projectKey?: string;
  search?: string;
  active?: boolean | null;
  categoryId?: string;
};

function isPatternType(value: unknown): value is RecommendationPatternType {
  return value === "term" || value === "phrase";
}

function isMatchField(value: unknown): value is RecommendationMatchField {
  return typeof value === "string" && MATCH_FIELDS.includes(value as RecommendationMatchField);
}

function normalizedUniqueTextArray(value: unknown, label: string, required: boolean) {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[\n,;]+/)
      : [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of source) {
    if (typeof entry !== "string") continue;
    const text = entry.trim().replace(/\s+/g, " ");
    if (!text) continue;
    const key = text.normalize("NFKC").toLocaleLowerCase("de-DE");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(text);
  }
  if (required && result.length === 0) {
    recommendationValidationError(`${label} benötigt mindestens einen Eintrag.`);
  }
  return result;
}

function normalizeMatchFields(value: unknown) {
  if (!Array.isArray(value)) {
    recommendationValidationError("Bitte mindestens ein gültiges Matchfeld wählen.");
  }
  const result = [...new Set(value.filter(isMatchField))];
  if (result.length !== value.length || result.length === 0) {
    recommendationValidationError("Die Matchfelder enthalten einen ungültigen Wert.");
  }
  return result;
}

function normalizeRuleRow(value: unknown): RecommendationRule {
  const row = recommendationRecord(value);
  if (!isPatternType(row.pattern_type)) {
    recommendationValidationError("Der gespeicherte Regeltyp ist ungültig.");
  }
  return {
    id: recommendationRequiredText(row.id, "Regel-ID"),
    project_key: recommendationRequiredText(row.project_key, "Projekt"),
    category_id: recommendationRequiredText(row.category_id, "Kategorie-ID"),
    name: recommendationRequiredText(row.name, "Name"),
    pattern_type: row.pattern_type,
    terms: normalizedUniqueTextArray(row.terms, "Suchbegriffe", true),
    excluded_terms: normalizedUniqueTextArray(row.excluded_terms, "Ausschlussbegriffe", false),
    match_fields: normalizeMatchFields(row.match_fields),
    priority: recommendationInteger(row.priority, "Die Priorität", -1000, 1000),
    active: row.active === true,
    created_at: recommendationRequiredText(row.created_at, "Erstellzeitpunkt"),
    updated_at: recommendationRequiredText(row.updated_at, "Änderungszeitpunkt"),
  };
}

async function assertRuleCategory(projectKey: string, categoryId: string) {
  assertRecommendationUuid(categoryId, "Die Kategorie-ID");
  const supabase = getRecommendationAdminClient();
  const { data, error } = await supabase
    .from("recommendation_partner_categories")
    .select("id")
    .eq("id", categoryId)
    .eq("project_key", projectKey)
    .maybeSingle();
  if (error) {
    throwRecommendationDatabaseError(error, {
      fallback: "Die Regelkategorie konnte nicht geprüft werden.",
    });
  }
  if (!data) recommendationNotFoundError("Die gewählte Empfehlungskategorie wurde nicht gefunden.");
}

function normalizeRuleInput(input: unknown, current?: RecommendationRule) {
  const body = recommendationRecord(input);
  const projectKey = recommendationProjectKey(
    recommendationHasOwn(body, "projectKey") ? body.projectKey : current?.project_key,
  );
  const categoryId = recommendationRequiredText(
    recommendationHasOwn(body, "categoryId") ? body.categoryId : current?.category_id,
    "Kategorie",
  );
  const patternType = recommendationHasOwn(body, "patternType")
    ? body.patternType
    : current?.pattern_type;
  if (!isPatternType(patternType)) {
    recommendationValidationError("Der Regeltyp muss term oder phrase sein.");
  }
  const matchFields = normalizeMatchFields(
    recommendationHasOwn(body, "matchFields")
      ? body.matchFields
      : current?.match_fields ?? MATCH_FIELDS,
  );
  return {
    project_key: projectKey,
    category_id: categoryId,
    name: recommendationRequiredText(
      recommendationHasOwn(body, "name") ? body.name : current?.name,
      "Name",
    ),
    pattern_type: patternType,
    terms: normalizedUniqueTextArray(
      recommendationHasOwn(body, "terms") ? body.terms : current?.terms,
      "Suchbegriffe",
      true,
    ),
    excluded_terms: normalizedUniqueTextArray(
      recommendationHasOwn(body, "excludedTerms")
        ? body.excludedTerms
        : current?.excluded_terms ?? [],
      "Ausschlussbegriffe",
      false,
    ),
    match_fields: matchFields,
    priority: recommendationInteger(
      recommendationHasOwn(body, "priority") ? body.priority : current?.priority ?? 0,
      "Die Priorität",
      -1000,
      1000,
    ),
    active: recommendationBoolean(
      recommendationHasOwn(body, "active") ? body.active : current?.active ?? true,
      "Der Aktivstatus",
    ),
  };
}

export async function listRecommendationRules(
  options: RecommendationRuleListOptions = {},
): Promise<RecommendationRuleAdminRow[]> {
  const projectKey = recommendationProjectKey(options.projectKey);
  const search = recommendationSearch(options.search);
  const supabase = getRecommendationAdminClient();
  let query = supabase.from("recommendation_rules").select(RULE_COLUMNS).eq("project_key", projectKey);
  if (typeof options.active === "boolean") query = query.eq("active", options.active);
  if (options.categoryId) {
    assertRecommendationUuid(options.categoryId, "Die Kategorie-ID");
    query = query.eq("category_id", options.categoryId);
  }
  if (search) query = query.ilike("name", `%${search}%`);
  const { data, error } = await query
    .order("priority", { ascending: false })
    .order("name", { ascending: true });
  if (error) {
    throwRecommendationDatabaseError(error, {
      fallback: "Empfehlungsregeln konnten nicht geladen werden.",
    });
  }
  const rules = (data ?? []).map(normalizeRuleRow);
  if (rules.length === 0) return [];
  const categoryIds = [...new Set(rules.map((rule) => rule.category_id))];
  const { data: categories, error: categoryError } = await supabase
    .from("recommendation_partner_categories")
    .select("id,name")
    .eq("project_key", projectKey)
    .in("id", categoryIds);
  if (categoryError) {
    throwRecommendationDatabaseError(categoryError, {
      fallback: "Regelkategorien konnten nicht geladen werden.",
    });
  }
  const categoryNames = new Map(
    (categories ?? []).map((value) => {
      const row = recommendationRecord(value);
      return [String(row.id ?? ""), String(row.name ?? "")] as const;
    }),
  );
  return rules.map((rule) => ({
    ...rule,
    category_name: categoryNames.get(rule.category_id) || "Unbekannte Kategorie",
  }));
}

export async function getRecommendationRuleById(
  id: string,
  projectKeyValue?: string,
) {
  assertRecommendationUuid(id, "Die Regel-ID");
  const projectKey = recommendationProjectKey(projectKeyValue);
  const supabase = getRecommendationAdminClient();
  const { data, error } = await supabase
    .from("recommendation_rules")
    .select(RULE_COLUMNS)
    .eq("id", id)
    .eq("project_key", projectKey)
    .maybeSingle();
  if (error) {
    throwRecommendationDatabaseError(error, {
      fallback: "Die Empfehlungsregel konnte nicht geladen werden.",
    });
  }
  if (!data) recommendationNotFoundError("Die Empfehlungsregel wurde nicht gefunden.");
  return normalizeRuleRow(data);
}

export async function createRecommendationRule(input: unknown) {
  const values = normalizeRuleInput(input);
  await assertRuleCategory(values.project_key, values.category_id);
  const supabase = getRecommendationAdminClient();
  const { data, error } = await supabase
    .from("recommendation_rules")
    .insert(values)
    .select(RULE_COLUMNS)
    .single();
  if (error) {
    throwRecommendationDatabaseError(error, {
      fallback: "Die Empfehlungsregel konnte nicht angelegt werden.",
    });
  }
  return normalizeRuleRow(data);
}

export async function updateRecommendationRule(
  id: string,
  input: unknown,
  currentProjectKey?: string,
) {
  const current = await getRecommendationRuleById(id, currentProjectKey);
  const values = normalizeRuleInput(input, current);
  await assertRuleCategory(values.project_key, values.category_id);
  const supabase = getRecommendationAdminClient();
  const { data, error } = await supabase
    .from("recommendation_rules")
    .update(values)
    .eq("id", id)
    .eq("project_key", current.project_key)
    .select(RULE_COLUMNS)
    .single();
  if (error) {
    throwRecommendationDatabaseError(error, {
      fallback: "Die Empfehlungsregel konnte nicht gespeichert werden.",
    });
  }
  return normalizeRuleRow(data);
}

export async function setRecommendationRuleActive(
  id: string,
  active: boolean,
  projectKey?: string,
) {
  recommendationBoolean(active, "Der Aktivstatus");
  return updateRecommendationRule(id, { active }, projectKey);
}

export async function deleteRecommendationRule(
  id: string,
  projectKeyValue?: string,
) {
  const rule = await getRecommendationRuleById(id, projectKeyValue);
  const supabase = getRecommendationAdminClient();
  const { error } = await supabase
    .from("recommendation_rules")
    .delete()
    .eq("id", id)
    .eq("project_key", rule.project_key);
  if (error) {
    throwRecommendationDatabaseError(error, {
      fallback: "Die Empfehlungsregel konnte nicht gelöscht werden.",
    });
  }
}
