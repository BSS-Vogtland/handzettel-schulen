import {
  DEFAULT_RECOMMENDATION_PROJECT_KEY,
  listRecommendationPartners,
  RecommendationPartnerServiceError,
} from "@/app/lib/recommendations/partnerService";
import type { RecommendationPartner } from "@/app/lib/recommendations/types";
import AdminRecommendationPartnerList from "@/components/AdminRecommendationPartnerList";
import { ArrowLeft, Plus, Search } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  search?: string | string[];
  active?: string | string[];
  project_key?: string | string[];
  sort?: string | string[];
  page?: string | string[];
  deleted?: string | string[];
}>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function pageHref(params: {
  search: string;
  active: string;
  projectKey: string;
  sort: string;
  page: number;
}) {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.active && params.active !== "all") query.set("active", params.active);
  if (params.projectKey !== DEFAULT_RECOMMENDATION_PROJECT_KEY) {
    query.set("project_key", params.projectKey);
  }
  if (params.sort !== "updated_desc") query.set("sort", params.sort);
  if (params.page > 1) query.set("page", String(params.page));
  const suffix = query.toString();
  return suffix ? `/admin/empfehlungspartner?${suffix}` : "/admin/empfehlungspartner";
}

export default async function RecommendationPartnersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const query = await searchParams;
  const search = first(query.search).trim();
  const active = first(query.active) || "all";
  const projectKey = first(query.project_key).trim() || DEFAULT_RECOMMENDATION_PROJECT_KEY;
  const sort = first(query.sort) || "updated_desc";
  const requestedPage = Number(first(query.page) || "1");
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const limit = 50;

  let partners: RecommendationPartner[] = [];
  let total = 0;
  let errorMessage: string | null = null;

  try {
    const result = await listRecommendationPartners({
      projectKey,
      search,
      active: active === "active" ? true : active === "inactive" ? false : null,
      sort:
        sort === "name_asc"
          ? "name_asc"
          : sort === "created_desc"
            ? "created_desc"
            : "updated_desc",
      page,
      limit,
    });
    partners = result.partners;
    total = result.total;
  } catch (error) {
    errorMessage =
      error instanceof RecommendationPartnerServiceError
        ? error.message
        : "Empfehlungspartner konnten nicht geladen werden.";
  }

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const successMessage = first(query.deleted) === "1" ? "Der Empfehlungspartner wurde gelöscht." : null;

  return (
    <main className="min-h-screen bg-[#FBF7F0] text-[#102A43]">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="rounded-[34px] border border-[#E8DED2] bg-white p-5 shadow-sm sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <Link
                href="/admin"
                className="inline-flex items-center gap-2 rounded-full border border-[#D8C8B8] bg-[#FBF7F0] px-4 py-2 text-sm font-black text-[#102A43] transition hover:border-[#A75B28]"
              >
                <ArrowLeft className="h-4 w-4" />
                Zurück zum Admin
              </Link>
              <p className="mt-5 text-xs font-black uppercase tracking-[0.18em] text-[#A75B28]">Partnerempfehlungen</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Empfehlungspartner</h1>
              <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-[#52616F]">
                Verwalte externe Geschäftspartner, Zielseiten, Zuordnungsdauer und wirtschaftliche Konditionen.
              </p>
              <nav className="mt-5 flex flex-wrap gap-2" aria-label="Empfehlungsverwaltung">
                <span className="rounded-xl bg-[#12395F] px-4 py-2 text-sm font-black text-white">Partner</span>
                <Link href="/admin/empfehlungspartner/kategorien" className="rounded-xl border border-[#D8C8B8] px-4 py-2 text-sm font-black">Kategorien</Link>
                <Link href="/admin/empfehlungspartner/regeln" className="rounded-xl border border-[#D8C8B8] px-4 py-2 text-sm font-black">Regeln</Link>
                <Link href="/admin/empfehlungspartner/simulation" className="rounded-xl border border-[#D8C8B8] px-4 py-2 text-sm font-black">Simulation</Link>
                <Link href="/admin/empfehlungspartner/klicks" className="rounded-xl border border-[#D8C8B8] px-4 py-2 text-sm font-black">Klicks</Link>
              </nav>
            </div>

            <Link
              href="/admin/empfehlungspartner/neu"
              className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-2xl bg-[#B5282D] px-5 text-sm font-black text-white transition hover:brightness-110"
            >
              <Plus className="h-4 w-4" />
              Neuen Partner anlegen
            </Link>
          </div>
        </header>

        <form
          method="get"
          className="grid gap-4 rounded-[28px] border border-[#E8DED2] bg-white p-5 shadow-sm lg:grid-cols-[minmax(240px,1fr)_220px_240px_220px_auto] lg:items-end"
        >
          <label className="grid gap-2">
            <span className="text-xs font-black uppercase tracking-[0.12em] text-[#A75B28]">Suche</span>
            <input
              name="search"
              defaultValue={search}
              placeholder="Name, Kennung, Slug oder Beschreibung"
              className="min-h-11 rounded-2xl border border-[#D8C8B8] bg-[#FFFCF8] px-4 text-sm font-bold outline-none focus:border-[#A75B28]"
            />
          </label>

          <label className="grid gap-2">
            <span className="text-xs font-black uppercase tracking-[0.12em] text-[#A75B28]">Status</span>
            <select
              name="active"
              defaultValue={active}
              className="min-h-11 rounded-2xl border border-[#D8C8B8] bg-[#FFFCF8] px-4 text-sm font-bold outline-none focus:border-[#A75B28]"
            >
              <option value="all">Alle</option>
              <option value="active">Aktiv</option>
              <option value="inactive">Inaktiv</option>
            </select>
          </label>

          <label className="grid gap-2">
            <span className="text-xs font-black uppercase tracking-[0.12em] text-[#A75B28]">Projekt</span>
            <input
              name="project_key"
              defaultValue={projectKey}
              className="min-h-11 rounded-2xl border border-[#D8C8B8] bg-[#FFFCF8] px-4 text-sm font-bold outline-none focus:border-[#A75B28]"
            />
          </label>

          <label className="grid gap-2">
            <span className="text-xs font-black uppercase tracking-[0.12em] text-[#A75B28]">Sortierung</span>
            <select
              name="sort"
              defaultValue={sort}
              className="min-h-11 rounded-2xl border border-[#D8C8B8] bg-[#FFFCF8] px-4 text-sm font-bold outline-none focus:border-[#A75B28]"
            >
              <option value="updated_desc">Zuletzt geändert</option>
              <option value="created_desc">Zuletzt angelegt</option>
              <option value="name_asc">Name A–Z</option>
            </select>
          </label>

          <button
            type="submit"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#12395F] px-5 text-sm font-black text-white transition hover:brightness-110"
          >
            <Search className="h-4 w-4" />
            Filtern
          </button>
        </form>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-black text-[#102A43]">
            {errorMessage ? "Laden nicht möglich" : `${total} Partner gefunden`}
          </p>
          {!errorMessage && totalPages > 1 ? (
            <p className="text-sm font-semibold text-[#52616F]">Seite {Math.min(page, totalPages)} von {totalPages}</p>
          ) : null}
        </div>

        <AdminRecommendationPartnerList
          initialPartners={partners}
          initialError={errorMessage}
          initialMessage={successMessage}
        />

        {!errorMessage && totalPages > 1 ? (
          <nav className="flex items-center justify-between rounded-2xl border border-[#E8DED2] bg-white p-3">
            {page > 1 ? (
              <Link
                href={pageHref({ search, active, projectKey, sort, page: page - 1 })}
                className="rounded-xl border border-[#D8C8B8] px-4 py-2 text-sm font-black"
              >
                Vorherige Seite
              </Link>
            ) : <span />}
            {page < totalPages ? (
              <Link
                href={pageHref({ search, active, projectKey, sort, page: page + 1 })}
                className="rounded-xl bg-[#12395F] px-4 py-2 text-sm font-black text-white"
              >
                Nächste Seite
              </Link>
            ) : null}
          </nav>
        ) : null}
      </section>
    </main>
  );
}
