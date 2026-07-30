import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const jiti = createJiti(import.meta.url, {
  alias: {
    "@": projectRoot,
  },
});

const {
  EXPECTED_INVOICE_CUTOVER_AT,
  EXPECTED_INVOICE_CUTOVER_VERSION,
  EXPECTED_INVOICE_TIMEZONE,
  resolveInvoiceTaxCutover,
} = await jiti.import(path.join(projectRoot, "lib/invoiceTaxCutover.ts"));
const {
  InvoiceTaxCheckoutAdapterError,
  buildCheckoutInvoiceTaxSnapshot,
} = await jiti.import(path.join(projectRoot, "lib/invoiceTaxCheckoutAdapter.ts"));
const {
  buildInvoiceTaxSnapshotV2,
} = await jiti.import(path.join(projectRoot, "lib/tax-v2/snapshot.ts"));

const toCents = (amount) => Math.round((amount + Number.EPSILON) * 100);
const fromCents = (cents) => cents / 100;
const sumCents = (amounts) => amounts.reduce(
  (sum, amount) => sum + toCents(amount),
  0,
);

function assertMoneyEqual(actual, expected, label) {
  assert.equal(
    toCents(actual),
    toCents(expected),
    `${label}: erwartet ${expected.toFixed(2)}, erhalten ${actual.toFixed(2)}`,
  );
}

function assertMoneyIdentity(money, label) {
  assert.equal(
    toCents(money.net) + toCents(money.tax),
    toCents(money.gross),
    `${label}: netto + Steuer muss brutto ergeben`,
  );
}

const cutoverConfiguration = {
  invoiceCutoverAt: EXPECTED_INVOICE_CUTOVER_AT,
  timezoneName: EXPECTED_INVOICE_TIMEZONE,
  invoiceProviderBefore: "legacy_internal",
  invoiceProviderAfter: "lexware",
  invoiceCutoverVersion: EXPECTED_INVOICE_CUTOVER_VERSION,
};

const cutoverCases = [
  {
    now: "2026-07-31T21:59:59.999Z",
    reached: false,
    snapshotVersion: "invoice-tax-snapshot-v1",
    provider: "legacy_internal",
    internalMailSelected: true,
    pendingEventSelected: false,
  },
  {
    now: "2026-07-31T22:00:00.000Z",
    reached: true,
    snapshotVersion: "invoice-tax-snapshot-v2",
    provider: "lexware",
    internalMailSelected: false,
    pendingEventSelected: true,
  },
  {
    now: "2026-07-31T22:00:00.001Z",
    reached: true,
    snapshotVersion: "invoice-tax-snapshot-v2",
    provider: "lexware",
    internalMailSelected: false,
    pendingEventSelected: true,
  },
];

const cutoverResults = cutoverCases.map((expected) => {
  const decision = resolveInvoiceTaxCutover({
    ...cutoverConfiguration,
    now: expected.now,
  });
  const internalMailSelected = !decision.cutoverReached;
  const pendingEventSelected = decision.cutoverReached;

  assert.equal(decision.cutoverReached, expected.reached);
  assert.equal(decision.selectedTaxSnapshotVersion, expected.snapshotVersion);
  assert.equal(decision.selectedInvoiceProvider, expected.provider);
  assert.equal(internalMailSelected, expected.internalMailSelected);
  assert.equal(pendingEventSelected, expected.pendingEventSelected);

  return {
    now: expected.now,
    status: "PASS",
    cutoverReached: decision.cutoverReached,
    selectedTaxSnapshotVersion: decision.selectedTaxSnapshotVersion,
    selectedInvoiceProvider: decision.selectedInvoiceProvider,
    internalMailSelected,
    lexwareInvoicePendingSelected: pendingEventSelected,
    lexwareWriteSelected: false,
  };
});

