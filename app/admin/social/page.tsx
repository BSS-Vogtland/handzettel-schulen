import Link from "next/link";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BadgeEuro,
  BellRing,
  CalendarClock,
  Camera,
  CheckCircle2,
  Clock,
  FileText,
  Hash,
  ImageIcon,
  ListChecks,
  Mail,
  Megaphone,
  PlugZap,
  Settings,
  Share2,
  ShieldCheck,
  Sparkles,
  Video,
  XCircle,
} from "lucide-react";
import { supabaseServer } from "@/lib/supabase/server";
import AdminSocialGenerateButton from "@/components/AdminSocialGenerateButton";
import AdminSocialCreateWeekPlanButton from "@/components/AdminSocialCreateWeekPlanButton";
import AdminSocialMusicLibraryShortcut from "@/components/AdminSocialMusicLibraryShortcut";
import AdminSocialMetaConnectionStatus from "@/components/AdminSocialMetaConnectionStatus";
import AdminSocialTikTokConnectionStatus from "@/components/AdminSocialTikTokConnectionStatus";
import AdminSocialTikTokReviewPrep from "@/components/AdminSocialTikTokReviewPrep";
import AdminSocialPublishingDashboard from "@/components/AdminSocialPublishingDashboard";
import AdminSocialPilotControlCenter from "@/components/AdminSocialPilotControlCenter";
export const dynamic = "force-dynamic";

type SocialPostRow = {
  id: string;
  created_at: string;
  updated_at: string;
  brand_project: string;
  status: string;
  review_status: string | null;
  reviewed_at: string | null;
  reviewed_by_name: string | null;
  topic: string;
  content_angle: string | null;
  hook: string;
  caption: string;
  cta: string | null;
  hashtags: string[] | null;
  keywords: string[] | null;
  tiktok_hook: string | null;
  tiktok_caption: string | null;
  instagram_hook: string | null;
  instagram_caption: string | null;
  facebook_hook: string | null;
  facebook_caption: string | null;
  image_prompt: string | null;
  video_prompt: string | null;
  scheduled_at: string | null;
  published_at: string | null;
  platform_targets: string[] | null;
};

type SocialAssetRow = {
  post_id: string;
};

type SocialAdCampaignRow = {
  id: string;
  status: string;
  campaign_name: string;
};

type SocialIntegrationRow = {
  id: string;
  status: string;
  provider_label: string;
  is_required: boolean;
};

type SocialReminderEventRow = {
  id: string;
  status: string;
  reminder_type: string;
  reminder_date_local: string;
  reminder_time_local: string;
  recipient_email: string | null;
  open_review_count: number | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

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
    case "approved":
      return "Freigegeben";
    case "scheduled":
      return "Geplant";
    case "published":
      return "Veröffentlicht";
    case "failed":
      return "Fehler";
    case "archived":
      return "Archiviert";
    default:
      return status;
  }
}

