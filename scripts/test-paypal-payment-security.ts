import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as nodeModule from "node:module";

const registerHooksValue: unknown = Reflect.get(nodeModule, "registerHooks");
if (typeof registerHooksValue !== "function") throw new Error("NODE_REGISTER_HOOKS_UNAVAILABLE");
const registerHooks = registerHooksValue as (hooks: {
  resolve(specifier: string, context: unknown, nextResolve: (specifier: string, context: unknown) => unknown): unknown;
}) => void;
registerHooks({
  resolve(specifier, context, nextResolve) {
    const modules: Record<string, string> = {
      "@/app/lib/paypal": "../app/lib/paypal.ts",
      "@/app/lib/paypalPaymentValidation": "../app/lib/paypalPaymentValidation.ts",
    };
    const target = modules[specifier];
    return target
      ? { shortCircuit: true, url: new URL(target, import.meta.url).href }
      : nextResolve(specifier, context);
  },
});

const { processVerifiedPayPalPaymentFollowUp } = await import(
  new URL("../app/lib/paypalPaymentFollowUpService.ts", import.meta.url).href
);
const { validatePayPalCompletedPayment, PayPalPaymentValidationError } = await import(
  new URL("../app/lib/paypalPaymentValidation.ts", import.meta.url).href
);

const identity = {
  invoiceId: "00000000-0000-4000-8000-000000000001",
  orderId: "ORDER-1",
  captureId: "CAPTURE-1",
  paymentFingerprint: "a".repeat(64),
  amountCents: 12345n,
  currency: "EUR",
};

type FollowState = "pending" | "processing" | "completed" | "failed_retryable" | "failed_terminal";
function createRpcModel() {
  const state = {
    paymentClaimed: false,
    followState: "pending" as FollowState,
    claimedBy: null as string | null,
    claimedAt: 0,
    completedAt: null as string | null,
    attempts: 0,
    actions: 0,
    failCompletion: false,
  };
  return {
    state,
    async rpc(name: string, args: Record<string, unknown>) {
      const identityMatches =
        args.p_invoice_id === identity.invoiceId &&
        args.p_order_id === identity.orderId &&
        args.p_capture_id === identity.captureId &&
        args.p_amount_cents === identity.amountCents.toString() &&
        args.p_currency === identity.currency;
      if (name === "claim_verified_paypal_payment") {
        if (!identityMatches || args.p_fingerprint !== identity.paymentFingerprint) {
          return { data: { status: "conflict", reason: "ORDER_MISMATCH" }, error: null };
        }
        if (state.paymentClaimed) return { data: { status: "already_claimed_same_payment" }, error: null };
        state.paymentClaimed = true;
        state.followState = "pending";
        return { data: { status: "claimed_now" }, error: null };
      }
      if (name === "claim_paypal_payment_follow_up") {
        if (!identityMatches) return { data: { status: "conflict" }, error: null };
        if (state.followState === "completed") return { data: { status: "completed" }, error: null };
        if (state.followState === "failed_terminal") return { data: { status: "failed_terminal" }, error: null };
        const now = Date.parse(String(args.p_now));
        if (state.followState === "processing" && state.claimedAt >= now - 300_000) {
          return { data: { status: "in_progress" }, error: null };
        }
        state.followState = "processing";
        state.claimedAt = now;
        state.claimedBy = String(args.p_claimed_by);
        state.attempts += 1;
        return { data: { status: "claimed" }, error: null };
      }
      if (name === "complete_paypal_payment_follow_up") {
        if (state.failCompletion) return { data: null, error: { code: "MOCK_FAILURE" } };
        if (!identityMatches || state.followState !== "processing" || state.claimedBy !== args.p_claimed_by) {
          return { data: { status: "conflict" }, error: null };
        }
        state.actions += 1;
        state.followState = "completed";
        state.completedAt = String(args.p_now);
        state.claimedBy = null;
        return { data: { status: "completed_now" }, error: null };
      }
      if (name === "fail_paypal_payment_follow_up") {
        if (state.followState === "processing" && state.claimedBy === args.p_claimed_by) {
          state.followState = args.p_terminal ? "failed_terminal" : "failed_retryable";
          state.claimedBy = null;
        }
        return { data: { status: state.followState }, error: null };
      }
      return { data: null, error: { code: "UNKNOWN_RPC" } };
    },
  };
}

function run(model: ReturnType<typeof createRpcModel>, source: "return" | "webhook", eventId: string | null = null) {
  return processVerifiedPayPalPaymentFollowUp({ supabase: model, ...identity, source, eventId });
}

const a = createRpcModel();
assert.equal(await run(a, "return"), "completed_now");
assert.equal(a.state.actions, 1);
console.log("A PASS");
assert.equal(await run(a, "webhook", "EVENT-1"), "already_completed");
assert.equal(a.state.actions, 1);
console.log("B PASS");

const c = createRpcModel();
assert.equal(await run(c, "webhook", "EVENT-2"), "completed_now");
console.log("C PASS");
assert.equal(await run(c, "return"), "already_completed");
console.log("D PASS");