const snapshotAt = "2026-07-31T22:00:00.000Z";
const lines = [
  {
    key: "offer-item-19-a",
    productId: "product-19-a",
    productName: "Schreibset",
    quantity: 2,
    unitPriceGross: 3.99,
    isBookSnapshot: false,
    bookCoverSelected: false,
  },
  {
    key: "offer-item-19-b",
    productId: "product-19-b",
    productName: "Heft",
    quantity: 3,
    unitPriceGross: 1.25,
    isBookSnapshot: false,
    bookCoverSelected: false,
  },
  {
    key: "offer-item-7-a",
    productId: "product-7-a",
    productName: "Arbeitsbuch",
    quantity: 1,
    unitPriceGross: 12.95,
    isBookSnapshot: true,
    bookCoverSelected: true,
    bookCoverUnitPriceGross: 1.5,
    bookCoverTaxRate: 19,
  },
  {
    key: "offer-item-7-b",
    productId: "product-7-b",
    productName: "Lesebuch",
    quantity: 4,
    unitPriceGross: 7.49,
    isBookSnapshot: true,
    bookCoverSelected: false,
  },
];
const products = [
  { id: "product-19-a", taxRate: 19, isBook: false, active: true },
  { id: "product-19-b", taxRate: 19, isBook: false, active: true },
  { id: "product-7-a", taxRate: 7, isBook: true, active: true },
  { id: "product-7-b", taxRate: 7, isBook: true, active: true },
];
const expectedGross = {
  subtotal: 54.64,
  regular_shipping: 5.95,
  book_shipping: 2.5,
  book_covers: 1.5,
  discount: 0,
  total: 64.59,
};

const v1 = buildCheckoutInvoiceTaxSnapshot({
  currency: "EUR",
  snapshotAt,
  lines,
  products,
  regularShippingGrossAmount: expectedGross.regular_shipping,
  bookShippingGrossAmount: expectedGross.book_shipping,
  discountGrossAmount: expectedGross.discount,
  bookCoverTaxRate: 19,
  bookShippingAllocationScope: "book_products_only",
  discountAllocationScope: "products_only",
  expectedGrossAmounts: expectedGross,
  requireExpectedGrossAmountsMatch: true,
});

const v2Entries = [];
for (const line of v1.lines) {
  v2Entries.push({
    key: `product:${line.key}`,
    component: "product",
    itemKey: line.key,
    productId: line.productId,
    productName: line.productName,
    quantity: line.quantity,
    taxRatePercentage: line.catalogTaxRate,
    grossAmount: line.productGrossAmount,
    isBook: line.catalogIsBook,
  });

  if (line.bookCoverGrossAmount > 0) {
    v2Entries.push({
      key: `book-cover:${line.key}`,
      component: "book_cover",
      itemKey: line.key,
      taxRatePercentage: line.bookCoverTaxRate,
      grossAmount: line.bookCoverGrossAmount,
    });
  }
}

for (const rate of v1.taxSnapshot.breakdown.rates) {
  if (rate.regular_shipping.gross > 0) {
    v2Entries.push({
      key: `regular-shipping:${rate.tax_rate}`,
      component: "regular_shipping",
      taxRatePercentage: rate.tax_rate,
      grossAmount: rate.regular_shipping.gross,
    });
  }
  if (rate.book_shipping.gross > 0) {
    v2Entries.push({
      key: `book-shipping:${rate.tax_rate}`,
      component: "book_shipping",
      taxRatePercentage: rate.tax_rate,
      grossAmount: rate.book_shipping.gross,
    });
  }
  if (rate.discount.gross > 0) {
    v2Entries.push({
      key: `discount:${rate.tax_rate}`,
      component: "discount",
      taxRatePercentage: rate.tax_rate,
      grossAmount: -rate.discount.gross,
    });
  }
}

const v2 = buildInvoiceTaxSnapshotV2({
  currency: "EUR",
  snapshotAt,
  entries: v2Entries,
});

const v1Totals = v1.taxSnapshot.breakdown.totals;
const v2Totals = v2.breakdown.totals;
for (const component of [
  "subtotal",
  "regular_shipping",
  "book_shipping",
  "book_covers",
  "discount",
  "total",
]) {
  assertMoneyEqual(
    v2Totals[component].gross,
    v1Totals[component].gross,
    `${component}: V1/V2-Brutto`,
  );
  assertMoneyEqual(
    v2Totals[component].gross,
    expectedGross[component],
    `${component}: erwartetes Brutto`,
  );
}

