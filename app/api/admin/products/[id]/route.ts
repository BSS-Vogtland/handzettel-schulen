import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    id: string;
  }>;
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

  return text
    .split(/[\n;,]+/g)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
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
    throw new Error(`Alte Suchbegriffe konnten nicht gelöscht werden: ${deleteError.message}`);
  }

  if (aliases.length === 0) return;

  const rows = aliases.map((alias) => ({
    product_id: productId,
    alias_text: alias,
  }));

  const { error: insertError } = await supabase
    .from("school_product_aliases")
    .insert(rows);

  if (!insertError) return;

  const fallbackRows = aliases.map((alias) => ({
    product_id: productId,
    alias,
  }));

  const { error: fallbackError } = await supabase
    .from("school_product_aliases")
    .insert(fallbackRows);

  if (fallbackError) {
    throw new Error(
      `Suchbegriffe konnten nicht gespeichert werden: ${fallbackError.message}`
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

    const updatePayload = {
      name: productName,
      product_name: productName,
      title: productName,
      sku: productSku,
      product_sku: productSku,
      price,
      product_price: price,
      sale_price_gross: price,
      sale_price: price,
      category,
      product_type: productType,
      format,
      color,
      lineature,
      image_url: imageUrl,
      active,
      updated_at: new Date().toISOString(),
    };

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