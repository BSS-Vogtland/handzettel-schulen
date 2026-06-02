import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { findActiveDiscountCampaign, roundMoney } from "../../../lib/discountCampaigns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CheckoutCartItem = {
  productId: string;
  name: string;
  sku: string | null;
  price: number;
  imageUrl: string | null;
  quantity: number;
  category: string | null;
  format: string | null;
  color: string | null;
  lineature: string | null;
  sourceType?: "shop" | "reorder_from_school_list";
  sourceRequestId?: string | null;
  sourceOfferItemId?: string | null;
  sourceRequestItemId?: string | null;
};

type CheckoutBody = {
  customerName?: string | null;
  email?: string | null;
  phone?: string | null;
  childName?: string | null;
  schoolName?: string | null;
  className?: string | null;
  fulfillmentMethod?: "pickup" | "shipping" | null;
  customerMessage?: string | null;
  cartItems?: CheckoutCartItem[];
};

type CreatedRequestRow = {
  id: string;
  request_number: string | null;
};

type InvoiceRow = {
  id: string;
  invoice_number: string | null;
  invoice_token: string | null;
  invoice_status: string | null;
  payment_status: string | null;
};

type CreatedOfferItemRow = {
  id: string;
  request_id: string;
  product_id: string | null;
  product_name: string;
  product_sku: string | null;
  product_price: number | string | null;
  quantity: number | string | null;
  unit: string | null;
  source: string | null;
  notes: string | null;
};

const SHIPPING_AMOUNT = 5.95;

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

function cleanString(value: unknown, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value).trim();
  return text.length > 0 ? text : fallback;
}

function cleanNullableString(value: unknown) {
  const text = cleanString(value);
  return text.length > 0 ? text : null;
}

