import Link from "next/link";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Clock,
  ImageIcon,
  Megaphone,
  Share2,
  ShieldCheck,
} from "lucide-react";
import { supabaseServer } from "@/lib/supabase/server";
import AdminSocialSchedulePostForm from "@/components/AdminSocialSchedulePostForm";
import AdminSocialMarkPublishedButton from "@/components/AdminSocialMarkPublishedButton";

export const dynamic = "force-dynamic";

const SOCIAL_TIME_ZONE = "Europe/Berlin";

type SocialPostRow = {
  id: string;
  created_at: string;
  updated_at: string;
  status: string;
  review_status: string | null;
  reviewed_at: string | null;
  reviewed_by_name: string | null;
  topic: string;
  content_angle: string | null;
  hook: string;
  caption: string;
  scheduled_at: string | null;
  published_at: string | null;
};

type SocialAssetRow = {
  post_id: string;
};

type CalendarPostMode =
  | "overdue"
  | "due_today"
  | "this_week"
  | "later"
  | "ready"
  | "blocked"
  | "published";

function formatDateTime(value: string | null) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: SOCIAL_TIME_ZONE,
  }).format(date);
}

function getLocalDateKey(value: Date | string | null | undefined) {
  if (!value) return null;

  const date = typeof value === "string" ? new Date(value) : value;

  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("de-DE", {
    timeZone: SOCIAL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) return null;

  return `${year}-${month}-${day}`;
}

function addDaysToDateKey(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDateKey(value: string | null) {
  if (!value) return "—";

  const date = new Date(`${value}T12:00:00.000Z`);

  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
  }).format(date);
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

function getModeConfig(mode: CalendarPostMode) {
  switch (mode) {
    case "overdue":
      return {
        label: "Überfällig",
        className: "border-red-200 bg-red-50 text-red-800",
        panelClassName: "border-red-200 bg-red-50 text-red-900",
        description:
          "Der geplante Veröffentlichungszeitpunkt ist vorbei. Manuell posten oder neu planen.",
      };
    case "due_today":
      return {
        label: "Heute fällig",
        className: "border-amber-200 bg-amber-50 text-amber-800",
        panelClassName: "border-amber-200 bg-amber-50 text-amber-900",
        description:
          "Dieser Beitrag ist heute zur Veröffentlichung vorgesehen.",
      };
    case "this_week":
      return {
        label: "Diese Woche",
        className: "border-purple-200 bg-purple-50 text-purple-800",
        panelClassName: "border-purple-200 bg-purple-50 text-purple-900",
        description:
          "Dieser Beitrag ist innerhalb der nächsten Tage eingeplant.",
      };
    case "later":
      return {
        label: "Später geplant",
        className: "border-blue-200 bg-blue-50 text-blue-800",
        panelClassName: "border-blue-200 bg-blue-50 text-blue-900",
        description:
          "Dieser Beitrag ist geplant, aber noch nicht in der aktuellen Veröffentlichungswoche.",
      };
    case "ready":
      return {
        label: "Reserve / planbar",
        className: "border-emerald-200 bg-emerald-50 text-emerald-800",
        panelClassName: "border-emerald-200 bg-emerald-50 text-emerald-900",
        description:
          "Freigegeben und ungeplant. Kann als Reserve genutzt oder eingeplant werden.",
      };
    case "blocked":
      return {
        label: "Blockiert",
        className: "border-amber-200 bg-amber-50 text-amber-800",
        panelClassName: "border-amber-200 bg-amber-50 text-amber-900",
        description:
          "Noch nicht freigegeben. Erst Review abschließen.",
      };
    case "published":
      return {
        label: "Veröffentlicht",
        className: "border-emerald-200 bg-emerald-50 text-emerald-800",
        panelClassName: "border-emerald-200 bg-emerald-50 text-emerald-900",
        description:
          "Dieser Beitrag ist bereits als veröffentlicht markiert.",
      };
  }
}

function StatCard({
  title,
  value,
  description,
  tone = "neutral",
  icon,
}: {
  title: string;
  value: number;
  description: string;
  tone?: "neutral" | "warning" | "danger" | "success" | "blue";
  icon: ReactNode;
}) {
  const classes = {
    neutral: "border-[#E7D8C3] bg-white text-[#102A43]",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    danger: "border-red-200 bg-red-50 text-red-900",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
    blue: "border-blue-200 bg-blue-50 text-blue-900",
  };

  return (
    <article className={`rounded-[1.5rem] border p-5 shadow-sm ${classes[tone]}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="rounded-2xl bg-white/70 p-3">{icon}</div>
        <p className="text-3xl font-black">{value}</p>
      </div>
      <p className="mt-4 text-sm font-black uppercase tracking-[0.14em]">
        {title}
      </p>
      <p className="mt-2 text-sm font-semibold leading-6 opacity-80">
        {description}
      </p>
    </article>
  );
}

function SectionHeader({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-2xl font-black text-[#102A43]">{title}</h2>
        </div>
        <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#52616F]">
          {description}
        </p>
      </div>
    </div>
  );
}

function EmptySection({ children }: { children: ReactNode }) {
  return (
    <section className="rounded-[2rem] border border-[#E7D8C3] bg-white p-6 text-sm font-bold leading-6 text-[#52616F] shadow-sm">
      {children}
    </section>
  );
}

function PostCard({
  post,
  hasImage,
  mode,
}: {
  post: SocialPostRow;
  hasImage: boolean;
  mode: CalendarPostMode;
}) {
  const isReviewApproved = post.review_status === "approved";
  const isPublished = post.status === "published";
  const modeConfig = getModeConfig(mode);

  const scheduleDisabledReason = isPublished
    ? "Dieser Beitrag ist bereits veröffentlicht."
    : !isReviewApproved
      ? "Kalenderplanung ist blockiert, bis das Content-Review freigegeben wurde."
      : undefined;

  const publishDisabledReason = isPublished
    ? "Dieser Beitrag ist bereits als veröffentlicht markiert."
    : !isReviewApproved
      ? "Content-Review ist noch nicht freigegeben. Bitte zuerst Review öffnen und den Beitrag freigeben."
      : !hasImage
        ? "Es ist noch kein veröffentlichbares Social-Bild vorhanden. Bitte zuerst ein Bild erzeugen."
        : undefined;

  const showPublishingAction = mode === "due_today" || mode === "overdue";

  return (
    <article className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm sm:p-6">
      <div className="grid gap-5 lg:grid-cols-[1fr_380px] lg:items-start">
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${modeConfig.className}`}
            >
              {modeConfig.label}
            </span>

            <span
              className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${getStatusClasses(
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

            {hasImage ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-800">
                <ImageIcon className="h-3.5 w-3.5" />
                Bild vorhanden
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-black text-amber-800">
                <AlertTriangle className="h-3.5 w-3.5" />
                Bild fehlt
              </span>
            )}

            {post.scheduled_at ? (
              <span className="inline-flex rounded-full border border-purple-200 bg-purple-50 px-3 py-1 text-xs font-black text-purple-800">
                Geplant: {formatDateTime(post.scheduled_at)}
              </span>
            ) : null}

            {post.published_at ? (
              <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-800">
                Veröffentlicht: {formatDateTime(post.published_at)}
              </span>
            ) : null}
          </div>

          <h2 className="text-2xl font-black text-[#102A43]">{post.topic}</h2>

          {post.content_angle ? (
            <p className="mt-2 text-sm font-semibold leading-6 text-[#52616F]">
              {post.content_angle}
            </p>
          ) : null}

          <div className="mt-4 rounded-2xl border border-[#E7D8C3] bg-[#FFFCF7] p-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-[#8A5A35]">
              <Megaphone className="h-4 w-4" />
              Hook
            </div>
            <p className="text-sm font-bold leading-6 text-[#102A43]">
              {post.hook || "—"}
            </p>
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Link
              href={`/admin/social/${post.id}/review`}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-black text-emerald-800 transition hover:bg-emerald-100"
            >
              <ShieldCheck className="h-4 w-4" />
              Review öffnen
            </Link>

            <Link
              href={`/admin/social/${post.id}/posting`}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-black text-blue-800 transition hover:bg-blue-100"
            >
              <Share2 className="h-4 w-4" />
              Posting vorbereiten
            </Link>

            <Link
              href={`/admin/social/${post.id}`}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#B5282D] px-4 py-2.5 text-sm font-black text-white shadow-sm transition hover:brightness-110"
            >
              Beitrag bearbeiten
            </Link>
          </div>
        </div>

        <div className="space-y-4 rounded-[1.5rem] border border-[#E7D8C3] bg-[#FFFCF7] p-4">
          <div
            className={`rounded-2xl border p-4 text-sm font-bold leading-6 ${modeConfig.panelClassName}`}
          >
            <div className="mb-2 flex items-center gap-2">
              {mode === "overdue" ? (
                <AlertTriangle className="h-5 w-5" />
              ) : mode === "due_today" ? (
                <Clock className="h-5 w-5" />
              ) : (
                <CalendarClock className="h-5 w-5" />
              )}
              <span>{modeConfig.label}</span>
            </div>
            {modeConfig.description}
          </div>

          {showPublishingAction ? (
            <div className="rounded-2xl border border-[#E7D8C3] bg-white p-4">
              <h3 className="text-sm font-black text-[#102A43]">
                Veröffentlichung V1
              </h3>
              <p className="mt-2 text-sm font-semibold leading-6 text-[#52616F]">
                Beitrag manuell auf der Plattform veröffentlichen, danach hier
                als veröffentlicht markieren. Die API-Automatik kann später an
                genau diese Stelle angebunden werden.
              </p>

              <div className="mt-4">
                <AdminSocialMarkPublishedButton
                  postId={post.id}
                  disabled={Boolean(publishDisabledReason)}
                  disabledReason={publishDisabledReason}
                />
              </div>
            </div>
          ) : null}

          {mode === "published" ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold leading-6 text-emerald-900">
              Bereits veröffentlicht: {formatDateTime(post.published_at)}
            </div>
          ) : null}

          <AdminSocialSchedulePostForm
            postId={post.id}
            initialScheduledAt={post.scheduled_at}
            disabled={Boolean(scheduleDisabledReason)}
            disabledReason={scheduleDisabledReason}
          />
        </div>
      </div>
    </article>
  );
}

export default async function AdminSocialCalendarPage() {
  const todayKey = getLocalDateKey(new Date()) || "";
  const weekEndKey = todayKey ? addDaysToDateKey(todayKey, 6) : "";

  const { data: postsData, error } = await supabaseServer
    .from("social_posts")
    .select(
      "id, created_at, updated_at, status, review_status, reviewed_at, reviewed_by_name, topic, content_angle, hook, caption, scheduled_at, published_at"
    )
    .neq("status", "archived")
    .order("created_at", { ascending: false })
    .limit(100);

  const { data: assetRows } = await supabaseServer
    .from("social_assets")
    .select("post_id")
    .eq("asset_type", "image")
    .neq("status", "archived")
    .limit(1000);

  const posts = (postsData || []) as SocialPostRow[];
  const assets = (assetRows || []) as SocialAssetRow[];

  const imagePostIds = new Set(assets.map((asset) => asset.post_id));

  const publishedPosts = posts
    .filter((post) => post.status === "published")
    .sort((a, b) => {
      const aTime = a.published_at ? new Date(a.published_at).getTime() : 0;
      const bTime = b.published_at ? new Date(b.published_at).getTime() : 0;
      return bTime - aTime;
    });

  const scheduledPosts = posts
    .filter((post) => post.status !== "published" && Boolean(post.scheduled_at))
    .sort((a, b) => {
      const aTime = a.scheduled_at ? new Date(a.scheduled_at).getTime() : 0;
      const bTime = b.scheduled_at ? new Date(b.scheduled_at).getTime() : 0;
      return aTime - bTime;
    });

  const overduePosts = scheduledPosts.filter((post) => {
    const scheduledDateKey = getLocalDateKey(post.scheduled_at);
    return Boolean(scheduledDateKey && todayKey && scheduledDateKey < todayKey);
  });

  const dueTodayPosts = scheduledPosts.filter((post) => {
    const scheduledDateKey = getLocalDateKey(post.scheduled_at);
    return Boolean(scheduledDateKey && todayKey && scheduledDateKey === todayKey);
  });

  const upcomingScheduledPosts = scheduledPosts.filter((post) => {
    const scheduledDateKey = getLocalDateKey(post.scheduled_at);
    return Boolean(scheduledDateKey && todayKey && scheduledDateKey > todayKey);
  });

  const thisWeekPosts = upcomingScheduledPosts.filter((post) => {
    const scheduledDateKey = getLocalDateKey(post.scheduled_at);
    return Boolean(
      scheduledDateKey &&
        todayKey &&
        weekEndKey &&
        scheduledDateKey > todayKey &&
        scheduledDateKey <= weekEndKey
    );
  });

  const laterPosts = upcomingScheduledPosts.filter((post) => {
    const scheduledDateKey = getLocalDateKey(post.scheduled_at);
    return Boolean(scheduledDateKey && weekEndKey && scheduledDateKey > weekEndKey);
  });

  const readyPosts = posts.filter(
    (post) =>
      post.status !== "published" &&
      !post.scheduled_at &&
      post.review_status === "approved"
  );

  const blockedPosts = posts.filter(
    (post) =>
      post.status !== "published" &&
      !post.scheduled_at &&
      post.review_status !== "approved"
  );

  const dueAndUpcomingThisWeekCount = dueTodayPosts.length + thisWeekPosts.length;

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
              </div>

              <div className="inline-flex items-center gap-2 rounded-full border border-[#E7D8C3] bg-[#FFFCF7] px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[#8A5A35]">
                <CalendarClock className="h-4 w-4" />
                Social-Kalender
              </div>

              <h1 className="mt-4 text-3xl font-black tracking-tight text-[#102A43] sm:text-4xl">
                Veröffentlichungen steuern
              </h1>

              <p className="mt-3 max-w-3xl text-base leading-7 text-[#486581]">
                Dieser Bereich führt die manuelle Veröffentlichung: Heute
                fällige und überfällige Beiträge stehen oben. Nach dem Posten
                auf TikTok, Instagram oder Facebook markierst Du den Beitrag
                hier als veröffentlicht. Die spätere Meta-/API-Automatik kann
                an diesen Ablauf anschließen.
              </p>
            </div>

            <div className="rounded-[1.5rem] border border-amber-200 bg-amber-50 p-4 text-sm font-bold leading-6 text-amber-900">
              <div className="mb-2 flex items-center gap-2">
                <ShieldCheck className="h-5 w-5" />
                Review- und Bild-Gate aktiv
              </div>
              Veröffentlichung ist nur sinnvoll, wenn Review freigegeben und ein
              Social-Bild vorhanden ist. Beides wird zusätzlich in der
              Posting-Seite und API geprüft.
            </div>
          </div>
        </header>

        {error ? (
          <section className="rounded-[1.5rem] border border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-800">
            Fehler beim Laden des Social-Kalenders: {error.message}
          </section>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <StatCard
            title="Überfällig"
            value={overduePosts.length}
            description="Geplant, aber noch nicht veröffentlicht."
            icon={<AlertTriangle className="h-5 w-5" />}
            tone={overduePosts.length > 0 ? "danger" : "success"}
          />

          <StatCard
            title="Heute fällig"
            value={dueTodayPosts.length}
            description={`Heute: ${formatDateKey(todayKey)}.`}
            icon={<Clock className="h-5 w-5" />}
            tone={dueTodayPosts.length > 0 ? "warning" : "neutral"}
          />

          <StatCard
            title="Diese Woche"
            value={dueAndUpcomingThisWeekCount}
            description="Heute plus kommende 6 Tage."
            icon={<CalendarClock className="h-5 w-5" />}
            tone={dueAndUpcomingThisWeekCount > 0 ? "blue" : "neutral"}
          />

          <StatCard
            title="Reserve"
            value={readyPosts.length}
            description="Freigegeben, aber ungeplant."
            icon={<CheckCircle2 className="h-5 w-5" />}
            tone={readyPosts.length > 0 ? "success" : "neutral"}
          />

          <StatCard
            title="Blockiert"
            value={blockedPosts.length}
            description="Review noch nicht freigegeben."
            icon={<ShieldCheck className="h-5 w-5" />}
            tone={blockedPosts.length > 0 ? "warning" : "success"}
          />
        </section>

        {overduePosts.length > 0 ? (
          <section className="space-y-4">
            <SectionHeader
              title="Überfällige Veröffentlichungen"
              description="Diese Beiträge waren bereits eingeplant und sind noch nicht als veröffentlicht markiert. Entweder jetzt posten und markieren oder bewusst neu planen."
              icon={<AlertTriangle className="h-5 w-5 text-red-700" />}
            />

            {overduePosts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                hasImage={imagePostIds.has(post.id)}
                mode="overdue"
              />
            ))}
          </section>
        ) : null}

        <section className="space-y-4">
          <SectionHeader
            title="Heute zu veröffentlichen"
            description="Diese Beiträge sind heute fällig. Öffne die Posting-Vorbereitung, veröffentliche manuell und markiere sie danach als veröffentlicht."
            icon={<Clock className="h-5 w-5 text-amber-700" />}
          />

          {dueTodayPosts.length > 0 ? (
            dueTodayPosts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                hasImage={imagePostIds.has(post.id)}
                mode="due_today"
              />
            ))
          ) : (
            <EmptySection>
              Für heute sind keine Veröffentlichungen fällig.
            </EmptySection>
          )}
        </section>

        {thisWeekPosts.length > 0 ? (
          <section className="space-y-4">
            <SectionHeader
              title="Diese Woche geplant"
              description="Diese Beiträge liegen in den nächsten Tagen. Sie sind noch nicht fällig, können aber vorbereitet oder bei Bedarf umgeplant werden."
              icon={<CalendarClock className="h-5 w-5 text-purple-700" />}
            />

            {thisWeekPosts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                hasImage={imagePostIds.has(post.id)}
                mode="this_week"
              />
            ))}
          </section>
        ) : null}

        {laterPosts.length > 0 ? (
          <section className="space-y-4">
            <SectionHeader
              title="Später geplante Beiträge"
              description="Diese Beiträge liegen außerhalb der aktuellen 7-Tage-Ansicht."
              icon={<CalendarClock className="h-5 w-5 text-blue-700" />}
            />

            {laterPosts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                hasImage={imagePostIds.has(post.id)}
                mode="later"
              />
            ))}
          </section>
        ) : null}

        <section className="space-y-4">
          <SectionHeader
            title="Reserve / planbare Beiträge"
            description="Freigegeben, aber noch nicht eingeplant. Diese Beiträge eignen sich als Reserve oder für den nächsten Wochenplan."
            icon={<CheckCircle2 className="h-5 w-5 text-emerald-700" />}
          />

          {readyPosts.length > 0 ? (
            readyPosts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                hasImage={imagePostIds.has(post.id)}
                mode="ready"
              />
            ))
          ) : (
            <EmptySection>
              Aktuell gibt es keine freigegebenen, ungeplanten Beiträge.
            </EmptySection>
          )}
        </section>

        {blockedPosts.length > 0 ? (
          <section className="space-y-4">
            <SectionHeader
              title="Für Planung blockiert"
              description="Diese Beiträge brauchen zuerst ein freigegebenes Content-Review. Danach werden sie planbar."
              icon={<AlertTriangle className="h-5 w-5 text-amber-700" />}
            />

            {blockedPosts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                hasImage={imagePostIds.has(post.id)}
                mode="blocked"
              />
            ))}
          </section>
        ) : null}

        {publishedPosts.length > 0 ? (
          <section className="space-y-4">
            <SectionHeader
              title="Veröffentlichte Beiträge"
              description="Die letzten veröffentlicht markierten Beiträge. Diese Liste dient als einfache Veröffentlichungshistorie."
              icon={<Share2 className="h-5 w-5 text-emerald-700" />}
            />

            {publishedPosts.slice(0, 10).map((post) => (
              <PostCard
                key={post.id}
                post={post}
                hasImage={imagePostIds.has(post.id)}
                mode="published"
              />
            ))}
          </section>
        ) : null}
      </div>
    </main>
  );
}
