import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { verifyPayPalWebhookSignature } from "@/app/lib/paypal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PayPalWebhookEvent = {
  id?: string;
  event_type?: string;
  create_time?: string;
  resource_type?: string;
  summary?: string;
  resource?: {
    id?: string;
    status?: string;
    amount?: {
      currency_code?: string;
      value?: string;
    };
    custom_id?: string;
    invoice_id?: string;
    supplementary_data?: {
      related_ids?: {
        order_id?: string;
        authorization_id?: string;
        capture_id?: string;
      };
    };
    payer?: {
      email_address?: string;
      payer_id?: string;
    };
  };
};

type InvoiceRow = {
  id: string;
  request_id: string;
  invoice_number: string | null;
  invoice_token: string | null;
  total_amount: number | string | null;
  currency: string | null;
  paypal_order_id: string | null;
  payment_provider_reference: string | null;
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

function toNumber(value: unknown, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
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
  invoice: InvoiceRow | null;
  eventType: string;
  paymentMethod: string;
  providerStatus: string | null;
  providerReference: string | null;
  amount: number | string | null;
  currency: string | null;
  providerPayload: unknown;
  message: string;
}) {
  const {
    supabase,
    invoice,
    eventType,
    paymentMethod,
    providerStatus,
    providerReference,
    amount,
    currency,
    providerPayload,
    message,
  } = params;

  await supabase.from("school_request_payment_events").insert({
    invoice_id: invoice?.id || null,
    request_id: invoice?.request_id || null,
    event_type: eventType,
    payment_method: paymentMethod,
    payment_provider: "paypal",
    amount,
    currency: currency || "EUR",
    provider_reference: providerReference,
    provider_status: providerStatus,
    provider_payload: providerPayload || null,
    message,
    created_at: new Date().toISOString(),
  });
}

function getOrderIdFromWebhook(event: PayPalWebhookEvent) {
  return (
    event.resource?.supplementary_data?.related_ids?.order_id ||
    event.resource?.custom_id ||
    null
  );
}

function getCaptureIdFromWebhook(event: PayPalWebhookEvent) {
  return event.resource?.id || null;
}

async function findInvoiceByPayPalOrderId(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  orderId: string | null;
}) {
  const { supabase, orderId } = params;

  if (!orderId) return null;

  const queries = [
    supabase
      .from("school_request_invoices")
      .select(
        [
          "id",
          "request_id",
          "invoice_number",
          "invoice_token",
          "total_amount",
          "currency",
          "paypal_order_id",
          "payment_provider_reference",
        ].join(", ")
      )
      .eq("paypal_order_id", orderId)
      .maybeSingle(),

    supabase
      .from("school_request_invoices")
      .select(
        [
          "id",
          "request_id",
          "invoice_number",
          "invoice_token",
          "total_amount",
          "currency",
          "paypal_order_id",
          "payment_provider_reference",
        ].join(", ")
      )
      .eq("payment_provider_reference", orderId)
      .maybeSingle(),
  ];

  for (const query of queries) {
    const { data, error } = await query;

    if (!error && data) {
      return data as unknown as InvoiceRow;
    }
  }

  return null;
}

