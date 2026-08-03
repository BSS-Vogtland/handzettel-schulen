import "server-only";

import {
  buildLexwareInvoicePayload,
  type LocalLexwareInvoiceItemSnapshot,
  type LocalLexwareInvoiceSnapshot,
} from "@/app/lib/lexware/lexwareInvoicePayloadBuilder";
import { validateLexwareInvoicePayload } from "@/app/lib/lexware/lexwareInvoicePayloadValidator";
import {
  canAttemptExternalWrite,
  evaluateLexwareProductionGates,
  type LexwareProductionGateInput,
} from "@/app/lib/lexware/lexwareProductionInvoiceJob";
import { buildInvoiceTaxSnapshotV2 } from "@/lib/tax-v2";

export const LEXWARE_PRODUCTION_FIXTURE_VERSION =
  "lexware-production-v2-fixture-v1" as const;

const SNAPSHOT_AT = "2026-08-03T00:00:00.000Z";
const FIXTURE_INVOICE_KEY = "technical-production-fixture-v1";

const products = [
  { key: "product-19-a", productId: "technical-product-19-a", productName: "Technisches Testprodukt 19 A", quantity: 2, unitPrice: 3.99, taxRate: 19 as const },
  { key: "product-19-b", productId: "technical-product-19-b", productName: "Technisches Testprodukt 19 B", quantity: 3, unitPrice: 1.25, taxRate: 19 as const },
  { key: "product-7-a", productId: "technical-product-7-a", productName: "Technisches Testprodukt 7 A", quantity: 1, unitPrice: 12.95, taxRate: 7 as const },
  { key: "product-7-b", productId: "technical-product-7-b", productName: "Technisches Testprodukt 7 B", quantity: 4, unitPrice: 7.49, taxRate: 7 as const },
] as const;

export type LexwareProductionFixtureDryRunInput = {
  gates: LexwareProductionGateInput;
  databaseReadsPerformed: number;
};

export function buildLexwareProductionFixtureSnapshots() {
  const snapshot = buildInvoiceTaxSnapshotV2({
    currency: "EUR",
    snapshotAt: SNAPSHOT_AT,
    entries: [
      ...products.map((product) => ({
        key: `product:${product.key}`,
        component: "product" as const,
        itemKey: product.key,
        productId: product.productId,
        productName: product.productName,
        quantity: product.quantity,
        taxRatePercentage: product.taxRate,
        grossAmount: product.quantity * product.unitPrice,
        isBook: product.taxRate === 7,
      })),
      { key: "regular-shipping:19", component: "regular_shipping", taxRatePercentage: 19, grossAmount: 1.95 },
      { key: "regular-shipping:7", component: "regular_shipping", taxRatePercentage: 7, grossAmount: 4 },
      { key: "discount:19", component: "discount", taxRatePercentage: 19, grossAmount: -1.19 },
      { key: "discount:7", component: "discount", taxRatePercentage: 7, grossAmount: -1.07 },
    ],
  });

  const invoiceSnapshot = snapshot.invoiceSnapshotPayload;
  const invoice: LocalLexwareInvoiceSnapshot = {
    id: FIXTURE_INVOICE_KEY,
    request_id: "technical-fixture-request-v1",
    invoice_number: null,
    invoice_provider: "lexware",
    invoice_cutover_version: "invoice-cutover-2026-08-01-v1",
    selected_payment_method: "bank_transfer",
    fulfillment_method_snapshot: "shipping",
    billing_name_snapshot: "TECHNISCHER TEST – NICHT VERSENDEN",
    billing_street_snapshot: "Synthetischer Testweg 1",
    billing_postal_code_snapshot: "00000",
    billing_city_snapshot: "Teststadt",
    customer_email_snapshot: null,
    child_name_snapshot: null,
    school_name_snapshot: null,
    class_name_snapshot: null,
    customer_note: null,
    admin_note: "Technisches Fixture; keine reale Rechnung.",
    subtotal_amount: snapshot.breakdown.totals.subtotal.gross,
    shipping_amount: snapshot.breakdown.totals.regular_shipping.gross,
    book_shipping_amount: snapshot.breakdown.totals.book_shipping.gross,
    book_cover_amount: snapshot.breakdown.totals.book_covers.gross,
    discount_amount: snapshot.breakdown.totals.discount.gross,
    total_amount: snapshot.breakdown.totals.total.gross,
    currency: "EUR",
    tax_snapshot_status: invoiceSnapshot.tax_snapshot_status,
    tax_snapshot_source: invoiceSnapshot.tax_snapshot_source,
    tax_snapshot_version: invoiceSnapshot.tax_snapshot_version,
    tax_snapshot_at: invoiceSnapshot.tax_snapshot_at,
    tax_breakdown_snapshot: invoiceSnapshot.tax_breakdown_snapshot,
    total_net_amount_snapshot: invoiceSnapshot.total_net_amount_snapshot,
    total_tax_amount_snapshot: invoiceSnapshot.total_tax_amount_snapshot,
    created_at: SNAPSHOT_AT,
  };

  const items: LocalLexwareInvoiceItemSnapshot[] = snapshot.items.map((item) => {
    const product = products.find((entry) => entry.key === item.key);
    if (!product) throw new Error(`Fixture-Produkt fehlt: ${item.key}`);
    return {
      id: `technical-item:${item.key}`,
      invoice_id: FIXTURE_INVOICE_KEY,
      product_id: item.productId,
      product_name: item.productName,
      product_sku: null,
      quantity: item.quantity,
      unit: "Stück",
      unit_price: product.unitPrice,
      total_price: item.product.gross,
      ...item.snapshotPayload,
      is_book_snapshot: item.isBook,
      book_isbn13_snapshot: null,
      book_cover_selected: false,
      book_cover_name_snapshot: null,
      book_cover_quantity: 0,
      book_cover_unit_price: 0,
      book_cover_total_price: 0,
      source: "technical_fixture",
      notes: null,
    };
  });

  return { snapshot, invoice, items };
}

