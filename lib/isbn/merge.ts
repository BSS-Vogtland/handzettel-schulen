import type { IsbnBookSource, MergedIsbnBook } from "@/lib/isbn/types";
import {
  convertIsbn10To13,
  normalizeIsbn,
  uniqueIsbnStrings,
} from "@/lib/isbn/utils";

function firstValue<T>(
  sources: IsbnBookSource[],
  getter: (source: IsbnBookSource) => T | null | undefined,
) {
  for (const source of sources) {
    const value = getter(source);

    if (value !== null && value !== undefined && value !== "") {
      return value;
    }
  }

  return null;
}

function sortSources(sources: IsbnBookSource[], order: string[]) {
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

function selectCoverSource(sources: IsbnBookSource[]) {
  const coverSources = sources.filter((source) => Boolean(source.coverUrl));

  const importable = sortSources(
    coverSources.filter((source) => source.coverCanBeImported === true),
    ["Wikimedia Commons", "Google Books"],
  );

  if (importable[0]) {
    return importable[0];
  }

  return (
    sortSources(coverSources, [
      "Cornelsen Verlag",
      "Open Library",
      "Google Books",
      "Wikimedia Commons",
    ])[0] || null
  );
}

export function mergeIsbnBookSources(
  requestedIsbn: string,
  rawSources: IsbnBookSource[],
): MergedIsbnBook {
  const metadataSources = sortSources(rawSources, [
    "Deutsche Nationalbibliothek",
    "Cornelsen Verlag",
    "Google Books",
    "Open Library",
    "Wikimedia Commons",
  ]);

  const descriptionSources = sortSources(rawSources, [
    "Cornelsen Verlag",
    "Google Books",
    "Deutsche Nationalbibliothek",
    "Open Library",
    "Wikimedia Commons",
  ]);

  const selectedCover = selectCoverSource(rawSources);

  const requestedIsbn13 =
    requestedIsbn.length === 10
      ? convertIsbn10To13(requestedIsbn)
      : requestedIsbn;

  const isbn10 =
    normalizeIsbn(firstValue(metadataSources, (source) => source.isbn10)) ||
    (requestedIsbn.length === 10 ? requestedIsbn : null);

  const isbn13 =
    normalizeIsbn(firstValue(metadataSources, (source) => source.isbn13)) ||
    requestedIsbn13 ||
    (requestedIsbn.length === 13 ? requestedIsbn : null);

  return {
    requestedIsbn,

    isbn10,
    isbn13,

    title: firstValue(metadataSources, (source) => source.title),
    subtitle: firstValue(metadataSources, (source) => source.subtitle),

    authors: uniqueIsbnStrings(
      metadataSources.flatMap((source) => source.authors || []),
    ),

    publisher: firstValue(metadataSources, (source) => source.publisher),
    publishedDate: firstValue(
      metadataSources,
      (source) => source.publishedDate,
    ),
    edition: firstValue(metadataSources, (source) => source.edition),

    description: firstValue(descriptionSources, (source) => source.description),

    pageCount: firstValue(metadataSources, (source) => source.pageCount),
    language: firstValue(metadataSources, (source) => source.language),

    subjects: uniqueIsbnStrings(
      metadataSources.flatMap((source) => source.subjects || []),
    ),

    coverUrl: selectedCover?.coverUrl || null,
    coverSource: selectedCover?.coverSource || selectedCover?.source || null,
    coverSourceUrl:
      selectedCover?.coverSourceUrl || selectedCover?.sourceUrl || null,
    coverCanBeImported: selectedCover?.coverCanBeImported === true,
    coverDeliveryMode: selectedCover?.coverDeliveryMode || null,
    coverUsageStatus: selectedCover?.coverUsageStatus || null,
    coverLicense: selectedCover?.coverLicense || null,
    coverLicenseUrl: selectedCover?.coverLicenseUrl || null,
    coverAttribution: selectedCover?.coverAttribution || null,
    coverRightsNote: selectedCover?.coverRightsNote || null,

    // Verkaufspreise werden bewusst immer manuell geprüft und eingetragen.
    recommendedPrice: null,
    priceCurrency: null,
    priceSource: null,

    availability: firstValue(metadataSources, (source) => source.availability),

    sources: uniqueIsbnStrings(metadataSources.map((source) => source.source)),

    sourceDetails: metadataSources.map((source) => ({
      name: source.source,
      sourceId: source.sourceId || null,
      sourceUrl: source.sourceUrl || null,
    })),
  };
}
