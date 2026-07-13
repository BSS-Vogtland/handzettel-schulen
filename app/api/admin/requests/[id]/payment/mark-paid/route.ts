import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type PaymentAction = "mark_bank_transfer_paid" | "mark_cash_paid";

type RequestBody = {
  action?: PaymentAction;
  note?: string | null;
};

type SchoolRequestRow = {
  id: string;
  request_number: string | null;
  latest_invoice_id: string | null;
  selected_payment_method: string | null;
  payment_status: string | null;
};

type InvoiceRow = {
  id: string;
  request_id: string;
  invoice_number: string | null;
  invoice_token: string | null;
  selected_payment_method: string | null;
  payment_status: string | null;
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

function cleanString(value: unknown) {
  if (value === null || value === undefined) return null;

  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

async function readBodySafely(request: NextRequest): Promise<RequestBody> {
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

function isValidAction(value: unknown): value is PaymentAction {
  return value === "mark_bank_transfer_paid" || value === "mark_cash_paid";
}

function getEventTitle(action: PaymentAction) {
  if (action === "mark_bank_transfer_paid") {
    return "Überweisung als bezahlt markiert";
  }

  return "Barzahlung als erhalten markiert";
}

function getEventMessage(action: PaymentAction) {
  if (action === "mark_bank_transfer_paid") {
    return "Admin hat den Zahlungseingang per Überweisung manuell bestätigt.";
  }

  return "Admin hat die Barzahlung bei Abholung manuell als erhalten bestätigt.";
}

function getNextPaymentStatus(action: PaymentAction) {
  if (action === "mark_cash_paid") return "cash_paid";
  return "payment_received";
}

function getPaymentProviderStatus(action: PaymentAction) {
  if (action === "mark_cash_paid") return "manual_cash_paid";
  return "manual_bank_transfer_paid";
}

function getPaymentProvider(action: PaymentAction) {
  if (action === "mark_cash_paid") return "cash";
  return "bank_transfer";
}

async function findLatestInvoice(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  requestId: string;
  latestInvoiceId?: string | null;
}) {
  const { supabase, requestId, latestInvoiceId } = params;

  if (latestInvoiceId) {
    const { data, error } = await supabase
      .from("school_request_invoices")
      .select("*")
      .eq("id", latestInvoiceId)
      .maybeSingle();

    if (error) {
      throw new Error(`Rechnung konnte nicht geladen werden: ${error.message}`);
    }

    if (data) {
      return data as InvoiceRow;
    }
  }

  const { data, error } = await supabase
    .from("school_request_invoices")
    .select("*")
    .eq("request_id", requestId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Aktuelle Rechnung konnte nicht geladen werden: ${error.message}`);
  }

  return (data || null) as InvoiceRow | null;
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

  const payloads: Array<Record<string, unknown>> = [
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
  action: PaymentAction;
  message: string;
}) {
  const { supabase, invoice, action, message } = params;

  await supabase.from("school_request_payment_events").insert({
    invoice_id: invoice.id,
    request_id: invoice.request_id,
    event_type:
      action === "mark_cash_paid"
        ? "cash_payment_marked_paid"
        : "bank_transfer_marked_paid",
    payment_method:
      action === "mark_cash_paid" ? "cash_on_pickup" : "bank_transfer",
    payment_provider: getPaymentProvider(action),
    amount: invoice.total_amount,
    currency: invoice.currency || "EUR",
    provider_status: getPaymentProviderStatus(action),
    message,
    created_at: new Date().toISOString(),
  });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;

  try {
    const { id } = await context.params;
    const requestId = String(id || "").trim();

    if (!requestId) {
      return NextResponse.json(
        {
          ok: false,
          message: "Ungültige Anfrage-ID.",
        },
        { status: 400 }
      );
    }

    const body = await readBodySafely(request);
    const action = body.action;
    const note = cleanString(body.note);

    if (!isValidAction(action)) {
      return NextResponse.json(
        {
          ok: false,
          message: "Ungültige Zahlungsaktion.",
        },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: requestData, error: requestError } = await supabase
      .from("school_requests")
      .select(
        "id, request_number, latest_invoice_id, selected_payment_method, payment_status"
      )
      .eq("id", requestId)
      .maybeSingle();

    if (requestError || !requestData) {
      return NextResponse.json(
        {
          ok: false,
          message: requestError?.message || "Die Anfrage wurde nicht gefunden.",
        },
        { status: 404 }
      );
    }

    const requestRow = requestData as SchoolRequestRow;

    const invoice = await findLatestInvoice({
      supabase,
      requestId,
      latestInvoiceId: requestRow.latest_invoice_id,
    });

    if (!invoice) {
      return NextResponse.json(
        {
          ok: false,
          message: "Zu dieser Anfrage wurde keine Rechnung gefunden.",
        },
        { status: 404 }
      );
    }

    const currentPaymentStatus =
      invoice.payment_status || requestRow.payment_status || null;

    if (
      currentPaymentStatus === "payment_received" ||
      currentPaymentStatus === "cash_paid"
    ) {
      return NextResponse.json(
        {
          ok: false,
          message: "Diese Rechnung ist bereits als bezahlt markiert.",
        },
        { status: 409 }
      );
    }

    const selectedPaymentMethod =
      invoice.selected_payment_method || requestRow.selected_payment_method;

    if (action === "mark_bank_transfer_paid") {
      if (selectedPaymentMethod !== "bank_transfer") {
        return NextResponse.json(
          {
            ok: false,
            message:
              "Überweisung kann nur als bezahlt markiert werden, wenn der Kunde Überweisung gewählt hat.",
          },
          { status: 409 }
        );
      }
    }

    if (action === "mark_cash_paid") {
      if (selectedPaymentMethod !== "cash_on_pickup") {
        return NextResponse.json(
          {
            ok: false,
            message:
              "Barzahlung kann nur als bezahlt markiert werden, wenn Barzahlung bei Abholung gewählt wurde.",
          },
          { status: 409 }
        );
      }
    }

    const now = new Date().toISOString();
    const nextPaymentStatus = getNextPaymentStatus(action);
    const eventTitle = getEventTitle(action);
    const eventMessage = getEventMessage(action);

    const { error: invoiceUpdateError } = await supabase
      .from("school_request_invoices")
      .update({
        payment_status: nextPaymentStatus,
        payment_provider: getPaymentProvider(action),
        payment_provider_status: getPaymentProviderStatus(action),
        paid_at: now,
        updated_at: now,
      })
      .eq("id", invoice.id);

    if (invoiceUpdateError) {
      return NextResponse.json(
        {
          ok: false,
          message: `Rechnung konnte nicht aktualisiert werden: ${invoiceUpdateError.message}`,
        },
        { status: 500 }
      );
    }

    const { error: requestUpdateError } = await supabase
      .from("school_requests")
      .update({
        payment_status: nextPaymentStatus,
        selected_payment_method: selectedPaymentMethod,
        payment_received_at: now,
        latest_invoice_id: invoice.id,
        updated_at: now,
      })
      .eq("id", requestId);

    if (requestUpdateError) {
      return NextResponse.json(
        {
          ok: false,
          message: `Rechnung wurde aktualisiert, aber die Anfrage konnte nicht aktualisiert werden: ${requestUpdateError.message}`,
        },
        { status: 500 }
      );
    }

    await insertPaymentEvent({
      supabase,
      invoice,
      action,
      message: note ? `${eventMessage} Notiz: ${note}` : eventMessage,
    });

    await insertRequestEvent({
      supabase,
      requestId,
      eventType:
        action === "mark_cash_paid"
          ? "cash_payment_marked_paid"
          : "bank_transfer_marked_paid",
      title: eventTitle,
      message: note ? `${eventMessage} Notiz: ${note}` : eventMessage,
      metadata: {
        request_number: requestRow.request_number,
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
        selected_payment_method: selectedPaymentMethod,
        previous_payment_status: currentPaymentStatus,
        payment_status: nextPaymentStatus,
        payment_provider: getPaymentProvider(action),
        payment_provider_status: getPaymentProviderStatus(action),
        paid_at: now,
        note,
      },
    });

    return NextResponse.json({
      ok: true,
      paymentStatus: nextPaymentStatus,
      paidAt: now,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number,
      message:
        action === "mark_cash_paid"
          ? "Barzahlung wurde als erhalten markiert."
          : "Überweisung wurde als bezahlt markiert.",
    });
  } catch (error) {
    console.error("Mark payment paid error:", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Zahlung konnte nicht als bezahlt markiert werden.",
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;

  return NextResponse.json(
    {
      ok: false,
      message: "Diese Route kann nur per POST genutzt werden.",
    },
    { status: 405 }
  );
}