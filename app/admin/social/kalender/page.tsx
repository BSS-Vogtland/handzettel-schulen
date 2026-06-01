import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  ImageIcon,
  Megaphone,
  Share2,
  ShieldCheck,
} from "lucide-react";
import { supabaseServer } from "@/lib/supabase/server";
import AdminSocialSchedulePostForm from "@/components/AdminSocialSchedulePostForm";

export const dynamic = "force-dynamic";

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

function StatCard({
  title,
  value,
  description,
  tone = "neutral",
}: {
  title: string;
  value: number;
  description: string;
  tone?: "neutral" | "warning" | "success" | "blue";
}) {
  const classes = {
    neutral: "border-[#E7D8C3] bg-white text-[#102A43]",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
    blue: "border-blue-200 bg-blue-50 text-blue-900",
  };

  return (
    <article className={`rounded-[1.5rem] border p-5 shadow-sm ${classes[tone]}`}>
      <p className="text-sm font-semibold opacity-80">{title}</p>
      <p className="mt-1 text-3xl font-black">{value}</p>
      <p className="mt-2 text-sm font-semibold leading-6 opacity-80">
        {description}
      </p>
    </article>
  );
}

function PostCard({
  post,
  hasImage,
  mode,
}: {
  post: SocialPostRow;
  hasImage: boolean;
  mode: "ready" | "scheduled" | "blocked" | "published";
}) {
  const isReviewApproved = post.review_status === "approved";
  const isPublished = post.status === "published";

  const scheduleDisabledReason = isPublished
    ? "Dieser Beitrag ist bereits veröffentlicht."
    : !isReviewApproved
      ? "Kalenderplanung ist blockiert, bis das Content-Review freigegeben wurde."
      : undefined;

  return (
    <article className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm sm:p-6">
      <div className="grid gap-5 lg:grid-cols-[1fr_360px] lg:items-start">
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
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

        <div className="rounded-[1.5rem] border border-[#E7D8C3] bg-[#FFFCF7] p-4">
          {mode === "blocked" ? (
            <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold leading-6 text-amber-900">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
                <p>
                  Dieser Beitrag kann noch nicht geplant werden. Erst das
                  Content-Review freigeben.
                </p>
              </div>
            </div>
          ) : null}

          {mode === "published" ? (
            <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold leading-6 text-emerald-900">
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

  const publishedPosts = posts.filter((post) => post.status === "published");

  const scheduledPosts = posts
    .filter((post) => post.status !== "published" && Boolean(post.scheduled_at))
    .sort((a, b) => {
      const aTime = a.scheduled_at ? new Date(a.scheduled_at).getTime() : 0;
      const bTime = b.scheduled_at ? new Date(b.scheduled_at).getTime() : 0;
      return aTime - bTime;
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
                Beiträge planen
              </h1>

              <p className="mt-3 max-w-3xl text-base leading-7 text-[#486581]">
                Plane freigegebene Beiträge für TikTok, Instagram und Facebook.
                Beiträge ohne freigegebenes Content-Review sind für die
                Kalenderplanung technisch blockiert.
              </p>
            </div>

            <div className="rounded-[1.5rem] border border-amber-200 bg-amber-50 p-4 text-sm font-bold leading-6 text-amber-900">
              <div className="mb-2 flex items-center gap-2">
                <ShieldCheck className="h-5 w-5" />
                Review-Gate aktiv
              </div>
              Nur Beiträge mit Review-Status „freigegeben“ können geplant
              werden.
            </div>
          </div>
        </header>

        {error ? (
          <section className="rounded-[1.5rem] border border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-800">
            Fehler beim Laden des Social-Kalenders: {error.message}
          </section>
        ) : null}

        <section className="grid gap-4 md:grid-cols-4">
          <StatCard
            title="Planbar"
            value={readyPosts.length}
            description="Freigegeben, aber noch nicht geplant."
            tone={readyPosts.length > 0 ? "blue" : "neutral"}
          />

          <StatCard
            title="Geplant"
            value={scheduledPosts.length}
            description="Beiträge mit Veröffentlichungszeitpunkt."
            tone="success"
          />

          <StatCard
            title="Blockiert"
            value={blockedPosts.length}
            description="Noch kein freigegebenes Review."
            tone={blockedPosts.length > 0 ? "warning" : "success"}
          />

          <StatCard
            title="Veröffentlicht"
            value={publishedPosts.length}
            description="Bereits als veröffentlicht markiert."
            tone="neutral"
          />
        </section>

        {scheduledPosts.length > 0 ? (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-purple-700" />
              <h2 className="text-2xl font-black text-[#102A43]">
                Bereits geplante Beiträge
              </h2>
            </div>

            {scheduledPosts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                hasImage={imagePostIds.has(post.id)}
                mode="scheduled"
              />
            ))}
          </section>
        ) : null}

        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-700" />
            <h2 className="text-2xl font-black text-[#102A43]">
              Planbare Beiträge
            </h2>
          </div>

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
            <section className="rounded-[2rem] border border-[#E7D8C3] bg-white p-6 text-sm font-bold leading-6 text-[#52616F] shadow-sm">
              Aktuell gibt es keine freigegebenen, ungeplanten Beiträge. Öffne
              ein Review und gib einen Beitrag frei, damit er hier planbar wird.
            </section>
          )}
        </section>

        {blockedPosts.length > 0 ? (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-700" />
              <h2 className="text-2xl font-black text-[#102A43]">
                Für Planung blockiert
              </h2>
            </div>

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
            <div className="flex items-center gap-2">
              <Share2 className="h-5 w-5 text-emerald-700" />
              <h2 className="text-2xl font-black text-[#102A43]">
                Veröffentlichte Beiträge
              </h2>
            </div>

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