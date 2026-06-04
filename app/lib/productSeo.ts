export type ProductSeoInput = {
  productName: string;
  sku?: string | null;
  category?: string | null;
  productType?: string | null;
  format?: string | null;
  color?: string | null;
  lineature?: string | null;
  bookWidthMm?: string | number | null;
  bookHeightMm?: string | number | null;
  bookSizeNote?: string | null;
};

export type ProductSeoFields = {
  seo_slug: string;
  seo_title: string;
  seo_description: string;
  seo_keywords: string[];
  image_alt_text: string;
  image_title_text: string;
};

function normalizeGermanText(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/Ä/g, "Ae")
    .replace(/Ö/g, "Oe")
    .replace(/Ü/g, "Ue")
    .replace(/ß/g, "ss");
}

function cleanText(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

export function slugifyProductText(value: unknown) {
  return normalizeGermanText(value)
    .toLowerCase()
    .replace(/&/g, " und ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90);
}

function compactList(values: Array<unknown>) {
  return values
    .map((value) => cleanText(value))
    .filter((value) => value.length > 0);
}

function uniqueList(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const cleaned = cleanText(value);

    if (!cleaned) continue;

    const key = cleaned.toLowerCase();

    if (seen.has(key)) continue;

    seen.add(key);
    result.push(cleaned);
  }

  return result;
}

function limitText(value: string, maxLength: number) {
  const cleaned = cleanText(value);

  if (cleaned.length <= maxLength) return cleaned;

  return cleaned.slice(0, maxLength - 1).trimEnd() + "…";
}

function buildDetails(input: ProductSeoInput) {
  const details: string[] = [];

  if (input.format) details.push(String(input.format).toUpperCase());
  if (input.color) details.push(cleanText(input.color));

  if (input.lineature) {
    details.push(`Lineatur ${cleanText(input.lineature)}`);
  }

  const width = cleanText(input.bookWidthMm);
  const height = cleanText(input.bookHeightMm);

  if (width && height) {
    details.push(`${width} x ${height} mm`);
  }

  if (input.bookSizeNote) {
    details.push(cleanText(input.bookSizeNote));
  }

  return uniqueList(details);
}

function inferUseCase(input: ProductSeoInput) {
  const text = [
    input.productName,
    input.category,
    input.productType,
    input.format,
    input.color,
    input.lineature,
  ]
    .join(" ")
    .toLowerCase();

  if (text.includes("heft")) return "für Schule, Unterricht und Schulmateriallisten";
  if (text.includes("umschlag")) return "für Hefte, Bücher und Schulmateriallisten";
  if (text.includes("schnellhefter")) return "für Schule, Fächer und Unterlagen";
  if (text.includes("mappe")) return "für Kunst, Schule und Unterlagen";
  if (text.includes("stift")) return "für Federtasche, Schule und Unterricht";
  if (text.includes("spitzer")) return "für Federtasche, Schule und Schreibtisch";
  if (text.includes("radier")) return "für Federtasche, Schule und Schreibbedarf";
  if (text.includes("kleber")) return "für Basteln, Schule und Unterricht";
  if (text.includes("schere")) return "für Basteln, Schule und Unterricht";
  if (text.includes("block")) return "für Schule, Unterricht und Notizen";
  if (text.includes("papier")) return "für Kunst, Basteln und Schule";

  return "für Schule, Unterricht und Schulmateriallisten";
}

export function generateProductSeoFields(input: ProductSeoInput): ProductSeoFields {
  const productName = cleanText(input.productName) || "Schulmaterial";
  const category = cleanText(input.category) || "Schulmaterial";
  const productType = cleanText(input.productType);
  const details = buildDetails(input);
  const detailText = details.length > 0 ? ` ${details.join(" ")}` : "";
  const readableName = cleanText(`${productName}${detailText}`);
  const useCase = inferUseCase(input);

  const slugBase = slugifyProductText(readableName || productName) || "schulmaterial";

  const seoTitle = limitText(
    `${readableName} online finden | Handzettel-Schulen.de`,
    68
  );

  const seoDescription = limitText(
    `${readableName} ${useCase}. Schnell finden, vormerken und bequem im Schulmaterial-Shop von Handzettel-Schulen.de nachkaufen.`,
    155
  );

  const keywordCandidates = [
    productName,
    readableName,
    category,
    productType,
    input.format ? `${productName} ${input.format}` : "",
    input.color ? `${productName} ${input.color}` : "",
    input.lineature ? `${productName} Lineatur ${input.lineature}` : "",
    "Schulmaterial",
    "Schulbedarf",
    "Schulmaterialliste",
    "Handzettel-Schulen.de",
  ];

  const seoKeywords = uniqueList(
    keywordCandidates
      .map((value) => cleanText(value))
      .filter((value) => value.length >= 2)
  ).slice(0, 12);

  const imageAltText = limitText(
    `${readableName} als Schulmaterial für Schule und Unterricht`,
    125
  );

  const imageTitleText = limitText(
    `${readableName} – Handzettel-Schulen.de`,
    90
  );

  return {
    seo_slug: slugBase,
    seo_title: seoTitle,
    seo_description: seoDescription,
    seo_keywords: seoKeywords,
    image_alt_text: imageAltText,
    image_title_text: imageTitleText,
  };
}