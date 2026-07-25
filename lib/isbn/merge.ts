import type {
  IsbnBookSource,
  IsbnCoverCandidate,
  IsbnPriceCandidate,
  IsbnPriceConsensus,
  IsbnPriceSourceKind,
  MergedIsbnBook,
} from "@/lib/isbn/types";
import {
  convertIsbn10To13,
  normalizeIsbn,
  uniqueIsbnStrings,
} from "@/lib/isbn/utils";

const OFFICIAL_PUBLISHER_SOURCES = new Set([
  "Cornelsen Verlag",
  "Ernst Klett Verlag",
  "Westermann Verlag",
  "C.C. Buchner Verlag",
  "BVK Buch Verlag Kempen",
  "Jandorfverlag",
]);

const PRICE_SOURCE_PRIORITY = [
  "VLB",
  "Cornelsen Verlag",
  "Ernst Klett Verlag",
  "Westermann Verlag",
  "C.C. Buchner Verlag",
  "BVK Buch Verlag Kempen",
  "Jandorfverlag",
  "Google Books",
  "Open Library",
  "Deutsche Nationalbibliothek",
];

function firstValue<T>(
  sources: IsbnBookSource[],
  getter: (
    source: IsbnBookSource,
  ) => T | null | undefined,
) {
  for (const source of sources) {
    const value = getter(source);

    if (
      value !== null &&
      value !== undefined &&
      value !== ""
    ) {
      return value;
    }
  }

  return null;
}

