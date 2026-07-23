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
    .replace(/\u00e4/g, "ae")
    .replace(/\u00f6/g, "oe")
    .replace(/\u00fc/g, "ue")
    .replace(/\u00df/g, "ss")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
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


type ProductAliasCore =
  | "wachsmalstifte"
  | "filzstifte"
  | "buntstifte"
  | "pinsel"
  | "tuschkasten"
  | "mischpalette"
  | "federmappe"
  | "mappe"
  | "heft"
  | "schere"
  | "klebestift"
  | "lineal"
  | "stehsammler"
  | null;

const BLOCKED_ALIAS_TERMS_BY_CORE: Record<Exclude<ProductAliasCore, null>, string[]> = {
  wachsmalstifte: [
    "filzstift",
    "filzstifte",
    "buntstift",
    "buntstifte",
    "pinsel",
    "tuschkasten",
    "farbkasten",
    "schulmalfarben",
    "mischpalette",
  ],
  filzstifte: [
    "wachsmalstift",
    "wachsmalstifte",
    "wachsmalkreide",
    "buntstift",
    "buntstifte",
    "pinsel",
    "tuschkasten",
    "farbkasten",
    "schulmalfarben",
    "mischpalette",
  ],
  buntstifte: [
    "wachsmalstift",
    "wachsmalstifte",
    "wachsmalkreide",
    "filzstift",
    "filzstifte",
    "pinsel",
    "tuschkasten",
    "farbkasten",
    "schulmalfarben",
    "mischpalette",
  ],
  pinsel: [
    "wachsmalstift",
    "wachsmalstifte",
    "wachsmalkreide",
    "filzstift",
    "filzstifte",
    "buntstift",
    "buntstifte",
    "tuschkasten",
    "farbkasten",
    "schulmalfarben",
    "mischpalette",
  ],
  tuschkasten: [
    "wachsmalstift",
    "wachsmalstifte",
    "wachsmalkreide",
    "filzstift",
    "filzstifte",
    "buntstift",
    "buntstifte",
    "pinsel",
    "mischpalette",
  ],
  mischpalette: [
    "wachsmalstift",
    "wachsmalstifte",
    "wachsmalkreide",
    "filzstift",
    "filzstifte",
    "buntstift",
    "buntstifte",
    "pinsel",
    "tuschkasten",
    "farbkasten",
    "schulmalfarben",
  ],
  federmappe: [
    "sammelmappe",
    "postmappe",
    "kunstmappe",
    "schnellhefter",
    "papphefter",
    "hefter",
    "schreibheft",
    "hausaufgabenheft",
  ],
  mappe: [
    "federmappe",
    "federtasche",
    "schlampermappe",
    "schreibheft",
    "hausaufgabenheft",
    "lineatur",
  ],
  heft: [
    "schnellhefter",
    "papphefter",
    "federmappe",
    "federtasche",
    "sammelmappe",
    "postmappe",
    "kunstmappe",
  ],
  schere: [
    "kleber",
    "klebestift",
    "uhu",
    "pinsel",
    "wachsmalstift",
    "tuschkasten",
  ],
  klebestift: [
    "schere",
    "bastelschere",
    "pinsel",
    "wachsmalstift",
    "tuschkasten",
  ],
  lineal: [
    "geodreieck",
    "zirkel",
    "winkelmesser",
  ],
  stehsammler: [
    "schulranzen",
    "schulrucksack",
    "ranzen",
    "rucksack",
    "federmappe",
    "turnbeutel",
  ],
};