function getStatusClasses(status: string) {
  switch (status) {
    case "draft":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "approved":
      return "border-blue-200 bg-blue-50 text-blue-800";
    case "scheduled":
      return "border-purple-200 bg-purple-50 text-purple-800";
    case "published":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "failed":
      return "border-red-200 bg-red-50 text-red-800";
    case "archived":
      return "border-slate-200 bg-slate-50 text-slate-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function getReviewLabel(status: string | null) {
  switch (status) {
    case "approved":
      return "Review freigegeben";
    case "needs_changes":
      return "Überarbeitung nötig";
    case "rejected":
      return "Review abgelehnt";
    case "not_reviewed":
    case null:
    default:
      return "Review offen";
  }
}

function getReviewClasses(status: string | null) {
  switch (status) {
    case "approved":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "needs_changes":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "rejected":
      return "border-red-200 bg-red-50 text-red-800";
    case "not_reviewed":
    case null:
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function PlatformBadge({
  label,
  icon,
}: {
  label: string;
  icon: ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[#E7D8C3] bg-white px-3 py-1 text-xs font-semibold text-[#27445C]">
      {icon}
      {label}
    </span>
  );
}

function TextBlock({
  title,
  children,
  icon,
}: {
  title: string;
  children: ReactNode;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[#E7D8C3] bg-[#FFFCF7] p-4">
      <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[#8A5A35]">
        {icon}
        {title}
      </div>
      <div className="text-sm leading-6 text-[#183247]">{children}</div>
    </div>
  );
}

function DashboardCard({
  title,
  value,
  description,
  icon,
  href,
  linkLabel,
  tone = "neutral",
}: {
  title: string;
  value: number | string;
  description: string;
  icon: ReactNode;
  href: string;
  linkLabel: string;
  tone?: "neutral" | "warning" | "success" | "blue" | "ads";
}) {
  const toneClasses = {
    neutral: "border-[#E7D8C3] bg-white text-[#102A43]",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
    blue: "border-blue-200 bg-blue-50 text-blue-900",
    ads: "border-amber-200 bg-white text-[#102A43]",
  };

  const iconClasses = {
    neutral: "bg-[#FFFCF7] text-[#B5282D]",
    warning: "bg-white text-amber-700",
    success: "bg-white text-emerald-700",
    blue: "bg-white text-blue-700",
    ads: "bg-amber-50 text-amber-700",
  };

  return (
    <article
      className={`rounded-[1.5rem] border p-5 shadow-sm ${toneClasses[tone]}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className={`rounded-2xl p-3 ${iconClasses[tone]}`}>{icon}</div>
        <p className="text-3xl font-black">{value}</p>
      </div>

      <h3 className="mt-4 text-lg font-black">{title}</h3>

      <p className="mt-2 text-sm font-semibold leading-6 opacity-80">
        {description}
      </p>

      <Link
        href={href}
        className="mt-4 inline-flex items-center gap-2 text-sm font-black text-[#B5282D] hover:underline"
      >
        {linkLabel}
        <ArrowRight className="h-4 w-4" />
      </Link>
    </article>
  );
}

function TaskNotice({
  title,
  description,
  href,
  linkLabel,
  icon,
  tone = "warning",
}: {
  title: string;
  description: string;
  href: string;
  linkLabel: string;
  icon: ReactNode;
  tone?: "warning" | "blue" | "success";
}) {
  const classes = {
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    blue: "border-blue-200 bg-blue-50 text-blue-900",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  };

  return (
    <article className={`rounded-2xl border p-4 ${classes[tone]}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5">{icon}</div>

          <div>
            <h3 className="text-sm font-black">{title}</h3>
            <p className="mt-1 text-sm font-semibold leading-6 opacity-90">
              {description}
            </p>
          </div>
        </div>

        <Link
          href={href}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-white px-4 py-2 text-sm font-black text-[#102A43] shadow-sm transition hover:bg-[#FFFCF7]"
        >
          {linkLabel}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </article>
  );
}

export default async function AdminSocialPage() {
  const { data, error } = await supabaseServer
    .from("social_posts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  const { data: assetRows } = await supabaseServer
    .from("social_assets")
    .select("post_id")
    .eq("asset_type", "image")
    .neq("status", "archived")
    .limit(1000);

  const { data: adRows } = await supabaseServer
    .from("social_ad_campaigns")
    .select("id, status, campaign_name")
    .order("created_at", { ascending: false })
    .limit(100);

  const { data: integrationRows } = await supabaseServer
    .from("social_integrations")
    .select("id, status, provider_label, is_required")
    .limit(50);

  const { data: reminderRows } = await supabaseServer
    .from("social_reminder_events")
    .select(
      "id, status, reminder_type, reminder_date_local, reminder_time_local, recipient_email, open_review_count, error_message, created_at, updated_at"
    )
    .order("created_at", { ascending: false })
    .limit(25);

  const posts = (data || []) as SocialPostRow[];
  const assets = (assetRows || []) as SocialAssetRow[];
  const ads = (adRows || []) as SocialAdCampaignRow[];
  const integrations = (integrationRows || []) as SocialIntegrationRow[];
  const reminders = (reminderRows || []) as SocialReminderEventRow[];

  const imagePostIds = new Set(assets.map((asset) => asset.post_id));

  const draftCount = posts.filter((post) => post.status === "draft").length;
  const scheduledCount = posts.filter(
    (post) => post.status === "scheduled"
  ).length;
  const approvedUnscheduledCount = posts.filter(
    (post) =>
      post.status === "approved" &&
      post.review_status === "approved" &&
      !post.scheduled_at
  ).length;
  const publishedCount = posts.filter(
    (post) => post.status === "published"
  ).length;

  const postsWithoutImage = posts.filter(
    (post) =>
      post.status !== "archived" &&
      post.status !== "published" &&
      !imagePostIds.has(post.id)
  );

  const postsWithoutReview = posts.filter(
    (post) =>
      post.status !== "archived" &&
      post.status !== "published" &&
      (!post.review_status || post.review_status === "not_reviewed")
  );

  const postsNeedsChanges = posts.filter(
    (post) =>
      post.status !== "archived" &&
      post.status !== "published" &&
      post.review_status === "needs_changes"
  );

  const postsReviewApproved = posts.filter(
    (post) => post.status !== "archived" && post.review_status === "approved"
  );

  const adsWaitingForApproval = ads.filter(
    (campaign) => campaign.status === "draft" || campaign.status === "review"
  );

  const requiredIntegrations = integrations.filter(
    (integration) => integration.is_required
  );

  const missingRequiredIntegrations = requiredIntegrations.filter(
    (integration) => integration.status !== "connected"
  );

  const pendingReminderCount = reminders.filter(
    (reminder) => reminder.status === "pending"
  ).length;

  const failedReminderCount = reminders.filter(
    (reminder) => reminder.status === "failed"
  ).length;

  const sentReminderCount = reminders.filter(
    (reminder) => reminder.status === "sent"
  ).length;

  const latestReminder = reminders[0] || null;

  const readyForPostingCount = posts.filter(
    (post) =>
      post.status !== "archived" &&
      post.status !== "published" &&
      post.review_status === "approved" &&
      imagePostIds.has(post.id)
  ).length;

  const contentOpenTaskCount =
    postsWithoutImage.length +
    postsWithoutReview.length +
    postsNeedsChanges.length +
    adsWaitingForApproval.length;

  const setupOpenTaskCount = missingRequiredIntegrations.length;
  const automationAttentionCount = pendingReminderCount + failedReminderCount;

  return (
    <main className="min-h-screen bg-[#FBF7F0] px-4 py-8 text-[#102A43] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="rounded-[2rem] border border-[#E7D8C3] bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <Link
                href="/admin"
                className="mb-4 inline-flex text-sm font-semibold text-[#A23A2E] hover:underline"
              >
                â† Zurück zum Adminbereich
              </Link>

              <div className="inline-flex items-center gap-2 rounded-full border border-[#E7D8C3] bg-[#FFFCF7] px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[#8A5A35]">
                <Megaphone className="h-4 w-4" />
                SocialPilot
              </div>

              <h1 className="mt-4 text-3xl font-black tracking-tight text-[#102A43] sm:text-4xl">
                Social-Media-Entwürfe erzeugen
              </h1>

              <p className="mt-3 max-w-2xl text-base leading-7 text-[#486581]">
                Erzeuge Content-Ideen, Hooks, Captions, Hashtags, Bild- und
                Video-Prompts. Das Dashboard zeigt Dir, welche Beiträge,
                Reviews, Kampagnen und Konten als Nächstes geprüft werden
                sollten.
              </p>
            </div>

            <div className="flex flex-col items-start gap-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap lg:flex-col">
                <AdminSocialGenerateButton />
                <Link
                  href="/admin/social/workflow"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#A23A2E] bg-[#FFF7F2] px-5 py-3 text-sm font-black text-[#A23A2E] shadow-sm transition hover:bg-[#F5E8D8]"
                >
                  <ListChecks className="h-4 w-4" />
                  Workflow starten
                </Link>
                <Link
                  href="/admin/social/buffer"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-sky-200 bg-sky-50 px-5 py-3 text-sm font-black text-sky-800 shadow-sm transition hover:bg-sky-100"
                >
                  <PlugZap className="h-4 w-4" />
                  Buffer prüfen
                </Link>
                <AdminSocialCreateWeekPlanButton
                  eligibleCount={approvedUnscheduledCount}
                  scheduledCount={scheduledCount}
                />
                <Link
                  href="/admin/social/automation"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-purple-200 bg-purple-50 px-5 py-3 text-sm font-black text-purple-800 shadow-sm transition hover:bg-purple-100"
                >
                  <BellRing className="h-4 w-4" />
                  Automation öffnen
                </Link>

                <Link
                  href="/admin/social/kalender"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#E7D8C3] bg-[#FFFCF7] px-5 py-3 text-sm font-black text-[#A23A2E] shadow-sm transition hover:bg-[#F5E8D8]"
                >
                  <CalendarClock className="h-4 w-4" />
                  Social-Kalender öffnen
                </Link>

                <Link
                  href="/admin/social/ads"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm font-black text-amber-800 shadow-sm transition hover:bg-amber-100"
                >
                  <BadgeEuro className="h-4 w-4" />
                  Ads-Kampagnen planen
                </Link>


                <Link
                  href="/admin/social/automation/events"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-black text-emerald-800 shadow-sm transition hover:bg-emerald-100"
                >
                  <BellRing className="h-4 w-4" />
                  Publishing-Protokoll
                </Link>
                <Link
                  href="/admin/social/konten"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-5 py-3 text-sm font-black text-blue-800 shadow-sm transition hover:bg-blue-100"
                >
                  <PlugZap className="h-4 w-4" />
                  Konten verwalten
                </Link>

                <Link
                  href="/admin/social/einstellungen"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#E7D8C3] bg-white px-5 py-3 text-sm font-black text-[#102A43] shadow-sm transition hover:bg-[#FFFCF7]"
                >
                  <Settings className="h-4 w-4" />
                  Einstellungen öffnen
                </Link>
              </div>

              <p className="max-w-xs text-xs leading-5 text-[#627D98]">
                Empfehlung: Automation einstellen, Beitrag erzeugen, Bild
                erstellen, Review freigeben, Posting vorbereiten und erst danach
                optional als Ads-Kampagne nutzen.
              </p>
            </div>
          </div>
        </header>

        <section className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm sm:p-7">
        <AdminSocialMusicLibraryShortcut />
        <AdminSocialPilotControlCenter />

        <section id="meta-status" className="scroll-mt-6">
          <AdminSocialMetaConnectionStatus />
        </section>
        <section id="publishing-dashboard" className="scroll-mt-6">
          <AdminSocialPublishingDashboard />
        </section>
        <section id="tiktok-status" className="scroll-mt-6">
          <AdminSocialTikTokConnectionStatus />
        </section>
        <section id="tiktok-review" className="scroll-mt-6">
          <AdminSocialTikTokReviewPrep />
        </section>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[#E7D8C3] bg-[#FFFCF7] px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[#8A5A35]">
                <Sparkles className="h-4 w-4" />
                Kunden-Dashboard
              </div>

              <h2 className="mt-4 text-2xl font-black text-[#102A43]">
                Nächste Aufgaben
              </h2>

              <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#52616F]">
                Dieser Bereich trennt operative Content-Aufgaben sauber von
                Setup-Hinweisen. Dadurch zählen fehlende Pflicht-Konten nicht
                mehr als normale Content-Aufgabe.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div
                className={`rounded-2xl border px-5 py-4 ${
                  contentOpenTaskCount + automationAttentionCount > 0
                    ? "border-amber-200 bg-amber-50 text-amber-900"
                    : "border-emerald-200 bg-emerald-50 text-emerald-900"
                }`}
              >
                <p className="text-xs font-black uppercase tracking-[0.16em]">
                  Content-Aufgaben
                </p>
                <p className="mt-1 text-3xl font-black">
                  {contentOpenTaskCount + automationAttentionCount}
                </p>
              </div>

              <div
                className={`rounded-2xl border px-5 py-4 ${
                  setupOpenTaskCount > 0
                    ? "border-blue-200 bg-blue-50 text-blue-900"
                    : "border-emerald-200 bg-emerald-50 text-emerald-900"
                }`}
              >
                <p className="text-xs font-black uppercase tracking-[0.16em]">
                  Setup-Hinweise
                </p>
                <p className="mt-1 text-3xl font-black">{setupOpenTaskCount}</p>
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <DashboardCard
              title="Beiträge ohne Bild"
              value={postsWithoutImage.length}
              description="Diese Beiträge brauchen noch ein passendes Social-Bild."
              icon={<ImageIcon className="h-5 w-5" />}
              href={
                postsWithoutImage[0]
                  ? `/admin/social/${postsWithoutImage[0].id}`
                  : "/admin/social"
              }
              linkLabel={
                postsWithoutImage[0] ? "Ersten Beitrag öffnen" : "Beiträge ansehen"
              }
              tone={postsWithoutImage.length > 0 ? "warning" : "success"}
            />

            <DashboardCard
              title="Review offen"
              value={postsWithoutReview.length}
              description="Diese Beiträge wurden noch nicht inhaltlich geprüft."
              icon={<ShieldCheck className="h-5 w-5" />}
              href={
                postsWithoutReview[0]
                  ? `/admin/social/${postsWithoutReview[0].id}/review`
                  : "/admin/social"
              }
              linkLabel={
                postsWithoutReview[0] ? "Erstes Review öffnen" : "Beiträge ansehen"
              }
              tone={postsWithoutReview.length > 0 ? "warning" : "success"}
            />

            <DashboardCard
              title="Überarbeitung nötig"
              value={postsNeedsChanges.length}
              description="Diese Beiträge wurden geprüft, brauchen aber noch Änderungen."
              icon={<AlertTriangle className="h-5 w-5" />}
              href={
                postsNeedsChanges[0]
                  ? `/admin/social/${postsNeedsChanges[0].id}/review`
                  : "/admin/social"
              }
              linkLabel={
                postsNeedsChanges[0]
                  ? "Überarbeitung öffnen"
                  : "Beiträge ansehen"
              }
              tone={postsNeedsChanges.length > 0 ? "warning" : "success"}
            />

            <DashboardCard
              title="Review freigegeben"
              value={postsReviewApproved.length}
              description="Diese Beiträge sind inhaltlich geprüft und freigegeben."
              icon={<CheckCircle2 className="h-5 w-5" />}
              href="/admin/social"
              linkLabel="Beiträge ansehen"
              tone="success"
            />
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <DashboardCard
              title="Ads ohne Freigabe"
              value={adsWaitingForApproval.length}
              description="Diese Kampagnen sind Entwurf oder Prüfung und brauchen vor Ausgabe eine Budgetfreigabe."
              icon={<BadgeEuro className="h-5 w-5" />}
              href="/admin/social/ads"
              linkLabel="Ads prüfen"
              tone={adsWaitingForApproval.length > 0 ? "warning" : "success"}
            />

            <DashboardCard
              title="Pflicht-Konten bereit"
              value={`${
                requiredIntegrations.length - missingRequiredIntegrations.length
              }/${requiredIntegrations.length}`}
              description="Zeigt, wie viele erforderliche externe Konten als verbunden markiert sind."
              icon={<PlugZap className="h-5 w-5" />}
              href="/admin/social/konten"
              linkLabel="Konten verwalten"
              tone={missingRequiredIntegrations.length > 0 ? "blue" : "success"}
            />

            <DashboardCard
              title="Geplante Beiträge"
              value={scheduledCount}
              description="Beiträge, die bereits im Kalender eingeplant wurden."
              icon={<CalendarClock className="h-5 w-5" />}
              href="/admin/social/kalender"
              linkLabel="Kalender öffnen"
              tone="neutral"
            />

            <DashboardCard
              title="Automation"
              value="V1"
              description="Erinnerungszeiten, Arbeitstage-Logik und Vorab-Generierung verwalten."
              icon={<BellRing className="h-5 w-5" />}
              href="/admin/social/automation"
              linkLabel="Automation öffnen"
              tone="blue"
            />
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <DashboardCard
              title="Bereit zum Posting"
              value={readyForPostingCount}
              description="Freigegebene Beiträge mit Bild, die veröffentlicht oder vorbereitet werden können."
              icon={<Share2 className="h-5 w-5" />}
              href="/admin/social/kalender"
              linkLabel="Posting prüfen"
              tone={readyForPostingCount > 0 ? "success" : "neutral"}
            />

            <DashboardCard
              title="Freigegebene Reserve"
              value={approvedUnscheduledCount}
              description="Freigegebene, ungeplante Beiträge als Reserve für spätere Wochenpläne."
              icon={<FileText className="h-5 w-5" />}
              href="/admin/social"
              linkLabel="Reserve ansehen"
              tone={approvedUnscheduledCount > 0 ? "blue" : "neutral"}
            />

            <DashboardCard
              title="Reminder-Protokoll"
              value={`${pendingReminderCount}/${failedReminderCount}`}
              description={`Pending/Fehler. Gesendet: ${sentReminderCount}. Letztes Event: ${
                latestReminder ? formatDateTime(latestReminder.created_at) : "—"
              }.`}
              icon={<Mail className="h-5 w-5" />}
              href="/admin/social/automation/events"
              linkLabel="Events prüfen"
              tone={automationAttentionCount > 0 ? "warning" : "success"}
            />

            <DashboardCard
              title="Veröffentlicht"
              value={publishedCount}
              description="Beiträge, die bereits als veröffentlicht markiert wurden."
              icon={<CheckCircle2 className="h-5 w-5" />}
              href="/admin/social"
              linkLabel="Beiträge ansehen"
              tone="success"
            />
          </div>

          {contentOpenTaskCount + automationAttentionCount > 0 ? (
            <div className="mt-6 space-y-3">
              {postsWithoutImage.length > 0 ? (
                <TaskNotice
                  title={`${postsWithoutImage.length} Beitrag/Beiträge ohne Bild`}
                  description="Erzeuge zuerst ein Bild, bevor der Beitrag veröffentlicht oder als Anzeige vorbereitet wird."
                  href={`/admin/social/${postsWithoutImage[0].id}`}
                  linkLabel="Beitrag öffnen"
                  icon={<ImageIcon className="h-5 w-5" />}
                  tone="warning"
                />
              ) : null}

              {postsWithoutReview.length > 0 ? (
                <TaskNotice
                  title={`${postsWithoutReview.length} Beitrag/Beiträge ohne Review`}
                  description="Prüfe Hook, Caption, Bildbezug, CTA und Claims, bevor der Beitrag veröffentlicht oder als Anzeige genutzt wird."
                  href={`/admin/social/${postsWithoutReview[0].id}/review`}
                  linkLabel="Review öffnen"
                  icon={<ShieldCheck className="h-5 w-5" />}
                  tone="warning"
                />
              ) : null}

              {postsNeedsChanges.length > 0 ? (
                <TaskNotice
                  title={`${postsNeedsChanges.length} Beitrag/Beiträge mit Änderungsbedarf`}
                  description="Diese Beiträge wurden geprüft, aber noch nicht freigegeben. Öffne das Review und arbeite die Hinweise ab."
                  href={`/admin/social/${postsNeedsChanges[0].id}/review`}
                  linkLabel="Überarbeitung öffnen"
                  icon={<AlertTriangle className="h-5 w-5" />}
                  tone="warning"
                />
              ) : null}

              {adsWaitingForApproval.length > 0 ? (
                <TaskNotice
                  title={`${adsWaitingForApproval.length} Ads-Kampagne(n) ohne Budgetfreigabe`}
                  description="Prüfe Budget, Zielgruppe, Laufzeit und Landingpage. Erst danach sollte die Kampagne freigegeben werden."
                  href="/admin/social/ads"
                  linkLabel="Ads öffnen"
                  icon={<BadgeEuro className="h-5 w-5" />}
                  tone="warning"
                />
              ) : null}

              {failedReminderCount > 0 ? (
                <TaskNotice
                  title={`${failedReminderCount} Reminder-Event(s) mit Fehler`}
                  description="Prüfe das Reminder-Protokoll. Fehlerhafte Events deuten meistens auf Mailversand, SMTP oder Cron-Verarbeitung hin."
                  href="/admin/social/automation/events"
                  linkLabel="Events prüfen"
                  icon={<XCircle className="h-5 w-5" />}
                  tone="warning"
                />
              ) : null}

              {pendingReminderCount > 0 ? (
                <TaskNotice
                  title={`${pendingReminderCount} Reminder-Event(s) pending`}
                  description="Pending ist kurzfristig normal. Wenn Events dauerhaft pending bleiben, muss der Versand-Cron geprüft werden."
                  href="/admin/social/automation/events"
                  linkLabel="Events prüfen"
                  icon={<Clock className="h-5 w-5" />}
                  tone="blue"
                />
              ) : null}
            </div>
          ) : (
            <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold leading-6 text-emerald-900">
              Aktuell sind keine dringenden Content-Aufgaben offen. Du kannst neue
              Beiträge erzeugen, bestehende Beiträge planen, die Automation
              prüfen oder Ads vorbereiten.
            </div>
          )}

          <div className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm font-bold leading-6 text-blue-900">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h3 className="text-base font-black">Setup-Hinweise</h3>
                <p className="mt-1 max-w-3xl">
                  Diese Hinweise betreffen die technische Einrichtung. Sie sind
                  bewusst getrennt von den Content-Aufgaben, damit Kunden den
                  operativen Veröffentlichungsstand klarer erkennen.
                </p>
              </div>

              <Link
                href="/admin/social/konten"
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-white px-4 py-2 text-sm font-black text-[#102A43] shadow-sm transition hover:bg-[#FFFCF7]"
              >
                Konten prüfen
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="mt-4">
              {missingRequiredIntegrations.length > 0 ? (
                <TaskNotice
                  title={`${missingRequiredIntegrations.length} Pflicht-Konto/Konten nicht verbunden`}
                  description="OpenAI, Meta oder andere Pflicht-Konten sollten sauber vorbereitet sein. Für V1 ist das ein Setup-Hinweis, keine offene Content-Aufgabe."
                  href="/admin/social/konten"
                  linkLabel="Konten prüfen"
                  icon={<PlugZap className="h-5 w-5" />}
                  tone="blue"
                />
              ) : (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
                  Pflicht-Konten sind vollständig vorbereitet.
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-[1.5rem] border border-[#E7D8C3] bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-amber-50 p-3 text-amber-700">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[#627D98]">Entwürfe</p>
                <p className="text-3xl font-black text-[#102A43]">
                  {draftCount}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-[#E7D8C3] bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-purple-50 p-3 text-purple-700">
                <CalendarClock className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[#627D98]">Geplant</p>
                <p className="text-3xl font-black text-[#102A43]">
                  {scheduledCount}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-[#E7D8C3] bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[#627D98]">
                  Veröffentlicht
                </p>
                <p className="text-3xl font-black text-[#102A43]">
                  {publishedCount}
                </p>
              </div>
            </div>
          </div>
        </section>

        {error ? (
          <section className="rounded-[1.5rem] border border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-800">
            Fehler beim Laden der Social-Beiträge: {error.message}
          </section>
        ) : null}

        {posts.length === 0 && !error ? (
          <section className="rounded-[2rem] border border-dashed border-[#D9C4A8] bg-white p-8 text-center shadow-sm">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FFFCF7] text-[#A23A2E]">
              <Sparkles className="h-7 w-7" />
            </div>
            <h2 className="mt-4 text-xl font-black text-[#102A43]">
              Noch keine Social-Beiträge vorhanden
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#627D98]">
              Pflege zuerst das Projektprofil, die Konten und die Automation.
              Danach kannst Du neue Social-Beiträge erzeugen, prüfen, planen und
              später als Kampagnenentwurf für bezahlte Werbung vorbereiten.
            </p>

            <div className="mt-5 flex flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap">
              <Link
                href="/admin/social/automation"
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-purple-200 bg-purple-50 px-5 py-3 text-sm font-black text-purple-800 shadow-sm transition hover:bg-purple-100"
              >
                <BellRing className="h-4 w-4" />
                Automation öffnen
              </Link>

              <Link
                href="/admin/social/einstellungen"
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#E7D8C3] bg-[#FFFCF7] px-5 py-3 text-sm font-black text-[#A23A2E] shadow-sm transition hover:bg-[#F5E8D8]"
              >
                <Settings className="h-4 w-4" />
                Projektprofil bearbeiten
              </Link>
            </div>
          </section>
        ) : null}

        <section className="space-y-5">
          {posts.map((post) => (
            <article
              key={post.id}
              className="overflow-hidden rounded-[2rem] border border-[#E7D8C3] bg-white shadow-sm"
            >
              <div className="border-b border-[#E7D8C3] bg-[#FFFCF7] p-5 sm:p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${getStatusClasses(
                          post.status
                        )}`}
                      >
                        {getStatusLabel(post.status)}
                      </span>

                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-black ${getReviewClasses(
                          post.review_status
                        )}`}
                      >
                        <ShieldCheck className="h-3.5 w-3.5" />
                        {getReviewLabel(post.review_status)}
                      </span>

                      <span className="text-xs font-semibold text-[#627D98]">
                        Erstellt: {formatDateTime(post.created_at)}
                      </span>

                      <span className="rounded-full border border-[#E7D8C3] bg-white px-3 py-1 text-xs font-bold text-[#486581]">
                        {post.brand_project}
                      </span>

                      {!imagePostIds.has(post.id) ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-black text-amber-800">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Bild fehlt
                        </span>
                      ) : null}

                      {post.reviewed_at ? (
                        <span className="rounded-full border border-[#E7D8C3] bg-white px-3 py-1 text-xs font-bold text-[#52616F]">
                          Review: {formatDateTime(post.reviewed_at)}
                        </span>
                      ) : null}

                      {post.scheduled_at ? (
                        <span className="rounded-full border border-purple-200 bg-purple-50 px-3 py-1 text-xs font-bold text-purple-800">
                          Geplant: {formatDateTime(post.scheduled_at)}
                        </span>
                      ) : null}

                      {post.published_at ? (
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">
                          Veröffentlicht: {formatDateTime(post.published_at)}
                        </span>
                      ) : null}
                    </div>

                    <h2 className="text-2xl font-black text-[#102A43]">
                      {post.topic}
                    </h2>

                    {post.content_angle ? (
                      <p className="mt-2 max-w-3xl text-sm leading-6 text-[#627D98]">
                        {post.content_angle}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-col gap-3 sm:items-end">
                    <div className="flex flex-wrap gap-2">
                      <PlatformBadge
                        label="TikTok"
                        icon={<Video className="h-3.5 w-3.5" />}
                      />
                      <PlatformBadge
                        label="Instagram"
                        icon={<Camera className="h-3.5 w-3.5" />}
                      />
                      <PlatformBadge
                        label="Facebook"
                        icon={<Share2 className="h-3.5 w-3.5" />}
                      />
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                      <Link
                        href={`/admin/social/${post.id}/review`}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-4 py-2.5 text-sm font-black text-white shadow-sm transition hover:brightness-110"
                      >
                        <ShieldCheck className="h-4 w-4" />
                        Review öffnen
                      </Link>

                      <Link
                        href={`/admin/social/${post.id}/posting`}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-700 px-4 py-2.5 text-sm font-black text-white shadow-sm transition hover:brightness-110"
                      >
                        <Share2 className="h-4 w-4" />
                        Posting vorbereiten
                      </Link>

                      <Link
                        href={`/admin/social/${post.id}`}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#B5282D] px-4 py-2.5 text-sm font-black text-white shadow-sm transition hover:brightness-110"
                      >
                        Beitrag bearbeiten
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 p-5 sm:p-6 lg:grid-cols-2">
                <TextBlock
                  title="Haupt-Hook"
                  icon={<Megaphone className="h-4 w-4" />}
                >
                  <p className="font-bold text-[#102A43]">{post.hook}</p>
                </TextBlock>

                <TextBlock
                  title="Call-to-Action"
                  icon={<CheckCircle2 className="h-4 w-4" />}
                >
                  <p>{post.cta || "—"}</p>
                </TextBlock>

                <TextBlock
                  title="Caption"
                  icon={<FileText className="h-4 w-4" />}
                >
                  <p className="whitespace-pre-line">{post.caption}</p>
                </TextBlock>

                <TextBlock
                  title="Hashtags & Keywords"
                  icon={<Hash className="h-4 w-4" />}
                >
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {(post.hashtags || []).map((hashtag) => (
                        <span
                          key={hashtag}
                          className="rounded-full bg-[#F5E8D8] px-3 py-1 text-xs font-bold text-[#8A5A35]"
                        >
                          {hashtag.startsWith("#") ? hashtag : `#${hashtag}`}
                        </span>
                      ))}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {(post.keywords || []).map((keyword) => (
                        <span
                          key={keyword}
                          className="rounded-full border border-[#E7D8C3] bg-white px-3 py-1 text-xs font-semibold text-[#486581]"
                        >
                          {keyword}
                        </span>
                      ))}
                    </div>
                  </div>
                </TextBlock>

                <TextBlock
                  title="Bild-Prompt"
                  icon={<ImageIcon className="h-4 w-4" />}
                >
                  <p className="whitespace-pre-line">
                    {post.image_prompt || "—"}
                  </p>
                </TextBlock>

                <TextBlock
                  title="Video-Prompt"
                  icon={<Video className="h-4 w-4" />}
                >
                  <p className="whitespace-pre-line">
                    {post.video_prompt || "—"}
                  </p>
                </TextBlock>

                <TextBlock
                  title="TikTok-Version"
                  icon={<Video className="h-4 w-4" />}
                >
                  <p className="font-bold">{post.tiktok_hook || post.hook}</p>
                  <p className="mt-2 whitespace-pre-line">
                    {post.tiktok_caption || post.caption}
                  </p>
                </TextBlock>

                <TextBlock
                  title="Instagram-Version"
                  icon={<Camera className="h-4 w-4" />}
                >
                  <p className="font-bold">
                    {post.instagram_hook || post.hook}
                  </p>
                  <p className="mt-2 whitespace-pre-line">
                    {post.instagram_caption || post.caption}
                  </p>
                </TextBlock>

                <div className="lg:col-span-2">
                  <TextBlock
                    title="Facebook-Version"
                    icon={<Share2 className="h-4 w-4" />}
                  >
                    <p className="font-bold">
                      {post.facebook_hook || post.hook}
                    </p>
                    <p className="mt-2 whitespace-pre-line">
                      {post.facebook_caption || post.caption}
                    </p>
                  </TextBlock>
                </div>
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}