function sortSources(
  sources: IsbnBookSource[],
  order: string[],
) {
  return [...sources].sort(
    (left, right) => {
      const leftIndex = order.indexOf(
        left.source,
      );

      const rightIndex = order.indexOf(
        right.source,
      );

      const normalizedLeft =
        leftIndex === -1
          ? Number.MAX_SAFE_INTEGER
          : leftIndex;

      const normalizedRight =
        rightIndex === -1
          ? Number.MAX_SAFE_INTEGER
          : rightIndex;

      return normalizedLeft - normalizedRight;
    },
  );
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function normalizeCurrency(
  value: unknown,
) {
  const currency = String(value || "EUR")
    .trim()
    .toUpperCase();

  return currency || "EUR";
}

function parsePositivePrice(
  value: unknown,
) {
  const parsed = Number(value);

  if (
    !Number.isFinite(parsed) ||
    parsed <= 0 ||
    parsed > 5000
  ) {
    return null;
  }

  return roundMoney(parsed);
}

function convertIsbn13To10(
  isbnValue: string,
) {
  const isbn = normalizeIsbn(isbnValue);

  if (
    !/^978\d{10}$/.test(isbn)
  ) {
    return null;
  }

  const base = isbn.slice(3, 12);

  let sum = 0;

  for (
    let index = 0;
    index < base.length;
    index += 1
  ) {
    sum +=
      Number(base[index]) *
      (10 - index);
  }

  const remainder = 11 - (sum % 11);

  let checkDigit: string;

  if (remainder === 10) {
    checkDigit = "X";
  } else if (
    remainder === 11
  ) {
    checkDigit = "0";
  } else {
    checkDigit = String(remainder);
  }

  return `${base}${checkDigit}`;
}

function buildRequestedIsbnVariants(
  requestedIsbn: string,
) {
  const normalized =
    normalizeIsbn(requestedIsbn);

  const variants = new Set<string>();

  if (normalized) {
    variants.add(normalized);
  }

  if (normalized.length === 10) {
    const isbn13 =
      convertIsbn10To13(normalized);

    if (isbn13) {
      variants.add(isbn13);
    }
  }

  if (normalized.length === 13) {
    const isbn10 =
      convertIsbn13To10(normalized);

    if (isbn10) {
      variants.add(isbn10);
    }
  }

  return variants;
}

function sourceMatchesRequestedIsbn(
  source: IsbnBookSource,
  requestedVariants: Set<string>,
) {
  const candidates = [
    source.isbn10,
    source.isbn13,
    source.sourceId,
  ]
    .map((value) =>
      normalizeIsbn(value),
    )
    .filter(Boolean);

  return candidates.some((candidate) =>
    requestedVariants.has(candidate),
  );
}

function inferPriceSourceKind(
  source: IsbnBookSource,
): IsbnPriceSourceKind {
  if (source.priceSourceKind) {
    return source.priceSourceKind;
  }

  if (
    source.source === "VLB"
  ) {
    return "vlb";
  }

  if (
    OFFICIAL_PUBLISHER_SOURCES.has(
      source.source,
    )
  ) {
    return "official_publisher";
  }

  if (
    source.source ===
      "Google Books" ||
    source.source ===
      "Open Library"
  ) {
    return "platform";
  }

  if (
    source.source ===
    "Deutsche Nationalbibliothek"
  ) {
    return "library";
  }

  const normalizedSource =
    source.source.toLowerCase();

  if (
    normalizedSource.includes(
      "buchhandlung",
    ) ||
    normalizedSource.includes(
      "buchhandel",
    ) ||
    normalizedSource.includes(
      "retailer",
    ) ||
    normalizedSource.includes(
      "shop",
    )
  ) {
    return "retailer";
  }

  return "unknown";
}

function inferOfficialPublisher(
  source: IsbnBookSource,
  sourceKind: IsbnPriceSourceKind,
) {
  if (
    source.priceIsOfficialPublisher !==
    null &&
    source.priceIsOfficialPublisher !==
    undefined
  ) {
    return (
      source.priceIsOfficialPublisher ===
      true
    );
  }

  return (
    sourceKind ===
      "official_publisher" ||
    OFFICIAL_PUBLISHER_SOURCES.has(
      source.source,
    )
  );
}

function defaultReliabilityScore(
  sourceKind: IsbnPriceSourceKind,
) {
  switch (sourceKind) {
    case "official_publisher":
      return 100;

    case "vlb":
      return 98;

    case "retailer":
      return 78;

    case "platform":
      return 58;

    case "library":
      return 35;

    default:
      return 45;
  }
}

function clampReliabilityScore(
  value: number,
) {
  return Math.max(
    0,
    Math.min(
      100,
      Math.round(value),
    ),
  );
}

function getPricePriorityIndex(
  source: string,
) {
  const index =
    PRICE_SOURCE_PRIORITY.indexOf(
      source,
    );

  return index === -1
    ? Number.MAX_SAFE_INTEGER
    : index;
}

function buildPriceCandidates(input: {
  requestedIsbn: string;
  sources: IsbnBookSource[];
}) {
  const requestedVariants =
    buildRequestedIsbnVariants(
      input.requestedIsbn,
    );

  const candidates: IsbnPriceCandidate[] =
    [];

  const seen =
    new Set<string>();

  for (const source of input.sources) {
    const amount =
      parsePositivePrice(
        source.recommendedPrice,
      );

    if (amount === null) {
      continue;
    }

    const currency =
      normalizeCurrency(
        source.priceCurrency,
      );

    const sourceKind =
      inferPriceSourceKind(source);

    const isOfficialPublisher =
      inferOfficialPublisher(
        source,
        sourceKind,
      );

    const exactIsbnMatch =
      source.priceExactIsbnMatch ??
      sourceMatchesRequestedIsbn(
        source,
        requestedVariants,
      );

    const explicitScore =
      Number(
        source.priceReliabilityScore,
      );

    const baseScore =
      Number.isFinite(explicitScore)
        ? explicitScore
        : defaultReliabilityScore(
            sourceKind,
          );

    const reliabilityScore =
      clampReliabilityScore(
        baseScore +
          (exactIsbnMatch ? 3 : 0),
      );

    const sourceUrl =
      source.sourceUrl || null;

    const priceSource =
      source.priceSource ||
      source.source;

    const dedupeKey = [
      source.source,
      sourceUrl || "",
      amount.toFixed(2),
      currency,
    ].join("|");

    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);

    candidates.push({
      source: source.source,
      sourceUrl,
      amount,
      currency,
      priceSource,
      availability:
        source.availability || null,
      sourceKind,
      isOfficialPublisher,
      exactIsbnMatch,
      reliabilityScore,
      selected: false,
    });
  }

  return candidates.sort(
    (left, right) => {
      if (
        left.isOfficialPublisher !==
        right.isOfficialPublisher
      ) {
        return left.isOfficialPublisher
          ? -1
          : 1;
      }

      if (
        left.reliabilityScore !==
        right.reliabilityScore
      ) {
        return (
          right.reliabilityScore -
          left.reliabilityScore
        );
      }

      return (
        getPricePriorityIndex(
          left.source,
        ) -
        getPricePriorityIndex(
          right.source,
        )
      );
    },
  );
}

