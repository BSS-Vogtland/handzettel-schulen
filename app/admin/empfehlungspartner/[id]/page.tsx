import {
  DEFAULT_RECOMMENDATION_PROJECT_KEY,
  getRecommendationPartnerById,
  RecommendationPartnerServiceError,
} from "@/app/lib/recommendations/partnerService";
import type { RecommendationPartner } from "@/app/lib/recommendations/types";
import AdminRecommendationPartnerForm from "@/components/AdminRecommendationPartnerForm";
import { ArrowLeft, Info } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function EditRecommendationPartnerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    project_key?: string | string[];
    created?: string | string[];
  }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const projectValue = Array.isArray(query.project_key)
    ? query.project_key[0]
    : query.project_key;
  const projectKey = projectValue?.trim() || DEFAULT_RECOMMENDATION_PROJECT_KEY;
  const createdValue = Array.isArray(query.created) ? query.created[0] : query.created;

  let partner: RecommendationPartner | null = null;
  let errorMessage: string | null = null;

  try {
    partner = await getRecommendationPartnerById(id, projectKey);
  } catch (error) {
    if (
      error instanceof RecommendationPartnerServiceError &&
      error.code === "NOT_FOUND"
    ) {
      notFound();
    }

    errorMessage =
      error instanceof RecommendationPartnerServiceError
        ? error.message
        : "Der Empfehlungspartner konnte nicht geladen werden.";
  }

  return (
    <main className="min-h-screen bg-[#FBF7F0] text-[#102A43]">
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="rounded-[34px] border border-[#E8DED2] bg-white p-5 shadow-sm sm:p-7">
          <Link
            href="/admin/empfehlungspartner"
            className="inline-flex items-center gap-2 rounded-full border border-[#D8C8B8] bg-[#FBF7F0] px-4 py-2 text-sm font-black text-[#102A43]"
          >
            <ArrowLeft className="h-4 w-4" />
            Zurück zu den Partnern
          </Link>
          <p className="mt-5 text-xs font-black uppercase tracking-[0.18em] text-[#A75B28]">Partner bearbeiten</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight">{partner?.name ?? "Empfehlungspartner"}</h1>
          {partner ? (
            <p className="mt-2 text-sm font-bold text-[#52616F]">Projekt: {partner.project_key} · Slug: {partner.slug}</p>
          ) : null}
        </header>

        {errorMessage ? (
          <div className="rounded-2xl border border-[#F3B3B3] bg-[#FFF1F1] px-4 py-4 text-sm font-bold text-[#9F1D1D]">
            {errorMessage}
          </div>
        ) : null}

        {partner ? (
          <>
            <AdminRecommendationPartnerForm
              mode="edit"
              initialPartner={partner}
              initialMessage={
                createdValue === "1"
                  ? "Der Empfehlungspartner wurde erfolgreich angelegt."
                  : null
              }
            />

            <aside className="flex items-start gap-3 rounded-[28px] border border-[#C8D8E8] bg-[#EEF4FA] p-5 text-[#12395F]">
              <Info className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-black">Kategorien und Regeln folgen im nächsten Bauabschnitt</p>
                <p className="mt-1 text-sm font-semibold leading-6">
                  E1B verwaltet ausschließlich Partnerstammdaten. Noch werden keine Empfehlungen an Kunden ausgespielt.
                </p>
              </div>
            </aside>
          </>
        ) : null}
      </section>
    </main>
  );
}
