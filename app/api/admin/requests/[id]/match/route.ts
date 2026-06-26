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
  book_width_mm?: number | string | null;
  book_height_mm?: number | string | null;
  book_size_note?: string | null;
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

type BookDimensions = {
  shortSideMm: number;
  longSideMm: number;
  label: string;
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
      "Supabase Umgebungsvariablen fehlen. PrÃ¼fe NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY."
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
    .replace(/Ã¤/g, "ae")
    .replace(/Ã¶/g, "oe")
    .replace(/Ã¼/g, "ue")
    .replace(/ÃŸ/g, "ss")
    .replace(/grÃ¼n/g, "gruen")
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


const SIMPLE_STANDARD_TYPES = new Set([
  "hausaufgabenheft",
  "ersatzpatronen",
  "umschlag",
  "klebestift",
  "radiergummi",
  "spitzer",
  "lineal",
  "geodreieck",
  "zirkel",
  "schere",
  "bleistift",
  "buntstifte",
  "filzstifte",
  "fineliner",
  "farbkasten",
  "deckweiss",
  "wasserbecher",
  "textmarker",
]);

function normalizeSingularProductTerm(value: unknown) {
  const text = normalizeForWords(value)
    .replace(/\b\d+\s*x?\b/g, " ")
    .replace(/\bstueck\b/g, " ")
    .replace(/\bstk\b/g, " ")
    .replace(/\bpackung\b/g, " ")
    .replace(/\bset\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const replacements: Array<[RegExp, string]> = [
    [/\bklebestifte\b/g, "klebestift"],
    [/\bradiergummis\b/g, "radiergummi"],
    [/\bradierer\b/g, "radiergummi"],
    [/\bdosenspitzer\b/g, "spitzer auffangbehaelter"],
    [/\bspitzerdose\b/g, "auffangbehaelter"],
    [/\bspitzerdosen\b/g, "auffangbehaelter"],
    [/\bauffangdose\b/g, "auffangbehaelter"],
    [/\bauffangdosen\b/g, "auffangbehaelter"],
    [/\bauffangbehaelter\b/g, "auffangbehaelter"],
    [/\bauffangbehalter\b/g, "auffangbehaelter"],
    [/\bspitzer\b/g, "spitzer"],
    [/\blineale\b/g, "lineal"],
    [/\bscheren\b/g, "schere"],
    [/\bbleistifte\b/g, "bleistift"],
    [/\bbuntstift\b/g, "buntstifte"],
    [/\bbuntstifte\b/g, "buntstifte"],
    [/\bfilzstift\b/g, "filzstifte"],
    [/\bfilzstifte\b/g, "filzstifte"],
    [/\bfarbkaesten\b/g, "farbkasten"],
    [/\bfarbkasten\b/g, "farbkasten"],
    [/\bdeckfarbkasten\b/g, "farbkasten"],
    [/\bmalkasten\b/g, "farbkasten"],
  ];

  return replacements
    .reduce((current, [pattern, replacement]) => {
      return current.replace(pattern, replacement);
    }, text)
    .replace(/\s+/g, " ")
    .trim();
}

function getExactNameCandidates(input: {
  item: RequestItem;
  product: ProductRow;
  aliases: string[];
}) {
  const itemCandidates = [
    input.item.normalized_name,
    input.item.raw_text,
    normalizeSingularProductTerm(input.item.normalized_name),
    normalizeSingularProductTerm(input.item.raw_text),
  ]
    .map((value) => normalizeSingularProductTerm(value))
    .filter(Boolean);

  const productCandidates = [
    getProductName(input.product),
    ...input.aliases,
  ]
    .map((value) => normalizeSingularProductTerm(value))
    .filter(Boolean);

  return {
    itemCandidates: Array.from(new Set(itemCandidates)),
    productCandidates: Array.from(new Set(productCandidates)),
  };
}

function hasExactNameOrAliasMatch(input: {
  item: RequestItem;
  product: ProductRow;
  aliases: string[];
}) {
  const { itemCandidates, productCandidates } = getExactNameCandidates(input);

  for (const itemCandidate of itemCandidates) {
    if (!itemCandidate) continue;

    for (const productCandidate of productCandidates) {
      if (!productCandidate) continue;

      if (itemCandidate === productCandidate) {
        return {
          exact: true,
          label: itemCandidate,
        };
      }
    }
  }

  return {
    exact: false,
    label: null,
  };
}

function isSimpleStandardArticle(type: string | null, text: unknown) {
  if (type && SIMPLE_STANDARD_TYPES.has(type)) {
    return true;
  }

  const normalized = normalizeSingularProductTerm(text);

  return Array.from(SIMPLE_STANDARD_TYPES).some((entry) => {
    return normalized === entry || normalized.includes(entry);
  });
}



type StandardTermMatch = {
  label: string;
  score: number;
};

const STANDARD_TERM_GROUPS: Array<{
  label: string;
  terms: string[];
  score: number;
}> = [
  {
    label: "Hausaufgabenheft",
    terms: ["hausaufgabenheft", "hausaufgaben", "aufgabenheft", "ha heft", "haheft"],
    score: 88,
  },
  {
    label: "Ersatzpatronen",
    terms: ["ersatzpatronen", "ersatzpatrone", "fuellerpatronen", "fuellerpatrone", "tintenpatronen", "tintenpatrone"],
    score: 88,
  },
  {
    label: "Umschlag",
    terms: ["umschlag", "umschlaege", "hefthuelle", "hefthuellen", "heft huelle", "heft huellen"],
    score: 84,
  },
  {
    label: "Klebestift",
    terms: ["klebestift", "klebestifte"],
    score: 88,
  },
  {
    label: "Schere",
    terms: ["schere"],
    score: 88,
  },
  {
    label: "Zirkel",
    terms: ["zirkel"],
    score: 88,
  },
  {
    label: "Geodreieck",
    terms: ["geodreieck"],
    score: 88,
  },
  {
    label: "Lineal",
    terms: ["lineal", "lineale"],
    score: 86,
  },
  {
    label: "Farbkasten",
    terms: ["farbkasten", "malkasten"],
    score: 88,
  },
  {
    label: "Deckweiß",
    terms: ["deckweiss", "deckweiss tube", "deckfarbe weiss"],
    score: 86,
  },
  {
    label: "Wasserbecher",
    terms: ["wasserbecher", "malbecher"],
    score: 86,
  },
  {
    label: "Fineliner",
    terms: ["fineliner"],
    score: 84,
  },
  {
    label: "Textmarker",
    terms: ["textmarker"],
    score: 84,
  },
  {
    label: "Bleistift",
    terms: ["bleistift", "bleistifte"],
    score: 84,
  },
];

function includesStandardTerm(text: string, term: string) {
  const normalizedTerm = normalizeSingularProductTerm(term);
  if (!normalizedTerm) return false;

  return (
    text === normalizedTerm ||
    text.includes(` ${normalizedTerm} `) ||
    text.startsWith(`${normalizedTerm} `) ||
    text.endsWith(` ${normalizedTerm}`) ||
    text.includes(normalizedTerm)
  );
}

function getStandardTermMatch(itemText: string, productText: string): StandardTermMatch | null {
  const normalizedItemText = ` ${normalizeSingularProductTerm(itemText)} `;
  const normalizedProductText = ` ${normalizeSingularProductTerm(productText)} `;

  if (!normalizedItemText.trim() || !normalizedProductText.trim()) {
    return null;
  }

  for (const group of STANDARD_TERM_GROUPS) {
    const itemHasTerm = group.terms.some((term) =>
      includesStandardTerm(normalizedItemText, term)
    );
    const productHasTerm = group.terms.some((term) =>
      includesStandardTerm(normalizedProductText, term)
    );

    if (itemHasTerm && productHasTerm) {
      return {
        label: group.label,
        score: group.score,
      };
    }
  }

  return null;
}

function hasRelevantVariantConflict(params: {
  itemFormat: string | null;
  productFormat: string | null;
  itemColor: string | null;
  productColor: string | null;
  itemLineature: string | null;
  productLineature: string | null;
  itemType: string | null;
  productType: string | null;
}) {
  if (params.itemFormat && params.productFormat && params.itemFormat !== params.productFormat) {
    return true;
  }

  if (
    params.itemColor &&
    params.productColor &&
    params.itemColor !== params.productColor &&
    isColorSensitiveType(params.itemType || params.productType)
  ) {
    return true;
  }

  if (
    params.itemLineature &&
    params.itemLineature !== "unknown" &&
    params.productLineature &&
    params.itemLineature !== params.productLineature &&
    (params.itemType === "heft" || params.productType === "heft")
  ) {
    return true;
  }

  return false;
}
function hasSpitzerContainerTerm(value: unknown) {
  const text = normalizeText(value);

  return (
    text.includes("spitzerdose") ||
    text.includes("spitzerdosen") ||
    text.includes("dosenspitzer") ||
    text.includes("auffangbehaelter") ||
    text.includes("auffangbehalter") ||
    text.includes("auffang behalter") ||
    text.includes("auffang behaelter") ||
    text.includes("auffangdose") ||
    text.includes("auffang dos") ||
    text.includes("spandose") ||
    text.includes("spaenedose") ||
    text.includes("spaene dose") ||
    text.includes("mit dose") ||
    text.includes("mit behaelter") ||
    text.includes("mit behalter")
  );
}

function getSpitzerContainerScore(params: {
  itemText: string;
  productText: string;
  itemType: string | null;
  productType: string | null;
}) {
  const isSpitzerMatch =
    params.itemType === "spitzer" || params.productType === "spitzer";

  if (!isSpitzerMatch) return null;

  const itemWantsContainer = hasSpitzerContainerTerm(params.itemText);
  const productHasContainer = hasSpitzerContainerTerm(params.productText);

  if (itemWantsContainer && !productHasContainer) {
    return {
      compatible: false,
      score: 0,
      reason:
        "Liste verlangt einen Spitzer mit Dose/AuffangbehÃ¤lter, Produkt hat dieses Merkmal nicht.",
    };
  }

  if (itemWantsContainer && productHasContainer) {
    return {
      compatible: true,
      score: 42,
      reason: "Spitzer mit Dose/AuffangbehÃ¤lter passt",
    };
  }

  return null;
}

function hasExplicitVariantDemand(params: {
  itemText: string;
  itemFormat: string | null;
  itemColor: string | null;
  itemLineature: string | null;
  itemBookDimensions: BookDimensions | null;
}) {
  const normalizedItemText = normalizeText(params.itemText);

  return Boolean(
    params.itemFormat ||
      params.itemColor ||
      (params.itemLineature && params.itemLineature !== "unknown") ||
      params.itemBookDimensions ||
      normalizedItemText.includes("gramm") ||
      normalizedItemText.includes(" g ") ||
      normalizedItemText.endsWith(" g") ||
      /\b\d+\s*g\b/.test(normalizedItemText) ||
      /\b\d+\s*ml\b/.test(normalizedItemText)
  );
}


function normalizeFormat(value: unknown) {
  const text = normalizeText(value);

  if (!text) return null;
  if (text.includes("a3")) return "a3";
  if (text.includes("a4")) return "a4";
  if (text.includes("a5")) return "a5";

  return null;
}

function normalizeDimensionNumberToMm(
  value: number,
  unit: string | undefined,
  partnerUnit: string | undefined
) {
  const normalizedUnit = String(unit || partnerUnit || "").toLowerCase();

  if (normalizedUnit === "cm") {
    return Math.round(value * 10);
  }

  if (normalizedUnit === "mm") {
    return Math.round(value);
  }

  if (value < 100) {
    return Math.round(value * 10);
  }

  return Math.round(value);
}

function makeBookDimensions(firstMm: number, secondMm: number): BookDimensions | null {
  if (!Number.isFinite(firstMm) || !Number.isFinite(secondMm)) return null;
  if (firstMm <= 0 || secondMm <= 0) return null;

  const shortSideMm = Math.min(firstMm, secondMm);
  const longSideMm = Math.max(firstMm, secondMm);

  if (shortSideMm < 50 || longSideMm < 80) return null;

  return {
    shortSideMm,
    longSideMm,
    label: `${shortSideMm} x ${longSideMm} mm`,
  };
}

function extractBookDimensionsMm(value: unknown): BookDimensions | null {
  const rawText = String(value ?? "")
    .toLowerCase()
    .replace(/,/g, ".")
    .replace(/Ã—/g, "x")
    .replace(/\s+/g, " ")
    .trim();

  if (!rawText) return null;

  const patterns = [
    /(\d+(?:\.\d+)?)\s*(mm|cm)?\s*(?:x|mal)\s*(\d+(?:\.\d+)?)\s*(mm|cm)?/,
    /(\d+(?:\.\d+)?)\s*(mm|cm)\s+(?:hoch|breit)\s+(?:und\s+)?(\d+(?:\.\d+)?)\s*(mm|cm)\s+(?:hoch|breit)/,
    /(\d+(?:\.\d+)?)\s*(mm|cm)?\s+(?:hoch|breit)\s+(?:und\s+)?(\d+(?:\.\d+)?)\s*(mm|cm)?\s+(?:hoch|breit)/,
  ];

  for (const pattern of patterns) {
    const match = rawText.match(pattern);
    if (!match) continue;

    const first = Number(match[1]);
    const firstUnit = match[2];
    const second = Number(match[3]);
    const secondUnit = match[4];

    if (!Number.isFinite(first) || !Number.isFinite(second)) continue;

    const firstMm = normalizeDimensionNumberToMm(first, firstUnit, secondUnit);
    const secondMm = normalizeDimensionNumberToMm(second, secondUnit, firstUnit);

    const dimensions = makeBookDimensions(firstMm, secondMm);
    if (dimensions) return dimensions;
  }

  return null;
}

function getProductBookDimensions(product: ProductRow): BookDimensions | null {
  const width = toNumber(product.book_width_mm, 0);
  const height = toNumber(product.book_height_mm, 0);

  if (width <= 0 || height <= 0) {
    return null;
  }

  return makeBookDimensions(width, height);
}

function compareBookDimensions(input: {
  requested: BookDimensions;
  product: BookDimensions;
}) {
  const shortDiff = Math.abs(input.requested.shortSideMm - input.product.shortSideMm);
  const longDiff = Math.abs(input.requested.longSideMm - input.product.longSideMm);

  if (shortDiff <= 3 && longDiff <= 3) {
    return {
      compatible: true,
      score: 45,
      reason: `BuchmaÃŸ passt exakt: ${input.product.label}`,
    };
  }

  if (shortDiff <= 10 && longDiff <= 10) {
    return {
      compatible: true,
      score: 38,
      reason: `BuchmaÃŸ passt mit kleiner Toleranz: ${input.product.label}`,
    };
  }

  if (shortDiff <= 20 && longDiff <= 20) {
    return {
      compatible: true,
      score: 28,
      reason: `BuchmaÃŸ liegt im passenden Toleranzbereich: ${input.product.label}`,
    };
  }

  const productIsSlightlyLarger =
    input.product.shortSideMm >= input.requested.shortSideMm &&
    input.product.longSideMm >= input.requested.longSideMm &&
    input.product.shortSideMm - input.requested.shortSideMm <= 30 &&
    input.product.longSideMm - input.requested.longSideMm <= 30;

  if (productIsSlightlyLarger) {
    return {
      compatible: true,
      score: 20,
      reason: `BuchmaÃŸ passt als etwas grÃ¶ÃŸerer Umschlag: ${input.product.label}`,
    };
  }

  return {
    compatible: false,
    score: 0,
    reason: `BuchmaÃŸ passt nicht: gesucht ${input.requested.label}, Produkt ${input.product.label}`,
  };
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
    text.includes("schulheft 0") ||
    text.includes("blanko") ||
    text.includes("unliniert") ||
    text.includes("ohne lineatur")
  ) {
    return "0";
  }

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
    text.includes("8 f") ||
    text.includes("nr 8") ||
    text.includes("nr. 8") ||
    text.includes("nummer 8")
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
      text.endsWith(`l${entry}`) ||
      text.includes(`nr ${entry}`) ||
      text.includes(`nr. ${entry}`) ||
      text.includes(`nummer ${entry}`)
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
    text.includes("buchhuelle") ||
    text.includes("buchhulle") ||
    text.includes("huelle") ||
    text.includes("huellen")
  ) {
    return "umschlag";
  }

  if (
    text.includes("hausaufgabenheft") ||
    text.includes("hausaufgaben") ||
    text.includes("aufgabenheft") ||
    text.includes("ha heft") ||
    text.includes("haheft") ||
    text.includes("ha hft")
  ) {
    return "hausaufgabenheft";
  }

  if (
    text.includes("mappe") ||
    text.includes("mappen") ||
    text.includes("sammelmappe") ||
    text.includes("eckspanner") ||
    text.includes("gummizugmappe")
  ) {
    return "mappe";
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

  if (text.includes("klebestift") || text.includes("kleber")) {
    return "klebestift";
  }

  if (
    text.includes("spitzer") ||
    text.includes("anspitzer") ||
    text.includes("spitzerdose") ||
    text.includes("dosenspitzer") ||
    text.includes("auffangbehaelter") ||
    text.includes("auffangbehalter")
  ) {
    return "spitzer";
  }

  if (text.includes("schere")) {
    return "schere";
  }

  if (
    text.includes("buntstifte") ||
    text.includes("buntstift") ||
    text.includes("farbstifte") ||
    text.includes("farbstift")
  ) {
    return "buntstifte";
  }

  if (
    text.includes("filzstifte") ||
    text.includes("filzstift") ||
    text.includes("fasermaler")
  ) {
    return "filzstifte";
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
    text.includes("rechenheft") ||
    text.includes("rechenh") ||
    text.includes("matheheft") ||
    text.includes("mathe heft") ||
    text.includes("math heft")
  ) {
    return "heft";
  }

  if (
    text.includes("schreibheft") ||
    text.includes("schreibh") ||
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
      text.endsWith(`l${lineature}`) ||
      text.includes(`nr ${lineature}`) ||
      text.includes(`nr. ${lineature}`) ||
      text.includes(`nummer ${lineature}`)
    );
  });
}

