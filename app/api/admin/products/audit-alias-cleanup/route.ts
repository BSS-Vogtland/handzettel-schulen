import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProductRow = {
  id: string;
  name?: string | null;
  product_name?: string | null;
  sku?: string | null;
  product_sku?: string | null;
  category?: string | null;
  product_type?: string | null;
  format?: string | null;
  color?: string | null;
  lineature?: string | null;
};

type AliasRow = {
  id: string;
  product_id?: string | null;
  alias?: string | null;
  alias_text?: string | null;
  keyword?: string | null;
  value?: string | null;
  name?: string | null;
};

type AliasCleanupCandidate = {
  aliasId: string;
  productId: string;
  productName: string;
  sku: string | null;
  alias: string;
  reason: string;
};

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase-Konfiguration fehlt. NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY pruefen."
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normalize(value: unknown) {
  return clean(value)
    .toLowerCase()
    .replace(/\u00e4/g, "ae")
    .replace(/\u00f6/g, "oe")
    .replace(/\u00fc/g, "ue")
    .replace(/\u00df/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getProductName(product: ProductRow) {
  return clean(product.name) || clean(product.product_name) || "Unbenanntes Produkt";
}

function getProductSku(product: ProductRow) {
  return clean(product.sku) || clean(product.product_sku) || null;
}

function getAliasValue(alias: AliasRow) {
  return (
    clean(alias.alias) ||
    clean(alias.alias_text) ||
    clean(alias.keyword) ||
    clean(alias.value) ||
    clean(alias.name)
  );
}

function tokenCount(value: string) {
  return normalize(value).split(" ").filter(Boolean).length;
}

function isExactOneOf(value: string, candidates: string[]) {
  const normalizedValue = normalize(value);

  return candidates
    .map((candidate) => normalize(candidate))
    .filter(Boolean)
    .includes(normalizedValue);
}

function compactParts(parts: Array<string | null | undefined>) {
  return parts.map((part) => normalize(part)).filter(Boolean);
}

function getSafeAliasDeletionReason(aliasValue: string, product: ProductRow) {
  const alias = normalize(aliasValue);
  const sku = normalize(getProductSku(product));

  if (!alias) return "Leerer Alias";
  if (sku && alias.includes(sku)) return "";

  const category = normalize(product.category);
  const format = normalize(product.format);
  const color = normalize(product.color);
  const lineature = normalize(product.lineature);
  const productType = normalize(product.product_type);

  const protectedProductText = normalize([
    getProductName(product),
    product.category,
    product.product_type,
  ].join(" "));

  const protectedProductFamilies = [
    "schulranzen",
    "schulranzenset",
    "ranzen",
    "school mood",
    "schoolmood",
    "ergobag",
    "turnbeutel",
  ];

  if (protectedProductFamilies.some((term) => protectedProductText.includes(normalize(term)))) {
    return "";
  }

  const categoryWords = [
    "kunst",
    "hefte",
    "mappen",
    "schreiben",
    "zeichnen",
    "kleben",
    "organisation",
    "schulranzen",
    "sport",
    "block",
  ];

  const formatWords = ["a3", "a4", "a5"];
  const colorWords = [
    "gelb",
    "rot",
    "blau",
    "gruen",
    "hellgruen",
    "hellblau",
    "dunkelgruen",
    "dunkelblau",
    "weiss",
    "transparent",
    "orange",
    "lila",
    "rosa",
    "pink",
    "schwarz",
    "mehrfarbig",
  ];


  if (isExactOneOf(alias, formatWords)) {
    return "Nur Format als Alias";
  }

  const safeSingleColor =
    color && tokenCount(color) === 1 && isExactOneOf(color, colorWords)
      ? color
      : "";

  if (isExactOneOf(alias, colorWords)) {
    return "Nur Farbe als Alias";
  }

  if (/^\d{1,2}\s*farben$/.test(alias)) {
    return "Nur Farbanzahl als Alias";
  }

  if (/^\d{1,2}$/.test(alias)) {
    return "Nur Zahl/Lineatur als Alias";
  }

  const productSpecificSingles = compactParts([
    format,
    safeSingleColor,
    lineature,
  ]);

  if (productSpecificSingles.includes(alias)) {
    return "Einzelnes Produktmerkmal als Alias";
  }

  const genericCombinations = [
    compactParts([format, safeSingleColor]),
    compactParts([format, lineature]),
    compactParts([safeSingleColor, lineature]),
  ]
    .filter((parts) => parts.length >= 2)
    .map((parts) => parts.join(" "));

  if (genericCombinations.includes(alias)) {
    return "Nur generische Merkmalskombination als Alias";
  }

  const tokens = tokenCount(alias);

  if (tokens <= 2 && productType && alias === productType) {
    return "";
  }

  return "";
}

async function readBody(request: NextRequest) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await readBody(request);
    const mode = String(body.mode || "dry-run");
    const apply = mode === "apply";
    const confirm = String(body.confirm || "");

    if (apply && confirm !== "JA_ALIAS_CLEANUP") {
      return NextResponse.json(
        {
          ok: false,
          message: "Zum Loeschen muss confirm exakt JA_ALIAS_CLEANUP sein.",
        },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: productData, error: productError } = await supabase
      .from("school_products")
      .select("*")
      .limit(20000);

    if (productError) throw productError;

    const products = ((productData || []) as ProductRow[]).filter((product) =>
      clean(product.id)
    );

    const productById = new Map<string, ProductRow>();

    for (const product of products) {
      productById.set(product.id, product);
    }

    const { data: aliasData, error: aliasError } = await supabase
      .from("school_product_aliases")
      .select("*")
      .limit(50000);

    if (aliasError) throw aliasError;

    const aliases = ((aliasData || []) as AliasRow[]).filter((alias) =>
      clean(alias.id)
    );

    const candidates: AliasCleanupCandidate[] = [];

    for (const aliasRow of aliases) {
      const aliasId = clean(aliasRow.id);
      const productId = clean(aliasRow.product_id);
      const aliasValue = getAliasValue(aliasRow);
      const product = productById.get(productId);

      if (!aliasId || !productId || !aliasValue || !product) continue;

      const reason = getSafeAliasDeletionReason(aliasValue, product);

      if (!reason) continue;

      candidates.push({
        aliasId,
        productId,
        productName: getProductName(product),
        sku: getProductSku(product),
        alias: aliasValue,
        reason,
      });
    }

    const results: Array<{
      aliasId: string;
      productId: string;
      alias: string;
      deleted: boolean;
      error?: string;
    }> = [];

    if (apply) {
      for (const candidate of candidates) {
        const { error: deleteError } = await supabase
          .from("school_product_aliases")
          .delete()
          .eq("id", candidate.aliasId)
          .eq("product_id", candidate.productId);

        results.push({
          aliasId: candidate.aliasId,
          productId: candidate.productId,
          alias: candidate.alias,
          deleted: !deleteError,
          error: deleteError?.message,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      mode: apply ? "apply" : "dry-run",
      productCount: products.length,
      aliasCount: aliases.length,
      candidateCount: candidates.length,
      deletedCount: results.filter((result) => result.deleted).length,
      errorCount: results.filter((result) => result.error).length,
      candidates: candidates.slice(0, 500),
      results,
    });
  } catch (error) {
    console.error("product audit alias cleanup error:", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : typeof error === "object" && error !== null
              ? JSON.stringify(error)
              : "Alias-Cleanup fehlgeschlagen.",
      },
      { status: 500 }
    );
  }
}