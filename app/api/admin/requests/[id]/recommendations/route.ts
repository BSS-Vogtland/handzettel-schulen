import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { rebuildOfferRecommendations } from "@/app/lib/offerRecommendations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

type BodyPayload = {
  productId?: string | null;
  title?: string | null;
  reason?: string | null;
  requestItemId?: string | null;
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
  image_url?: string | null;
  image_original_url?: string | null;
  image_styled_url?: string | null;
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

function getPreferredImageUrl(product: ProductRow) {
  return (
    cleanText(product.image_styled_url) ||
    cleanText(product.image_url) ||
    cleanText(product.image_original_url)
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
      event_type: "admin_offer_recommendation_added",
      title: "Empfehlung ergänzt",
      description: `Admin hat „${productName}“ als passende Ergänzung empfohlen.`,
      created_at: new Date().toISOString(),
    },
    {
      request_id: requestId,
      type: "admin_offer_recommendation_added",
      message: `Admin hat „${productName}“ als passende Ergänzung empfohlen.`,
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

export async function GET(_request: Request, context: Params) {
  try {
    const { id } = await context.params;
    const requestId = String(id || "").trim();

    if (!requestId) {
      return jsonResponse(
        {
          ok: false,
          message: "Keine Anfrage-ID übergeben.",
        },
        400
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: schoolRequest, error: requestError } = await supabase
      .from("school_requests")
      .select("id")
      .eq("id", requestId)
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

    await rebuildOfferRecommendations(requestId);

    const { data: recommendationsData, error: recommendationsError } =
      await supabase
        .from("school_offer_recommendations")
        .select("*")
        .eq("request_id", requestId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });

    if (recommendationsError) {
      return jsonResponse(
        {
          ok: false,
          message: `Empfehlungen konnten nicht geladen werden: ${recommendationsError.message}`,
        },
        500
      );
    }

    const recommendations = recommendationsData || [];
    const productIds = Array.from(
      new Set(
        recommendations
          .map((recommendation) =>
            String(recommendation.product_id || "").trim()
          )
          .filter(Boolean)
      )
    );

    const productById = new Map<string, ProductRow>();

    if (productIds.length > 0) {
      const { data: productsData, error: productsError } = await supabase
        .from("school_products").select("*").in("id", productIds);

      if (productsError) {
        return jsonResponse(
          {
            ok: false,
            message: `Produkte konnten nicht geladen werden: ${productsError.message}`,
          },
          500
        );
      }

      for (const product of (productsData || []) as ProductRow[]) {
        productById.set(product.id, product);
      }
    }

    const result = recommendations.map((recommendation) => {
      const product = productById.get(String(recommendation.product_id));

      return {
        id: recommendation.id,
        requestId: recommendation.request_id,
        requestItemId: recommendation.request_item_id,
        productId: recommendation.product_id,
        productName: product ? getProductName(product) : "Produkt nicht gefunden",
        productSku: product ? getProductSku(product) : null,
        productPrice: product ? getProductPrice(product) : 0,
        imageUrl: product ? getPreferredImageUrl(product) : null,
        title: recommendation.title || null,
        reason: recommendation.reason || null,
        source: recommendation.source || "system",
        sortOrder: recommendation.sort_order || 100,
        isVisible: recommendation.is_visible !== false,
        addedToOfferItemId: recommendation.added_to_offer_item_id || null,
      };
    });

    return jsonResponse({
      ok: true,
      recommendations: result,
    });
  } catch (error) {
    console.error("Admin recommendations GET error:", error);

    return jsonResponse(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Empfehlungen konnten nicht geladen werden.",
      },
      500
    );
  }
}

export async function POST(request: NextRequest, context: Params) {
  try {
    const { id } = await context.params;
    const requestId = String(id || "").trim();

    if (!requestId) {
      return jsonResponse(
        {
          ok: false,
          message: "Keine Anfrage-ID übergeben.",
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
          message: "Die Empfehlung konnte nicht gelesen werden.",
        },
        400
      );
    }

    const productId = String(body.productId || "").trim();
    const title = cleanText(body.title);
    const reason = cleanText(body.reason);
    const requestItemId = cleanText(body.requestItemId);

    if (!productId) {
      return jsonResponse(
        {
          ok: false,
          message: "Bitte wähle ein Produkt aus.",
        },
        400
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: schoolRequest, error: requestError } = await supabase
      .from("school_requests")
      .select("id")
      .eq("id", requestId)
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

    const existingOfferItem = await supabase
      .from("school_offer_items")
      .select("id")
      .eq("request_id", requestId)
      .eq("product_id", productId)
      .maybeSingle();

    if (existingOfferItem.error) {
      return jsonResponse(
        {
          ok: false,
          message: `Paketposition konnte nicht geprüft werden: ${existingOfferItem.error.message}`,
        },
        500
      );
    }

    if (existingOfferItem.data) {
      return jsonResponse(
        {
          ok: false,
          message:
            "Dieses Produkt liegt bereits im Paketwunsch und sollte nicht zusätzlich empfohlen werden.",
        },
        409
      );
    }

    const existingRecommendation = await supabase
      .from("school_offer_recommendations")
      .select("*")
      .eq("request_id", requestId)
      .eq("product_id", productId)
      .is("added_to_offer_item_id", null)
      .maybeSingle();

    if (existingRecommendation.error) {
      return jsonResponse(
        {
          ok: false,
          message: `Bestehende Empfehlung konnte nicht geprüft werden: ${existingRecommendation.error.message}`,
        },
        500
      );
    }

    if (existingRecommendation.data) {
      return jsonResponse(
        {
          ok: false,
          message: "Dieses Produkt ist bereits als Empfehlung hinterlegt.",
        },
        409
      );
    }

    const { data: insertedRecommendation, error: insertError } = await supabase
      .from("school_offer_recommendations")
      .insert({
        request_id: requestId,
        request_item_id: requestItemId,
        product_id: productId,
        source: "admin",
        title: title || null,
        reason:
          reason ||
          "Dieses Produkt könnte ergänzend zu Deiner Schulmaterialliste sinnvoll sein.",
        sort_order: 100,
        is_visible: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (insertError) {
      return jsonResponse(
        {
          ok: false,
          message: `Empfehlung konnte nicht gespeichert werden: ${insertError.message}`,
        },
        500
      );
    }

    await createRequestEvent({
      supabase,
      requestId,
      productName,
    });

    return jsonResponse({
      ok: true,
      recommendation: insertedRecommendation,
      message: `„${productName}“ wurde als passende Ergänzung empfohlen.`,
    });
  } catch (error) {
    console.error("Admin recommendations POST error:", error);

    return jsonResponse(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Empfehlung konnte nicht gespeichert werden.",
      },
      500
    );
  }
}