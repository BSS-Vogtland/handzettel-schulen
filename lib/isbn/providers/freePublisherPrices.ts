import type {
  IsbnBookProvider,
  IsbnBookSource,
} from "@/lib/isbn/types";
import {
  normalizeIsbn,
  parseIsbnPrice,
} from "@/lib/isbn/utils";

type PublisherConfig = {
  sourceName: string;
  publisherName: string;
  matchesIsbn: (isbn: string) => boolean;
  directUrls: (isbn: string) => string[];
  searchUrls: (isbn: string) => string[];
  productPathPattern: RegExp;
};

type HtmlPage = {
  html: string;
  finalUrl: string;
};

type ResolvedPrice = {
  amount: number;
  currency: string;
  approximate: boolean;
  method:
    | "structured-data"
    | "meta-data"
    | "visible-product-page"
    | "visible-search-result";
};

type PageAnalysis = {
  title: string | null;
  price: ResolvedPrice;
  availability: string | null;
};

const REQUEST_TIMEOUT_MS = 14000;
const MAX_PRODUCT_LINKS = 6;

function uniqueStrings(values: Array<string | null | undefined>) {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const cleaned = String(value ?? "").trim();

    if (!cleaned) {
      continue;
    }

    const key = cleaned.toLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(cleaned);
  }

  return result;
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&euro;|&#8364;/gi, "\u20ac")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#([0-9]+);/g, (_match, decimal: string) =>
      String.fromCodePoint(Number.parseInt(decimal, 10)),
    );
}

