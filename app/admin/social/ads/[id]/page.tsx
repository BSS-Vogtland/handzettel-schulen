import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  BadgeEuro,
  CopyPlus,
  ExternalLink,
  History,
  ShieldCheck,
} from "lucide-react";
import { supabaseServer } from "@/lib/supabase/server";
import AdminSocialAdApprovalBox from "@/components/AdminSocialAdApprovalBox";
import AdminSocialAdEditForm from "@/components/AdminSocialAdEditForm";
import AdminSocialAdCreateVersionButton from "@/components/AdminSocialAdCreateVersionButton";

export const dynamic = "force-dynamic";

type CampaignRow = {
  id: string;
  created_at: string;
  updated_at: string;
  status: string;
  platform: string;
  objective: string;
  campaign_name: string;
  parent_campaign_id: string | null;
  version_number: number | null;
  post_id: string | null;
  asset_id: string | null;
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

type CampaignVersionRow = {
  id: string;
  created_at: string;
  status: string;
  campaign_name: string;
  parent_campaign_id: string | null;
  version_number: number | null;
  daily_budget_cents: number | null;
  lifetime_budget_cents: number | null;
  approved_at: string | null;
};

type ApprovalRow = {
  id: string;
  created_at: string;
  approved_by_name: string;
  approved_by_email: string | null;
  approval_text: string;
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
    case "paused":
      return "border-slate-200 bg-slate-50 text-slate-700";
    case "ended":
      return "border-slate-300 bg-slate-100 text-slate-800";
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

function ReadOnlyCampaignDetails({ campaign }: { campaign: CampaignRow }) {
  return (
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
  );
}

function CampaignVersionsSection({
  versions,
  currentCampaignId,
}: {
  versions: CampaignVersionRow[];
  currentCampaignId: string;
}) {
  if (versions.length <= 1) {
    return (
      <section className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm sm:p-7">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#FFFCF7] text-[#B5282D]">
            <History className="h-6 w-6" />
          </div>

          <div>
            <h2 className="text-2xl font-black text-[#102A43]">
              Kampagnenversionen
            </h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-[#52616F]">
              Für diese Kampagne gibt es aktuell nur eine Version. Sobald eine
              freigegebene Kampagne geändert werden soll, wird eine neue Version
              erstellt.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm sm:p-7">
      <div className="mb-5 flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#FFFCF7] text-[#B5282D]">
          <History className="h-6 w-6" />
        </div>

        <div>
          <h2 className="text-2xl font-black text-[#102A43]">
            Kampagnenversionen
          </h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-[#52616F]">
            Hier siehst Du alle Versionen dieser Kampagne. Freigaben bleiben pro
            Version erhalten. Änderungen sollten immer über eine neue Version
            laufen.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {versions.map((version) => {
          const isCurrent = version.id === currentCampaignId;
          const versionNumber = version.version_number || 1;

          return (
            <article
              key={version.id}
              className={`rounded-2xl border p-4 ${
                isCurrent
                  ? "border-blue-200 bg-blue-50"
                  : "border-[#E7D8C3] bg-[#FFFCF7]"
              }`}
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="inline-flex rounded-full border border-blue-200 bg-white px-3 py-1 text-xs font-black text-blue-800">
                      Version {versionNumber}
                    </span>

                    <span
                      className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${getStatusClasses(
                        version.status
                      )}`}
                    >
                      {getStatusLabel(version.status)}
                    </span>

                    {isCurrent ? (
                      <span className="inline-flex rounded-full border border-[#E7D8C3] bg-white px-3 py-1 text-xs font-black text-[#102A43]">
                        Aktuell geöffnet
                      </span>
                    ) : null}

                    {version.approved_at ? (
                      <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-800">
                        Freigegeben: {formatDateTime(version.approved_at)}
                      </span>
                    ) : null}
                  </div>

                  <h3 className="text-lg font-black text-[#102A43]">
                    {version.campaign_name}
                  </h3>

                  <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm font-semibold text-[#52616F]">
                    <span>Erstellt: {formatDateTime(version.created_at)}</span>
                    <span>
                      Tagesbudget: {formatEuro(version.daily_budget_cents)}
                    </span>
                    <span>
                      Gesamtbudget: {formatEuro(version.lifetime_budget_cents)}
                    </span>
                  </div>
                </div>

                {!isCurrent ? (
                  <Link
                    href={`/admin/social/ads/${version.id}`}
                    className="inline-flex items-center justify-center rounded-2xl bg-[#B5282D] px-4 py-2.5 text-sm font-black text-white shadow-sm transition hover:brightness-110"
                  >
                    Version öffnen
                  </Link>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
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
  const rootCampaignId = campaign.parent_campaign_id || campaign.id;

  const { data: versionsData } = await supabaseServer
    .from("social_ad_campaigns")
    .select(
      "id, created_at, status, campaign_name, parent_campaign_id, version_number, daily_budget_cents, lifetime_budget_cents, approved_at"
    )
    .or(`id.eq.${rootCampaignId},parent_campaign_id.eq.${rootCampaignId}`)
    .order("version_number", { ascending: true })
    .order("created_at", { ascending: true });

  const { data: approvalsData } = await supabaseServer
    .from("social_ad_approvals")
    .select("*")
    .eq("campaign_id", id)
    .order("created_at", { ascending: false });

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

  const approvals = (approvalsData || []) as ApprovalRow[];
  const posts = (postsData || []) as SocialPostOption[];
  const assets = (assetsData || []) as SocialAssetOption[];
  const versions = (versionsData || []) as CampaignVersionRow[];

  const isApproved =
    campaign.status === "approved" ||
    campaign.status === "ready_to_launch" ||
    campaign.status === "launched" ||
    campaign.status === "paused" ||
    campaign.status === "ended" ||
    approvals.length > 0;

  const isEditable = !isApproved && ["draft", "review"].includes(campaign.status);
  const versionNumber = campaign.version_number || 1;

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

              <div className="flex flex-wrap gap-2">
                <div className="inline-flex items-center gap-2 rounded-full border border-[#E7D8C3] bg-[#FFFCF7] px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[#8A5A35]">
                  <BadgeEuro className="h-4 w-4" />
                  Ads-Kampagne
                </div>

                <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-blue-800">
                  <CopyPlus className="h-4 w-4" />
                  Version {versionNumber}
                </div>
              </div>

              <h1 className="mt-4 text-3xl font-black tracking-tight text-[#102A43] sm:text-4xl">
                {campaign.campaign_name}
              </h1>

              <p className="mt-3 max-w-3xl text-base leading-7 text-[#486581]">
                Kampagnendaten können vor der Freigabe bearbeitet werden. Nach
                der Budgetfreigabe wird die Kampagne gesperrt. Änderungen laufen
                dann über eine neue Kampagnenversion, die erneut freigegeben
                werden muss.
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
                <p>Version: {versionNumber}</p>
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

        <CampaignVersionsSection
          versions={versions}
          currentCampaignId={campaign.id}
        />

        {isEditable ? (
          <AdminSocialAdEditForm
            campaign={campaign}
            posts={posts}
            assets={assets}
          />
        ) : (
          <>
            <section className="rounded-[2rem] border border-emerald-200 bg-emerald-50 p-5 shadow-sm sm:p-7">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-emerald-700">
                    <ShieldCheck className="h-6 w-6" />
                  </div>

                  <div>
                    <h2 className="text-xl font-black text-emerald-950">
                      Kampagne ist gesperrt
                    </h2>
                    <p className="mt-2 max-w-3xl text-sm font-bold leading-6 text-emerald-900">
                      Diese Kampagne wurde bereits freigegeben oder befindet
                      sich nicht mehr im bearbeitbaren Entwurfsstatus. Änderungen
                      an Budget, Zielgruppe oder Laufzeit sollten ab jetzt nur
                      über eine neue Kampagnenversion erfolgen.
                    </p>
                  </div>
                </div>

                <AdminSocialAdCreateVersionButton campaignId={campaign.id} />
              </div>
            </section>

            <ReadOnlyCampaignDetails campaign={campaign} />
          </>
        )}

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