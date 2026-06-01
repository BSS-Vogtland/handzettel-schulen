import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  KeyRound,
  PlugZap,
  ShieldCheck,
} from "lucide-react";
import { supabaseServer } from "@/lib/supabase/server";
import AdminSocialIntegrationCard from "@/components/AdminSocialIntegrationCard";

export const dynamic = "force-dynamic";

type SocialProjectRow = {
  id: string;
  name: string;
};

type IntegrationRow = {
  id: string;
  provider: string;
  provider_label: string;
  status: string;
  account_label: string | null;
  account_identifier: string | null;
  external_account_url: string | null;
  setup_notes: string | null;
  internal_notes: string | null;
  is_required: boolean;
  last_checked_at: string | null;
};

const DEFAULT_INTEGRATIONS = [
  {
    provider: "openai",
    provider_label: "OpenAI",
    is_required: true,
    setup_notes:
      "Der Kunde soll einen eigenen OpenAI-Account betreiben. Für V1 hier nur Status dokumentieren, keine API-Keys speichern.",
  },
  {
    provider: "meta",
    provider_label: "Meta Business / Facebook / Instagram",
    is_required: true,
    setup_notes:
      "Für Facebook/Instagram Ads braucht der Kunde ein Meta-Business-Konto, eine Facebook-Seite, ein Instagram-Business-Konto und ein Werbekonto.",
  },
  {
    provider: "google_ads",
    provider_label: "Google Ads",
    is_required: false,
    setup_notes:
      "Für Google Ads braucht der Kunde ein eigenes Google-Ads-Konto. Später ist hier die Kundennummer bzw. Manager-Verknüpfung relevant.",
  },
  {
    provider: "tiktok",
    provider_label: "TikTok Business / TikTok Ads",
    is_required: false,
    setup_notes:
      "Für TikTok braucht der Kunde ein Business-/Ads-Konto. Posting und Ads benötigen später separate API-Freigaben.",
  },
];

async function ensureDefaultIntegrations(projectId: string) {
  const rows = DEFAULT_INTEGRATIONS.map((integration) => ({
    project_id: projectId,
    provider: integration.provider,
    provider_label: integration.provider_label,
    status: "not_started",
    is_required: integration.is_required,
    setup_notes: integration.setup_notes,
  }));

  await supabaseServer
    .from("social_integrations")
    .upsert(rows, {
      onConflict: "project_id,provider",
      ignoreDuplicates: true,
    });
}

function getStatusSummary(integrations: IntegrationRow[]) {
  const connected = integrations.filter(
    (integration) => integration.status === "connected"
  ).length;

  const required = integrations.filter((integration) => integration.is_required);
  const requiredConnected = required.filter(
    (integration) => integration.status === "connected"
  ).length;

  const attention = integrations.filter(
    (integration) =>
      integration.status === "needs_attention" || integration.status === "error"
  ).length;

  return {
    connected,
    requiredTotal: required.length,
    requiredConnected,
    attention,
  };
}

export default async function AdminSocialAccountsPage() {
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

  await ensureDefaultIntegrations(project.id);

  const { data: integrationsData, error: integrationsError } =
    await supabaseServer
      .from("social_integrations")
      .select("*")
      .eq("project_id", project.id)
      .order("provider", { ascending: true });

  if (integrationsError) {
    notFound();
  }

  const integrations = (integrationsData || []) as IntegrationRow[];
  const summary = getStatusSummary(integrations);

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
                  href="/admin/social/ads"
                  className="inline-flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-black text-amber-800 transition hover:bg-amber-100"
                >
                  Zum Ads-Modul
                </Link>
              </div>

              <div className="inline-flex items-center gap-2 rounded-full border border-[#E7D8C3] bg-[#FFFCF7] px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[#8A5A35]">
                <PlugZap className="h-4 w-4" />
                Externe Konten
              </div>

              <h1 className="mt-4 text-3xl font-black tracking-tight text-[#102A43] sm:text-4xl">
                Kundenkonten vorbereiten
              </h1>

              <p className="mt-3 max-w-3xl text-base leading-7 text-[#486581]">
                Hier wird dokumentiert, ob der Kunde seine eigenen externen
                Konten für OpenAI, Meta, Google Ads und TikTok vorbereitet hat.
                V1 speichert keine geheimen Zugangsdaten, sondern nur Status,
                Referenzen und Hinweise.
              </p>
            </div>

            <div className="rounded-[1.5rem] border border-[#E7D8C3] bg-[#FFFCF7] p-4">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[#B5282D]">
                <KeyRound className="h-5 w-5" />
              </div>

              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8A5A35]">
                Projekt
              </p>

              <p className="mt-2 max-w-xs text-sm font-black leading-6 text-[#102A43]">
                {project.name}
              </p>

              <p className="mt-2 max-w-xs text-xs font-semibold leading-5 text-[#627D98]">
                Laufende OpenAI-/API-/Werbekosten sollen später grundsätzlich
                über Kundenkonten laufen.
              </p>
            </div>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-[1.5rem] border border-[#E7D8C3] bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[#627D98]">
                  Verbunden
                </p>
                <p className="text-3xl font-black text-[#102A43]">
                  {summary.connected}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-[#E7D8C3] bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-blue-50 p-3 text-blue-700">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[#627D98]">
                  Pflicht-Konten bereit
                </p>
                <p className="text-3xl font-black text-[#102A43]">
                  {summary.requiredConnected}/{summary.requiredTotal}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-[#E7D8C3] bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-amber-50 p-3 text-amber-700">
                <PlugZap className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[#627D98]">
                  Prüfung nötig
                </p>
                <p className="text-3xl font-black text-[#102A43]">
                  {summary.attention}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-amber-200 bg-amber-50 p-5 shadow-sm sm:p-7">
          <h2 className="text-xl font-black text-amber-950">
            Sicherheitsregel für V1
          </h2>

          <p className="mt-2 text-sm font-bold leading-6 text-amber-900">
            In diese Felder gehören keine OpenAI-Keys, keine Meta-Tokens, keine
            Google-OAuth-Secrets und keine Passwörter. Diese Seite ist eine
            Einrichtungs- und Statusverwaltung. Echte Verbindungen werden später
            über OAuth, sichere Server-Secrets oder eine Vault-Lösung gebaut.
          </p>
        </section>

        <section className="space-y-5">
          {integrations.map((integration) => (
            <AdminSocialIntegrationCard
              key={integration.id}
              integration={integration}
            />
          ))}
        </section>
      </div>
    </main>
  );
}