assertMoneyIdentity(v2Totals.total, "V2-Gesamtsumme");
assert.equal(v2.diagnostics.allInvariantsPassed, true);
assert.equal(v2.items.length, lines.length);
assert.equal(
  new Set(v2.items.map((item) => item.key)).size,
  lines.length,
);
assert.equal(
  sumCents(v2.items.map((item) => item.product.gross)),
  toCents(expectedGross.subtotal),
);
assert.equal(
  sumCents(
    v2.items.map((item) => item.bookCover?.gross ?? 0),
  ),
  toCents(expectedGross.book_covers),
);
assert.equal(
  toCents(v2Totals.subtotal.gross) +
    toCents(v2Totals.regular_shipping.gross) +
    toCents(v2Totals.book_shipping.gross) +
    toCents(v2Totals.book_covers.gross) -
    toCents(v2Totals.discount.gross),
  toCents(v2Totals.total.gross),
);

const buckets = Object.fromEntries(
  v2.breakdown.rates.map((rate) => {
    assertMoneyIdentity(rate.total, `V2-${rate.tax_rate}-%-Bucket`);
    return [String(rate.tax_rate), rate];
  }),
);
assert.ok(buckets["7"]);
assert.ok(buckets["19"]);

let intentionalMismatch = null;
try {
  buildCheckoutInvoiceTaxSnapshot({
    currency: "EUR",
    snapshotAt,
    lines,
    products,
    regularShippingGrossAmount: expectedGross.regular_shipping,
    bookShippingGrossAmount: expectedGross.book_shipping,
    discountGrossAmount: expectedGross.discount,
    bookCoverTaxRate: 19,
    bookShippingAllocationScope: "book_products_only",
    discountAllocationScope: "products_only",
    expectedGrossAmounts: {
      ...expectedGross,
      total: expectedGross.total + 0.01,
    },
    requireExpectedGrossAmountsMatch: true,
  });
  assert.fail("Der absichtlich falsche Gesamtbetrag wurde nicht abgelehnt.");
} catch (error) {
  assert.ok(error instanceof InvoiceTaxCheckoutAdapterError);
  assert.equal(error.code, "EXPECTED_CHECKOUT_GROSS_MISMATCH");
  intentionalMismatch = {
    status: "PASS",
    controlledFailureCode: error.code,
    expectedTotalGross: expectedGross.total + 0.01,
    actualTotalGross: expectedGross.total,
  };
}

const checkoutRoute = fs.readFileSync(
  path.join(projectRoot, "app/api/offer/[token]/checkout/route.ts"),
  "utf8",
);
const validationPosition = checkoutRoute.indexOf(
  "failedSnapshotValidations",
);
const invoiceInsertPosition = checkoutRoute.indexOf(
  '"school_request_invoices"',
);
assert.ok(validationPosition >= 0);
assert.ok(invoiceInsertPosition > validationPosition);
assert.doesNotMatch(
  checkoutRoute,
  /lexwareInvoiceWriteClient|createLexwareInvoice|fetch\s*\([^)]*lexware/i,
);

const result = {
  status: "PASS",
  safety: {
    databaseAccessed: false,
    mailImportedOrSent: false,
    lexwareApiAccessed: false,
    externalApiAccessed: false,
    environmentChanged: false,
  },
  cutover: cutoverResults,
  dataset: {
    productCount: lines.length,
    product19PercentCount: 2,
    product7PercentCount: 2,
    quantities: lines.map((line) => line.quantity),
    regularShippingGross: expectedGross.regular_shipping,
    bookShippingGross: expectedGross.book_shipping,
    bookCoverGross: expectedGross.book_covers,
    discountGross: expectedGross.discount,
  },
  v1: {
    version: v1.taxSnapshot.version,
    totals: v1Totals,
  },
  v2: {
    version: v2.version,
    roundingMethod: v2.breakdown.rounding_method,
    totals: v2Totals,
    buckets,
    itemSnapshotCount: v2.items.length,
    inputEntryCount: v2.diagnostics.inputEntryCount,
    allInvariantsPassed: v2.diagnostics.allInvariantsPassed,
  },
  intentionalMismatch,
  checkoutAbortBeforeInvoiceInsertConfirmed:
    invoiceInsertPosition > validationPosition,
};

console.log(JSON.stringify(result, null, 2));
