"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  ImageIcon,
  Loader2,
  PlusCircle,
  Search,
  Sparkles,
} from "lucide-react";

type ProductSearchResult = {
  id: string;
  productName: string;
  productSku: string;
  productPrice: number;
  imageUrl?: string | null;
};

type ProductSearchResponse = {
  ok?: boolean;
  products?: ProductSearchResult[];
  message?: string;
};

type Recommendation = {
  id: string;
  productId: string;
  productName: string;
  productSku: string | null;
  productPrice: number;
  imageUrl: string | null;
  title: string | null;
  reason: string | null;
  source: string;
  isVisible: boolean;
  addedToOfferItemId: string | null;
};

type RecommendationsResponse = {
  ok?: boolean;
  recommendations?: Recommendation[];
  message?: string;
};

type ApiResponse = {
  ok?: boolean;
  message?: string;
};

type AdminOfferRecommendationsPanelProps = {
  requestId: string;
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(value || 0);
}

async function readJsonSafely<T>(response: Response): Promise<T | null> {
  const rawText = await response.text();

  try {
    return rawText ? (JSON.parse(rawText) as T) : null;
  } catch {
    return null;
  }
}

export default function AdminOfferRecommendationsPanel({
  requestId,
}: AdminOfferRecommendationsPanelProps) {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [query, setQuery] = useState("");
  const [reason, setReason] = useState(
    "Dieses Produkt könnte ergänzend zu der Schulmaterialliste sinnvoll sein."
  );
  const [products, setProducts] = useState<ProductSearchResult[]>([]);
  const [isLoadingRecommendations, setIsLoadingRecommendations] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function loadRecommendations() {
    setIsLoadingRecommendations(true);
    setErrorMessage(null);

    try {
      const response = await fetch(
        `/api/admin/requests/${encodeURIComponent(requestId)}/recommendations`,
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const payload = await readJsonSafely<RecommendationsResponse>(response);

      if (!response.ok || !payload?.ok) {
        throw new Error(
          payload?.message || "Empfehlungen konnten nicht geladen werden."
        );
      }

      setRecommendations(payload.recommendations || []);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Empfehlungen konnten nicht geladen werden."
      );
    } finally {
      setIsLoadingRecommendations(false);
    }
  }

  useEffect(() => {
    loadRecommendations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId]);

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setFeedback(null);
    setErrorMessage(null);

    if (query.trim().length < 2) {
      setErrorMessage("Bitte mindestens 2 Zeichen für die Produktsuche eingeben.");
      return;
    }

    setIsSearching(true);

    try {
      const response = await fetch(
        `/api/admin/products/search?q=${encodeURIComponent(query.trim())}`,
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const payload = await readJsonSafely<ProductSearchResponse>(response);

      if (!response.ok || !payload?.ok) {
        throw new Error(
          payload?.message || "Produkte konnten nicht gesucht werden."
        );
      }

      setProducts(payload.products || []);

      if ((payload.products || []).length === 0) {
        setFeedback("Kein Produkt zu diesem Suchbegriff gefunden.");
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

  async function addRecommendation(product: ProductSearchResult) {
    setBusyId(product.id);
    setFeedback(null);
    setErrorMessage(null);

    try {
      const response = await fetch(
        `/api/admin/requests/${encodeURIComponent(requestId)}/recommendations`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            productId: product.id,
            reason: reason.trim(),
          }),
        }
      );

      const payload = await readJsonSafely<ApiResponse>(response);

      if (!response.ok || !payload?.ok) {
        throw new Error(
          payload?.message || "Empfehlung konnte nicht gespeichert werden."
        );
      }

      setFeedback(payload.message || "Empfehlung wurde gespeichert.");
      setProducts([]);
      setQuery("");
      await loadRecommendations();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Empfehlung konnte nicht gespeichert werden."
      );
    } finally {
      setBusyId(null);
    }
  }

  async function updateRecommendationVisibility(
    recommendation: Recommendation,
    isVisible: boolean
  ) {
    setBusyId(recommendation.id);
    setFeedback(null);
    setErrorMessage(null);

    try {
      const response = await fetch(
        `/api/admin/requests/${encodeURIComponent(
          requestId
        )}/recommendations/${encodeURIComponent(recommendation.id)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            isVisible,
          }),
        }
      );

      const payload = await readJsonSafely<ApiResponse>(response);

      if (!response.ok || !payload?.ok) {
        throw new Error(
          payload?.message || "Empfehlung konnte nicht aktualisiert werden."
        );
      }

      setFeedback(
        isVisible ? "Empfehlung wurde eingeblendet." : "Empfehlung wurde ausgeblendet."
      );
      await loadRecommendations();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Empfehlung konnte nicht aktualisiert werden."
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="rounded-[32px] border border-[#D6E7EF] bg-[#F5FAFD] p-5 shadow-sm sm:p-6">
      <div className="mb-5 flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-[#12395F]">
          <Sparkles className="h-5 w-5" />
        </div>

        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#12395F]">
            Passende Ergänzungen
          </p>
          <h2 className="text-xl font-black text-[#102A43]">
            Empfehlungen unter dem Paketwunsch
          </h2>
          <p className="mt-1 text-sm font-semibold leading-6 text-[#52616F]">
            Diese Produkte erscheinen auf der Kundenseite unter dem Paketwunsch.
            Sie werden erst zur echten Paketposition, wenn der Kunde sie aktiv
            hinzufügt.
          </p>
        </div>
      </div>

      <form
        onSubmit={handleSearch}
        className="rounded-[24px] border border-[#D6E7EF] bg-white p-4"
      >
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Produkt suchen, z. B. Deckweiß, Malkittel, Tintenpatronen ..."
            className="min-h-12 w-full rounded-2xl border border-[#D8C8B8] bg-[#FBF7F0] px-4 text-sm font-semibold text-[#102A43] outline-none transition placeholder:text-[#9AA7B2] focus:border-[#12395F] focus:ring-4 focus:ring-[#12395F]/10"
          />

          <button
            type="submit"
            disabled={isSearching}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#12395F] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
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
        </div>

        <label className="mt-3 block">
          <span className="mb-1 block text-xs font-black uppercase tracking-[0.14em] text-[#12395F]">
            Begründung für den Kunden
          </span>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={2}
            className="w-full rounded-2xl border border-[#D8C8B8] bg-[#FBF7F0] px-4 py-3 text-sm font-semibold text-[#102A43] outline-none transition focus:border-[#12395F] focus:ring-4 focus:ring-[#12395F]/10"
          />
        </label>

        {products.length > 0 ? (
          <div className="mt-4 grid gap-3">
            {products.map((product) => (
              <div
                key={product.id}
                className="rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] p-3"
              >
                <div className="grid gap-3 sm:grid-cols-[74px_1fr_auto] sm:items-center">
                  <div className="flex h-20 w-full items-center justify-center overflow-hidden rounded-2xl border border-[#E8DED2] bg-white sm:w-20">
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt={product.productName}
                        className="h-full w-full object-contain p-2"
                      />
                    ) : (
                      <ImageIcon className="h-5 w-5 text-[#A75B28]" />
                    )}
                  </div>

                  <div>
                    <p className="font-black text-[#102A43]">
                      {product.productName}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-[#52616F]">
                      {product.productSku
                        ? `Art.-Nr.: ${product.productSku}`
                        : "Ohne Art.-Nr."}
                    </p>
                    <p className="mt-1 text-sm font-black text-[#102A43]">
                      {formatMoney(product.productPrice)}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => addRecommendation(product)}
                    disabled={busyId === product.id}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#B5282D] px-4 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {busyId === product.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <PlusCircle className="h-4 w-4" />
                    )}
                    Empfehlen
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </form>

      {feedback ? (
        <p className="mt-4 rounded-2xl border border-[#BFE3CD] bg-[#F0FFF6] px-4 py-3 text-sm font-bold text-[#2F7D50]">
          {feedback}
        </p>
      ) : null}

      {errorMessage ? (
        <p className="mt-4 rounded-2xl border border-[#F0C7C7] bg-[#FFF5F5] px-4 py-3 text-sm font-bold text-[#B5282D]">
          {errorMessage}
        </p>
      ) : null}

      <div className="mt-5">
        <p className="mb-3 text-xs font-black uppercase tracking-[0.16em] text-[#12395F]">
          Aktuelle Empfehlungen
        </p>

        {isLoadingRecommendations ? (
          <div className="flex items-center gap-2 text-sm font-black text-[#12395F]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Empfehlungen werden geladen …
          </div>
        ) : recommendations.length > 0 ? (
          <div className="grid gap-3">
            {recommendations.map((recommendation) => (
              <div
                key={recommendation.id}
                className={`rounded-2xl border p-4 ${
                  recommendation.isVisible
                    ? "border-[#D6E7EF] bg-white"
                    : "border-[#E8DED2] bg-[#FBF7F0] opacity-70"
                }`}
              >
                <div className="grid gap-3 sm:grid-cols-[72px_1fr_auto] sm:items-center">
                  <div className="flex h-20 w-full items-center justify-center overflow-hidden rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] sm:w-20">
                    {recommendation.imageUrl ? (
                      <img
                        src={recommendation.imageUrl}
                        alt={recommendation.productName}
                        className="h-full w-full object-contain p-2"
                      />
                    ) : (
                      <ImageIcon className="h-5 w-5 text-[#A75B28]" />
                    )}
                  </div>

                  <div>
                    <div className="mb-1 flex flex-wrap gap-2">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-black ${
                          recommendation.isVisible
                            ? "bg-[#F0FFF6] text-[#2F7D50]"
                            : "bg-[#FFF5F5] text-[#B5282D]"
                        }`}
                      >
                        {recommendation.isVisible
                          ? "sichtbar"
                          : "ausgeblendet"}
                      </span>

                      {recommendation.addedToOfferItemId ? (
                        <span className="rounded-full bg-[#EEF4FA] px-3 py-1 text-xs font-black text-[#12395F]">
                          übernommen
                        </span>
                      ) : null}
                    </div>

                    <p className="font-black text-[#102A43]">
                      {recommendation.productName}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-[#52616F]">
                      {recommendation.reason || "Keine Begründung hinterlegt."}
                    </p>
                  </div>

                  {!recommendation.addedToOfferItemId ? (
                    <button
                      type="button"
                      onClick={() =>
                        updateRecommendationVisibility(
                          recommendation,
                          !recommendation.isVisible
                        )
                      }
                      disabled={busyId === recommendation.id}
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl bg-[#12395F] px-4 py-2 text-xs font-black text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {busyId === recommendation.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : recommendation.isVisible ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                      {recommendation.isVisible ? "Ausblenden" : "Einblenden"}
                    </button>
                  ) : (
                    <div className="inline-flex items-center gap-2 rounded-2xl bg-[#F0FFF6] px-4 py-2 text-xs font-black text-[#2F7D50]">
                      <CheckCircle2 className="h-4 w-4" />
                      Im Paket
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-[#D8C8B8] bg-white p-5 text-sm font-semibold text-[#52616F]">
            Noch keine Empfehlungen hinterlegt.
          </div>
        )}
      </div>
    </section>
  );
}