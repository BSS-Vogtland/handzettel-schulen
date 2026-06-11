import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    token: string;
    recommendationId: string;
  }>;
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

function cleanText(value: unknown) {
  const text = String(value || "").trim();
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

function getProductName(product: ProductRow) {
  return (
    cleanText(product.name) ||
    cleanText(product.product_name) ||
    cleanText(product.title) ||
    "Unbenanntes Produkt"
  );
}

function getProductSku(product: ProductRow) {
  return cleanText(product.sku) || cleanText(product.product_sku);
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

async function createRequestEvent(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  requestId: string;
  productName: string;
}) {
  const { supabase, requestId, productName } = params;

  const payloads = [
    {
      request_id: requestId,
      event_type: "customer_recommendation_added",
      title: "Empfehlung übernommen",
      description: `Kunde hat die Empfehlung „${productName}“ in den Paketwunsch übernommen.`,
      created_at: new Date().toISOString(),
    },
    {
      request_id: requestId,
      type: "customer_recommendation_added",
      message: `Kunde hat die Empfehlung „${productName}“ in den Paketwunsch übernommen.`,
      created_at: new Date().toISOString(),
    },
  ];

  for (const payload of payloads) {
    const { error } = await supabase
      .from("school_request_events")
      .insert(payload);

    if (!error) return;
  }
}

export async function POST(_request: Request, context: Params) {
  try {
    const { token, recommendationId } = await context.params;
    const cleanToken = String(token || "").trim();
    const cleanRecommendationId = String(recommendationId || "").trim();

    if (!cleanToken || !cleanRecommendationId) {
      return jsonResponse(
        {
          ok: false,
          message: "Angebot oder Empfehlung fehlt.",
        },
        400
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: schoolRequest, error: requestError } = await supabase
      .from("school_requests")
      .select("id, status, offer_status")
      .eq("offer_token", cleanToken)
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
            "Der Paketwunsch wurde bereits abgesendet. Empfehlungen können nicht mehr hinzugefügt werden.",
        },
        409
      );
    }

    const requestId = String(schoolRequest.id);

    const { data: recommendation, error: recommendationError } = await supabase
      .from("school_offer_recommendations")
      .select("*")
      .eq("id", cleanRecommendationId)
      .eq("request_id", requestId)
      .maybeSingle();

    if (recommendationError) {
      return jsonResponse(
        {
          ok: false,
          message: `Empfehlung konnte nicht geladen werden: ${recommendationError.message}`,
        },
        500
      );
    }

    if (!recommendation) {
      return jsonResponse(
        {
          ok: false,
          message: "Empfehlung wurde nicht gefunden.",
        },
        404
      );
    }

    if (recommendation.is_visible === false) {
      return jsonResponse(
        {
          ok: false,
          message: "Diese Empfehlung ist nicht mehr verfügbar.",
        },
        409
      );
    }

    if (recommendation.added_to_offer_item_id) {
      return jsonResponse({
        ok: true,
        alreadyAdded: true,
        message: "Diese Empfehlung wurde bereits übernommen.",
      });
    }

    const productId = String(recommendation.product_id || "").trim();

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

    const productRow = product as ProductRow;
    const productName = getProductName(productRow);
    const productSku = getProductSku(productRow);
    const productPrice = getProductPrice(productRow);

    const existingCheck = await supabase
      .from("school_offer_items")
      .select("*")
      .eq("request_id", requestId)
      .eq("product_id", productId)
      .maybeSingle();

    if (existingCheck.error) {
      return jsonResponse(
        {
          ok: false,
          message: `Paketposition konnte nicht geprüft werden: ${existingCheck.error.message}`,
        },
        500
      );
    }

    if (existingCheck.data) {
      await supabase
        .from("school_offer_recommendations")
        .update({
          added_to_offer_item_id: existingCheck.data.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", cleanRecommendationId);

      return jsonResponse({
        ok: true,
        alreadyAdded: true,
        message: "Dieser Artikel liegt bereits in Deinem Paket.",
      });
    }

    const now = new Date().toISOString();

    const { data: insertedItem, error: insertError } = await supabase
      .from("school_offer_items")
      .insert({
        request_id: requestId,
        request_item_id: recommendation.request_item_id || null,
        match_id: null,
        product_id: productId,
        product_name: productName,
        product_sku: productSku,
        product_price: productPrice,
        quantity: 1,
        unit: "Stk.",
        source: "customer_recommendation",
        status: "draft",
        notes: recommendation.reason || "Vom Kunden aus Empfehlung übernommen",
        created_at: now,
        updated_at: now,
      })
      .select("*")
      .single();

    if (insertError) {
      return jsonResponse(
        {
          ok: false,
          message: `Empfehlung konnte nicht in den Paketwunsch übernommen werden: ${insertError.message}`,
        },
        500
      );
    }

    await supabase
      .from("school_offer_recommendations")
      .update({
        added_to_offer_item_id: insertedItem.id,
        updated_at: now,
      })
      .eq("id", cleanRecommendationId);

    await supabase
      .from("school_requests")
      .update({
        offer_status: "customer_selection",
        updated_at: now,
      })
      .eq("id", requestId);

    await createRequestEvent({
      supabase,
      requestId,
      productName,
    });

    return jsonResponse({
      ok: true,
      item: insertedItem,
      message: `„${productName}“ wurde Deinem Paket hinzugefügt.`,
    });
  } catch (error) {
    console.error("Customer add recommendation error:", error);

    return jsonResponse(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Empfehlung konnte nicht übernommen werden.",
      },
      500
    );
  }
}