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

function normalizeForCompare(value: unknown) {
  return normalizeGermanText(value)
    .toLowerCase()
    .replace(/&/g, " und ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function uniqueList(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const cleaned = cleanText(value);

    if (!cleaned) continue;

    const key = normalizeForCompare(cleaned);

    if (!key || seen.has(key)) continue;

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

function containsToken(text: unknown, token: unknown) {
  const normalizedText = normalizeForCompare(text);
  const normalizedToken = normalizeForCompare(token);

  if (!normalizedText || !normalizedToken) return false;

  return ` ${normalizedText} `.includes(` ${normalizedToken} `);
}

function productNameAlreadyContainsValue(productName: string, value: unknown) {
  const cleanedValue = cleanText(value);

  if (!cleanedValue) return true;

  return containsToken(productName, cleanedValue);
}

function normalizeLineature(value: unknown) {
  return cleanText(value)
    .replace(/^lineatur\s*/i, "")
    .replace(/^lin\.\s*/i, "")
    .replace(/^lin\s*/i, "")
    .replace(/^l\s*/i, "")
    .trim();
}

function productNameAlreadyContainsLineature(productName: string, value: unknown) {
  const lineature = normalizeLineature(value);

  if (!lineature) return true;

  const normalizedName = normalizeForCompare(productName);
  const normalizedLineature = normalizeForCompare(lineature);

  if (!normalizedName || !normalizedLineature) return false;

  return (
    normalizedName.includes(`lineatur ${normalizedLineature}`) ||
    normalizedName.includes(`lin ${normalizedLineature}`) ||
    normalizedName.includes(`l ${normalizedLineature}`)
  );
}

function productNameAlreadyContainsBookMeasure(
  productName: string,
  width: unknown,
  height: unknown
) {
  const cleanedWidth = cleanText(width);
  const cleanedHeight = cleanText(height);

  if (!cleanedWidth || !cleanedHeight) return true;

  const normalizedName = normalizeForCompare(productName);

  return normalizedName.includes(`${cleanedWidth} ${cleanedHeight}`);
}

function buildDetails(input: ProductSeoInput) {
  const productName = cleanText(input.productName);
  const details: string[] = [];

  const format = cleanText(input.format).toUpperCase();
  const color = cleanText(input.color);
  const lineature = normalizeLineature(input.lineature);

  if (format && !productNameAlreadyContainsValue(productName, format)) {
    details.push(format);
  }

  if (color && !productNameAlreadyContainsValue(productName, color)) {
    details.push(color);
  }

  if (
    lineature &&
    !productNameAlreadyContainsLineature(productName, lineature)
  ) {
    details.push(`Lineatur ${lineature}`);
  }

  const width = cleanText(input.bookWidthMm);
  const height = cleanText(input.bookHeightMm);

  if (
    width &&
    height &&
    !productNameAlreadyContainsBookMeasure(productName, width, height)
  ) {
    details.push(`${width} x ${height} mm`);
  }

  const note = cleanText(input.bookSizeNote);

  if (note && !normalizeForCompare(productName).includes(normalizeForCompare(note))) {
    details.push(note);
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

export function buildReadableProductSeoName(input: ProductSeoInput) {
  const productName = cleanText(input.productName) || "Schulmaterial";
  const details = buildDetails(input);
  const detailText = details.length > 0 ? ` ${details.join(" ")}` : "";

  return cleanText(`${productName}${detailText}`);
}

export function generateProductSeoFields(input: ProductSeoInput): ProductSeoFields {
  const productName = cleanText(input.productName) || "Schulmaterial";
  const readableName = buildReadableProductSeoName(input);
  const category = cleanText(input.category) || "Schulmaterial";
  const productType = cleanText(input.productType);
  const useCase = inferUseCase(input);

  const slugBase =
    slugifyProductText(readableName || productName) || "schulmaterial";

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
    input.format ? `${productName} ${cleanText(input.format).toUpperCase()}` : "",
    input.color ? `${productName} ${cleanText(input.color)}` : "",
    input.lineature
      ? `${productName} Lineatur ${normalizeLineature(input.lineature)}`
      : "",
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