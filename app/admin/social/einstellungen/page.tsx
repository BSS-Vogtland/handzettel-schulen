import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Settings, Sparkles } from "lucide-react";
import { supabaseServer } from "@/lib/supabase/server";
import AdminSocialProjectSettingsForm from "@/components/AdminSocialProjectSettingsForm";

export const dynamic = "force-dynamic";

type SocialProjectRow = {
  id: string;
  name: string;
  website_url: string | null;
  industry: string | null;
  target_audience: string | null;
  offer_summary: string | null;
  brand_voice: string | null;
  image_style: string | null;
  additional_notes: string | null;
  content_pillars: string[] | null;
  content_goals: string[] | null;
  taboo_topics: string[] | null;
  cta_examples: string[] | null;
  platform_targets: string[] | null;
};

export default async function AdminSocialSettingsPage() {
  const { data, error } = await supabaseServer
    .from("social_projects")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    notFound();
  }

  const project = data as SocialProjectRow;

  return (
    <main className="min-h-screen bg-[#FBF7F0] px-4 py-8 text-[#102A43] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="rounded-[2rem] border border-[#E7D8C3] bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-4xl">
              <div className="mb-4 flex flex-wrap gap-3">
                <Link
                  href="/admin/social"
                  className="inline-flex items-center gap-2 rounded-2xl border border-[#E7D8C3] bg-[#FFFCF7] px-4 py-2 text-sm font-black text-[#A23A2E] transition hover:bg-[#F5E8D8]"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Zurück zum SocialPilot
                </Link>

                <Link
                  href="/admin"
                  className="inline-flex items-center gap-2 rounded-2xl border border-[#E7D8C3] bg-white px-4 py-2 text-sm font-black text-[#486581] transition hover:bg-[#FFFCF7]"
                >
                  Zum Adminbereich
                </Link>
              </div>

              <div className="inline-flex items-center gap-2 rounded-full border border-[#E7D8C3] bg-[#FFFCF7] px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[#8A5A35]">
                <Settings className="h-4 w-4" />
                SocialPilot Einstellungen
              </div>

              <h1 className="mt-4 text-3xl font-black tracking-tight text-[#102A43] sm:text-4xl">
                Projektprofil verwalten
              </h1>

              <p className="mt-3 max-w-3xl text-base leading-7 text-[#486581]">
                Hier wird der SocialPilot replizierbar: Marke, Branche,
                Zielgruppe, Angebot, Tonfall, Bildstil und Content-Säulen
                werden nicht mehr fest im Code gedacht, sondern als
                konfigurierbares Projektprofil gepflegt.
              </p>
            </div>

            <div className="rounded-[1.5rem] border border-[#E7D8C3] bg-[#FFFCF7] p-4">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[#B5282D]">
                <Sparkles className="h-5 w-5" />
              </div>

              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8A5A35]">
                Self-Service-Basis
              </p>

              <p className="mt-2 max-w-xs text-sm font-semibold leading-6 text-[#52616F]">
                Genau diese Seite kann später ein Kunde selbst ausfüllen und
                verwalten.
              </p>
            </div>
          </div>
        </header>

        <AdminSocialProjectSettingsForm project={project} />
      </div>
    </main>
  );
}