function detectProductAliasCore(input: ProductKeywordInput): ProductAliasCore {
  const productName = normalizeKeywordText(input.productName);
  const productType = normalizeKeywordText(input.productType);
  const category = normalizeKeywordText(input.category);
  const combined = [productType, productName, category].filter(Boolean).join(" ");

  if (
    combined.includes("wachsmalstift") ||
    combined.includes("wachsmalkreide") ||
    combined.includes("malkreide")
  ) {
    return "wachsmalstifte";
  }

  if (combined.includes("filzstift")) return "filzstifte";
  if (combined.includes("buntstift")) return "buntstifte";

  if (
    combined.includes("borstenpinsel") ||
    combined.includes("haarpinsel") ||
    combined.includes("pinsel")
  ) {
    return "pinsel";
  }

  if (
    combined.includes("tuschkasten") ||
    combined.includes("farbkasten") ||
    combined.includes("schulmalfarben")
  ) {
    return "tuschkasten";
  }

  if (combined.includes("mischpalette")) return "mischpalette";

  if (
    combined.includes("federmappe") ||
    combined.includes("federtasche") ||
    combined.includes("schlampermappe")
  ) {
    return "federmappe";
  }

  if (
    combined.includes("schnellhefter") ||
    combined.includes("papphefter") ||
    combined.includes("sammelmappe") ||
    combined.includes("postmappe") ||
    combined.includes("kunstmappe") ||
    combined.includes("mappe") ||
    combined.includes("hefter")
  ) {
    return "mappe";
  }

  if (
    combined.includes("schreibheft") ||
    combined.includes("hausaufgabenheft") ||
    combined.includes("vokabelheft")
  ) {
    return "heft";
  }

  if (combined.includes("bastelschere") || combined.includes("schere")) return "schere";
  if (combined.includes("klebestift") || combined.includes("kleber stift")) return "klebestift";
  if (combined.includes("lineal")) return "lineal";
  if (combined.includes("stehsammler")) return "stehsammler";

  return null;
}

function isBlockedAliasForCore(alias: string, core: ProductAliasCore) {
  if (!core) return false;

  const normalizedAlias = normalizeKeywordText(alias);
  const blockedTerms = BLOCKED_ALIAS_TERMS_BY_CORE[core] || [];

  return blockedTerms.some((term) =>
    normalizedAlias.includes(normalizeKeywordText(term))
  );
}

function isSkuAlias(alias: string, input: ProductKeywordInput) {
  const normalizedAlias = normalizeKeywordText(alias);
  const normalizedSku = normalizeKeywordText(input.productSku);

  return Boolean(normalizedSku && normalizedAlias.includes(normalizedSku));
}

function isGenericGeneratedAliasForInput(alias: string, input: ProductKeywordInput) {
  const normalizedAlias = normalizeKeywordText(alias);

  if (!normalizedAlias) return true;
  if (isSkuAlias(alias, input)) return false;

  const productName = normalizeKeywordText(input.productName);
  const productType = normalizeKeywordText(input.productType);
  const category = normalizeKeywordText(input.category);
  const format = normalizeKeywordText(input.format);
  const color = normalizeKeywordText(input.color);
  const lineature = normalizeKeywordText(input.lineature);

  const genericSingleValues = new Set(
    [category, format, color, lineature]
      .filter(Boolean)
  );

  if (genericSingleValues.has(normalizedAlias)) {
    return true;
  }

  if (/^\d{1,2} farben$/.test(normalizedAlias)) {
    return true;
  }

  const genericCombinations = [
    [category, color],
    [category, format],
    [category, lineature],
    [format, color],
    [format, lineature],
    [color, lineature],
  ]
    .filter((parts) => parts.every(Boolean))
    .map((parts) => parts.join(" "));

  if (genericCombinations.includes(normalizedAlias)) {
    return true;
  }

  if (
    category &&
    normalizedAlias.startsWith(category + " ") &&
    productType &&
    !normalizedAlias.includes(productType) &&
    !normalizedAlias.includes(productName)
  ) {
    return true;
  }

  return false;
}



function filterUnsafeAliasesForInput(input: ProductKeywordInput, aliases: string[]) {
  const core = detectProductAliasCore(input);

  return aliases.filter((alias) => {
    if (isBlockedAliasForCore(alias, core)) return false;
    if (isGenericGeneratedAliasForInput(alias, input)) return false;

    return true;
  });
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

  return filterUnsafeAliasesForInput(
    input,
    dedupeClean([...manualAliases, ...generatedAliases])
  );
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
  ]).filter((keyword) => !isBlockedAliasForCore(keyword, detectProductAliasCore(input)));
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