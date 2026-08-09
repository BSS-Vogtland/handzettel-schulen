import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const loaderUrl = new URL("../app/lib/lexware/lexwarePersistedInvoicePayloadCore.ts", import.meta.url).href;
const hashUrl = new URL("../app/lib/lexware/lexwarePayloadHash.ts", import.meta.url).href;
const loaderModule = await import(loaderUrl);
const hashModule = await import(hashUrl);
const { parsePersistedLexwareInvoicePayload } = loaderModule;
const { buildLexwarePayloadSha256, LEXWARE_PAYLOAD_HASH_V2 } = hashModule;

const storedEnvelope = {
  payload: {
    archived: false,
    voucherDate: "2026-08-07T00:00:00.000Z",
    address: { name: "Native Test" },
    lineItems: [{
      type: "custom",
      name: "Testartikel",
      description: "Vollstaendige Beschreibung",
      quantity: 1,
      unitName: "Stueck",
      unitPrice: { currency: "EUR", grossAmount: 1, taxRatePercentage: 19 },
      discountPercentage: 0,
    }],
    totalPrice: {},
    taxConditions: { taxType: "gross" },
    paymentConditions: { paymentTermLabel: "7 Tage", paymentTermDuration: 7 },
    shippingConditions: { shippingDate: "2026-08-07T00:00:00.000Z", shippingType: "delivery" },
    title: "Rechnung",
    introduction: "Test",
    remark: "Test",
  },
  expected: {
    totalGrossAmount: 1,
    totalNetAmount: 0.84,
    totalTaxAmount: 0.16,
    taxRates: [{ taxRatePercentage: 19, grossAmount: 1, netAmount: 0.84, taxAmount: 0.16 }],
  },
};

const storedHash = buildLexwarePayloadSha256({ payload: storedEnvelope.payload, version: LEXWARE_PAYLOAD_HASH_V2 });
const validateSignature = (value: unknown) => {
  assert.equal(typeof value, "object");
  assert.notEqual(value, null);
  assert.equal(Array.isArray(value), false);
  return value as Record<string, unknown>;
};
const loaded = parsePersistedLexwareInvoicePayload(storedEnvelope, validateSignature);
assert.equal(buildLexwarePayloadSha256({ payload: loaded.payload, version: LEXWARE_PAYLOAD_HASH_V2 }), storedHash); console.log("A PASS");
assert.deepEqual(loaded, storedEnvelope); console.log("B,C PASS");
assert.equal(loaded.payload.lineItems[0]?.name, "Testartikel"); console.log("D PASS");
assert.equal(loaded.payload.lineItems[0]?.description, "Vollstaendige Beschreibung"); console.log("E PASS");
assert.equal(loaded.payload.paymentConditions.paymentTermDuration, 7); console.log("F PASS");
assert.equal(loaded.payload.paymentConditions.paymentTermLabel, "7 Tage"); console.log("G PASS");

const reducedSignatureProjection = {
  ...loaded.payload,
  lineItems: loaded.payload.lineItems.map(({ type, quantity, unitName, unitPrice, discountPercentage }) =>
    ({ type, quantity, unitName, unitPrice, discountPercentage })),
  paymentConditions: { paymentTermLabel: loaded.payload.paymentConditions.paymentTermLabel },
};
assert.notEqual(
  buildLexwarePayloadSha256({ payload: reducedSignatureProjection, version: LEXWARE_PAYLOAD_HASH_V2 }),
  storedHash,
); console.log("H,I,J PASS");

const reordered = { ...storedEnvelope.payload, address: { ...storedEnvelope.payload.address } };
assert.equal(buildLexwarePayloadSha256({ payload: reordered, version: LEXWARE_PAYLOAD_HASH_V2 }), storedHash); console.log("K,L PASS");
const reversedLines = { ...loaded.payload, lineItems: [...loaded.payload.lineItems, { ...loaded.payload.lineItems[0], name: "Zweiter" }].reverse() };
assert.notEqual(
  buildLexwarePayloadSha256({ payload: reversedLines, version: LEXWARE_PAYLOAD_HASH_V2 }),
  buildLexwarePayloadSha256({ payload: { ...loaded.payload, lineItems: [...reversedLines.lineItems].reverse() }, version: LEXWARE_PAYLOAD_HASH_V2 }),
); console.log("M PASS");
assert.notEqual(
  buildLexwarePayloadSha256({ payload: { ...loaded.payload, remark: null }, version: LEXWARE_PAYLOAD_HASH_V2 }),
  buildLexwarePayloadSha256({ payload: { ...loaded.payload, remark: "Test" }, version: LEXWARE_PAYLOAD_HASH_V2 }),
); console.log("N PASS");
assert.throws(() => buildLexwarePayloadSha256({ payload: { ...loaded.payload, forbidden: undefined }, version: LEXWARE_PAYLOAD_HASH_V2 })); console.log("O PASS");

const serviceSource = readFileSync("app/lib/lexware/lexwareProductionInvoiceProcessService.ts", "utf8");
const loaderSource = readFileSync("app/lib/lexware/lexwarePersistedInvoicePayloadCore.ts", "utf8");
assert.match(serviceSource, /loadPersistedPayload:\s*async \(\) => parsePersistedLexwareInvoicePayload\(job\.payload_snapshot, parseLexwarePayloadLineItem\)/);
assert.doesNotMatch(serviceSource, /lineItems:\s*parsedLineItems|paymentConditions:\s*\{\s*paymentTermLabel/);
assert.match(loaderSource, /validateLineItem\(lineItem\);\s*return lineItem as TLineItem;/);
assert.match(loaderSource, /paymentConditions,/);
assert.doesNotMatch(loaderSource, /lineItems:\s*parsedLineItems/); console.log("P PASS");

console.log("PASS A-P: stored payload remains complete for canonical-v2 processor hashing.");
