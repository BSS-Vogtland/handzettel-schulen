import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { rebuildOfferRecommendations } from "@/app/lib/offerRecommendations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    token: string;
  }>;
};

type RecommendationRow = {
  id: string;
  request_id: string;
  request_item_id: string | null;
  product_id: string;
  source: string | null;
  title: string | null;
  reason: string | null;
  sort_order: number | null;
  is_visible: boolean | null;
  added_to_offer_item_id: string | null;
};

type ProductRow = {
  id: string;
  name?: string | null;
  title?: string | null;
  sku?: string | null;
  price?: number | string | null;
  sale_price?: number | string | null;
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
  return cleanText(product.name) || cleanText(product.title) || "Unbenanntes Produkt";
}

function getProductSku(product: ProductRow) {
  return cleanText(product.sku);
}

function getProductPrice(product: ProductRow) {
  return toNumber(product.price ?? product.sale_price, 0);
}

function getPreferredImageUrl(product: ProductRow) {
  return (
    cleanText(product.image_styled_url) ||
    cleanText(product.image_url) ||
    cleanText(product.image_original_url)
  );
}

export async function GET(_request: Request, context: Params) {
  try {
    const { token } = await context.params;
    const cleanToken = String(token || "").trim();

    if (!cleanToken) {
      return jsonResponse(
        {
          ok: false,
          message: "Kein Angebotstoken übergeben.",
          debugVersion: "customer-recommendations-v3-no-product-name",
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
          debugVersion: "customer-recommendations-v3-no-product-name",
        },
        500
      );
    }

    if (!schoolRequest) {
      return jsonResponse(
        {
          ok: false,
          message: "Anfrage wurde nicht gefunden.",
          debugVersion: "customer-recommendations-v3-no-product-name",
        },
        404
      );
    }

    const requestId = String(schoolRequest.id);

    if (
      schoolRequest.status === "confirmed" ||
      schoolRequest.offer_status === "confirmed"
    ) {
      return jsonResponse({
        ok: true,
        recommendations: [],
        debugVersion: "customer-recommendations-v3-no-product-name",
      });
    }

    await rebuildOfferRecommendations(requestId);

    const { data: offerItemsData, error: offerItemsError } = await supabase
      .from("school_offer_items")
      .select("product_id")
      .eq("request_id", requestId);

    if (offerItemsError) {
      return jsonResponse(
        {
          ok: false,
          message: `Paketpositionen konnten nicht geprüft werden: ${offerItemsError.message}`,
          debugVersion: "customer-recommendations-v3-no-product-name",
        },
        500
      );
    }

    const selectedProductIds = new Set(
      (offerItemsData || [])
        .map((item) => String(item.product_id || "").trim())
        .filter(Boolean)
    );

    const { data: recommendationRows, error: recommendationsError } =
      await supabase
        .from("school_offer_recommendations")
        .select("*")
        .eq("request_id", requestId)
        .eq("is_visible", true)
        .is("added_to_offer_item_id", null)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });

    if (recommendationsError) {
      return jsonResponse(
        {
          ok: false,
          message: `Empfehlungen konnten nicht geladen werden: ${recommendationsError.message}`,
          debugVersion: "customer-recommendations-v3-no-product-name",
        },
        500
      );
    }

    const recommendationList = ((recommendationRows || []) as RecommendationRow[])
      .filter((recommendation) => recommendation.product_id)
      .filter(
        (recommendation) => !selectedProductIds.has(recommendation.product_id)
      );

    const productIds = Array.from(
      new Set(recommendationList.map((recommendation) => recommendation.product_id))
    );

    if (productIds.length === 0) {
      return jsonResponse({
        ok: true,
        recommendations: [],
        debugVersion: "customer-recommendations-v3-no-product-name",
      });
    }

    const { data: productsData, error: productsError } = await supabase
      .from("school_products")
      .select(
        "id, name, title, sku, price, sale_price, image_styled_url, image_url, image_original_url"
      )
      .in("id", productIds);

    if (productsError) {
      return jsonResponse(
        {
          ok: false,
          message: `Empfehlungsprodukte konnten nicht geladen werden [V3]: ${productsError.message}`,
          debugVersion: "customer-recommendations-v3-no-product-name",
        },
        500
      );
    }

    const productById = new Map<string, ProductRow>();

    for (const product of (productsData || []) as ProductRow[]) {
      productById.set(product.id, product);
    }

    const recommendations = recommendationList
      .map((recommendation) => {
        const product = productById.get(recommendation.product_id);

        if (!product) return null;

        return {
          id: recommendation.id,
          productId: recommendation.product_id,
          productName: getProductName(product),
          productSku: getProductSku(product),
          productPrice: getProductPrice(product),
          imageUrl: getPreferredImageUrl(product),
          title: cleanText(recommendation.title),
          reason: cleanText(recommendation.reason),
          source: recommendation.source || "system",
        };
      })
      .filter(Boolean);

    return jsonResponse({
      ok: true,
      recommendations,
      debugVersion: "customer-recommendations-v3-no-product-name",
    });
  } catch (error) {
    console.error("Customer recommendations load error:", error);

    return jsonResponse(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Empfehlungen konnten nicht geladen werden.",
        debugVersion: "customer-recommendations-v3-no-product-name",
      },
      500
    );
  }
}