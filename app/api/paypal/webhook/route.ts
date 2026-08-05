import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { verifyPayPalWebhookSignature } from "@/app/lib/paypal";
import { processVerifiedPayPalPaymentFollowUp } from "@/app/lib/paypalPaymentFollowUpService";
import {
  decimalToCents,
  getStoredPayPalOrderIdentity,
  PayPalPaymentValidationError,
  validatePayPalCompletedPayment,
} from "@/app/lib/paypalPaymentValidation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PayPalWebhookEvent = {
  id: string | null;
  event_type: string | null;
  resource: {
    id: string | null;
    status: string | null;
    amount: { currency_code: string | null; value: string | null };
    custom_id: string | null;
    reference_id: string | null;
    invoice_id: string | null;
    order_id: string | null;
  };
};
type InvoiceRow = {
  id: string;
  invoice_token: string;
  total_amount: number | string | null;
  paypal_order_id: string | null;
  payment_provider_payload: unknown;
  paypal_payment_fingerprint: string | null;
};

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) throw new Error("SUPABASE_CONFIGURATION_MISSING");
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function record(value: unknown): object | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function text(value: object | null, key: string): string | null {
  const item = value ? Reflect.get(value, key) : null;
  return typeof item === "string" && item.trim() ? item : null;
}

function parseEvent(value: unknown): PayPalWebhookEvent | null {
  const event = record(value);
  if (!event) return null;
  const resource = record(Reflect.get(event, "resource"));
  const amount = record(resource ? Reflect.get(resource, "amount") : null);
  const supplementary = record(resource ? Reflect.get(resource, "supplementary_data") : null);
  const related = record(supplementary ? Reflect.get(supplementary, "related_ids") : null);
  return {
    id: text(event, "id"),
    event_type: text(event, "event_type"),
    resource: {
      id: text(resource, "id"),
      status: text(resource, "status"),
      amount: { currency_code: text(amount, "currency_code"), value: text(amount, "value") },
      custom_id: text(resource, "custom_id"),
      reference_id: text(resource, "reference_id"),
      invoice_id: text(resource, "invoice_id"),
      order_id: text(related, "order_id"),
    },
  };
}

function parseInvoice(value: unknown): InvoiceRow | null {
  const invoice = record(value);
  const id = text(invoice, "id");
  const invoiceToken = text(invoice, "invoice_token");
  if (!invoice || !id || !invoiceToken) return null;
  const totalAmount = Reflect.get(invoice, "total_amount");
  return {
    id,
    invoice_token: invoiceToken,
    total_amount: typeof totalAmount === "number" || typeof totalAmount === "string" ? totalAmount : null,
    paypal_order_id: text(invoice, "paypal_order_id"),
    payment_provider_payload: Reflect.get(invoice, "payment_provider_payload"),
    paypal_payment_fingerprint: text(invoice, "paypal_payment_fingerprint"),
  };
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ ok: false, code: "INVALID_JSON" }, { status: 400 });
    }
    const event = parseEvent(parsed);
    if (!event) return NextResponse.json({ ok: false, code: "INVALID_EVENT" }, { status: 400 });

    const verification = await verifyPayPalWebhookSignature({
      headers: request.headers,
      webhookEvent: parsed,
    });
    if (!verification.ok) {
      return NextResponse.json({ ok: false, code: "INVALID_SIGNATURE" }, { status: 400 });
    }
    if (event.event_type !== "PAYMENT.CAPTURE.COMPLETED") {
      return NextResponse.json({ ok: true, ignored: true });
    }
    const { id: captureId, order_id: orderId } = event.resource;
    if (!event.id || !captureId || !orderId) {
      return NextResponse.json({ ok: false, code: "ORDER_NOT_FOUND" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("school_request_invoices")
      .select("id,invoice_token,total_amount,paypal_order_id,payment_provider_payload,paypal_payment_fingerprint")
      .eq("paypal_order_id", orderId)
      .maybeSingle();
    const invoice = parseInvoice(data);
    if (error || !invoice) return NextResponse.json({ ok: false, code: "ORDER_NOT_FOUND" }, { status: 404 });

    const expectedOrder = getStoredPayPalOrderIdentity({
      paypalOrderId: invoice.paypal_order_id,
      paymentProviderPayload: invoice.payment_provider_payload,
    });
    validatePayPalCompletedPayment({
      expectedOrder,
      invoiceToken: invoice.invoice_token,
      invoiceTotalAmount: invoice.total_amount,
      orderId,
      customId: event.resource.custom_id,
      referenceId: event.resource.reference_id,
      invoiceId: event.resource.invoice_id,
      captureStatus: event.resource.status,
      captureAmount: event.resource.amount.value,
      captureCurrency: event.resource.amount.currency_code,
    });
    const amountCents = decimalToCents(event.resource.amount.value);
    if (amountCents === null || !event.resource.amount.currency_code) {
      throw new PayPalPaymentValidationError("CAPTURE_AMOUNT_MISMATCH", "PayPal-Capture ist unvollständig.");
    }
    const outcome = await processVerifiedPayPalPaymentFollowUp({
      supabase,
      invoiceId: invoice.id,
      orderId,
      captureId,
      paymentFingerprint: invoice.paypal_payment_fingerprint || "",
      amountCents,
      currency: event.resource.amount.currency_code,
      source: "webhook",
      eventId: event.id,
    });
    return NextResponse.json({ ok: true, outcome });
  } catch (error) {
    if (error instanceof PayPalPaymentValidationError) {
      return NextResponse.json({ ok: false, code: error.code }, { status: 409 });
    }
    console.error("PayPal webhook failed", error instanceof Error ? error.message : "UNKNOWN_ERROR");
    return NextResponse.json({ ok: false, code: "PAYPAL_WEBHOOK_FAILED" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true }, { status: 200 });
}
