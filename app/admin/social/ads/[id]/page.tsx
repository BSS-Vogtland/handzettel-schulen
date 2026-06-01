import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  BadgeEuro,
  CalendarClock,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";
import { supabaseServer } from "@/lib/supabase/server";
import AdminSocialAdApprovalBox from "@/components/AdminSocialAdApprovalBox";

export const dynamic = "force-dynamic";

type CampaignRow = {
  id: string;
  created_at: string;
  updated_at: string;
  status: string;
  platform: string;
  objective: string;
  campaign_name: string;
  ad_headline: string | null;
  ad_text: string | null;
  landing_page_url: string | null;
  target_location: string | null;
  target_audience_description: string | null;
  placements: string[] | null;
  daily_budget_cents: number | null;
  lifetime_budget_cents: number | null;
  currency: string;
  start_at: string | null;
  end_at: string | null;
  notes: string | null;
  approved_at: string | null;
  approved_by_name: string | null;
  approved_by_email: string | null;
};

type ApprovalRow = {
  id: string;
  created_at: string;
  approved_by_name: string;
  approved_by_email: string | null;
  approval_text: string;
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

function getPlatformLabel(platform: string) {
  switch (platform) {
    case "meta":
      return "Meta: Facebook / Instagram";
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

export default async function AdminSocialAdsDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data, error } = await supabaseServer
    .from("social_ad_campaigns")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    notFound();
  }

  const campaign = data as CampaignRow;

  const { data: approvalsData } = await supabaseServer
    .from("social_ad_approvals")
    .select("*")
    .eq("campaign_id", id)
    .order("created_at", { ascending: false });

  const approvals = (approvalsData || []) as ApprovalRow[];
  const isApproved = campaign.status === "approved" || approvals.length > 0;

  return (
    <main className="min-h-screen bg-[#FBF7F0] px-4 py-8 text-[#102A43] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="rounded-[2rem] border border-[#E7D8C3] bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-4xl">
              <div className="mb-4 flex flex-wrap gap-3">
                <Link
                  href="/admin/social/ads"
                  className="inline-flex items-center gap-2 rounded-2xl border border-[#E7D8C3] bg-[#FFFCF7] px-4 py-2 text-sm font-black text-[#A23A2E] transition hover:bg-[#F5E8D8]"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Zurück zu Ads
                </Link>

                <Link
                  href="/admin/social"
                  className="inline-flex items-center gap-2 rounded-2xl border border-[#E7D8C3] bg-white px-4 py-2 text-sm font-black text-[#486581] transition hover:bg-[#FFFCF7]"
                >
                  Zum SocialPilot
                </Link>
              </div>

              <div className="inline-flex items-center gap-2 rounded-full border border-[#E7D8C3] bg-[#FFFCF7] px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[#8A5A35]">
                <BadgeEuro className="h-4 w-4" />
                Ads-Kampagne
              </div>

              <h1 className="mt-4 text-3xl font-black tracking-tight text-[#102A43] sm:text-4xl">
                {campaign.campaign_name}
              </h1>

              <p className="mt-3 max-w-3xl text-base leading-7 text-[#486581]">
                Hier wird die Kampagne geprüft und das Werbebudget aktiv
                freigegeben. Noch wird keine echte Werbung geschaltet.
              </p>
            </div>

            <div className="rounded-[1.5rem] border border-[#E7D8C3] bg-[#FFFCF7] p-4">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8A5A35]">
                Status
              </p>
              <p className="mt-1 text-xl font-black text-[#102A43]">
                {getStatusLabel(campaign.status)}
              </p>

              <div className="mt-4 space-y-2 text-sm font-semibold text-[#52616F]">
                <p>Plattform: {getPlatformLabel(campaign.platform)}</p>
                <p>Ziel: {campaign.objective}</p>
                <p>Erstellt: {formatDateTime(campaign.created_at)}</p>
              </div>
            </div>
          </div>
        </header>

        <section className="grid gap-5 lg:grid-cols-3">
          <div className="rounded-[1.5rem] border border-[#E7D8C3] bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-[#627D98]">Tagesbudget</p>
            <p className="mt-1 text-3xl font-black text-[#102A43]">
              {formatEuro(campaign.daily_budget_cents)}
            </p>
          </div>

          <div className="rounded-[1.5rem] border border-[#E7D8C3] bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-[#627D98]">Gesamtbudget</p>
            <p className="mt-1 text-3xl font-black text-[#102A43]">
              {formatEuro(campaign.lifetime_budget_cents)}
            </p>
          </div>

          <div className="rounded-[1.5rem] border border-[#E7D8C3] bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-[#627D98]">Laufzeit</p>
            <p className="mt-1 text-sm font-black leading-6 text-[#102A43]">
              {formatDateTime(campaign.start_at)} <br />
              bis {formatDateTime(campaign.end_at)}
            </p>
          </div>
        </section>

        <section className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm sm:p-7">
          <h2 className="text-2xl font-black text-[#102A43]">
            Kampagnendetails
          </h2>

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8A5A35]">
                Anzeigenheadline
              </p>
              <p className="mt-2 text-sm font-semibold leading-6 text-[#102A43]">
                {campaign.ad_headline || "—"}
              </p>
            </div>

            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8A5A35]">
                Landingpage
              </p>
              {campaign.landing_page_url ? (
                <a
                  href={campaign.landing_page_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-2 text-sm font-black text-[#B5282D] hover:underline"
                >
                  {campaign.landing_page_url}
                  <ExternalLink className="h-4 w-4" />
                </a>
              ) : (
                <p className="mt-2 text-sm font-semibold text-[#102A43]">—</p>
              )}
            </div>

            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8A5A35]">
                Zielregion
              </p>
              <p className="mt-2 text-sm font-semibold leading-6 text-[#102A43]">
                {campaign.target_location || "—"}
              </p>
            </div>

            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8A5A35]">
                Platzierungen
              </p>
              <p className="mt-2 text-sm font-semibold leading-6 text-[#102A43]">
                {(campaign.placements || []).join(", ") || "—"}
              </p>
            </div>

            <div className="lg:col-span-2">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8A5A35]">
                Zielgruppe
              </p>
              <p className="mt-2 whitespace-pre-line text-sm font-semibold leading-6 text-[#102A43]">
                {campaign.target_audience_description || "—"}
              </p>
            </div>

            <div className="lg:col-span-2">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8A5A35]">
                Anzeigentext
              </p>
              <p className="mt-2 whitespace-pre-line text-sm font-semibold leading-6 text-[#102A43]">
                {campaign.ad_text || "—"}
              </p>
            </div>

            <div className="lg:col-span-2">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8A5A35]">
                Interne Notiz
              </p>
              <p className="mt-2 whitespace-pre-line text-sm font-semibold leading-6 text-[#102A43]">
                {campaign.notes || "—"}
              </p>
            </div>
          </div>
        </section>

        <AdminSocialAdApprovalBox
          campaignId={campaign.id}
          isAlreadyApproved={isApproved}
        />

        {approvals.length > 0 ? (
          <section className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm sm:p-7">
            <div className="mb-5 flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-emerald-700" />
              <h2 className="text-2xl font-black text-[#102A43]">
                Freigabeprotokoll
              </h2>
            </div>

            <div className="space-y-4">
              {approvals.map((approval) => (
                <article
                  key={approval.id}
                  className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4"
                >
                  <p className="text-sm font-black text-emerald-900">
                    Freigegeben von: {approval.approved_by_name}
                  </p>

                  <p className="mt-1 text-sm font-bold text-emerald-800">
                    {formatDateTime(approval.created_at)}
                  </p>

                  <p className="mt-3 text-sm font-semibold leading-6 text-emerald-900">
                    {approval.approval_text}
                  </p>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}