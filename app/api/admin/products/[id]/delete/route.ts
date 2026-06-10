import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

type ProductRow = {
  id: string;
  name?: string | null;
  product_name?: string | null;
  title?: string | null;
  sku?: string | null;
  product_sku?: string | null;
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

async function getExactCount(
  query: PromiseLike<{
    count: number | null;
    error: { message: string } | null;
  }>
) {
  const result = await query;

  if (result.error) {
    throw new Error(result.error.message);
  }

  return result.count || 0;
}

export async function DELETE(_request: Request, context: Params) {
  try {
    const { id } = await context.params;
    const productId = String(id || "").trim();

    if (!productId) {
      return jsonResponse(
        {
          ok: false,
          message: "Keine Produkt-ID übergeben.",
        },
        400
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: productData, error: productError } = await supabase
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

    if (!productData) {
      return jsonResponse(
        {
          ok: false,
          message: "Produkt wurde nicht gefunden.",
        },
        404
      );
    }

    const product = productData as ProductRow;
    const productName = getProductName(product);
    const productSku = getProductSku(product);

    const offerItemCount = await getExactCount(
      supabase
        .from("school_offer_items")
        .select("id", { count: "exact", head: true })
        .eq("product_id", productId)
    );

    const matchCount = await getExactCount(
      supabase
        .from("school_request_matches")
        .select("id", { count: "exact", head: true })
        .eq("product_id", productId)
    );

    if (offerItemCount > 0 || matchCount > 0) {
      return jsonResponse(
        {
          ok: false,
          message:
            `Dieses Produkt kann nicht gelöscht werden, weil es bereits verwendet wurde. ` +
            `Paketpositionen: ${offerItemCount}, Produktvorschläge/Matches: ${matchCount}. ` +
            `Setze es stattdessen in der Produktbearbeitung auf inaktiv.`,
        },
        409
      );
    }

    const { error: aliasDeleteError } = await supabase
      .from("school_product_aliases")
      .delete()
      .eq("product_id", productId);

    if (aliasDeleteError) {
      return jsonResponse(
        {
          ok: false,
          message: `Produkt-Aliase konnten nicht gelöscht werden: ${aliasDeleteError.message}`,
        },
        500
      );
    }

    const { error: productDeleteError } = await supabase
      .from("school_products")
      .delete()
      .eq("id", productId);

    if (productDeleteError) {
      return jsonResponse(
        {
          ok: false,
          message: `Produkt konnte nicht gelöscht werden: ${productDeleteError.message}`,
        },
        500
      );
    }

    return jsonResponse({
      ok: true,
      productName,
      productSku,
      message: productSku
        ? `Produkt „${productName}“ (${productSku}) wurde gelöscht.`
        : `Produkt „${productName}“ wurde gelöscht.`,
    });
  } catch (error) {
    console.error("Admin product delete error:", error);

    return jsonResponse(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Produkt konnte nicht gelöscht werden.",
      },
      500
    );
  }
}