type CandidateGroup = {
  key: string;
  amount: number;
  currency: string;
  candidates: IsbnPriceCandidate[];
  sourceCount: number;
  totalReliability: number;
  maximumReliability: number;
};

function groupPriceCandidates(
  candidates: IsbnPriceCandidate[],
) {
  const groups =
    new Map<string, CandidateGroup>();

  for (const candidate of candidates) {
    const key = [
      candidate.currency,
      candidate.amount.toFixed(2),
    ].join("|");

    const existing =
      groups.get(key);

    if (existing) {
      existing.candidates.push(
        candidate,
      );

      existing.totalReliability +=
        candidate.reliabilityScore;

      existing.maximumReliability =
        Math.max(
          existing.maximumReliability,
          candidate.reliabilityScore,
        );

      existing.sourceCount =
        new Set(
          existing.candidates.map(
            (entry) => entry.source,
          ),
        ).size;

      continue;
    }

    groups.set(key, {
      key,
      amount: candidate.amount,
      currency: candidate.currency,
      candidates: [candidate],
      sourceCount: 1,
      totalReliability:
        candidate.reliabilityScore,
      maximumReliability:
        candidate.reliabilityScore,
    });
  }

  return [...groups.values()].sort(
    (left, right) => {
      if (
        left.sourceCount !==
        right.sourceCount
      ) {
        return (
          right.sourceCount -
          left.sourceCount
        );
      }

      if (
        left.maximumReliability !==
        right.maximumReliability
      ) {
        return (
          right.maximumReliability -
          left.maximumReliability
        );
      }

      if (
        left.totalReliability !==
        right.totalReliability
      ) {
        return (
          right.totalReliability -
          left.totalReliability
        );
      }

      return left.amount - right.amount;
    },
  );
}

function buildConsensusSourceLabel(
  candidates: IsbnPriceCandidate[],
) {
  const labels = uniqueIsbnStrings(
    candidates.map(
      (candidate) =>
        candidate.priceSource ||
        candidate.source,
    ),
  );

  if (labels.length === 0) {
    return null;
  }

  if (labels.length === 1) {
    return labels[0];
  }

  return `Preis-Konsens: ${labels.join(
    " + ",
  )}`;
}

