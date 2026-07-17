"use client";

import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Database,
  ExternalLink,
  ImageIcon,
  Loader2,
  RotateCcw,
  Search,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useRef, useState } from "react";

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

function normalizeIsbnInput(value: string) {
  return value
    .toUpperCase()
    .replace(/[^0-9X]/g, "")
    .slice(0, 13);
}

function formatMoney(
  value: number | null,
  currency: string | null
) {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }

  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: currency || "EUR",
  }).format(value);
}

function getLanguageLabel(language: string | null) {
  if (!language) {
    return null;
  }

  const normalized = language.toLowerCase();

  if (normalized === "de") return "Deutsch";
  if (normalized === "en") return "Englisch";
  if (normalized === "fr") return "FranzÃ¶sisch";
  if (normalized === "es") return "Spanisch";
  if (normalized === "it") return "Italienisch";
  if (normalized === "la") return "Latein";

  return language.toUpperCase();
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
      <p className="mt-1 text-sm font-bold leading-6 text-[#102A43]">
        {value}
      </p>
    </div>
  );
}

export default function AdminIsbnImportTool() {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [isbn, setIsbn] = useState("");
  const [book, setBook] = useState<BookData | null>(null);
  const [existingProduct, setExistingProduct] =
    useState<ExistingProduct | null>(null);

  const [isSearching, setIsSearching] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [coverLoadFailed, setCoverLoadFailed] = useState(false);

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSearching) {
      return;
    }

    const normalizedIsbn = normalizeIsbnInput(isbn);

    setBook(null);
    setExistingProduct(null);
    setErrorMessage(null);
    setCoverLoadFailed(false);

    if (normalizedIsbn.length !== 10 && normalizedIsbn.length !== 13) {
      setErrorMessage(
        "Bitte gib eine vollstÃ¤ndige ISBN-10 oder ISBN-13 ein."
      );
      return;
    }

    setIsSearching(true);

    try {
      const response = await fetch(
        `/api/admin/products/isbn-search?isbn=${encodeURIComponent(
          normalizedIsbn
        )}`,
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const rawText = await response.text();

      let payload: SearchResponse | null = null;

      try {
        payload = rawText ? (JSON.parse(rawText) as SearchResponse) : null;
      } catch {
        throw new Error(
          "Die ISBN-Route hat keine gÃ¼ltige JSON-Antwort geliefert."
        );
      }

      if (!response.ok || !payload?.ok || !payload.book) {
        throw new Error(
          payload?.message || "Zu dieser ISBN wurde kein Buch gefunden."
        );
      }

      setCoverLoadFailed(false);
      setBook(payload.book);
      setExistingProduct(payload.existingProduct || null);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Die ISBN-Suche konnte nicht ausgefÃ¼hrt werden."
      );
    } finally {
      setIsSearching(false);
    }
  }

  function resetSearch() {
    setIsbn("");
    setBook(null);
    setExistingProduct(null);
    setErrorMessage(null);
    setCoverLoadFailed(false);

    window.setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
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
            Gib die ISBN-10 oder ISBN-13 ein. Bindestriche und Leerzeichen
            werden automatisch entfernt. Die Suche kombiniert Google Books
            und Open Library und prÃ¼ft anschlieÃŸend den vorhandenen
            Produktkatalog.
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
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              placeholder="z. B. 978312..."
              className="min-h-14 w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 text-lg font-black tracking-[0.08em] text-[#102A43] outline-none transition placeholder:tracking-normal placeholder:text-[#9AA7B2] focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
            />
          </label>

          <button
            type="submit"
            disabled={isSearching}
            className="inline-flex min-h-14 items-center justify-center gap-2 self-end rounded-2xl bg-[#B5282D] px-6 py-4 text-sm font-black text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSearching ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Suche lÃ¤uft â€¦
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
            className="inline-flex min-h-14 items-center justify-center gap-2 self-end rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] px-5 py-4 text-sm font-black text-[#12395F] transition hover:bg-white"
          >
            <RotateCcw className="h-4 w-4" />
            Leeren
          </button>
        </form>

        {errorMessage ? (
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
                Metadaten prÃ¼fen
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
                    Dieses Buch existiert bereits im Produktkatalog.
                  </p>

                  <p className="mt-1 text-sm font-semibold leading-6 text-[#52616F]">
                    {existingProduct.name}
                    {existingProduct.sku
                      ? ` Â· Art.-Nr.: ${existingProduct.sku}`
                      : ""}
                    {existingProduct.ean
                      ? ` Â· EAN/ISBN: ${existingProduct.ean}`
                      : ""}
                  </p>

                  <Link
                    href={`/admin/produkte?q=${encodeURIComponent(
                      existingProduct.ean ||
                        existingProduct.sku ||
                        existingProduct.name
                    )}`}
                    className="mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl bg-white px-4 py-2 text-sm font-black text-[#12395F] shadow-sm ring-1 ring-[#E8DED2] transition hover:bg-[#EEF4FA]"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Vorhandenes Produkt Ã¶ffnen
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
                  Das Buch kann im nÃ¤chsten Schritt als neues Produkt
                  Ã¼bernommen werden.
                </p>
              </div>
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
            <div>
              <div className="overflow-hidden rounded-[28px] border border-[#E8DED2] bg-[#FBF7F0]">
                {book.coverUrl && !coverLoadFailed ? (
                  <img
                    src={book.coverUrl}
                    alt={book.title || "Buchcover"}
                    onError={() => setCoverLoadFailed(true)}
                    className="h-[360px] w-full object-contain p-4"
                  />
                ) : (
                  <div className="flex h-[360px] flex-col items-center justify-center p-6 text-center text-[#A75B28]">
                    <ImageIcon className="h-10 w-10" />
                    <p className="mt-3 font-black">Kein Cover gefunden</p>
                    <p className="mt-2 text-xs font-semibold leading-5 text-[#52616F]">
                      Es wurde kein abrufbares Produktbild bereitgestellt.
                    </p>
                  </div>
                )}
              </div>

              <div className="mt-3 rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] px-4 py-3 text-xs font-semibold leading-5 text-[#52616F]">
                Buchcover und Metadaten dienen zunÃ¤chst als Vorschau und
                werden vor dem Produktimport noch einmal geprÃ¼ft.
              </div>
            </div>

            <div>
              <h3 className="text-2xl font-black leading-tight text-[#102A43] sm:text-3xl">
                {book.title || "Unbekannter Titel"}
              </h3>

              {book.subtitle ? (
                <p className="mt-2 text-lg font-bold leading-7 text-[#52616F]">
                  {book.subtitle}
                </p>
              ) : null}

              {book.authors.length > 0 ? (
                <p className="mt-3 text-sm font-black text-[#12395F]">
                  {book.authors.join(", ")}
                </p>
              ) : null}

              {book.recommendedPrice ? (
                <div className="mt-5 rounded-[26px] border border-[#BFE3CD] bg-[#F0FFF6] p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.14em] text-[#2F7D50]">
                        Empfohlener Verkaufspreis
                      </p>

                      <p className="mt-1 text-3xl font-black text-[#102A43]">
                        {formatMoney(
                          book.recommendedPrice,
                          book.priceCurrency
                        )}
                      </p>

                      {book.priceSource ? (
                        <p className="mt-1 text-xs font-bold text-[#52616F]">
                          Preisquelle: {book.priceSource}
                        </p>
                      ) : null}
                    </div>

                    <div className="rounded-2xl border border-[#BFE3CD] bg-white px-4 py-3 text-sm font-black text-[#2F7D50]">
                      Vor Produktübernahme prüfen
                    </div>
                  </div>

                  <p className="mt-3 text-xs font-semibold leading-5 text-[#52616F]">
                    Der gefundene Preis ist eine Vorbelegung. Maßgeblich ist
                    der zum Importzeitpunkt gültige gebundene Ladenpreis
                    beziehungsweise Deine geprüfte Preisangabe.
                  </p>
                </div>
              ) : (
                <div className="mt-5 rounded-[24px] border border-[#F1D1A8] bg-[#FFF8EE] p-4">
                  <p className="font-black text-[#8A4A1F]">
                    Kein verlässlicher Verkaufspreis gefunden
                  </p>

                  <p className="mt-1 text-sm font-semibold leading-6 text-[#52616F]">
                    Der Preis wird beim nächsten Importschritt manuell
                    eingetragen und vor dem Speichern geprüft.
                  </p>
                </div>
              )}

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <MetadataItem label="ISBN-13" value={book.isbn13} />
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
                <div className="mt-5">
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
                <div className="mt-5 rounded-[24px] border border-[#D6E7EF] bg-[#F5FAFD] p-4">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-[#12395F]">
                    Beschreibung
                  </p>

                  <p className="mt-2 whitespace-pre-line text-sm font-semibold leading-6 text-[#52616F]">
                    {book.description}
                  </p>
                </div>
              ) : null}

              <div className="mt-5 rounded-[24px] border border-[#F1D1A8] bg-[#FFF8EE] p-4">
                <p className="font-black text-[#8A4A1F]">
                  NÃ¤chster Umsetzungsschritt
                </p>

                <p className="mt-1 text-sm font-semibold leading-6 text-[#52616F]">
                  Nach diesem Funktionstest ergÃ¤nzen wir Preisfeld,
                  Produktnamen-PrÃ¼fung und den Button â€žIn Produktkatalog
                  Ã¼bernehmenâ€œ. Dabei wird die bestehende SKU-, SEO-, Alias-,
                  Matching- und Bildpipeline verwendet.
                </p>
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}