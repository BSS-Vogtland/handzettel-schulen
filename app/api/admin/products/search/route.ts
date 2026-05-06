import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  category?: string | null;
  product_type?: string | null;
  format?: string | null;
  color?: string | null;
  lineature?: string | null;
  image_url?: string | null;
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
  return product.sku || product.product_sku || "";
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

function normalizeSearch(value: unknown) {
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

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const searchParams = request.nextUrl.searchParams;
    const query = String(searchParams.get("q") || "").trim();

    if (!query || query.length < 2) {
      return jsonResponse({
        ok: true,
        products: [],
      });
    }

    const { data, error } = await supabase
      .from("school_products")
      .select("*")
      .limit(300);

    if (error) {
      return jsonResponse(
        {
          ok: false,
          message: `Produkte konnten nicht geladen werden: ${error.message}`,
        },
        500
      );
    }

    const normalizedQuery = normalizeSearch(query);
    const queryWords = normalizedQuery.split(" ").filter(Boolean);

    const products = ((data || []) as ProductRow[])
      .map((product) => {
        const productName = getProductName(product);
        const productSku = getProductSku(product);

        const haystack = normalizeSearch(
          [
            productName,
            productSku,
            product.category,
            product.product_type,
            product.format,
            product.color,
            product.lineature,
          ]
            .filter(Boolean)
            .join(" ")
        );

        let score = 0;

        if (haystack.includes(normalizedQuery)) {
          score += 50;
        }

        for (const word of queryWords) {
          if (haystack.includes(word)) {
            score += 10;
          }
        }

        if (normalizeSearch(productSku) === normalizedQuery) {
          score += 100;
        }

        return {
          id: product.id,
          productName,
          productSku,
          productPrice: getProductPrice(product),
          imageUrl: product.image_url || null,
          category: product.category || null,
          productType: product.product_type || null,
          format: product.format || null,
          color: product.color || null,
          lineature: product.lineature || null,
          score,
        };
      })
      .filter((product) => product.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;

        return a.productName.localeCompare(b.productName, "de", {
          numeric: true,
          sensitivity: "base",
        });
      })
      .slice(0, 12);

    return jsonResponse({
      ok: true,
      products,
    });
  } catch (error) {
    console.error("Admin product search error:", error);

    return jsonResponse(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Produkte konnten nicht gesucht werden.",
      },
      500
    );
  }
}