function htmlToText(html: string) {
  return decodeHtmlEntities(
    html
      .replace(
        /<(script|style|noscript|svg)\b[^>]*>[\s\S]*?<\/\1>/gi,
        " ",
      )
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:p|div|li|h1|h2|h3|h4|section|article)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractIsbnCandidates(value: string) {
  const matches =
    value.match(
      /(?:97[89][\s\u00ad-]*)?(?:\d[\s\u00ad-]*){9}[\dX]/gi,
    ) || [];

  return uniqueStrings(
    matches
      .map((match) => normalizeIsbn(match))
      .filter(
        (candidate) =>
          candidate.length === 10 || candidate.length === 13,
      ),
  );
}

function containsExactIsbn(value: string, isbn: string) {
  const normalizedTarget = normalizeIsbn(isbn);

  return extractIsbnCandidates(value).some(
    (candidate) => candidate === normalizedTarget,
  );
}

function parsePositivePrice(value: unknown) {
  const parsed = parseIsbnPrice(value);

  if (
    parsed === null ||
    !Number.isFinite(parsed) ||
    parsed <= 0 ||
    parsed > 5000
  ) {
    return null;
  }

  return Math.round(parsed * 100) / 100;
}

function formatKnownIsbn13(isbnValue: string) {
  const isbn = normalizeIsbn(isbnValue);

  if (!/^\d{13}$/.test(isbn)) {
    return isbn;
  }

  const mappings: Array<{
    prefix: string;
    publisherLength: number;
  }> = [
    { prefix: "978312", publisherLength: 2 },
    { prefix: "978306", publisherLength: 2 },
    { prefix: "9783464", publisherLength: 3 },
    { prefix: "978314", publisherLength: 2 },
    { prefix: "9783427", publisherLength: 3 },
    { prefix: "9783507", publisherLength: 3 },
    { prefix: "97838045", publisherLength: 4 },
    { prefix: "97838377", publisherLength: 4 },
    { prefix: "9783661", publisherLength: 3 },
    { prefix: "97837661", publisherLength: 4 },
  ];

  const mapping = mappings.find((entry) =>
    isbn.startsWith(entry.prefix),
  );

  if (!mapping) {
    return isbn;
  }

  const groupStart = 3;
  const publisherStart = 4;
  const publisherEnd =
    publisherStart + mapping.publisherLength;

  return [
    isbn.slice(0, groupStart),
    isbn.slice(groupStart, publisherStart),
    isbn.slice(publisherStart, publisherEnd),
    isbn.slice(publisherEnd, 12),
    isbn.slice(12),
  ].join("-");
}

async function fetchPublisherHtml(
  url: string,
): Promise<HtmlPage | null> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS,
  );

  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "de-DE,de;q=0.9,en;q=0.5",
        "User-Agent":
          "Mozilla/5.0 (compatible; Handzettel-Schulen ISBN-Preispruefung/1.0)",
      },
    });

    if (!response.ok) {
      return null;
    }

    const contentType =
      response.headers.get("content-type") || "";

    if (
      !contentType.includes("text/html") &&
      !contentType.includes("application/xhtml")
    ) {
      return null;
    }

    const html = await response.text();

    if (!html.trim()) {
      return null;
    }

    return {
      html,
      finalUrl: response.url || url,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function extractJsonLdBlocks(html: string) {
  const blocks: unknown[] = [];
  const expression =
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  for (const match of html.matchAll(expression)) {
    const raw = decodeHtmlEntities(String(match[1] || "")).trim();

    if (!raw) {
      continue;
    }

    try {
      blocks.push(JSON.parse(raw));
    } catch {
      // Invalid JSON-LD blocks are ignored.
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

  for (const key of [
    "@graph",
    "mainEntity",
    "itemListElement",
    "item",
  ]) {
    if (record[key]) {
      result.push(...flattenJsonLd(record[key]));
    }
  }

  return result;
}

function readStructuredString(value: unknown): string | null {
  if (typeof value === "string") {
    return value.trim() || null;
  }

  if (typeof value === "number") {
    return String(value);
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const resolved = readStructuredString(item);

      if (resolved) {
        return resolved;
      }
    }

    return null;
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;

    return (
      readStructuredString(record.name) ||
      readStructuredString(record.value) ||
      readStructuredString(record.url) ||
      null
    );
  }

  return null;
}

function structuredRecordMatchesIsbn(
  record: Record<string, unknown>,
  isbn: string,
) {
  const values = [
    record.isbn,
    record.gtin,
    record.gtin13,
    record.sku,
    record.productID,
    record.url,
  ];

  return values.some((value) => {
    const text = readStructuredString(value);

    return text ? containsExactIsbn(text, isbn) : false;
  });
}

function getStructuredTypes(record: Record<string, unknown>) {
  const raw = record["@type"];

  if (Array.isArray(raw)) {
    return raw.map((value) =>
      String(value).toLowerCase(),
    );
  }

  return raw
    ? [String(raw).toLowerCase()]
    : [];
}

function readOfferPrice(
  offerValue: unknown,
): ResolvedPrice | null {
  const offers = Array.isArray(offerValue)
    ? offerValue
    : offerValue && typeof offerValue === "object"
      ? [offerValue]
      : [];

  for (const offer of offers) {
    if (!offer || typeof offer !== "object") {
      continue;
    }

    const record = offer as Record<string, unknown>;
    const specification =
      record.priceSpecification &&
      typeof record.priceSpecification === "object"
        ? (record.priceSpecification as Record<
            string,
            unknown
          >)
        : null;

    const price =
      parsePositivePrice(record.price) ||
      parsePositivePrice(specification?.price);

    if (price === null) {
      continue;
    }

    const currency =
      readStructuredString(record.priceCurrency) ||
      readStructuredString(
        specification?.priceCurrency,
      ) ||
      "EUR";

    if (currency.toUpperCase() !== "EUR") {
      continue;
    }

    return {
      amount: price,
      currency: "EUR",
      approximate: false,
      method: "structured-data",
    };
  }

  return null;
}

function extractStructuredProductData(
  html: string,
  isbn: string,
) {
  const records = extractJsonLdBlocks(html).flatMap(
    (block) => flattenJsonLd(block),
  );

  const productRecords = records.filter((record) => {
    const types = getStructuredTypes(record);

    return (
      structuredRecordMatchesIsbn(record, isbn) ||
      types.includes("product") ||
      types.includes("book")
    );
  });

  const exactRecord =
    productRecords.find((record) =>
      structuredRecordMatchesIsbn(record, isbn),
    ) || null;

  const selectedRecord =
    exactRecord ||
    (productRecords.length === 1
      ? productRecords[0]
      : null);

  if (!selectedRecord) {
    return {
      title: null,
      price: null,
      availability: null,
    };
  }

  const offer = readOfferPrice(selectedRecord.offers);

  return {
    title:
      readStructuredString(selectedRecord.name) ||
      null,
    price: offer,
    availability:
      readStructuredString(
        (
          (Array.isArray(selectedRecord.offers)
            ? selectedRecord.offers[0]
            : selectedRecord.offers) as
            | Record<string, unknown>
            | undefined
        )?.availability,
      ) || null,
  };
}

function extractMetaContent(
  html: string,
  key: string,
) {
  const escaped = key.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );

  const patterns = [
    new RegExp(
      `<meta\\b[^>]*(?:property|name|itemprop)=["']${escaped}["'][^>]*content=["']([^"']+)["'][^>]*>`,
      "i",
    ),
    new RegExp(
      `<meta\\b[^>]*content=["']([^"']+)["'][^>]*(?:property|name|itemprop)=["']${escaped}["'][^>]*>`,
      "i",
    ),
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(html);

    if (match?.[1]) {
      return decodeHtmlEntities(match[1]).trim();
    }
  }

  return null;
}

function extractMetaPrice(
  html: string,
): ResolvedPrice | null {
  const rawPrice =
    extractMetaContent(html, "price") ||
    extractMetaContent(html, "product:price:amount") ||
    extractMetaContent(html, "og:price:amount");

  const price = parsePositivePrice(rawPrice);

  if (price === null) {
    return null;
  }

  const currency =
    extractMetaContent(html, "priceCurrency") ||
    extractMetaContent(html, "product:price:currency") ||
    extractMetaContent(html, "og:price:currency") ||
    "EUR";

  if (currency.toUpperCase() !== "EUR") {
    return null;
  }

  return {
    amount: price,
    currency: "EUR",
    approximate: false,
    method: "meta-data",
  };
}

function collectVisiblePriceCandidates(text: string) {
  const candidates: Array<{
    amount: number;
    approximate: boolean;
    index: number;
  }> = [];

  const patterns = [
    /((?:ca\.?|circa)\s*)?(\d{1,4}(?:[.\s]\d{3})*[,.]\d{2})\s*(?:\u20ac|EUR)/gi,
    /(?:\u20ac|EUR)\s*((?:ca\.?|circa)\s*)?(\d{1,4}(?:[.\s]\d{3})*[,.]\d{2})/gi,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const amount = parsePositivePrice(match[2]);

      if (amount === null) {
        continue;
      }

      candidates.push({
        amount,
        approximate: Boolean(match[1]),
        index: match.index ?? Number.MAX_SAFE_INTEGER,
      });
    }
  }

  return candidates.sort(
    (left, right) => left.index - right.index,
  );
}

