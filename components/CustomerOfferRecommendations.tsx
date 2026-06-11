"use client";

import { useEffect, useState } from "react";
import { ImageIcon, Loader2, Sparkles } from "lucide-react";
import CustomerAddRecommendationButton from "@/components/CustomerAddRecommendationButton";

type RecommendationItem = {
  id: string;
  productId: string;
  productName: string;
  productSku: string | null;
  productPrice: number;
  imageUrl: string | null;
  title: string | null;
  reason: string | null;
  source: string;
};

type RecommendationsResponse = {
  ok?: boolean;
  recommendations?: RecommendationItem[];
  message?: string;
};

type CustomerOfferRecommendationsProps = {
  token: string;
  disabled?: boolean;
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(value || 0);
}

async function readJsonSafely(
  response: Response
): Promise<RecommendationsResponse | null> {
  const rawText = await response.text();

  try {
    return rawText ? (JSON.parse(rawText) as RecommendationsResponse) : null;
  } catch {
    return null;
  }
}

export default function CustomerOfferRecommendations({
  token,
  disabled = false,
}: CustomerOfferRecommendationsProps) {
  const [recommendations, setRecommendations] = useState<RecommendationItem[]>(
    []
  );
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function loadRecommendations() {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch(
        `/api/offer/${encodeURIComponent(token)}/recommendations`,
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const payload = await readJsonSafely(response);

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
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadRecommendations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function removeRecommendationFromView(recommendationId: string) {
    setRecommendations((current) =>
      current.filter((recommendation) => recommendation.id !== recommendationId)
    );
  }

  if (isLoading) {
    return (
      <section className="rounded-[32px] border border-[#E8DED2] bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-3 text-sm font-black text-[#12395F]">
          <Loader2 className="h-5 w-5 animate-spin" />
          Empfehlungen werden geladen …
        </div>
      </section>
    );
  }

  if (errorMessage) {
    return (
      <section className="rounded-[32px] border border-[#F0C7C7] bg-[#FFF5F5] p-5 text-sm font-bold text-[#B5282D] shadow-sm sm:p-6">
        {errorMessage}
      </section>
    );
  }

  if (recommendations.length === 0) {
    return null;
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
          <h2 className="text-2xl font-black text-[#102A43]">
            Das könnte zusätzlich sinnvoll sein
          </h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-[#52616F]">
            Diese Artikel sind nicht automatisch in Deinem Paket enthalten. Du
            entscheidest selbst, ob Du sie hinzufügen möchtest.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {recommendations.map((recommendation) => (
          <article
            key={recommendation.id}
            className="rounded-[24px] border border-[#D6E7EF] bg-white p-4"
          >
            <div className="grid gap-4 sm:grid-cols-[96px_1fr]">
              <div className="flex h-24 w-full items-center justify-center overflow-hidden rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] sm:w-24">
                {recommendation.imageUrl ? (
                  <img
                    src={recommendation.imageUrl}
                    alt={recommendation.productName}
                    className="h-full w-full object-contain p-2"
                  />
                ) : (
                  <ImageIcon className="h-6 w-6 text-[#A75B28]" />
                )}
              </div>

              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[#12395F]">
                  Empfehlung
                </p>
                <h3 className="mt-1 font-black text-[#102A43]">
                  {recommendation.title || recommendation.productName}
                </h3>

                {recommendation.title &&
                recommendation.title !== recommendation.productName ? (
                  <p className="mt-1 text-sm font-semibold text-[#52616F]">
                    {recommendation.productName}
                  </p>
                ) : null}

                {recommendation.productSku ? (
                  <p className="mt-1 text-xs font-semibold text-[#52616F]">
                    Art.-Nr.: {recommendation.productSku}
                  </p>
                ) : null}

                <p className="mt-2 text-lg font-black text-[#102A43]">
                  {formatMoney(recommendation.productPrice)}
                </p>
              </div>
            </div>

            {recommendation.reason ? (
              <p className="mt-4 rounded-2xl bg-[#FBF7F0] px-4 py-3 text-sm font-semibold leading-6 text-[#52616F]">
                {recommendation.reason}
              </p>
            ) : null}

            {!disabled ? (
              <div className="mt-4">
                <CustomerAddRecommendationButton
                  token={token}
                  recommendationId={recommendation.id}
                  productName={recommendation.productName}
                  onAdded={() => removeRecommendationFromView(recommendation.id)}
                />
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}