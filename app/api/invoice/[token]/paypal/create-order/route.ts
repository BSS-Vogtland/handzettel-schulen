import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createPayPalOrder } from "@/app/lib/paypal";

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
  invoice_number: string | null;
  invoice_token: string;
  invoice_status: string | null;
  payment_status: string | null;
  selected_payment_method: string | null;
  total_amount: number | string | null;
  currency: string | null;
};

type RequestRow = {
  id: string;
  request_number: string | null;
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
  invoice: InvoiceRow;
  eventType: string;
  providerStatus: string;
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
    provider_status: providerStatus,
    provider_payload: providerPayload || null,
    message,
    created_at: new Date().toISOString(),
  });
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { token } = await context.params;
    const invoiceToken = String(token || "").trim();

    if (!invoiceToken) {
      return NextResponse.json(
        {
          ok: false,
          message: "Kein Rechnungstoken übergeben.",
        },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: invoiceData, error: invoiceError } = await supabase
      .from("school_request_invoices")
      .select(
        [
          "id",
          "request_id",
          "invoice_number",
          "invoice_token",
          "invoice_status",
          "payment_status",
          "selected_payment_method",
          "total_amount",
          "currency",
        ].join(", ")
      )
      .eq("invoice_token", invoiceToken)
      .maybeSingle();

    if (invoiceError || !invoiceData) {
      return NextResponse.json(
        {
          ok: false,
          message: invoiceError?.message || "Die Rechnung wurde nicht gefunden.",
        },
        { status: 404 }
      );
    }

    const invoice = invoiceData as unknown as InvoiceRow;

    if (
      invoice.payment_status === "payment_received" ||
      invoice.payment_status === "cash_paid"
    ) {
      return NextResponse.json(
        {
          ok: false,
          message: "Diese Rechnung wurde bereits als bezahlt markiert.",
        },
        { status: 409 }
      );
    }

    const totalAmount = toNumber(invoice.total_amount, 0);

    if (totalAmount <= 0) {
      return NextResponse.json(
        {
          ok: false,
          message: "Der Rechnungsbetrag ist ungültig.",
        },
        { status: 409 }
      );
    }

    const { data: requestData } = await supabase
      .from("school_requests")
      .select("id, request_number")
      .eq("id", invoice.request_id)
      .maybeSingle();

    const requestRow = requestData as unknown as RequestRow | null;

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
      new URL(request.url).origin;

    const returnUrl = `${siteUrl}/api/invoice/${invoice.invoice_token}/paypal/return`;
    const cancelUrl = `${siteUrl}/api/invoice/${invoice.invoice_token}/paypal/cancel`;

    const order = await createPayPalOrder({
      invoiceToken: invoice.invoice_token,
      invoiceNumber: invoice.invoice_number || invoice.invoice_token,
      requestNumber: requestRow?.request_number,
      totalAmount,
      currency: invoice.currency || "EUR",
      description: `Schulpaket ${
        requestRow?.request_number || invoice.invoice_number || ""
      }`,
      returnUrl,
      cancelUrl,
    });

    const now = new Date().toISOString();

    const { error: updateInvoiceError } = await supabase
      .from("school_request_invoices")
      .update({
        selected_payment_method: "paypal",
        payment_status: "waiting_for_payment",
        payment_provider: "paypal",
        paypal_order_id: order.orderId,
        paypal_payment_status: "created",
        payment_provider_reference: order.orderId,
        payment_provider_status: "created",
        payment_provider_payload: order.raw,
        updated_at: now,
      })
      .eq("id", invoice.id);

    if (updateInvoiceError) {
      return NextResponse.json(
        {
          ok: false,
          message: `PayPal Order wurde erstellt, aber die Rechnung konnte nicht aktualisiert werden: ${updateInvoiceError.message}`,
        },
        { status: 500 }
      );
    }

    await supabase
      .from("school_requests")
      .update({
        selected_payment_method: "paypal",
        payment_status: "waiting_for_payment",
        latest_invoice_id: invoice.id,
        updated_at: now,
      })
      .eq("id", invoice.request_id);

    await insertPaymentEvent({
      supabase,
      invoice,
      eventType: "paypal_order_created",
      providerStatus: "created",
      providerReference: order.orderId,
      providerPayload: order.raw,
      message: "PayPal-Zahlung wurde gestartet.",
    });

    await insertRequestEvent({
      supabase,
      requestId: invoice.request_id,
      eventType: "paypal_payment_started",
      title: "PayPal-Zahlung gestartet",
      message: "Der Kunde wurde zur PayPal-Zahlung weitergeleitet.",
      metadata: {
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
        paypal_order_id: order.orderId,
        total_amount: totalAmount,
      },
    });

    return NextResponse.json({
      ok: true,
      paypalOrderId: order.orderId,
      approvalUrl: order.approvalUrl,
      message: "PayPal-Zahlung wurde gestartet.",
    });
  } catch (error) {
    console.error("PayPal create order error:", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "PayPal-Zahlung konnte nicht gestartet werden.",
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    {
      ok: false,
      message: "Diese Route kann nur per POST genutzt werden.",
    },
    { status: 405 }
  );
}