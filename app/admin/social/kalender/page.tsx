import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Camera,
  CheckCircle2,
  Clock,
  FileText,
  Megaphone,
  Share2,
  Sparkles,
  Video,
} from "lucide-react";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type SocialPostRow = {
  id: string;
  created_at: string;
  updated_at: string;
  brand_project: string;
  status: string;
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

function formatDate(value: string | null) {
  if (!value) return "Ohne Termin";

  return new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

function formatTime(value: string | null) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
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

function groupPostsByDate(posts: SocialPostRow[]) {
  const grouped = new Map<string, SocialPostRow[]>();

  for (const post of posts) {
    const key = post.scheduled_at
      ? new Date(post.scheduled_at).toISOString().slice(0, 10)
      : "without-date";

    const current = grouped.get(key) || [];
    current.push(post);
    grouped.set(key, current);
  }

  return Array.from(grouped.entries()).map(([key, items]) => ({
    key,
    label: key === "without-date" ? "Ohne Termin" : formatDate(items[0].scheduled_at),
    items: items.sort((a, b) => {
      if (!a.scheduled_at && !b.scheduled_at) {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }

      if (!a.scheduled_at) return 1;
      if (!b.scheduled_at) return -1;

      return new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime();
    }),
  }));
}

function PlatformBadges() {
  return (
    <div className="flex flex-wrap gap-2">
      <span className="inline-flex items-center gap-1 rounded-full border border-[#E7D8C3] bg-white px-3 py-1 text-xs font-bold text-[#27445C]">
        <Video className="h-3.5 w-3.5" />
        TikTok
      </span>
      <span className="inline-flex items-center gap-1 rounded-full border border-[#E7D8C3] bg-white px-3 py-1 text-xs font-bold text-[#27445C]">
        <Camera className="h-3.5 w-3.5" />
        Instagram
      </span>
      <span className="inline-flex items-center gap-1 rounded-full border border-[#E7D8C3] bg-white px-3 py-1 text-xs font-bold text-[#27445C]">
        <Share2 className="h-3.5 w-3.5" />
        Facebook
      </span>
    </div>
  );
}

export default async function AdminSocialCalendarPage() {
  const { data, error } = await supabaseServer
    .from("social_posts")
    .select("*")
    .neq("status", "archived")
    .order("scheduled_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(100);

  const posts = (data || []) as SocialPostRow[];

  const scheduledPosts = posts.filter((post) => post.scheduled_at);
  const unscheduledPosts = posts.filter((post) => !post.scheduled_at);
  const publishedPosts = posts.filter((post) => post.status === "published");

  const groups = groupPostsByDate(posts);

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
                <CalendarClock className="h-4 w-4" />
                Social-Kalender
              </div>

              <h1 className="mt-4 text-3xl font-black tracking-tight text-[#102A43] sm:text-4xl">
                Veröffentlichungen planen
              </h1>

              <p className="mt-3 max-w-3xl text-base leading-7 text-[#486581]">
                Hier siehst Du alle geplanten Social-Beiträge für
                Handzettel-Schulen.de. Die Veröffentlichung passiert noch nicht
                automatisch. Der Kalender dient jetzt als sichere Planung, bevor
                wir später Auto-Posting anbinden.
              </p>
            </div>

            <div className="rounded-[1.5rem] border border-[#E7D8C3] bg-[#FFFCF7] p-4">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[#B5282D]">
                <Clock className="h-5 w-5" />
              </div>

              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8A5A35]">
                Planungslogik
              </p>

              <p className="mt-2 max-w-xs text-sm font-semibold leading-6 text-[#52616F]">
                Termin und Status stellst Du direkt im jeweiligen Beitrag ein.
              </p>
            </div>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-[1.5rem] border border-[#E7D8C3] bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-purple-50 p-3 text-purple-700">
                <CalendarClock className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[#627D98]">
                  Mit Termin
                </p>
                <p className="text-3xl font-black text-[#102A43]">
                  {scheduledPosts.length}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-[#E7D8C3] bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-amber-50 p-3 text-amber-700">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[#627D98]">
                  Ohne Termin
                </p>
                <p className="text-3xl font-black text-[#102A43]">
                  {unscheduledPosts.length}
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
                  {publishedPosts.length}
                </p>
              </div>
            </div>
          </div>
        </section>

        {error ? (
          <section className="rounded-[1.5rem] border border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-800">
            Fehler beim Laden des Social-Kalenders: {error.message}
          </section>
        ) : null}

        {posts.length === 0 && !error ? (
          <section className="rounded-[2rem] border border-dashed border-[#D9C4A8] bg-white p-8 text-center shadow-sm">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FFFCF7] text-[#A23A2E]">
              <Sparkles className="h-7 w-7" />
            </div>

            <h2 className="mt-4 text-xl font-black text-[#102A43]">
              Noch keine Beiträge vorhanden
            </h2>

            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#627D98]">
              Erzeuge zuerst im SocialPilot neue Beiträge. Danach kannst Du sie
              bearbeiten, terminieren und hier im Kalender sehen.
            </p>

            <Link
              href="/admin/social"
              className="mt-5 inline-flex items-center justify-center gap-2 rounded-2xl bg-[#B5282D] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110"
            >
              Zum SocialPilot
              <ArrowRight className="h-4 w-4" />
            </Link>
          </section>
        ) : null}

        <section className="space-y-6">
          {groups.map((group) => (
            <div
              key={group.key}
              className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm sm:p-7"
            >
              <div className="mb-5 flex flex-col gap-3 border-b border-[#E7D8C3] pb-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-[#8A5A35]">
                    Kalendertag
                  </p>

                  <h2 className="mt-1 text-2xl font-black text-[#102A43]">
                    {group.label}
                  </h2>
                </div>

                <span className="inline-flex w-fit rounded-full border border-[#E7D8C3] bg-[#FFFCF7] px-3 py-1 text-xs font-black text-[#486581]">
                  {group.items.length} Beitrag
                  {group.items.length === 1 ? "" : "e"}
                </span>
              </div>

              <div className="space-y-4">
                {group.items.map((post) => (
                  <article
                    key={post.id}
                    className="rounded-[1.5rem] border border-[#E7D8C3] bg-[#FFFCF7] p-4"
                  >
                    <div className="grid gap-4 lg:grid-cols-[140px_1fr_220px] lg:items-start">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8A5A35]">
                          Uhrzeit
                        </p>

                        <p className="mt-1 text-2xl font-black text-[#102A43]">
                          {formatTime(post.scheduled_at)}
                        </p>

                        <p className="mt-2 text-xs font-bold text-[#627D98]">
                          Erstellt: {formatDateTime(post.created_at)}
                        </p>
                      </div>

                      <div>
                        <div className="mb-3 flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${getStatusClasses(
                              post.status
                            )}`}
                          >
                            {getStatusLabel(post.status)}
                          </span>

                          <PlatformBadges />
                        </div>

                        <h3 className="text-xl font-black text-[#102A43]">
                          {post.topic}
                        </h3>

                        <p className="mt-2 text-sm font-bold leading-6 text-[#102A43]">
                          {post.hook}
                        </p>

                        {post.content_angle ? (
                          <p className="mt-2 text-sm font-semibold leading-6 text-[#627D98]">
                            {post.content_angle}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex lg:justify-end">
                        <Link
                          href={`/admin/social/${post.id}`}
                          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#B5282D] px-4 py-2.5 text-sm font-black text-white shadow-sm transition hover:brightness-110"
                        >
                          Bearbeiten
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}