function buildPriceConsensus(
  candidates: IsbnPriceCandidate[],
): IsbnPriceConsensus {
  if (candidates.length === 0) {
    return {
      status: "missing",
      confidence: "none",

      selectedAmount: null,
      selectedCurrency: null,
      selectedSource: null,

      candidateCount: 0,
      confirmingSourceCount: 0,

      officialPublisherFound: false,
      conflicting: false,

      lowestAmount: null,
      highestAmount: null,
      priceDifference: null,

      message:
        "Es wurde keine belastbare Preisangabe gefunden.",

      candidates: [],
    };
  }

  const groups =
    groupPriceCandidates(candidates);

  const officialCandidates =
    candidates
      .filter(
        (candidate) =>
          candidate.isOfficialPublisher,
      )
      .sort((left, right) => {
        if (
          left.reliabilityScore !==
          right.reliabilityScore
        ) {
          return (
            right.reliabilityScore -
            left.reliabilityScore
          );
        }

        return (
          getPricePriorityIndex(
            left.source,
          ) -
          getPricePriorityIndex(
            right.source,
          )
        );
      });

  const officialCandidate =
    officialCandidates[0] || null;

  let selectedGroup:
    | CandidateGroup
    | null = null;

  if (officialCandidate) {
    selectedGroup =
      groups.find(
        (group) =>
          group.amount ===
            officialCandidate.amount &&
          group.currency ===
            officialCandidate.currency,
      ) || null;
  } else {
    selectedGroup =
      groups[0] || null;
  }

  if (!selectedGroup) {
    return {
      status: "missing",
      confidence: "none",

      selectedAmount: null,
      selectedCurrency: null,
      selectedSource: null,

      candidateCount:
        candidates.length,
      confirmingSourceCount: 0,

      officialPublisherFound:
        Boolean(officialCandidate),
      conflicting: false,

      lowestAmount: null,
      highestAmount: null,
      priceDifference: null,

      message:
        "Die Preisquellen konnten nicht ausgewertet werden.",

      candidates,
    };
  }

  const distinctAmounts =
    new Set(
      groups.map(
        (group) =>
          `${group.currency}|${group.amount.toFixed(
            2,
          )}`,
      ),
    );

  const conflicting =
    distinctAmounts.size > 1;

  const lowestAmount =
    Math.min(
      ...candidates.map(
        (candidate) =>
          candidate.amount,
      ),
    );

  const highestAmount =
    Math.max(
      ...candidates.map(
        (candidate) =>
          candidate.amount,
      ),
    );

  const priceDifference =
    roundMoney(
      highestAmount -
        lowestAmount,
    );

  let status:
    IsbnPriceConsensus["status"];

  let confidence:
    IsbnPriceConsensus["confidence"];

  let message: string;

  if (officialCandidate) {
    status =
      "official_publisher";

    confidence = "high";

    if (conflicting) {
      message =
        "Der offizielle Verlagspreis wurde ausgewählt. Mindestens eine weitere Quelle nennt einen abweichenden Preis.";
    } else if (
      selectedGroup.sourceCount >= 2
    ) {
      message =
        "Der offizielle Verlagspreis wird durch mindestens eine weitere Quelle bestätigt.";
    } else {
      message =
        "Der Preis stammt direkt von einer offiziellen Verlagsquelle.";
    }
  } else if (
    selectedGroup.sourceCount >= 2
  ) {
    status =
      "multi_source_consensus";

    confidence = "high";

    if (conflicting) {
      message =
        "Mehrere Quellen bestätigen denselben Preis. Weitere Quellen melden jedoch abweichende Werte.";
    } else {
      message =
        "Mindestens zwei unabhängige Quellen bestätigen denselben Preis.";
    }
  } else if (
    candidates.length === 1
  ) {
    status =
      "single_source";

    confidence =
      candidates[0]
        .reliabilityScore >= 75 &&
      candidates[0].exactIsbnMatch
        ? "medium"
        : "low";

    message =
      confidence === "medium"
        ? "Eine einzelne, plausibel zugeordnete Preisquelle wurde gefunden."
        : "Es wurde nur eine einzelne Preisquelle mit begrenzter Bestätigung gefunden.";
  } else {
    status = "conflict";
    confidence = "low";

    message =
      "Die gefundenen Preisquellen widersprechen sich. Der vorgeschlagene Preis muss vor der Produktanlage geprüft werden.";
  }

  const selectedCandidateKeys =
    new Set(
      selectedGroup.candidates.map(
        (candidate) =>
          [
            candidate.source,
            candidate.sourceUrl || "",
            candidate.amount.toFixed(2),
            candidate.currency,
          ].join("|"),
      ),
    );

  const markedCandidates =
    candidates.map(
      (candidate) => {
        const key = [
          candidate.source,
          candidate.sourceUrl || "",
          candidate.amount.toFixed(2),
          candidate.currency,
        ].join("|");

        return {
          ...candidate,
          selected:
            selectedCandidateKeys.has(
              key,
            ),
        };
      },
    );

  return {
    status,
    confidence,

    selectedAmount:
      selectedGroup.amount,

    selectedCurrency:
      selectedGroup.currency,

    selectedSource:
      buildConsensusSourceLabel(
        selectedGroup.candidates,
      ),

    candidateCount:
      candidates.length,

    confirmingSourceCount:
      selectedGroup.sourceCount,

    officialPublisherFound:
      Boolean(officialCandidate),

    conflicting,

    lowestAmount,
    highestAmount,
    priceDifference,

    message,

    candidates:
      markedCandidates,
  };
}

