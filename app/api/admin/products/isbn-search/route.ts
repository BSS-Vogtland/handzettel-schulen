import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

import { mergeIsbnBookSources } from "@/lib/isbn/merge";
import { resolveOptionalIsbnSources } from "@/lib/isbn/providerRegistry";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type GoogleIndustryIdentifier = {
  type?: string;
  identifier?: string;
};

type GoogleVolumeInfo = {
  title?: string;
  subtitle?: string;
  authors?: string[];
  publisher?: string;
  publishedDate?: string;
  description?: string;
  industryIdentifiers?: GoogleIndustryIdentifier[];
  pageCount?: number;
  categories?: string[];
  language?: string;
  imageLinks?: {
    smallThumbnail?: string;
    thumbnail?: string;
    small?: string;
    medium?: string;
    large?: string;
    extraLarge?: string;
  };
  infoLink?: string;
  canonicalVolumeLink?: string;
};

type GoogleSaleInfo = {
  country?: string;
  saleability?: string;
  isEbook?: boolean;
  listPrice?: {
    amount?: number;
    currencyCode?: string;
  };
  retailPrice?: {
    amount?: number;
    currencyCode?: string;
  };
};

type GoogleBooksResponse = {
  totalItems?: number;
  items?: Array<{
    id?: string;
    volumeInfo?: GoogleVolumeInfo;
    saleInfo?: GoogleSaleInfo;
  }>;
};

type OpenLibraryAuthor = {
  name?: string;
};

type OpenLibraryPublisher = {
  name?: string;
};

type OpenLibrarySubject = {
  name?: string;
};

type OpenLibraryIdentifierMap = {
  isbn_10?: string[];
  isbn_13?: string[];
  openlibrary?: string[];
  [key: string]: string[] | undefined;
};

type OpenLibraryBook = {
  title?: string;
  subtitle?: string;
  authors?: OpenLibraryAuthor[];
  publishers?: OpenLibraryPublisher[];
  publish_date?: string;
  number_of_pages?: number;
  subjects?: OpenLibrarySubject[];
  identifiers?: OpenLibraryIdentifierMap;
  cover?: {
    small?: string;
    medium?: string;
    large?: string;
  };
  url?: string;
};

type ExistingProductRow = {
  id: string;
  name?: string | null;
  product_name?: string | null;
  title?: string | null;
  sku?: string | null;
  product_sku?: string | null;
  ean?: string | null;
  image_url?: string | null;
  image_styled_url?: string | null;
};

type NormalizedBookSource = {
  source: string;
  sourceUrl?: string | null;
  sourceId?: string | null;
  title?: string | null;
  subtitle?: string | null;
  authors?: string[];
  publisher?: string | null;
  publishedDate?: string | null;
  edition?: string | null;
  description?: string | null;
  pageCount?: number | null;
  language?: string | null;
  subjects?: string[];
  isbn10?: string | null;
  isbn13?: string | null;
  coverUrl?: string | null;
  recommendedPrice?: number | null;
  priceCurrency?: string | null;
  priceSource?: string | null;
  coverSource?: string | null;
  coverSourceUrl?: string | null;
  coverCanBeImported?: boolean | null;
  coverDeliveryMode?: "download" | "external" | "manual" | null;
  coverUsageStatus?:
    "public_domain" | "cc0" | "api_terms" | "manual_review" | null;
  coverLicense?: string | null;
  coverLicenseUrl?: string | null;
  coverAttribution?: string | null;
  coverRightsNote?: string | null;
};

function cleanString(value: unknown) {
  const cleaned = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned.length > 0 ? cleaned : null;
}

function normalizeIsbn(value: unknown) {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[^0-9X]/g, "");
}

function decodeXml(value: unknown) {
  return String(value ?? "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x([0-9a-fA-F]+);/g, (_match, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#([0-9]+);/g, (_match, decimal: string) =>
      String.fromCodePoint(Number.parseInt(decimal, 10)),
    );
}

