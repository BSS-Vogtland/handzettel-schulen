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

type RequestRow = {
  id: string;
  request_number: string | null;
  status: string | null;
  offer_status: string | null;

  customer_name: string | null;
  email: string | null;
  phone: string | null;

  child_name: string | null;
  school_name: string | null;
  class_name: string | null;

  fulfillment_method: string | null;
  pickup_location_label: string | null;
  pickup_address_snapshot: string | null;
};

type OfferItemRow = {
  id: string;
  request_id: string;
  request_item_id: string | null;
  match_id: string | null;
  product_id: string | null;
  product_name: string;
  product_sku: string | null;
  product_price: number | string | null;
  quantity: number | string | null;
  unit: string | null;
  source: string | null;
  notes: string | null;
};

type InvoiceRow = {
  id: string;
  invoice_number: string | null;
  invoice_status: string | null;
  payment_status: string | null;
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

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

async function readBodySafely(request: NextRequest) {
  try {
    const text = await request.text();

    if (!text.trim()) {
      return {};
    }

    return JSON.parse(text) as {
      shippingAmount?: number | string | null;
      adminNote?: string | null;
    };
  } catch {
    return {};
  }
}

async function insertRequestEvent(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  requestId: string;
  message: string;
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  totalAmount?: number;
}) {
  const { supabase, requestId, message, invoiceId, invoiceNumber, totalAmount } =
    params;

  const now = new Date().toISOString();

  const payloads = [
    {
      request_id: requestId,
      event_type: "invoice_draft_created",
      title: "Rechnung vorbereitet",
      message,
      description: message,
      metadata: {
        invoice_id: invoiceId,
        invoice_number: invoiceNumber,
        total_amount: totalAmount,
      },
      created_at: now,
    },
    {
      request_id: requestId,
      event_type: "invoice_draft_created",
      message,
      metadata: {
        invoice_id: invoiceId,
        invoice_number: invoiceNumber,
        total_amount: totalAmount,
      },
      created_at: now,
    },
    {
      request_id: requestId,
      event_type: "invoice_draft_created",
      message,
      created_at: now,
    },
    {
      request_id: requestId,
      type: "invoice_draft_created",
      message,
      created_at: now,
    },
  ];

  for (const payload of payloads) {
    const { error } = await supabase.from("school_request_events").insert(payload);

    if (!error) return;
  }
}

