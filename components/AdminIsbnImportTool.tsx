"use client";

import {
  PRODUCT_CATEGORY_OPTIONS,
  normalizeProductCategory,
} from "@/lib/productCategories";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Database,
  ExternalLink,
  ImageIcon,
  Loader2,
  PackagePlus,
  RotateCcw,
  Search,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type CoverCandidate = {
  coverUrl: string;
  coverSource: string;
  coverSourceUrl: string | null;
  coverCanBeImported: boolean;
  coverDeliveryMode: "download" | "external" | "manual" | null;
  coverUsageStatus:
    "public_domain" | "cc0" | "api_terms" | "manual_review" | null;
  coverLicense: string | null;
  coverLicenseUrl: string | null;
  coverAttribution: string | null;
  coverRightsNote: string | null;
};

type BookData = {
  requestedIsbn: string;
  isbn10: string | null;
  isbn13: string | null;
  title: string | null;
  subtitle: string | null;
  authors: string[];
  publisher: string | null;
  publishedDate: string | null;
  description: string | null;
  pageCount: number | null;
  language: string | null;
  subjects: string[];
  coverUrl: string | null;
  coverSource: string | null;
  coverSourceUrl: string | null;
  coverCanBeImported: boolean;
  coverDeliveryMode: "download" | "external" | "manual" | null;
  coverUsageStatus:
    "public_domain" | "cc0" | "api_terms" | "manual_review" | null;
  coverLicense: string | null;
  coverLicenseUrl: string | null;
  coverAttribution: string | null;
  coverRightsNote: string | null;
  coverCandidates: CoverCandidate[];
  recommendedPrice: number | null;
  priceCurrency: string | null;
  priceSource: string | null;
  sources: string[];
};

type ExistingProduct = {
  id: string;
  name: string;
  sku: string | null;
  ean: string | null;
  imageUrl: string | null;
};

type SearchResponse = {
  ok?: boolean;
  message?: string;
  book?: BookData;
  existingProduct?: ExistingProduct | null;
};

type QuickCreateResponse = {
  ok?: boolean;
  existing?: boolean;
  message?: string;
  aliasCount?: number;
  matchKeywordCount?: number;
  product?: {
    id: string;
    productName: string;
    productSku: string | null;
    ean?: string | null;
    productPrice: number;
    imageUrl?: string | null;
    seoSlug?: string | null;
    seoTitle?: string | null;
  };
};

type SavedProduct = NonNullable<QuickCreateResponse["product"]>;

function normalizeIsbnInput(value: string) {
  return value
    .toUpperCase()
    .replace(/[^0-9X]/g, "")
    .slice(0, 13);
}