function stripXml(value: unknown) {
  return cleanString(decodeXml(String(value ?? "").replace(/<[^>]*>/g, " ")));
}

function extractMetaContent(
  html: string,
  attribute: "property" | "name",
  key: string,
) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const patterns = [
    new RegExp(
      `<meta\\b[^>]*${attribute}=["']${escapedKey}["'][^>]*content=["']([^"']+)["'][^>]*>`,
      "i",
    ),
    new RegExp(
      `<meta\\b[^>]*content=["']([^"']+)["'][^>]*${attribute}=["']${escapedKey}["'][^>]*>`,
      "i",
    ),
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(html);

    if (match?.[1]) {
      return cleanString(decodeXml(match[1]));
    }
  }

  return null;
}

function extractJsonLdBlocks(html: string) {
  const blocks: unknown[] = [];

  const expression =
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  for (const match of html.matchAll(expression)) {
    const raw = String(match[1] || "").trim();

    if (!raw) {
      continue;
    }

    try {
      blocks.push(JSON.parse(raw));
    } catch {
      // Ungültige oder dynamisch ergänzte JSON-LD-Blöcke ignorieren.
    }
  }

  return blocks;
}

function flattenJsonLd(value: unknown): Record<string, unknown>[] {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenJsonLd(item));
  }

  if (typeof value !== "object") {
    return [];
  }

  const record = value as Record<string, unknown>;
  const result = [record];

  if (record["@graph"]) {
    result.push(...flattenJsonLd(record["@graph"]));
  }

  if (record.mainEntity) {
    result.push(...flattenJsonLd(record.mainEntity));
  }

  return result;
}

function getJsonLdType(record: Record<string, unknown>) {
  const rawType = record["@type"];

  if (Array.isArray(rawType)) {
    return rawType.map((value) => String(value).toLowerCase());
  }

  return rawType ? [String(rawType).toLowerCase()] : [];
}

function getJsonLdString(value: unknown): string | null {
  if (typeof value === "string") {
    return cleanString(value);
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;

    return (
      cleanString(record.url) ||
      cleanString(record.contentUrl) ||
      cleanString(record.name)
    );
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const resolved = getJsonLdString(item);

      if (resolved) {
        return resolved;
      }
    }
  }

  return null;
}

function parsePriceNumber(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  const cleaned = String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[^\d,.-]/g, "")
    .trim();

  if (!cleaned) {
    return null;
  }

  let normalized = cleaned;

  if (cleaned.includes(",") && cleaned.includes(".")) {
    if (cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")) {
      normalized = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = cleaned.replace(/,/g, "");
    }
  } else if (cleaned.includes(",")) {
    normalized = cleaned.replace(",", ".");
  }

  const parsed = Number(normalized);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function resolveAbsoluteUrl(value: unknown, baseUrl: string) {
  const cleaned = cleanString(value);

  if (!cleaned) {
    return null;
  }

  try {
    return forceHttps(new URL(cleaned, baseUrl).toString());
  } catch {
    return forceHttps(cleaned);
  }
}

function extractProductOffers(record: Record<string, unknown>) {
  const rawOffers = record.offers;
  const offers = Array.isArray(rawOffers)
    ? rawOffers
    : rawOffers && typeof rawOffers === "object"
      ? [rawOffers]
      : [];

  for (const offer of offers) {
    if (!offer || typeof offer !== "object") {
      continue;
    }

    const offerRecord = offer as Record<string, unknown>;

    const price =
      parsePriceNumber(offerRecord.price) ||
      parsePriceNumber(
        (offerRecord.priceSpecification as Record<string, unknown> | undefined)
          ?.price,
      );

    if (!price) {
      continue;
    }

    const currency =
      cleanString(offerRecord.priceCurrency) ||
      cleanString(
        (offerRecord.priceSpecification as Record<string, unknown> | undefined)
          ?.priceCurrency,
      ) ||
      "EUR";

    return {
      price,
      currency,
    };
  }

  return null;
}