function cutBeforeRelatedProducts(text: string) {
  const markers = [
    "Produktempfehlungen",
    "Zugehoerige Produkte",
    "Zugeh\u00f6rige Produkte",
    "Empfehlungen",
    "Passend dazu",
    "Weitere Produkte",
  ];

  let endIndex = text.length;

  for (const marker of markers) {
    const index = text
      .toLowerCase()
      .indexOf(marker.toLowerCase());

    if (index >= 0) {
      endIndex = Math.min(endIndex, index);
    }
  }

  return text.slice(0, endIndex);
}

function getTextWindowAroundIsbn(
  text: string,
  isbn: string,
) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const targetIndex = lines.findIndex((line) =>
    containsExactIsbn(line, isbn),
  );

  if (targetIndex < 0) {
    return null;
  }

  return lines
    .slice(
      Math.max(0, targetIndex - 30),
      Math.min(lines.length, targetIndex + 30),
    )
    .join("\n");
}

function extractVisiblePrice(
  text: string,
  isbn: string,
  isSearchPage: boolean,
): ResolvedPrice | null {
  const sourceText = isSearchPage
    ? getTextWindowAroundIsbn(text, isbn)
    : cutBeforeRelatedProducts(text);

  if (!sourceText) {
    return null;
  }

  const candidate =
    collectVisiblePriceCandidates(sourceText)[0];

  if (!candidate) {
    return null;
  }

  return {
    amount: candidate.amount,
    currency: "EUR",
    approximate: candidate.approximate,
    method: isSearchPage
      ? "visible-search-result"
      : "visible-product-page",
  };
}

