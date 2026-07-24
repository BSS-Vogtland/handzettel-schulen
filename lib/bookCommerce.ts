export const BOOK_SHIPPING_AMOUNT = 1;
export const BOOK_COVER_UNIT_PRICE = 1.5;
export const BOOK_COVER_NAME = "Passende Buchhülle";

export type BookCommerceFulfillmentMethod =
  | "pickup"
  | "shipping"
  | string
  | null
  | undefined;

export type BookCommerceLineInput = {
  quantity?: number | string | null;

  isBook?: boolean | null;
  is_book?: boolean | null;
  isBookSnapshot?: boolean | null;
  is_book_snapshot?: boolean | null;

  bookIsbn13?: string | null;
  book_isbn13?: string | null;
  bookIsbn13Snapshot?: string | null;
  book_isbn13_snapshot?: string | null;

  bookCoverSelected?: boolean | null;
  book_cover_selected?: boolean | null;

  bookCoverUnitPrice?: number | string | null;
  book_cover_unit_price?: number | string | null;
};

export type BookCommerceLineSnapshot = {
  isBookSnapshot: boolean;
  bookIsbn13Snapshot: string | null;

  bookCoverSelected: boolean;
  bookCoverNameSnapshot: string | null;
  bookCoverQuantity: number;
  bookCoverUnitPrice: number;
  bookCoverTotalPrice: number;
};

export type BookCommerceSummary = {
  containsBooks: boolean;
  bookPositionCount: number;
  bookQuantity: number;

  bookCoverPositionCount: number;
  bookCoverQuantity: number;
  bookCoverAmount: number;

  bookShippingAmount: number;
};

function cleanString(value: unknown) {
  return String(value ?? "").trim();
}

export function toBookCommerceNumber(
  value: unknown,
  fallback = 0,
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return fallback;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  const parsed = Number(
    String(value)
      .trim()
      .replace(",", "."),
  );

  return Number.isFinite(parsed) ? parsed : fallback;
}

export function roundBookCommerceMoney(value: number) {
  return (
    Math.round(
      (toBookCommerceNumber(value, 0) + Number.EPSILON) * 100,
    ) / 100
  );
}

export function normalizeBookCommerceQuantity(
  value: unknown,
) {
  const parsed = Math.trunc(
    toBookCommerceNumber(value, 1),
  );

  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }

  return Math.min(parsed, 999);
}

export function normalizeBookIsbn13(
  value: unknown,
) {
  const normalized = cleanString(value)
    .toUpperCase()
    .replace(/[^0-9X]/g, "");

  if (normalized.length !== 13) {
    return null;
  }

  return normalized;
}

export function getBookIsbn13FromLine(
  line: BookCommerceLineInput,
) {
  return (
    normalizeBookIsbn13(line.bookIsbn13Snapshot) ||
    normalizeBookIsbn13(line.book_isbn13_snapshot) ||
    normalizeBookIsbn13(line.bookIsbn13) ||
    normalizeBookIsbn13(line.book_isbn13) ||
    null
  );
}

export function isBookCommerceLine(
  line: BookCommerceLineInput,
) {
  if (
    line.isBookSnapshot === true ||
    line.is_book_snapshot === true ||
    line.isBook === true ||
    line.is_book === true
  ) {
    return true;
  }

  return Boolean(getBookIsbn13FromLine(line));
}

export function isBookCoverSelected(
  line: BookCommerceLineInput,
) {
  if (!isBookCommerceLine(line)) {
    return false;
  }

  return (
    line.bookCoverSelected === true ||
    line.book_cover_selected === true
  );
}

export function getBookCoverUnitPrice(
  line: BookCommerceLineInput,
) {
  if (!isBookCoverSelected(line)) {
    return 0;
  }

  const storedUnitPrice =
    toBookCommerceNumber(
      line.bookCoverUnitPrice ??
        line.book_cover_unit_price,
      0,
    );

  if (storedUnitPrice > 0) {
    return roundBookCommerceMoney(storedUnitPrice);
  }

  return BOOK_COVER_UNIT_PRICE;
}

