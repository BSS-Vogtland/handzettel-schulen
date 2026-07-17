import type {
  IsbnBookProvider,
  IsbnBookSource,
} from "@/lib/isbn/types";
import {
  cleanIsbnString,
  fetchIsbnJson,
  forceHttps,
  normalizeIsbn,
  parseIsbnPrice,
  uniqueIsbnStrings,
} from "@/lib/isbn/utils";

/*
  Der konkrete VLB-Endpunkt und die Authentifizierung hängen vom
  freigeschalteten VLB-Vertrag und der verwendeten API-Version ab.

  Deshalb wird der Provider nur aktiv, wenn diese Variablen vorhanden sind:

  VLB_API_BASE_URL
  VLB_API_TOKEN

  Optional:
  VLB_API_TOKEN_HEADER
  VLB_API_TOKEN_PREFIX
*/

type VlbRecord = Record<string, unknown>;

function readString(
  record: VlbRecord,
  keys: string[]
) {
  for (const key of keys) {
    const value = cleanIsbnString(record[key]);

    if (value) {
      return value;
    }
  }

  return null;
}

function readNumber(
  record: VlbRecord,
  keys: string[]
) {
  for (const key of keys) {
    const value = parseIsbnPrice(record[key]);

    if (value !== null) {
      return value;
    }
  }

  return null;
}

function readStringArray(
  record: VlbRecord,
  keys: string[]
) {
  const values: string[] = [];

  for (const key of keys) {
    const raw = record[key];

    if (Array.isArray(raw)) {
      for (const item of raw) {
        if (typeof item === "string") {
          values.push(item);
          continue;
        }

        if (item && typeof item === "object") {
          const itemRecord = item as Record<string, unknown>;

          values.push(
            String(
              itemRecord.name ||
                itemRecord.title ||
                itemRecord.value ||
                ""
            )
          );
        }
      }
    } else if (typeof raw === "string") {
      values.push(raw);
    }
  }

  return uniqueIsbnStrings(values);
}

function unwrapVlbRecord(payload: unknown): VlbRecord | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const root = payload as VlbRecord;

  const candidates = [
    root.product,
    root.book,
    root.item,
    root.result,
    Array.isArray(root.products) ? root.products[0] : null,
    Array.isArray(root.items) ? root.items[0] : null,
    Array.isArray(root.results) ? root.results[0] : null,
    payload,
  ];

  for (const candidate of candidates) {
    if (candidate && typeof candidate === "object") {
      return candidate as VlbRecord;
    }
  }

  return null;
}

function mapVlbRecord(
  record: VlbRecord,
  requestedIsbn: string
): IsbnBookSource | null {
  const title = readString(record, [
    "title",
    "productTitle",
    "product_name",
    "name",
  ]);

  if (!title) {
    return null;
  }

  const isbn13 =
    normalizeIsbn(
      readString(record, [
        "isbn13",
        "isbn_13",
        "ean",
        "gtin13",
        "productIdentifier",
      ])
    ) || (requestedIsbn.length === 13 ? requestedIsbn : null);

  const isbn10 =
    normalizeIsbn(
      readString(record, ["isbn10", "isbn_10"])
    ) || (requestedIsbn.length === 10 ? requestedIsbn : null);

  const recommendedPrice = readNumber(record, [
    "recommendedPrice",
    "listPrice",
    "fixedRetailPrice",
    "retailPrice",
    "price",
    "amount",
  ]);

  return {
    source: "VLB",

    sourceId: readString(record, [
      "id",
      "productId",
      "recordId",
      "vlbId",
    ]),

    sourceUrl: forceHttps(
      readString(record, [
        "url",
        "productUrl",
        "detailUrl",
      ])
    ),

    title,

    subtitle: readString(record, [
      "subtitle",
      "subTitle",
    ]),

    authors: readStringArray(record, [
      "authors",
      "contributors",
      "creators",
    ]),

    publisher: readString(record, [
      "publisher",
      "publisherName",
      "imprint",
    ]),

    publishedDate: readString(record, [
      "publishedDate",
      "publicationDate",
      "publishingDate",
    ]),

    edition: readString(record, [
      "edition",
      "editionStatement",
    ]),

    description: readString(record, [
      "description",
      "annotation",
      "shortDescription",
      "longDescription",
    ]),

    pageCount: readNumber(record, [
      "pageCount",
      "pages",
      "numberOfPages",
    ]),

    language: readString(record, [
      "language",
      "languageCode",
    ]),

    subjects: readStringArray(record, [
      "subjects",
      "categories",
      "keywords",
    ]),

    isbn10,
    isbn13,

    coverUrl: forceHttps(
      readString(record, [
        "coverUrl",
        "cover",
        "imageUrl",
        "image",
        "mediaUrl",
      ])
    ),

    coverSource: "VLB",

    recommendedPrice,

    priceCurrency:
      readString(record, [
        "priceCurrency",
        "currency",
        "currencyCode",
      ]) || (recommendedPrice ? "EUR" : null),

    priceSource: recommendedPrice ? "VLB" : null,

    availability: readString(record, [
      "availability",
      "availabilityStatus",
      "supplyStatus",
    ]),
  };
}

async function resolveVlb(
  isbn: string
): Promise<IsbnBookSource | null> {
  const baseUrl = cleanIsbnString(process.env.VLB_API_BASE_URL);
  const token = cleanIsbnString(process.env.VLB_API_TOKEN);

  if (!baseUrl || !token) {
    return null;
  }

  const tokenHeader =
    cleanIsbnString(process.env.VLB_API_TOKEN_HEADER) ||
    "Authorization";

  const tokenPrefix =
    process.env.VLB_API_TOKEN_PREFIX === undefined
      ? "Bearer"
      : String(process.env.VLB_API_TOKEN_PREFIX).trim();

  const authorizationValue = tokenPrefix
    ? `${tokenPrefix} ${token}`
    : token;

  const requestUrl = new URL(
    `${baseUrl.replace(/\/+$/, "")}/${encodeURIComponent(isbn)}`
  );

  const payload = await fetchIsbnJson<unknown>(
    requestUrl.toString(),
    {
      timeoutMs: 15000,
      headers: {
        [tokenHeader]: authorizationValue,
      },
    }
  );

  const record = unwrapVlbRecord(payload);

  if (!record) {
    return null;
  }

  return mapVlbRecord(record, isbn);
}

export const vlbProvider: IsbnBookProvider = {
  name: "VLB",
  enabled: Boolean(
    cleanIsbnString(process.env.VLB_API_BASE_URL) &&
      cleanIsbnString(process.env.VLB_API_TOKEN)
  ),
  resolve: resolveVlb,
};