function extractPageTitle(html: string) {
  const metaTitle =
    extractMetaContent(html, "og:title") ||
    extractMetaContent(html, "twitter:title");

  if (metaTitle) {
    return metaTitle;
  }

  const headingMatch =
    /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html);

  if (headingMatch?.[1]) {
    return htmlToText(headingMatch[1]);
  }

  const titleMatch =
    /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);

  return titleMatch?.[1]
    ? decodeHtmlEntities(titleMatch[1]).trim()
    : null;
}

function extractAvailability(text: string) {
  const primaryText = cutBeforeRelatedProducts(text);

  const options = [
    "Sofort verf\u00fcgbar",
    "Lieferbar",
    "Bestellbar",
    "Verf\u00fcgbar",
    "Nicht lieferbar",
    "Derzeit nicht lieferbar",
    "Noch nicht erschienen",
  ];

  return (
    options.find((option) =>
      primaryText
        .toLowerCase()
        .includes(option.toLowerCase()),
    ) || null
  );
}

function analyzePublisherPage(input: {
  page: HtmlPage;
  isbn: string;
  isSearchPage: boolean;
}): PageAnalysis | null {
  const text = htmlToText(input.page.html);

  if (!containsExactIsbn(text, input.isbn)) {
    return null;
  }

  const structured = extractStructuredProductData(
    input.page.html,
    input.isbn,
  );

  const price =
    structured.price ||
    extractMetaPrice(input.page.html) ||
    extractVisiblePrice(
      text,
      input.isbn,
      input.isSearchPage,
    );

  if (!price) {
    return null;
  }

  return {
    title:
      structured.title ||
      extractPageTitle(input.page.html),
    price,
    availability:
      structured.availability ||
      extractAvailability(text),
  };
}

function resolveAbsoluteUrl(
  href: string,
  baseUrl: string,
) {
  try {
    return new URL(
      decodeHtmlEntities(href),
      baseUrl,
    ).toString();
  } catch {
    return null;
  }
}

function extractProductLinks(
  page: HtmlPage,
  isbn: string,
  config: PublisherConfig,
) {
  const allLinks: string[] = [];

  const addLinksFromHtml = (html: string) => {
    const expression = /href=["']([^"']+)["']/gi;

    for (const match of html.matchAll(expression)) {
      const resolved = resolveAbsoluteUrl(
        match[1],
        page.finalUrl,
      );

      if (
        !resolved ||
        !config.productPathPattern.test(
          new URL(resolved).pathname,
        )
      ) {
        continue;
      }

      allLinks.push(resolved);
    }
  };

  for (const formatted of uniqueStrings([
    isbn,
    formatKnownIsbn13(isbn),
  ])) {
    let cursor = 0;

    while (cursor < page.html.length) {
      const index = page.html
        .toLowerCase()
        .indexOf(formatted.toLowerCase(), cursor);

      if (index < 0) {
        break;
      }

      addLinksFromHtml(
        page.html.slice(
          Math.max(0, index - 5000),
          Math.min(page.html.length, index + 5000),
        ),
      );

      cursor = index + formatted.length;
    }
  }

  if (allLinks.length === 0) {
    const expression = /href=["']([^"']+)["']/gi;

    for (const match of page.html.matchAll(expression)) {
      if (!containsExactIsbn(match[1], isbn)) {
        continue;
      }

      const resolved = resolveAbsoluteUrl(
        match[1],
        page.finalUrl,
      );

      if (
        resolved &&
        config.productPathPattern.test(
          new URL(resolved).pathname,
        )
      ) {
        allLinks.push(resolved);
      }
    }
  }

  return uniqueStrings(allLinks).slice(
    0,
    MAX_PRODUCT_LINKS,
  );
}

function getCcBuchnerOrderNumber(
  isbnValue: string,
) {
  const isbn = normalizeIsbn(isbnValue);

  // Publisher prefix 661:
  // 978-3-661-80041-7 -> order number 80041
  if (/^9783661\d{6}$/.test(isbn)) {
    return isbn.slice(7, 12);
  }

  // Publisher prefix 7661:
  // 978-3-7661-7970-8 -> order number 7970
  if (/^97837661\d{5}$/.test(isbn)) {
    return isbn.slice(8, 12);
  }

  return null;
}

