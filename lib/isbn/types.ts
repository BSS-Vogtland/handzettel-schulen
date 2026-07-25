export type IsbnCoverDeliveryMode =
  | "download"
  | "external"
  | "manual";

export type IsbnCoverUsageStatus =
  | "public_domain"
  | "cc0"
  | "api_terms"
  | "manual_review";

export type IsbnCoverCandidate = {
  coverUrl: string;
  coverSource: string;
  coverSourceUrl: string | null;
  coverCanBeImported: boolean;
  coverDeliveryMode: IsbnCoverDeliveryMode | null;
  coverUsageStatus: IsbnCoverUsageStatus | null;
  coverLicense: string | null;
  coverLicenseUrl: string | null;
  coverAttribution: string | null;
  coverRightsNote: string | null;
};

export type IsbnBookSourceName =
  | "Deutsche Nationalbibliothek"
  | "Wikimedia Commons"
  | "Cornelsen Verlag"
  | "Ernst Klett Verlag"
  | "Westermann Verlag"
  | "C.C. Buchner Verlag"
  | "BVK Buch Verlag Kempen"
  | "Jandorfverlag"
  | "VLB"
  | "Google Books"
  | "Open Library"
  | string;

export type IsbnPriceSourceKind =
  | "official_publisher"
  | "vlb"
  | "retailer"
  | "platform"
  | "library"
  | "unknown";

export type IsbnPriceConfidence =
  | "high"
  | "medium"
  | "low"
  | "none";

export type IsbnPriceConsensusStatus =
  | "official_publisher"
  | "multi_source_consensus"
  | "single_source"
  | "conflict"
  | "missing";

export type IsbnPriceCandidate = {
  source: string;
  sourceUrl: string | null;

  amount: number;
  currency: string;
  priceSource: string;

  availability: string | null;

  sourceKind: IsbnPriceSourceKind;
  isOfficialPublisher: boolean;
  exactIsbnMatch: boolean;

  reliabilityScore: number;
  selected: boolean;
};

export type IsbnPriceConsensus = {
  status: IsbnPriceConsensusStatus;
  confidence: IsbnPriceConfidence;

  selectedAmount: number | null;
  selectedCurrency: string | null;
  selectedSource: string | null;

  candidateCount: number;
  confirmingSourceCount: number;

  officialPublisherFound: boolean;
  conflicting: boolean;

  lowestAmount: number | null;
  highestAmount: number | null;
  priceDifference: number | null;

  message: string;

  candidates: IsbnPriceCandidate[];
};

export type IsbnBookSource = {
  source: IsbnBookSourceName;
  sourceId?: string | null;
  sourceUrl?: string | null;

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
  coverSource?: string | null;
  coverSourceUrl?: string | null;
  coverCanBeImported?: boolean | null;
  coverDeliveryMode?: IsbnCoverDeliveryMode | null;
  coverUsageStatus?: IsbnCoverUsageStatus | null;
  coverLicense?: string | null;
  coverLicenseUrl?: string | null;
  coverAttribution?: string | null;
  coverRightsNote?: string | null;

  recommendedPrice?: number | null;
  priceCurrency?: string | null;
  priceSource?: string | null;

  availability?: string | null;

  /*
   * Optionale Vertrauensmerkmale für Preisquellen.
   *
   * Bestehende Provider müssen diese Felder nicht sofort setzen.
   * Die zentrale Merge-Logik kann die Werte anhand des Quellnamens
   * ableiten und später durch explizite Providerangaben überschreiben.
   */
  priceSourceKind?: IsbnPriceSourceKind | null;
  priceIsOfficialPublisher?: boolean | null;
  priceExactIsbnMatch?: boolean | null;
  priceReliabilityScore?: number | null;
};

export type IsbnBookProvider = {
  name: IsbnBookSourceName;
  enabled: boolean;
  resolve: (
    isbn: string,
  ) => Promise<IsbnBookSource | null>;
};

export type MergedIsbnBook = {
  requestedIsbn: string;

  isbn10: string | null;
  isbn13: string | null;

  title: string | null;
  subtitle: string | null;
  authors: string[];

  publisher: string | null;
  publishedDate: string | null;
  edition: string | null;
  description: string | null;

  pageCount: number | null;
  language: string | null;
  subjects: string[];

  coverUrl: string | null;
  coverSource: string | null;
  coverSourceUrl: string | null;
  coverCanBeImported: boolean;
  coverDeliveryMode: IsbnCoverDeliveryMode | null;
  coverUsageStatus: IsbnCoverUsageStatus | null;
  coverLicense: string | null;
  coverLicenseUrl: string | null;
  coverAttribution: string | null;
  coverRightsNote: string | null;
  coverCandidates: IsbnCoverCandidate[];

  /*
   * Rückwärtskompatible ausgewählte Preisfelder.
   *
   * Diese bleiben bestehen, damit Produkterfassung und bestehende
   * Schnittstellen weiterhin denselben Preis lesen können.
   */
  recommendedPrice: number | null;
  priceCurrency: string | null;
  priceSource: string | null;

  /*
   * Neue Mehrquellen-Auswertung.
   *
   * Die Felder sind vorerst optional, damit die Typenerweiterung
   * unabhängig von der anschließend folgenden Merge-Umstellung
   * eingecheckt und verwendet werden kann.
   */
  priceCandidates?: IsbnPriceCandidate[];
  priceConsensus?: IsbnPriceConsensus | null;

  availability: string | null;

  sources: string[];

  sourceDetails: Array<{
    name: string;
    sourceId: string | null;
    sourceUrl: string | null;

    coverFound: boolean;
    coverUrl: string | null;

    priceFound?: boolean;
    recommendedPrice?: number | null;
    priceCurrency?: string | null;
    priceSource?: string | null;
    availability?: string | null;
  }>;
};