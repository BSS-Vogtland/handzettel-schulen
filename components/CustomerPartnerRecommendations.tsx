import { ExternalLink, Sparkles } from "lucide-react";
import type { CustomerPartnerRecommendation } from "@/app/lib/recommendations/customerRecommendationTypes";

function safeRedirectPath(value: string) {
  return /^\/empfehlung\/[a-z0-9]+(?:-[a-z0-9]+)*\?context=[A-Za-z0-9_-]+$/.test(value)
    ? value
    : null;
}

export default function CustomerPartnerRecommendations({
  recommendations,
}: {
  recommendations: CustomerPartnerRecommendation[];
}) {
  const safeRecommendations = recommendations.flatMap((recommendation) => {
    const redirectPath = safeRedirectPath(recommendation.partner.redirectPath);
    if (!redirectPath) return [];
    return [{
      ...recommendation,
      partner: {
        ...recommendation.partner,
        redirectPath,
      },
    }];
  });

  if (safeRecommendations.length === 0) return null;

  return (
    <section className="rounded-[32px] border border-[#E8DED2] bg-white p-5 shadow-sm sm:p-8">
      <div className="mb-5 flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#FFF7ED] text-[#A75B28]">
          <Sparkles className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#A75B28]">
            Für Deine Materialliste
          </p>
          <h2 className="mt-1 text-2xl font-black text-[#102A43]">
            Passende Empfehlungen
          </h2>
        </div>
      </div>

      <p className="mb-5 rounded-2xl border border-[#F1D1A8] bg-[#FFF8EE] p-4 text-sm font-semibold leading-6 text-[#70451F]">
        Partnerempfehlung: Wenn Du über diesen Link etwas kaufst, kann
        Handzettel-Schulen.de eine Vergütung erhalten. Für Dich entstehen dadurch
        keine Mehrkosten.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        {safeRecommendations.map((recommendation) => (
          <article
            key={`${recommendation.category}:${recommendation.partner.partnerCode}`}
            className="flex flex-col rounded-[26px] border border-[#E8DED2] bg-[#FBF7F0] p-5"
          >
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
              {recommendation.category}
            </p>
            <div className="mt-4 flex items-center gap-4">
              {recommendation.partner.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={recommendation.partner.logoUrl}
                  alt={`${recommendation.partner.name} Logo`}
                  className="h-16 w-16 rounded-2xl border border-[#E8DED2] bg-white object-contain p-2"
                />
              ) : null}
              <h3 className="text-xl font-black text-[#102A43]">
                {recommendation.partner.name}
              </h3>
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
              className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#102A43] px-5 py-3 text-sm font-black text-white transition hover:bg-[#1D3E5E]"
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
