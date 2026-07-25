import type {
  IsbnBookProvider,
  IsbnBookSource,
} from "@/lib/isbn/types";
import {
  normalizeIsbn,
  parseIsbnPrice,
} from "@/lib/isbn/utils";

type HtmlPage = {
  html: string;
  finalUrl: string;
};

const REQUEST_TIMEOUT_MS = 14000;
const MAX_PRODUCT_LINKS = 8;

function uniqueStrings(
  values: Array<string | null | undefined>,
) {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const cleaned = String(
      value ?? "",
    ).trim();

    if (!cleaned) {
      continue;
    }

    const key =
      cleaned.toLocaleLowerCase(
        "de-DE",
      );

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(cleaned);
  }

  return result;
}

function decodeHtmlEntities(
  value: string,
) {
  return value
    .replace(
      /&nbsp;|&#160;/gi,
      " ",
    )
    .replace(
      /&euro;|&#8364;/gi,
      "€",
    )
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(
      /&apos;|&#39;/gi,
      "'",
    )
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(
      /&#x([0-9a-f]+);/gi,
      (
        _match,
        hexadecimal: string,
      ) =>
        String.fromCodePoint(
          Number.parseInt(
            hexadecimal,
            16,
          ),
        ),
    )
    .replace(
      /&#([0-9]+);/g,
      (
        _match,
        decimal: string,
      ) =>
        String.fromCodePoint(
          Number.parseInt(
            decimal,
            10,
          ),
        ),
    );
}

function htmlToText(html: string) {
  return decodeHtmlEntities(
    html
      .replace(
        /<(script|style|noscript|svg)\b[^>]*>[\s\S]*?<\/\1>/gi,
        " ",
      )
      .replace(
        /<br\s*\/?>/gi,
        "\n",
      )
      .replace(
        /<\/(?:p|div|li|h1|h2|h3|h4|section|article|tr)>/gi,
        "\n",
      )
      .replace(
        /<[^>]+>/g,
        " ",
      ),
  )
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(
      /\n[ \t]+/g,
      "\n",
    )
    .replace(
      /[ \t]+\n/g,
      "\n",
    )
    .replace(
      /\n{3,}/g,
      "\n\n",
    )
    .trim();
}

function extractIsbnCandidates(
  value: string,
) {
  const matches =
    value.match(
      /(?:97[89][\s\u00ad-]*)?(?:\d[\s\u00ad-]*){9}[\dX]/gi,
    ) || [];

  return uniqueStrings(
    matches
      .map((match) =>
        normalizeIsbn(match),
      )
      .filter(
        (candidate) =>
          candidate.length === 10 ||
          candidate.length === 13,
      ),
  );
}

function containsExactIsbn(
  value: string,
  isbnValue: string,
) {
  const isbn =
    normalizeIsbn(isbnValue);

  return extractIsbnCandidates(
    value,
  ).some(
    (candidate) =>
      candidate === isbn,
  );
}

function parsePositivePrice(
  value: unknown,
) {
  const parsed =
    parseIsbnPrice(value);

  if (
    parsed === null ||
    !Number.isFinite(parsed) ||
    parsed <= 0 ||
    parsed > 5000
  ) {
    return null;
  }

  return (
    Math.round(parsed * 100) /
    100
  );
}

