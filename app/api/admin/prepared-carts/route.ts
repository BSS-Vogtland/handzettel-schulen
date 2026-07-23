import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import { supabaseServer } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CreatePreparedCartBody = {
  sourceRequestId?: string | null;
  title?: string | null;

  customerName?: string | null;
  email?: string | null;
  phone?: string | null;

  billingName?: string | null;
  billingEmail?: string | null;
  billingPhone?: string | null;
  billingStreet?: string | null;
  billingPostalCode?: string | null;
  billingCity?: string | null;

  shippingAddressDiffers?: boolean | null;
  shippingName?: string | null;
  shippingStreet?: string | null;
  shippingPostalCode?: string | null;
  shippingCity?: string | null;

  childName?: string | null;
  schoolName?: string | null;
  className?: string | null;

  fulfillmentMethod?: "pickup" | "shipping" | null;
  paymentMethod?: "paypal" | "bank_transfer" | null;

  customerMessage?: string | null;
  adminNote?: string | null;
  expiresInDays?: number | string | null;
};

type SourceRequestRow = {
  id: string;
  request_number: string | null;

  customer_name: string | null;
  email: string | null;
  phone: string | null;

  billing_name?: string | null;
  billing_email?: string | null;
  billing_phone?: string | null;
  billing_street?: string | null;
  billing_postal_code?: string | null;
  billing_city?: string | null;

  shipping_address_differs?: boolean | null;
  shipping_name?: string | null;
  shipping_street?: string | null;
  shipping_postal_code?: string | null;
  shipping_city?: string | null;

  child_name: string | null;
  school_name: string | null;
  class_name: string | null;

  fulfillment_method?: string | null;
  selected_payment_method?: string | null;

  created_at: string | null;
};

function jsonResponse(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function cleanText(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function cleanEmail(value: unknown) {
  const email = cleanText(value);
  return email ? email.toLowerCase() : null;
}

function normalizeDays(value: unknown) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return 30;
  }

  return Math.max(1, Math.min(365, Math.floor(parsed)));
}

function normalizeFulfillmentMethod(value: unknown) {
  return value === "shipping" ? "shipping" : value === "pickup" ? "pickup" : null;
}

function normalizePaymentMethod(value: unknown) {
  return value === "bank_transfer"
    ? "bank_transfer"
    : value === "paypal"
      ? "paypal"
      : null;
}

