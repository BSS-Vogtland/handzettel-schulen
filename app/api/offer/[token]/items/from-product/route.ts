import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    token: string;
  }>;
};

type BodyPayload = {
  requestItemId?: string | null;
  productId?: string | null;
};

type ProductRow = {
  id: string;
  name?: string | null;
  product_name?: string | null;
  title?: string | null;
  sku?: string | null;
  product_sku?: string | null;
  price?: number | string | null;
  product_price?: number | string | null;
  sale_price?: number | string | null;
  sale_price_gross?: number | string | null;
};

function jsonResponse(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

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

function getProductName(product: ProductRow) {
  return (
    product.name ||
    product.product_name ||
    product.title ||
    "Unbenanntes Produkt"
  );
}

function getProductSku(product: ProductRow) {
  return product.sku || product.product_sku || null;
}

function getProductPrice(product: ProductRow) {
  return toNumber(
    product.price ??
      product.product_price ??
      product.sale_price_gross ??
      product.sale_price,
    0
  );
}

async function createRequestEvent(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  requestId: string,
  eventType: string,
  message: string,
  metadata?: Record<string, unknown>
) {
  const payloads = [
    {
      request_id: requestId,
      event_type: eventType,
      message,
      metadata: metadata ?? {},
    },
    {
      request_id: requestId,
      type: eventType,
      message,
      metadata: metadata ?? {},
    },
  ];

  for (const payload of payloads) {
    const { error } = await supabase
      .from("school_request_events")
      .insert(payload);

    if (!error) return;
  }
}

export async function POST(request: NextRequest, context: Params) {
  try {
    const { token } = await context.params;
    const supabase = getSupabaseAdmin();

    if (!token) {
      return jsonResponse(
        {
          ok: false,
          message: "Kein Angebotstoken übergeben.",
        },
        400
      );
    }

    let body: BodyPayload = {};

    try {
      body = (await request.json()) as BodyPayload;
    } catch {
      return jsonResponse(
        {
          ok: false,
          message: "Die Anfrage konnte nicht gelesen werden.",
        },
        400
      );
    }

    const requestItemId = String(body.requestItemId || "").trim();
    const productId = String(body.productId || "").trim();

    if (!requestItemId || !productId) {
      return jsonResponse(
        {
          ok: false,
          message: "Listenposition oder Produkt fehlt.",
        },
        400
      );
    }

    const { data: schoolRequest, error: requestError } = await supabase
      .from("school_requests")
      .select("*")
      .eq("offer_token", token)
      .maybeSingle();

    if (requestError) {
      return jsonResponse(
        {
          ok: false,
          message: `Anfrage konnte nicht geladen werden: ${requestError.message}`,
        },
        500
      );
    }

    if (!schoolRequest) {
      return jsonResponse(
        {
          ok: false,
          message: "Anfrage wurde nicht gefunden.",
        },
        404
      );
    }

    if (
      schoolRequest.status === "confirmed" ||
      schoolRequest.offer_status === "confirmed"
    ) {
      return jsonResponse(
        {
          ok: false,
          message:
            "Der Paketwunsch wurde bereits abgesendet. Die Auswahl kann nicht mehr geändert werden.",
        },
        409
      );
    }

    const requestId = schoolRequest.id as string;

    const { data: requestItem, error: requestItemError } = await supabase
      .from("school_request_items")
      .select("*")
      .eq("id", requestItemId)
      .maybeSingle();

    if (requestItemError) {
      return jsonResponse(
        {
          ok: false,
          message: `Listenposition konnte nicht geladen werden: ${requestItemError.message}`,
        },
        500
      );
    }

    if (!requestItem || requestItem.request_id !== requestId) {
      return jsonResponse(
        {
          ok: false,
          message: "Diese Listenposition gehört nicht zu dieser Anfrage.",
        },
        403
      );
    }

    const { data: product, error: productError } = await supabase
      .from("school_products")
      .select("*")
      .eq("id", productId)
      .maybeSingle();

    if (productError) {
      return jsonResponse(
        {
          ok: false,
          message: `Produkt konnte nicht geladen werden: ${productError.message}`,
        },
        500
      );
    }

    if (!product) {
      return jsonResponse(
        {
          ok: false,
          message: "Produkt wurde nicht gefunden.",
        },
        404
      );
    }

    const existingCheck = await supabase
      .from("school_offer_items")
      .select("*")
      .eq("request_id", requestId)
      .eq("request_item_id", requestItemId)
      .eq("product_id", productId)
      .maybeSingle();

    if (existingCheck.error) {
      return jsonResponse(
        {
          ok: false,
          message: `Bestehende Auswahl konnte nicht geprüft werden: ${existingCheck.error.message}`,
        },
        500
      );
    }

    if (existingCheck.data) {
      return jsonResponse({
        ok: true,
        alreadySelected: true,
        item: existingCheck.data,
        message: "Dieses Produkt ist bereits in Deinem Paketwunsch.",
      });
    }

    const quantity = toNumber(requestItem.quantity, 1) || 1;
    const productName = getProductName(product as ProductRow);
    const productSku = getProductSku(product as ProductRow);
    const productPrice = getProductPrice(product as ProductRow);

    const { data: insertedItem, error: insertError } = await supabase
      .from("school_offer_items")
      .insert({
        request_id: requestId,
        request_item_id: requestItemId,
        match_id: null,
        product_id: productId,
        product_name: productName,
        product_sku: productSku,
        product_price: productPrice,
        quantity,
        unit: null,
        source: "customer_search",
        status: "draft",
        notes: "Vom Kunden über Produktsuche ausgewählt",
      })
      .select("*")
      .single();

    if (insertError) {
      return jsonResponse(
        {
          ok: false,
          message: `Produkt konnte nicht in den Paketwunsch übernommen werden: ${insertError.message}`,
        },
        500
      );
    }

    await supabase
      .from("school_requests")
      .update({
        offer_status: "customer_selection",
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestId);

    await createRequestEvent(
      supabase,
      requestId,
      "customer_product_search_selected",
      "Kunde hat ein Produkt über die Produktsuche ausgewählt.",
      {
        requestItemId,
        productId,
        productName,
        productSku,
        productPrice,
        quantity,
      }
    );

    return jsonResponse({
      ok: true,
      item: insertedItem,
      message: "Produkt wurde in Deinen Paketwunsch übernommen.",
    });
  } catch (error) {
    console.error("Customer product select error:", error);

    return jsonResponse(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Produkt konnte nicht übernommen werden.",
      },
      500
    );
  }
}
