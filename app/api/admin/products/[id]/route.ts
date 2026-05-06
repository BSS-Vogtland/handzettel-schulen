import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

type ProductRow = Record<string, unknown>;

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
  if (value === null || value === undefined) return null;

  const trimmed = String(value).trim();

  return trimmed.length > 0 ? trimmed : null;
}

function toNumber(value: unknown, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function splitAliases(value: unknown) {
  const text = String(value ?? "");

  return Array.from(
    new Set(
      text
        .split(/[\n;,]+/g)
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
    )
  );
}

function hasColumn(product: ProductRow, columnName: string) {
  return Object.prototype.hasOwnProperty.call(product, columnName);
}

function setIfColumnExists(
  updatePayload: Record<string, unknown>,
  product: ProductRow,
  columnName: string,
  value: unknown
) {
  if (hasColumn(product, columnName)) {
    updatePayload[columnName] = value;
  }
}

async function replaceProductAliases(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  productId: string,
  aliases: string[]
) {
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

export async function PATCH(request: NextRequest, context: Params) {
  try {
    const { id } = await context.params;
    const supabase = getSupabaseAdmin();

    if (!id) {
      return jsonResponse(
        {
          ok: false,
          message: "Keine Produkt-ID übergeben.",
        },
        400
      );
    }

    const payload = await request.json();

    const productName = cleanString(payload.productName);
    const productSku = cleanString(payload.productSku);
    const category = cleanString(payload.category);
    const productType = cleanString(payload.productType);
    const format = cleanString(payload.format);
    const color = cleanString(payload.color);
    const lineature = cleanString(payload.lineature);
    const imageUrl = cleanString(payload.imageUrl);
    const price = toNumber(payload.productPrice, 0);
    const active = payload.active !== false;
    const aliases = splitAliases(payload.aliases);

    if (!productName) {
      return jsonResponse(
        {
          ok: false,
          message: "Bitte gib einen Produktnamen ein.",
        },
        400
      );
    }

    const { data: existingProduct, error: existingProductError } =
      await supabase
        .from("school_products")
        .select("*")
        .eq("id", id)
        .maybeSingle();

    if (existingProductError) {
      return jsonResponse(
        {
          ok: false,
          message: `Produkt konnte nicht geladen werden: ${existingProductError.message}`,
        },
        500
      );
    }

    if (!existingProduct) {
      return jsonResponse(
        {
          ok: false,
          message: "Produkt wurde nicht gefunden.",
        },
        404
      );
    }

    const product = existingProduct as ProductRow;
    const updatePayload: Record<string, unknown> = {};

    setIfColumnExists(updatePayload, product, "name", productName);
    setIfColumnExists(updatePayload, product, "product_name", productName);
    setIfColumnExists(updatePayload, product, "title", productName);

    setIfColumnExists(updatePayload, product, "sku", productSku);
    setIfColumnExists(updatePayload, product, "product_sku", productSku);

    setIfColumnExists(updatePayload, product, "price", price);
    setIfColumnExists(updatePayload, product, "product_price", price);
    setIfColumnExists(updatePayload, product, "sale_price", price);
    setIfColumnExists(updatePayload, product, "sale_price_gross", price);

    setIfColumnExists(updatePayload, product, "category", category);
    setIfColumnExists(updatePayload, product, "product_type", productType);
    setIfColumnExists(updatePayload, product, "format", format);
    setIfColumnExists(updatePayload, product, "color", color);
    setIfColumnExists(updatePayload, product, "lineature", lineature);
    setIfColumnExists(updatePayload, product, "image_url", imageUrl);
    setIfColumnExists(updatePayload, product, "active", active);
    setIfColumnExists(
      updatePayload,
      product,
      "updated_at",
      new Date().toISOString()
    );

    if (Object.keys(updatePayload).length === 0) {
      return jsonResponse(
        {
          ok: false,
          message:
            "Es konnten keine passenden Produktspalten zum Aktualisieren gefunden werden.",
        },
        500
      );
    }

    const { error: updateError } = await supabase
      .from("school_products")
      .update(updatePayload)
      .eq("id", id);

    if (updateError) {
      return jsonResponse(
        {
          ok: false,
          message: `Produkt konnte nicht aktualisiert werden: ${updateError.message}`,
        },
        500
      );
    }

    await replaceProductAliases(supabase, id, aliases);

    return jsonResponse({
      ok: true,
      message: "Produkt wurde aktualisiert.",
    });
  } catch (error) {
    console.error("Admin product update error:", error);

    return jsonResponse(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Produkt konnte nicht aktualisiert werden.",
      },
      500
    );
  }
}