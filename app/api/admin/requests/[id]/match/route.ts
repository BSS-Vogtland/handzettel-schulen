import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

type RequestItem = {
  id: string;
  request_id: string;
  raw_text: string | null;
  normalized_name: string | null;
  quantity: number | string | null;
  product_type?: string | null;
  category: string | null;
  format: string | null;
  color: string | null;
  lineature: string | null;
  notes: string | null;
  confidence: number | string | null;
  status: string | null;
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

const MIN_VISIBLE_SCORE = 70;
const MAX_MATCHES_PER_ITEM = 3;

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

function normalizeText(value: unknown) {
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

function normalizeForWords(value: unknown) {
  return normalizeText(value).replace(/[^a-z0-9]+/g, " ").trim();
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
  return normalizeForWords(value)
    .split(" ")
    .filter((word) => word.length >= 2);
}

function normalizeFormat(value: unknown) {
  const text = normalizeText(value);

  if (!text) return null;
  if (text.includes("a3")) return "a3";
  if (text.includes("a4")) return "a4";
  if (text.includes("a5")) return "a5";

  return null;
}

function extractDimensions(value: unknown) {
  const text = normalizeText(value).replace(/,/g, ".");

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
  const text = normalizeText(value);

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
  const text = normalizeText(value);

  if (!text) return null;

  if (
    text.includes("unklar") ||
    text.includes("nicht lesbar") ||
    text.includes("nicht erkennbar")
  ) {
    return "unknown";
  }

  // Lineatur 0 ist eine echte eigene Lineatur.
  if (
    text === "0" ||
    text.includes("lineatur 0") ||
    text.includes("lineatur0") ||
    text.includes("lin 0") ||
    text.includes("lin. 0") ||
    text.includes("lin0") ||
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

  // Bei Euch wird Lineatur 8 als 8f geführt.
  if (
    text === "8" ||
    text === "8f" ||
    text.includes("lineatur 8") ||
    text.includes("lineatur 8f") ||
    text.includes("lineatur8") ||
    text.includes("lineatur8f") ||
    text.includes("lin 8") ||
    text.includes("lin. 8") ||
    text.includes("lin 8f") ||
    text.includes("lin. 8f") ||
    text.includes("lin8") ||
    text.includes("lin8f") ||
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
      text.includes(`lineatur ${entry}`) ||
      text.includes(`lineatur${entry}`) ||
      text.includes(`lin ${entry}`) ||
      text.includes(`lin. ${entry}`) ||
      text.includes(`lin${entry}`) ||
      text.includes(` l ${entry}`) ||
      text.includes(` l${entry} `) ||
      text.endsWith(` l${entry}`) ||
      text.includes(`l${entry} `) ||
      text.endsWith(`l${entry}`)
    ) {
      return entry;
    }
  }

  return null;
}

function classifyType(value: unknown) {
  const text = normalizeText(value);

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

function hasSpecificLineature(value: unknown) {
  const text = normalizeText(value);

  const lineatures = [
    "0",
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "8f",
    "9",
    "10",
    "25",
    "26",
    "27",
    "28",
  ];

  return lineatures.some((lineature) => {
    return (
      text.includes(`lineatur ${lineature}`) ||
      text.includes(`lineatur${lineature}`) ||
      text.includes(`lin ${lineature}`) ||
      text.includes(`lin. ${lineature}`) ||
      text.includes(`lin${lineature}`) ||
      text.includes(` l ${lineature}`) ||
      text.includes(` l${lineature} `) ||
      text.endsWith(` l${lineature}`) ||
      text.includes(`l${lineature} `) ||
      text.endsWith(`l${lineature}`)
    );
  });
}

function buildItemText(item: RequestItem) {
  return [
    item.raw_text,
    item.normalized_name,
    item.product_type,
    item.category,
    item.format,
    item.color,
    item.lineature,
    item.notes,
  ]
    .filter(Boolean)
    .join(" ");
}

function buildProductText(product: ProductRow, aliases: string[]) {
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

function makeDuplicateKey(product: ProductRow) {
  return normalizeForWords(
    [
      getProductName(product),
      product.product_type,
      product.format,
      product.color,
      product.lineature,
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function calculateMatch(input: {
  item: RequestItem;
  product: ProductRow;
  aliases: string[];
}) {
  const itemText = buildItemText(input.item);
  const productText = buildProductText(input.product, input.aliases);

  const normalizedItemText = normalizeForWords(itemText);
  const normalizedProductText = normalizeForWords(productText);

  const itemType = classifyType(itemText);
  const productType = classifyType(productText);

  const itemFormat = getEffectiveFormat(itemText);
  const productFormat = getEffectiveFormat(productText);

  const itemColor = normalizeColor(itemText);
  const productColor = normalizeColor(productText);

  const itemLineature = normalizeLineature(
    `${input.item.lineature || ""} ${input.item.raw_text || ""} ${
      input.item.normalized_name || ""
    }`
  );

  const productLineature = normalizeLineature(productText);

  const reasons: string[] = [];
  let score = 0;

  if (itemType && productType && itemType !== productType) {
    return null;
  }

  if (itemType && !productType) {
    return null;
  }

  if (!itemType && productType) {
    score += 8;
    reasons.push("Produkttyp im Produkt erkannt");
  }

  if (itemType && productType && itemType === productType) {
    score += 40;
    reasons.push(`Produkttyp passt: ${itemType}`);
  }

  if (itemType === "heft" && productType === "hausaufgabenheft") {
    return null;
  }

  if (itemType === "hausaufgabenheft" && productType !== "hausaufgabenheft") {
    return null;
  }

  if (itemFormat) {
    if (!productFormat && isFormatSensitiveType(itemType || productType)) {
      return null;
    }

    if (productFormat && itemFormat !== productFormat) {
      return null;
    }

    if (productFormat && itemFormat === productFormat) {
      score += 25;
      reasons.push(`Format passt: ${itemFormat.toUpperCase()}`);
    }
  }

  if (itemColor && isColorSensitiveType(itemType || productType)) {
    if (!productColor) {
      return null;
    }

    if (itemColor !== productColor) {
      return null;
    }

    score += 25;
    reasons.push(`Farbe passt: ${itemColor}`);
  }

  if (itemType === "heft") {
    if (itemLineature === "unknown") {
      if (hasSpecificLineature(productText)) {
        return null;
      }

      reasons.push("Lineatur in Liste unklar");
    } else if (itemLineature) {
      if (!productLineature || productLineature !== itemLineature) {
        return null;
      }

      score += 30;
      reasons.push(`Lineatur passt: ${itemLineature}`);
    } else if (hasSpecificLineature(productText)) {
      return null;
    }
  }

  const itemWords = getWords(itemText);
  const productWords = getWords(productText);
  const productWordSet = new Set(productWords);

  const ignoredWords = new Set([
    "40x",
    "80x",
    "200x",
    "pappe",
    "cm",
    "und",
    "hoch",
    "breit",
    "klasse",
    "schuljahr",
    "buchmass",
    "buchma",
    "buchmae",
  ]);

  const meaningfulSharedWords = itemWords.filter((word) => {
    if (ignoredWords.has(word)) return false;
    if (/^\d+$/.test(word)) return false;
    return productWordSet.has(word);
  });

  const uniqueSharedWords = Array.from(new Set(meaningfulSharedWords));

  if (uniqueSharedWords.length > 0) {
    const wordScore = Math.min(12, uniqueSharedWords.length * 3);
    score += wordScore;
    reasons.push(`${uniqueSharedWords.length} gemeinsame Suchbegriffe`);
  }

  for (const alias of input.aliases) {
    const normalizedAlias = normalizeForWords(alias);

    if (!normalizedAlias) continue;

    if (normalizedItemText.includes(normalizedAlias)) {
      score += 12;
      reasons.push(`Alias passt: ${alias}`);
      break;
    }

    const aliasWords = getWords(alias);
    const aliasHitCount = aliasWords.filter((word) =>
      normalizedItemText.includes(word)
    ).length;

    if (aliasHitCount >= 2) {
      score += 8;
      reasons.push(`Alias teilweise passend: ${alias}`);
      break;
    }
  }

  const productName = normalizeForWords(getProductName(input.product));
  const itemName = normalizeForWords(
    input.item.normalized_name || input.item.raw_text
  );

  if (productName && itemName && productName.includes(itemName)) {
    score += 10;
    reasons.push("Produktname enthält erkannte Position");
  }

  if (
    itemType === "umschlag" &&
    itemColor === "transparent" &&
    productColor !== "transparent"
  ) {
    return null;
  }

  if (
    itemType === "schnellhefter" &&
    itemColor &&
    productColor &&
    itemColor !== productColor
  ) {
    return null;
  }

  if (normalizedItemText.includes("schreibheft")) {
    if (
      normalizedProductText.includes("hausaufgabenheft") ||
      normalizedProductText.includes("hausaufgaben")
    ) {
      return null;
    }
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  if (score < MIN_VISIBLE_SCORE) {
    return null;
  }

  return {
    score,
    reason: reasons.join(". "),
  };
}

async function createRequestEvent(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  requestId: string,
  eventType: string,
  message: string,
  metadata?: Record<string, unknown>
) {
  const payloads = [
    {
      request_id: requestId,
      event_type: eventType,
      message,
      metadata: metadata ?? {},
    },
    {
      request_id: requestId,
      type: eventType,
      message,
      metadata: metadata ?? {},
    },
  ];

  for (const payload of payloads) {
    const { error } = await supabase
      .from("school_request_events")
      .insert(payload);

    if (!error) return;
  }
}

export async function POST(_request: NextRequest, context: Params) {
  try {
    const { id } = await context.params;
    const supabase = getSupabaseAdmin();

    if (!id) {
      return jsonResponse(
        {
          ok: false,
          message: "Keine Anfrage-ID übergeben.",
        },
        400
      );
    }

    const { data: requestData, error: requestError } = await supabase
      .from("school_requests")
      .select("id, status, offer_status")
      .eq("id", id)
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

    if (!requestData) {
      return jsonResponse(
        {
          ok: false,
          message: "Anfrage wurde nicht gefunden.",
        },
        404
      );
    }

    const { data: requestItemsData, error: requestItemsError } = await supabase
      .from("school_request_items")
      .select("*")
      .eq("request_id", id)
      .order("created_at", { ascending: true });

    if (requestItemsError) {
      return jsonResponse(
        {
          ok: false,
          message: `Erkannte Positionen konnten nicht geladen werden: ${requestItemsError.message}`,
        },
        500
      );
    }

    const requestItems = (requestItemsData || []) as RequestItem[];

    if (requestItems.length === 0) {
      return jsonResponse(
        {
          ok: false,
          message:
            "Es gibt noch keine erkannten Positionen. Bitte zuerst die Liste auswerten.",
        },
        422
      );
    }

    const [{ data: productsData, error: productsError }, { data: aliasesData }] =
      await Promise.all([
        supabase.from("school_products").select("*").limit(1000),
        supabase.from("school_product_aliases").select("*").limit(5000),
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

    const products = ((productsData || []) as ProductRow[]).filter(
      (product) => product.active !== false
    );

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

    const requestItemIds = requestItems.map((item) => item.id);

    if (requestItemIds.length > 0) {
      const { error: deleteError } = await supabase
        .from("school_request_matches")
        .delete()
        .in("request_item_id", requestItemIds);

      if (deleteError) {
        return jsonResponse(
          {
            ok: false,
            message: `Alte Vorschläge konnten nicht entfernt werden: ${deleteError.message}`,
          },
          500
        );
      }
    }

    const rowsToInsert: Array<{
      request_item_id: string;
      product_id: string | null;
      product_name: string;
      product_sku: string | null;
      product_price: number;
      match_score: number;
      match_reason: string;
      selected: boolean;
    }> = [];

    for (const item of requestItems) {
      const seenProductIds = new Set<string>();
      const seenDuplicateKeys = new Set<string>();

      const scoredProducts = products
        .map((product) => {
          if (seenProductIds.has(product.id)) return null;

          const aliasesForProduct = aliasesByProduct.get(product.id) || [];
          const result = calculateMatch({
            item,
            product,
            aliases: aliasesForProduct,
          });

          if (!result) return null;

          return {
            product,
            score: result.score,
            reason: result.reason,
          };
        })
        .filter(
          (
            entry
          ): entry is {
            product: ProductRow;
            score: number;
            reason: string;
          } => Boolean(entry)
        )
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
          const duplicateKey = makeDuplicateKey(entry.product);

          if (seenProductIds.has(entry.product.id)) return false;
          if (seenDuplicateKeys.has(duplicateKey)) return false;

          seenProductIds.add(entry.product.id);
          seenDuplicateKeys.add(duplicateKey);

          return true;
        })
        .slice(0, MAX_MATCHES_PER_ITEM);

      for (const scoredProduct of scoredProducts) {
        rowsToInsert.push({
          request_item_id: item.id,
          product_id: scoredProduct.product.id,
          product_name: getProductName(scoredProduct.product),
          product_sku: getProductSku(scoredProduct.product),
          product_price: getProductPrice(scoredProduct.product),
          match_score: scoredProduct.score,
          match_reason: scoredProduct.reason,
          selected: false,
        });
      }
    }

    if (rowsToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from("school_request_matches")
        .insert(rowsToInsert);

      if (insertError) {
        return jsonResponse(
          {
            ok: false,
            message: `Produktvorschläge konnten nicht gespeichert werden: ${insertError.message}`,
          },
          500
        );
      }
    }

    await supabase
      .from("school_requests")
      .update({
        offer_status: rowsToInsert.length > 0 ? "matching_done" : "not_created",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    await createRequestEvent(
      supabase,
      id,
      "product_matching_done",
      "Produktvorschläge wurden neu und strenger berechnet.",
      {
        itemCount: requestItems.length,
        matchCount: rowsToInsert.length,
        maxMatchesPerItem: MAX_MATCHES_PER_ITEM,
        minVisibleScore: MIN_VISIBLE_SCORE,
      }
    );

    return jsonResponse({
      ok: true,
      itemCount: requestItems.length,
      matchCount: rowsToInsert.length,
      maxMatchesPerItem: MAX_MATCHES_PER_ITEM,
      minVisibleScore: MIN_VISIBLE_SCORE,
      message:
        rowsToInsert.length > 0
          ? `Produktvorschläge wurden neu berechnet. Pro Position werden maximal ${MAX_MATCHES_PER_ITEM} Vorschläge gespeichert. Mindesttrefferquote: ${MIN_VISIBLE_SCORE} %.`
          : "Es wurden keine ausreichend sicheren Produktvorschläge gefunden. Diese Positionen bleiben zur manuellen Prüfung offen.",
    });
  } catch (error) {
    console.error("Admin product match error:", error);

    return jsonResponse(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Produktvorschläge konnten nicht erstellt werden.",
      },
      500
    );
  }
}