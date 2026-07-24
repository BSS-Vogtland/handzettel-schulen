import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, "-");

function filePath(relative) {
  return path.join(root, ...relative.split("/"));
}

function read(relative) {
  const target = filePath(relative);

  if (!fs.existsSync(target)) {
    throw new Error(`File not found: ${relative}`);
  }

  return fs.readFileSync(target, "utf8").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function write(relative, content) {
  const target = filePath(relative);
  const backup = `${target}.before-isbn-book-stage1-${stamp}.bak`;

  fs.copyFileSync(target, backup);
  fs.writeFileSync(target, content, "utf8");

  console.log(`Updated: ${relative}`);
  console.log(`Backup:  ${path.relative(root, backup)}`);
}

function replaceOnce(content, from, to, label) {
  const first = content.indexOf(from);

  if (first < 0) {
    throw new Error(`Anchor not found: ${label}`);
  }

  if (content.indexOf(from, first + from.length) >= 0) {
    throw new Error(`Anchor is not unique: ${label}`);
  }

  return content.slice(0, first) + to + content.slice(first + from.length);
}

function replaceCount(content, from, to, expected, label) {
  let count = 0;
  let cursor = 0;
  let result = "";

  while (true) {
    const index = content.indexOf(from, cursor);

    if (index < 0) {
      break;
    }

    result += content.slice(cursor, index) + to;
    cursor = index + from.length;
    count += 1;
  }

  result += content.slice(cursor);

  if (count !== expected) {
    throw new Error(
      `${label}: expected ${expected} matches, found ${count}`,
    );
  }

  return result;
}

function replaceInSection(
  content,
  startMarker,
  endMarker,
  from,
  to,
  label,
) {
  const start = content.indexOf(startMarker);

  if (start < 0) {
    throw new Error(`Section start not found: ${label}`);
  }

  const end = content.indexOf(
    endMarker,
    start + startMarker.length,
  );

  if (end < 0) {
    throw new Error(`Section end not found: ${label}`);
  }

  const section = content.slice(start, end);
  const replaced = replaceOnce(section, from, to, label);

  return content.slice(0, start) + replaced + content.slice(end);
}

function replaceRegexOnce(content, regex, replacement, label) {
  const searchFlags = regex.flags.includes("g")
    ? regex.flags
    : `${regex.flags}g`;

  const matches = [
    ...content.matchAll(new RegExp(regex.source, searchFlags)),
  ];

  if (matches.length !== 1) {
    throw new Error(
      `${label}: expected 1 regex match, found ${matches.length}`,
    );
  }

  return content.replace(regex, replacement);
}

function patchIsbnSearch() {
  const relative =
    "app/api/admin/products/isbn-search/route.ts";

  let content = read(relative);

  if (
    content.includes(
      "book_price_confirmation_status?: string | null;",
    )
  ) {
    console.log(`Skipped (already patched): ${relative}`);
    return;
  }

  content = replaceOnce(
    content,
`  image_url?: string | null;
  image_styled_url?: string | null;
};`,
`  image_url?: string | null;
  image_styled_url?: string | null;
  price?: number | string | null;
  tax_rate?: number | string | null;
  is_book?: boolean | null;
  book_price_confirmation_status?: string | null;
  book_price_source?: string | null;
};`,
    "isbn-search ExistingProductRow",
  );

  content = replaceInSection(
    content,
    "function parseCornelsenProduct(",
    "function isValidIsbn10(",
`    recommendedPrice: null,
    priceCurrency: null,
    priceSource: null,`,
`    recommendedPrice: offer?.price || fallbackPrice,
    priceCurrency:
      offer?.currency || (fallbackPrice ? "EUR" : null),
    priceSource:
      offer?.price || fallbackPrice
        ? "Cornelsen Verlag - Verkaufspreis"
        : null,`,
    "Cornelsen price mapping",
  );

  content = replaceInSection(
    content,
    "async function loadGoogleBook(",
    "async function loadOpenLibraryBook(",
`  const info = exactItem.volumeInfo;
  if (!info?.title) {`,
`  const info = exactItem.volumeInfo;
  const saleInfo = exactItem.saleInfo;

  const googlePrice =
    saleInfo?.country === "DE" &&
    saleInfo?.isEbook !== true &&
    (saleInfo.retailPrice?.currencyCode === "EUR" ||
      saleInfo.listPrice?.currencyCode === "EUR")
      ? parsePriceNumber(
          saleInfo.retailPrice?.amount ||
            saleInfo.listPrice?.amount,
        )
      : null;

  if (!info?.title) {`,
    "Google sale information",
  );

  content = replaceInSection(
    content,
    "async function loadGoogleBook(",
    "async function loadOpenLibraryBook(",
`    recommendedPrice: null,
    priceCurrency: null,
    priceSource: null,`,
`    recommendedPrice: googlePrice,
    priceCurrency: googlePrice ? "EUR" : null,
    priceSource: googlePrice
      ? "Google Books - Preisangabe Deutschland"
      : null,`,
    "Google price mapping",
  );

  content = replaceOnce(
    content,
`        imageUrl:
          cleanString(product.image_styled_url) ||
          cleanString(product.image_url),
      };`,
`        imageUrl:
          cleanString(product.image_styled_url) ||
          cleanString(product.image_url),
        productPrice: parsePriceNumber(product.price),
        taxRate: Number(product.tax_rate) === 7 ? 7 : 19,
        isBook: product.is_book === true,
        priceConfirmationStatus:
          cleanString(
            product.book_price_confirmation_status,
          ) || "not_required",
        priceSource: cleanString(
          product.book_price_source,
        ),
      };`,
    "existing product price and tax response",
  );

  write(relative, content);
}

function patchMerge() {
  const relative = "lib/isbn/merge.ts";
  let content = read(relative);

  if (
    content.includes(
      "source.recommendedPrice !== null",
    )
  ) {
    console.log(`Skipped (already patched): ${relative}`);
    return;
  }

  content = replaceRegexOnce(
    content,
    /  const tradeSources = sources\.filter\([\s\S]*?\n  \);/,
`  const tradeSources = sources.filter(
    (source) =>
      source.recommendedPrice !== null &&
      source.recommendedPrice !== undefined,
  );`,
    "merge trade price sources",
  );

  write(relative, content);
}

function patchQuickCreate() {
  const relative =
    "app/api/admin/products/quick-create/route.ts";

  let content = read(relative);

  if (
    content.includes(
      "book_price_confirmation_status?: string | null;",
    )
  ) {
    console.log(`Skipped (already patched): ${relative}`);
    return;
  }

  content = replaceOnce(
    content,
`  book_size_note?: string | null;
  seo_slug?: string | null;`,
`  book_size_note?: string | null;
  is_book?: boolean | null;
  tax_rate?: number | string | null;
  book_isbn10?: string | null;
  book_isbn13?: string | null;
  book_publisher?: string | null;
  book_authors?: string[] | null;
  book_published_date?: string | null;
  book_price_original_gross?: number | string | null;
  book_price_source?: string | null;
  book_price_confirmation_status?: string | null;
  book_price_confirmed_at?: string | null;
  book_price_last_checked_at?: string | null;
  seo_slug?: string | null;`,
    "quick-create ProductRow book fields",
  );

  content = replaceOnce(
    content,
`function normalizeText(value: unknown) {`,
`function parseStringArray(value: unknown) {
  const text = String(value ?? "").trim();

  if (!text) {
    return [];
  }

  try {
    const parsed = JSON.parse(text);

    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => String(item ?? "").trim())
        .filter(Boolean);
    }
  } catch {
    // Fall through to line and comma parsing.
  }

  return text
    .split(/[\\n,;]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeTaxRate(value: unknown): 7 | 19 {
  return Number(value) === 7 ? 7 : 19;
}

function normalizeText(value: unknown) {`,
    "quick-create parsers",
  );

  content = replaceCount(
    content,
`    bookSizeNote: string;
  },`,
`    bookSizeNote: string;
    isBook: boolean;
    taxRate: 7 | 19;
    bookIsbn10: string | null;
    bookIsbn13: string | null;
    bookPublisher: string | null;
    bookAuthors: string[];
    bookPublishedDate: string | null;
    bookPriceOriginalGross: number | null;
    bookPriceSource: string | null;
    bookPriceConfirmationStatus: string;
  },`,
    2,
    "quick-create create/update input types",
  );

  content = replaceCount(
    content,
`      book_size_note: input.bookSizeNote || null,`,
`      book_size_note: input.bookSizeNote || null,
      is_book: input.isBook,
      tax_rate: input.taxRate,
      book_isbn10: input.bookIsbn10,
      book_isbn13: input.bookIsbn13,
      book_publisher: input.bookPublisher,
      book_authors: input.bookAuthors,
      book_published_date: input.bookPublishedDate,
      book_price_original_gross:
        input.bookPriceOriginalGross,
      book_price_source: input.bookPriceSource,
      book_price_confirmation_status:
        input.bookPriceConfirmationStatus,
      book_price_confirmed_at: null,
      book_price_last_checked_at:
        new Date().toISOString(),`,
    3,
    "quick-create insert payload book fields",
  );

  content = replaceOnce(
    content,
`  setIfColumnExists(
    updatePayload,
    product,
    "book_size_note",
    input.bookSizeNote || null,
  );

  setIfColumnExists(
    updatePayload,
    product,
    "match_keywords",`,
`  setIfColumnExists(
    updatePayload,
    product,
    "book_size_note",
    input.bookSizeNote || null,
  );

  setIfColumnExists(
    updatePayload,
    product,
    "is_book",
    input.isBook,
  );

  setIfColumnExists(
    updatePayload,
    product,
    "tax_rate",
    input.taxRate,
  );

  setIfColumnExists(
    updatePayload,
    product,
    "book_isbn10",
    input.bookIsbn10,
  );

  setIfColumnExists(
    updatePayload,
    product,
    "book_isbn13",
    input.bookIsbn13,
  );

  setIfColumnExists(
    updatePayload,
    product,
    "book_publisher",
    input.bookPublisher,
  );

  setIfColumnExists(
    updatePayload,
    product,
    "book_authors",
    input.bookAuthors,
  );

  setIfColumnExists(
    updatePayload,
    product,
    "book_published_date",
    input.bookPublishedDate,
  );

  setIfColumnExists(
    updatePayload,
    product,
    "book_price_original_gross",
    input.bookPriceOriginalGross,
  );

  setIfColumnExists(
    updatePayload,
    product,
    "book_price_source",
    input.bookPriceSource,
  );

  setIfColumnExists(
    updatePayload,
    product,
    "book_price_confirmation_status",
    input.bookPriceConfirmationStatus,
  );

  setIfColumnExists(
    updatePayload,
    product,
    "book_price_confirmed_at",
    null,
  );

  setIfColumnExists(
    updatePayload,
    product,
    "book_price_last_checked_at",
    now,
  );

  setIfColumnExists(
    updatePayload,
    product,
    "match_keywords",`,
    "quick-create update payload book fields",
  );

  content = replaceOnce(
    content,
`    const bookWidthMm = toOptionalInteger(formData.get("bookWidthMm"));
    const bookHeightMm = toOptionalInteger(formData.get("bookHeightMm"));
    const bookSizeNote = String(formData.get("bookSizeNote") || "").trim();`,
`    const bookWidthMm =
      toOptionalInteger(formData.get("bookWidthMm"));
    const bookHeightMm =
      toOptionalInteger(formData.get("bookHeightMm"));
    const bookSizeNote =
      String(formData.get("bookSizeNote") || "").trim();

    const isBook =
      String(formData.get("isBook") || "") === "true";

    const taxRate =
      normalizeTaxRate(formData.get("taxRate"));

    const bookIsbn10 =
      cleanString(formData.get("bookIsbn10"));

    const bookIsbn13 =
      cleanString(formData.get("bookIsbn13"));

    const bookPublisher =
      cleanString(formData.get("bookPublisher"));

    const bookAuthors =
      parseStringArray(formData.get("bookAuthors"));

    const bookPublishedDate = cleanString(
      formData.get("bookPublishedDate"),
    );

    const bookPriceOriginalGross = isBook
      ? toNumber(
          formData.get("bookPriceOriginalGross"),
          productPrice,
        )
      : null;

    const bookPriceSource = isBook
      ? cleanString(formData.get("bookPriceSource")) ||
        "ISBN-Import"
      : null;

    const requestedConfirmationStatus = cleanString(
      formData.get("bookPriceConfirmationStatus"),
    );

    const bookPriceConfirmationStatus = isBook
      ? requestedConfirmationStatus === "confirmed" ||
        requestedConfirmationStatus === "changed"
        ? requestedConfirmationStatus
        : "pending"
      : "not_required";`,
    "quick-create FormData book fields",
  );

  const validationAnchor =
`    if (
      (bookWidthMm !== null && bookHeightMm === null) ||`;

  const validationIndex =
    content.indexOf(validationAnchor);

  if (validationIndex < 0) {
    throw new Error(
      "Anchor not found: quick-create book measure validation",
    );
  }

  content =
    content.slice(0, validationIndex) +
`    if (isBook && productPrice <= 0) {
      return jsonResponse(
        {
          ok: false,
          message:
            "Ein Buch benoetigt einen Bruttoverkaufspreis groesser als 0 Euro.",
        },
        400,
      );
    }

` +
    content.slice(validationIndex);

  content = replaceOnce(
    content,
`        bookSizeNote,
      });`,
`        bookSizeNote,
        isBook,
        taxRate,
        bookIsbn10,
        bookIsbn13,
        bookPublisher,
        bookAuthors,
        bookPublishedDate,
        bookPriceOriginalGross,
        bookPriceSource,
        bookPriceConfirmationStatus,
      });`,
    "quick-create update call",
  );

  content = replaceInSection(
    content,
    "    const product = await createProductFlexible",
    "    const aliasCount = await addAliasesFlexible",
`      bookSizeNote,
    });`,
`      bookSizeNote,
      isBook,
      taxRate,
      bookIsbn10,
      bookIsbn13,
      bookPublisher,
      bookAuthors,
      bookPublishedDate,
      bookPriceOriginalGross,
      bookPriceSource,
      bookPriceConfirmationStatus,
    });`,
    "quick-create create call",
  );

  write(relative, content);
}

function patchIsbnImportTool() {
  const relative = "components/AdminIsbnImportTool.tsx";
  let content = read(relative);

  if (content.includes("const [taxRate, setTaxRate]")) {
    console.log(`Skipped (already patched): ${relative}`);
    return;
  }

  content = replaceOnce(
    content,
`  imageUrl: string | null;
};`,
`  imageUrl: string | null;
  productPrice?: number | null;
  taxRate?: 7 | 19;
  isBook?: boolean;
  priceConfirmationStatus?: string | null;
  priceSource?: string | null;
};`,
    "ISBN import ExistingProduct type",
  );

  content = replaceOnce(
    content,
`  const [productPrice, setProductPrice] = useState("");
  const [category, setCategory] = useState("");`,
`  const [productPrice, setProductPrice] = useState("");
  const [taxRate, setTaxRate] = useState<7 | 19>(7);
  const [category, setCategory] = useState("");`,
    "ISBN import tax state",
  );

  content = replaceOnce(
    content,
`    setProductName(buildInitialProductName(book));
    setProductPrice(formatPriceInput(book.recommendedPrice));
    setCategory(getDefaultBookCategory());`,
`    setProductName(buildInitialProductName(book));
    setProductPrice(formatPriceInput(book.recommendedPrice));
    setTaxRate(7);
    setCategory(getDefaultBookCategory());`,
    "ISBN import tax initialization",
  );

  content = replaceOnce(
    content,
`    setProductName("");
    setProductPrice("");
    setCategory("");`,
`    setProductName("");
    setProductPrice("");
    setTaxRate(7);
    setCategory("");`,
    "ISBN import tax reset",
  );

  content = replaceOnce(
    content,
`      formData.append("productPrice", parsedPrice.toFixed(2));
      formData.append("category", normalizedCategory);`,
`      formData.append(
        "productPrice",
        parsedPrice.toFixed(2),
      );

      formData.append("isBook", "true");
      formData.append("taxRate", String(taxRate));
      formData.append(
        "bookIsbn10",
        book.isbn10 || "",
      );
      formData.append(
        "bookIsbn13",
        book.isbn13 || "",
      );
      formData.append(
        "bookPublisher",
        book.publisher || "",
      );
      formData.append(
        "bookAuthors",
        JSON.stringify(book.authors || []),
      );
      formData.append(
        "bookPublishedDate",
        book.publishedDate || "",
      );
      formData.append(
        "bookPriceOriginalGross",
        parsedPrice.toFixed(2),
      );
      formData.append(
        "bookPriceSource",
        book.priceSource ||
          "ISBN-Import - manuell gepruefter Preis",
      );
      formData.append(
        "bookPriceConfirmationStatus",
        "pending",
      );

      formData.append("category", normalizedCategory);`,
    "ISBN import FormData book fields",
  );

  content = replaceRegexOnce(
    content,
    /Der Preis wird bewusst nicht aus externen Buchdaten[\s\S]*?manuell eintragen\./,
    "Der gebundene Buchpreis wird aus der verf\u00fcgbaren Preisquelle vorbelegt. Falls keine Preisangabe gefunden wurde, trage den Preis vor dem Import manuell ein. Die sp\u00e4tere H\u00e4ndlerbest\u00e4tigung blockiert den Verkauf nicht.",
    "ISBN import price help text",
  );

  content = replaceOnce(
    content,
`                <label>
                  <span className="mb-2 block text-sm font-black text-[#102A43]">
                    Kategorie*
                  </span>`,
`                <label>
                  <span className="mb-2 block text-sm font-black text-[#102A43]">
                    Umsatzsteuersatz*
                  </span>

                  <select
                    value={taxRate}
                    onChange={(event) =>
                      setTaxRate(
                        event.target.value === "7" ? 7 : 19,
                      )
                    }
                    disabled={
                      isImporting ||
                      Boolean(existingProduct)
                    }
                    className="min-h-12 w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 text-sm font-semibold text-[#102A43] outline-none transition focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10 disabled:bg-[#F3F4F5]"
                  >
                    <option value={7}>7 %</option>
                    <option value={19}>19 %</option>
                  </select>

                  <span className="mt-2 block text-xs font-semibold leading-5 text-[#7B8792]">
                    Gedruckte Schulb\u00fccher werden mit
                    7 % vorbelegt. Der H\u00e4ndler muss Preis
                    und Steuersatz in der bestehenden Voranfrage
                    best\u00e4tigen oder \u00e4ndern.
                  </span>
                </label>

                <label>
                  <span className="mb-2 block text-sm font-black text-[#102A43]">
                    Kategorie*
                  </span>`,
    "ISBN import tax selector",
  );

  content = replaceOnce(
    content,
`              <div className="rounded-[24px] border border-[#E8DED2] bg-[#FBF7F0] p-4">`,
`              <div className="rounded-[24px] border border-[#F1D1A8] bg-[#FFF8EE] p-4">
                <p className="text-sm font-black text-[#8A4A1F]">
                  H\u00e4ndlerbest\u00e4tigung nach dem Import
                  ausstehend
                </p>

                <p className="mt-1 text-xs font-semibold leading-5 text-[#52616F]">
                  Das Buch wird sofort aktiv angelegt und kann
                  bereits gelistet und verkauft werden. In der
                  bestehenden Voranfrage muss die Buchhandlung
                  den Preis und den Umsatzsteuersatz sp\u00e4ter
                  best\u00e4tigen oder korrigieren.
                </p>

                {book.priceSource ? (
                  <p className="mt-2 text-xs font-black text-[#102A43]">
                    Preisquelle: {book.priceSource}
                  </p>
                ) : null}
              </div>

              <div className="rounded-[24px] border border-[#E8DED2] bg-[#FBF7F0] p-4">`,
    "ISBN import pending confirmation notice",
  );

  write(relative, content);
}

try {
  patchIsbnSearch();
  patchMerge();
  patchQuickCreate();
  patchIsbnImportTool();

  console.log("");
  console.log(
    "ISBN book product stage 1 applied successfully.",
  );
} catch (error) {
  console.error("");
  console.error("Patch failed:");
  console.error(
    error instanceof Error ? error.message : error,
  );

  process.exit(1);
}