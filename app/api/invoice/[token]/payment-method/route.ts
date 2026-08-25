import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  isPayPalPaymentsEnabled,
  PAYPAL_DISABLED_CODE,
  PAYPAL_DISABLED_MESSAGE,
} from "@/app/lib/paypalPaymentsGate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    token: string;
  }>;
};

type PaymentMethod = "paypal" | "bank_transfer" | "cash_on_pickup";

type RequestBody = {
  paymentMethod?: PaymentMethod | null;
};

type InvoiceRow = {
  id: string;
  request_id: string;
  invoice_token: string;
  invoice_status: string | null;
  payment_status: string | null;
  selected_payment_method: string | null;
  fulfillment_method_snapshot: string | null;
  total_amount: number | string | null;
};

type SchoolRequestRow = {
  id: string;
  fulfillment_method: string | null;
  cash_on_pickup_allowed: boolean | null;
};

const PREPAYMENT_DUE_DAYS = 7;
const CASH_PICKUP_DUE_DAYS = 14;

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

async function readBodySafely(request: Request): Promise<RequestBody> {
  try {
    const rawText = await request.text();

    if (!rawText.trim()) {
      return {};
    }

    return JSON.parse(rawText) as RequestBody;
  } catch {
    return {};
  }
}

function isValidPaymentMethod(value: unknown): value is PaymentMethod {
  return (
    value === "paypal" ||
    value === "bank_transfer" ||
    value === "cash_on_pickup"
  );
}

function addDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function getPaymentStatus(paymentMethod: PaymentMethod) {
  if (paymentMethod === "cash_on_pickup") return "cash_on_pickup";
  return "waiting_for_payment";
}

function getPaymentProvider(paymentMethod: PaymentMethod) {
  if (paymentMethod === "paypal") return "paypal";
  if (paymentMethod === "bank_transfer") return "bank_transfer";
  return "cash";
}

function getPaymentMessage(paymentMethod: PaymentMethod) {
  if (paymentMethod === "paypal") {
    return "PayPal wurde ausgewählt. Du wirst zur PayPal-Zahlung mit dem Gesamtbetrag weitergeleitet.";
  }

  if (paymentMethod === "bank_transfer") {
    return "Überweisung wurde ausgewählt. Bitte überweise den Rechnungsbetrag vorab. Die Bearbeitung startet nach Zahlungseingang.";
  }

  return "Barzahlung bei Abholung wurde ausgewählt. Dein Paket wird für 14 Tage zur Abholung reserviert.";
}

function getPaymentEventTitle(paymentMethod: PaymentMethod) {
  if (paymentMethod === "paypal") return "PayPal ausgewählt";
  if (paymentMethod === "bank_transfer") return "Überweisung ausgewählt";
  return "Barzahlung bei Abholung ausgewählt";
}

