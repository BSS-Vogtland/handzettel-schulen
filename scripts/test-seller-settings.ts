import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const sellerModuleUrl = new URL("../app/lib/sellerSettings.ts", import.meta.url).href;
const sellerSettings = await import(sellerModuleUrl);
const {
  SELLER_DETAILS,
  createSellerSnapshot,
  getSellerSnapshotState,
  resolveSellerDetails,
  validateSellerDetails,
} = sellerSettings;
const paymentModuleUrl = new URL("../app/lib/paymentSettings.ts", import.meta.url).href;
const paymentSettings = await import(paymentModuleUrl);
const { BANK_TRANSFER_DETAILS, validateBankTransferDetails } = paymentSettings;

const current = validateSellerDetails(SELLER_DETAILS);
assert.equal(current.legalName, "BSS Vogtland");
assert.equal(current.ownerName, "Marius Röthig");
console.log("A PASS");

const currentSnapshot = createSellerSnapshot();
assert.equal(getSellerSnapshotState(currentSnapshot), "complete");
assert.equal(Object.keys(currentSnapshot).length, 13);
console.log("B PASS");

const historicalSnapshot = {
  seller_snapshot_version: "historical-profile-v1",
  seller_legal_name_snapshot: "Historische Firma",
  seller_trade_name_snapshot: "Historische Marke",
  seller_owner_name_snapshot: "Historischer Inhaber",
  seller_street_snapshot: "Historische Straße 1",
  seller_postal_code_snapshot: "12345",
  seller_city_snapshot: "Historischer Ort",
  seller_country_snapshot: "Deutschland",
  seller_tax_number_snapshot: "historische-steuernummer",
  seller_vat_id_snapshot: "DE123456789",
  seller_email_snapshot: "historisch@example.test",
  seller_phone_snapshot: "01234 567890",
  seller_website_snapshot: "historisch.example",
};
assert.equal(resolveSellerDetails(historicalSnapshot).legalName, "Historische Firma");
console.log("C PASS");

assert.deepEqual(resolveSellerDetails(null), current);
console.log("D PASS");

assert.throws(
  () => resolveSellerDetails({ seller_legal_name_snapshot: "Teilweise" }),
  (error: unknown) => (error as { code?: string }).code === "SELLER_SNAPSHOT_INCOMPLETE",
);
console.log("E PASS");

assert.equal(`${current.legalName}|${current.ownerName}`, "BSS Vogtland|Marius Röthig");
console.log("F PASS");

assert.equal(current.tradeName, "Handzettel-Schulen.de");
console.log("G PASS");

assert.equal(current.taxNumber, "223/263/05859");
console.log("H PASS");

assert.equal(current.vatId, "DE463186382");
console.log("I PASS");

const activeSources = [
  readFileSync("app/lib/sellerSettings.ts", "utf8"),
  readFileSync("app/lib/requestInvoicePdfService.ts", "utf8"),
  readFileSync("app/api/shop/checkout/route.ts", "utf8"),
  readFileSync("app/api/offer/[token]/checkout/route.ts", "utf8"),
  readFileSync("app/api/admin/requests/[id]/invoice/create/route.ts", "utf8"),
  readFileSync("supabase/migrations/20260803060000_future_invoice_bank_snapshot.sql", "utf8"),
];
for (const source of activeSources) {
  assert.doesNotMatch(source, /Bürotechnik Schwalm|Heike Leopold|Zwickauer Str\. 167|223\/244\/09843|DE257963936/);
}
console.log("J PASS");

const pdf = activeSources[1];
assert.equal((pdf.match(/resolveSellerDetails\(invoice\)/g) || []).length, 1);
console.log("K PASS");

const migration = activeSources[5];
for (const [key, value] of Object.entries(currentSnapshot)) {
  if (key === "seller_tax_number_snapshot" || key === "seller_vat_id_snapshot") continue;
  assert.ok(migration.includes(`'${value}'`));
}
assert.match(migration, /'223\/263\/09459'/);
assert.match(migration, /'DE346183832'/);
console.log("L PASS");

assert.doesNotMatch(migration, /update public\.school_request_invoices/i);
console.log("M PASS");

assert.doesNotMatch(
  [activeSources[0], activeSources[1], activeSources[4], activeSources[5]].join("\n"),
  /paypalPaymentValidation|PAYPAL_REQUEST_ID/,
);
console.log("N PASS");

assert.doesNotMatch(
  [activeSources[0], activeSources[1], activeSources[4], activeSources[5]].join("\n"),
  /consumeCheckoutTestPermit|CHECKOUT_TEST_PERMIT_HEADER/,
);
console.log("O PASS");

const bank = validateBankTransferDetails(BANK_TRANSFER_DETAILS);
assert.equal(bank.iban, "DE52870580000101072104");
assert.equal(bank.bic, "WELADED1PLX");
console.log("P PASS");

const adminRoute = activeSources[4];
assert.match(adminRoute, /sellerSnapshotState !== "complete"/);
assert.match(adminRoute, /SELLER_SNAPSHOT_MISSING/);
console.log("Q PASS");

assert.match(migration, /seller_snapshot_field_count <> 13/);
assert.match(migration, /raise exception 'SELLER_SNAPSHOT_INCOMPLETE'/);
console.log("R PASS");
