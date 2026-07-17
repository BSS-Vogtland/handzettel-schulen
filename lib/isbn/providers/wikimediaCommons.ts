import type { IsbnBookProvider, IsbnBookSource } from "@/lib/isbn/types";
import {
  cleanIsbnString,
  convertIsbn10To13,
  fetchIsbnJson,
  normalizeIsbn,
} from "@/lib/isbn/utils";

type CommonsMetadataValue = {
  value?: string;
};

type CommonsImageInfo = {
  url?: string;
  thumburl?: string;
  width?: number;
  height?: number;
  extmetadata?: Record<string, CommonsMetadataValue | undefined>;
};

type CommonsPage = {
  pageid?: number;
  title?: string;
  imageinfo?: CommonsImageInfo[];
};

type CommonsApiResponse = {
  query?: {
    pages?: Record<string, CommonsPage>;
  };
};

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#([0-9]+);/g, (_match, decimal: string) =>
      String.fromCodePoint(Number.parseInt(decimal, 10)),
    );
}

function toPlainText(value: unknown) {
  const raw = cleanIsbnString(value);

  if (!raw) {
    return null;
  }

  return cleanIsbnString(
    decodeHtmlEntities(raw.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " "),
  );
}

function convertIsbn13To10(isbn13: string) {
  if (!/^978\d{10}$/.test(isbn13)) {
    return null;
  }

  const base = isbn13.slice(3, 12);
  const sum = base.split("").reduce((total, character, index) => {
    return total + Number(character) * (10 - index);
  }, 0);

  const remainder = sum % 11;
  const checkValue = (11 - remainder) % 11;
  const checkDigit = checkValue === 10 ? "X" : String(checkValue);

  return `${base}${checkDigit}`;
}

function getSearchIsbns(isbn: string) {
  const normalized = normalizeIsbn(isbn);
  const values = new Set<string>([normalized]);

  if (normalized.length === 10) {
    const isbn13 = convertIsbn10To13(normalized);
    if (isbn13) values.add(isbn13);
  }

  if (normalized.length === 13) {
    const isbn10 = convertIsbn13To10(normalized);
    if (isbn10) values.add(isbn10);
  }

  return [...values];
}

function extractIsbnCandidates(value: string) {
  const matches = value.match(/[0-9Xx][0-9Xx\s-]{8,24}[0-9Xx]/g) || [];

  return matches
    .map((match) => normalizeIsbn(match))
    .filter((candidate) => candidate.length === 10 || candidate.length === 13);
}

function metadataContainsExactIsbn(
  page: CommonsPage,
  imageInfo: CommonsImageInfo,
  acceptedIsbns: string[],
) {
  const metadata = imageInfo.extmetadata || {};
  const searchableValues = [
    page.title,
    metadata.ObjectName?.value,
    metadata.ImageDescription?.value,
    metadata.Credit?.value,
    metadata.Categories?.value,
  ]
    .map((value) => toPlainText(value) || "")
    .join(" ");

  const candidates = extractIsbnCandidates(searchableValues);

  return candidates.some((candidate) => acceptedIsbns.includes(candidate));
}

function getReusableLicense(imageInfo: CommonsImageInfo) {
  const metadata = imageInfo.extmetadata || {};
  const licenseShortName = toPlainText(metadata.LicenseShortName?.value);
  const usageTerms = toPlainText(metadata.UsageTerms?.value);
  const licenseUrl = cleanIsbnString(metadata.LicenseUrl?.value);
  const combined = `${licenseShortName || ""} ${usageTerms || ""}`
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  if (combined.includes("cc0")) {
    return {
      usageStatus: "cc0" as const,
      license: licenseShortName || usageTerms || "CC0",
      licenseUrl,
    };
  }

  if (
    combined.includes("public domain") ||
    combined.includes("gemeinfrei") ||
    combined.includes("pd-old") ||
    combined === "pd"
  ) {
    return {
      usageStatus: "public_domain" as const,
      license: licenseShortName || usageTerms || "Public Domain",
      licenseUrl,
    };
  }

  return null;
}

