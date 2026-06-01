import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  BellRing,
  CalendarClock,
  CheckCircle2,
  ShieldCheck,
} from "lucide-react";
import { supabaseServer } from "@/lib/supabase/server";
import AdminSocialAutomationSettingsForm from "@/components/AdminSocialAutomationSettingsForm";

export const dynamic = "force-dynamic";

type SocialProjectRow = {
  id: string;
  name: string;
};

type AutomationSettingsRow = {
  id: string;
  automation_enabled: boolean;
  auto_prepare_content: boolean;
  email_notifications_enabled: boolean;

  recipient_email: string | null;
  recipient_name: string | null;

  timezone: string;
  reminder_times: string[];

  preparation_mode: string;
  prep_lead_business_days: number;

  move_monday_to_friday: boolean;
  move_weekend_to_friday: boolean;

  post_only_after_review: boolean;
  ads_only_after_review: boolean;

  notes: string | null;
};

async function ensureAutomationSettings(projectId: string) {
  const { data: existing } = await supabaseServer
    .from("social_automation_settings")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();

  if (existing) return existing as AutomationSettingsRow;

  const { data, error } = await supabaseServer
    .from("social_automation_settings")
    .insert({
      project_id: projectId,
      automation_enabled: true,
      auto_prepare_content: true,
      email_notifications_enabled: true,
      recipient_email: null,
      recipient_name: null,
      timezone: "Europe/Berlin",
      reminder_times: ["08:00", "18:00"],
      preparation_mode: "previous_business_day",
      prep_lead_business_days: 1,
      move_monday_to_friday: true,
      move_weekend_to_friday: true,
      post_only_after_review: true,
      ads_only_after_review: true,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as AutomationSettingsRow;
}

export default async function AdminSocialAutomationPage() {
  const { data: projectData, error: projectError } = await supabaseServer
    .from("social_projects")
    .select("id, name")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (projectError || !projectData) {
    notFound();
  }

  const project = projectData as SocialProjectRow;
  const settings = await ensureAutomationSettings(project.id);

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
                  href="/admin/social/kalender"
                  className="inline-flex items-center gap-2 rounded-2xl border border-[#E7D8C3] bg-white px-4 py-2 text-sm font-black text-[#486581] transition hover:bg-[#FFFCF7]"
                >
                  <CalendarClock className="h-4 w-4" />
                  Zum Kalender
                </Link>
              </div>

              <div className="inline-flex items-center gap-2 rounded-full border border-[#E7D8C3] bg-[#FFFCF7] px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[#8A5A35]">
                <BellRing className="h-4 w-4" />
                Social-Automation
              </div>

              <h1 className="mt-4 text-3xl font-black tracking-tight text-[#102A43] sm:text-4xl">
                Erinnerungen und Vorab-Generierung
              </h1>

              <p className="mt-3 max-w-3xl text-base leading-7 text-[#486581]">
                Lege fest, wann Content vorbereitet und wann der Kunde oder
                Mitarbeiter zur Review-Freigabe erinnert wird. Die Logik
                berücksichtigt Arbeitstage: Content für Montag und Wochenende
                wird standardmäßig am Freitag vorbereitet und erinnert.
              </p>
            </div>

            <div className="rounded-[1.5rem] border border-[#E7D8C3] bg-[#FFFCF7] p-4">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8A5A35]">
                Projekt
              </p>
              <p className="mt-1 text-xl font-black text-[#102A43]">
                {project.name}
              </p>

              <div className="mt-4 space-y-2 text-sm font-semibold text-[#52616F]">
                <p className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                  Review-Gate bleibt aktiv
                </p>
                <p className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-700" />
                  Posting und Ads nur nach Freigabe
                </p>
              </div>
            </div>
          </div>
        </header>

        <AdminSocialAutomationSettingsForm initialSettings={settings} />
      </div>
    </main>
  );
}