function findSelectedAvailability(input: {
  consensus: IsbnPriceConsensus;
  sources: IsbnBookSource[];
}) {
  const selectedCandidate =
    input.consensus.candidates.find(
      (candidate) =>
        candidate.selected &&
        candidate.availability,
    );

  if (
    selectedCandidate?.availability
  ) {
    return selectedCandidate.availability;
  }

  return firstValue(
    input.sources,
    (source) =>
      source.availability,
  );
}

export function buildCoverCandidates(
  sources: IsbnBookSource[],
): IsbnCoverCandidate[] {
  const orderedSources =
    sortSources(sources, [
      "Cornelsen Verlag",
      "Ernst Klett Verlag",
      "Westermann Verlag",
      "C.C. Buchner Verlag",
      "BVK Buch Verlag Kempen",
      "Jandorfverlag",
      "Wikimedia Commons",
      "Google Books",
      "Open Library",
    ]);

  const seen =
    new Set<string>();

  const candidates:
    IsbnCoverCandidate[] = [];

  for (const source of orderedSources) {
    const coverUrl =
      String(
        source.coverUrl || "",
      ).trim();

    if (
      !coverUrl ||
      seen.has(coverUrl)
    ) {
      continue;
    }

    seen.add(coverUrl);

    candidates.push({
      coverUrl,

      coverSource:
        source.coverSource ||
        source.source,

      coverSourceUrl:
        source.coverSourceUrl ||
        source.sourceUrl ||
        null,

      coverCanBeImported:
        source.coverCanBeImported ===
        true,

      coverDeliveryMode:
        source.coverDeliveryMode ||
        null,

      coverUsageStatus:
        source.coverUsageStatus ||
        null,

      coverLicense:
        source.coverLicense || null,

      coverLicenseUrl:
        source.coverLicenseUrl ||
        null,

      coverAttribution:
        source.coverAttribution ||
        null,

      coverRightsNote:
        source.coverRightsNote ||
        null,
    });
  }

  return candidates;
}

