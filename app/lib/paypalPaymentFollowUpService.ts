import { randomUUID } from "node:crypto";

import { buildPayPalCaptureRequestId } from "@/app/lib/paypal";
import { PayPalPaymentValidationError } from "@/app/lib/paypalPaymentValidation";

export type PayPalFollowUpSource = "return" | "webhook";
export type PayPalFollowUpOutcome =
  | "completed_now"
  | "already_completed"
  | "in_progress";

type RpcResult = { status: string; reason?: string };
export type PayPalRpcClient = {
  rpc(
    functionName: string,
    parameters: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>;
};

type VerifiedPayPalFollowUpInput = {
  supabase: PayPalRpcClient;
  invoiceId: string;
  orderId: string;
  captureId: string;
  amountCents: bigint;
  currency: string;
  source: PayPalFollowUpSource;
  eventId: string | null;
  now?: string;
};

function parseRpcResult(value: unknown, operation: string): RpcResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${operation}_INVALID_RESULT`);
  }
  const status = Reflect.get(value, "status");
  const reason = Reflect.get(value, "reason");
  if (typeof status !== "string") throw new Error(`${operation}_INVALID_RESULT`);
  return { status, reason: typeof reason === "string" ? reason : undefined };
}

function paymentConflict(reason?: string): never {
  throw new PayPalPaymentValidationError(
    reason === "CAPTURE_ID_CONFLICT" ? "CAPTURE_ID_CONFLICT" : "ORDER_MISMATCH",
    "PayPal-Zahlung steht im Konflikt mit der gespeicherten Rechnung.",
  );
}

export async function processVerifiedPayPalPaymentFollowUp(input: {
  supabase: PayPalRpcClient;
  invoiceId: string;
  orderId: string;
  captureId: string;
  paymentFingerprint: string;
  amountCents: bigint;
  currency: string;
  source: PayPalFollowUpSource;
  eventId: string | null;
  now?: string;
}): Promise<PayPalFollowUpOutcome> {
  const now = input.now ?? new Date().toISOString();
  const captureRequestId = buildPayPalCaptureRequestId({
    orderId: input.orderId,
    paymentFingerprint: input.paymentFingerprint,
  });

  const paymentResponse = await input.supabase.rpc("claim_verified_paypal_payment", {
    p_invoice_id: input.invoiceId,
    p_order_id: input.orderId,
    p_fingerprint: input.paymentFingerprint,
    p_capture_request_id: captureRequestId,
    p_capture_id: input.captureId,
    p_amount_cents: input.amountCents.toString(),
    p_currency: input.currency,
    p_event_id: input.eventId,
    p_source: input.source,
    p_now: now,
  });
  if (paymentResponse.error) throw new Error("PAYPAL_PAYMENT_CLAIM_FAILED");
  const paymentClaim = parseRpcResult(paymentResponse.data, "PAYPAL_PAYMENT_CLAIM");
  if (paymentClaim.status === "conflict") paymentConflict(paymentClaim.reason);
  if (!['claimed_now', 'already_claimed_same_payment'].includes(paymentClaim.status)) {
    throw new Error("PAYPAL_PAYMENT_CLAIM_UNEXPECTED_STATUS");
  }

  return runVerifiedPayPalFollowUp({ ...input, now });
}

export async function retryVerifiedPayPalPaymentFollowUp(
  input: VerifiedPayPalFollowUpInput,
): Promise<PayPalFollowUpOutcome> {
  return runVerifiedPayPalFollowUp(input);
}

async function runVerifiedPayPalFollowUp(
  input: VerifiedPayPalFollowUpInput,
): Promise<PayPalFollowUpOutcome> {
  const now = input.now ?? new Date().toISOString();
  const claimedBy = randomUUID();

  const followUpResponse = await input.supabase.rpc("claim_paypal_payment_follow_up", {
    p_invoice_id: input.invoiceId,
    p_order_id: input.orderId,
    p_capture_id: input.captureId,
    p_amount_cents: input.amountCents.toString(),
    p_currency: input.currency,
    p_claimed_by: claimedBy,
    p_now: now,
  });
  if (followUpResponse.error) throw new Error("PAYPAL_FOLLOW_UP_CLAIM_FAILED");
  const followUpClaim = parseRpcResult(followUpResponse.data, "PAYPAL_FOLLOW_UP_CLAIM");
  if (followUpClaim.status === "completed") return "already_completed";
  if (followUpClaim.status === "in_progress") return "in_progress";
  if (followUpClaim.status === "failed_terminal") {
    throw new Error("PAYPAL_FOLLOW_UP_TERMINAL");
  }
  if (followUpClaim.status === "legacy_unadopted") {
    throw new Error("PAYPAL_FOLLOW_UP_LEGACY_UNADOPTED");
  }
  if (followUpClaim.status === "conflict") paymentConflict(followUpClaim.reason);
  if (followUpClaim.status !== "claimed") {
    throw new Error("PAYPAL_FOLLOW_UP_CLAIM_UNEXPECTED_STATUS");
  }

  try {
    const completionResponse = await input.supabase.rpc(
      "complete_paypal_payment_follow_up",
      {
        p_invoice_id: input.invoiceId,
        p_order_id: input.orderId,
        p_capture_id: input.captureId,
        p_amount_cents: input.amountCents.toString(),
        p_currency: input.currency,
        p_claimed_by: claimedBy,
        p_source: input.source,
        p_event_id: input.eventId,
        p_now: now,
      },
    );
    if (completionResponse.error) throw new Error("PAYPAL_FOLLOW_UP_COMPLETION_FAILED");
    const completion = parseRpcResult(completionResponse.data, "PAYPAL_FOLLOW_UP_COMPLETION");
    if (completion.status === "completed") return "already_completed";
    if (completion.status !== "completed_now") {
      throw new Error("PAYPAL_FOLLOW_UP_COMPLETION_UNEXPECTED_STATUS");
    }
    return "completed_now";
  } catch (error) {
    const errorCode = error instanceof Error ? error.message : "PAYPAL_FOLLOW_UP_FAILED";
    await input.supabase.rpc("fail_paypal_payment_follow_up", {
      p_invoice_id: input.invoiceId,
      p_claimed_by: claimedBy,
      p_error_code: errorCode,
      p_error_message: "PayPal follow-up failed; controlled retry required.",
      p_terminal: false,
      p_now: new Date().toISOString(),
    });
    throw error;
  }
}
