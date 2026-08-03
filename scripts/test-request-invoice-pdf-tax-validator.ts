import assert from "node:assert/strict";

const serviceUrl = new URL(
  "../app/lib/invoiceTaxSnapshotValidator.ts",
  import.meta.url,
).href;
const { validateInvoiceTaxSnapshot } = await import(serviceUrl);

type Money = { gross: number | null; net: number | null; tax: number | null };
type TaxRateBreakdown = {
  tax_rate: 7 | 19;
  products: Money;
  regular_shipping: Money;
  book_shipping: Money;
  book_covers: Money;
  discount: Money;
  total: Money;
};
type FixtureBreakdown = {
  version: string;
  source: string;
  generated_at: string | null;
  currency: string;
  rates: TaxRateBreakdown[];
  totals: {
    subtotal: Money;
    regular_shipping: Money;
    book_shipping: Money;
    book_covers: Money;
    discount: Money;
    total: Money;
  };
  rounding_method?: string;
  allocation_methods?: {
    regular_shipping: string;
    book_shipping: string;
    discount: string;
  };
};
type InvoiceTaxSnapshotFixture = {
  invoice: {
    id: string;
    invoice_number: string;
    total_amount: number;
    tax_snapshot_status: string;
    tax_snapshot_source: string;
    tax_snapshot_version: string;
    tax_snapshot_at: string | null;
    total_net_amount_snapshot: number;
    total_tax_amount_snapshot: number;
    tax_breakdown_snapshot: FixtureBreakdown;
  };
  items: Array<{
    id: string;
    product_name: string;
    tax_rate_snapshot: 7 | 19;
    product_gross_amount_snapshot: number;
    product_net_amount_snapshot: number;
    product_tax_amount_snapshot: number;
    tax_snapshot_source: string;
    tax_snapshot_version: string;
    tax_snapshot_at: string | null;
    book_cover_total_price: number;
    book_cover_net_amount_snapshot: number | null;
    book_cover_tax_amount_snapshot: number | null;
  }>;
};
const zero = (): Money => ({ gross: 0, net: 0, tax: 0 });

function fixture(
  entries: Array<{ rate: 7 | 19; gross: number; net: number; tax: number }>,
  version: "invoice-tax-snapshot-v1" | "invoice-tax-snapshot-v2" =
    "invoice-tax-snapshot-v2",
): InvoiceTaxSnapshotFixture {
  const gross = entries.reduce((sum, entry) => sum + entry.gross, 0);
  const net = entries.reduce((sum, entry) => sum + entry.net, 0);
  const tax = entries.reduce((sum, entry) => sum + entry.tax, 0);
  const generatedAt = "2026-08-03T11:22:50.632Z";
  const columnTime: string | null = "2026-08-03T11:22:50.632+00:00";
  const breakdown: FixtureBreakdown = {
    version,
    source: "product_catalog_at_checkout",
    generated_at: generatedAt,
    currency: "EUR",
    rates: entries.map((entry) => ({
      tax_rate: entry.rate,
      products: { gross: entry.gross, net: entry.net, tax: entry.tax },
      regular_shipping: zero(),
      book_shipping: zero(),
      book_covers: zero(),
      discount: zero(),
      total: { gross: entry.gross, net: entry.net, tax: entry.tax },
    })),
    totals: {
      subtotal: { gross, net, tax },
      regular_shipping: zero(),
      book_shipping: zero(),
      book_covers: zero(),
      discount: zero(),
      total: { gross, net, tax },
    },
  };
  if (version === "invoice-tax-snapshot-v2") {
    Object.assign(breakdown, {
      rounding_method:
        "gross_tax_rate_total_with_deterministic_line_allocation_v1",
      allocation_methods: {
        regular_shipping: "preallocated_by_checkout_adapter_v2",
        book_shipping: "preallocated_by_checkout_adapter_v2",
        discount: "preallocated_by_checkout_adapter_v2",
      },
    });
  }
  return {
    invoice: {
      id: "invoice-test",
      invoice_number: "HSR-TEST",
      total_amount: gross,
      tax_snapshot_status: "complete",
      tax_snapshot_source: "product_catalog_at_checkout",
      tax_snapshot_version: version,
      tax_snapshot_at: columnTime,
      total_net_amount_snapshot: net,
      total_tax_amount_snapshot: tax,
      tax_breakdown_snapshot: breakdown,
    },
    items: entries.map((entry, index) => ({
      id: `item-${index}`,
      product_name: `Produkt ${index}`,
      tax_rate_snapshot: entry.rate,
      product_gross_amount_snapshot: entry.gross,
      product_net_amount_snapshot: entry.net,
      product_tax_amount_snapshot: entry.tax,
      tax_snapshot_source: "product_catalog_at_checkout",
      tax_snapshot_version: version,
      tax_snapshot_at: generatedAt,
      book_cover_total_price: 0,
      book_cover_net_amount_snapshot: null,
      book_cover_tax_amount_snapshot: null,
    })),
  };
}

