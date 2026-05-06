import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    token: string;
  }>;
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
  category?: string | null;
  product_type?: string | null;
  format?: string | null;
  color?: string | null;
  lineature?: string | null;
  image_url?: string | null;
  active?: boolean | null;
};

type AliasRow = {
  id?: string;
  product_id?: string | null;
  alias?: string | null;
  alias_text?: string | null;
  alias_name?: string | null;
  name?: string | null;
};

const MAX_PRODUCTS = 3;
const MIN_SEARCH_SCORE = 70;

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

function normalizeSearch(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .trim()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/grün/g, "gruen")
    .replace(/[^a-z0-9,.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeWords(value: unknown) {
  return normalizeSearch(value)
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function getAliasText(alias: AliasRow) {
  return alias.alias || alias.alias_text || alias.alias_name || alias.name || "";
}

function getWords(value: unknown) {
  return normalizeWords(value)
    .split(" ")
    .filter((word) => word.length >= 2);
}

function normalizeFormat(value: unknown) {
  const text = normalizeSearch(value);

  if (!text) return null;
  if (text.includes("a3")) return "a3";
  if (text.includes("a4")) return "a4";
  if (text.includes("a5")) return "a5";

  return null;
}

function extractDimensions(value: unknown) {
  const text = normalizeSearch(value).replace(/,/g, ".");

  const patterns = [
    /(\d+(?:\.\d+)?)\s*cm\s+hoch\s+und\s+(\d+(?:\.\d+)?)\s*cm\s+breit/g,
    /(\d+(?:\.\d+)?)\s*cm\s+breit\s+und\s+(\d+(?:\.\d+)?)\s*cm\s+hoch/g,
    /(\d+(?:\.\d+)?)\s*(?:cm)?\s*(?:x|und)\s*(\d+(?:\.\d+)?)/g,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (!match) continue;

    const first = Number(match[1]);
    const second = Number(match[2]);

    if (!Number.isFinite(first) || !Number.isFinite(second)) continue;

    return {
      longSide: Math.max(first, second),
      shortSide: Math.min(first, second),
    };
  }

  return null;
}

function inferFormatFromDimensions(value: unknown) {
  const dimensions = extractDimensions(value);

  if (!dimensions) return null;

  const { longSide, shortSide } = dimensions;

  if (longSide >= 29 && longSide <= 33.5 && shortSide >= 20 && shortSide <= 24) {
    return "a4";
  }

  if (longSide >= 20 && longSide <= 27.5 && shortSide >= 14 && shortSide <= 20) {
    return "a5";
  }

  return null;
}

function getEffectiveFormat(value: unknown) {
  return normalizeFormat(value) || inferFormatFromDimensions(value);
}

function normalizeColor(value: unknown) {
  const text = normalizeSearch(value);

  if (!text) return null;

  if (text.includes("transparent") || text.includes("klar")) {
    return "transparent";
  }

  const colors = [
    "rot",
    "blau",
    "gruen",
    "gelb",
    "orange",
    "lila",
    "violett",
    "pink",
    "rosa",
    "schwarz",
    "weiss",
    "braun",
  ];

  for (const color of colors) {
    if (text.includes(color)) return color;
  }

  return null;
}

function normalizeLineature(value: unknown) {
  const text = normalizeSearch(value);
  const compact = text.replace(/\s+/g, "");

  if (!text || text === "null" || text === "undefined") return null;

  if (
    text.includes("nicht lesbar") ||
    text.includes("nicht erkennbar") ||
    text.includes("keine lineatur erkennbar")
  ) {
    return "unknown";
  }

  if (
    text === "0" ||
    compact === "0" ||
    text.includes("lineatur 0") ||
    compact.includes("lineatur0") ||
    text.includes("lin 0") ||
    compact.includes("lin0") ||
    text.includes(" l 0") ||
    text.includes(" l0") ||
    text.includes("l0 ") ||
    text.endsWith(" l0") ||
    text.includes("heft 0") ||
    text.includes("schreibheft 0") ||
    text.includes("schulheft 0")
  ) {
    return "0";
  }

  if (
    text === "8" ||
    text === "8f" ||
    compact === "8" ||
    compact === "8f" ||
    text.includes("lineatur 8") ||
    text.includes("lineatur 8f") ||
    compact.includes("lineatur8") ||
    compact.includes("lineatur8f") ||
    text.includes("lin 8") ||
    text.includes("lin 8f") ||
    compact.includes("lin8") ||
    compact.includes("lin8f") ||
    text.includes(" l 8") ||
    text.includes(" l8") ||
    text.includes("l8 ") ||
    text.endsWith(" l8") ||
    text.includes(" l 8f") ||
    text.includes(" l8f") ||
    text.includes("l8f ") ||
    text.endsWith(" l8f") ||
    text.includes("8 f")
  ) {
    return "8f";
  }

  if (text.includes("kariert") || text.includes("karriert")) return "28";
  if (text.includes("liniert")) return "liniert";

  const known = [
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "9",
    "10",
    "25",
    "26",
    "27",
    "28",
  ];

  for (const entry of known) {
    if (
      text === entry ||
      compact === entry ||
      text.includes(`lineatur ${entry}`) ||
      compact.includes(`lineatur${entry}`) ||
      text.includes(`lin ${entry}`) ||
      compact.includes(`lin${entry}`) ||
      text.includes(` l ${entry}`) ||
      text.includes(` l${entry} `) ||
      text.endsWith(` l${entry}`) ||
      text.includes(`l${entry} `) ||
      text.endsWith(`l${entry}`)
    ) {
      return entry;
    }
  }

  if (text.includes("unklar")) return "unknown";

  return null;
}

function classifyType(value: unknown) {
  const text = normalizeSearch(value);

  if (
    text.includes("umschlag") ||
    text.includes("umschlaege") ||
    text.includes("hefthuelle") ||
    text.includes("hefthuellen") ||
    text.includes("huelle") ||
    text.includes("huellen")
  ) {
    return "umschlag";
  }

  if (
    text.includes("hausaufgabenheft") ||
    text.includes("hausaufgaben") ||
    text.includes("aufgabenheft")
  ) {
    return "hausaufgabenheft";
  }

  if (
    text.includes("schreibblock") ||
    text.includes("collegeblock") ||
    text.includes("notizblock")
  ) {
    return "schreibblock";
  }

  if (
    text.includes("zeichenblock") ||
    text.includes("malblock") ||
    text.includes("skizzenblock")
  ) {
    return "zeichenblock";
  }

  if (
    text.includes("zeichenkarton") ||
    text.includes("tonkarton") ||
    text.includes("fotokarton")
  ) {
    return "zeichenkarton";
  }

  if (
    text.includes("farbkasten") ||
    text.includes("deckfarbkasten") ||
    text.includes("malkasten") ||
    text.includes("wasserfarben")
  ) {
    return "farbkasten";
  }

  if (text.includes("bleistift") || text.includes(" hb ")) {
    return "bleistift";
  }

  if (text.includes("radiergummi") || text.includes("radierer")) {
    return "radiergummi";
  }

  if (text.includes("lineal")) {
    return "lineal";
  }

  if (text.includes("schnellhefter") || text.includes("hefter")) {
    return "schnellhefter";
  }

  if (
    text.includes("schreibheft") ||
    text.includes("schulheft") ||
    text.includes("heft")
  ) {
    return "heft";
  }

  return null;
}

function isFormatSensitiveType(type: string | null) {
  return [
    "heft",
    "hausaufgabenheft",
    "umschlag",
    "schnellhefter",
    "schreibblock",
    "zeichenblock",
    "zeichenkarton",
  ].includes(type || "");
}

function isColorSensitiveType(type: string | null) {
  return ["umschlag", "schnellhefter"].includes(type || "");
}

function isHeftText(value: unknown) {
  const text = normalizeSearch(value);

  return (
    text.includes("heft") ||
    text.includes("schulheft") ||
    text.includes("schreibheft")
  );
}

function isHausaufgabenheftText(value: unknown) {
  const text = normalizeSearch(value);

  return (
    text.includes("hausaufgabenheft") ||
    text.includes("hausaufgaben") ||
    text.includes("aufgabenheft")
  );
}

function isA5Text(value: unknown) {
  return normalizeSearch(value).includes("a5");
}

function getEffectiveQueryLineature(query: string) {
  const directLineature = normalizeLineature(query);

  if (directLineature && directLineature !== "unknown") {
    return directLineature;
  }

  if (isHeftText(query) && !isHausaufgabenheftText(query) && isA5Text(query)) {
    return "0";
  }

  return directLineature;
}

function getProductSearchText(product: ProductRow, aliases: string[]) {
  return [
    getProductName(product),
    getProductSku(product),
    product.category,
    product.product_type,
    product.format,
    product.color,
    product.lineature,
    ...aliases,
  ]
    .filter(Boolean)
    .join(" ");
}

function productHasLineature(productText: string, lineature: string) {
  const normalized = normalizeSearch(productText);
  const compact = normalized.replace(/\s+/g, "");

  if (lineature === "0") {
    return (
      normalized.includes("lineatur 0") ||
      compact.includes("lineatur0") ||
      normalized.includes("lin 0") ||
      compact.includes("lin0") ||
      normalized.includes(" l0 ") ||
      normalized.endsWith(" l0")
    );
  }

  if (lineature === "8f") {
    return (
      normalized.includes("lineatur 8") ||
      normalized.includes("lineatur 8f") ||
      compact.includes("lineatur8") ||
      compact.includes("lineatur8f") ||
      normalized.includes("lin 8") ||
      normalized.includes("lin 8f") ||
      compact.includes("lin8") ||
      compact.includes("lin8f") ||
      normalized.includes(" l8 ") ||
      normalized.includes(" l8f ") ||
      normalized.endsWith(" l8") ||
      normalized.endsWith(" l8f")
    );
  }

  if (lineature === "28") {
    return (
      normalized.includes("lineatur 28") ||
      compact.includes("lineatur28") ||
      normalized.includes("lin 28") ||
      compact.includes("lin28") ||
      normalized.includes(" l28") ||
      normalized.includes("kariert") ||
      normalized.includes("karriert")
    );
  }

  if (lineature === "liniert") {
    return normalized.includes("liniert");
  }

  return (
    normalized.includes(`lineatur ${lineature}`) ||
    compact.includes(`lineatur${lineature}`) ||
    normalized.includes(`lin ${lineature}`) ||
    compact.includes(`lin${lineature}`) ||
    normalized.includes(` l${lineature} `) ||
    normalized.endsWith(` l${lineature}`)
  );
}

function scoreProductSearch(input: {
  query: string;
  product: ProductRow;
  aliases: string[];
}) {
  const queryText = input.query;
  const productText = getProductSearchText(input.product, input.aliases);

  const normalizedQuery = normalizeWords(queryText);
  const normalizedProductText = normalizeWords(productText);
  const normalizedProductName = normalizeWords(getProductName(input.product));
  const normalizedSku = normalizeWords(getProductSku(input.product));

  const queryWords = getWords(queryText).filter((word) => {
    if (/^\d+x?$/.test(word)) return false;
    if (
      [
        "cm",
        "und",
        "hoch",
        "breit",
        "buchmass",
        "buchma",
        "buchmae",
        "lineatur",
        "lin",
      ].includes(word)
    ) {
      return false;
    }
    return true;
  });

  const queryType = classifyType(queryText);
  const productType = classifyType(productText);

  const queryFormat = getEffectiveFormat(queryText);
  const productFormat = getEffectiveFormat(productText);

  const queryColor = normalizeColor(queryText);
  const productColor = normalizeColor(productText);

  const queryLineature = getEffectiveQueryLineature(queryText);
  const productLineature = normalizeLineature(productText);

  let score = 0;

  if (queryType && productType && queryType !== productType) {
    return 0;
  }

  if (queryType && !productType) {
    return 0;
  }

  if (queryType && productType && queryType === productType) {
    score += 45;
  }

  if (normalizedQuery && normalizedProductName === normalizedQuery) {
    score += 120;
  }

  if (normalizedQuery && normalizedSku === normalizedQuery) {
    score += 120;
  }

  if (normalizedQuery && normalizedProductName.includes(normalizedQuery)) {
    score += 60;
  }

  if (normalizedQuery && normalizedProductText.includes(normalizedQuery)) {
    score += 40;
  }

  if (queryFormat) {
    if (!productFormat && isFormatSensitiveType(queryType || productType)) {
      return 0;
    }

    if (productFormat && queryFormat !== productFormat) {
      return 0;
    }

    if (productFormat && queryFormat === productFormat) {
      score += 30;
    }
  }

  if (queryColor && isColorSensitiveType(queryType || productType)) {
    if (!productColor) return 0;
    if (queryColor !== productColor) return 0;

    score += 30;
  }

  if (queryType === "heft" && queryLineature && queryLineature !== "unknown") {
    if (!productLineature && !productHasLineature(productText, queryLineature)) {
      return 0;
    }

    if (
      productLineature &&
      productLineature !== queryLineature &&
      !productHasLineature(productText, queryLineature)
    ) {
      return 0;
    }

    score += 35;
  }

  if (
    normalizedQuery.includes("schreibheft") &&
    normalizedProductText.includes("hausaufgabenheft")
  ) {
    return 0;
  }

  if (
    queryType === "hausaufgabenheft" &&
    !normalizedProductText.includes("hausaufgaben")
  ) {
    return 0;
  }

  const productWordSet = new Set(getWords(productText));

  const sharedWords = Array.from(
    new Set(queryWords.filter((word) => productWordSet.has(word)))
  );

  score += Math.min(20, sharedWords.length * 5);

  for (const alias of input.aliases) {
    const normalizedAlias = normalizeWords(alias);

    if (!normalizedAlias) continue;

    if (normalizedAlias === normalizedQuery) {
      score += 80;
      continue;
    }

    if (normalizedAlias.includes(normalizedQuery)) {
      score += 45;
      continue;
    }

    const aliasWordSet = new Set(getWords(alias));
    const aliasHits = queryWords.filter((word) => aliasWordSet.has(word));

    if (aliasHits.length >= 2) {
      score += 20;
    }
  }

  return score;
}

export async function GET(request: NextRequest, context: Params) {
  try {
    const { token } = await context.params;
    const supabase = getSupabaseAdmin();

    if (!token) {
      return jsonResponse(
        {
          ok: false,
          message: "Kein Angebotstoken übergeben.",
        },
        400
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const query = String(searchParams.get("q") || "").trim();

    if (!query || query.length < 2) {
      return jsonResponse({
        ok: true,
        products: [],
      });
    }

    const { data: schoolRequest, error: requestError } = await supabase
      .from("school_requests")
      .select("id, status, offer_status")
      .eq("offer_token", token)
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

    if (
      schoolRequest.status === "confirmed" ||
      schoolRequest.offer_status === "confirmed"
    ) {
      return jsonResponse(
        {
          ok: false,
          message:
            "Der Paketwunsch wurde bereits abgesendet. Die Produktsuche ist geschlossen.",
        },
        409
      );
    }

    const [{ data: productsData, error: productsError }, { data: aliasesData }] =
      await Promise.all([
        supabase.from("school_products").select("*").limit(800),
        supabase.from("school_product_aliases").select("*").limit(3000),
      ]);

    if (productsError) {
      return jsonResponse(
        {
          ok: false,
          message: `Produkte konnten nicht geladen werden: ${productsError.message}`,
        },
        500
      );
    }

    const products = (productsData || []) as ProductRow[];
    const aliases = (aliasesData || []) as AliasRow[];

    const aliasesByProduct = new Map<string, string[]>();

    for (const alias of aliases) {
      if (!alias.product_id) continue;

      const current = aliasesByProduct.get(alias.product_id) || [];
      const aliasText = getAliasText(alias);

      if (aliasText) {
        current.push(aliasText);
      }

      aliasesByProduct.set(alias.product_id, current);
    }

    const seenIds = new Set<string>();

    const resultProducts = products
      .filter((product) => product.active !== false)
      .map((product) => {
        const productAliases = aliasesByProduct.get(product.id) || [];
        const score = scoreProductSearch({
          query,
          product,
          aliases: productAliases,
        });

        return {
          product,
          score,
        };
      })
      .filter((entry) => entry.score >= MIN_SEARCH_SCORE)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;

        const priceA = getProductPrice(a.product);
        const priceB = getProductPrice(b.product);

        if (priceA !== priceB) return priceA - priceB;

        return getProductName(a.product).localeCompare(
          getProductName(b.product),
          "de",
          {
            numeric: true,
            sensitivity: "base",
          }
        );
      })
      .filter((entry) => {
        if (seenIds.has(entry.product.id)) return false;
        seenIds.add(entry.product.id);
        return true;
      })
      .slice(0, MAX_PRODUCTS)
      .map((entry) => {
        const product = entry.product;

        return {
          id: product.id,
          productName: getProductName(product),
          productSku: getProductSku(product),
          productPrice: getProductPrice(product),
          imageUrl: product.image_url || null,
          category: product.category || null,
          productType: product.product_type || null,
          format: product.format || null,
          color: product.color || null,
          lineature:
            normalizeLineature(product.lineature) ||
            normalizeLineature(getProductSearchText(product, aliasesByProduct.get(product.id) || [])) ||
            product.lineature ||
            null,
          score: entry.score,
        };
      });

    return jsonResponse({
      ok: true,
      products: resultProducts,
      maxProducts: MAX_PRODUCTS,
      minSearchScore: MIN_SEARCH_SCORE,
    });
  } catch (error) {
    console.error("Customer product search error:", error);

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