const e = createRpcModel();
const parallel = await Promise.all([run(e, "return"), run(e, "webhook", "EVENT-3")]);
assert.equal(parallel.filter((value) => value === "completed_now").length, 1);
assert.equal(e.state.actions, 1);
console.log("E PASS");
assert.equal(await run(c, "webhook", "EVENT-2"), "already_completed");
console.log("F PASS");
assert.equal(await run(a, "return"), "already_completed");
const returnRouteForReload = readFileSync("app/api/invoice/[token]/paypal/return/route.ts", "utf8");
assert.match(
  returnRouteForReload,
  /payment_status === "payment_received"[\s\S]*?processVerifiedPayPalPaymentFollowUp[\s\S]*?paypal=success/,
);
console.log("G PASS");

const h = createRpcModel();
h.state.paymentClaimed = true;
h.state.followState = "processing";
h.state.claimedAt = Date.now();
assert.equal(await run(h, "webhook"), "in_progress");
assert.equal(h.state.actions, 0);
console.log("H PASS");

const i = createRpcModel();
i.state.paymentClaimed = true;
i.state.followState = "processing";
i.state.claimedAt = Date.now() - 301_000;
assert.equal(await run(i, "return"), "completed_now");
console.log("I PASS");

const j = createRpcModel();
j.state.failCompletion = true;
await assert.rejects(run(j, "return"));
assert.equal(j.state.followState, "failed_retryable");
assert.equal(j.state.completedAt, null);
console.log("J PASS");
j.state.failCompletion = false;
assert.equal(await run(j, "webhook"), "completed_now");
console.log("K PASS");

const l = createRpcModel();
l.state.paymentClaimed = true;
l.state.followState = "failed_terminal";
await assert.rejects(run(l, "return"), /PAYPAL_FOLLOW_UP_TERMINAL/);
assert.equal(l.state.actions, 0);
console.log("L PASS");

const expectedOrder = { orderId: identity.orderId, customId: "TOKEN", referenceId: "TOKEN", invoiceId: "INV-1" };
const valid = { expectedOrder, invoiceToken: "TOKEN", invoiceTotalAmount: "123.45", orderId: identity.orderId, customId: "TOKEN", referenceId: "TOKEN", invoiceId: "INV-1", captureStatus: "COMPLETED", captureAmount: "123.45", captureCurrency: "EUR" };
assert.throws(() => validatePayPalCompletedPayment({ ...valid, captureAmount: "123.44" }), PayPalPaymentValidationError);
console.log("M PASS");
assert.throws(() => validatePayPalCompletedPayment({ ...valid, captureCurrency: "USD" }), PayPalPaymentValidationError);
console.log("N PASS");
const o = createRpcModel();
await assert.rejects(processVerifiedPayPalPaymentFollowUp({ supabase: o, ...identity, orderId: "FOREIGN", source: "return", eventId: null }), PayPalPaymentValidationError);
console.log("O PASS");
const p = createRpcModel();
await assert.rejects(processVerifiedPayPalPaymentFollowUp({ supabase: p, ...identity, invoiceId: "FOREIGN", source: "return", eventId: null }), PayPalPaymentValidationError);
console.log("P PASS");
assert.ok(a.state.completedAt);
console.log("Q PASS");
assert.equal(e.state.attempts, 1);
console.log("R PASS");

const serviceSource = readFileSync("app/lib/paypalPaymentFollowUpService.ts", "utf8");
const paypalSource = readFileSync("app/lib/paypal.ts", "utf8");
assert.doesNotMatch(serviceSource, /capturePayPalOrder/);
console.log("S PASS");
assert.equal(e.state.actions, 1);
console.log("T PASS");
assert.equal(e.state.actions, 1);
console.log("U PASS");
const returnSource = readFileSync("app/api/invoice/[token]/paypal/return/route.ts", "utf8");
const webhookSource = readFileSync("app/api/paypal/webhook/route.ts", "utf8");
for (const source of [returnSource, webhookSource]) assert.match(source, /processVerifiedPayPalPaymentFollowUp/);
console.log("V PASS");
for (const source of [returnSource, webhookSource]) {
  assert.doesNotMatch(source, /school_request_events|school_request_payment_events|claim_verified_paypal_payment/);
}
console.log("W PASS");

const migration = readFileSync("supabase/migrations/20260803050000_paypal_payment_idempotency.sql", "utf8");
for (const rpc of ["claim_paypal_payment_follow_up", "complete_paypal_payment_follow_up", "fail_paypal_payment_follow_up"]) {
  assert.match(migration, new RegExp(`security definer[\\s\\S]*?${rpc}|${rpc}[\\s\\S]*?security definer`, "i"));
  assert.match(migration, new RegExp(`revoke all on function public\\.${rpc}[\\s\\S]*?service_role`, "i"));
  assert.match(migration, new RegExp(`grant execute on function public\\.${rpc}[\\s\\S]*?to service_role`, "i"));
}
console.log("X PASS");
for (const source of [serviceSource, returnSource, webhookSource]) {
  assert.doesNotMatch(source, /client_secret|SUPABASE_SERVICE_ROLE_KEY[^\n]*console|console\.(?:log|error)\([^\n]*(?:payload|event)/i);
}
console.log("Y PASS");
assert.match(paypalSource, /getRequiredEnv\("PAYPAL_ENV"\)/);
assert.doesNotMatch(paypalSource, /PAYPAL_ENV\s*\|\||production|prod/);
console.log("Z PASS");