function isRechenheftText(value: unknown) {
  const text = normalizeText(value);

  return (
    text.includes("rechenheft") ||
    text.includes("rechenh") ||
    text.includes("matheheft") ||
    text.includes("mathe heft") ||
    text.includes("math heft")
  );
}

function isSchreibheftText(value: unknown) {
  const text = normalizeText(value);

  return (
    text.includes("schreibheft") ||
    text.includes("schreibh") ||
    text.includes("schulheft")
  );
}

function isHausaufgabenheftText(value: unknown) {
  const text = normalizeText(value);

  return (
    text.includes("hausaufgabenheft") ||
    text.includes("hausaufgaben") ||
    text.includes("aufgabenheft") ||
    text.includes("ha heft") ||
    text.includes("haheft") ||
    text.includes("ha hft")
  );
}

function getHeftSubtype(value: unknown) {
  if (isHausaufgabenheftText(value)) return "hausaufgabenheft";
  if (isRechenheftText(value)) return "rechenheft";
  if (isSchreibheftText(value)) return "schreibheft";

  return null;
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
  const bookDimensions = getProductBookDimensions(product);

  return [
    getProductName(product),
    getProductSku(product),
    product.category,
    product.product_type,
    product.format,
    product.color,
    product.lineature,
    bookDimensions ? bookDimensions.label : null,
    product.book_size_note,
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
    "mappe",
    "schnellhefter",
    "schreibblock",
    "zeichenblock",
    "zeichenkarton",
  ].includes(type || "");
}

