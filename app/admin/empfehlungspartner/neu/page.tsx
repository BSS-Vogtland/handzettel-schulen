import AdminRecommendationPartnerForm from "@/components/AdminRecommendationPartnerForm";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default function NewRecommendationPartnerPage() {
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
          <p className="mt-5 text-xs font-black uppercase tracking-[0.18em] text-[#A75B28]">Neuer Datensatz</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight">Empfehlungspartner anlegen</h1>
          <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-[#52616F]">
            Hinterlege den Partner und sein Browser-Ziel. Die eigentliche Zuordnung zu Kategorien folgt in E1C.
          </p>
        </header>

        <AdminRecommendationPartnerForm mode="create" />
      </section>
    </main>
  );
}
