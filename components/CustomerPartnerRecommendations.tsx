import { ExternalLink, Sparkles } from "lucide-react";
import type { CustomerPartnerRecommendation } from "@/app/lib/recommendations/customerRecommendationTypes";

const INTERNAL_REDIRECT_ORIGIN = "https://recommendation.internal";
const MIN_CONTEXT_LENGTH = 20;
const MAX_CONTEXT_LENGTH = 4096;

function safeRedirectPath(value: string) {
  const rawValue = String(value || "").trim();

  if (!rawValue.startsWith("/empfehlung/")) {
    return null;
  }

  try {
    const parsedUrl = new URL(rawValue, INTERNAL_REDIRECT_ORIGIN);

    if (parsedUrl.origin !== INTERNAL_REDIRECT_ORIGIN) {
      return null;
    }

    if (
      !/^\/empfehlung\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(parsedUrl.pathname)
    ) {
      return null;
    }

    if (parsedUrl.hash) {
      return null;
    }

    const parameterNames = Array.from(parsedUrl.searchParams.keys());

    if (
      parameterNames.length !== 1 ||
      parameterNames[0] !== "context" ||
      parsedUrl.searchParams.getAll("context").length !== 1
    ) {
      return null;
    }

    const context = parsedUrl.searchParams.get("context");

    if (
      !context ||
      context.length < MIN_CONTEXT_LENGTH ||
      context.length > MAX_CONTEXT_LENGTH
    ) {
      return null;
    }

    return `${parsedUrl.pathname}?context=${encodeURIComponent(context)}`;
  } catch {
    return null;
  }
}

export default function CustomerPartnerRecommendations({
  recommendations,
}: {
  recommendations: CustomerPartnerRecommendation[];
}) {
  const safeRecommendations = recommendations.flatMap((recommendation) => {
    const redirectPath = safeRedirectPath(
      recommendation.partner.redirectPath,
    );

    if (!redirectPath) {
      return [];
    }

    return [
      {
        ...recommendation,
        partner: {
          ...recommendation.partner,
          redirectPath,
        },
      },
    ];
  });

  if (safeRecommendations.length === 0) {
    return null;
  }

  return (
    <section className="mt-4 rounded-[24px] border border-[#F1D1A8] bg-[#FFF8EE] p-4">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-[#A75B28]">
          <Sparkles className="h-5 w-5" />
        </div>

        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
            Externe Alternative
          </p>

          <h4 className="mt-0.5 text-lg font-black text-[#102A43]">
            Passender Partner für diese Position
          </h4>
        </div>
      </div>

      <p className="mb-4 rounded-2xl border border-[#F1D1A8] bg-white p-3 text-xs font-semibold leading-5 text-[#70451F] sm:text-sm">
        Partnerempfehlung: Wenn Du über diesen Link etwas kaufst, kann
        Handzettel-Schulen.de eine Vergütung erhalten. Für Dich entstehen
        dadurch keine Mehrkosten.
      </p>

      <div className="grid gap-3">
        {safeRecommendations.map((recommendation) => (
          <article
            key={`${recommendation.requestItemId}:${recommendation.category}:${recommendation.partner.partnerCode}`}
            className="flex flex-col rounded-[20px] border border-[#E8DED2] bg-white p-4"
          >
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
              {recommendation.category}
            </p>

            <div className="mt-3 flex items-center gap-3">
              {recommendation.partner.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={recommendation.partner.logoUrl}
                  alt={`${recommendation.partner.name} Logo`}
                  className="h-14 w-14 rounded-2xl border border-[#E8DED2] bg-white object-contain p-2"
                />
              ) : null}

              <h5 className="text-lg font-black text-[#102A43]">
                {recommendation.partner.name}
              </h5>
            </div>

            {recommendation.partner.description ? (
              <p className="mt-4 text-sm font-semibold leading-6 text-[#52616F]">
                {recommendation.partner.description}
              </p>
            ) : null}

            <p className="mt-3 text-sm font-semibold leading-6 text-[#52616F]">
              {recommendation.categoryReason}
            </p>

            <a
              href={recommendation.partner.redirectPath}
              target="_blank"
              rel="sponsored noopener noreferrer"
              className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#102A43] px-5 py-3 text-sm font-black text-white transition hover:bg-[#1D3E5E]"
            >
              Zum Partner
              <ExternalLink className="h-4 w-4" />
            </a>
          </article>
        ))}
      </div>
    </section>
  );
}
