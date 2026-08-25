import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const gateModule = new URL(
  "../app/lib/paypalPaymentsGateCore.ts",
  import.meta.url,
).href;
const { resolvePayPalPaymentsEnabled } = await import(gateModule);

assert.equal(resolvePayPalPaymentsEnabled({ paypal_payments_enabled: true }), true);
assert.equal(resolvePayPalPaymentsEnabled({ paypal_payments_enabled: false }), false);
assert.equal(resolvePayPalPaymentsEnabled({}, false), false);
assert.equal(resolvePayPalPaymentsEnabled(null, false), false);
assert.equal(resolvePayPalPaymentsEnabled({ paypal_payments_enabled: true }, true), false);

const paymentMethod = readFileSync(
  "app/api/invoice/[token]/payment-method/route.ts",
  "utf8",
);
const createOrder = readFileSync(
  "app/api/invoice/[token]/paypal/create-order/route.ts",
  "utf8",
);
const shopCheckout = readFileSync("app/api/shop/checkout/route.ts", "utf8");
const offerCheckout = readFileSync(
  "app/api/offer/[token]/checkout/route.ts",
  "utf8",
);
const webhook = readFileSync("app/api/paypal/webhook/route.ts", "utf8");
const paypalReturn = readFileSync(
  "app/api/invoice/[token]/paypal/return/route.ts",
  "utf8",
);
const shopUi = readFileSync("app/shop/kasse/ShopKasseClient.tsx", "utf8");
const offerUi = readFileSync("app/angebot/[token]/checkout/page.tsx", "utf8");
const invoiceUi = readFileSync("app/rechnung/[invoiceToken]/page.tsx", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260825083000_paypal_payments_kill_switch.sql",
  "utf8",
);

for (const source of [paymentMethod, createOrder, shopCheckout, offerCheckout]) {
  assert.match(source, /PAYPAL_DISABLED_CODE/);
  assert.match(source, /isPayPalPaymentsEnabled/);
}

assert.ok(
  createOrder.indexOf("if (invoice.paypal_order_id)") <
    createOrder.indexOf("if (!(await isPayPalPaymentsEnabled(supabase)))"),
  "existing PayPal orders remain reusable before the new-order gate",
);
assert.ok(
  createOrder.indexOf("if (!(await isPayPalPaymentsEnabled(supabase)))") <
    createOrder.indexOf("const order = await createPayPalOrder"),
  "new orders are blocked before the provider call",
);
assert.doesNotMatch(webhook, /isPayPalPaymentsEnabled|PAYPAL_TEMPORARILY_DISABLED/);
assert.doesNotMatch(paypalReturn, /isPayPalPaymentsEnabled|PAYPAL_TEMPORARILY_DISABLED/);
assert.match(paypalReturn, /capturePayPalOrder/);

for (const source of [shopUi, offerUi]) {
  assert.match(source, /useState<PaymentMethod>\("bank_transfer"\)/);
  assert.match(source, /disabled={!paypalPaymentsEnabled}/);
  assert.match(source, /PayPal ist derzeit vorübergehend nicht verfügbar/);
}
assert.match(invoiceUi, /paypalPaymentsEnabled \? \(/);
assert.match(invoiceUi, /PAYPAL_DISABLED_MESSAGE/);

for (const source of [paymentMethod, shopCheckout, offerCheckout]) {
  assert.match(source, /bank_transfer/);
}
assert.match(paymentMethod, /cash_on_pickup/);
assert.match(migration, /paypal_payments_enabled boolean not null default false/);
assert.match(migration, /set paypal_payments_enabled = false/);

console.log("PayPal reversible kill switch: PASS");