function scoreCandidate(imageInfo: CommonsImageInfo) {
  const width = Number(imageInfo.width || 0);
  const height = Number(imageInfo.height || 0);
  const ratio = width > 0 && height > 0 ? width / height : 0;
  const portraitScore = ratio >= 0.5 && ratio <= 0.9 ? 100 : 0;
  const resolutionScore = Math.min(width * height, 4_000_000) / 100_000;

  return portraitScore + resolutionScore;
}

async function resolveWikimediaCommonsCover(
  isbn: string,
): Promise<IsbnBookSource | null> {
  const acceptedIsbns = getSearchIsbns(isbn);
  const query = acceptedIsbns.map((value) => `"${value}"`).join(" OR ");

  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: query,
    gsrnamespace: "6",
    gsrlimit: "20",
    prop: "imageinfo",
    iiprop: "url|size|extmetadata",
    iiurlwidth: "1600",
    format: "json",
    formatversion: "2",
    origin: "*",
  });

  const response = await fetchIsbnJson<CommonsApiResponse>(
    `https://commons.wikimedia.org/w/api.php?${params.toString()}`,
    { timeoutMs: 14000 },
  );

  const pages = Object.values(response?.query?.pages || {});
  const candidates = pages.flatMap((page) => {
    const imageInfo = page.imageinfo?.[0];

    if (!imageInfo) {
      return [];
    }

    const license = getReusableLicense(imageInfo);

    if (!license) {
      return [];
    }

    if (!metadataContainsExactIsbn(page, imageInfo, acceptedIsbns)) {
      return [];
    }

    const coverUrl = cleanIsbnString(imageInfo.thumburl || imageInfo.url);

    if (!coverUrl || !coverUrl.startsWith("https://upload.wikimedia.org/")) {
      return [];
    }

    const sourceUrl = page.title
      ? `https://commons.wikimedia.org/wiki/${encodeURIComponent(
          page.title.replace(/ /g, "_"),
        )}`
      : null;

    const metadata = imageInfo.extmetadata || {};
    const attribution =
      toPlainText(metadata.Artist?.value) ||
      toPlainText(metadata.Credit?.value) ||
      "Wikimedia Commons";

    return [
      {
        page,
        imageInfo,
        license,
        coverUrl,
        sourceUrl,
        attribution,
        score: scoreCandidate(imageInfo),
      },
    ];
  });

  const bestCandidate = candidates.sort(
    (left, right) => right.score - left.score,
  )[0];

  if (!bestCandidate) {
    return null;
  }

  return {
    source: "Wikimedia Commons",
    sourceId: bestCandidate.page.pageid
      ? String(bestCandidate.page.pageid)
      : cleanIsbnString(bestCandidate.page.title),
    sourceUrl: bestCandidate.sourceUrl,
    coverUrl: bestCandidate.coverUrl,
    coverSource: "Wikimedia Commons",
    coverSourceUrl: bestCandidate.sourceUrl,
    coverCanBeImported: true,
    coverDeliveryMode: "download",
    coverUsageStatus: bestCandidate.license.usageStatus,
    coverLicense: bestCandidate.license.license,
    coverLicenseUrl: bestCandidate.license.licenseUrl,
    coverAttribution: bestCandidate.attribution,
    coverRightsNote:
      bestCandidate.license.usageStatus === "cc0"
        ? "Das Cover ist bei Wikimedia Commons als CC0 gekennzeichnet."
        : "Das Cover ist bei Wikimedia Commons als gemeinfrei gekennzeichnet.",
  };
}

export const wikimediaCommonsProvider: IsbnBookProvider = {
  name: "Wikimedia Commons",
  enabled: true,
  resolve: resolveWikimediaCommonsCover,
};