async function fetchHtml(
  url: string,
): Promise<HtmlPage | null> {
  const controller =
    new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS,
  );

  try {
    const response =
      await fetch(url, {
        method: "GET",
        cache: "no-store",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language":
            "de-DE,de;q=0.9,en;q=0.5",
          "User-Agent":
            "Mozilla/5.0 (compatible; Handzettel-Schulen ISBN-Mehrquellenpruefung/1.0)",
        },
      });

    if (!response.ok) {
      return null;
    }

    const contentType =
      response.headers.get(
        "content-type",
      ) || "";

    if (
      !contentType.includes(
        "text/html",
      ) &&
      !contentType.includes(
        "application/xhtml",
      )
    ) {
      return null;
    }

    const html =
      await response.text();

    if (!html.trim()) {
      return null;
    }

    return {
      html,
      finalUrl:
        response.url || url,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function extractPageTitle(
  html: string,
) {
  const headingMatch =
    /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(
      html,
    );

  if (headingMatch?.[1]) {
    const heading =
      htmlToText(
        headingMatch[1],
      );

    if (heading) {
      return heading;
    }
  }

  const titleMatch =
    /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(
      html,
    );

  if (!titleMatch?.[1]) {
    return null;
  }

  return decodeHtmlEntities(
    titleMatch[1],
  )
    .replace(/\s+/g, " ")
    .trim();
}

function cutBeforeRelatedProducts(
  text: string,
) {
  const markers = [
    "Das könnte Ihnen auch gefallen",
    "Das könnte Sie auch interessieren",
    "Produktempfehlungen",
    "Passend dazu",
    "Weitere Produkte",
    "Ähnliche Produkte",
    "Produktkategorien",
  ];

  let endIndex = text.length;

  for (const marker of markers) {
    const index = text
      .toLocaleLowerCase(
        "de-DE",
      )
      .indexOf(
        marker.toLocaleLowerCase(
          "de-DE",
        ),
      );

    if (index >= 0) {
      endIndex = Math.min(
        endIndex,
        index,
      );
    }
  }

  return text.slice(
    0,
    endIndex,
  );
}

function extractFirstPrice(
  text: string,
) {
  const primaryText =
    cutBeforeRelatedProducts(text);

  const labeledPatterns = [
    /(?:Preis|Neupreis|Verkaufspreis)\s*[:\-]?\s*(\d{1,4}(?:[.\s]\d{3})*[,.]\d{2})\s*(?:€|EUR)/i,
    /(?:Preis|Neupreis|Verkaufspreis)\s*[:\-]?\s*(?:€|EUR)\s*(\d{1,4}(?:[.\s]\d{3})*[,.]\d{2})/i,
  ];

  for (
    const pattern of
    labeledPatterns
  ) {
    const match =
      pattern.exec(primaryText);

    const price =
      parsePositivePrice(
        match?.[1],
      );

    if (price !== null) {
      return price;
    }
  }

  const generalPatterns = [
    /(\d{1,4}(?:[.\s]\d{3})*[,.]\d{2})\s*(?:€|EUR)/i,
    /(?:€|EUR)\s*(\d{1,4}(?:[.\s]\d{3})*[,.]\d{2})/i,
  ];

  for (
    const pattern of
    generalPatterns
  ) {
    const match =
      pattern.exec(primaryText);

    const price =
      parsePositivePrice(
        match?.[1],
      );

    if (price !== null) {
      return price;
    }
  }

  return null;
}

function extractAvailability(
  text: string,
) {
  const primaryText =
    cutBeforeRelatedProducts(text);

  const normalizedText =
    primaryText
      .replace(/\s+/g, " ")
      .trim();

  const recognizedStatuses = [
    "Sofort lieferbar",
    "Sofort verfügbar",
    "Auf Lager",
    "Lieferbar innerhalb 1 Werktages",
    "Lieferbar innerhalb 2 Werktagen",
    "Lieferbar innerhalb 3 Werktagen",
    "Lieferbar innerhalb 4 Werktagen",
    "Lieferbar innerhalb 5 Werktagen",
    "Lieferbar innerhalb einer Woche",
    "Kurzfristig lieferbar",
    "Lieferbar",
    "Bestellbar",
    "Verfügbar",
    "Vorbestellbar",
    "Noch nicht erschienen",
    "Derzeit nicht lieferbar",
    "Nicht lieferbar",
    "Nicht verfügbar",
    "Vergriffen",
  ];

  const matchedStatus =
    recognizedStatuses.find(
      (status) =>
        normalizedText
          .toLocaleLowerCase(
            "de-DE",
          )
          .includes(
            status.toLocaleLowerCase(
              "de-DE",
            ),
          ),
    );

  if (matchedStatus) {
    return matchedStatus;
  }

  const labeledMatch =
    /(?:Lieferstatus|Lieferzeit|Verfügbarkeit)\s*[:\-]?\s*([^\n|]{2,100})/i.exec(
      primaryText,
    );

  if (!labeledMatch?.[1]) {
    return null;
  }

  const candidate =
    labeledMatch[1]
      .replace(/\s+/g, " ")
      .trim()
      .replace(
        /(?:mehr erfahren|details|jetzt prüfen|hier klicken|zum angebot).*$/i,
        "",
      )
      .trim();

  if (!candidate) {
    return null;
  }

  const rejectedValues = [
    "jetzt prüfen",
    "prüfen",
    "mehr erfahren",
    "details",
    "hier klicken",
    "zum angebot",
    "anbieter prüfen",
    "preis prüfen",
  ];

  const normalizedCandidate =
    candidate.toLocaleLowerCase(
      "de-DE",
    );

  if (
    rejectedValues.some(
      (value) =>
        normalizedCandidate ===
        value.toLocaleLowerCase(
          "de-DE",
        ),
    )
  ) {
    return null;
  }

  const containsAvailabilityTerm =
    [
      "liefer",
      "verfüg",
      "bestell",
      "lager",
      "vorbestell",
      "erschienen",
      "vergriffen",
    ].some((term) =>
      normalizedCandidate.includes(
        term,
      ),
    );

  return containsAvailabilityTerm
    ? candidate
    : null;
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
) {
  const links: string[] = [];

  const expression =
    /href=["']([^"']+)["']/gi;

  for (
    const match of
    page.html.matchAll(expression)
  ) {
    const resolved =
      resolveAbsoluteUrl(
        match[1],
        page.finalUrl,
      );

    if (!resolved) {
      continue;
    }

    let parsedUrl: URL;

    try {
      parsedUrl =
        new URL(resolved);
    } catch {
      continue;
    }

    if (
      parsedUrl.hostname !==
      "www.buchhandlungschwartz.de"
    ) {
      continue;
    }

    if (
      !parsedUrl.pathname.startsWith(
        "/shop/",
      )
    ) {
      continue;
    }

    links.push(resolved);
  }

  return uniqueStrings(
    links,
  ).slice(
    0,
    MAX_PRODUCT_LINKS,
  );
}

function buildRetailerSource(input: {
  source: string;
  isbn: string;
  page: HtmlPage;
  priceSource: string;
  reliabilityScore: number;
}) {
  const text =
    htmlToText(input.page.html);

  if (
    !containsExactIsbn(
      text,
      input.isbn,
    )
  ) {
    return null;
  }

  const price =
    extractFirstPrice(text);

  if (price === null) {
    return null;
  }

  return {
    source: input.source,
    sourceId: input.isbn,
    sourceUrl:
      input.page.finalUrl,

    title:
      extractPageTitle(
        input.page.html,
      ),

    isbn10:
      input.isbn.length === 10
        ? input.isbn
        : null,

    isbn13:
      input.isbn.length === 13
        ? input.isbn
        : null,

    recommendedPrice: price,
    priceCurrency: "EUR",
    priceSource:
      input.priceSource,

    availability:
      extractAvailability(text),

    priceSourceKind:
      "retailer" as const,

    priceIsOfficialPublisher:
      false,

    priceExactIsbnMatch: true,

    priceReliabilityScore:
      input.reliabilityScore,
  } satisfies IsbnBookSource;
}

async function resolveIsbnDePrice(
  isbnValue: string,
): Promise<IsbnBookSource | null> {
  const isbn =
    normalizeIsbn(isbnValue);

  if (
    isbn.length !== 10 &&
    isbn.length !== 13
  ) {
    return null;
  }

  const urls = uniqueStrings([
    `https://www.isbn.de/buch/${encodeURIComponent(
      isbn,
    )}`,
    `https://isbn.de/buch/${encodeURIComponent(
      isbn,
    )}`,
  ]);

  for (const url of urls) {
    const page =
      await fetchHtml(url);

    if (!page) {
      continue;
    }

    const source =
      buildRetailerSource({
        source: "ISBN.de",
        isbn,
        page,
        priceSource:
          "ISBN.de - Buchportalpreis",
        reliabilityScore: 82,
      });

    if (source) {
      return {
        ...source,
        priceSourceKind:
          "platform",
        priceReliabilityScore: 82,
      };
    }
  }

  return null;
}

async function resolveBuchkulturPrice(
  isbnValue: string,
): Promise<IsbnBookSource | null> {
  const isbn =
    normalizeIsbn(isbnValue);

  if (
    isbn.length !== 10 &&
    isbn.length !== 13
  ) {
    return null;
  }

  const searchUrl =
    `https://www.buchhandlungschwartz.de/?s=${encodeURIComponent(
      isbn,
    )}&post_type=product`;

  const searchPage =
    await fetchHtml(searchUrl);

  if (!searchPage) {
    return null;
  }

  /*
   * Manche WordPress-Shops leiten eine eindeutige
   * Suche direkt auf die Produktseite weiter.
   */
  if (
    new URL(
      searchPage.finalUrl,
    ).pathname.startsWith(
      "/shop/",
    )
  ) {
    return buildRetailerSource({
      source:
        "Buchhandlung Buchkultur",
      isbn,
      page: searchPage,
      priceSource:
        "Buchhandlung Buchkultur - Neupreis",
      reliabilityScore: 82,
    });
  }

  const productLinks =
    extractProductLinks(
      searchPage,
    );

  for (
    const productLink of
    productLinks
  ) {
    const productPage =
      await fetchHtml(
        productLink,
      );

    if (!productPage) {
      continue;
    }

    const source =
      buildRetailerSource({
        source:
          "Buchhandlung Buchkultur",
        isbn,
        page: productPage,
        priceSource:
          "Buchhandlung Buchkultur - Neupreis",
        reliabilityScore: 82,
      });

    if (source) {
      return source;
    }
  }

  /*
   * Fallback, falls die Suchseite selbst bereits
   * den exakten Titel einschließlich Preis enthält.
   */
  return buildRetailerSource({
    source:
      "Buchhandlung Buchkultur",
    isbn,
    page: searchPage,
    priceSource:
      "Buchhandlung Buchkultur - Suchergebnis",
    reliabilityScore: 76,
  });
}

export const isbnDePriceProvider:
  IsbnBookProvider = {
    name: "ISBN.de",
    enabled: true,
    resolve:
      resolveIsbnDePrice,
  };

export const buchkulturPriceProvider:
  IsbnBookProvider = {
    name:
      "Buchhandlung Buchkultur",
    enabled: true,
    resolve:
      resolveBuchkulturPrice,
  };

export const freeRetailerPriceProviders:
  IsbnBookProvider[] = [
    isbnDePriceProvider,
    buchkulturPriceProvider,
  ];