export function mergeIsbnBookSources(
  requestedIsbn: string,
  rawSources: IsbnBookSource[],
): MergedIsbnBook {
  const metadataSources =
    sortSources(rawSources, [
      "Deutsche Nationalbibliothek",
      "Cornelsen Verlag",
      "Ernst Klett Verlag",
      "Westermann Verlag",
      "C.C. Buchner Verlag",
      "BVK Buch Verlag Kempen",
      "Jandorfverlag",
      "VLB",
      "Google Books",
      "Open Library",
      "Wikimedia Commons",
    ]);

  const descriptionSources =
    sortSources(rawSources, [
      "Cornelsen Verlag",
      "Ernst Klett Verlag",
      "Westermann Verlag",
      "C.C. Buchner Verlag",
      "BVK Buch Verlag Kempen",
      "Jandorfverlag",
      "VLB",
      "Google Books",
      "Deutsche Nationalbibliothek",
      "Open Library",
      "Wikimedia Commons",
    ]);

  const coverCandidates =
    buildCoverCandidates(rawSources);

  const selectedCover =
    coverCandidates[0] || null;

  const requestedIsbn13 =
    requestedIsbn.length === 10
      ? convertIsbn10To13(
          requestedIsbn,
        )
      : requestedIsbn;

  const isbn10 =
    normalizeIsbn(
      firstValue(
        metadataSources,
        (source) =>
          source.isbn10,
      ),
    ) ||
    (requestedIsbn.length === 10
      ? requestedIsbn
      : null);

  const isbn13 =
    normalizeIsbn(
      firstValue(
        metadataSources,
        (source) =>
          source.isbn13,
      ),
    ) ||
    requestedIsbn13 ||
    (requestedIsbn.length === 13
      ? requestedIsbn
      : null);

  const priceCandidates =
    buildPriceCandidates({
      requestedIsbn,
      sources: rawSources,
    });

  const priceConsensus =
    buildPriceConsensus(
      priceCandidates,
    );

  const availability =
    findSelectedAvailability({
      consensus: priceConsensus,
      sources: metadataSources,
    });

  return {
    requestedIsbn,

    isbn10,
    isbn13,

    title:
      firstValue(
        metadataSources,
        (source) =>
          source.title,
      ),

    subtitle:
      firstValue(
        metadataSources,
        (source) =>
          source.subtitle,
      ),

    authors:
      uniqueIsbnStrings(
        metadataSources.flatMap(
          (source) =>
            source.authors || [],
        ),
      ),

    publisher:
      firstValue(
        metadataSources,
        (source) =>
          source.publisher,
      ),

    publishedDate:
      firstValue(
        metadataSources,
        (source) =>
          source.publishedDate,
      ),

    edition:
      firstValue(
        metadataSources,
        (source) =>
          source.edition,
      ),

    description:
      firstValue(
        descriptionSources,
        (source) =>
          source.description,
      ),

    pageCount:
      firstValue(
        metadataSources,
        (source) =>
          source.pageCount,
      ),

    language:
      firstValue(
        metadataSources,
        (source) =>
          source.language,
      ),

    subjects:
      uniqueIsbnStrings(
        metadataSources.flatMap(
          (source) =>
            source.subjects || [],
        ),
      ),

    coverUrl:
      selectedCover?.coverUrl ||
      null,

    coverSource:
      selectedCover?.coverSource ||
      null,

    coverSourceUrl:
      selectedCover?.coverSourceUrl ||
      null,

    coverCanBeImported:
      selectedCover
        ?.coverCanBeImported ===
      true,

    coverDeliveryMode:
      selectedCover
        ?.coverDeliveryMode ||
      null,

    coverUsageStatus:
      selectedCover
        ?.coverUsageStatus ||
      null,

    coverLicense:
      selectedCover
        ?.coverLicense ||
      null,

    coverLicenseUrl:
      selectedCover
        ?.coverLicenseUrl ||
      null,

    coverAttribution:
      selectedCover
        ?.coverAttribution ||
      null,

    coverRightsNote:
      selectedCover
        ?.coverRightsNote ||
      null,

    coverCandidates,

    recommendedPrice:
      priceConsensus
        .selectedAmount,

    priceCurrency:
      priceConsensus
        .selectedCurrency,

    priceSource:
      priceConsensus
        .selectedSource,

    priceCandidates:
      priceConsensus.candidates,

    priceConsensus,

    availability:
      availability || null,

    sources:
      uniqueIsbnStrings(
        metadataSources.map(
          (source) =>
            source.source,
        ),
      ),

    sourceDetails:
      metadataSources.map(
        (source) => ({
          name: source.source,

          sourceId:
            source.sourceId || null,

          sourceUrl:
            source.sourceUrl || null,

          coverFound:
            Boolean(
              source.coverUrl,
            ),

          coverUrl:
            source.coverUrl || null,

          priceFound:
            parsePositivePrice(
              source.recommendedPrice,
            ) !== null,

          recommendedPrice:
            parsePositivePrice(
              source.recommendedPrice,
            ),

          priceCurrency:
            parsePositivePrice(
              source.recommendedPrice,
            ) !== null
              ? normalizeCurrency(
                  source.priceCurrency,
                )
              : null,

          priceSource:
            source.priceSource ||
            null,

          availability:
            source.availability ||
            null,
        }),
      ),
  };
}