import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const maintenanceUrl = new URL("../lib/checkoutMaintenance.ts", import.meta.url).href;
const permitsUrl = new URL("../lib/checkoutTestPermits.ts", import.meta.url).href;
const maintenance = await import(maintenanceUrl);
const permits = await import(permitsUrl);

const PERMIT_ID = "00000000-0000-4000-8000-000000000001";
const NOW = "2026-08-03T01:00:00.000Z";
const LATER = "2026-08-03T01:10:00.000Z";
const OFFER_A = "AbC0123456789_-X";
const OFFER_B = "AbC0123456789_-Y";
const RAW_PERMIT = "b".repeat(64);

type StoredPermit = {
  hash: string;
  targetHash: string;
  status: "available" | "consumed" | "expired" | "cancelled";
  expiresAt: number;
};

function atomicClient(stored: StoredPermit) {
  return {
    async rpc(name: string, params: Record<string, unknown>) {
      assert.equal(name, "consume_checkout_test_permit");
      const eligible =
        stored.status === "available" &&
        stored.expiresAt > Date.now() &&
        stored.hash === params.p_permit_hash &&
        params.p_checkout_type === "offer" &&
        stored.targetHash === params.p_target_reference_hash;
      if (!eligible) return { data: [], error: null };
      stored.status = "consumed";
      return { data: [{ permit_id: PERMIT_ID, consumed_at: NOW }], error: null };
    },
  };
}

async function decision(
  overrides: Record<string, unknown> = {},
  consumePermit = async () => ({ permitId: PERMIT_ID, consumedAt: NOW }),
) {
  return maintenance.resolveCheckoutMaintenanceAccess({
    maintenanceActive: true,
    adminAuthenticated: true,
    sameOrigin: true,
    maintenanceTestHeader: "true",
    confirmation: permits.CHECKOUT_MAINTENANCE_TEST_CONFIRMATION,
    permitToken: RAW_PERMIT,
    expectedConfirmation: permits.CHECKOUT_MAINTENANCE_TEST_CONFIRMATION,
    consumePermit,
    ...overrides,
  });
}

const shopSource = readFileSync("app/api/shop/checkout/route.ts", "utf8");
const offerSource = readFileSync("app/api/offer/[token]/checkout/route.ts", "utf8");
const shopClientSource = readFileSync("app/shop/kasse/ShopKasseClient.tsx", "utf8");
const offerClientSource = readFileSync("app/angebot/[token]/checkout/page.tsx", "utf8");
const adminSource = readFileSync("app/api/admin/checkout-test-permits/route.ts", "utf8");
const permitSource = readFileSync("lib/checkoutTestPermits.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260803040000_checkout_test_permits.sql", "utf8");

const publicMaintenance = maintenance.getCheckoutMaintenanceDecision();
assert.equal(publicMaintenance.active, false);
assert.equal(publicMaintenance.httpStatus, 503);
assert.equal(publicMaintenance.code, "CHECKOUT_MAINTENANCE");
console.log("A PASS");

