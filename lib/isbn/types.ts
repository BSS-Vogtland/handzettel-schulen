export type IsbnCoverDeliveryMode = "download" | "external" | "manual";

export type IsbnCoverUsageStatus =
  "public_domain" | "cc0" | "api_terms" | "manual_review";

export type IsbnBookSourceName =
  | "Deutsche Nationalbibliothek"
  | "Wikimedia Commons"
  | "Cornelsen Verlag"
  | "Google Books"
  | "Open Library"
  | string;

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
};

export type IsbnBookProvider = {
  name: IsbnBookSourceName;
  enabled: boolean;
  resolve: (isbn: string) => Promise<IsbnBookSource | null>;
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

  recommendedPrice: number | null;
  priceCurrency: string | null;
  priceSource: string | null;

  availability: string | null;

  sources: string[];
  sourceDetails: Array<{
    name: string;
    sourceId: string | null;
    sourceUrl: string | null;
  }>;
};
