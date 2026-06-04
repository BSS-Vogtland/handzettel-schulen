type SupabaseLike = any;

export type ProductSkuInput = {
  productName?: string | null;
  category?: string | null;
  productType?: string | null;
  format?: string | null;
  color?: string | null;
  lineature?: string | null;
};

function normalizeText(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/é/g, "e")
    .replace(/è/g, "e")
    .replace(/á/g, "a")
    .replace(/à/g, "a")
    .replace(/ó/g, "o")
    .replace(/ò/g, "o")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toSkuToken(value: unknown) {
  return normalizeText(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function includesAny(text: string, words: string[]) {
  return words.some((word) => text.includes(word));
}

export function getProductTypeCode(input: ProductSkuInput) {
  const text = normalizeText(
    [
      input.productName,
      input.category,
      input.productType,
      input.format,
      input.color,
      input.lineature,
    ].join(" ")
  );

  if (includesAny(text, ["umschlag", "umschlaege", "heftumschlag", "buchumschlag"])) return "UMS";
  if (includesAny(text, ["schnellhefter", "hefter"])) return "SHF";
  if (includesAny(text, ["hausaufgabenheft", "zahlenlernheft", "lernheft", "schreibheft", "heft"])) return "HEF";
  if (includesAny(text, ["zeichenkarton", "zeichenpapier", "zeichenblock", "malblock", "collegeblock", "block"])) return "BLK";
  if (includesAny(text, ["wasserbecher", "becher"])) return "BCH";
  if (includesAny(text, ["klebestift", "textmarker", "permanentmarker", "marker", "filzstift", "buntstift", "bleistift", "stift"])) return "STF";
  if (includesAny(text, ["pinsel"])) return "PIN";
  if (includesAny(text, ["radiergummi", "radierer"])) return "RAD";
  if (includesAny(text, ["spitzer", "anspitzer"])) return "SPZ";
  if (includesAny(text, ["schere"])) return "SCH";
  if (includesAny(text, ["lineal"])) return "LIN";
  if (includesAny(text, ["zirkel"])) return "ZIR";
  if (includesAny(text, ["mappe", "sammelmappe", "eckspanner"])) return "MAP";
  if (includesAny(text, ["deckfarben", "farbkasten", "tuschkasten", "wasserfarbe"])) return "FAR";
  if (includesAny(text, ["buntpapier", "tonpapier", "papier"])) return "PAP";
  if (includesAny(text, ["knete", "knetmasse"])) return "KNT";
  if (includesAny(text, ["kleber", "leim"])) return "KLB";

  const categoryToken = toSkuToken(input.category).slice(0, 3);
  if (categoryToken.length >= 2) return categoryToken;

  return "ART";
}

export function getFormatCode(value: unknown) {
  const text = normalizeText(value);

  if (!text) return null;

  if (/\ba3\b/.test(text)) return "A3";
  if (/\ba4\b/.test(text)) return "A4";
  if (/\ba5\b/.test(text) && includesAny(text, ["quer", "querformat"])) return "A5Q";
  if (/\ba5\b/.test(text)) return "A5";
  if (/\ba6\b/.test(text)) return "A6";

  const token = toSkuToken(value);
  return token ? token.slice(0, 8) : null;
}

export function getLineatureCode(value: unknown) {
  const text = normalizeText(value);

  if (!text) return null;

  if (/\b8\s*f\b/.test(text) || /\b8f\b/.test(text)) return "L8F";

  const numberMatch = text.match(/\b(\d{1,2})\b/);
  if (!numberMatch) return null;

  return `L${numberMatch[1]}`;
}

export function getColorCodes(value: unknown) {
  const text = normalizeText(value);

  if (!text) return [] as string[];

  const codes: string[] = [];

  if (includesAny(text, ["orange gelb blau gruen rosa"]) || text.includes(",") || includesAny(text, ["mehrfarbig", "farbmix", "sortiert"])) {
    codes.push("MIX");
    return codes;
  }

  if (includesAny(text, ["transparent", "klar", "durchsichtig", "clear"])) codes.push("KLAR");
  else if (includesAny(text, ["hellblau"])) codes.push("HELLBLAU");
  else if (includesAny(text, ["hellgruen"])) codes.push("HELLGRUEN");
  else if (includesAny(text, ["dunkelblau"])) codes.push("DUNKELBLAU");
  else if (includesAny(text, ["weiss", "white"])) codes.push("WEISS");
  else if (includesAny(text, ["schwarz", "black"])) codes.push("SCHWARZ");
  else if (includesAny(text, ["grau", "gray", "grey"])) codes.push("GRAU");
  else if (includesAny(text, ["braun"])) codes.push("BRAUN");
  else if (includesAny(text, ["blau"])) codes.push("BLAU");
  else if (includesAny(text, ["gruen"])) codes.push("GRUEN");
  else if (includesAny(text, ["rot"])) codes.push("ROT");
  else if (includesAny(text, ["gelb"])) codes.push("GELB");
  else if (includesAny(text, ["orange"])) codes.push("ORANGE");
  else if (includesAny(text, ["pink", "rosa"])) codes.push("PINK");
  else if (includesAny(text, ["lila", "violett"])) codes.push("LILA");

  if (includesAny(text, ["gedeckt"])) codes.push("G");
  if (includesAny(text, ["gemustert", "muster"])) codes.push("GM");

  return codes;
}

export function buildProductSkuBase(input: ProductSkuInput) {
  const typeCode = getProductTypeCode(input);
  const formatCode = getFormatCode(input.format);
  const lineatureCode = getLineatureCode(input.lineature);
  const colorCodes = getColorCodes(input.color);

  const parts = ["HS", typeCode];

  if (formatCode) parts.push(formatCode);

  if (typeCode === "HEF" && lineatureCode) {
    parts.push(lineatureCode);
  }

  for (const colorCode of colorCodes) {
    if (colorCode) parts.push(colorCode);
  }

  if (parts.length < 3) {
    const fallback = toSkuToken(input.productName).split("-").filter(Boolean).slice(0, 2);
    parts.push(...fallback);
  }

  return parts
    .map((part) => toSkuToken(part))
    .filter(Boolean)
    .join("-");
}

function getSkuSuffixNumber(sku: string, base: string) {
  const escapedBase = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = sku.match(new RegExp(`^${escapedBase}-(\\d{3,})$`, "i"));

  if (!match) return null;

  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function createUniqueProductSku(params: {
  supabase: SupabaseLike;
  input: ProductSkuInput;
  excludeProductId?: string | null;
}) {
  const base = buildProductSkuBase(params.input) || "HS-ART";
  let query = params.supabase
    .from("school_products")
    .select("sku")
    .ilike("sku", `${base}-%`);

  const result = params.excludeProductId
    ? await query.neq("id", params.excludeProductId).limit(1000)
    : await query.limit(1000);

  const existingSkus = ((result.data || []) as Array<{ sku?: string | null }>)
  .map((row) => String(row.sku || "").trim())
  .filter(Boolean);

  let maxNumber = 0;

  for (const sku of existingSkus) {
    const suffix = getSkuSuffixNumber(sku, base);
    if (suffix !== null && suffix > maxNumber) {
      maxNumber = suffix;
    }
  }

  const nextNumber = maxNumber + 1;
  return `${base}-${String(nextNumber).padStart(3, "0")}`;
}
