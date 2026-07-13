import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  buildProductKeywordData,
  cleanKeywordText,
  toOptionalKeywordInteger,
} from "../../../../../lib/productKeywords";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

type ProductRow = Record<string, unknown>;

type AliasRow = {
  alias?: string | null;
  alias_text?: string | null;
  alias_name?: string | null;
  name?: string | null;
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

function hasColumn(product: ProductRow, columnName: string) {
  return Object.prototype.hasOwnProperty.call(product, columnName);
}

function getProductName(product: ProductRow) {
  return (
    cleanKeywordText(product.name) ||
    cleanKeywordText(product.product_name) ||
    cleanKeywordText(product.title) ||
    "Unbenanntes Produkt"
  );
}

function getProductSku(product: ProductRow) {
  return cleanKeywordText(product.sku) || cleanKeywordText(product.product_sku);
}

function getAliasText(alias: AliasRow) {
  return (
    cleanKeywordText(alias.alias) ||
    cleanKeywordText(alias.alias_text) ||
    cleanKeywordText(alias.alias_name) ||
    cleanKeywordText(alias.name) ||
    ""
  );
}

async function replaceProductAliases(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  productId: string;
  aliases: string[];
}) {
  const { supabase, productId, aliases } = params;

  const { error: deleteError } = await supabase
    .from("school_product_aliases")
    .delete()
    .eq("product_id", productId);

  if (deleteError) {
    throw new Error(
      `Alte Suchbegriffe konnten nicht gelöscht werden: ${deleteError.message}`
    );
  }

  if (aliases.length === 0) return;

  const aliasTextRows = aliases.map((aliasText) => ({
    product_id: productId,
    alias_text: aliasText,
  }));

  const { error: aliasTextInsertError } = await supabase
    .from("school_product_aliases")
    .insert(aliasTextRows);

  if (!aliasTextInsertError) return;

  const aliasRows = aliases.map((alias) => ({
    product_id: productId,
    alias,
  }));

  const { error: aliasInsertError } = await supabase
    .from("school_product_aliases")
    .insert(aliasRows);

  if (!aliasInsertError) return;

  const nameRows = aliases.map((name) => ({
    product_id: productId,
    name,
  }));

  const { error: nameInsertError } = await supabase
    .from("school_product_aliases")
    .insert(nameRows);

  if (nameInsertError) {
    throw new Error(
      `Suchbegriffe konnten nicht gespeichert werden: ${nameInsertError.message}`
    );
  }
}

export async function POST(_request: Request, context: Params) {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;

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

    const { data: aliasesData, error: aliasesError } = await supabase
      .from("school_product_aliases")
      .select("*")
      .eq("product_id", productId)
      .limit(5000);

    if (aliasesError) {
      return jsonResponse(
        {
          ok: false,
          message: `Bestehende Suchbegriffe konnten nicht geladen werden: ${aliasesError.message}`,
        },
        500
      );
    }

    const existingAliases = ((aliasesData || []) as AliasRow[])
      .map((alias) => getAliasText(alias))
      .filter(Boolean);

    const productName = getProductName(product);
    const productSku = getProductSku(product);
    const category = cleanKeywordText(product.category);
    const productType = cleanKeywordText(product.product_type);
    const format = cleanKeywordText(product.format);
    const color = cleanKeywordText(product.color);
    const lineature = cleanKeywordText(product.lineature);
    const bookWidthMm = toOptionalKeywordInteger(product.book_width_mm);
    const bookHeightMm = toOptionalKeywordInteger(product.book_height_mm);
    const bookSizeNote = cleanKeywordText(product.book_size_note);

    const keywordData = buildProductKeywordData({
      productName,
      productSku,
      category,
      productType,
      format,
      color,
      lineature,
      aliases: existingAliases,
      bookWidthMm,
      bookHeightMm,
      bookSizeNote,
    });

    await replaceProductAliases({
      supabase,
      productId,
      aliases: keywordData.aliases,
    });

    const updatePayload: Record<string, unknown> = {};

    if (hasColumn(product, "match_keywords")) {
      updatePayload.match_keywords = keywordData.matchKeywords;
    }

    if (hasColumn(product, "updated_at")) {
      updatePayload.updated_at = new Date().toISOString();
    }

    if (Object.keys(updatePayload).length > 0) {
      const { error: updateError } = await supabase
        .from("school_products")
        .update(updatePayload)
        .eq("id", productId);

      if (updateError) {
        return jsonResponse(
          {
            ok: false,
            message: `Match-Keywords konnten nicht aktualisiert werden: ${updateError.message}`,
          },
          500
        );
      }
    }

    return jsonResponse({
      ok: true,
      productId,
      productName,
      productSku,
      aliases: keywordData.aliases,
      matchKeywords: keywordData.matchKeywords,
      aliasCount: keywordData.aliases.length,
      matchKeywordCount: keywordData.matchKeywords.length,
      message: `Keywords wurden erzeugt. ${keywordData.aliases.length} Suchbegriffe und ${keywordData.matchKeywords.length} Match-Keywords wurden aktualisiert.`,
    });
  } catch (error) {
    console.error("Admin regenerate product keywords error:", error);

    return jsonResponse(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Keywords konnten nicht erzeugt werden.",
      },
      500
    );
  }
}