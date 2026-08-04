import assert from "node:assert/strict";

const moduleUrl = (path: string) => new URL(path, import.meta.url).href;
const lineModule = await import(moduleUrl("../app/lib/lexware/lexwareLineItemMultisetCore.ts"));

const {
  buildCanonicalLexwareLineSignature,
  compareLexwareLineSignatureMultisets,
  parseLexwarePayloadLineItem,
  validateLexwareReadBackLineAmount,
  LexwareLineItemSignatureError,
} = lineModule;

const line = (overrides: Record<string, unknown> = {}) => ({
  type: "custom",
  quantity: "1.0000",
  unitName: "Stück",
  unitPrice: {
    currency: "EUR",
    grossAmount: "0.0100",
    taxRatePercentage: "19.00",
  },
  discountPercentage: "0.00",
  lineItemAmount: "0.01",
  ...overrides,
});

const compare = (expected: ReturnType<typeof line>[], actual: ReturnType<typeof line>[]) =>
  compareLexwareLineSignatureMultisets(expected, actual);
const mismatch = (expected: ReturnType<typeof line>[], actual: ReturnType<typeof line>[]) =>
  compare(expected, actual).countMismatch;
type LineItemValidationErrorShape = Error & { code: string };
const isLineItemValidationError = (value: unknown): value is LineItemValidationErrorShape =>
  value instanceof Error && "code" in value && typeof value.code === "string";
const invalid = (input: ReturnType<typeof line>, code: string) =>
  assert.throws(
    () => validateLexwareReadBackLineAmount(input),
    (error: unknown) => {
      if (!(error instanceof LexwareLineItemSignatureError) || !isLineItemValidationError(error)) return false;
      return error.code === code;
    },
  );
const invalidPayload = (input: unknown, code: string) =>
  assert.throws(
    () => parseLexwarePayloadLineItem(input),
    (error: unknown) => isLineItemValidationError(error) && error.code === code,
  );

assert.equal(mismatch([line()], [line()]), false); console.log("A PASS");
assert.equal(mismatch([line(), line()], [line(), line()]), false); console.log("B PASS");
assert.equal(mismatch([line(), line({ quantity: "2" })], [line({ quantity: "2.0000" }), line()]), false); console.log("C PASS");
assert.equal(mismatch([line()], [line({ quantity: "2" })]), true); console.log("D PASS");
assert.equal(mismatch([line()], [line({ unitPrice: { currency: "EUR", grossAmount: "0.0200", taxRatePercentage: "19" } })]), true); console.log("E PASS");
assert.equal(mismatch([line()], [line({ unitPrice: { currency: "EUR", grossAmount: "0.01", taxRatePercentage: "7" } })]), true); console.log("F PASS");
assert.equal(mismatch([line()], [line({ discountPercentage: "1" })]), true); console.log("G PASS");
assert.equal(mismatch([line()], [line({ unitName: "Packung" })]), true); console.log("H PASS");
assert.equal(mismatch([line()], [line(), line({ quantity: "2" })]), true); console.log("I PASS");
assert.equal(mismatch([line(), line({ quantity: "2" })], [line()]), true); console.log("J PASS");
assert.equal(buildCanonicalLexwareLineSignature(line({ name: "A" })), buildCanonicalLexwareLineSignature(line({ name: "B" }))); console.log("K PASS");
assert.equal(mismatch([line(), line()], [line()]), true); console.log("L PASS");
assert.equal(mismatch([line()], [line(), line()]), true); console.log("M PASS");
assert.equal(buildCanonicalLexwareLineSignature(line()), buildCanonicalLexwareLineSignature(line({ lineItemAmount: "99" }))); console.log("N PASS");
assert.equal(validateLexwareReadBackLineAmount(line({ unitPrice: { currency: "EUR", grossAmount: "-1", taxRatePercentage: "19" }, lineItemAmount: "-1" })), -100n); console.log("O PASS");
assert.equal(validateLexwareReadBackLineAmount(line({ unitPrice: { currency: "EUR", grossAmount: "-1", taxRatePercentage: "19" }, lineItemAmount: "0" })), 0n); console.log("P PASS");
invalid(line({ unitPrice: { currency: "EUR", grossAmount: "-1", taxRatePercentage: "19" }, lineItemAmount: "1" }), "LEXWARE_LINE_AMOUNT_SIGN_MISMATCH"); console.log("Q PASS");
invalid(line({ lineItemAmount: "-1" }), "LEXWARE_LINE_AMOUNT_SIGN_MISMATCH"); console.log("R PASS");
assert.equal(validateLexwareReadBackLineAmount(line({ unitPrice: { currency: "EUR", grossAmount: "0", taxRatePercentage: "19" }, lineItemAmount: "0" })), 0n); console.log("S PASS");
invalid(line({ unitPrice: { currency: "EUR", grossAmount: "0", taxRatePercentage: "19" }, lineItemAmount: "1" }), "LEXWARE_LINE_AMOUNT_SIGN_MISMATCH"); console.log("T PASS");
invalid(line({ unitPrice: { currency: "EUR", grossAmount: "0", taxRatePercentage: "19" }, lineItemAmount: "-1" }), "LEXWARE_LINE_AMOUNT_SIGN_MISMATCH"); console.log("U PASS");
assert.equal(JSON.stringify(line()).includes("HSTEST-LINE"), false); console.log("V PASS");
assert.equal(mismatch([line(), line({ quantity: "2" })], [line({ quantity: "2" }), line()]), false); console.log("W PASS");