function findCornelsenProductUrl(html: string, isbn: string) {
  const normalizedIsbn = normalizeIsbn(isbn);

  const hrefExpression = /href=["']([^"']+)["']/gi;

  for (const match of html.matchAll(hrefExpression)) {
    const href = decodeXml(match[1]);
    const hrefIsbn = normalizeIsbn(href);

    if (href.includes("/produkte/") && hrefIsbn.includes(normalizedIsbn)) {
      return resolveAbsoluteUrl(href, "https://www.cornelsen.de");
    }
  }

  const canonicalExpression =
    /https:\/\/www\.cornelsen\.de\/produkte\/[^"'<>\\\s]+/gi;

  for (const match of html.matchAll(canonicalExpression)) {
    const candidate = decodeXml(match[0]);

    if (normalizeIsbn(candidate).includes(normalizedIsbn)) {
      return forceHttps(candidate);
    }
  }

  return null;
}

function parseCornelsenProduct(
  html: string,
  pageUrl: string,
  isbn: string,
): NormalizedBookSource | null {
  const jsonLdRecords = extractJsonLdBlocks(html).flatMap((block) =>
    flattenJsonLd(block),
  );

  const productRecord =
    jsonLdRecords.find((record) => {
      const types = getJsonLdType(record);

      return (
        types.includes("product") ||
        types.includes("book") ||
        normalizeIsbn(record.isbn).includes(normalizeIsbn(isbn)) ||
        normalizeIsbn(record.sku).includes(normalizeIsbn(isbn))
      );
    }) || null;

  const title =
    cleanString(productRecord?.name) ||
    extractMetaContent(html, "property", "og:title");

  const image =
    getJsonLdString(productRecord?.image) ||
    extractMetaContent(html, "property", "og:image") ||
    extractMetaContent(html, "name", "twitter:image");

  const description =
    cleanString(productRecord?.description) ||
    extractMetaContent(html, "property", "og:description") ||
    extractMetaContent(html, "name", "description");

  const offer = productRecord ? extractProductOffers(productRecord) : null;

  let fallbackPrice: number | null = null;

  if (!offer) {
    const pricePatterns = [
      /(?:Preis|Verkaufspreis|EUR)\s*[:=]?\s*["']?(\d{1,4}[,.]\d{2})/i,
      /(\d{1,4}[,.]\d{2})\s*(?:EUR|€)/i,
      /"price"\s*:\s*"?(\d{1,4}(?:[,.]\d{1,2})?)/i,
    ];

    for (const pattern of pricePatterns) {
      const match = pattern.exec(html);
      const candidate = parsePriceNumber(match?.[1]);

      if (candidate) {
        fallbackPrice = candidate;
        break;
      }
    }
  }

  if (!title && !image && !offer && !fallbackPrice) {
    return null;
  }

  return {
    source: "Cornelsen Verlag",
    sourceUrl: pageUrl,
    sourceId: isbn,
    title,
    subtitle: null,
    authors: [],
    publisher: "Cornelsen",
    publishedDate: null,
    edition: null,
    description,
    pageCount: null,
    language: "de",
    subjects: [],
    isbn10: isbn.length === 10 ? isbn : null,
    isbn13: isbn.length === 13 ? isbn : null,
    coverUrl: resolveAbsoluteUrl(image, pageUrl),
    recommendedPrice: null,
    priceCurrency: null,
    priceSource: null,
    coverSource: image ? "Cornelsen Verlag" : null,
    coverSourceUrl: image ? pageUrl : null,
    coverCanBeImported: false,
    coverDeliveryMode: image ? "manual" : null,
    coverUsageStatus: image ? "manual_review" : null,
    coverLicense: null,
    coverLicenseUrl: null,
    coverAttribution: image ? "Cornelsen Verlag" : null,
    coverRightsNote: image
      ? "Das Bild stammt von der offiziellen Verlagsseite, wird ohne ausdrückliche Nutzungserlaubnis aber nicht automatisch übernommen."
      : null,
  };
}

function isValidIsbn10(isbn: string) {
  if (!/^\d{9}[\dX]$/.test(isbn)) {
    return false;
  }

  let sum = 0;

  for (let index = 0; index < 10; index += 1) {
    const character = isbn[index];
    const digit = character === "X" ? 10 : Number(character);

    sum += digit * (10 - index);
  }

  return sum % 11 === 0;
}

function isValidIsbn13(isbn: string) {
  if (!/^\d{13}$/.test(isbn)) {
    return false;
  }

  const sum = isbn
    .slice(0, 12)
    .split("")
    .reduce((total, character, index) => {
      const digit = Number(character);
      return total + digit * (index % 2 === 0 ? 1 : 3);
    }, 0);

  const checkDigit = (10 - (sum % 10)) % 10;

  return checkDigit === Number(isbn[12]);
}

function validateIsbn(isbn: string) {
  if (isbn.length === 10) {
    return isValidIsbn10(isbn);
  }

  if (isbn.length === 13) {
    return isValidIsbn13(isbn);
  }

  return false;
}

function convertIsbn10To13(isbn10: string) {
  if (!isValidIsbn10(isbn10)) {
    return null;
  }

  const base = `978${isbn10.slice(0, 9)}`;

  const sum = base.split("").reduce((total, character, index) => {
    const digit = Number(character);
    return total + digit * (index % 2 === 0 ? 1 : 3);
  }, 0);

  const checkDigit = (10 - (sum % 10)) % 10;

  return `${base}${checkDigit}`;
}

function forceHttps(value: unknown) {
  const url = cleanString(value);

  if (!url) {
    return null;
  }

  if (url.startsWith("http://")) {
    return `https://${url.slice("http://".length)}`;
  }

  return url;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const cleaned = cleanString(value);

    if (!cleaned) {
      continue;
    }

    const key = cleaned.toLocaleLowerCase("de-DE");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(cleaned);
  }

  return result;
}

function getGoogleIdentifier(
  identifiers: GoogleIndustryIdentifier[] | undefined,
  type: string,
) {
  return (
    identifiers?.find((identifier) => identifier.type === type)?.identifier ||
    null
  );
}

function getProductName(product: ExistingProductRow) {
  return (
    cleanString(product.name) ||
    cleanString(product.product_name) ||
    cleanString(product.title) ||
    "Unbenanntes Produkt"
  );
}

function getProductSku(product: ExistingProductRow) {
  return cleanString(product.sku) || cleanString(product.product_sku);
}

function cleanMarcValue(value: unknown) {
  return cleanString(
    String(value ?? "")
      .replace(/\s*[\/:;,]\s*$/g, "")
      .replace(/^\s*[\/:;,]\s*/g, ""),
  );
}

function extractMarcDataFields(xml: string, tag: string) {
  const results: string[] = [];

  const expression = new RegExp(
    `<(?:marc:)?datafield\\b[^>]*\\btag=["']${tag}["'][^>]*>([\\s\\S]*?)<\\/(?:marc:)?datafield>`,
    "gi",
  );

  for (const match of xml.matchAll(expression)) {
    results.push(match[1]);
  }

  return results;
}

function extractMarcControlField(xml: string, tag: string) {
  const expression = new RegExp(
    `<(?:marc:)?controlfield\\b[^>]*\\btag=["']${tag}["'][^>]*>([\\s\\S]*?)<\\/(?:marc:)?controlfield>`,
    "i",
  );

  const match = expression.exec(xml);

  return match ? cleanMarcValue(stripXml(match[1])) : null;
}

function extractMarcSubfields(fieldXml: string, code: string) {
  const values: string[] = [];

  const expression = new RegExp(
    `<(?:marc:)?subfield\\b[^>]*\\bcode=["']${code}["'][^>]*>([\\s\\S]*?)<\\/(?:marc:)?subfield>`,
    "gi",
  );

  for (const match of fieldXml.matchAll(expression)) {
    const value = cleanMarcValue(stripXml(match[1]));

    if (value) {
      values.push(value);
    }
  }

  return values;
}

function firstMarcSubfield(xml: string, tag: string, codes: string[]) {
  const fields = extractMarcDataFields(xml, tag);

  for (const field of fields) {
    for (const code of codes) {
      const value = extractMarcSubfields(field, code)[0];

      if (value) {
        return value;
      }
    }
  }

  return null;
}

function allMarcSubfields(xml: string, tags: string[], codes: string[]) {
  const values: string[] = [];

  for (const tag of tags) {
    const fields = extractMarcDataFields(xml, tag);

    for (const field of fields) {
      for (const code of codes) {
        values.push(...extractMarcSubfields(field, code));
      }
    }
  }

  return uniqueStrings(values);
}

function parsePositiveInteger(value: unknown) {
  const match = String(value ?? "").match(/\d+/);

  if (!match) {
    return null;
  }

  const parsed = Number.parseInt(match[0], 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeLanguageCode(value: unknown) {
  const cleaned = cleanString(value)?.toLowerCase();

  if (!cleaned) {
    return null;
  }

  const languageMap: Record<string, string> = {
    ger: "de",
    deu: "de",
    eng: "en",
    fre: "fr",
    fra: "fr",
    spa: "es",
    ita: "it",
    lat: "la",
  };

  return languageMap[cleaned] || cleaned;
}

function extractDnbRecordXml(responseXml: string) {
  const recordMatch =
    responseXml.match(
      /<(?:srw:)?recordData\b[^>]*>([\s\S]*?)<\/(?:srw:)?recordData>/i,
    ) ||
    responseXml.match(
      /<(?:marc:)?record\b[^>]*>([\s\S]*?)<\/(?:marc:)?record>/i,
    );

  return recordMatch?.[1] || null;
}

function parseDnbRecord(
  responseXml: string,
  requestedIsbn: string,
): NormalizedBookSource | null {
  const recordXml = extractDnbRecordXml(responseXml);

  if (!recordXml) {
    return null;
  }

  const titleField = extractMarcDataFields(recordXml, "245")[0] || "";

  const title = cleanMarcValue(extractMarcSubfields(titleField, "a")[0]);

  const subtitle = cleanMarcValue(extractMarcSubfields(titleField, "b")[0]);

  if (!title) {
    return null;
  }

  const authors = allMarcSubfields(
    recordXml,
    ["100", "110", "111", "700", "710", "711"],
    ["a"],
  );

  const publisher =
    firstMarcSubfield(recordXml, "264", ["b"]) ||
    firstMarcSubfield(recordXml, "260", ["b"]);

  const publishedDate =
    firstMarcSubfield(recordXml, "264", ["c"]) ||
    firstMarcSubfield(recordXml, "260", ["c"]);

  const edition = firstMarcSubfield(recordXml, "250", ["a"]);

  const description =
    firstMarcSubfield(recordXml, "520", ["a"]) ||
    firstMarcSubfield(recordXml, "520", ["b"]);

  const pageCount = parsePositiveInteger(
    firstMarcSubfield(recordXml, "300", ["a"]),
  );

  const language = normalizeLanguageCode(
    firstMarcSubfield(recordXml, "041", ["a"]),
  );

  const subjects = allMarcSubfields(
    recordXml,
    ["600", "610", "611", "630", "648", "650", "651", "653"],
    ["a", "x", "y", "z"],
  );

  const isbnValues = allMarcSubfields(recordXml, ["020"], ["a", "z"])
    .map((value) => normalizeIsbn(value))
    .filter(Boolean);

  const isbn10 =
    isbnValues.find((value) => value.length === 10) ||
    (requestedIsbn.length === 10 ? requestedIsbn : null);

  const isbn13 =
    isbnValues.find((value) => value.length === 13) ||
    (requestedIsbn.length === 13
      ? requestedIsbn
      : convertIsbn10To13(requestedIsbn));

  const dnbId =
    extractMarcControlField(recordXml, "001") ||
    firstMarcSubfield(recordXml, "035", ["a"]);

  return {
    source: "Deutsche Nationalbibliothek",
    sourceId: dnbId,
    sourceUrl: dnbId
      ? `https://d-nb.info/${encodeURIComponent(
          dnbId.replace(/^\(DE-101\)/, ""),
        )}`
      : null,
    title,
    subtitle,
    authors,
    publisher,
    publishedDate,
    edition,
    description,
    pageCount,
    language,
    subjects,
    isbn10,
    isbn13,
    coverUrl: null,
  };
}

async function fetchJson<T>(url: string, timeoutMs = 10000): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "Handzettel-Schulen.de ISBN-Import/1.0",
      },
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchText(
  url: string,
  timeoutMs = 12000,
): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/xml,text/xml;q=0.9,*/*;q=0.8",
        "User-Agent": "Handzettel-Schulen.de ISBN-Import/1.0",
      },
    });

    if (!response.ok) {
      return null;
    }

    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function loadCornelsenBook(
  isbn: string,
): Promise<NormalizedBookSource | null> {
  const searchUrls = [
    `https://www.cornelsen.de/suche?query=${encodeURIComponent(isbn)}`,
    `https://www.cornelsen.de/suche?q=${encodeURIComponent(isbn)}`,
    `https://www.cornelsen.de/search?query=${encodeURIComponent(isbn)}`,
  ];

  let productUrl: string | null = null;

  for (const searchUrl of searchUrls) {
    const searchHtml = await fetchText(searchUrl, 12000);

    if (!searchHtml) {
      continue;
    }

    productUrl = findCornelsenProductUrl(searchHtml, isbn);

    if (productUrl) {
      break;
    }
  }

  if (!productUrl) {
    return null;
  }

  const productHtml = await fetchText(productUrl, 15000);

  if (!productHtml) {
    return null;
  }

  return parseCornelsenProduct(productHtml, productUrl, isbn);
}

async function loadDnbBook(isbn: string): Promise<NormalizedBookSource | null> {
  const queryVariants = [`isbn=${isbn}`, `num=${isbn}`];

  for (const query of queryVariants) {
    const params = new URLSearchParams({
      version: "1.1",
      operation: "searchRetrieve",
      query,
      recordSchema: "MARC21-xml",
      maximumRecords: "3",
    });

    const responseXml = await fetchText(
      `https://services.dnb.de/sru/dnb?${params.toString()}`,
    );

    if (!responseXml) {
      continue;
    }

    const parsed = parseDnbRecord(responseXml, isbn);

    if (parsed) {
      return parsed;
    }
  }

  return null;
}

async function loadGoogleBook(
  isbn: string,
): Promise<NormalizedBookSource | null> {
  const apiKey = cleanString(process.env.GOOGLE_BOOKS_API_KEY);

  const params = new URLSearchParams({
    q: `isbn:${isbn}`,
    maxResults: "5",
    printType: "books",
    projection: "full",
  });

  if (apiKey) {
    params.set("key", apiKey);
  }

  const response = await fetchJson<GoogleBooksResponse>(
    `https://www.googleapis.com/books/v1/volumes?${params.toString()}`,
  );

  const items = response?.items || [];

  if (items.length === 0) {
    return null;
  }

  const exactItem =
    items.find((item) => {
      const identifiers = item.volumeInfo?.industryIdentifiers || [];

      return identifiers.some(
        (identifier) =>
          normalizeIsbn(identifier.identifier) === normalizeIsbn(isbn),
      );
    }) || items[0];

  const info = exactItem.volumeInfo;
  if (!info?.title) {
    return null;
  }

  return {
    source: "Google Books",
    sourceId: cleanString(exactItem.id),
    sourceUrl:
      forceHttps(info.infoLink) ||
      forceHttps(info.canonicalVolumeLink) ||
      (exactItem.id
        ? `https://books.google.de/books?id=${encodeURIComponent(exactItem.id)}`
        : null),
    title: cleanString(info.title),
    subtitle: cleanString(info.subtitle),
    authors: uniqueStrings(info.authors || []),
    publisher: cleanString(info.publisher),
    publishedDate: cleanString(info.publishedDate),
    edition: null,
    description: cleanString(info.description),
    pageCount:
      typeof info.pageCount === "number" && info.pageCount > 0
        ? info.pageCount
        : null,
    language: cleanString(info.language),
    subjects: uniqueStrings(info.categories || []),
    isbn10: getGoogleIdentifier(info.industryIdentifiers, "ISBN_10"),
    isbn13: getGoogleIdentifier(info.industryIdentifiers, "ISBN_13"),
    coverUrl: forceHttps(
      info.imageLinks?.extraLarge ||
        info.imageLinks?.large ||
        info.imageLinks?.medium ||
        info.imageLinks?.thumbnail ||
        info.imageLinks?.smallThumbnail,
    ),
    recommendedPrice: null,
    priceCurrency: null,
    priceSource: null,
    coverSource: info.imageLinks ? "Google Books" : null,
    coverSourceUrl:
      forceHttps(info.infoLink) ||
      forceHttps(info.canonicalVolumeLink) ||
      (exactItem.id
        ? `https://books.google.de/books?id=${encodeURIComponent(exactItem.id)}`
        : null),
    // Google Books darf als offizielle Recherche- und Vorschauquelle dienen.
    // Das Bild wird jedoch nicht automatisch heruntergeladen oder dauerhaft
    // in unserem Produktkatalog gespeichert, da die API-Ausgabe allein keine
    // pauschale Nutzungsfreigabe für jedes einzelne Buchcover belegt.
    coverCanBeImported: false,
    coverDeliveryMode: info.imageLinks ? "external" : null,
    coverUsageStatus: info.imageLinks ? "manual_review" : null,
    coverLicense: info.imageLinks
      ? "Google Books API-Nutzungsbedingungen"
      : null,
    coverLicenseUrl: info.imageLinks
      ? "https://developers.google.com/books/terms"
      : null,
    coverAttribution: info.imageLinks ? "Google Books" : null,
    coverRightsNote: info.imageLinks
      ? "Das Cover wird nur als Recherchevorschau angezeigt und nicht automatisch in den Produktkatalog übernommen. Vor einer manuellen Übernahme müssen die Bildrechte über Verlag oder Lieferant geklärt werden."
      : null,
  };
}

async function loadOpenLibraryBook(
  isbn: string,
): Promise<NormalizedBookSource | null> {
  const key = `ISBN:${isbn}`;

  const params = new URLSearchParams({
    bibkeys: key,
    format: "json",
    jscmd: "data",
  });

  const response = await fetchJson<Record<string, OpenLibraryBook>>(
    `https://openlibrary.org/api/books?${params.toString()}`,
  );

  const book = response?.[key];

  if (!book?.title) {
    return null;
  }

  return {
    source: "Open Library",
    sourceUrl: forceHttps(book.url),
    sourceId: cleanString(book.identifiers?.openlibrary?.[0]),
    title: cleanString(book.title),
    subtitle: cleanString(book.subtitle),
    authors: uniqueStrings(
      (book.authors || []).map((author) => cleanString(author.name)),
    ),
    publisher:
      cleanString(book.publishers?.[0]?.name) ||
      cleanString(book.publishers?.map((item) => item.name).join(", ")),
    publishedDate: cleanString(book.publish_date),
    edition: null,
    description: null,
    pageCount:
      typeof book.number_of_pages === "number" && book.number_of_pages > 0
        ? book.number_of_pages
        : null,
    language: null,
    subjects: uniqueStrings(
      (book.subjects || []).map((subject) => cleanString(subject.name)),
    ),
    isbn10: cleanString(book.identifiers?.isbn_10?.[0]),
    isbn13: cleanString(book.identifiers?.isbn_13?.[0]),
    coverUrl: forceHttps(
      book.cover?.large || book.cover?.medium || book.cover?.small,
    ),
    recommendedPrice: null,
    priceCurrency: null,
    priceSource: null,
    coverSource: book.cover ? "Open Library" : null,
    coverSourceUrl: book.cover ? forceHttps(book.url) : null,
    coverCanBeImported: false,
    coverDeliveryMode: book.cover ? "manual" : null,
    coverUsageStatus: book.cover ? "manual_review" : null,
    coverLicense: null,
    coverLicenseUrl: null,
    coverAttribution: book.cover ? "Open Library" : null,
    coverRightsNote: book.cover
      ? "Open Library weist selbst darauf hin, dass Rechte Dritter bestehen können. Das Bild wird deshalb nur als Recherchehinweis angezeigt und nicht automatisch übernommen."
      : null,
  };
}

async function findExistingProduct(isbnValues: string[]) {
  const candidates = uniqueStrings(
    isbnValues.map((value) => normalizeIsbn(value)),
  );

  for (const candidate of candidates) {
    const { data, error } = await supabaseServer
      .from("school_products")
      .select("*")
      .eq("ean", candidate)
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(`ISBN-Dublettenprüfung fehlgeschlagen: ${error.message}`);
    }

    if (data) {
      const product = data as ExistingProductRow;

      return {
        id: product.id,
        name: getProductName(product),
        sku: getProductSku(product),
        ean: cleanString(product.ean),
        imageUrl:
          cleanString(product.image_styled_url) ||
          cleanString(product.image_url),
      };
    }
  }

  return null;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const rawIsbn = url.searchParams.get("isbn");
    const isbn = normalizeIsbn(rawIsbn);

    if (!isbn) {
      return NextResponse.json(
        {
          ok: false,
          message: "Bitte gib eine ISBN ein.",
        },
        { status: 400 },
      );
    }

    if (!validateIsbn(isbn)) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Die eingegebene Nummer ist keine gültige ISBN-10 oder ISBN-13.",
        },
        { status: 400 },
      );
    }

    const [
      optionalProviderBooks,
      dnbBook,
      cornelsenBook,
      googleBook,
      openLibraryBook,
    ] = await Promise.all([
      resolveOptionalIsbnSources(isbn),
      loadDnbBook(isbn),
      loadCornelsenBook(isbn),
      loadGoogleBook(isbn),
      loadOpenLibraryBook(isbn),
    ]);

    const availableSources = [
      ...optionalProviderBooks,
      dnbBook,
      cornelsenBook,
      googleBook,
      openLibraryBook,
    ].filter((source): source is NormalizedBookSource => Boolean(source));

    if (availableSources.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Zu dieser ISBN wurden weder bei der Deutschen Nationalbibliothek, bei Wikimedia Commons, beim Verlag, bei Google Books oder bei Open Library Buchdaten gefunden.",
        },
        { status: 404 },
      );
    }

    const book = mergeIsbnBookSources(isbn, availableSources);

    const existingProduct = await findExistingProduct(
      [isbn, book.isbn10, book.isbn13].filter((value): value is string =>
        Boolean(value),
      ),
    );

    return NextResponse.json({
      ok: true,
      book,
      existingProduct,
    });
  } catch (error) {
    console.error("ISBN search error:", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Die ISBN-Suche konnte nicht ausgeführt werden.",
      },
      { status: 500 },
    );
  }
}
