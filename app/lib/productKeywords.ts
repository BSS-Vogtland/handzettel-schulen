export type ProductKeywordInput = {
  productName: string;
  productSku?: string | null;
  category?: string | null;
  productType?: string | null;
  format?: string | null;
  color?: string | null;
  lineature?: string | null;
  aliases?: string | string[] | null;
  bookWidthMm?: number | string | null;
  bookHeightMm?: number | string | null;
  bookSizeNote?: string | null;
};

export type ProductKeywordResult = {
  aliases: string[];
  matchKeywords: string[];
};

export function cleanKeywordText(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeKeywordText(value: unknown) {
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

export function toOptionalKeywordInteger(value: unknown): number | null {
  const raw = String(value ?? "").trim();

  if (!raw) return null;

  const cleaned = raw.replace(/[^\d]/g, "");

  if (!cleaned) return null;

  const parsed = Number(cleaned);

  if (!Number.isFinite(parsed)) return null;

  return Math.max(0, Math.floor(parsed));
}

export function splitKeywordWords(value: unknown) {
  return normalizeKeywordText(value)
    .split(" ")
    .filter((word) => word.length >= 2)
    .slice(0, 30);
}

export function splitManualAliases(value: string | string[] | null | undefined) {
  if (Array.isArray(value)) {
    return value
      .map((alias) => cleanKeywordText(alias))
      .filter((alias) => alias.length >= 2);
  }

  return String(value ?? "")
    .split(/[\n,;]+/g)
    .map((alias) => cleanKeywordText(alias))
    .filter((alias) => alias.length >= 2);
}

function dedupeClean(values: unknown[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const cleaned = cleanKeywordText(value);

    if (cleaned.length < 2) continue;

    const dedupeKey = normalizeKeywordText(cleaned);

    if (!dedupeKey || seen.has(dedupeKey)) continue;

    seen.add(dedupeKey);
    result.push(cleaned);
  }

  return result;
}

export function buildBookSizeAliases(input: {
  productName: string;
  bookWidthMm: number | null;
  bookHeightMm: number | null;
  bookSizeNote?: string | null;
}) {
  const aliases: string[] = [];

  if (!input.bookWidthMm || !input.bookHeightMm) {
    return aliases;
  }

  const width = String(input.bookWidthMm);
  const height = String(input.bookHeightMm);
  const sizeLabel = `${width} x ${height} mm`;

  aliases.push(
    sizeLabel,
    `${width} x ${height}`,
    `${width} ${height}`,
    `${width}x${height}`,
    `Buchmaß ${sizeLabel}`,
    `Buchmass ${sizeLabel}`,
    `Buchumschlag ${sizeLabel}`,
    `Buchhülle ${sizeLabel}`,
    `Buchhuelle ${sizeLabel}`,
    `Umschlag ${sizeLabel}`,
    `${input.productName} ${sizeLabel}`,
    `${input.productName} ${width} x ${height}`,
    `${input.productName} ${width}x${height}`
  );

  if (input.bookSizeNote) {
    aliases.push(
      `${input.productName} ${input.bookSizeNote}`,
      `${sizeLabel} ${input.bookSizeNote}`
    );
  }

  return aliases;
}

export function buildProductAliases(input: ProductKeywordInput) {
  const productName = cleanKeywordText(input.productName);
  const productSku = cleanKeywordText(input.productSku);
  const category = cleanKeywordText(input.category);
  const productType = cleanKeywordText(input.productType);
  const format = cleanKeywordText(input.format);
  const color = cleanKeywordText(input.color);
  const lineature = cleanKeywordText(input.lineature);
  const bookSizeNote = cleanKeywordText(input.bookSizeNote);
  const bookWidthMm = toOptionalKeywordInteger(input.bookWidthMm);
  const bookHeightMm = toOptionalKeywordInteger(input.bookHeightMm);

  const manualAliases = splitManualAliases(input.aliases);

  const generatedAliases = dedupeClean([
    productName,
    productSku,
    `${productName} ${productSku}`,

    `${productName} ${category}`,
    `${productName} ${productType}`,
    `${productName} ${format}`,
    `${productName} ${color}`,
    `${productName} ${lineature}`,

    `${productName} ${format} ${color}`,
    `${productName} ${format} ${lineature}`,
    `${productName} ${color} ${lineature}`,
    `${productName} ${format} ${color} ${lineature}`,

    `${productType} ${format}`,
    `${productType} ${color}`,
    `${productType} ${lineature}`,
    `${productType} ${format} ${color}`,
    `${productType} ${format} ${lineature}`,
    `${productType} ${color} ${lineature}`,
    `${productType} ${format} ${color} ${lineature}`,

    `${category} ${productType}`,
    `${category} ${format}`,
    `${category} ${color}`,
    `${category} ${lineature}`,
    `${category} ${format} ${color}`,
    `${category} ${format} ${lineature}`,
    `${category} ${format} ${color} ${lineature}`,

    ...buildBookSizeAliases({
      productName,
      bookWidthMm,
      bookHeightMm,
      bookSizeNote,
    }),
  ]);

  return dedupeClean([...manualAliases, ...generatedAliases]);
}

export function buildProductMatchKeywords(input: ProductKeywordInput) {
  const aliases = buildProductAliases(input);
  const bookWidthMm = toOptionalKeywordInteger(input.bookWidthMm);
  const bookHeightMm = toOptionalKeywordInteger(input.bookHeightMm);

  return dedupeClean([
    ...splitKeywordWords(input.productName),
    ...splitKeywordWords(input.productSku),
    ...splitKeywordWords(input.category),
    ...splitKeywordWords(input.productType),
    ...splitKeywordWords(input.format),
    ...splitKeywordWords(input.color),
    ...splitKeywordWords(input.lineature),
    ...splitKeywordWords(input.bookWidthMm),
    ...splitKeywordWords(input.bookHeightMm),
    ...splitKeywordWords(input.bookSizeNote),
    ...aliases.flatMap((alias) => splitKeywordWords(alias)),
    bookWidthMm && bookHeightMm ? `${bookWidthMm}x${bookHeightMm}` : "",
  ]);
}

export function buildProductKeywordData(
  input: ProductKeywordInput
): ProductKeywordResult {
  const aliases = buildProductAliases(input);
  const matchKeywords = buildProductMatchKeywords({
    ...input,
    aliases,
  });

  return {
    aliases,
    matchKeywords,
  };
}