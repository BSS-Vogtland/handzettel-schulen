import {
  convertIsbn10To13,
  isValidIsbn,
  isValidIsbn10,
  normalizeIsbn,
} from "@/lib/isbn/utils";

const ISBN_CANDIDATE_PATTERN =
  /(?:97[89][\s\u00ad\u2010\u2011\u2012\u2013\u2014\u2212-]*)?(?:\d[\s\u00ad\u2010\u2011\u2012\u2013\u2014\u2212-]*){9}[\dX]/gi;

export type RequestBookIdentity = {
  isBook: boolean;
  isbn10: string | null;
  isbn13: string | null;
  candidates: string[];
  primaryIsbn: string | null;
};

type RequestItemLike = {
  is_book?: boolean | null;
  book_isbn10?: string | null;
  book_isbn13?: string | null;

  raw_text?: string | null;
  normalized_name?: string | null;
  notes?: string | null;
};

type ProductLike = {
  is_book?: boolean | null;
  ean?: string | null;
  book_isbn10?: string | null;
  book_isbn13?: string | null;
};

function uniqueStrings(values: string[]) {
  return Array.from(
    new Set(
      values.filter(Boolean),
    ),
  );
}

export function normalizeValidIsbn(
  value: unknown,
) {
  const isbn = normalizeIsbn(value);

  return isValidIsbn(isbn)
    ? isbn
    : null;
}

export function convertIsbn13To10(
  value: unknown,
) {
  const isbn13 = normalizeIsbn(value);

  if (
    !/^978\d{10}$/.test(isbn13)
  ) {
    return null;
  }

  const base = isbn13.slice(3, 12);

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

  const remainder =
    11 - (sum % 11);

  let checkDigit: string;

  if (remainder === 10) {
    checkDigit = "X";
  } else if (remainder === 11) {
    checkDigit = "0";
  } else {
    checkDigit = String(remainder);
  }

  const isbn10 =
    `${base}${checkDigit}`;

  return isValidIsbn10(isbn10)
    ? isbn10
    : null;
}

export function extractIsbnCandidates(
  ...values: unknown[]
) {
  const candidates: string[] = [];

  for (const value of values) {
    const text = String(value ?? "");

    const matches =
      text.match(
        ISBN_CANDIDATE_PATTERN,
      ) || [];

    for (const match of matches) {
      const normalized =
        normalizeValidIsbn(match);

      if (normalized) {
        candidates.push(normalized);
      }
    }
  }

  return uniqueStrings(candidates);
}

export function buildIsbnVariants(
  ...values: unknown[]
) {
  const candidates =
    uniqueStrings(
      values
        .map(normalizeValidIsbn)
        .filter(
          (value): value is string =>
            Boolean(value),
        ),
    );

  const variants =
    new Set<string>();

  for (const candidate of candidates) {
    variants.add(candidate);

    if (candidate.length === 10) {
      const isbn13 =
        convertIsbn10To13(candidate);

      if (isbn13) {
        variants.add(isbn13);
      }
    }

    if (candidate.length === 13) {
      const isbn10 =
        convertIsbn13To10(candidate);

      if (isbn10) {
        variants.add(isbn10);
      }
    }
  }

  return Array.from(variants);
}

export function getRequestItemBookIdentity(
  item: RequestItemLike,
): RequestBookIdentity {
  const directCandidates =
    buildIsbnVariants(
      item.book_isbn10,
      item.book_isbn13,
    );

  const text = [
    item.raw_text,
    item.normalized_name,
    item.notes,
  ]
    .filter(Boolean)
    .join(" ");

  const hasExplicitIsbnLabel =
    /\bISBN(?:-1[03])?\b/i.test(
      text,
    );

  const textCandidates =
    hasExplicitIsbnLabel
      ? buildIsbnVariants(
          ...extractIsbnCandidates(text),
        )
      : [];

  const candidates =
    uniqueStrings([
      ...directCandidates,
      ...textCandidates,
    ]);

  const isbn13 =
    candidates.find(
      (candidate) =>
        candidate.length === 13,
    ) || null;

  const isbn10 =
    candidates.find(
      (candidate) =>
        candidate.length === 10,
    ) ||
    (isbn13
      ? convertIsbn13To10(isbn13)
      : null);

  const isBook =
    item.is_book === true ||
    candidates.length > 0;

  return {
    isBook,
    isbn10,
    isbn13,
    candidates,
    primaryIsbn:
      isbn13 || isbn10 || null,
  };
}

export function getProductBookIdentity(
  product: ProductLike,
): RequestBookIdentity {
  const hasBookFields =
    Boolean(product.book_isbn10) ||
    Boolean(product.book_isbn13);

  const isBook =
    product.is_book === true ||
    hasBookFields;

  const candidates = isBook
    ? buildIsbnVariants(
        product.book_isbn10,
        product.book_isbn13,
        product.ean,
      )
    : [];

  const isbn13 =
    candidates.find(
      (candidate) =>
        candidate.length === 13,
    ) || null;

  const isbn10 =
    candidates.find(
      (candidate) =>
        candidate.length === 10,
    ) ||
    (isbn13
      ? convertIsbn13To10(isbn13)
      : null);

  return {
    isBook,
    isbn10,
    isbn13,
    candidates,
    primaryIsbn:
      isbn13 || isbn10 || null,
  };
}

export function findExactBookIsbnMatch(
  item: RequestItemLike,
  product: ProductLike,
) {
  const itemIdentity =
    getRequestItemBookIdentity(item);

  if (
    !itemIdentity.isBook ||
    itemIdentity.candidates.length === 0
  ) {
    return null;
  }

  const productIdentity =
    getProductBookIdentity(product);

  if (
    !productIdentity.isBook ||
    productIdentity.candidates.length === 0
  ) {
    return null;
  }

  const productCandidates =
    new Set(
      productIdentity.candidates,
    );

  return (
    itemIdentity.candidates.find(
      (candidate) =>
        productCandidates.has(
          candidate,
        ),
    ) || null
  );
}

export function stripIsbnFromBookTitle(
  value: unknown,
) {
  return String(value ?? "")
    .replace(
      /\s*ISBN(?:-1[03])?\s*:?\s*(?:97[89][\s\u00ad\u2010\u2011\u2012\u2013\u2014\u2212-]*)?(?:\d[\s\u00ad\u2010\u2011\u2012\u2013\u2014\u2212-]*){9}[\dX].*$/i,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
}