function cleanPublisherProductTitle(
  value: string | null,
) {
  return String(value || "")
    .replace(
      /\s*\|\s*(?:C\.?\s*C\.?\s*Buchner|C\.C\. Buchner Verlag).*$/i,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function buildPublisherProductName(input: {
  sourceName: string;
  html: string;
  fallbackTitle: string | null;
}) {
  const fallbackTitle =
    cleanPublisherProductTitle(input.fallbackTitle);

  if (input.sourceName !== "C.C. Buchner Verlag") {
    return fallbackTitle || null;
  }

  const text = htmlToText(input.html);

  const lines = text
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  if (fallbackTitle) {
    const combinedLine = lines.find((line) => {
      const normalizedLine = line
        .replace(/\s+[\u2013\u2014-]\s+/g, " - ")
        .trim();

      const suffix = ` - ${fallbackTitle}`;

      return (
        normalizedLine.endsWith(suffix) &&
        normalizedLine.length > suffix.length &&
        normalizedLine.length <= 180
      );
    });

    if (combinedLine) {
      return combinedLine
        .replace(/\s+[\u2013\u2014-]\s+/g, " \u2013 ")
        .trim();
    }
  }

  const seriesLabelIndex = lines.findIndex(
    (line) => line.toLowerCase() === "reihe:",
  );

  const seriesName =
    seriesLabelIndex >= 0
      ? String(lines[seriesLabelIndex + 1] || "").trim()
      : "";

  if (
    seriesName &&
    fallbackTitle &&
    !fallbackTitle
      .toLowerCase()
      .includes(seriesName.toLowerCase())
  ) {
    return `${seriesName} \u2013 ${fallbackTitle}`;
  }

  return fallbackTitle || seriesName || null;
}

function getPublisherConfig(
  isbnValue: string,
): PublisherConfig | null {
  const isbn = normalizeIsbn(isbnValue);
  const formatted = formatKnownIsbn13(isbn);
  const ccBuchnerOrderNumber =
    getCcBuchnerOrderNumber(isbn);

  const configs: PublisherConfig[] = [
    {
      sourceName: "Ernst Klett Verlag",
      publisherName: "Ernst Klett Verlag",
      matchesIsbn: (value) =>
        value.startsWith("978312"),
      directUrls: () => [
        `https://www.klett.de/produkt/isbn/${encodeURIComponent(
          formatted,
        )}`,
        `https://www.klett.de/produkt/isbn/${encodeURIComponent(
          isbn,
        )}`,
      ],
      searchUrls: () => [],
      productPathPattern: /^\/produkt\/isbn\//i,
    },
    {
      sourceName: "Westermann Verlag",
      publisherName: "Westermann",
      matchesIsbn: (value) =>
        [
          "978314",
          "9783427",
          "9783507",
          "97838045",
          "97838377",
        ].some((prefix) => value.startsWith(prefix)),
      directUrls: () => [
        `https://www.westermann.de/artikel/${encodeURIComponent(
          formatted,
        )}`,
        `https://www.westermann.de/artikel/${encodeURIComponent(
          isbn,
        )}`,
      ],
      searchUrls: () => [],
      productPathPattern: /^\/artikel\//i,
    },
    {
      sourceName: "Cornelsen Verlag",
      publisherName: "Cornelsen Verlag",
      matchesIsbn: (value) =>
        value.startsWith("978306") ||
        value.startsWith("9783464"),
      directUrls: () => [],
      searchUrls: () => [
        `https://www.cornelsen.de/suche?query=${encodeURIComponent(
          isbn,
        )}`,
        `https://www.cornelsen.de/suche?q=${encodeURIComponent(
          isbn,
        )}`,
        `https://www.cornelsen.de/search?query=${encodeURIComponent(
          isbn,
        )}`,
      ],
      productPathPattern: /^\/produkte\//i,
    },
    {
      sourceName: "C.C. Buchner Verlag",
      publisherName: "C.C. Buchner Verlag",
      matchesIsbn: (value) =>
        value.startsWith("9783661") ||
        value.startsWith("97837661"),
      directUrls: () =>
        ccBuchnerOrderNumber
          ? [
              `https://www.ccbuchner.de/bn/${encodeURIComponent(
                ccBuchnerOrderNumber,
              )}`,
            ]
          : [],
      searchUrls: () => [
        `https://www.ccbuchner.de/produkte/c-851?tx_solr%5Bq%5D=${encodeURIComponent(
          isbn,
        )}`,
        `https://www.ccbuchner.de/?tx_solr%5Bq%5D=${encodeURIComponent(
          isbn,
        )}`,
        `https://www.ccbuchner.de/suche?tx_solr%5Bq%5D=${encodeURIComponent(
          isbn,
        )}`,
      ],
      productPathPattern: /^\/produkt\//i,
    },
  ];

  return (
    configs.find((config) =>
      config.matchesIsbn(isbn),
    ) || null
  );
}

async function resolveOfficialPublisherPrice(
  isbnValue: string,
): Promise<IsbnBookSource | null> {
  const isbn = normalizeIsbn(isbnValue);
  const config = getPublisherConfig(isbn);

  if (!config) {
    return null;
  }

  for (const directUrl of config.directUrls(isbn)) {
    const page = await fetchPublisherHtml(directUrl);

    if (!page) {
      continue;
    }

    const analysis = analyzePublisherPage({
      page,
      isbn,
      isSearchPage: false,
    });

    if (!analysis) {
      continue;
    }

    return {
      source: config.sourceName,
      sourceId: isbn,
      sourceUrl: page.finalUrl,
      title: buildPublisherProductName({
        sourceName: config.sourceName,
        html: page.html,
        fallbackTitle: analysis.title,
      }),
      publisher: config.publisherName,
      isbn13: isbn.length === 13 ? isbn : null,
      isbn10: isbn.length === 10 ? isbn : null,
      recommendedPrice: analysis.price.amount,
      priceCurrency: analysis.price.currency,
      priceSource: `${config.sourceName} - offizielle Produktseite${
        analysis.price.approximate
          ? " (Circa-Preis)"
          : ""
      }`,
      availability: analysis.availability,
    };
  }

  for (const searchUrl of config.searchUrls(isbn)) {
    const searchPage =
      await fetchPublisherHtml(searchUrl);

    if (!searchPage) {
      continue;
    }

    const productLinks = extractProductLinks(
      searchPage,
      isbn,
      config,
    );

    for (const productLink of productLinks) {
      const productPage =
        await fetchPublisherHtml(productLink);

      if (!productPage) {
        continue;
      }

      const analysis = analyzePublisherPage({
        page: productPage,
        isbn,
        isSearchPage: false,
      });

      if (!analysis) {
        continue;
      }

      return {
        source: config.sourceName,
        sourceId: isbn,
        sourceUrl: productPage.finalUrl,
        title: buildPublisherProductName({
          sourceName: config.sourceName,
          html: productPage.html,
          fallbackTitle: analysis.title,
        }),
        publisher: config.publisherName,
        isbn13: isbn.length === 13 ? isbn : null,
        isbn10: isbn.length === 10 ? isbn : null,
        recommendedPrice: analysis.price.amount,
        priceCurrency: analysis.price.currency,
        priceSource: `${config.sourceName} - offizielle Produktseite${
          analysis.price.approximate
            ? " (Circa-Preis)"
            : ""
        }`,
        availability: analysis.availability,
      };
    }

    const searchAnalysis = analyzePublisherPage({
      page: searchPage,
      isbn,
      isSearchPage: true,
    });

    if (searchAnalysis) {
      return {
        source: config.sourceName,
        sourceId: isbn,
        sourceUrl: searchPage.finalUrl,
        title: buildPublisherProductName({
          sourceName: config.sourceName,
          html: searchPage.html,
          fallbackTitle: searchAnalysis.title,
        }),
        publisher: config.publisherName,
        isbn13: isbn.length === 13 ? isbn : null,
        isbn10: isbn.length === 10 ? isbn : null,
        recommendedPrice:
          searchAnalysis.price.amount,
        priceCurrency:
          searchAnalysis.price.currency,
        priceSource: `${config.sourceName} - offizielle ISBN-Suchergebnisse${
          searchAnalysis.price.approximate
            ? " (Circa-Preis)"
            : ""
        }`,
        availability:
          searchAnalysis.availability,
      };
    }
  }

  return null;
}

export const freePublisherPriceProvider: IsbnBookProvider = {
  name: "Offizielle Verlagsseite",
  enabled: true,
  resolve: resolveOfficialPublisherPrice,
};