function toNumber(value: unknown, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeQuantity(value: unknown) {
  return Math.max(1, Math.min(99, Math.floor(toNumber(value, 1))));
}

async function readBodySafely(request: NextRequest): Promise<CheckoutBody> {
  try {
    const text = await request.text();

    if (!text.trim()) {
      return {};
    }

    return JSON.parse(text) as CheckoutBody;
  } catch {
    return {};
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

async function insertRequestEvent(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  requestId: string;
  eventType: string;
  title: string;
  description: string;
}) {
  const { supabase, requestId, eventType, title, description } = params;

  const { error } = await supabase.from("school_request_events").insert({
    request_id: requestId,
    event_type: eventType,
    title,
    description,
    created_at: new Date().toISOString(),
  });

  if (error) {
    console.error("Shop event konnte nicht gespeichert werden:", error);
  }
}

function validateCartItems(items: unknown): CheckoutCartItem[] {
  if (!Array.isArray(items)) {
    return [];
  }

  const validItems: CheckoutCartItem[] = [];

  for (const rawItem of items) {
    if (!rawItem || typeof rawItem !== "object") {
      continue;
    }

    const cartItem = rawItem as Partial<CheckoutCartItem>;

    const productId = cleanString(cartItem.productId);
    const name = cleanString(cartItem.name);
    const quantity = normalizeQuantity(cartItem.quantity);
    const price = roundMoney(Math.max(0, toNumber(cartItem.price, 0)));

    if (!productId || !name || quantity <= 0) {
      continue;
    }

    const normalizedItem: CheckoutCartItem = {
      productId,
      name,
      sku: cleanNullableString(cartItem.sku),
      price,
      imageUrl: cleanNullableString(cartItem.imageUrl),
      quantity,
      category: cleanNullableString(cartItem.category),
      format: cleanNullableString(cartItem.format),
      color: cleanNullableString(cartItem.color),
      lineature: cleanNullableString(cartItem.lineature),
      sourceType:
        cartItem.sourceType === "reorder_from_school_list"
          ? "reorder_from_school_list"
          : "shop",
      sourceRequestId: cleanNullableString(cartItem.sourceRequestId),
      sourceOfferItemId: cleanNullableString(cartItem.sourceOfferItemId),
      sourceRequestItemId: cleanNullableString(cartItem.sourceRequestItemId),
    };

    validItems.push(normalizedItem);
  }

  return validItems;
}

function formatEuroForEvent(value: number) {
  return value.toFixed(2).replace(".", ",");
}

export async function POST(request: NextRequest) {
  try {
    const body = await readBodySafely(request);

    const customerName = cleanString(body.customerName);
    const email = cleanString(body.email).toLowerCase();
    const phone = cleanNullableString(body.phone);

    const childName = cleanNullableString(body.childName);
    const schoolName = cleanNullableString(body.schoolName);
    const className = cleanNullableString(body.className);

    const fulfillmentMethod =
      body.fulfillmentMethod === "shipping" ? "shipping" : "pickup";

    const customerMessage = cleanNullableString(body.customerMessage);

    const cartItems = validateCartItems(body.cartItems);

    if (!customerName) {
      return NextResponse.json(
        {
          ok: false,
          message: "Bitte gib Deinen Namen ein.",
        },
        { status: 400 }
      );
    }

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        {
          ok: false,
          message: "Bitte gib eine gültige E-Mail-Adresse ein.",
        },
        { status: 400 }
      );
    }

    if (cartItems.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Dein Warenkorb ist leer. Bitte lege zuerst Produkte in den Warenkorb.",
        },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();

    const shippingAmount =
      fulfillmentMethod === "shipping" ? SHIPPING_AMOUNT : 0;

    const subtotalAmount = roundMoney(
      cartItems.reduce((sum, item) => {
        return sum + item.quantity * item.price;
      }, 0)
    );

    const appliedDiscount = await findActiveDiscountCampaign({
      supabase,
      appliesTo: "shop",
      subtotalAmount,
    });

    const discountAmount = roundMoney(appliedDiscount.discountAmount);
    const totalAmount = roundMoney(
      Math.max(0, subtotalAmount + shippingAmount - discountAmount)
    );

    const messageParts = [
      "Shop-Bestellung über /shop.",
      customerMessage ? `Kundenhinweis: ${customerMessage}` : null,
      appliedDiscount.discountName
        ? `Automatisch angewendete Rabattaktion: ${appliedDiscount.discountName} (-${formatEuroForEvent(
            discountAmount
          )} EUR).`
        : null,
      cartItems.some((item) => item.sourceType === "reorder_from_school_list")
        ? "Enthält Nachkauf-Artikel aus früherem Paketwunsch."
        : null,
    ].filter(Boolean);

    const { data: createdRequestData, error: requestInsertError } =
      await supabase
        .from("school_requests")
        .insert({
          status: "confirmed",
          offer_status: "confirmed",
          ai_status: "not_required",

          customer_name: customerName,
          email,
          phone,

          child_name: childName,
          school_name: schoolName,
          class_name: className,

          message: messageParts.join("\n"),
          fulfillment_method: fulfillmentMethod,

          cash_on_pickup_allowed: fulfillmentMethod === "pickup",

          discount_campaign_id: appliedDiscount.campaignId,
          discount_amount: discountAmount,

          confirmed_at: now,
          updated_at: now,
        })
        .select("id, request_number")
        .single();

    if (requestInsertError || !createdRequestData) {
      return NextResponse.json(
        {
          ok: false,
          message:
            requestInsertError?.message ||
            "Die Shop-Bestellung konnte nicht angelegt werden.",
        },
        { status: 500 }
      );
    }

    const createdRequest = createdRequestData as CreatedRequestRow;
    const requestId = createdRequest.id;

    const offerRows = cartItems.map((item) => {
      const source =
        item.sourceType === "reorder_from_school_list"
          ? "reorder_from_school_list"
          : "shop_cart";

      const notes = [
        item.category ? `Kategorie: ${item.category}` : null,
        item.format ? `Format: ${item.format}` : null,
        item.lineature ? `Lineatur: ${item.lineature}` : null,
        item.color ? `Farbe: ${item.color}` : null,
        item.sourceType === "reorder_from_school_list"
          ? "Nachkauf aus früherem Paketwunsch."
          : null,
        item.sourceRequestId
          ? `Ursprungsanfrage: ${item.sourceRequestId}`
          : null,
        item.sourceOfferItemId
          ? `Ursprungspaketposition: ${item.sourceOfferItemId}`
          : null,
      ]
        .filter(Boolean)
        .join(" | ");

      return {
        request_id: requestId,
        request_item_id: null,
        match_id: null,
        product_id: item.productId,

        product_name: item.name,
        product_sku: item.sku,
        product_price: item.price,

        quantity: item.quantity,
        unit: "Stk.",

        source,
        status: "confirmed",
        notes: notes || null,

        created_at: now,
        updated_at: now,
      };
    });

    const { data: createdOfferItemsData, error: offerInsertError } =
      await supabase
        .from("school_offer_items")
        .insert(offerRows)
        .select(
          [
            "id",
            "request_id",
            "product_id",
            "product_name",
            "product_sku",
            "product_price",
            "quantity",
            "unit",
            "source",
            "notes",
          ].join(", ")
        );

    if (offerInsertError || !createdOfferItemsData) {
      return NextResponse.json(
        {
          ok: false,
          message:
            offerInsertError?.message ||
            "Die Shop-Positionen konnten nicht gespeichert werden.",
        },
        { status: 500 }
      );
    }

    const createdOfferItems =
      createdOfferItemsData as unknown as CreatedOfferItemRow[];

    const invoiceNumber = await getInvoiceNumber(supabase);

    const { data: invoiceData, error: invoiceInsertError } = await supabase
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
        discount_campaign_id: appliedDiscount.campaignId,
        discount_name: appliedDiscount.discountName,
        discount_type: appliedDiscount.discountType,
        discount_value: appliedDiscount.discountValue,
        discount_amount: discountAmount,
        total_amount: totalAmount,
        currency: "EUR",

        customer_name_snapshot: customerName,
        customer_email_snapshot: email,
        customer_phone_snapshot: phone,

        child_name_snapshot: childName,
        school_name_snapshot: schoolName,
        class_name_snapshot: className,

        fulfillment_method_snapshot: fulfillmentMethod,
        pickup_location_label_snapshot:
          fulfillmentMethod === "pickup" ? "Abholung im Laden" : null,
        pickup_address_snapshot:
          fulfillmentMethod === "pickup"
            ? "Bürotechnik Schwalm & Staffe"
            : null,

        admin_note: appliedDiscount.discountName
          ? `Automatisch aus Shop-Warenkorb erzeugt. Rabattaktion: ${
              appliedDiscount.discountName
            }, Rabattbetrag: ${formatEuroForEvent(discountAmount)} EUR.`
          : "Automatisch aus Shop-Warenkorb erzeugt.",
      })
      .select("id, invoice_number, invoice_token, invoice_status, payment_status")
      .single();

    if (invoiceInsertError || !invoiceData) {
      return NextResponse.json(
        {
          ok: false,
          message:
            invoiceInsertError?.message ||
            "Die Rechnung zur Shop-Bestellung konnte nicht erzeugt werden.",
        },
        { status: 500 }
      );
    }

    const invoice = invoiceData as InvoiceRow;

    if (!invoice.invoice_token) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Die Rechnung wurde erzeugt, aber es wurde kein Zahlungslink-Token zurückgegeben.",
        },
        { status: 500 }
      );
    }

    const invoiceItems = createdOfferItems.map((offerItem) => {
      const quantity = normalizeQuantity(offerItem.quantity);
      const unitPrice = roundMoney(toNumber(offerItem.product_price, 0));
      const itemTotalPrice = roundMoney(quantity * unitPrice);

      return {
        invoice_id: invoice.id,
        request_id: requestId,

        offer_item_id: offerItem.id,
        product_id: offerItem.product_id,

        product_name: offerItem.product_name,
        product_sku: offerItem.product_sku,

        quantity,
        unit: offerItem.unit,

        unit_price: unitPrice,
        total_price: itemTotalPrice,

        source: offerItem.source,
        notes: offerItem.notes,
      };
    });

    const { error: invoiceItemsInsertError } = await supabase
      .from("school_request_invoice_items")
      .insert(invoiceItems);

    if (invoiceItemsInsertError) {
      return NextResponse.json(
        {
          ok: false,
          message: `Die Rechnungspositionen konnten nicht gespeichert werden: ${invoiceItemsInsertError.message}`,
        },
        { status: 500 }
      );
    }

    const { error: requestUpdateError } = await supabase
      .from("school_requests")
      .update({
        invoice_status: "draft",
        payment_status: "not_selected",
        selected_payment_method: "paypal",
        latest_invoice_id: invoice.id,
        shipping_amount: shippingAmount,
        discount_campaign_id: appliedDiscount.campaignId,
        discount_amount: discountAmount,
        invoice_total_amount: totalAmount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestId);

    if (requestUpdateError) {
      return NextResponse.json(
        {
          ok: false,
          message: `Die Shop-Bestellung wurde angelegt, aber der Rechnungsstatus konnte nicht aktualisiert werden: ${requestUpdateError.message}`,
        },
        { status: 500 }
      );
    }

    await insertRequestEvent({
      supabase,
      requestId,
      eventType: "shop_order_created",
      title: "Shop-Bestellung erstellt",
      description: appliedDiscount.discountName
        ? `Shop-Bestellung mit ${
            cartItems.length
          } Positionen wurde erstellt. Zwischensumme: ${formatEuroForEvent(
            subtotalAmount
          )} EUR, Rabatt: -${formatEuroForEvent(
            discountAmount
          )} EUR, Versand: ${formatEuroForEvent(
            shippingAmount
          )} EUR, Gesamtbetrag: ${formatEuroForEvent(totalAmount)} EUR.`
        : `Shop-Bestellung mit ${
            cartItems.length
          } Positionen wurde erstellt. Gesamtbetrag: ${formatEuroForEvent(
            totalAmount
          )} EUR.`,
    });

    await insertRequestEvent({
      supabase,
      requestId,
      eventType: "invoice_draft_created",
      title: "Rechnung vorbereitet",
      description: appliedDiscount.discountName
        ? `Rechnung ${
            invoice.invoice_number || ""
          } wurde für die Shop-Bestellung vorbereitet. Rabattaktion: ${
            appliedDiscount.discountName
          }. Gesamtbetrag: ${formatEuroForEvent(totalAmount)} EUR.`
        : `Rechnung ${
            invoice.invoice_number || ""
          } wurde für die Shop-Bestellung vorbereitet. Gesamtbetrag: ${formatEuroForEvent(
            totalAmount
          )} EUR.`,
    });

    return NextResponse.json({
      ok: true,
      requestId,
      requestNumber: createdRequest.request_number,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number,
      invoiceToken: invoice.invoice_token,
      redirectUrl: `/rechnung/${encodeURIComponent(invoice.invoice_token)}`,
      subtotalAmount,
      shippingAmount,
      discountCampaignId: appliedDiscount.campaignId,
      discountName: appliedDiscount.discountName,
      discountType: appliedDiscount.discountType,
      discountValue: appliedDiscount.discountValue,
      discountAmount,
      totalAmount,
      message: appliedDiscount.discountName
        ? `Die Shop-Bestellung wurde erstellt. Rabattaktion "${appliedDiscount.discountName}" wurde angewendet.`
        : "Die Shop-Bestellung wurde erstellt.",
    });
  } catch (error) {
    console.error("Shop checkout error:", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Die Shop-Bestellung konnte nicht abgeschlossen werden.",
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