export function getBookCommerceLineSnapshot(
  line: BookCommerceLineInput,
): BookCommerceLineSnapshot {
  const isBookSnapshot = isBookCommerceLine(line);
  const bookIsbn13Snapshot = isBookSnapshot
    ? getBookIsbn13FromLine(line)
    : null;

  const bookCoverSelected =
    isBookSnapshot && isBookCoverSelected(line);

  const bookCoverQuantity = bookCoverSelected
    ? normalizeBookCommerceQuantity(line.quantity)
    : 0;

  const bookCoverUnitPrice = bookCoverSelected
    ? getBookCoverUnitPrice(line)
    : 0;

  const bookCoverTotalPrice = roundBookCommerceMoney(
    bookCoverQuantity * bookCoverUnitPrice,
  );

  return {
    isBookSnapshot,
    bookIsbn13Snapshot,

    bookCoverSelected,
    bookCoverNameSnapshot: bookCoverSelected
      ? BOOK_COVER_NAME
      : null,
    bookCoverQuantity,
    bookCoverUnitPrice,
    bookCoverTotalPrice,
  };
}

export function getBookShippingAmount(params: {
  containsBooks: boolean;
  fulfillmentMethod: BookCommerceFulfillmentMethod;
}) {
  const fulfillmentMethod = cleanString(
    params.fulfillmentMethod,
  ).toLowerCase();

  if (
    params.containsBooks &&
    fulfillmentMethod === "shipping"
  ) {
    return BOOK_SHIPPING_AMOUNT;
  }

  return 0;
}

export function calculateBookCommerceSummary(
  lines: BookCommerceLineInput[],
  fulfillmentMethod: BookCommerceFulfillmentMethod,
): BookCommerceSummary {
  let bookPositionCount = 0;
  let bookQuantity = 0;

  let bookCoverPositionCount = 0;
  let bookCoverQuantity = 0;
  let bookCoverAmount = 0;

  for (const line of lines) {
    const quantity = normalizeBookCommerceQuantity(
      line.quantity,
    );

    const snapshot =
      getBookCommerceLineSnapshot(line);

    if (snapshot.isBookSnapshot) {
      bookPositionCount += 1;
      bookQuantity += quantity;
    }

    if (snapshot.bookCoverSelected) {
      bookCoverPositionCount += 1;
      bookCoverQuantity += snapshot.bookCoverQuantity;
      bookCoverAmount += snapshot.bookCoverTotalPrice;
    }
  }

  const containsBooks = bookPositionCount > 0;

  return {
    containsBooks,
    bookPositionCount,
    bookQuantity,

    bookCoverPositionCount,
    bookCoverQuantity,
    bookCoverAmount:
      roundBookCommerceMoney(bookCoverAmount),

    bookShippingAmount: getBookShippingAmount({
      containsBooks,
      fulfillmentMethod,
    }),
  };
}

export function calculateBookCommerceTotal(params: {
  subtotalAmount: number;
  regularShippingAmount: number;
  bookSummary: Pick<
    BookCommerceSummary,
    "bookShippingAmount" | "bookCoverAmount"
  >;
  discountAmount?: number;
}) {
  const subtotalAmount = roundBookCommerceMoney(
    params.subtotalAmount,
  );

  const regularShippingAmount = roundBookCommerceMoney(
    params.regularShippingAmount,
  );

  const bookShippingAmount = roundBookCommerceMoney(
    params.bookSummary.bookShippingAmount,
  );

  const bookCoverAmount = roundBookCommerceMoney(
    params.bookSummary.bookCoverAmount,
  );

  const discountAmount = Math.max(
    0,
    roundBookCommerceMoney(
      params.discountAmount ?? 0,
    ),
  );

  return roundBookCommerceMoney(
    subtotalAmount +
      regularShippingAmount +
      bookShippingAmount +
      bookCoverAmount -
      discountAmount,
  );
}