function getSiteUrl(request: NextRequest) {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    request.nextUrl.origin.replace(/\/$/, "")
  );
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;

  try {
    await supabaseServer.rpc("expire_school_prepared_carts");

    const [
      { data: cartsData, error: cartsError },
      { data: itemsData, error: itemsError },
      { data: requestsData, error: requestsError },
    ] = await Promise.all([
      supabaseServer
        .from("school_prepared_carts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200),

      supabaseServer
        .from("school_prepared_cart_items")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),

      supabaseServer
        .from("school_requests")
        .select(
          [
            "id",
            "request_number",
            "customer_name",
            "email",
            "phone",
            "billing_name",
            "billing_email",
            "billing_phone",
            "billing_street",
            "billing_postal_code",
            "billing_city",
            "shipping_address_differs",
            "shipping_name",
            "shipping_street",
            "shipping_postal_code",
            "shipping_city",
            "child_name",
            "school_name",
            "class_name",
            "fulfillment_method",
            "selected_payment_method",
            "created_at",
          ].join(",")
        )
        .not("customer_name", "is", null)
        .order("created_at", { ascending: false })
        .limit(150),
    ]);

    if (cartsError) {
      return jsonResponse(
        {
          ok: false,
          message: `Vorbereitete Warenkörbe konnten nicht geladen werden: ${cartsError.message}`,
        },
        500
      );
    }

    if (itemsError) {
      return jsonResponse(
        {
          ok: false,
          message: `Warenkorbpositionen konnten nicht geladen werden: ${itemsError.message}`,
        },
        500
      );
    }

    if (requestsError) {
      return jsonResponse(
        {
          ok: false,
          message: `Bestandskunden konnten nicht geladen werden: ${requestsError.message}`,
        },
        500
      );
    }

    const itemsByCartId = new Map<string, unknown[]>();

    for (const item of itemsData || []) {
      const cartId = String(item.cart_id || "");
      if (!cartId) continue;

      const current = itemsByCartId.get(cartId) || [];
      current.push(item);
      itemsByCartId.set(cartId, current);
    }

    const siteUrl = getSiteUrl(request);

    const carts = (cartsData || []).map((cart) => {
      const token = String(cart.token || "");

      return {
        ...cart,
        items: itemsByCartId.get(String(cart.id)) || [],
        customerUrl: token
          ? `${siteUrl}/warenkorb/${encodeURIComponent(token)}`
          : null,
      };
    });

    const seenCustomers = new Set<string>();

    const customers = ((requestsData || []) as unknown as SourceRequestRow[])
      .filter((sourceRequest) => {
        const identity = [
          cleanEmail(sourceRequest.email),
          cleanText(sourceRequest.customer_name)?.toLowerCase(),
          cleanText(sourceRequest.phone),
        ]
          .filter(Boolean)
          .join("|");

        if (!identity) return false;
        if (seenCustomers.has(identity)) return false;

        seenCustomers.add(identity);
        return true;
      })
      .slice(0, 80);

    return jsonResponse({
      ok: true,
      carts,
      customers,
    });
  } catch (error) {
    console.error("Prepared carts GET error:", error);

    return jsonResponse(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Vorbereitete Warenkörbe konnten nicht geladen werden.",
      },
      500
    );
  }
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;

  try {
    const body = (await request.json()) as CreatePreparedCartBody;

    const sourceRequestId = cleanText(body.sourceRequestId);

    let sourceRequest: SourceRequestRow | null = null;

    if (sourceRequestId) {
      const { data, error } = await supabaseServer
        .from("school_requests")
        .select(
          [
            "id",
            "request_number",
            "customer_name",
            "email",
            "phone",
            "billing_name",
            "billing_email",
            "billing_phone",
            "billing_street",
            "billing_postal_code",
            "billing_city",
            "shipping_address_differs",
            "shipping_name",
            "shipping_street",
            "shipping_postal_code",
            "shipping_city",
            "child_name",
            "school_name",
            "class_name",
            "fulfillment_method",
            "selected_payment_method",
            "created_at",
          ].join(",")
        )
        .eq("id", sourceRequestId)
        .maybeSingle();

      if (error) {
        return jsonResponse(
          {
            ok: false,
            message: `Bestandskundendaten konnten nicht geladen werden: ${error.message}`,
          },
          500
        );
      }

      sourceRequest = data as unknown as SourceRequestRow | null;
    }

    const customerName =
      cleanText(body.customerName) ||
      cleanText(sourceRequest?.customer_name);

    const email =
      cleanEmail(body.email) ||
      cleanEmail(sourceRequest?.email);

    const phone =
      cleanText(body.phone) ||
      cleanText(sourceRequest?.phone);

    if (!customerName) {
      return jsonResponse(
        {
          ok: false,
          message: "Bitte gib einen Kundennamen ein.",
        },
        400
      );
    }

    if (!email || !email.includes("@")) {
      return jsonResponse(
        {
          ok: false,
          message: "Bitte gib eine gültige E-Mail-Adresse ein.",
        },
        400
      );
    }

    const expiresInDays = normalizeDays(body.expiresInDays);
    const expiresAt = new Date(
      Date.now() + expiresInDays * 24 * 60 * 60 * 1000
    ).toISOString();

    const title =
      cleanText(body.title) ||
      `Warenkorb für ${customerName}`;

    /*
     * Bei Bestandskunden übernehmen wir ausschließlich stabile
     * Kontaktdaten aus der früheren Anfrage:
     *
     * - Kundenname
     * - E-Mail
     * - Telefon
     *
     * Frühere Adressen, Schulangaben, Übergabearten und Zahlungsarten
     * können veraltet sein und werden deshalb nicht automatisch übernommen.
     */
    const billingName =
      cleanText(body.billingName) ||
      customerName;

    const billingEmail =
      cleanEmail(body.billingEmail) ||
      email;

    const billingPhone =
      cleanText(body.billingPhone) ||
      phone;

    const shippingAddressDiffers =
      typeof body.shippingAddressDiffers === "boolean"
        ? body.shippingAddressDiffers
        : false;

    const fulfillmentMethod =
      normalizeFulfillmentMethod(body.fulfillmentMethod);

    const paymentMethod =
      normalizePaymentMethod(body.paymentMethod);

    const { data: createdCart, error: insertError } = await supabaseServer
      .from("school_prepared_carts")
      .insert({
        source_request_id: sourceRequest?.id || null,

        title,
        status: "draft",

        customer_name: customerName,
        email,
        phone,

        billing_name: billingName,
        billing_email: billingEmail,
        billing_phone: billingPhone,
        billing_street: cleanText(body.billingStreet),
        billing_postal_code: cleanText(body.billingPostalCode),
        billing_city: cleanText(body.billingCity),

        shipping_address_differs: shippingAddressDiffers,
        shipping_name: shippingAddressDiffers
          ? cleanText(body.shippingName)
          : null,
        shipping_street: shippingAddressDiffers
          ? cleanText(body.shippingStreet)
          : null,
        shipping_postal_code: shippingAddressDiffers
          ? cleanText(body.shippingPostalCode)
          : null,
        shipping_city: shippingAddressDiffers
          ? cleanText(body.shippingCity)
          : null,

        child_name: cleanText(body.childName),
        school_name: cleanText(body.schoolName),
        class_name: cleanText(body.className),

        fulfillment_method: fulfillmentMethod,
        payment_method: paymentMethod,

        customer_message: cleanText(body.customerMessage),
        admin_note: cleanText(body.adminNote),

        expires_at: expiresAt,
        created_by: "admin",
      })
      .select("*")
      .single();

    if (insertError || !createdCart) {
      return jsonResponse(
        {
          ok: false,
          message:
            insertError?.message ||
            "Der vorbereitete Warenkorb konnte nicht erstellt werden.",
        },
        500
      );
    }

    const siteUrl = getSiteUrl(request);

    return jsonResponse({
      ok: true,
      cart: {
        ...createdCart,
        items: [],
        customerUrl: `${siteUrl}/warenkorb/${encodeURIComponent(
          String(createdCart.token)
        )}`,
      },
      message: "Der vorbereitete Warenkorb wurde angelegt.",
    });
  } catch (error) {
    console.error("Prepared carts POST error:", error);

    return jsonResponse(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Der vorbereitete Warenkorb konnte nicht erstellt werden.",
      },
      500
    );
  }
}