async function markInvoiceAsPaid(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  invoice: InvoiceRow;
  event: PayPalWebhookEvent;
  orderId: string | null;
  captureId: string | null;
}) {
  const { supabase, invoice, event, orderId, captureId } = params;

  const now = new Date().toISOString();
  const amountValue = event.resource?.amount?.value || invoice.total_amount;
  const currencyCode = event.resource?.amount?.currency_code || invoice.currency || "EUR";
  const paidAmount = toNumber(amountValue, toNumber(invoice.total_amount, 0));

  await supabase
    .from("school_request_invoices")
    .update({
      selected_payment_method: "paypal",
      payment_status: "payment_received",
      payment_provider: "paypal",
      paypal_payment_status: "completed",
      paypal_capture_id: captureId,
      payment_provider_reference: orderId || invoice.payment_provider_reference,
      payment_provider_status: "completed",
      payment_provider_payload: event,
      payment_received_at: now,
      paid_at: now,
      updated_at: now,
    })
    .eq("id", invoice.id);

  await supabase
    .from("school_requests")
    .update({
      selected_payment_method: "paypal",
      payment_status: "payment_received",
      latest_invoice_id: invoice.id,
      payment_received_at: now,
      updated_at: now,
    })
    .eq("id", invoice.request_id);

  await insertPaymentEvent({
    supabase,
    invoice,
    eventType: "paypal_webhook_payment_completed",
    paymentMethod: "paypal",
    providerStatus: "completed",
    providerReference: captureId || orderId,
    amount: paidAmount,
    currency: currencyCode,
    providerPayload: event,
    message: "PayPal-Zahlung wurde per Webhook als bezahlt bestätigt.",
  });

  await insertRequestEvent({
    supabase,
    requestId: invoice.request_id,
    eventType: "paypal_webhook_payment_completed",
    title: "PayPal-Zahlung bestätigt",
    message: "PayPal hat die Zahlung per Webhook als abgeschlossen gemeldet.",
    metadata: {
      invoice_id: invoice.id,
      invoice_number: invoice.invoice_number,
      paypal_order_id: orderId,
      paypal_capture_id: captureId,
      amount: paidAmount,
      currency: currencyCode,
      paypal_event_id: event.id,
    },
  });
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();

    let event: PayPalWebhookEvent;

    try {
      event = JSON.parse(rawBody) as PayPalWebhookEvent;
    } catch {
      return NextResponse.json(
        {
          ok: false,
          message: "PayPal Webhook Body ist kein gültiges JSON.",
        },
        { status: 400 }
      );
    }

    const verification = await verifyPayPalWebhookSignature({
      headers: request.headers,
      webhookEvent: event,
    });

    if (!verification.ok) {
      console.error("PayPal Webhook verification failed:", verification);

      return NextResponse.json(
        {
          ok: false,
          message: verification.message,
          status: verification.status,
        },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const eventType = event.event_type || "UNKNOWN";
    const orderId = getOrderIdFromWebhook(event);
    const captureId = getCaptureIdFromWebhook(event);

    if (eventType === "PAYMENT.CAPTURE.COMPLETED") {
      const invoice = await findInvoiceByPayPalOrderId({
        supabase,
        orderId,
      });

      if (!invoice) {
        await insertPaymentEvent({
          supabase,
          invoice: null,
          eventType: "paypal_webhook_unmatched_payment_completed",
          paymentMethod: "paypal",
          providerStatus: event.resource?.status || "completed",
          providerReference: captureId || orderId,
          amount: event.resource?.amount?.value || null,
          currency: event.resource?.amount?.currency_code || "EUR",
          providerPayload: event,
          message:
            "PayPal meldete eine abgeschlossene Zahlung, aber es wurde keine passende Rechnung gefunden.",
        });

        return NextResponse.json({
          ok: true,
          message:
            "PayPal Webhook verarbeitet, aber keine passende Rechnung gefunden.",
          eventType,
          orderId,
          captureId,
        });
      }

      await markInvoiceAsPaid({
        supabase,
        invoice,
        event,
        orderId,
        captureId,
      });

      return NextResponse.json({
        ok: true,
        message: "PayPal-Zahlung per Webhook als bezahlt markiert.",
        eventType,
        orderId,
        captureId,
      });
    }

    await insertPaymentEvent({
      supabase,
      invoice: null,
      eventType: `paypal_webhook_${eventType.toLowerCase().replace(/\./g, "_")}`,
      paymentMethod: "paypal",
      providerStatus: event.resource?.status || null,
      providerReference: captureId || orderId,
      amount: event.resource?.amount?.value || null,
      currency: event.resource?.amount?.currency_code || "EUR",
      providerPayload: event,
      message: `PayPal Webhook empfangen: ${eventType}`,
    });

    return NextResponse.json({
      ok: true,
      message: "PayPal Webhook empfangen.",
      eventType,
      orderId,
      captureId,
    });
  } catch (error) {
    console.error("PayPal webhook error:", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "PayPal Webhook konnte nicht verarbeitet werden.",
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      message: "PayPal Webhook Route ist erreichbar.",
    },
    { status: 200 }
  );
}