function normalizeText(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .trim()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanText(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueTextList(values: Array<string | null | undefined>) {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const cleaned = cleanText(value);
    const key = normalizeText(cleaned);

    if (!cleaned || !key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(cleaned);
  }

  return result;
}

function formatPriceInput(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "";
  }

  return value.toFixed(2).replace(".", ",");
}

function parsePrice(value: string) {
  const normalized = value.trim().replace(/\s/g, "").replace(",", ".");
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : null;
}

function getLanguageLabel(language: string | null) {
  if (!language) {
    return null;
  }

  const normalized = language.toLowerCase();

  if (normalized === "de" || normalized === "ger" || normalized === "deu") {
    return "Deutsch";
  }
  if (normalized === "en" || normalized === "eng") return "Englisch";
  if (normalized === "fr" || normalized === "fre" || normalized === "fra") {
    return "Französisch";
  }
  if (normalized === "es" || normalized === "spa") return "Spanisch";
  if (normalized === "it" || normalized === "ita") return "Italienisch";
  if (normalized === "la" || normalized === "lat") return "Latein";

  return language.toUpperCase();
}

function getDefaultBookCategory() {
  const preferred = PRODUCT_CATEGORY_OPTIONS.find((option) => {
    const haystack = normalizeText(`${option.label} ${option.value}`);

    return (
      haystack.includes("schulbuch") ||
      haystack.includes("buecher") ||
      haystack.includes("buch")
    );
  });

  return preferred ? normalizeProductCategory(preferred.label) : "";
}

function buildInitialProductName(book: BookData) {
  return uniqueTextList([book.title, book.subtitle]).join(" – ");
}

function buildBookDetails(book: BookData) {
  const details = [
    book.publisher ? `Verlag: ${book.publisher}` : null,
    book.publishedDate ? `Erscheinungsjahr: ${book.publishedDate}` : null,
    book.pageCount ? `Seiten: ${book.pageCount}` : null,
    getLanguageLabel(book.language)
      ? `Sprache: ${getLanguageLabel(book.language)}`
      : null,
    book.authors.length > 0 ? `Autor(en): ${book.authors.join(", ")}` : null,
    book.isbn13 ? `ISBN-13: ${book.isbn13}` : null,
    book.isbn10 ? `ISBN-10: ${book.isbn10}` : null,
  ];

  return details.filter(Boolean).join("\n");
}

function buildGeneratedAliases(input: {
  book: BookData | null;
  productName: string;
  category: string;
  productType: string;
  format: string;
  color: string;
  lineature: string;
}) {
  const { book } = input;

  if (!book) {
    return [];
  }

  const values: Array<string | null | undefined> = [
    input.productName,
    book.title,
    book.subtitle,
    input.category,
    input.productType,
    input.format,
    input.color,
    input.lineature,
    book.publisher,
    book.isbn13,
    book.isbn10,
    ...book.authors,
    ...book.subjects,
  ];

  if (book.title && book.publisher) {
    values.push(`${book.title} ${book.publisher}`);
  }

  if (book.title && book.isbn13) {
    values.push(`${book.title} ${book.isbn13}`);
  }

  if (book.title && input.productType) {
    values.push(`${book.title} ${input.productType}`);
  }

  if (book.title && input.format) {
    values.push(`${book.title} ${input.format}`);
  }

  return uniqueTextList(values);
}

function getImageExtension(contentType: string | null) {
  const normalized = (contentType || "").toLowerCase();

  if (normalized.includes("png")) return "png";
  if (normalized.includes("webp")) return "webp";
  if (normalized.includes("avif")) return "avif";

  return "jpg";
}

function MetadataItem({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return (
    <div className="rounded-2xl border border-[#E8DED2] bg-white px-4 py-3">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-[#A75B28]">
        {label}
      </p>
      <p className="mt-1 text-sm font-bold leading-6 text-[#102A43]">{value}</p>
    </div>
  );
}

export default function AdminIsbnImportTool() {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [isbn, setIsbn] = useState("");
  const [book, setBook] = useState<BookData | null>(null);
  const [existingProduct, setExistingProduct] =
    useState<ExistingProduct | null>(null);

  const [productName, setProductName] = useState("");
  const [productPrice, setProductPrice] = useState("");
  const [category, setCategory] = useState("");
  const [productType, setProductType] = useState("");
  const [format, setFormat] = useState("");
  const [color, setColor] = useState("");
  const [lineature, setLineature] = useState("");
  const [bookWidthMm, setBookWidthMm] = useState("");
  const [bookHeightMm, setBookHeightMm] = useState("");
  const [bookSizeNote, setBookSizeNote] = useState("");
  const [aliases, setAliases] = useState("");
  const [aliasesWereManuallyEdited, setAliasesWereManuallyEdited] =
    useState(false);
  const [includeCover, setIncludeCover] = useState(false);

  const [isSearching, setIsSearching] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [savedProduct, setSavedProduct] = useState<SavedProduct | null>(null);
  const [coverLoadFailed, setCoverLoadFailed] = useState(false);
  const [activeCoverIndex, setActiveCoverIndex] = useState(0);

  const coverCandidates = useMemo<CoverCandidate[]>(() => {
    if (!book) {
      return [];
    }

    if (
      Array.isArray(book.coverCandidates) &&
      book.coverCandidates.length > 0
    ) {
      return book.coverCandidates;
    }

    if (!book.coverUrl) {
      return [];
    }

    return [
      {
        coverUrl: book.coverUrl,
        coverSource: book.coverSource || "Unbekannte Coverquelle",
        coverSourceUrl: book.coverSourceUrl,
        coverCanBeImported: book.coverCanBeImported,
        coverDeliveryMode: book.coverDeliveryMode,
        coverUsageStatus: book.coverUsageStatus,
        coverLicense: book.coverLicense,
        coverLicenseUrl: book.coverLicenseUrl,
        coverAttribution: book.coverAttribution,
        coverRightsNote: book.coverRightsNote,
      },
    ];
  }, [book]);

  const activeCover = coverCandidates[activeCoverIndex] || null;

  const generatedAliases = useMemo(
    () =>
      buildGeneratedAliases({
        book,
        productName,
        category,
        productType,
        format,
        color,
        lineature,
      }),
    [book, productName, category, productType, format, color, lineature],
  );

  useEffect(() => {
    if (!book) {
      return;
    }

    setProductName(buildInitialProductName(book));
    setProductPrice(formatPriceInput(book.recommendedPrice));
    setCategory(getDefaultBookCategory());
    setProductType("Schulbuch");
    setFormat("");
    setColor("");
    setLineature("");
    setBookWidthMm("");
    setBookHeightMm("");
    setBookSizeNote(buildBookDetails(book));
    setAliases("");
    setAliasesWereManuallyEdited(false);
    setActiveCoverIndex(0);
    setCoverLoadFailed(false);
    const firstCover = book.coverCandidates?.[0] || null;
    setIncludeCover(Boolean(firstCover?.coverCanBeImported));
    setSuccessMessage(null);
    setSavedProduct(null);
  }, [book]);

  useEffect(() => {
    if (!book || aliasesWereManuallyEdited) {
      return;
    }

    setAliases(generatedAliases.join("\n"));
  }, [book, generatedAliases, aliasesWereManuallyEdited]);

  async function requestBookData(normalizedIsbn: string) {
    const response = await fetch(
      `/api/admin/products/isbn-search?isbn=${encodeURIComponent(
        normalizedIsbn,
      )}`,
      {
        method: "GET",
        cache: "no-store",
      },
    );

    const rawText = await response.text();

    let payload: SearchResponse | null = null;

    try {
      payload = rawText ? (JSON.parse(rawText) as SearchResponse) : null;
    } catch {
      throw new Error(
        "Die ISBN-Route hat keine gültige JSON-Antwort geliefert.",
      );
    }

    if (!response.ok || !payload?.ok || !payload.book) {
      throw new Error(
        payload?.message || "Zu dieser ISBN wurde kein Buch gefunden.",
      );
    }

    return payload;
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSearching || isImporting) {
      return;
    }

    const normalizedIsbn = normalizeIsbnInput(isbn);

    setBook(null);
    setExistingProduct(null);
    setErrorMessage(null);
    setSuccessMessage(null);
    setSavedProduct(null);
    setCoverLoadFailed(false);
    setActiveCoverIndex(0);

    if (normalizedIsbn.length !== 10 && normalizedIsbn.length !== 13) {
      setErrorMessage("Bitte gib eine vollständige ISBN-10 oder ISBN-13 ein.");
      return;
    }

    setIsSearching(true);

    try {
      const payload = await requestBookData(normalizedIsbn);

      setIsbn(normalizedIsbn);
      setCoverLoadFailed(false);
      setBook(payload.book || null);
      setExistingProduct(payload.existingProduct || null);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Die ISBN-Suche konnte nicht ausgeführt werden.",
      );
    } finally {
      setIsSearching(false);
    }
  }

  function resetSearch() {
    setIsbn("");
    setBook(null);
    setExistingProduct(null);
    setProductName("");
    setProductPrice("");
    setCategory("");
    setProductType("");
    setFormat("");
    setColor("");
    setLineature("");
    setBookWidthMm("");
    setBookHeightMm("");
    setBookSizeNote("");
    setAliases("");
    setAliasesWereManuallyEdited(false);
    setIncludeCover(false);
    setErrorMessage(null);
    setSuccessMessage(null);
    setSavedProduct(null);
    setCoverLoadFailed(false);
    setActiveCoverIndex(0);

    window.setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  }

  function regenerateAliases() {
    setAliases(generatedAliases.join("\n"));
    setAliasesWereManuallyEdited(false);
    setSuccessMessage("Die Suchbegriffe wurden neu generiert.");
    setErrorMessage(null);
  }

  function selectCoverCandidate(index: number) {
    const candidate = coverCandidates[index];

    if (!candidate) {
      return;
    }

    setActiveCoverIndex(index);
    setCoverLoadFailed(false);
    setIncludeCover(candidate.coverCanBeImported);
  }

  function handleCoverLoadError() {
    const nextIndex = activeCoverIndex + 1;

    if (nextIndex < coverCandidates.length) {
      selectCoverCandidate(nextIndex);
      return;
    }

    setCoverLoadFailed(true);
    setIncludeCover(false);
  }

  async function downloadCoverFile(coverUrl: string, productIsbn: string) {
    const requestUrl = coverUrl.startsWith("/api/admin/products/isbn-cover")
      ? coverUrl
      : `/api/admin/products/isbn-cover?url=${encodeURIComponent(coverUrl)}`;

    const response = await fetch(requestUrl, {
      method: "GET",
      cache: "no-store",
    });

    if (!response.ok) {
      const rawText = await response.text();
      let message = "Das Cover konnte nicht über den Bildproxy geladen werden.";

      try {
        const payload = rawText
          ? (JSON.parse(rawText) as { message?: string })
          : null;
        message = payload?.message || message;
      } catch {
        if (rawText.trim()) {
          message = rawText.trim();
        }
      }

      throw new Error(message);
    }

    const contentType = response.headers.get("content-type");

    if (!contentType?.toLowerCase().startsWith("image/")) {
      throw new Error("Der Cover-Proxy hat keine Bilddatei geliefert.");
    }

    const blob = await response.blob();

    if (blob.size === 0) {
      throw new Error("Die geladene Cover-Datei ist leer.");
    }

    const extension = getImageExtension(contentType);

    return new File([blob], `isbn-${productIsbn}.${extension}`, {
      type: contentType,
    });
  }

  async function handleImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!book || isImporting || isSearching) {
      return;
    }

    setErrorMessage(null);
    setSuccessMessage(null);
    setSavedProduct(null);

    if (existingProduct) {
      setErrorMessage(
        "Der Import ist blockiert, weil diese ISBN bereits im Produktkatalog vorhanden ist.",
      );
      return;
    }

    if (!productName.trim()) {
      setErrorMessage("Bitte gib einen Produktnamen ein.");
      return;
    }

    const normalizedCategory = normalizeProductCategory(category);

    if (!normalizedCategory) {
      setErrorMessage("Bitte wähle eine Produktkategorie aus.");
      return;
    }

    const parsedPrice = parsePrice(productPrice);

    if (parsedPrice === null || parsedPrice <= 0) {
      setErrorMessage(
        "Bitte trage vor dem Import einen gültigen Verkaufspreis größer als 0 Euro ein.",
      );
      return;
    }

    if (
      (bookWidthMm.trim() && !bookHeightMm.trim()) ||
      (!bookWidthMm.trim() && bookHeightMm.trim())
    ) {
      setErrorMessage(
        "Bitte gib bei Buchmaßen entweder Breite und Höhe an oder lasse beide Felder leer.",
      );
      return;
    }

    const productIsbn = book.isbn13 || book.isbn10 || book.requestedIsbn;

    if (!productIsbn) {
      setErrorMessage("Für den Import fehlt eine gültige ISBN.");
      return;
    }

    setIsImporting(true);

    try {
      const freshSearch = await requestBookData(productIsbn);

      if (freshSearch.existingProduct) {
        setExistingProduct(freshSearch.existingProduct);
        throw new Error(
          "Der Import wurde abgebrochen, weil die ISBN inzwischen bereits im Produktkatalog vorhanden ist.",
        );
      }

      let coverFile: File | null = null;

      if (includeCover && !activeCover?.coverCanBeImported) {
        throw new Error(
          "Dieses Cover ist nur als Recherchehinweis verfügbar und darf nicht automatisch übernommen werden.",
        );
      }

      if (includeCover && activeCover?.coverUrl) {
        coverFile = await downloadCoverFile(activeCover.coverUrl, productIsbn);
      }

      const formData = new FormData();

      formData.append("productName", productName.trim());
      formData.append("productSku", "");
      formData.append("ean", productIsbn);
      formData.append("productPrice", parsedPrice.toFixed(2));
      formData.append("category", normalizedCategory);
      formData.append("productType", productType.trim());
      formData.append("format", format.trim());
      formData.append("color", color.trim());
      formData.append("lineature", lineature.trim());
      formData.append("bookWidthMm", bookWidthMm.trim());
      formData.append("bookHeightMm", bookHeightMm.trim());
      formData.append("bookSizeNote", bookSizeNote.trim());
      formData.append("aliases", aliases.trim());
      formData.append("rejectExisting", "true");
      formData.append("skipImageStyling", "true");
      formData.append(
        "imageSource",
        includeCover ? activeCover?.coverSource || "" : "",
      );
      formData.append(
        "imageSourceUrl",
        includeCover ? activeCover?.coverSourceUrl || "" : "",
      );
      formData.append(
        "imageLicense",
        includeCover ? activeCover?.coverLicense || "" : "",
      );
      formData.append(
        "imageLicenseUrl",
        includeCover ? activeCover?.coverLicenseUrl || "" : "",
      );
      formData.append(
        "imageAttribution",
        includeCover ? activeCover?.coverAttribution || "" : "",
      );
      formData.append(
        "imageUsageStatus",
        includeCover ? activeCover?.coverUsageStatus || "" : "",
      );

      if (coverFile) {
        formData.append("productImage", coverFile);
      }

      const response = await fetch("/api/admin/products/quick-create", {
        method: "POST",
        body: formData,
      });

      const rawText = await response.text();

      let payload: QuickCreateResponse | null = null;

      try {
        payload = rawText ? (JSON.parse(rawText) as QuickCreateResponse) : null;
      } catch {
        throw new Error(
          "Die Produktanlage hat keine gültige JSON-Antwort geliefert.",
        );
      }

      if (!response.ok || !payload?.ok || !payload.product) {
        throw new Error(
          payload?.message ||
            "Das Buch konnte nicht als Produkt angelegt werden.",
        );
      }

      if (payload.existing) {
        throw new Error(
          "Die Produktanlage hat eine bestehende Dublette erkannt und würde sie aktualisieren. Der ISBN-Import wurde deshalb nicht als erfolgreich übernommen.",
        );
      }

      setSavedProduct(payload.product);
      setSuccessMessage(
        payload.message ||
          `Das Buch wurde als Produkt angelegt. ${
            payload.aliasCount ?? 0
          } Suchbegriffe wurden gespeichert.`,
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Der ISBN-Import konnte nicht abgeschlossen werden.",
      );
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <div className="grid gap-5">
      <section className="rounded-[32px] border border-[#E8DED2] bg-white p-5 shadow-sm sm:p-7">
        <div className="mb-5">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[#FBF7F0] px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
            <BookOpen className="h-3.5 w-3.5" />
            ISBN-Suche
          </div>

          <h2 className="text-2xl font-black text-[#102A43]">
            Buch anhand der ISBN finden
          </h2>

          <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#52616F]">
            Gib eine ISBN-10 oder ISBN-13 ein. Grunddaten kommen vorrangig aus
            der Deutschen Nationalbibliothek. Cover werden zusätzlich über
            Wikimedia Commons und Google Books gesucht. Nicht eindeutig nutzbare
            Bilder werden nur als Recherchehinweis angezeigt.
          </p>
        </div>

        <form
          onSubmit={handleSearch}
          className="grid gap-3 sm:grid-cols-[1fr_auto_auto]"
        >
          <label className="block">
            <span className="mb-2 block text-sm font-black text-[#102A43]">
              ISBN*
            </span>

            <input
              ref={inputRef}
              type="text"
              value={isbn}
              onChange={(event) =>
                setIsbn(normalizeIsbnInput(event.target.value))
              }
              inputMode="text"
              autoComplete="off"
              autoFocus
              placeholder="z. B. 9783464811320"
              className="min-h-14 w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 text-lg font-black tracking-[0.08em] text-[#102A43] outline-none transition placeholder:tracking-normal placeholder:text-[#9AA7B2] focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
            />
          </label>

          <button
            type="submit"
            disabled={isSearching || isImporting}
            className="inline-flex min-h-14 items-center justify-center gap-2 self-end rounded-2xl bg-[#B5282D] px-6 py-4 text-sm font-black text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSearching ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Suche läuft …
              </>
            ) : (
              <>
                <Search className="h-5 w-5" />
                Buch suchen
              </>
            )}
          </button>

          <button
            type="button"
            onClick={resetSearch}
            disabled={isSearching || isImporting}
            className="inline-flex min-h-14 items-center justify-center gap-2 self-end rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] px-5 py-4 text-sm font-black text-[#12395F] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RotateCcw className="h-4 w-4" />
            Leeren
          </button>
        </form>

        {errorMessage && !book ? (
          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-[#F0C7C7] bg-[#FFF5F5] px-4 py-3 text-sm font-semibold leading-6 text-[#B5282D]">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        ) : null}
      </section>

      {book ? (
        <section className="rounded-[32px] border border-[#E8DED2] bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-[#F0FFF6] px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-[#2F7D50]">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Buch gefunden
              </div>

              <h2 className="text-2xl font-black text-[#102A43]">
                Produktdaten prüfen und übernehmen
              </h2>
            </div>

            <div className="flex flex-wrap gap-2">
              {book.sources.map((source) => (
                <span
                  key={source}
                  className="rounded-full border border-[#D6E7EF] bg-[#F5FAFD] px-3 py-1 text-xs font-black text-[#12395F]"
                >
                  {source}
                </span>
              ))}
            </div>
          </div>

          {existingProduct ? (
            <div className="mb-5 rounded-[26px] border border-[#F1D1A8] bg-[#FFF8EE] p-4">
              <div className="flex items-start gap-3">
                <Database className="mt-0.5 h-5 w-5 shrink-0 text-[#A75B28]" />

                <div className="min-w-0 flex-1">
                  <p className="font-black text-[#8A4A1F]">
                    Import blockiert: Dieses Buch existiert bereits.
                  </p>

                  <p className="mt-1 text-sm font-semibold leading-6 text-[#52616F]">
                    {existingProduct.name}
                    {existingProduct.sku
                      ? ` · Art.-Nr.: ${existingProduct.sku}`
                      : ""}
                    {existingProduct.ean
                      ? ` · EAN/ISBN: ${existingProduct.ean}`
                      : ""}
                  </p>

                  <Link
                    href={`/admin/produkte?q=${encodeURIComponent(
                      existingProduct.ean ||
                        existingProduct.sku ||
                        existingProduct.name,
                    )}`}
                    className="mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl bg-white px-4 py-2 text-sm font-black text-[#12395F] shadow-sm ring-1 ring-[#E8DED2] transition hover:bg-[#EEF4FA]"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Vorhandenes Produkt öffnen
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            <div className="mb-5 flex items-start gap-3 rounded-[26px] border border-[#BFE3CD] bg-[#F0FFF6] p-4 text-[#2F7D50]">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />

              <div>
                <p className="font-black">
                  Keine ISBN-Dublette im Produktkatalog gefunden.
                </p>
                <p className="mt-1 text-sm font-semibold leading-6">
                  Prüfe Preis, Kategorie und Produktdaten. Danach kann das Buch
                  über die bestehende Produktpipeline gespeichert werden.
                </p>
              </div>
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
            <div>
              <div className="overflow-hidden rounded-[28px] border border-[#E8DED2] bg-[#FBF7F0]">
                {activeCover && !coverLoadFailed ? (
                  <img
                    key={activeCover.coverUrl}
                    src={activeCover.coverUrl}
                    alt={book.title || "Buchcover"}
                    onError={handleCoverLoadError}
                    className="h-[360px] w-full object-contain p-4"
                  />
                ) : (
                  <div className="flex h-[360px] flex-col items-center justify-center p-6 text-center text-[#A75B28]">
                    <ImageIcon className="h-10 w-10" />
                    <p className="mt-3 font-black">Kein Cover gefunden</p>
                    <p className="mt-2 text-xs font-semibold leading-5 text-[#52616F]">
                      Der Import kann ohne Cover durchgeführt werden.
                    </p>
                  </div>
                )}
              </div>

              {activeCover &&
              !coverLoadFailed &&
              activeCover.coverCanBeImported ? (
                <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-2xl border border-[#BFE3CD] bg-[#F0FFF6] px-4 py-3">
                  <input
                    type="checkbox"
                    checked={includeCover}
                    onChange={(event) => setIncludeCover(event.target.checked)}
                    disabled={isImporting || Boolean(existingProduct)}
                    className="mt-1 h-4 w-4 rounded border-[#B8C6D1] text-[#B5282D] focus:ring-[#B5282D]"
                  />
                  <span>
                    <span className="block text-sm font-black text-[#102A43]">
                      Cover automatisch übernehmen
                    </span>
                    <span className="mt-1 block text-xs font-semibold leading-5 text-[#52616F]">
                      Das Originalcover wird technisch optimiert, aber bewusst
                      nicht mit einem KI-Hintergrund verändert. Quelle und
                      Nutzungsstatus werden am Produkt gespeichert.
                    </span>
                  </span>
                </label>
              ) : activeCover && !coverLoadFailed ? (
                <div className="mt-3 rounded-2xl border border-[#F1D1A8] bg-[#FFF8EE] px-4 py-3 text-xs font-semibold leading-5 text-[#8A4A1F]">
                  Dieses Bild wird nur als Recherchehinweis angezeigt. Es wird
                  nicht automatisch in den Produktkatalog übernommen. Lade bei
                  Bedarf später ein freigegebenes Cover manuell hoch.
                </div>
              ) : (
                <div className="mt-3 rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] px-4 py-3 text-xs font-semibold leading-5 text-[#52616F]">
                  Kein automatisch nutzbares Cover gefunden. Das Bild kann
                  später im Produkt manuell ergänzt werden.
                </div>
              )}

              {coverCandidates.length > 1 ? (
                <div className="mt-3 rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] p-3">
                  <p className="text-xs font-black uppercase tracking-[0.12em] text-[#A75B28]">
                    Gefundene Coverquellen
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {coverCandidates.map((candidate, index) => (
                      <button
                        key={`${candidate.coverSource}-${candidate.coverUrl}`}
                        type="button"
                        onClick={() => selectCoverCandidate(index)}
                        className={`rounded-xl px-3 py-2 text-xs font-black transition ${
                          index === activeCoverIndex
                            ? "bg-[#12395F] text-white"
                            : "bg-white text-[#12395F] ring-1 ring-[#D8C8B8] hover:bg-[#EEF4FA]"
                        }`}
                      >
                        {candidate.coverSource}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {activeCover ? (
                <div className="mt-3 rounded-2xl border border-[#E8DED2] bg-white px-4 py-3 text-xs font-semibold leading-5 text-[#52616F]">
                  <p>
                    <span className="font-black text-[#102A43]">
                      Coverquelle:
                    </span>{" "}
                    {activeCover.coverSource}
                  </p>
                  {activeCover.coverLicense ? (
                    <p className="mt-1">
                      <span className="font-black text-[#102A43]">
                        Nutzung:
                      </span>{" "}
                      {activeCover.coverLicense}
                    </p>
                  ) : null}
                  {activeCover.coverAttribution ? (
                    <p className="mt-1">
                      <span className="font-black text-[#102A43]">
                        Urheber/Quelle:
                      </span>{" "}
                      {activeCover.coverAttribution}
                    </p>
                  ) : null}
                  {activeCover.coverRightsNote ? (
                    <p className="mt-2 text-[#7B8792]">
                      {activeCover.coverRightsNote}
                    </p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-3">
                    {activeCover.coverSourceUrl ? (
                      <a
                        href={activeCover.coverSourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 font-black text-[#12395F] hover:underline"
                      >
                        Quelle öffnen
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    ) : null}
                    {activeCover.coverLicenseUrl ? (
                      <a
                        href={activeCover.coverLicenseUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 font-black text-[#12395F] hover:underline"
                      >
                        Bedingungen öffnen
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>

            <form onSubmit={handleImport} className="grid gap-5">
              <div>
                <h3 className="text-xl font-black text-[#102A43]">
                  Produktdaten
                </h3>
                <p className="mt-1 text-sm font-semibold leading-6 text-[#52616F]">
                  Alle Felder können vor dem Speichern angepasst werden. SKU,
                  SEO-Daten und Matching-Keywords erzeugt die vorhandene
                  Produktanlage automatisch. Buchcover bleiben unverändert und
                  erhalten keinen KI-Hintergrund.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="sm:col-span-2">
                  <span className="mb-2 block text-sm font-black text-[#102A43]">
                    Produktname*
                  </span>
                  <input
                    type="text"
                    value={productName}
                    onChange={(event) => setProductName(event.target.value)}
                    disabled={isImporting || Boolean(existingProduct)}
                    className="min-h-12 w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 text-sm font-semibold text-[#102A43] outline-none transition focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10 disabled:bg-[#F3F4F5]"
                  />
                </label>

                <label>
                  <span className="mb-2 block text-sm font-black text-[#102A43]">
                    Verkaufspreis in Euro*
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={productPrice}
                    onChange={(event) => setProductPrice(event.target.value)}
                    placeholder="z. B. 9,95"
                    disabled={isImporting || Boolean(existingProduct)}
                    className="min-h-12 w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 text-sm font-semibold text-[#102A43] outline-none transition focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10 disabled:bg-[#F3F4F5]"
                  />
                  <span className="mt-2 block text-xs font-semibold leading-5 text-[#7B8792]">
                    Der Preis wird bewusst nicht aus externen Buchdaten
                    übernommen. Bitte beim Lieferanten oder Verlag prüfen und
                    manuell eintragen.
                  </span>
                </label>

                <label>
                  <span className="mb-2 block text-sm font-black text-[#102A43]">
                    Kategorie*
                  </span>
                  <select
                    value={category}
                    onChange={(event) => setCategory(event.target.value)}
                    disabled={isImporting || Boolean(existingProduct)}
                    className="min-h-12 w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 text-sm font-semibold text-[#102A43] outline-none transition focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10 disabled:bg-[#F3F4F5]"
                  >
                    <option value="">Kategorie auswählen</option>
                    {PRODUCT_CATEGORY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.label}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span className="mb-2 block text-sm font-black text-[#102A43]">
                    Produkttyp
                  </span>
                  <input
                    type="text"
                    value={productType}
                    onChange={(event) => setProductType(event.target.value)}
                    placeholder="Schulbuch"
                    disabled={isImporting || Boolean(existingProduct)}
                    className="min-h-12 w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 text-sm font-semibold text-[#102A43] outline-none transition focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10 disabled:bg-[#F3F4F5]"
                  />
                </label>

                <label>
                  <span className="mb-2 block text-sm font-black text-[#102A43]">
                    Format
                  </span>
                  <input
                    type="text"
                    value={format}
                    onChange={(event) => setFormat(event.target.value)}
                    placeholder="Optional, z. B. A4"
                    disabled={isImporting || Boolean(existingProduct)}
                    className="min-h-12 w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 text-sm font-semibold text-[#102A43] outline-none transition focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10 disabled:bg-[#F3F4F5]"
                  />
                </label>

                <label>
                  <span className="mb-2 block text-sm font-black text-[#102A43]">
                    Farbe
                  </span>
                  <input
                    type="text"
                    value={color}
                    onChange={(event) => setColor(event.target.value)}
                    placeholder="Optional"
                    disabled={isImporting || Boolean(existingProduct)}
                    className="min-h-12 w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 text-sm font-semibold text-[#102A43] outline-none transition focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10 disabled:bg-[#F3F4F5]"
                  />
                </label>

                <label>
                  <span className="mb-2 block text-sm font-black text-[#102A43]">
                    Lineatur
                  </span>
                  <input
                    type="text"
                    value={lineature}
                    onChange={(event) => setLineature(event.target.value)}
                    placeholder="Optional"
                    disabled={isImporting || Boolean(existingProduct)}
                    className="min-h-12 w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 text-sm font-semibold text-[#102A43] outline-none transition focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10 disabled:bg-[#F3F4F5]"
                  />
                </label>

                <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
                  <label>
                    <span className="mb-2 block text-sm font-black text-[#102A43]">
                      Buchbreite in mm
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={bookWidthMm}
                      onChange={(event) =>
                        setBookWidthMm(event.target.value.replace(/\D/g, ""))
                      }
                      placeholder="Optional"
                      disabled={isImporting || Boolean(existingProduct)}
                      className="min-h-12 w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 text-sm font-semibold text-[#102A43] outline-none transition focus:border-[#12395F] focus:ring-4 focus:ring-[#12395F]/10 disabled:bg-[#F3F4F5]"
                    />
                  </label>

                  <label>
                    <span className="mb-2 block text-sm font-black text-[#102A43]">
                      Buchhöhe in mm
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={bookHeightMm}
                      onChange={(event) =>
                        setBookHeightMm(event.target.value.replace(/\D/g, ""))
                      }
                      placeholder="Optional"
                      disabled={isImporting || Boolean(existingProduct)}
                      className="min-h-12 w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 text-sm font-semibold text-[#102A43] outline-none transition focus:border-[#12395F] focus:ring-4 focus:ring-[#12395F]/10 disabled:bg-[#F3F4F5]"
                    />
                  </label>
                </div>

                <label className="sm:col-span-2">
                  <span className="mb-2 block text-sm font-black text-[#102A43]">
                    Buchdetails / Suchhinweise
                  </span>
                  <textarea
                    value={bookSizeNote}
                    onChange={(event) => setBookSizeNote(event.target.value)}
                    rows={7}
                    disabled={isImporting || Boolean(existingProduct)}
                    className="w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 py-3 text-sm font-semibold leading-6 text-[#102A43] outline-none transition focus:border-[#12395F] focus:ring-4 focus:ring-[#12395F]/10 disabled:bg-[#F3F4F5]"
                  />
                </label>
              </div>

              <div className="rounded-[24px] border border-[#E8DED2] bg-[#FBF7F0] p-4">
                <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-[#A75B28]">
                      <Sparkles className="h-3.5 w-3.5" />
                      Automatisch generiert
                    </div>
                    <p className="text-sm font-black text-[#102A43]">
                      Aliase / Suchbegriffe
                    </p>
                    <p className="mt-1 text-xs font-semibold leading-5 text-[#52616F]">
                      Die Begriffe werden aus Titel, Verlag, ISBN, Autoren und
                      Buchdaten erzeugt und können manuell ergänzt werden.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={regenerateAliases}
                    disabled={isImporting || Boolean(existingProduct)}
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl bg-[#12395F] px-4 py-2 text-xs font-black text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Neu generieren
                  </button>
                </div>

                <textarea
                  value={aliases}
                  onChange={(event) => {
                    setAliases(event.target.value);
                    setAliasesWereManuallyEdited(true);
                  }}
                  rows={8}
                  disabled={isImporting || Boolean(existingProduct)}
                  className="w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 py-3 text-sm font-semibold leading-6 text-[#102A43] outline-none transition focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10 disabled:bg-[#F3F4F5]"
                />

                <p className="mt-2 text-xs font-semibold text-[#7B8792]">
                  Automatisch vorgeschlagen: {generatedAliases.length}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <MetadataItem label="ISBN-13 / EAN" value={book.isbn13} />
                <MetadataItem label="ISBN-10" value={book.isbn10} />
                <MetadataItem label="Verlag" value={book.publisher} />
                <MetadataItem
                  label="Erscheinungsdatum"
                  value={book.publishedDate}
                />
                <MetadataItem label="Seiten" value={book.pageCount} />
                <MetadataItem
                  label="Sprache"
                  value={getLanguageLabel(book.language)}
                />
              </div>

              {book.subjects.length > 0 ? (
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-[#A75B28]">
                    Kategorien aus Buchdaten
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {book.subjects.slice(0, 12).map((subject) => (
                      <span
                        key={subject}
                        className="rounded-full border border-[#E8DED2] bg-[#FBF7F0] px-3 py-1 text-xs font-bold text-[#52616F]"
                      >
                        {subject}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {book.description ? (
                <div className="rounded-[24px] border border-[#D6E7EF] bg-[#F5FAFD] p-4">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-[#12395F]">
                    Beschreibung aus Buchdaten
                  </p>
                  <p className="mt-2 whitespace-pre-line text-sm font-semibold leading-6 text-[#52616F]">
                    {book.description}
                  </p>
                </div>
              ) : null}

              {errorMessage ? (
                <div className="flex items-start gap-3 rounded-2xl border border-[#F0C7C7] bg-[#FFF5F5] px-4 py-3 text-sm font-semibold leading-6 text-[#B5282D]">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              ) : null}

              {successMessage ? (
                <div className="rounded-[24px] border border-[#BFE3CD] bg-[#F0FFF6] p-4">
                  <div className="flex items-start gap-3 text-[#2F7D50]">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                    <div>
                      <p className="font-black">Produktimport abgeschlossen</p>
                      <p className="mt-1 text-sm font-semibold leading-6">
                        {successMessage}
                      </p>
                    </div>
                  </div>

                  {savedProduct ? (
                    <Link
                      href={`/admin/produkte?q=${encodeURIComponent(
                        savedProduct.ean ||
                          savedProduct.productSku ||
                          savedProduct.productName,
                      )}`}
                      className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-white px-4 py-2 text-sm font-black text-[#12395F] shadow-sm ring-1 ring-[#BFE3CD] transition hover:bg-[#F7FFFA]"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Gespeichertes Produkt öffnen
                    </Link>
                  ) : null}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={
                  isImporting || isSearching || Boolean(existingProduct)
                }
                className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-[#B5282D] px-6 py-4 text-sm font-black text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isImporting ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Produkt wird angelegt …
                  </>
                ) : (
                  <>
                    <PackagePlus className="h-5 w-5" />
                    In Produktkatalog übernehmen
                  </>
                )}
              </button>
            </form>
          </div>
        </section>
      ) : null}
    </div>
  );
}
