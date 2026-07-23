import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  recommendationAttributionCookieName,
  RECOMMENDATION_REFERRER_POLICY,
} from "../app/lib/recommendations/recommendationAttribution.ts";
import { recommendationContextSecret } from "../app/lib/recommendations/recommendationContextSecret.ts";
import {
  createRecommendationRedirectContextCore,
  readRecommendationRedirectContextCore,
} from "../app/lib/recommendations/recommendationRedirectContextCore.ts";
import { addRecommendationClickTokenToUrl } from "../app/lib/recommendations/recommendationUrl.ts";

const CLICK_A1 = "A".repeat(32);
const CLICK_A2 = "B".repeat(32);
const CLICK_B = "C".repeat(32);
const PROJECT = "handzettel-schulen";
const PARTNER_A = "11111111-1111-4111-8111-111111111111";
const PARTNER_B = "22222222-2222-4222-8222-222222222222";
const SECRET = "test-only-recommendation-secret-32-characters";

test("ein Cookie je Partner und Last-Click nur innerhalb des Partners", () => {
  const cookieA = recommendationAttributionCookieName(PROJECT, PARTNER_A);
  const cookieB = recommendationAttributionCookieName(PROJECT, PARTNER_B);
  assert.match(cookieA, /^hds_rec_[0-9a-f]{16}$/);
  assert.notEqual(cookieA, cookieB);
  assert.equal(cookieA, recommendationAttributionCookieName(PROJECT, PARTNER_A));
  assert.equal(cookieA.includes(PARTNER_A), false);

  const jar = new Map();
  jar.set(cookieA, CLICK_A1);
  jar.set(cookieB, CLICK_B);
  assert.equal(jar.get(cookieA), CLICK_A1);
  assert.equal(jar.get(cookieB), CLICK_B);

  jar.set(cookieA, CLICK_A2);
  assert.equal(jar.get(cookieA), CLICK_A2);
  assert.equal(jar.get(cookieB), CLICK_B);
  assert.equal(jar.size, 2);
});

test("hz_click wird ergänzt, ersetzt und vor dem Fragment platziert", () => {
  assert.equal(
    addRecommendationClickTokenToUrl("https://partner.test/path", CLICK_A1),
    `https://partner.test/path?hz_click=${CLICK_A1}`,
  );
  assert.equal(
    addRecommendationClickTokenToUrl("https://partner.test/path?source=hds", CLICK_A1),
    `https://partner.test/path?source=hds&hz_click=${CLICK_A1}`,
  );
  assert.equal(
    addRecommendationClickTokenToUrl(
      `https://partner.test/path?hz_click=old&source=hds#details`,
      CLICK_A1,
    ),
    `https://partner.test/path?hz_click=${CLICK_A1}&source=hds#details`,
  );
  assert.equal(
    addRecommendationClickTokenToUrl(
      "https://partner.test/path?hz_click=old&hz_click=older",
      CLICK_A1,
    ),
    `https://partner.test/path?hz_click=${CLICK_A1}`,
  );
});

test("hz_click überträgt keine internen IDs und lehnt unsichere Ziele ab", () => {
  const target = addRecommendationClickTokenToUrl(
    "https://partner.test/path?source=hds#details",
    CLICK_A1,
  );
  assert.ok(target);
  for (const internalName of [
    "request_id",
    "child_id",
    "request_item_id",
    "offer_token",
    "partner_id",
    "category_id",
    "rule_id",
    "context",
  ]) {
    assert.equal(new URL(target).searchParams.has(internalName), false);
  }
  assert.equal(addRecommendationClickTokenToUrl("javascript:alert(1)", CLICK_A1), null);
  assert.equal(addRecommendationClickTokenToUrl("https://user:pass@partner.test", CLICK_A1), null);
});

test("fehlendes oder zu kurzes Kontext-Secret wird kontrolliert abgelehnt", () => {
  assert.throws(
    () => recommendationContextSecret({ NODE_ENV: "production" }),
    /nicht sicher konfiguriert/,
  );
  assert.throws(
    () => recommendationContextSecret({
      NODE_ENV: "production",
      RECOMMENDATION_CONTEXT_SECRET: "too-short",
    }),
    /nicht sicher konfiguriert/,
  );
  assert.equal(
    recommendationContextSecret({ RECOMMENDATION_CONTEXT_SECRET: SECRET }),
    SECRET,
  );
});

test("lokale Entwicklung erhält ein flüchtiges stabiles Prozess-Secret", () => {
  const first = recommendationContextSecret({ NODE_ENV: "development" });
  const second = recommendationContextSecret({ NODE_ENV: "development" });
  assert.equal(first, second);
  assert.ok(first.length >= 32);
});

test("manipulierter Kontext wird abgelehnt und enthält keine Personendaten", () => {
  const now = Date.UTC(2026, 6, 14);
  const token = createRecommendationRedirectContextCore({
    projectKey: PROJECT,
    partnerId: PARTNER_A,
    partnerSlug: "partner-a",
    categoryId: "33333333-3333-4333-8333-333333333333",
    ruleId: "44444444-4444-4444-8444-444444444444",
    requestId: "55555555-5555-4555-8555-555555555555",
    childId: "66666666-6666-4666-8666-666666666666",
    requestItemId: "77777777-7777-4777-8777-777777777777",
    matchedTerm: "turnschuhe",
  }, SECRET, now);
  const parsed = readRecommendationRedirectContextCore(token, SECRET, now);
  assert.ok(parsed);
  for (const forbiddenName of [
    "customerName",
    "email",
    "phone",
    "address",
    "schoolName",
    "childName",
    "offerToken",
  ]) {
    assert.equal(Object.hasOwn(parsed, forbiddenName), false);
  }

  const bytes = Buffer.from(token, "base64url");
  bytes[bytes.length - 1] ^= 1;
  const manipulated = bytes.toString("base64url");
  assert.equal(readRecommendationRedirectContextCore(manipulated, SECRET, now), null);
});

test("Redirect behält no-referrer, sichere Cookies und Bot-Ausnahme", async () => {
  assert.equal(RECOMMENDATION_REFERRER_POLICY, "no-referrer");
  const routeSource = await readFile(
    new URL("../app/empfehlung/[partnerSlug]/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(routeSource, /if \(!click\.isProbableBot\)/);
  assert.match(routeSource, /httpOnly: true/);
  assert.match(routeSource, /secure: process\.env\.NODE_ENV === "production"/);
  assert.match(routeSource, /sameSite: "lax"/);
  assert.match(routeSource, /path: "\/"/);
  assert.match(routeSource, /maxAge: click\.attributionMaxAgeSeconds/);
});

test("Klickservice nutzt 192-Bit-Token und serverseitige Kontextvalidierung", async () => {
  const serviceSource = await readFile(
    new URL("../app/lib/recommendations/recommendationClickService.ts", import.meta.url),
    "utf8",
  );
  assert.match(serviceSource, /randomBytes\(24\)\.toString\("base64url"\)/);
  for (const table of [
    "recommendation_partners",
    "recommendation_partner_categories",
    "recommendation_rules",
    "recommendation_partner_category_links",
    "school_requests",
    "school_request_items",
  ]) {
    assert.match(serviceSource, new RegExp(`\\.from\\("${table}"\\)`));
  }
  assert.doesNotMatch(serviceSource, /offer_token/);
});