function isInvoicePaid(status: string | null) {
  return status === "payment_received" || status === "cash_paid";
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
  paymentMethod: PaymentMethod;
  message: string;
}) {
  const { supabase, invoice, paymentMethod, message } = params;

  await supabase.from("school_request_payment_events").insert({
    invoice_id: invoice.id,
    request_id: invoice.request_id,
    event_type: "payment_method_selected",
    payment_method: paymentMethod,
    payment_provider: getPaymentProvider(paymentMethod),
    amount: invoice.total_amount,
    currency: "EUR",
    provider_status: getPaymentStatus(paymentMethod),
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

    const body = await readBodySafely(request);
    const paymentMethod = body.paymentMethod;

    if (!isValidPaymentMethod(paymentMethod)) {
      return NextResponse.json(
        {
          ok: false,
          message: "Bitte wähle eine gültige Zahlungsart aus.",
        },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    if (
      paymentMethod === "paypal" &&
      !(await isPayPalPaymentsEnabled(supabase))
    ) {
      return NextResponse.json(
        {
          ok: false,
          code: PAYPAL_DISABLED_CODE,
          message: PAYPAL_DISABLED_MESSAGE,
        },
        { status: 503 },
      );
    }

    const { data: invoiceData, error: invoiceError } = await supabase
      .from("school_request_invoices")
      .select(
        [
          "id",
          "request_id",
          "invoice_token",
          "invoice_status",
          "payment_status",
          "selected_payment_method",
          "fulfillment_method_snapshot",
          "total_amount",
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

    if (isInvoicePaid(invoice.payment_status)) {
      return NextResponse.json(
        {
          ok: false,
          message: "Diese Rechnung ist bereits als bezahlt markiert.",
        },
        { status: 409 }
      );
    }

    const { data: requestData, error: requestError } = await supabase
      .from("school_requests")
      .select("id, fulfillment_method, cash_on_pickup_allowed")
      .eq("id", invoice.request_id)
      .maybeSingle();

    if (requestError || !requestData) {
      return NextResponse.json(
        {
          ok: false,
          message:
            requestError?.message ||
            "Die zugehörige Anfrage wurde nicht gefunden.",
        },
        { status: 404 }
      );
    }

    const schoolRequest = requestData as SchoolRequestRow;

    if (paymentMethod === "cash_on_pickup") {
      const isPickup =
        invoice.fulfillment_method_snapshot === "pickup" ||
        schoolRequest.fulfillment_method === "pickup";

      const cashAllowed = Boolean(schoolRequest.cash_on_pickup_allowed);

      if (!isPickup || !cashAllowed) {
        return NextResponse.json(
          {
            ok: false,
            message:
              "Diese Zahlungsart ist für diese Rechnung nicht verfügbar. Bitte wähle PayPal oder Überweisung.",
          },
          { status: 409 }
        );
      }
    }

    const now = new Date().toISOString();
    const paymentStatus = getPaymentStatus(paymentMethod);

    const paymentDueAt =
      paymentMethod === "paypal" || paymentMethod === "bank_transfer"
        ? addDays(PREPAYMENT_DUE_DAYS)
        : null;

    const cashPickupDueAt =
      paymentMethod === "cash_on_pickup" ? addDays(CASH_PICKUP_DUE_DAYS) : null;

    const message = getPaymentMessage(paymentMethod);

    const { error: updateInvoiceError } = await supabase
      .from("school_request_invoices")
      .update({
        selected_payment_method: paymentMethod,
        payment_status: paymentStatus,
        payment_provider: getPaymentProvider(paymentMethod),
        payment_due_at: paymentDueAt,
        cash_pickup_due_at: cashPickupDueAt,
        updated_at: now,
      })
      .eq("id", invoice.id);

    if (updateInvoiceError) {
      return NextResponse.json(
        {
          ok: false,
          message: `Zahlungsart konnte nicht gespeichert werden: ${updateInvoiceError.message}`,
        },
        { status: 500 }
      );
    }

    const { error: updateRequestError } = await supabase
      .from("school_requests")
      .update({
        selected_payment_method: paymentMethod,
        payment_status: paymentStatus,
        payment_due_at: paymentDueAt,
        cash_pickup_due_at: cashPickupDueAt,
        latest_invoice_id: invoice.id,
        updated_at: now,
      })
      .eq("id", invoice.request_id);

    if (updateRequestError) {
      return NextResponse.json(
        {
          ok: false,
          message: `Zahlungsart wurde gespeichert, aber die Anfrage konnte nicht aktualisiert werden: ${updateRequestError.message}`,
        },
        { status: 500 }
      );
    }

    await insertPaymentEvent({
      supabase,
      invoice,
      paymentMethod,
      message,
    });

    await insertRequestEvent({
      supabase,
      requestId: invoice.request_id,
      eventType: "payment_method_selected",
      title: getPaymentEventTitle(paymentMethod),
      message,
      metadata: {
        invoice_id: invoice.id,
        invoice_token: invoice.invoice_token,
        payment_method: paymentMethod,
        payment_status: paymentStatus,
        payment_provider: getPaymentProvider(paymentMethod),
        payment_due_at: paymentDueAt,
        cash_pickup_due_at: cashPickupDueAt,
        cash_on_pickup_allowed: schoolRequest.cash_on_pickup_allowed,
      },
    });

    return NextResponse.json({
      ok: true,
      selectedPaymentMethod: paymentMethod,
      paymentStatus,
      paymentDueAt,
      cashPickupDueAt,
      message,
    });
  } catch (error) {
    console.error("Payment method error:", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Die Zahlungsart konnte nicht gespeichert werden.",
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
