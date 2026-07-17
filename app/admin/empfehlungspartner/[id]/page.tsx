import {
  DEFAULT_RECOMMENDATION_PROJECT_KEY,
  getRecommendationPartnerById,
  RecommendationPartnerServiceError,
} from "@/app/lib/recommendations/partnerService";
import { listRecommendationCategories } from "@/app/lib/recommendations/categoryService";
import {
  listCategoryPartnerLinks,
  type RecommendationCategoryPartnerLinkAdmin,
} from "@/app/lib/recommendations/categoryLinkService";
import {
  getPartnerPortalAdminState,
  PartnerPortalAdminServiceError,
  type PartnerPortalAdminState,
} from "@/app/lib/recommendations/partnerPortalAdminService";
import { RecommendationServiceError } from "@/app/lib/recommendations/serviceSupport";
import type {
  RecommendationPartner,
  RecommendationPartnerCategory,
} from "@/app/lib/recommendations/types";
import AdminPartnerPortalManager from "@/components/AdminPartnerPortalManager";
import AdminRecommendationCategoryLinks from "@/components/AdminRecommendationCategoryLinks";
import AdminRecommendationPartnerForm from "@/components/AdminRecommendationPartnerForm";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function EditRecommendationPartnerPage({
  params,
  searchParams,
}: {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{
    project_key?: string | string[];
    created?: string | string[];
  }>;
}) {
  const { id } = await params;
  const query = await searchParams;

  const projectValue = Array.isArray(
    query.project_key,
  )
    ? query.project_key[0]
    : query.project_key;

  const projectKey =
    projectValue?.trim() ||
    DEFAULT_RECOMMENDATION_PROJECT_KEY;

  const createdValue = Array.isArray(
    query.created,
  )
    ? query.created[0]
    : query.created;

  let partner: RecommendationPartner | null =
    null;

  let errorMessage: string | null = null;

  let categories: RecommendationPartnerCategory[] =
    [];

  let categoryLinks: RecommendationCategoryPartnerLinkAdmin[] =
    [];

  let categoryErrorMessage: string | null =
    null;

  let portalState: PartnerPortalAdminState | null =
    null;

  let portalErrorMessage: string | null = null;

  try {
    partner = await getRecommendationPartnerById(
      id,
      projectKey,
    );

    try {
      [
        categories,
        categoryLinks,
        portalState,
      ] = await Promise.all([
        listRecommendationCategories({
          projectKey: partner.project_key,
        }),

        listCategoryPartnerLinks({
          projectKey: partner.project_key,
          partnerId: partner.id,
        }),

        getPartnerPortalAdminState(
          partner.id,
          partner.project_key,
        ),
      ]);
    } catch (secondaryError) {
      if (
        secondaryError instanceof
        PartnerPortalAdminServiceError
      ) {
        portalErrorMessage =
          secondaryError.message;
      } else {
        categoryErrorMessage =
          secondaryError instanceof
          RecommendationServiceError
            ? secondaryError.message
            : "Kategoriezuordnungen oder Partnerportal-Daten konnten nicht geladen werden.";
      }
    }
  } catch (error) {
    if (
      error instanceof
        RecommendationPartnerServiceError &&
      error.code === "NOT_FOUND"
    ) {
      notFound();
    }

    errorMessage =
      error instanceof
      RecommendationPartnerServiceError
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

          <p className="mt-5 text-xs font-black uppercase tracking-[0.18em] text-[#A75B28]">
            Partner bearbeiten
          </p>

          <h1 className="mt-2 text-3xl font-black tracking-tight">
            {partner?.name ??
              "Empfehlungspartner"}
          </h1>

          {partner ? (
            <p className="mt-2 text-sm font-bold text-[#52616F]">
              Kennung: {partner.partner_code} ·
              Projekt: {partner.project_key} · Slug:{" "}
              {partner.slug}
            </p>
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

            {portalState ? (
              <AdminPartnerPortalManager
                initialState={portalState}
              />
            ) : (
              <section className="rounded-[32px] border border-[#F0D49B] bg-[#FFF9EB] p-5 text-sm font-bold text-[#805A17] sm:p-7">
                {portalErrorMessage ||
                  "Die Partnerportal-Daten konnten nicht geladen werden."}
              </section>
            )}

            <AdminRecommendationCategoryLinks
              partner={partner}
              categories={categories}
              initialLinks={categoryLinks}
              initialError={
                categoryErrorMessage
              }
            />
          </>
        ) : null}
      </section>
    </main>
  );
}