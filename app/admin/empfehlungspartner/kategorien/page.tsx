import {
  listRecommendationCategories,
  type RecommendationCategoryAdminRow,
} from "@/app/lib/recommendations/categoryService";
import {
  DEFAULT_RECOMMENDATION_PROJECT_KEY,
  RecommendationServiceError,
} from "@/app/lib/recommendations/serviceSupport";
import AdminRecommendationCategoryManager from "@/components/AdminRecommendationCategoryManager";
import { ArrowLeft, Search } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  search?: string | string[];
  active?: string | string[];
  project_key?: string | string[];
}>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function RecommendationCategoriesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const query = await searchParams;
  const search = first(query.search).trim();
  const active = first(query.active) || "all";
  const projectKey =
    first(query.project_key).trim() || DEFAULT_RECOMMENDATION_PROJECT_KEY;
  let categories: RecommendationCategoryAdminRow[] = [];
  let errorMessage: string | null = null;

  try {
    categories = await listRecommendationCategories({
      projectKey,
      search,
      active: active === "active" ? true : active === "inactive" ? false : null,
    });
  } catch (error) {
    errorMessage =
      error instanceof RecommendationServiceError
        ? error.message
        : "Empfehlungskategorien konnten nicht geladen werden.";
  }

  return (
    <main className="min-h-screen bg-[#FBF7F0] text-[#102A43]">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="rounded-[34px] border border-[#E8DED2] bg-white p-5 shadow-sm sm:p-7">
          <Link href="/admin" className="inline-flex items-center gap-2 rounded-full border border-[#D8C8B8] bg-[#FBF7F0] px-4 py-2 text-sm font-black">
            <ArrowLeft className="h-4 w-4" /> Zurück zum Admin
          </Link>
          <p className="mt-5 text-xs font-black uppercase tracking-[0.18em] text-[#A75B28]">Partnerempfehlungen</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Empfehlungskategorien</h1>
          <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-[#52616F]">
            Kategorien bündeln passende Partner und Regeln. Kategorien mit bestehenden Zuordnungen oder Regeln können nicht gelöscht, aber deaktiviert werden.
          </p>
          <nav className="mt-5 flex flex-wrap gap-2" aria-label="Empfehlungsverwaltung">
            <Link href="/admin/empfehlungspartner" className="rounded-xl border border-[#D8C8B8] px-4 py-2 text-sm font-black">Partner</Link>
            <span className="rounded-xl bg-[#12395F] px-4 py-2 text-sm font-black text-white">Kategorien</span>
            <Link href="/admin/empfehlungspartner/regeln" className="rounded-xl border border-[#D8C8B8] px-4 py-2 text-sm font-black">Regeln</Link>
            <Link href="/admin/empfehlungspartner/simulation" className="rounded-xl border border-[#D8C8B8] px-4 py-2 text-sm font-black">Simulation</Link>
          </nav>
        </header>

        <form method="get" className="grid gap-4 rounded-[28px] border border-[#E8DED2] bg-white p-5 shadow-sm lg:grid-cols-[minmax(240px,1fr)_220px_260px_auto] lg:items-end">
          <label className="grid gap-2">
            <span className="text-xs font-black uppercase tracking-[0.12em] text-[#A75B28]">Suche</span>
            <input name="search" defaultValue={search} placeholder="Name, Slug oder Beschreibung" className="min-h-11 rounded-2xl border border-[#D8C8B8] bg-[#FFFCF8] px-4 text-sm font-bold outline-none focus:border-[#A75B28]" />
          </label>
          <label className="grid gap-2">
            <span className="text-xs font-black uppercase tracking-[0.12em] text-[#A75B28]">Status</span>
            <select name="active" defaultValue={active} className="min-h-11 rounded-2xl border border-[#D8C8B8] bg-[#FFFCF8] px-4 text-sm font-bold">
              <option value="all">Alle</option><option value="active">Aktiv</option><option value="inactive">Inaktiv</option>
            </select>
          </label>
          <label className="grid gap-2">
            <span className="text-xs font-black uppercase tracking-[0.12em] text-[#A75B28]">Projekt</span>
            <input name="project_key" defaultValue={projectKey} className="min-h-11 rounded-2xl border border-[#D8C8B8] bg-[#FFFCF8] px-4 text-sm font-bold" />
          </label>
          <button type="submit" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#12395F] px-5 text-sm font-black text-white"><Search className="h-4 w-4" /> Filtern</button>
        </form>

        <p className="text-sm font-black text-[#102A43]">
          {errorMessage ? "Laden nicht möglich" : `${categories.length} Kategorien gefunden`}
        </p>

        <AdminRecommendationCategoryManager initialCategories={categories} initialError={errorMessage} projectKey={projectKey} />
      </section>
    </main>
  );
}
