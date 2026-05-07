"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  ImageIcon,
  Loader2,
  Search,
  ShoppingBasket,
} from "lucide-react";

type CustomerProductSearchProps = {
  token: string;
  requestItemId: string;
  defaultQuery?: string | null;

  /**
   * Produkte, die oberhalb bereits als Empfehlung/Vorschlag angezeigt werden,
   * sollen unten in der Alternativsuche nicht nochmal erscheinen.
   */
  excludedProductIds?: string[];
  excludedProductSkus?: string[];
};

type ProductSearchResult = {
  id: string;
  productName: string;
  productSku: string;
  productPrice: number;
  imageUrl?: string | null;
  category?: string | null;
  productType?: string | null;
  format?: string | null;
  color?: string | null;
  lineature?: string | null;
};

type ProductSearchResponse = {
  ok?: boolean;
  products?: ProductSearchResult[];
  message?: string;
};

type SelectResponse = {
  ok?: boolean;
  message?: string;
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(value || 0);
}

function normalizeValue(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function uniqueProducts(products: ProductSearchResult[]) {
  const seen = new Set<string>();

  return products.filter((product) => {
    const idKey = normalizeValue(product.id);
    const skuKey = normalizeValue(product.productSku);
    const nameKey = normalizeValue(product.productName);
    const combinedKey = idKey || skuKey || nameKey;

    if (!combinedKey) return true;

    if (seen.has(combinedKey)) {
      return false;
    }

    seen.add(combinedKey);
    return true;
  });
}

export default function CustomerProductSearch({
  token,
  requestItemId,
  defaultQuery,
  excludedProductIds = [],
  excludedProductSkus = [],
}: CustomerProductSearchProps) {
  const router = useRouter();
  const hasAutoSearched = useRef(false);

  const [isOpen, setIsOpen] = useState(true);
  const [query, setQuery] = useState(defaultQuery || "");
  const [products, setProducts] = useState<ProductSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hiddenDuplicateCount, setHiddenDuplicateCount] = useState(0);

  const excludedIdSet = useMemo(() => {
    return new Set(excludedProductIds.map((id) => normalizeValue(id)));
  }, [excludedProductIds]);

  const excludedSkuSet = useMemo(() => {
    return new Set(excludedProductSkus.map((sku) => normalizeValue(sku)));
  }, [excludedProductSkus]);

  function filterAlreadyDisplayedProducts(searchResults: ProductSearchResult[]) {
    const uniqueResults = uniqueProducts(searchResults);

    const filtered = uniqueResults.filter((product) => {
      const productId = normalizeValue(product.id);
      const productSku = normalizeValue(product.productSku);

      if (productId && excludedIdSet.has(productId)) {
        return false;
      }

      if (productSku && excludedSkuSet.has(productSku)) {
        return false;
      }

      return true;
    });

    setHiddenDuplicateCount(uniqueResults.length - filtered.length);

    return filtered;
  }

  async function runSearch(searchValue: string) {
    setFeedback(null);
    setErrorMessage(null);
    setHiddenDuplicateCount(0);

    if (!searchValue.trim() || searchValue.trim().length < 2) {
      setErrorMessage("Bitte gib mindestens 2 Zeichen ein.");
      return;
    }

    setIsSearching(true);

    try {
      const params = new URLSearchParams();
      params.set("q", searchValue.trim());

      if (excludedProductIds.length > 0) {
        params.set("excludeIds", excludedProductIds.join(","));
      }

      if (excludedProductSkus.length > 0) {
        params.set("excludeSkus", excludedProductSkus.join(","));
      }

      const response = await fetch(
        `/api/offer/${token}/products/search?${params.toString()}`
      );

      const rawText = await response.text();

      let payload: ProductSearchResponse | null = null;

      try {
        payload = rawText ? JSON.parse(rawText) : null;
      } catch {
        throw new Error(
          "Die Produktsuche hat keine JSON-Antwort geliefert. Prüfe bitte zusätzlich das Terminal."
        );
      }

      if (!response.ok || !payload?.ok) {
        throw new Error(
          payload?.message || "Produkte konnten nicht gesucht werden."
        );
      }

      const filteredProducts = filterAlreadyDisplayedProducts(
        payload.products || []
      );

      setProducts(filteredProducts);

      if (filteredProducts.length === 0) {
        if ((payload.products || []).length > 0) {
          setFeedback(
            "Die gefundenen Produkte werden oben bereits als Empfehlung angezeigt. Es gibt aktuell keine zusätzlichen Alternativen zu diesem Suchbegriff."
          );
        } else {
          setFeedback(
            "Keine direkten Treffer gefunden. Versuche es mit einem einfacheren Suchwort, z. B. „Heft“, „Umschlag“ oder „A5“."
          );
        }
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Produkte konnten nicht gesucht werden."
      );
    } finally {
      setIsSearching(false);
    }
  }

  useEffect(() => {
    if (hasAutoSearched.current) return;
    if (!defaultQuery || defaultQuery.trim().length < 2) return;

    hasAutoSearched.current = true;
    runSearch(defaultQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultQuery]);

  async function handleSearch(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    await runSearch(query);
  }

  async function handleSelect(productId: string) {
    if (selectedProductId) return;

    setSelectedProductId(productId);
    setFeedback(null);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/offer/${token}/items/from-product`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requestItemId,
          productId,
        }),
      });

      const rawText = await response.text();

      let payload: SelectResponse | null = null;

      try {
        payload = rawText ? JSON.parse(rawText) : null;
      } catch {
        throw new Error(
          "Die Auswahl-Route hat keine JSON-Antwort geliefert. Prüfe bitte zusätzlich das Terminal."
        );
      }

      if (!response.ok || !payload?.ok) {
        throw new Error(
          payload?.message || "Produkt konnte nicht übernommen werden."
        );
      }

      setFeedback(payload.message || "Produkt wurde übernommen.");
      router.refresh();
    } catch (error) {
      setSelectedProductId(null);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Produkt konnte nicht übernommen werden."
      );
    }
  }

  if (!isOpen) {
    return (
      <div className="mt-4 rounded-3xl border border-[#E8DED2] bg-white p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
              Optional selbst suchen
            </p>
            <p className="mt-1 text-sm font-semibold leading-6 text-[#52616F]">
              Unser Team prüft diese Position im Nachgang. Wenn Du möchtest,
              kannst Du zusätzlich selbst nach einem passenden Produkt suchen.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#12395F] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110"
          >
            <Search className="h-4 w-4" />
            Produkt selbst suchen
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-3xl border border-[#D8C8B8] bg-white p-4">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
            Zusätzliche Produkte aus dem Bestand
          </p>
          <p className="mt-1 text-sm font-semibold leading-6 text-[#52616F]">
            Wir zeigen Dir hier nur zusätzliche Treffer. Produkte, die oben
            bereits als Empfehlung erscheinen, werden in dieser Suche ausgeblendet.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="rounded-2xl bg-[#FBF7F0] px-4 py-2 text-xs font-black text-[#12395F]"
        >
          Einklappen
        </button>
      </div>

      <form onSubmit={handleSearch} className="grid gap-3 md:grid-cols-[1fr_auto]">
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="z. B. Schulheft A5 Lineatur 8"
          className="min-h-12 w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 text-sm font-semibold text-[#102A43] outline-none transition placeholder:text-[#9AA7B2] focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
        />

        <button
          type="submit"
          disabled={isSearching}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#12395F] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSearching ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Suche …
            </>
          ) : (
            <>
              <Search className="h-4 w-4" />
              Suchen
            </>
          )}
        </button>
      </form>

      {isSearching ? (
        <div className="mt-4 rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] px-4 py-3 text-sm font-bold text-[#52616F]">
          Produkte werden gesucht …
        </div>
      ) : null}

      {!isSearching && hiddenDuplicateCount > 0 ? (
        <div className="mt-4 rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] px-4 py-3 text-xs font-bold text-[#52616F]">
          {hiddenDuplicateCount === 1
            ? "Ein Produkt wird nicht erneut angezeigt, weil es oben bereits als Empfehlung sichtbar ist."
            : `${hiddenDuplicateCount} Produkte werden nicht erneut angezeigt, weil sie oben bereits als Empfehlungen sichtbar sind.`}
        </div>
      ) : null}

      {products.length > 0 ? (
        <div className="mt-4 grid gap-3">
          {products.map((product) => (
            <div
              key={product.id}
              className="rounded-3xl border border-[#E8DED2] bg-[#FBF7F0] p-4"
            >
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-col gap-4 md:flex-row md:items-center">
                  <div className="h-24 w-full shrink-0 overflow-hidden rounded-2xl border border-[#E8DED2] bg-white md:w-28">
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt={product.productName}
                        className="h-full w-full object-contain p-2"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[#A75B28]">
                        <ImageIcon className="h-5 w-5" />
                      </div>
                    )}
                  </div>

                  <div>
                    <h4 className="font-black text-[#102A43]">
                      {product.productName}
                    </h4>

                    <p className="mt-1 text-sm text-[#52616F]">
                      {product.productSku
                        ? `Art.-Nr.: ${product.productSku}`
                        : "Ohne Artikelnummer"}
                    </p>

                    <div className="mt-2 flex flex-wrap gap-2">
                      {product.category ? (
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-[#A75B28]">
                          {product.category}
                        </span>
                      ) : null}

                      {product.productType ? (
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-[#52616F]">
                          {product.productType}
                        </span>
                      ) : null}

                      {product.format ? (
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-[#52616F]">
                          {product.format}
                        </span>
                      ) : null}

                      {product.color ? (
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-[#52616F]">
                          {product.color}
                        </span>
                      ) : null}

                      {product.lineature ? (
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-[#52616F]">
                          Lineatur {product.lineature}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="flex shrink-0 flex-col gap-3 md:items-end">
                  <p className="text-lg font-black text-[#102A43]">
                    {formatMoney(product.productPrice)}
                  </p>

                  <button
                    type="button"
                    disabled={Boolean(selectedProductId)}
                    onClick={() => handleSelect(product.id)}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#B5282D] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {selectedProductId === product.id ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Wird übernommen …
                      </>
                    ) : (
                      <>
                        <ShoppingBasket className="h-4 w-4" />
                        Dieses Produkt wählen
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {feedback ? (
        <div className="mt-4 flex items-start gap-2 rounded-2xl border border-[#BFE3CD] bg-[#F0FFF6] px-4 py-3 text-sm font-semibold text-[#2F7D50]">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{feedback}</span>
        </div>
      ) : null}

      {errorMessage ? (
        <div className="mt-4 rounded-2xl border border-[#F0C7C7] bg-[#FFF5F5] px-4 py-3 text-sm font-semibold text-[#B5282D]">
          {errorMessage}
        </div>
      ) : null}
    </div>
  );
}