assert.doesNotMatch(shopSource, /checkoutTestPermit|CheckoutTestPermit|resolveCheckoutMaintenanceAccess|maintenance_test_bypass/);
assert.match(shopSource, /if \(checkoutMaintenance\.active\) \{/);
console.log("B PASS");

for (const clientSource of [shopClientSource, offerClientSource]) {
  assert.match(clientSource, /CHECKOUT_MAINTENANCE_ACTIVE/);
  assert.match(clientSource, /CHECKOUT_MAINTENANCE_MESSAGE/);
  assert.doesNotMatch(clientSource, /isCheckoutCompletionDisabled|CHECKOUT_MAINTENANCE_NOTICE/);
  assert.doesNotMatch(clientSource, /Wartungshinweis|Sonntagabend|Vielen Dank für Ihr Verständnis/);
}
console.log("B2 PASS");

assert.equal((await decision({ adminAuthenticated: false })).bypassAllowed, false);
console.log("C PASS");

assert.equal((await decision({ maintenanceTestHeader: null })).bypassAllowed, false);
console.log("D PASS");

assert.equal((await decision({ permitToken: null })).bypassAllowed, false);
console.log("E PASS");

assert.equal((await decision({ confirmation: null })).bypassAllowed, false);
console.log("F PASS");

assert.equal((await decision({ adminAuthenticated: false })).bypassAllowed, false);
console.log("G PASS");

const foreignOrigin = new Request("https://example.test/api/offer/x/checkout", {
  method: "POST",
  headers: { origin: "https://attacker.test" },
});
assert.equal(permits.isCheckoutTestRequestSameOrigin(foreignOrigin), false);
assert.equal((await decision({ sameOrigin: false })).bypassAllowed, false);
console.log("H PASS");

let invalidTokenRpcCalled = false;
const invalidTokenResult = await decision(
  { permitToken: "invalid" },
  () => permits.consumeCheckoutTestPermit(
    { permitToken: "invalid", checkoutType: "offer", targetReference: OFFER_A },
    { rpc: async () => { invalidTokenRpcCalled = true; return { data: [], error: null }; } },
  ),
);
assert.equal(invalidTokenResult.bypassAllowed, false);
assert.equal(invalidTokenRpcCalled, false);
console.log("I PASS");

assert.match(adminSource, /checkoutType !== "offer"/);
assert.doesNotMatch(permitSource, /"shop" \| "offer"/);
let shopConsumeRpcCalled = false;
assert.equal(await permits.consumeCheckoutTestPermit(
  { permitToken: RAW_PERMIT, checkoutType: "shop", targetReference: OFFER_A },
  { rpc: async () => { shopConsumeRpcCalled = true; return { data: [], error: null }; } },
), null);
assert.equal(shopConsumeRpcCalled, false);
console.log("J PASS");

assert.equal(permits.isValidCheckoutTestOfferToken(""), false);
assert.equal(permits.isValidCheckoutTestOfferToken("short"), false);
assert.match(adminSource, /if \(!targetReference\)/);
console.log("K PASS");

const offerTokenFormatCases: Array<[string, unknown, boolean]> = [
  ["16 Zeichen", "AbC0123456789_-X", true],
  ["15 Zeichen", "AbC0123456789_-", false],
  ["17 Zeichen", "AbC0123456789_-XY", false],
  ["Leerzeichen außen", " AbC0123456789_-", false],
  ["Punkt", "AbC0123456789_.X", false],
  ["Slash", "AbC0123456789_/X", false],
  ["Pluszeichen", "AbC0123456789_+X", false],
  ["Unterstrich", "AbC0123456789__X", true],
  ["Bindestrich", "AbC0123456789--X", true],
  ["Groß-/Kleinbuchstaben und Ziffern", "aBcDEF0123456789", true],
];
for (const [description, token, expected] of offerTokenFormatCases) {
  assert.equal(
    permits.isValidCheckoutTestOfferToken(token),
    expected,
    description,
  );
}
console.log("TOKENFORMAT PASS");

const targetHashA = permits.hashCheckoutTestTargetReference("offer", OFFER_A);
assert.match(targetHashA, /^[a-f0-9]{64}$/);
assert.notEqual(targetHashA, OFFER_A);
console.log("L PASS");

const stored: StoredPermit = {
  hash: permits.hashCheckoutTestPermitToken(RAW_PERMIT),
  targetHash: targetHashA,
  status: "available",
  expiresAt: Date.now() + 60_000,
};
assert.ok(await permits.consumeCheckoutTestPermit(
  { permitToken: RAW_PERMIT, checkoutType: "offer", targetReference: OFFER_A },
  atomicClient(stored),
));
console.log("M PASS");

assert.equal(await permits.consumeCheckoutTestPermit(
  { permitToken: RAW_PERMIT, checkoutType: "offer", targetReference: OFFER_A },
  atomicClient(stored),
), null);
console.log("N PASS");

const parallelStored: StoredPermit = { ...stored, status: "available" };
const parallelClient = atomicClient(parallelStored);
const parallel = await Promise.all([
  permits.consumeCheckoutTestPermit({ permitToken: RAW_PERMIT, checkoutType: "offer", targetReference: OFFER_A }, parallelClient),
  permits.consumeCheckoutTestPermit({ permitToken: RAW_PERMIT, checkoutType: "offer", targetReference: OFFER_A }, parallelClient),
]);
assert.equal(parallel.filter(Boolean).length, 1);
console.log("O PASS (isolierter Parallelitäts-Mock)");

const wrongTargetStored: StoredPermit = { ...stored, status: "available" };
assert.equal(await permits.consumeCheckoutTestPermit(
  { permitToken: RAW_PERMIT, checkoutType: "offer", targetReference: OFFER_B },
  atomicClient(wrongTargetStored),
), null);
console.log("P PASS");

for (const status of ["expired", "cancelled"] as const) {
  const blocked: StoredPermit = {
    ...stored,
    status,
    expiresAt: status === "expired" ? Date.now() - 1 : Date.now() + 60_000,
  };
  assert.equal(await permits.consumeCheckoutTestPermit(
    { permitToken: RAW_PERMIT, checkoutType: "offer", targetReference: OFFER_A },
    atomicClient(blocked),
  ), null);
}
console.log("Q PASS");
console.log("R PASS");

const createCalls: Record<string, unknown>[] = [];
const created = await permits.createCheckoutTestPermit(
  { checkoutType: "offer", targetReference: OFFER_A, expiresInMinutes: 10 },
  { rpc: async (_name: string, params: Record<string, unknown>) => {
    createCalls.push(params);
    return {
      data: [{
        permit_id: PERMIT_ID,
        checkout_type: "offer",
        target_reference_hash: params.p_target_reference_hash,
        created_at: NOW,
        expires_at: LATER,
      }],
      error: null,
    };
  } },
);
assert.equal(JSON.stringify(createCalls).includes(created.permitToken), false);
assert.equal(createCalls[0]?.p_permit_hash, permits.hashCheckoutTestPermitToken(created.permitToken));
console.log("S PASS");

assert.doesNotMatch(adminSource, /console\.(log|error).*permitToken/);
assert.doesNotMatch(adminSource, /message:\s*error/);
console.log("T PASS");

assert.equal(parallelStored.status, "consumed");
assert.equal(await permits.consumeCheckoutTestPermit(
  { permitToken: RAW_PERMIT, checkoutType: "offer", targetReference: OFFER_A },
  parallelClient,
), null);
console.log("U PASS");

const inactive = await decision({ maintenanceActive: false });
assert.equal(inactive.bypassReason, "maintenance_inactive");
assert.equal(inactive.bypassAllowed, false);
console.log("V PASS");

const metadataBlock = offerSource.slice(
  offerSource.indexOf("const maintenanceTestEventMetadata"),
  offerSource.indexOf("try {", offerSource.indexOf("const maintenanceTestEventMetadata")),
);
assert.match(metadataBlock, /maintenance_test_bypass:\s*true/);
assert.match(metadataBlock, /maintenance_test_permit_id/);
assert.match(metadataBlock, /maintenance_test_actor:\s*"admin"/);
assert.match(metadataBlock, /maintenance_test_at:\s*now/);
assert.match(metadataBlock, /maintenance_test_checkout_type:\s*"offer"/);
assert.doesNotMatch(metadataBlock, /permitToken|permitHash|offerToken|cookie/i);
console.log("W PASS");

for (const forbidden of [
  "createLexware",
  "executeLexware",
  "sendRequestInvoiceMail",
  "paypal/create-order",
  "stripe",
  "requestInvoicePdf",
]) {
  assert.equal([permitSource, adminSource, migration].join("\n").includes(forbidden), false, forbidden);
}
assert.match(migration, /target_reference_hash text not null/);
assert.match(migration, /check \(checkout_type = 'offer'\)/);
assert.doesNotMatch(migration, /checkout_type in \('shop'/);
assert.match(migration, /update public\.school_checkout_test_permits[\s\S]*status = 'available'[\s\S]*returning permit\.id, permit\.consumed_at/i);
assert.match(migration, /security definer/gi);
assert.match(migration, /set search_path = public, pg_temp/gi);
assert.match(migration, /revoke all[\s\S]*public, anon, authenticated/gi);
assert.match(migration, /grant execute[\s\S]*service_role/gi);
assert.doesNotMatch(migration, /\bexecute\s+(format|immediate)\b/i);
console.log("X PASS");
