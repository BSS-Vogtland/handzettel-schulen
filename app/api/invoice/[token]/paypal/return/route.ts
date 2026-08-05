import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { capturePayPalOrder } from "@/app/lib/paypal";
import { processVerifiedPayPalPaymentFollowUp } from "@/app/lib/paypalPaymentFollowUpService";
import {
  classifyPayPalCaptureStatus,
  decimalToCents,
  getStoredPayPalOrderIdentity,
  PayPalPaymentValidationError,
  validatePayPalCompletedPayment,
} from "@/app/lib/paypalPaymentValidation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ token: string }> };
type InvoiceRow = {
  id: string;
  invoice_token: string;
  paypal_order_id: string | null;
  payment_status: string | null;
  payment_provider_payload: unknown;
  total_amount: number | string | null;
  paypal_payment_fingerprint: string | null;
  paypal_capture_id: string | null;
  paypal_captured_amount_cents: number | string | null;
  paypal_captured_currency: string | null;
};

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) throw new Error("SUPABASE_CONFIGURATION_MISSING");
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function getSiteUrl(request: Request) {
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || new URL(request.url).origin;
}

function parseInvoice(value: unknown): InvoiceRow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const id = Reflect.get(value, "id");
  const invoiceToken = Reflect.get(value, "invoice_token");
  if (typeof id !== "string" || typeof invoiceToken !== "string") return null;
  return {
    id,
    invoice_token: invoiceToken,
    paypal_order_id: typeof Reflect.get(value, "paypal_order_id") === "string" ? Reflect.get(value, "paypal_order_id") : null,
    payment_status: typeof Reflect.get(value, "payment_status") === "string" ? Reflect.get(value, "payment_status") : null,
    payment_provider_payload: Reflect.get(value, "payment_provider_payload"),
    total_amount: typeof Reflect.get(value, "total_amount") === "number" || typeof Reflect.get(value, "total_amount") === "string" ? Reflect.get(value, "total_amount") : null,
    paypal_payment_fingerprint: typeof Reflect.get(value, "paypal_payment_fingerprint") === "string" ? Reflect.get(value, "paypal_payment_fingerprint") : null,
    paypal_capture_id: typeof Reflect.get(value, "paypal_capture_id") === "string" ? Reflect.get(value, "paypal_capture_id") : null,
    paypal_captured_amount_cents: typeof Reflect.get(value, "paypal_captured_amount_cents") === "number" || typeof Reflect.get(value, "paypal_captured_amount_cents") === "string" ? Reflect.get(value, "paypal_captured_amount_cents") : null,
    paypal_captured_currency: typeof Reflect.get(value, "paypal_captured_currency") === "string" ? Reflect.get(value, "paypal_captured_currency") : null,
  };
}

export async function GET(request: Request, context: RouteContext) {
  const { token } = await context.params;
  const invoiceToken = String(token || "").trim();
  try {
    if (!invoiceToken) return NextResponse.redirect(`${getSiteUrl(request)}/rechnung/fehler?reason=missing_invoice_token`);
    const returnOrderId = new URL(request.url).searchParams.get("token");
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("school_request_invoices")
      .select("id,invoice_token,paypal_order_id,payment_status,payment_provider_payload,total_amount,paypal_payment_fingerprint,paypal_capture_id,paypal_captured_amount_cents,paypal_captured_currency")
      .eq("invoice_token", invoiceToken)
      .maybeSingle();
    const invoice = parseInvoice(data);
    if (error || !invoice) throw new Error("PAYPAL_INVOICE_NOT_FOUND");

    const expectedOrder = getStoredPayPalOrderIdentity({
      paypalOrderId: invoice.paypal_order_id,
      paymentProviderPayload: invoice.payment_provider_payload,
    });
    if (returnOrderId && returnOrderId !== expectedOrder.orderId) {
      throw new PayPalPaymentValidationError("ORDER_MISMATCH", "PayPal-Order gehört nicht zu dieser Rechnung.");
    }
    if (invoice.payment_status === "payment_received") {
      if (
        invoice.paypal_capture_id &&
        invoice.paypal_captured_amount_cents !== null &&
        invoice.paypal_captured_currency
      ) {
        await processVerifiedPayPalPaymentFollowUp({
          supabase,
          invoiceId: invoice.id,
          orderId: expectedOrder.orderId,
          captureId: invoice.paypal_capture_id,
          paymentFingerprint: invoice.paypal_payment_fingerprint || "",
          amountCents: BigInt(invoice.paypal_captured_amount_cents),
          currency: invoice.paypal_captured_currency,
          source: "return",
          eventId: null,
        });
      }
      return NextResponse.redirect(`${getSiteUrl(request)}/rechnung/${invoiceToken}?paypal=success`);
    }

    const capture = await capturePayPalOrder({
      orderId: expectedOrder.orderId,
      paymentFingerprint: invoice.paypal_payment_fingerprint || "",
    });
    const disposition = classifyPayPalCaptureStatus(capture.status);
    if (disposition === "pending") {
      return NextResponse.redirect(`${getSiteUrl(request)}/rechnung/${invoiceToken}?paypal=pending`);
    }
    if (disposition !== "completed") {
      throw new PayPalPaymentValidationError("INVALID_CAPTURE_STATUS", "PayPal-Capture ist nicht abgeschlossen.");
    }
    validatePayPalCompletedPayment({
      expectedOrder,
      invoiceToken: invoice.invoice_token,
      invoiceTotalAmount: invoice.total_amount,
      orderId: capture.orderId,
      customId: capture.customId,
      referenceId: capture.referenceId,
      invoiceId: capture.invoiceId,
      captureStatus: capture.status,
      captureAmount: capture.amountValue,
      captureCurrency: capture.currencyCode,
    });
    const amountCents = decimalToCents(capture.amountValue);
    if (amountCents === null || !capture.captureId || !capture.currencyCode) {
      throw new PayPalPaymentValidationError("CAPTURE_AMOUNT_MISMATCH", "PayPal-Capture ist unvollständig.");
    }
    await processVerifiedPayPalPaymentFollowUp({
      supabase,
      invoiceId: invoice.id,
      orderId: expectedOrder.orderId,
      captureId: capture.captureId,
      paymentFingerprint: invoice.paypal_payment_fingerprint || "",
      amountCents,
      currency: capture.currencyCode,
      source: "return",
      eventId: null,
    });
    return NextResponse.redirect(`${getSiteUrl(request)}/rechnung/${invoiceToken}?paypal=success`);
  } catch (error) {
    console.error("PayPal return failed", error instanceof Error ? error.message : "UNKNOWN_ERROR");
    const code = error instanceof PayPalPaymentValidationError ? error.code : "PAYPAL_CAPTURE_FAILED";
    return NextResponse.redirect(`${getSiteUrl(request)}/rechnung/${invoiceToken}?paypal=error&code=${encodeURIComponent(code)}`);
  }
}
