import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { evaluateRecommendationEngine } from "../app/lib/recommendations/recommendationEngineService.ts";

const category = {
  id: "category-sport",
  name: "Schulsport und Sportbekleidung",
  active: true,
  sortOrder: 10,
};
const partner = {
  id: "partner-sport",
  partnerCode: "SPORT",
  name: "Muster Sportpartner",
  slug: "muster-sportpartner",
  active: true,
  targetUrl: "https://partner.test",
};
const baseInput = {
  categories: [category],
  partners: [partner],
  links: [{
    partnerId: partner.id,
    categoryId: category.id,
    priority: 100,
    active: true,
  }],
};

function evaluate(rawText) {
  return evaluateRecommendationEngine({
    ...baseInput,
    documents: [{
      id: "request-item",
      label: rawText,
      fields: {
        raw_text: rawText,
        normalized_name: "",
        category: "",
        product_type: "",
        notes: "",
      },
    }],
    rules: [{
      id: "rule-sport",
      categoryId: category.id,
      name: "Sportbekleidung und Sportschuhe erkennen",
      patternType: "term",
      terms: ["sportkleidung", "turnschuhe"],
      excludedTerms: [],
      matchFields: ["raw_text"],
      priority: 100,
      active: true,
    }],
  });
}

test("offene Sportkleidung und Turnschuhe aktivieren die Sportempfehlung", () => {
  for (const rawText of [
    "lange und kurze Sportkleidung",
    "Turnschuhe mit abriebfester Sohle",
  ]) {
    const result = evaluate(rawText);
    assert.equal(result.matchedCategories.length, 1);
    assert.equal(result.matchedCategories[0].winner?.name, partner.name);
  }
});

test("dieselbe Kategorie behält Matches für mehrere konkrete Positionen", () => {
  const result = evaluateRecommendationEngine({
    ...baseInput,
    documents: [
      {
        id: "sport-lang",
        label: "Sportkleidung lang",
        fields: {
          raw_text: "lange Sportkleidung",
          normalized_name: "Sportkleidung lang",
          category: "",
          product_type: "",
          notes: "",
        },
      },
      {
        id: "sport-kurz",
        label: "Sportkleidung kurz",
        fields: {
          raw_text: "kurze Sportkleidung",
          normalized_name: "Sportkleidung kurz",
          category: "",
          product_type: "",
          notes: "",
        },
      },
    ],
    rules: [{
      id: "rule-sport",
      categoryId: category.id,
      name: "Sportbekleidung erkennen",
      patternType: "term",
      terms: ["sportkleidung"],
      excludedTerms: [],
      matchFields: ["raw_text", "normalized_name"],
      priority: 100,
      active: true,
    }],
  });
  const matchedDocumentIds = new Set(
    result.matchedCategories[0].matchedRules.flatMap((rule) =>
      rule.termChecks.flatMap((check) =>
        check.matches.map((match) => match.documentId),
      ),
    ),
  );
  assert.deepEqual(matchedDocumentIds, new Set(["sport-lang", "sport-kurz"]));
});

test("ohne passenden Regelbegriff entsteht keine Kategorie", () => {
  assert.equal(evaluate("Deutschheft Lineatur 1").matchedCategories.length, 0);
});

test("Kundenfilter lassen customer_supplies_self zu und sperren Abdeckungen", async () => {
  const serviceSource = await readFile(
    new URL("../app/lib/recommendations/customerRecommendationService.ts", import.meta.url),
    "utf8",
  );
  for (const excludedStatus of [
    "covered_by_alternative",
    "not_needed",
    "resolved",
    "done",
    "ignored",
  ]) {
    assert.match(serviceSource, new RegExp(`"${excludedStatus}"`));
  }
  assert.doesNotMatch(
    serviceSource.match(/const EXCLUDED_MATERIAL_STATUSES[\s\S]*?\]\);/)?.[0] ?? "",
    /customer_supplies_self/,
  );
  assert.match(serviceSource, /coveredRequestItemIds\.has\(material\.id\)/);
  assert.match(serviceSource, /material\.childId && !activeChildIds\.has\(material\.childId\)/);
});

test("archivierte und abgeschlossene Anfragen bleiben ausgeschlossen", async () => {
  const serviceSource = await readFile(
    new URL("../app/lib/recommendations/customerRecommendationService.ts", import.meta.url),
    "utf8",
  );
  for (const status of ["archived", "confirmed", "ordered", "checkout_completed"]) {
    assert.match(serviceSource, new RegExp(`"${status}"`));
  }
  assert.match(serviceSource, /Boolean\(context\.request\.archivedAt\)/);
});

test("Decision- und Team-Hard-Gate liegen vor Service und Rendering", async () => {
  const pageSource = await readFile(
    new URL("../app/angebot/[token]/page.tsx", import.meta.url),
    "utf8",
  );
  const decisionReturn = pageSource.indexOf('customerOpenPositionScreenMode === "decision"');
  const teamGate = pageSource.indexOf("data-team-mode-hard-gate");
  const serviceCall = pageSource.indexOf("await getCustomerPartnerRecommendations");
  const recommendationRender = pageSource.lastIndexOf("<CustomerPartnerRecommendations");
  assert.ok(decisionReturn >= 0 && decisionReturn < serviceCall);
  assert.ok(teamGate >= 0 && teamGate < serviceCall);
  assert.ok(serviceCall >= 0 && serviceCall < recommendationRender);
});

test("leere Empfehlungen rendern keinen Block", async () => {
  const componentSource = await readFile(
    new URL("../components/CustomerPartnerRecommendations.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    componentSource,
    /if \(safeRecommendations\.length === 0\) \{\s*return null;/,
  );
});

test("Kundenmodell und Service ordnen jede Empfehlung einer Position zu", async () => {
  const [typeSource, serviceSource] = await Promise.all([
    readFile(
      new URL("../app/lib/recommendations/customerRecommendationTypes.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/lib/recommendations/customerRecommendationService.ts", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(typeSource, /requestItemId: string/);
  assert.match(serviceSource, /firstMatchByMaterialId/);
  assert.match(serviceSource, /requestItemId: matchedMaterial\.id/);
});

test("globale Boxen sind entfernt und nur Positionskarten filtern nach requestItemId", async () => {
  const [pageSource, componentSource] = await Promise.all([
    readFile(
      new URL("../app/angebot/[token]/page.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../components/CustomerPartnerRecommendations.tsx", import.meta.url),
      "utf8",
    ),
  ]);
  const componentCalls = pageSource.match(/<CustomerPartnerRecommendations/g) ?? [];
  const itemFilters = pageSource.match(/recommendation\.requestItemId === item\.id/g) ?? [];
  assert.equal(componentCalls.length, 4);
  assert.equal(itemFilters.length, 4);
  assert.doesNotMatch(componentSource, /Passende Empfehlungen|Für Deine Materialliste/);

  const finalReviewStart = pageSource.indexOf("if (isCustomerFinalReview)");
  const finalReviewEnd = pageSource.indexOf("const isFreshBeforeAnalysis");
  assert.ok(finalReviewStart >= 0 && finalReviewEnd > finalReviewStart);
  assert.doesNotMatch(
    pageSource.slice(finalReviewStart, finalReviewEnd),
    /CustomerPartnerRecommendations/,
  );
});