assert.deepEqual(parseLexwarePayloadLineItem(line()), {
  type: "custom",
  quantity: "1.0000",
  unitName: "Stück",
  unitPrice: { currency: "EUR", grossAmount: "0.0100", taxRatePercentage: "19.00" },
  discountPercentage: "0.00",
}); console.log("Payload A PASS");
const { type: omittedType, ...withoutType } = line();
invalidPayload(withoutType, "LEXWARE_LINE_REQUIRED_FIELD_MISSING"); console.log("Payload B PASS");
const { quantity: omittedQuantity, ...withoutQuantity } = line();
invalidPayload(withoutQuantity, "LEXWARE_LINE_REQUIRED_FIELD_MISSING"); console.log("Payload C PASS");
const { unitName: omittedUnitName, ...withoutUnitName } = line();
invalidPayload(withoutUnitName, "LEXWARE_LINE_REQUIRED_FIELD_MISSING"); console.log("Payload D PASS");
invalidPayload(line({ unitPrice: null }), "LEXWARE_LINE_UNIT_PRICE_MISSING"); console.log("Payload E PASS");
invalidPayload(line({ unitPrice: { grossAmount: "0.0100", taxRatePercentage: "19.00" } }), "LEXWARE_LINE_UNIT_PRICE_INVALID"); console.log("Payload F PASS");
invalidPayload(line({ unitPrice: { currency: "EUR", taxRatePercentage: "19.00" } }), "LEXWARE_LINE_UNIT_PRICE_INVALID"); console.log("Payload G PASS");
invalidPayload(line({ unitPrice: { currency: "EUR", grossAmount: "0.0100" } }), "LEXWARE_LINE_UNIT_PRICE_INVALID"); console.log("Payload H PASS");
assert.equal(parseLexwarePayloadLineItem(line({ discountPercentage: 0 })).discountPercentage, 0); console.log("Payload I PASS");
assert.equal(parseLexwarePayloadLineItem(line({ unitPrice: { currency: "EUR", grossAmount: "-1.0000", taxRatePercentage: "19.00" } })).unitPrice?.grossAmount, "-1.0000"); console.log("Payload J PASS");
const { lineItemAmount: omittedLineItemAmount, ...withoutLineItemAmount } = line();
assert.equal(parseLexwarePayloadLineItem(withoutLineItemAmount).type, "custom"); console.log("Payload K PASS");
assert.throws(
  () => [line(), withoutType].map(parseLexwarePayloadLineItem),
  (error: unknown) => isLineItemValidationError(error) && error.code === "LEXWARE_LINE_REQUIRED_FIELD_MISSING",
); console.log("Payload L PASS");
