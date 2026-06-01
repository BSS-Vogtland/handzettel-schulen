import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BadgeEuro,
  Megaphone,
  ShieldCheck,
} from "lucide-react";
import { supabaseServer } from "@/lib/supabase/server";
import AdminSocialAdCampaignForm from "@/components/AdminSocialAdCampaignForm";
import AdminSocialAdDeleteButton from "@/components/AdminSocialAdDeleteButton";

export const dynamic = "force-dynamic";

type CampaignRow = {
  id: string;
  created_at: string;
  status: string;
  platform: string;
  objective: string;
  campaign_name: string;
  daily_budget_cents: number | null;
  lifetime_budget_cents: number | null;
  currency: string;
  start_at: string | null;
  end_at: string | null;
};

type SocialPostOption = {
  id: string;
  topic: string;
  hook: string;
};

type SocialAssetOption = {
  id: string;
  post_id: string;
  public_url: string | null;
};

function formatEuro(cents: number | null) {
  if (!cents) return "—";

  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

function formatDateTime(value: string | null) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getStatusLabel(status: string) {
  switch (status) {
    case "draft":
      return "Entwurf";
    case "review":
      return "Zur Prüfung";
    case "approved":
      return "Freigegeben";
    case "ready_to_launch":
      return "Startbereit";
    case "launched":
      return "Gestartet";
    case "paused":
      return "Pausiert";
    case "ended":
      return "Beendet";
    case "cancelled":
      return "Abgebrochen";
    default:
      return status;
  }
}

function getStatusClasses(status: string) {
  switch (status) {
    case "approved":
    case "ready_to_launch":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "launched":
      return "border-blue-200 bg-blue-50 text-blue-800";
    case "cancelled":
      return "border-red-200 bg-red-50 text-red-800";
    case "review":
      return "border-purple-200 bg-purple-50 text-purple-800";
    default:
      return "border-amber-200 bg-amber-50 text-amber-800";
  }
}

function getPlatformLabel(platform: string) {
  switch (platform) {
    case "meta":
      return "Meta";
    case "google":
      return "Google Ads";
    case "tiktok":
      return "TikTok Ads";
    case "manual":
      return "Manuell";
    default:
      return platform;
  }
}

export default async function AdminSocialAdsPage() {
  const { data: postsData } = await supabaseServer
    .from("social_posts")
    .select("id, topic, hook")
    .neq("status", "archived")
    .order("created_at", { ascending: false })
    .limit(100);

  const { data: assetsData } = await supabaseServer
    .from("social_assets")
    .select("id, post_id, public_url")
    .eq("asset_type", "image")
    .neq("status", "archived")
    .order("created_at", { ascending: false })
    .limit(200);

  const { data: campaignsData, error } = await supabaseServer
    .from("social_ad_campaigns")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  const posts = (postsData || []) as SocialPostOption[];
  const assets = (assetsData || []) as SocialAssetOption[];
  const campaigns = (campaignsData || []) as CampaignRow[];

  const approvedCount = campaigns.filter(
    (campaign) => campaign.status === "approved"
  ).length;

  const draftCount = campaigns.filter(
    (campaign) => campaign.status === "draft"
  ).length;

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
                <BadgeEuro className="h-4 w-4" />
                Ads-Modul
              </div>

              <h1 className="mt-4 text-3xl font-black tracking-tight text-[#102A43] sm:text-4xl">
                Bezahlte Werbung planen
              </h1>

              <p className="mt-3 max-w-3xl text-base leading-7 text-[#486581]">
                Erstelle Kampagnenentwürfe mit Plattform, Zielgruppe, Laufzeit
                und Budget. Es wird noch keine Werbung geschaltet. Entscheidend
                ist hier die saubere Budgetfreigabe durch den Kunden.
              </p>
            </div>

            <div className="rounded-[1.5rem] border border-amber-200 bg-amber-50 p-4">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-amber-700">
                <ShieldCheck className="h-5 w-5" />
              </div>

              <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-800">
                Schutzlogik
              </p>

              <p className="mt-2 max-w-xs text-sm font-semibold leading-6 text-amber-900">
                Kein Budget darf ohne aktive Kundenfreigabe ausgegeben werden.
              </p>
            </div>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-[1.5rem] border border-[#E7D8C3] bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-[#627D98]">Entwürfe</p>
            <p className="mt-1 text-3xl font-black text-[#102A43]">
              {draftCount}
            </p>
          </div>

          <div className="rounded-[1.5rem] border border-[#E7D8C3] bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-[#627D98]">
              Freigegeben
            </p>
            <p className="mt-1 text-3xl font-black text-[#102A43]">
              {approvedCount}
            </p>
          </div>

          <div className="rounded-[1.5rem] border border-[#E7D8C3] bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-[#627D98]">
              Kampagnen gesamt
            </p>
            <p className="mt-1 text-3xl font-black text-[#102A43]">
              {campaigns.length}
            </p>
          </div>
        </section>

        <AdminSocialAdCampaignForm posts={posts} assets={assets} />

        {error ? (
          <section className="rounded-[1.5rem] border border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-800">
            Fehler beim Laden der Ads-Kampagnen: {error.message}
          </section>
        ) : null}

        <section className="space-y-4">
          {campaigns.map((campaign) => {
            const deleteDisabled = campaign.status === "launched";

            return (
              <article
                key={campaign.id}
                className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm sm:p-6"
              >
                <div className="grid gap-5 lg:grid-cols-[1fr_280px] lg:items-start">
                  <div>
                    <div className="mb-3 flex flex-wrap gap-2">
                      <span
                        className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${getStatusClasses(
                          campaign.status
                        )}`}
                      >
                        {getStatusLabel(campaign.status)}
                      </span>

                      <span className="inline-flex rounded-full border border-[#E7D8C3] bg-[#FFFCF7] px-3 py-1 text-xs font-black text-[#486581]">
                        {getPlatformLabel(campaign.platform)}
                      </span>

                      <span className="inline-flex rounded-full border border-[#E7D8C3] bg-white px-3 py-1 text-xs font-black text-[#486581]">
                        Ziel: {campaign.objective}
                      </span>
                    </div>

                    <h2 className="text-2xl font-black text-[#102A43]">
                      {campaign.campaign_name}
                    </h2>

                    <div className="mt-4 grid gap-3 text-sm font-semibold text-[#52616F] sm:grid-cols-2">
                      <p>Tagesbudget: {formatEuro(campaign.daily_budget_cents)}</p>
                      <p>
                        Gesamtbudget: {formatEuro(campaign.lifetime_budget_cents)}
                      </p>
                      <p>Start: {formatDateTime(campaign.start_at)}</p>
                      <p>Ende: {formatDateTime(campaign.end_at)}</p>
                    </div>

                    {deleteDisabled ? (
                      <p className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800">
                        Gestartete Kampagnen können später nicht hart gelöscht
                        werden. Dafür bauen wir eine Pausieren-/Beenden-Logik.
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-col gap-3 lg:items-end">
                    <Link
                      href={`/admin/social/ads/${campaign.id}`}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#B5282D] px-4 py-2.5 text-sm font-black text-white shadow-sm transition hover:brightness-110 lg:w-auto"
                    >
                      Kampagne öffnen
                      <ArrowRight className="h-4 w-4" />
                    </Link>

                    <AdminSocialAdDeleteButton
                      campaignId={campaign.id}
                      campaignName={campaign.campaign_name}
                      disabled={deleteDisabled}
                    />
                  </div>
                </div>
              </article>
            );
          })}

          {campaigns.length === 0 && !error ? (
            <section className="rounded-[2rem] border border-dashed border-[#D9C4A8] bg-white p-8 text-center shadow-sm">
              <Megaphone className="mx-auto h-10 w-10 text-[#B5282D]" />
              <h2 className="mt-4 text-xl font-black text-[#102A43]">
                Noch keine Ads-Kampagnen vorhanden
              </h2>
              <p className="mx-auto mt-2 max-w-xl text-sm font-semibold leading-6 text-[#627D98]">
                Erstelle oben den ersten Kampagnenentwurf mit Budget und
                Zielgruppe.
              </p>
            </section>
          ) : null}
        </section>
      </div>
    </main>
  );
}