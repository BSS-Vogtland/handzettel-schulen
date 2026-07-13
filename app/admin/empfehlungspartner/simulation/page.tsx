import { DEFAULT_RECOMMENDATION_PROJECT_KEY } from "@/app/lib/recommendations/serviceSupport";
import AdminRecommendationSimulation from "@/components/AdminRecommendationSimulation";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ project_key?: string | string[] }>;

export default async function RecommendationSimulationPage({ searchParams }: { searchParams: SearchParams }) {
  const query = await searchParams;
  const projectValue = Array.isArray(query.project_key) ? query.project_key[0] : query.project_key;
  const projectKey = projectValue?.trim() || DEFAULT_RECOMMENDATION_PROJECT_KEY;

  return (
    <main className="min-h-screen bg-[#FBF7F0] text-[#102A43]">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="rounded-[34px] border border-[#E8DED2] bg-white p-5 shadow-sm sm:p-7">
          <Link href="/admin" className="inline-flex items-center gap-2 rounded-full border border-[#D8C8B8] bg-[#FBF7F0] px-4 py-2 text-sm font-black"><ArrowLeft className="h-4 w-4" /> Zurück zum Admin</Link>
          <p className="mt-5 text-xs font-black uppercase tracking-[0.18em] text-[#A75B28]">Partnerempfehlungen</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Empfehlungssimulation</h1>
          <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-[#52616F]">Internes, rein lesendes Diagnosewerkzeug. Die Simulation erklärt Normalisierung, Regelprüfung, Kategorien, Partnerrangfolge und Gewinner – ohne Speicherung, Kundenausspielung oder Tracking.</p>
          <nav className="mt-5 flex flex-wrap gap-2" aria-label="Empfehlungsverwaltung">
            <Link href="/admin/empfehlungspartner" className="rounded-xl border border-[#D8C8B8] px-4 py-2 text-sm font-black">Partner</Link>
            <Link href="/admin/empfehlungspartner/kategorien" className="rounded-xl border border-[#D8C8B8] px-4 py-2 text-sm font-black">Kategorien</Link>
            <Link href="/admin/empfehlungspartner/regeln" className="rounded-xl border border-[#D8C8B8] px-4 py-2 text-sm font-black">Regeln</Link>
            <span className="rounded-xl bg-[#12395F] px-4 py-2 text-sm font-black text-white">Simulation</span>
          </nav>
        </header>
        <AdminRecommendationSimulation initialProjectKey={projectKey} />
      </section>
    </main>
  );
}
