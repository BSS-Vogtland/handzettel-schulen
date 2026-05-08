import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { capturePayPalOrder } from "@/app/lib/paypal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    token: string;
  }>;
};

type InvoiceRow = {
  id: string;
  request_id: string;
  invoice_token: string;
  invoice_number: string | null;
  paypal_order_id: string | null;
  total_amount: number | string | null;
  currency: string | null;
};

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase Umgebungsvariablen fehlen. Prüfe NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function getSiteUrl(request: Request) {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    new URL(request.url).origin
  );
}

async function insertRequestEvent(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  requestId: string;
  eventType: string;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}) {
  const { supabase, requestId, eventType, title, message, metadata } = params;
  const createdAt = new Date().toISOString();

  const payloads = [
    {
      request_id: requestId,
      event_type: eventType,
      title,
      message,
      description: message,
      metadata: metadata || null,
      created_at: createdAt,
    },
    {
      request_id: requestId,
      event_type: eventType,
      message,
      metadata: metadata || null,
      created_at: createdAt,
    },
    {
      request_id: requestId,
      event_type: eventType,
      message,
      created_at: createdAt,
    },
    {
      request_id: requestId,
      type: eventType,
      message,
      created_at: createdAt,
    },
  ];

  for (const payload of payloads) {
    const { error } = await supabase.from("school_request_events").insert(payload);

    if (!error) return;
  }
}

async function insertPaymentEvent(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  invoice: InvoiceRow;
  eventType: string;
  providerStatus: string | null;
  providerReference?: string | null;
  providerPayload?: unknown;
  message: string;
}) {
  const {
    supabase,
    invoice,
    eventType,
    providerStatus,
    providerReference,
    providerPayload,
    message,
  } = params;

  await supabase.from("school_request_payment_events").insert({
    invoice_id: invoice.id,
    request_id: invoice.request_id,
    event_type: eventType,
    payment_method: "paypal",
    payment_provider: "paypal",
    amount: invoice.total_amount,
    currency: invoice.currency || "EUR",
    provider_reference: providerReference || null,
    provider_status: providerStatus || null,
    provider_payload: providerPayload || null,
    message,
    created_at: new Date().toISOString(),
  });
}

export async function GET(request: Request, context: RouteContext) {
  const { token } = await context.params;
  const invoiceToken = String(token || "").trim();

  try {
    const url = new URL(request.url);

    const paypalOrderIdFromQuery =
      url.searchParams.get("token") || url.searchParams.get("orderId");

    if (!invoiceToken) {
      return NextResponse.redirect(
        `${getSiteUrl(request)}/rechnung/fehler?reason=missing_invoice_token`
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: invoiceData, error: invoiceError } = await supabase
      .from("school_request_invoices")
      .select(
        [
          "id",
          "request_id",
          "invoice_token",
          "invoice_number",
          "paypal_order_id",
          "total_amount",
          "currency",
        ].join(", ")
      )
      .eq("invoice_token", invoiceToken)
      .maybeSingle();

    if (invoiceError || !invoiceData) {
      return NextResponse.redirect(
        `${getSiteUrl(request)}/rechnung/${invoiceToken}?paypal=error`
      );
    }

    const invoice = invoiceData as unknown as InvoiceRow;
    const paypalOrderId = paypalOrderIdFromQuery || invoice.paypal_order_id;

    if (!paypalOrderId) {
      return NextResponse.redirect(
        `${getSiteUrl(request)}/rechnung/${invoiceToken}?paypal=missing_order`
      );
    }

    const capture = await capturePayPalOrder({
      orderId: paypalOrderId,
    });

    const isCompleted =
      String(capture.status || "").toUpperCase() === "COMPLETED";

    const now = new Date().toISOString();

    if (!isCompleted) {
      await supabase
        .from("school_request_invoices")
        .update({
          payment_provider_status: capture.status,
          paypal_payment_status: capture.status,
          payment_provider_payload: capture.raw,
          updated_at: now,
        })
        .eq("id", invoice.id);

      await insertPaymentEvent({
        supabase,
        invoice,
        eventType: "paypal_capture_not_completed",
        providerStatus: capture.status,
        providerReference: capture.captureId || capture.orderId,
        providerPayload: capture.raw,
        message:
          "PayPal-Zahlung wurde zurückgemeldet, aber nicht als abgeschlossen bestätigt.",
      });

      return NextResponse.redirect(
        `${getSiteUrl(request)}/rechnung/${invoiceToken}?paypal=pending`
      );
    }

    const { error: updateInvoiceError } = await supabase
      .from("school_request_invoices")
      .update({
        selected_payment_method: "paypal",
        payment_status: "payment_received",
        payment_provider: "paypal",
        payment_provider_reference: capture.captureId || capture.orderId,
        payment_provider_status: capture.status,
        payment_provider_payload: capture.raw,
        paypal_order_id: capture.orderId,
        paypal_capture_id: capture.captureId,
        paypal_payer_email: capture.payerEmail,
        paypal_payment_status: capture.status,
        paid_at: now,
        updated_at: now,
      })
      .eq("id", invoice.id);

    if (updateInvoiceError) {
      throw new Error(updateInvoiceError.message);
    }

    const { error: updateRequestError } = await supabase
      .from("school_requests")
      .update({
        selected_payment_method: "paypal",
        payment_status: "payment_received",
        payment_received_at: now,
        latest_invoice_id: invoice.id,
        updated_at: now,
      })
      .eq("id", invoice.request_id);

    if (updateRequestError) {
      throw new Error(updateRequestError.message);
    }

    await insertPaymentEvent({
      supabase,
      invoice,
      eventType: "paypal_payment_completed",
      providerStatus: capture.status,
      providerReference: capture.captureId || capture.orderId,
      providerPayload: capture.raw,
      message: "PayPal-Zahlung wurde erfolgreich abgeschlossen.",
    });

    await insertRequestEvent({
      supabase,
      requestId: invoice.request_id,
      eventType: "paypal_payment_completed",
      title: "PayPal-Zahlung abgeschlossen",
      message: "Die Rechnung wurde erfolgreich per PayPal bezahlt.",
      metadata: {
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
        paypal_order_id: capture.orderId,
        paypal_capture_id: capture.captureId,
        payer_email: capture.payerEmail,
        amount_value: capture.amountValue,
        currency_code: capture.currencyCode,
      },
    });

    return NextResponse.redirect(
      `${getSiteUrl(request)}/rechnung/${invoiceToken}?paypal=success`
    );
  } catch (error) {
    console.error("PayPal return capture error:", error);

    return NextResponse.redirect(
      `${getSiteUrl(request)}/rechnung/${invoiceToken}?paypal=error`
    );
  }
}