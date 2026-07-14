import { ArrowLeft, Bot, ChevronLeft, ChevronRight, MousePointerClick, Search } from "lucide-react";
import Link from "next/link";
import {
  listRecommendationClicks,
  RecommendationClickServiceError,
  type RecommendationClickAdminRow,
} from "@/app/lib/recommendations/recommendationClickService";
import {
  DEFAULT_RECOMMENDATION_PROJECT_KEY,
  listRecommendationPartners,
} from "@/app/lib/recommendations/partnerService";
import { listRecommendationCategories } from "@/app/lib/recommendations/categoryService";
import type {
  RecommendationPartner,
  RecommendationPartnerCategory,
} from "@/app/lib/recommendations/types";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "–"
    : new Intl.DateTimeFormat("de-DE", {
        dateStyle: "short",
        timeStyle: "medium",
        timeZone: "Europe/Berlin",
      }).format(date);
}

function shortId(value: string | null) {
  return value ? `${value.slice(0, 8)}…` : "–";
}

function pageHref(query: URLSearchParams, page: number) {
  const next = new URLSearchParams(query);
  if (page > 1) next.set("page", String(page));
  else next.delete("page");
  return `/admin/empfehlungspartner/klicks?${next.toString()}`;
}

export default async function RecommendationClicksPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const input = await searchParams;
  const projectKey = first(input.project_key).trim() || DEFAULT_RECOMMENDATION_PROJECT_KEY;
  const search = first(input.search).trim();
  const partnerId = first(input.partner_id).trim();
  const categoryId = first(input.category_id).trim();
  const bot = first(input.bot) === "bot" || first(input.bot) === "human"
    ? first(input.bot) as "bot" | "human"
    : "all";
  const dateFrom = first(input.date_from).trim();
  const dateTo = first(input.date_to).trim();
  const requestedPage = Number(first(input.page) || "1");
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const limit = 50;
  let clicks: RecommendationClickAdminRow[] = [];
  let total = 0;
  let partners: RecommendationPartner[] = [];
  let categories: RecommendationPartnerCategory[] = [];
  let errorMessage: string | null = null;

  try {
    const [clickResult, partnerResult, categoryResult] = await Promise.all([
      listRecommendationClicks({
        projectKey,
        search,
        partnerId: partnerId || undefined,
        categoryId: categoryId || undefined,
        bot,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        page,
        limit,
      }),
      listRecommendationPartners({ projectKey, page: 1, limit: 100, sort: "name_asc" }),
      listRecommendationCategories({ projectKey, limit: 500 }),
    ]);
    clicks = clickResult.clicks;
    total = clickResult.total;
    partners = partnerResult.partners;
    categories = categoryResult;
  } catch (error) {
    errorMessage = error instanceof RecommendationClickServiceError
      ? error.message
      : "Klickübersicht konnte nicht geladen werden.";
  }

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const currentQuery = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    const clean = first(value).trim();
    if (clean && key !== "page") currentQuery.set(key, clean);
  }

  return (
    <main className="min-h-screen bg-[#FBF7F0] text-[#102A43]">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="rounded-[34px] border border-[#E8DED2] bg-white p-5 shadow-sm sm:p-7">
          <Link href="/admin" className="inline-flex items-center gap-2 rounded-full border border-[#D8C8B8] bg-[#FBF7F0] px-4 py-2 text-sm font-black">
            <ArrowLeft className="h-4 w-4" /> Zurück zum Admin
          </Link>
          <p className="mt-5 text-xs font-black uppercase tracking-[0.18em] text-[#A75B28]">Partnerempfehlungen</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Empfehlungsklicks</h1>
          <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-[#52616F]">
            Datensparsame Übersicht der internen Weiterleitungen. Botmarkierung ist heuristisch; Conversion- oder Provisionsdaten werden nicht erfasst.
          </p>
          <nav className="mt-5 flex flex-wrap gap-2" aria-label="Empfehlungsverwaltung">
            <Link href="/admin/empfehlungspartner" className="rounded-xl border border-[#D8C8B8] px-4 py-2 text-sm font-black">Partner</Link>
            <Link href="/admin/empfehlungspartner/kategorien" className="rounded-xl border border-[#D8C8B8] px-4 py-2 text-sm font-black">Kategorien</Link>
            <Link href="/admin/empfehlungspartner/regeln" className="rounded-xl border border-[#D8C8B8] px-4 py-2 text-sm font-black">Regeln</Link>
            <Link href="/admin/empfehlungspartner/simulation" className="rounded-xl border border-[#D8C8B8] px-4 py-2 text-sm font-black">Simulation</Link>
            <span className="rounded-xl bg-[#12395F] px-4 py-2 text-sm font-black text-white">Klicks</span>
          </nav>
        </header>

        <form method="get" className="grid gap-4 rounded-[28px] border border-[#E8DED2] bg-white p-5 shadow-sm lg:grid-cols-4 lg:items-end">
          <label className="grid gap-2"><span className="text-xs font-black uppercase tracking-[0.12em] text-[#A75B28]">Suche</span><input name="search" defaultValue={search} placeholder="Partner, Kategorie, Begriff, Klick-ID" className="min-h-11 rounded-2xl border border-[#D8C8B8] px-4 text-sm font-bold" /></label>
          <label className="grid gap-2"><span className="text-xs font-black uppercase tracking-[0.12em] text-[#A75B28]">Partner</span><select name="partner_id" defaultValue={partnerId} className="min-h-11 rounded-2xl border border-[#D8C8B8] px-4 text-sm font-bold"><option value="">Alle Partner</option>{partners.map((partner) => <option key={partner.id} value={partner.id}>{partner.name}</option>)}</select></label>
          <label className="grid gap-2"><span className="text-xs font-black uppercase tracking-[0.12em] text-[#A75B28]">Kategorie</span><select name="category_id" defaultValue={categoryId} className="min-h-11 rounded-2xl border border-[#D8C8B8] px-4 text-sm font-bold"><option value="">Alle Kategorien</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <label className="grid gap-2"><span className="text-xs font-black uppercase tracking-[0.12em] text-[#A75B28]">Aufruf</span><select name="bot" defaultValue={bot} className="min-h-11 rounded-2xl border border-[#D8C8B8] px-4 text-sm font-bold"><option value="all">Alle</option><option value="human">Wahrscheinlich Mensch</option><option value="bot">Wahrscheinlich Bot</option></select></label>
          <label className="grid gap-2"><span className="text-xs font-black uppercase tracking-[0.12em] text-[#A75B28]">Von</span><input type="date" name="date_from" defaultValue={dateFrom} className="min-h-11 rounded-2xl border border-[#D8C8B8] px-4 text-sm font-bold" /></label>
          <label className="grid gap-2"><span className="text-xs font-black uppercase tracking-[0.12em] text-[#A75B28]">Bis</span><input type="date" name="date_to" defaultValue={dateTo} className="min-h-11 rounded-2xl border border-[#D8C8B8] px-4 text-sm font-bold" /></label>
          <label className="grid gap-2"><span className="text-xs font-black uppercase tracking-[0.12em] text-[#A75B28]">Projekt</span><input name="project_key" defaultValue={projectKey} className="min-h-11 rounded-2xl border border-[#D8C8B8] px-4 text-sm font-bold" /></label>
          <button type="submit" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#12395F] px-5 text-sm font-black text-white"><Search className="h-4 w-4" /> Filtern</button>
        </form>

        <section className="overflow-hidden rounded-[28px] border border-[#E8DED2] bg-white shadow-sm">
          <div className="flex items-center justify-between gap-4 border-b border-[#E8DED2] px-5 py-4">
            <div className="flex items-center gap-3"><MousePointerClick className="h-5 w-5 text-[#A75B28]" /><p className="font-black">{errorMessage ? "Laden nicht möglich" : `${total} Klicks`}</p></div>
            <p className="text-sm font-bold text-[#52616F]">Seite {page} von {totalPages}</p>
          </div>
          {errorMessage ? <p className="p-5 text-sm font-bold text-[#B5282D]">{errorMessage}</p> : clicks.length === 0 ? <p className="p-5 text-sm font-semibold text-[#52616F]">Keine Klicks für diese Filter gefunden.</p> : (
            <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-sm"><thead className="bg-[#FBF7F0] text-xs uppercase tracking-[0.12em] text-[#52616F]"><tr><th className="px-4 py-3">Zeitpunkt</th><th className="px-4 py-3">Partner</th><th className="px-4 py-3">Kategorie</th><th className="px-4 py-3">Match</th><th className="px-4 py-3">Zuordnung</th><th className="px-4 py-3">Referrer</th><th className="px-4 py-3">Typ</th><th className="px-4 py-3">Klick-ID</th></tr></thead><tbody className="divide-y divide-[#E8DED2]">{clicks.map((click) => <tr key={click.id}><td className="px-4 py-3 font-bold">{formatDate(click.clickedAt)}</td><td className="px-4 py-3"><p className="font-black">{click.partnerName}</p><p className="text-xs text-[#52616F]">{click.partnerCode}</p></td><td className="px-4 py-3 font-bold">{click.categoryName}</td><td className="px-4 py-3">{click.matchedTerm || "–"}</td><td className="px-4 py-3 text-xs"><p>Anfrage {shortId(click.requestId)}</p><p>Position {shortId(click.requestItemId)}</p></td><td className="max-w-[220px] truncate px-4 py-3" title={click.referrerOrigin || undefined}>{click.referrerOrigin || "–"}</td><td className="px-4 py-3">{click.isProbableBot ? <span className="inline-flex items-center gap-1 rounded-full bg-[#FFF1F1] px-2 py-1 text-xs font-black text-[#B5282D]"><Bot className="h-3.5 w-3.5" /> Bot</span> : <span className="rounded-full bg-[#F0FFF6] px-2 py-1 text-xs font-black text-[#2F7D50]">Mensch</span>}</td><td className="px-4 py-3 font-mono text-xs" title={click.clickToken}>{click.clickToken.slice(0, 10)}…</td></tr>)}</tbody></table></div>
          )}
        </section>

        <div className="flex justify-between gap-4">
          {page > 1 ? <Link href={pageHref(currentQuery, page - 1)} className="inline-flex items-center gap-2 rounded-xl border border-[#D8C8B8] bg-white px-4 py-2 text-sm font-black"><ChevronLeft className="h-4 w-4" /> Zurück</Link> : <span />}
          {page < totalPages ? <Link href={pageHref(currentQuery, page + 1)} className="inline-flex items-center gap-2 rounded-xl border border-[#D8C8B8] bg-white px-4 py-2 text-sm font-black">Weiter <ChevronRight className="h-4 w-4" /></Link> : null}
        </div>
      </section>
    </main>
  );
}
