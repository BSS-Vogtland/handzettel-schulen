import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

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

function cleanString(value: unknown) {
  const cleaned = String(value ?? "").trim();
  return cleaned.length > 0 ? cleaned : null;
}

function toOptionalInteger(value: unknown): number | null {
  const raw = String(value ?? "").trim();

  if (!raw) return null;

  const cleaned = raw.replace(/[^\d]/g, "");

  if (!cleaned) return null;

  const parsed = Number(cleaned);

  if (!Number.isFinite(parsed)) return null;

  return Math.max(0, Math.floor(parsed));
}

function normalizeText(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .trim()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/grün/g, "gruen")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanAliasValue(value: unknown) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function splitKeywords(value: unknown) {
  return normalizeText(value)
    .split(" ")
    .filter((word) => word.length >= 2)
    .slice(0, 20);
}

function hasColumn(product: ProductRow, columnName: string) {
  return Object.prototype.hasOwnProperty.call(product, columnName);
}

function getProductName(product: ProductRow) {
  return (
    cleanString(product.name) ||
    cleanString(product.product_name) ||
    cleanString(product.title) ||
    "Unbenanntes Produkt"
  );
}

function getProductSku(product: ProductRow) {
  return cleanString(product.sku) || cleanString(product.product_sku);
}

function getAliasText(alias: AliasRow) {
  return (
    cleanString(alias.alias) ||
    cleanString(alias.alias_text) ||
    cleanString(alias.alias_name) ||
    cleanString(alias.name) ||
    ""
  );
}

function getBookSizeAliases(input: {
  productName: string;
  bookWidthMm: number | null;
  bookHeightMm: number | null;
  bookSizeNote: string | null;
}) {
  const aliases: string[] = [];

  if (!input.bookWidthMm || !input.bookHeightMm) {
    return aliases;
  }

  const width = String(input.bookWidthMm);
  const height = String(input.bookHeightMm);
  const sizeLabel = `${width} x ${height} mm`;

  aliases.push(
    sizeLabel,
    `${width} x ${height}`,
    `${width} ${height}`,
    `${width}x${height}`,
    `Buchmaß ${sizeLabel}`,
    `Buchmass ${sizeLabel}`,
    `Buchumschlag ${sizeLabel}`,
    `Buchhülle ${sizeLabel}`,
    `Buchhuelle ${sizeLabel}`,
    `Umschlag ${sizeLabel}`,
    `${input.productName} ${sizeLabel}`,
    `${input.productName} ${width} x ${height}`,
    `${input.productName} ${width}x${height}`
  );

  if (input.bookSizeNote) {
    aliases.push(
      `${input.productName} ${input.bookSizeNote}`,
      `${sizeLabel} ${input.bookSizeNote}`
    );
  }

  return aliases;
}

function buildAutomaticAliasList(input: {
  productName: string;
  productSku: string | null;
  category: string | null;
  productType: string | null;
  format: string | null;
  color: string | null;
  lineature: string | null;
  existingAliases: string[];
  bookWidthMm: number | null;
  bookHeightMm: number | null;
  bookSizeNote: string | null;
}) {
  const generatedAliases = [
    input.productName,
    input.productSku,
    `${input.productName} ${input.productSku || ""}`,
    `${input.productName} ${input.category || ""}`,
    `${input.productName} ${input.productType || ""}`,
    `${input.productName} ${input.format || ""}`,
    `${input.productName} ${input.color || ""}`,
    `${input.productName} ${input.lineature || ""}`,
    `${input.productName} ${input.format || ""} ${input.color || ""}`,
    `${input.productName} ${input.format || ""} ${input.lineature || ""}`,
    `${input.productName} ${input.color || ""} ${input.lineature || ""}`,
    `${input.productType || ""} ${input.format || ""} ${input.color || ""} ${
      input.lineature || ""
    }`,
    `${input.category || ""} ${input.format || ""} ${input.color || ""} ${
      input.lineature || ""
    }`,
    ...getBookSizeAliases({
      productName: input.productName,
      bookWidthMm: input.bookWidthMm,
      bookHeightMm: input.bookHeightMm,
      bookSizeNote: input.bookSizeNote,
    }),
  ]
    .map((alias) => cleanAliasValue(alias))
    .filter((alias) => alias.length >= 2);

  const manualAliases = input.existingAliases
    .map((alias) => cleanAliasValue(alias))
    .filter((alias) => alias.length >= 2);

  return Array.from(new Set([...manualAliases, ...generatedAliases]));
}

function buildMatchKeywords(input: {
  productName: string;
  productSku: string | null;
  category: string | null;
  productType: string | null;
  format: string | null;
  color: string | null;
  lineature: string | null;
  aliases: string[];
  bookWidthMm: number | null;
  bookHeightMm: number | null;
  bookSizeNote: string | null;
}) {
  return Array.from(
    new Set([
      ...splitKeywords(input.productName),
      ...splitKeywords(input.productSku),
      ...splitKeywords(input.category),
      ...splitKeywords(input.productType),
      ...splitKeywords(input.format),
      ...splitKeywords(input.color),
      ...splitKeywords(input.lineature),
      ...splitKeywords(input.bookWidthMm),
      ...splitKeywords(input.bookHeightMm),
      ...splitKeywords(input.bookSizeNote),
      ...input.aliases.flatMap((alias) => splitKeywords(alias)),
      input.bookWidthMm && input.bookHeightMm
        ? `${input.bookWidthMm}x${input.bookHeightMm}`
        : "",
    ])
  ).filter(Boolean);
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
    const category = cleanString(product.category);
    const productType = cleanString(product.product_type);
    const format = cleanString(product.format);
    const color = cleanString(product.color);
    const lineature = cleanString(product.lineature);
    const bookWidthMm = toOptionalInteger(product.book_width_mm);
    const bookHeightMm = toOptionalInteger(product.book_height_mm);
    const bookSizeNote = cleanString(product.book_size_note);

    const aliases = buildAutomaticAliasList({
      productName,
      productSku,
      category,
      productType,
      format,
      color,
      lineature,
      existingAliases,
      bookWidthMm,
      bookHeightMm,
      bookSizeNote,
    });

    const matchKeywords = buildMatchKeywords({
      productName,
      productSku,
      category,
      productType,
      format,
      color,
      lineature,
      aliases,
      bookWidthMm,
      bookHeightMm,
      bookSizeNote,
    });

    await replaceProductAliases({
      supabase,
      productId,
      aliases,
    });

    const updatePayload: Record<string, unknown> = {};

    if (hasColumn(product, "match_keywords")) {
      updatePayload.match_keywords = matchKeywords;
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
      aliasCount: aliases.length,
      matchKeywordCount: matchKeywords.length,
      message: `Keywords wurden erzeugt. ${aliases.length} Suchbegriffe und ${matchKeywords.length} Match-Keywords wurden aktualisiert.`,
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