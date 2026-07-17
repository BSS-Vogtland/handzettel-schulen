import type {
  IsbnBookSource,
  MergedIsbnBook,
} from "@/lib/isbn/types";
import {
  convertIsbn10To13,
  normalizeIsbn,
  uniqueIsbnStrings,
} from "@/lib/isbn/utils";

function firstValue<T>(
  sources: IsbnBookSource[],
  getter: (source: IsbnBookSource) => T | null | undefined
) {
  for (const source of sources) {
    const value = getter(source);

    if (value !== null && value !== undefined && value !== "") {
      return value;
    }
  }

  return null;
}

function prioritizeSources(sources: IsbnBookSource[]) {
  const order = [
    "VLB",
    "Deutsche Nationalbibliothek",
    "Google Books",
    "Open Library",
  ];

  return [...sources].sort((left, right) => {
    const leftIndex = order.indexOf(left.source);
    const rightIndex = order.indexOf(right.source);

    const normalizedLeft =
      leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
    const normalizedRight =
      rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;

    return normalizedLeft - normalizedRight;
  });
}

export function mergeIsbnBookSources(
  requestedIsbn: string,
  rawSources: IsbnBookSource[]
): MergedIsbnBook {
  const sources = prioritizeSources(rawSources);

  const requestedIsbn13 =
    requestedIsbn.length === 10
      ? convertIsbn10To13(requestedIsbn)
      : requestedIsbn;

  const isbn10 =
    normalizeIsbn(
      firstValue(sources, (source) => source.isbn10)
    ) ||
    (requestedIsbn.length === 10 ? requestedIsbn : null);

  const isbn13 =
    normalizeIsbn(
      firstValue(sources, (source) => source.isbn13)
    ) ||
    requestedIsbn13 ||
    (requestedIsbn.length === 13 ? requestedIsbn : null);

  const tradeSources = sources.filter(
    (source) =>
      source.source === "VLB" ||
      source.source === "Google Books"
  );

  const coverSources = sources.filter((source) =>
    Boolean(source.coverUrl)
  );

  return {
    requestedIsbn,

    isbn10,
    isbn13,

    title: firstValue(sources, (source) => source.title),
    subtitle: firstValue(sources, (source) => source.subtitle),

    authors: uniqueIsbnStrings(
      sources.flatMap((source) => source.authors || [])
    ),

    publisher: firstValue(sources, (source) => source.publisher),
    publishedDate: firstValue(
      sources,
      (source) => source.publishedDate
    ),
    edition: firstValue(sources, (source) => source.edition),

    description: firstValue(
      [
        ...tradeSources,
        ...sources.filter(
          (source) => !tradeSources.includes(source)
        ),
      ],
      (source) => source.description
    ),

    pageCount: firstValue(sources, (source) => source.pageCount),
    language: firstValue(sources, (source) => source.language),

    subjects: uniqueIsbnStrings(
      sources.flatMap((source) => source.subjects || [])
    ),

    coverUrl: firstValue(coverSources, (source) => source.coverUrl),
    coverSource: firstValue(
      coverSources,
      (source) => source.coverSource || source.source
    ),

    recommendedPrice: firstValue(
      tradeSources,
      (source) => source.recommendedPrice
    ),

    priceCurrency:
      firstValue(tradeSources, (source) => source.priceCurrency) ||
      (firstValue(
        tradeSources,
        (source) => source.recommendedPrice
      )
        ? "EUR"
        : null),

    priceSource: firstValue(
      tradeSources,
      (source) => source.priceSource || source.source
    ),

    availability: firstValue(
      tradeSources,
      (source) => source.availability
    ),

    sources: sources.map((source) => source.source),

    sourceDetails: sources.map((source) => ({
      name: source.source,
      sourceId: source.sourceId || null,
      sourceUrl: source.sourceUrl || null,
    })),
  };
}