function isColorSensitiveType(type: string | null) {
  return ["umschlag", "mappe", "schnellhefter"].includes(type || "");
}

function isBookDimensionRelevant(params: {
  itemText: string;
  productText: string;
  itemType: string | null;
  productType: string | null;
  itemDimensions: BookDimensions | null;
}) {
  if (!params.itemDimensions) return false;

  const normalizedItemText = normalizeText(params.itemText);
  const normalizedProductText = normalizeText(params.productText);

  return (
    params.itemType === "umschlag" ||
    params.productType === "umschlag" ||
    normalizedItemText.includes("buchumschlag") ||
    normalizedItemText.includes("buchmass") ||
    normalizedItemText.includes("buchma") ||
    normalizedItemText.includes("buchhulle") ||
    normalizedItemText.includes("buchhuelle") ||
    normalizedProductText.includes("buchumschlag") ||
    normalizedProductText.includes("buchhulle") ||
    normalizedProductText.includes("buchhuelle")
  );
}

function makeDuplicateKey(product: ProductRow) {
  const bookDimensions = getProductBookDimensions(product);

  return normalizeForWords(
    [
      getProductName(product),
      product.product_type,
      product.format,
      product.color,
      product.lineature,
      bookDimensions ? bookDimensions.label : null,
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
    } ${input.item.notes || ""}`
  );

  const productLineature = normalizeLineature(productText);

  const itemBookDimensions = extractBookDimensionsMm(itemText);
  const productBookDimensions =
    getProductBookDimensions(input.product) || extractBookDimensionsMm(productText);

  const itemHeftSubtype = getHeftSubtype(itemText);
  const productHeftSubtype = getHeftSubtype(productText);

  const exactNameMatch = hasExactNameOrAliasMatch({
    item: input.item,
    product: input.product,
    aliases: input.aliases,
  });

  const standardTermMatch = getStandardTermMatch(itemText, productText);

  const isSimpleStandardMatch =
    (exactNameMatch.exact || Boolean(standardTermMatch)) &&
    isSimpleStandardArticle(itemType || productType, `${itemText} ${productText}`);

  const itemHasExplicitVariantDemand = hasExplicitVariantDemand({
    itemText,
    itemFormat,
    itemColor,
    itemLineature,
    itemBookDimensions,
  });

  const hasVariantConflict = hasRelevantVariantConflict({
    itemFormat,
    productFormat,
    itemColor,
    productColor,
    itemLineature,
    productLineature,
    itemType,
    productType,
  });

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

  const spitzerContainerScore = getSpitzerContainerScore({
    itemText,
    productText,
    itemType,
    productType,
  });

  if (spitzerContainerScore && !spitzerContainerScore.compatible) {
    return null;
  }

  if (spitzerContainerScore && spitzerContainerScore.compatible) {
    score += spitzerContainerScore.score;
    reasons.push(spitzerContainerScore.reason);
  }

  if (itemType === "heft" || productType === "heft") {
    if (itemHeftSubtype === "hausaufgabenheft" && productHeftSubtype !== "hausaufgabenheft") {
      return null;
    }

    if (productHeftSubtype === "hausaufgabenheft" && itemHeftSubtype !== "hausaufgabenheft") {
      return null;
    }

    if (itemHeftSubtype === "rechenheft" && productHeftSubtype && productHeftSubtype !== "rechenheft") {
      return null;
    }

    if (itemHeftSubtype === "schreibheft" && productHeftSubtype === "rechenheft") {
      return null;
    }

    if (itemHeftSubtype && productHeftSubtype && itemHeftSubtype === productHeftSubtype) {
      score += 18;
      reasons.push(`Heft-Unterart passt: ${itemHeftSubtype}`);
    }

    if (itemHeftSubtype === "rechenheft" && !productHeftSubtype && !isRechenheftText(productText)) {
      return null;
    }
  }

  if (itemType === "heft" && productType === "hausaufgabenheft") {
    return null;
  }

  if (itemType === "hausaufgabenheft" && productType !== "hausaufgabenheft") {
    return null;
  }

  if (
    isBookDimensionRelevant({
      itemText,
      productText,
      itemType,
      productType,
      itemDimensions: itemBookDimensions,
    })
  ) {
    if (!itemBookDimensions || !productBookDimensions) {
      return null;
    }

    const dimensionMatch = compareBookDimensions({
      requested: itemBookDimensions,
      product: productBookDimensions,
    });

    if (!dimensionMatch.compatible) {
      return null;
    }

    score += dimensionMatch.score;
    reasons.push(dimensionMatch.reason);
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

    score += 28;
    reasons.push(`Farbe passt: ${itemColor}`);

    if (
      (itemType === "umschlag" || productType === "umschlag") &&
      !itemFormat &&
      productFormat
    ) {
      score += 10;
      reasons.push(`Umschlag-Farbe passt; Format ${productFormat.toUpperCase()} wird aus dem Produkt übernommen`);
    }
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

      score += 32;
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
    "mm",
    "und",
    "hoch",
    "breit",
    "klasse",
    "schuljahr",
    "buchmass",
    "buchma",
    "buchmae",
    "produkttyp",
    "analyse",
    "version",
    "wurde",
    "als",
    "eigenstaendige",
    "erkannt",
    "normalisiert",
  ]);

  const meaningfulSharedWords = itemWords.filter((word) => {
    if (ignoredWords.has(word)) return false;
    if (/^\d+$/.test(word)) return false;
    return productWordSet.has(word);
  });

  const uniqueSharedWords = Array.from(new Set(meaningfulSharedWords));

  if (uniqueSharedWords.length > 0) {
    const wordScore = Math.min(15, uniqueSharedWords.length * 3);
    score += wordScore;
    reasons.push(`${uniqueSharedWords.length} gemeinsame Suchbegriffe`);
  }

  for (const alias of input.aliases) {
    const normalizedAlias = normalizeForWords(alias);

    if (!normalizedAlias) continue;

    if (normalizedItemText.includes(normalizedAlias)) {
      score += 15;
      reasons.push(`Alias passt: ${alias}`);
      break;
    }

    const aliasWords = getWords(alias);
    const aliasHitCount = aliasWords.filter((word) =>
      normalizedItemText.includes(word)
    ).length;

    if (aliasHitCount >= 2) {
      score += 10;
      reasons.push(`Alias teilweise passend: ${alias}`);
      break;
    }
  }

  const productName = normalizeForWords(getProductName(input.product));
  const itemName = normalizeForWords(
    input.item.normalized_name || input.item.raw_text
  );

  if (productName && itemName && productName.includes(itemName)) {
    score += 12;
    reasons.push("Produktname enthÃ¤lt erkannte Position");
  }

  if (itemName && productName && itemName.includes(productName)) {
    score += 10;
    reasons.push("Erkannte Position enthÃ¤lt Produktname");
  }

  if (exactNameMatch.exact) {
    if (isSimpleStandardMatch && !itemHasExplicitVariantDemand) {
      score = Math.max(score, 98);
      reasons.push(
        `Exakter Standardartikel passt: ${exactNameMatch.label || getProductName(input.product)}`
      );
    } else if (!itemHasExplicitVariantDemand) {
      score = Math.max(score, 92);
      reasons.push(
        `Exakter Produktname/Alias passt: ${exactNameMatch.label || getProductName(input.product)}`
      );
    } else {
      score = Math.max(score, 85);
      reasons.push(
        `Produktname/Alias passt, Variantenmerkmal wird zusÃ¤tzlich berÃ¼cksichtigt`
      );
    }
  }

  if (
    itemType === "spitzer" &&
    spitzerContainerScore &&
    spitzerContainerScore.compatible &&
    !itemHasExplicitVariantDemand
  ) {
    score = Math.max(score, 96);
    reasons.push("Spitzer-Dosen-Synonym wurde gleichgesetzt");
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

  if (
    itemType === "mappe" &&
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

  if (itemType === "mappe" && normalizedProductText.includes("schnellhefter")) {
    return null;
  }

  if (itemType === "schnellhefter" && normalizedProductText.includes("mappe")) {
    return null;
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
      title: "ProduktvorschlÃ¤ge berechnet",
      description: message,
      created_at: new Date().toISOString(),
    },
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
          message: "Keine Anfrage-ID Ã¼bergeben.",
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
            message: `Alte VorschlÃ¤ge konnten nicht entfernt werden: ${deleteError.message}`,
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
            message: `ProduktvorschlÃ¤ge konnten nicht gespeichert werden: ${insertError.message}`,
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
      "ProduktvorschlÃ¤ge wurden neu berechnet. Exakte Standardartikel, BuchmaÃŸe, Heft-Unterarten, Lineaturen, Mappen und Farben werden berÃ¼cksichtigt.",
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
          ? `ProduktvorschlÃ¤ge wurden neu berechnet. Exakte Standardartikel, BuchmaÃŸe, Heft-Unterarten, Lineaturen, Mappen und Farben werden berÃ¼cksichtigt. Pro Position werden maximal ${MAX_MATCHES_PER_ITEM} VorschlÃ¤ge gespeichert. Mindesttrefferquote: ${MIN_VISIBLE_SCORE} %.`
          : "Es wurden keine ausreichend sicheren ProduktvorschlÃ¤ge gefunden. Diese Positionen bleiben zur manuellen PrÃ¼fung offen.",
    });
  } catch (error) {
    console.error("Admin product match error:", error);

    return jsonResponse(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "ProduktvorschlÃ¤ge konnten nicht erstellt werden.",
      },
      500
    );
  }
}