async function getInvoiceNumber(
  supabase: ReturnType<typeof getSupabaseAdmin>
): Promise<string> {
  const { data, error } = await supabase.rpc("generate_school_invoice_number");

  if (!error && typeof data === "string" && data.trim().length > 0) {
    return data;
  }

  const year = new Date().getFullYear();
  const random = Math.floor(Math.random() * 99999)
    .toString()
    .padStart(5, "0");

  return `HSR-${year}-${random}`;
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
    const shippingAmount = roundMoney(toNumber(body.shippingAmount, 0));
    const adminNote = String(body.adminNote || "").trim() || null;

    if (shippingAmount < 0) {
      return NextResponse.json(
        {
          ok: false,
          message: "Versandkosten dürfen nicht negativ sein.",
        },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: requestData, error: requestError } = await supabase
      .from("school_requests")
      .select(
        [
          "id",
          "request_number",
          "status",
          "offer_status",
          "customer_name",
          "email",
          "phone",
          "child_name",
          "school_name",
          "class_name",
          "fulfillment_method",
          "pickup_location_label",
          "pickup_address_snapshot",
        ].join(", ")
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

    const requestRow = requestData as unknown as RequestRow;

    const isConfirmed =
      requestRow.status === "confirmed" ||
      requestRow.offer_status === "confirmed";

    if (!isConfirmed) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Eine Rechnung kann erst vorbereitet werden, wenn das Angebot bestätigt wurde.",
        },
        { status: 409 }
      );
    }

    const { data: offerItemsData, error: offerItemsError } = await supabase
      .from("school_offer_items")
      .select(
        [
          "id",
          "request_id",
          "request_item_id",
          "match_id",
          "product_id",
          "product_name",
          "product_sku",
          "product_price",
          "quantity",
          "unit",
          "source",
          "notes",
        ].join(", ")
      )
      .eq("request_id", requestId)
      .order("created_at", { ascending: true });

    if (offerItemsError) {
      return NextResponse.json(
        {
          ok: false,
          message: `Paketpositionen konnten nicht geladen werden: ${offerItemsError.message}`,
        },
        { status: 500 }
      );
    }

    const offerItems = (offerItemsData || []) as unknown as OfferItemRow[];

    if (offerItems.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Es gibt noch keine Paketpositionen. Eine Rechnung kann erst mit Positionen vorbereitet werden.",
        },
        { status: 409 }
      );
    }

    const subtotalAmount = roundMoney(
      offerItems.reduce((sum, item) => {
        return (
          sum +
          toNumber(item.quantity, 1) * toNumber(item.product_price, 0)
        );
      }, 0)
    );

    const totalAmount = roundMoney(subtotalAmount + shippingAmount);

    const { data: latestDraftData } = await supabase
      .from("school_request_invoices")
      .select("id, invoice_number, invoice_status, payment_status")
      .eq("request_id", requestId)
      .eq("invoice_status", "draft")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const latestDraft = latestDraftData as unknown as InvoiceRow | null;

    let invoiceId: string;
    let invoiceNumber: string | null;

    if (latestDraft?.id) {
      invoiceId = latestDraft.id;
      invoiceNumber = latestDraft.invoice_number;

      const { error: updateInvoiceError } = await supabase
        .from("school_request_invoices")
        .update({
          subtotal_amount: subtotalAmount,
          shipping_amount: shippingAmount,
          total_amount: totalAmount,
          currency: "EUR",

          selected_payment_method: "paypal",
          payment_status: "not_selected",
          payment_provider: "paypal",

          customer_name_snapshot: requestRow.customer_name,
          customer_email_snapshot: requestRow.email,
          customer_phone_snapshot: requestRow.phone,
          child_name_snapshot: requestRow.child_name,
          school_name_snapshot: requestRow.school_name,
          class_name_snapshot: requestRow.class_name,

          fulfillment_method_snapshot: requestRow.fulfillment_method,
          pickup_location_label_snapshot: requestRow.pickup_location_label,
          pickup_address_snapshot: requestRow.pickup_address_snapshot,

          admin_note: adminNote,
          updated_at: new Date().toISOString(),
        })
        .eq("id", invoiceId);

      if (updateInvoiceError) {
        return NextResponse.json(
          {
            ok: false,
            message: `Rechnung konnte nicht aktualisiert werden: ${updateInvoiceError.message}`,
          },
          { status: 500 }
        );
      }

      const { error: deleteItemsError } = await supabase
        .from("school_request_invoice_items")
        .delete()
        .eq("invoice_id", invoiceId);

      if (deleteItemsError) {
        return NextResponse.json(
          {
            ok: false,
            message: `Alte Rechnungspositionen konnten nicht ersetzt werden: ${deleteItemsError.message}`,
          },
          { status: 500 }
        );
      }
    } else {
      invoiceNumber = await getInvoiceNumber(supabase);

      const { data: invoiceData, error: invoiceError } = await supabase
        .from("school_request_invoices")
        .insert({
          request_id: requestId,
          invoice_number: invoiceNumber,

          invoice_status: "draft",
          payment_status: "not_selected",
          selected_payment_method: "paypal",

          payment_provider: "paypal",

          subtotal_amount: subtotalAmount,
          shipping_amount: shippingAmount,
          total_amount: totalAmount,
          currency: "EUR",

          customer_name_snapshot: requestRow.customer_name,
          customer_email_snapshot: requestRow.email,
          customer_phone_snapshot: requestRow.phone,
          child_name_snapshot: requestRow.child_name,
          school_name_snapshot: requestRow.school_name,
          class_name_snapshot: requestRow.class_name,

          fulfillment_method_snapshot: requestRow.fulfillment_method,
          pickup_location_label_snapshot: requestRow.pickup_location_label,
          pickup_address_snapshot: requestRow.pickup_address_snapshot,

          admin_note: adminNote,
        })
        .select("id, invoice_number, invoice_status, payment_status")
        .single();

      if (invoiceError || !invoiceData) {
        return NextResponse.json(
          {
            ok: false,
            message:
              invoiceError?.message ||
              "Die Rechnung konnte nicht vorbereitet werden.",
          },
          { status: 500 }
        );
      }

      const createdInvoice = invoiceData as unknown as InvoiceRow;
      invoiceId = createdInvoice.id;
      invoiceNumber = createdInvoice.invoice_number;
    }

    const invoiceItems = offerItems.map((item) => {
      const quantity = toNumber(item.quantity, 1);
      const unitPrice = toNumber(item.product_price, 0);
      const totalPrice = roundMoney(quantity * unitPrice);

      return {
        invoice_id: invoiceId,
        request_id: requestId,

        offer_item_id: item.id,
        product_id: item.product_id,

        product_name: item.product_name,
        product_sku: item.product_sku,

        quantity,
        unit: item.unit,

        unit_price: unitPrice,
        total_price: totalPrice,

        source: item.source,
        notes: item.notes,
      };
    });

    const { error: insertItemsError } = await supabase
      .from("school_request_invoice_items")
      .insert(invoiceItems);

    if (insertItemsError) {
      return NextResponse.json(
        {
          ok: false,
          message: `Rechnungspositionen konnten nicht gespeichert werden: ${insertItemsError.message}`,
        },
        { status: 500 }
      );
    }

    const now = new Date().toISOString();

    const { error: updateRequestError } = await supabase
      .from("school_requests")
      .update({
        invoice_status: "draft",
        payment_status: "not_selected",
        selected_payment_method: "paypal",
        latest_invoice_id: invoiceId,
        shipping_amount: shippingAmount,
        invoice_total_amount: totalAmount,
        updated_at: now,
      })
      .eq("id", requestId);

    if (updateRequestError) {
      return NextResponse.json(
        {
          ok: false,
          message: `Anfrage konnte nicht mit Rechnungsstatus aktualisiert werden: ${updateRequestError.message}`,
        },
        { status: 500 }
      );
    }

    await insertRequestEvent({
      supabase,
      requestId,
      invoiceId,
      invoiceNumber,
      totalAmount,
      message: `Rechnung ${
        invoiceNumber || ""
      } wurde vorbereitet. Gesamtbetrag: ${totalAmount.toFixed(2)} EUR.`,
    });

    return NextResponse.json({
      ok: true,
      invoiceId,
      invoiceNumber,
      invoiceStatus: "draft",
      paymentStatus: "not_selected",
      totalAmount,
      message: `Rechnung ${
        invoiceNumber || ""
      } wurde vorbereitet. Gesamtbetrag: ${totalAmount
        .toFixed(2)
        .replace(".", ",")} €.`,
    });
  } catch (error) {
    console.error("Invoice create error:", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Die Rechnung konnte nicht vorbereitet werden.",
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