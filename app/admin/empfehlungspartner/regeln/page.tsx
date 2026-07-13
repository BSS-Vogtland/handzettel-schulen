import { listRecommendationCategories } from "@/app/lib/recommendations/categoryService";
import {
  listRecommendationRules,
  type RecommendationRuleAdminRow,
} from "@/app/lib/recommendations/ruleService";
import {
  DEFAULT_RECOMMENDATION_PROJECT_KEY,
  RecommendationServiceError,
} from "@/app/lib/recommendations/serviceSupport";
import type { RecommendationPartnerCategory } from "@/app/lib/recommendations/types";
import AdminRecommendationRuleManager from "@/components/AdminRecommendationRuleManager";
import { ArrowLeft, Search } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  search?: string | string[];
  active?: string | string[];
  project_key?: string | string[];
  category_id?: string | string[];
}>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function RecommendationRulesPage({ searchParams }: { searchParams: SearchParams }) {
  const query = await searchParams;
  const search = first(query.search).trim();
  const active = first(query.active) || "all";
  const projectKey = first(query.project_key).trim() || DEFAULT_RECOMMENDATION_PROJECT_KEY;
  const categoryId = first(query.category_id).trim();
  let rules: RecommendationRuleAdminRow[] = [];
  let categories: RecommendationPartnerCategory[] = [];
  let errorMessage: string | null = null;

  try {
    const [ruleRows, categoryRows] = await Promise.all([
      listRecommendationRules({
        projectKey,
        search,
        categoryId: categoryId || undefined,
        active: active === "active" ? true : active === "inactive" ? false : null,
      }),
      listRecommendationCategories({ projectKey }),
    ]);
    rules = ruleRows;
    categories = categoryRows;
  } catch (error) {
    errorMessage = error instanceof RecommendationServiceError ? error.message : "Empfehlungsregeln konnten nicht geladen werden.";
  }

  return (
    <main className="min-h-screen bg-[#FBF7F0] text-[#102A43]">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="rounded-[34px] border border-[#E8DED2] bg-white p-5 shadow-sm sm:p-7">
          <Link href="/admin" className="inline-flex items-center gap-2 rounded-full border border-[#D8C8B8] bg-[#FBF7F0] px-4 py-2 text-sm font-black"><ArrowLeft className="h-4 w-4" /> Zurück zum Admin</Link>
          <p className="mt-5 text-xs font-black uppercase tracking-[0.18em] text-[#A75B28]">Partnerempfehlungen</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Empfehlungsregeln</h1>
          <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-[#52616F]">Pflege Begriffe, Ausschlüsse, Matchfelder und Prioritäten für eine Kategorie. Zulässig sind ausschließlich die Regeltypen term und phrase.</p>
          <nav className="mt-5 flex flex-wrap gap-2" aria-label="Empfehlungsverwaltung">
            <Link href="/admin/empfehlungspartner" className="rounded-xl border border-[#D8C8B8] px-4 py-2 text-sm font-black">Partner</Link>
            <Link href="/admin/empfehlungspartner/kategorien" className="rounded-xl border border-[#D8C8B8] px-4 py-2 text-sm font-black">Kategorien</Link>
            <span className="rounded-xl bg-[#12395F] px-4 py-2 text-sm font-black text-white">Regeln</span>
          </nav>
        </header>

        <form method="get" className="grid gap-4 rounded-[28px] border border-[#E8DED2] bg-white p-5 shadow-sm lg:grid-cols-[minmax(190px,1fr)_180px_220px_220px_auto] lg:items-end">
          <label className="grid gap-2"><span className="text-xs font-black uppercase tracking-[0.12em] text-[#A75B28]">Suche</span><input name="search" defaultValue={search} placeholder="Regelname" className="min-h-11 rounded-2xl border border-[#D8C8B8] bg-[#FFFCF8] px-4 text-sm font-bold" /></label>
          <label className="grid gap-2"><span className="text-xs font-black uppercase tracking-[0.12em] text-[#A75B28]">Status</span><select name="active" defaultValue={active} className="min-h-11 rounded-2xl border border-[#D8C8B8] bg-[#FFFCF8] px-4 text-sm font-bold"><option value="all">Alle</option><option value="active">Aktiv</option><option value="inactive">Inaktiv</option></select></label>
          <label className="grid gap-2"><span className="text-xs font-black uppercase tracking-[0.12em] text-[#A75B28]">Kategorie</span><select name="category_id" defaultValue={categoryId} className="min-h-11 rounded-2xl border border-[#D8C8B8] bg-[#FFFCF8] px-4 text-sm font-bold"><option value="">Alle Kategorien</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <label className="grid gap-2"><span className="text-xs font-black uppercase tracking-[0.12em] text-[#A75B28]">Projekt</span><input name="project_key" defaultValue={projectKey} className="min-h-11 rounded-2xl border border-[#D8C8B8] bg-[#FFFCF8] px-4 text-sm font-bold" /></label>
          <button type="submit" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#12395F] px-5 text-sm font-black text-white"><Search className="h-4 w-4" /> Filtern</button>
        </form>

        <AdminRecommendationRuleManager initialRules={rules} categories={categories} projectKey={projectKey} initialError={errorMessage} />
      </section>
    </main>
  );
}