function accepts(name: string, value: ReturnType<typeof fixture>) {
  assert.doesNotThrow(() => validateInvoiceTaxSnapshot(value.invoice, value.items), name);
  console.log(`${name} PASS`);
}

function blocks(name: string, mutate: (value: ReturnType<typeof fixture>) => void) {
  const value = fixture([{ rate: 19, gross: 1.19, net: 1, tax: 0.19 }]);
  mutate(value);
  assert.throws(() => validateInvoiceTaxSnapshot(value.invoice, value.items), name);
  console.log(`${name} PASS`);
}

accepts("A", fixture([{ rate: 19, gross: 0.01, net: 0.01, tax: 0 }]));
accepts("B", fixture([{ rate: 19, gross: 0.01, net: 0.01, tax: 0 }]));
accepts("C", fixture([{ rate: 19, gross: 0.01, net: 0.01, tax: 0 }]));
blocks("D", (v) => { v.invoice.tax_breakdown_snapshot.generated_at = "2026-08-03T11:22:50.633Z"; });
blocks("E", (v) => { v.invoice.tax_breakdown_snapshot.generated_at = "ungültig"; });
blocks("F", (v) => { v.invoice.tax_snapshot_at = null; });
accepts("G", fixture([{ rate: 19, gross: 0.01, net: 0.01, tax: 0 }]));
accepts("H", fixture([{ rate: 7, gross: 0.01, net: 0.01, tax: 0 }]));
accepts("I", fixture([{ rate: 19, gross: 1.19, net: 1, tax: 0.19 }]));
accepts("J", fixture([{ rate: 7, gross: 1.07, net: 1, tax: 0.07 }]));
accepts("K", fixture([
  { rate: 7, gross: 1.07, net: 1, tax: 0.07 },
  { rate: 19, gross: 1.19, net: 1, tax: 0.19 },
]));
blocks("L", (v) => { v.invoice.tax_breakdown_snapshot.rates[0].total.gross! += 0.01; });
blocks("M", (v) => { v.invoice.tax_breakdown_snapshot.rates[0].total.net! += 0.01; });
blocks("N", (v) => { v.invoice.tax_breakdown_snapshot.rates[0].total.tax! += 0.01; });
blocks("O", (v) => { v.items[0].product_gross_amount_snapshot += 0.01; });
blocks("P", (v) => { v.invoice.tax_breakdown_snapshot.totals.regular_shipping = { gross: 0.01, net: 0.01, tax: 0 }; });
blocks("Q", (v) => { v.invoice.tax_breakdown_snapshot.rates[0].total.tax = null; });
blocks("R", (v) => { delete v.invoice.tax_breakdown_snapshot.rounding_method; });
blocks("S", (v) => { v.invoice.tax_snapshot_version = "invoice-tax-snapshot-v3"; });
accepts("T", fixture([{ rate: 19, gross: 1.19, net: 1, tax: 0.19 }], "invoice-tax-snapshot-v1"));
