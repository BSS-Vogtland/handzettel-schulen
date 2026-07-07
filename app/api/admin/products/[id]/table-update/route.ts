import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import {
  loadProductCategoryOptions,
  normalizeProductCategoryWithOptions,
} from "@/lib/productCategoryDatabase";
import { buildProductKeywordData } from "../../../../../lib/productKeywords";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

type ProductRow = Record<string, unknown>;

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase Umgebungsvariablen fehlen. Pruefe NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY."
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
  const cleaned = String(value || "").trim();
  return cleaned.length > 0 ? cleaned : null;
}

function toNumber(value: unknown, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toOptionalInteger(value: unknown) {
  const raw = String(value || "").replace(/[^\d]/g, "");
  if (!raw) return null;

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseActive(value: unknown) {
  const text = String(value || "").trim().toLowerCase();
  return text === "true" || text === "1" || text === "yes" || text === "on";
}

function splitAliases(value: unknown) {
  return String(value || "")
    .split(/[\n,;]+/g)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 80);
}

function setIfColumnExists(
  payload: Record<string, unknown>,
  product: ProductRow,
  column: string,
  value: unknown
) {
  if (Object.prototype.hasOwnProperty.call(product, column)) {
    payload[column] = value;
  }
}

export async function POST(request: NextRequest, context: Params) {
  try {
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        {
          ok: false,
          message: "Keine Produkt-ID uebergeben.",
        },
        { status: 400 }
      );
    }

    const formData = await request.formData();

    const supabase = getSupabaseAdmin();
    const categoryOptions = await loadProductCategoryOptions(supabase, {
      activeOnly: true,
    });

    const productName = cleanString(formData.get("productName"));
    const productSku = cleanString(formData.get("productSku"));
    const ean = cleanString(formData.get("ean"));
    const productPrice = toNumber(formData.get("productPrice"), 0);
    const rawCategory = cleanString(formData.get("category"));
    const category = normalizeProductCategoryWithOptions(rawCategory, categoryOptions);
    const productType = cleanString(formData.get("productType"));
    const format = cleanString(formData.get("format"));
    const color = cleanString(formData.get("color"));
    const lineature = cleanString(formData.get("lineature"));
    const bookWidthMm = toOptionalInteger(formData.get("bookWidthMm"));
    const bookHeightMm = toOptionalInteger(formData.get("bookHeightMm"));
    const bookSizeNote = cleanString(formData.get("bookSizeNote"));
    const imageUrl = cleanString(formData.get("imageUrl"));
    const active = parseActive(formData.get("active"));
    const stockQuantity = toOptionalInteger(formData.get("stockQuantity"));
    const storageLocation = cleanString(formData.get("storageLocation"));
    const supplierName = cleanString(formData.get("supplierName"));
    const manualAliases = splitAliases(formData.get("aliases"));

    if (!productName) {
      return NextResponse.json(
        {
          ok: false,
          message: "Bitte gib einen Produktnamen ein.",
        },
        { status: 400 }
      );
    }

    if (!category) {
      return NextResponse.json(
        {
          ok: false,
          message: "Bitte waehle eine feste Produktkategorie aus.",
        },
        { status: 400 }
      );
    }

    const { data: product, error: productError } = await supabase
      .from("school_products")
      .select("*")
      .eq("id", id)
      .single();

    if (productError || !product) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Produkt konnte nicht geladen werden: " +
            (productError?.message || "nicht gefunden"),
        },
        { status: 404 }
      );
    }

    const keywordData = buildProductKeywordData({
      productName,
      productSku,
      category,
      productType,
      format,
      color,
      lineature,
      aliases: manualAliases,
      bookWidthMm,
      bookHeightMm,
      bookSizeNote,
    });

    const updatePayload: Record<string, unknown> = {};
    const now = new Date().toISOString();

    setIfColumnExists(updatePayload, product, "name", productName);
    setIfColumnExists(updatePayload, product, "product_name", productName);
    setIfColumnExists(updatePayload, product, "title", productName);

    setIfColumnExists(updatePayload, product, "sku", productSku);
    setIfColumnExists(updatePayload, product, "product_sku", productSku);
    setIfColumnExists(updatePayload, product, "ean", ean);

    setIfColumnExists(updatePayload, product, "price", productPrice);
    setIfColumnExists(updatePayload, product, "product_price", productPrice);
    setIfColumnExists(updatePayload, product, "sale_price", productPrice);
    setIfColumnExists(updatePayload, product, "sale_price_gross", productPrice);

    setIfColumnExists(updatePayload, product, "category", category);
    setIfColumnExists(updatePayload, product, "product_type", productType);
    setIfColumnExists(updatePayload, product, "format", format);
    setIfColumnExists(updatePayload, product, "color", color);
    setIfColumnExists(updatePayload, product, "lineature", lineature);

    setIfColumnExists(updatePayload, product, "book_width_mm", bookWidthMm);
    setIfColumnExists(updatePayload, product, "book_height_mm", bookHeightMm);
    setIfColumnExists(updatePayload, product, "book_size_note", bookSizeNote);

    setIfColumnExists(updatePayload, product, "image_url", imageUrl);

    setIfColumnExists(updatePayload, product, "active", active);
    setIfColumnExists(updatePayload, product, "is_active", active);

    setIfColumnExists(updatePayload, product, "stock_quantity", stockQuantity);
    setIfColumnExists(updatePayload, product, "storage_location", storageLocation);
    setIfColumnExists(updatePayload, product, "supplier_name", supplierName);

    setIfColumnExists(updatePayload, product, "match_keywords", keywordData.matchKeywords);
    setIfColumnExists(updatePayload, product, "updated_at", now);

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json(
        {
          ok: false,
          message: "Keine passenden Produktspalten zum Aktualisieren gefunden.",
        },
        { status: 400 }
      );
    }

    const { data: updatedProduct, error: updateError } = await supabase
      .from("school_products")
      .update(updatePayload)
      .eq("id", id)
      .select("*")
      .single();

    if (updateError) {
      return NextResponse.json(
        {
          ok: false,
          message: "Produkt konnte nicht aktualisiert werden: " + updateError.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Produkt wurde gespeichert.",
      product: updatedProduct,
    });
  } catch (error) {
    console.error("product table update error:", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Produkt konnte nicht gespeichert werden.",
      },
      { status: 500 }
    );
  }
}