export function runLexwareProductionFixtureDryRun(
  input: LexwareProductionFixtureDryRunInput,
) {
  const { invoice, items } =
    buildLexwareProductionFixtureSnapshots();

  const built = buildLexwareInvoicePayload({
    invoice,
    items,
    voucherDate: SNAPSHOT_AT,
    shippingDate: SNAPSHOT_AT,
    paymentTermDays: 7,
  });
  const validation = validateLexwareInvoicePayload(built);
  const gates = evaluateLexwareProductionGates(input.gates);
  const idempotencyEligibleWithoutJob = canAttemptExternalWrite(
    "waiting_for_activation",
    "not_attempted",
  );
  const wouldFinalizeInvoice = validation.valid;

  return {
    ok: true,
    dryRun: true,
    fixture: true,
    fixtureVersion: LEXWARE_PRODUCTION_FIXTURE_VERSION,
    writeOperationsPerformed: false,
    lexwareReadRequestsPerformed: 0,
    lexwareWriteRequestsPerformed: 0,
    databaseReadsPerformed: input.databaseReadsPerformed,
    databaseWritesPerformed: 0,
    mailOperationsPerformed: 0,
    payloadValid: validation.valid,
    wouldFinalizeInvoice,
    wouldCreateExactlyOneInvoice: false,
    expected: built.expected,
    gates: {
      ...gates.checks,
      allPassed: gates.allowed,
      failedChecks: gates.failedChecks,
    },
    wouldBlockReason: validation.valid && gates.allowed && idempotencyEligibleWithoutJob
      ? null
      : [
          ...gates.failedChecks,
          ...(validation.valid ? [] : ["payload_invalid"]),
          ...(idempotencyEligibleWithoutJob ? [] : ["no_persisted_job_state"]),
        ],
    checkoutMaintenanceActive: input.gates.checkoutMaintenanceActive,
    fixtureCustomerIsSynthetic: true,
    fixtureContainsRealCustomerData: false,
  };
}
