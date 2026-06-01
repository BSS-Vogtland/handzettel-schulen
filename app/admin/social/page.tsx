import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRight,
  BadgeEuro,
  CalendarClock,
  Camera,
  CheckCircle2,
  FileText,
  Hash,
  ImageIcon,
  Megaphone,
  PlugZap,
  Settings,
  Share2,
  Sparkles,
  Video,
} from "lucide-react";
import { supabaseServer } from "@/lib/supabase/server";
import AdminSocialGenerateButton from "@/components/AdminSocialGenerateButton";

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

export default async function AdminSocialPage() {
  const { data, error } = await supabaseServer
    .from("social_posts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  const posts = (data || []) as SocialPostRow[];

  const draftCount = posts.filter((post) => post.status === "draft").length;
  const scheduledCount = posts.filter(
    (post) => post.status === "scheduled"
  ).length;
  const publishedCount = posts.filter(
    (post) => post.status === "published"
  ).length;

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
                ← Zurück zum Adminbereich
              </Link>

              <div className="inline-flex items-center gap-2 rounded-full border border-[#E7D8C3] bg-[#FFFCF7] px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[#8A5A35]">
                <Megaphone className="h-4 w-4" />
                SocialPilot
              </div>

              <h1 className="mt-4 text-3xl font-black tracking-tight text-[#102A43] sm:text-4xl">
                Social-Media-Entwürfe erzeugen
              </h1>

              <p className="mt-3 max-w-2xl text-base leading-7 text-[#486581]">
                Erzeuge automatisch Content-Ideen, Hooks, Captions, Hashtags,
                Keywords sowie Bild- und Video-Prompts. Über die Einstellungen
                kann das Projektprofil gepflegt werden. Im Ads-Modul können
                Kampagnen vorbereitet, Budgets festgelegt und aktiv freigegeben
                werden. Unter Konten verwaltest Du die externen Kundenkonten für
                OpenAI, Meta, Google Ads und TikTok.
              </p>
            </div>

            <div className="flex flex-col items-start gap-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap lg:flex-col">
                <AdminSocialGenerateButton />

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
                Empfehlung: Erst Projektprofil und Konten sauber pflegen, dann
                Beiträge erzeugen, prüfen, terminieren und bei Bedarf
                Ads-Kampagnen vorbereiten. Werbebudget wird erst nach aktiver
                Freigabe berücksichtigt.
              </p>
            </div>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-[1.5rem] border border-[#E7D8C3] bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-amber-50 p-3 text-amber-700">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[#627D98]">
                  Entwürfe
                </p>
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
              Pflege zuerst optional das Projektprofil und die Konten. Danach
              kannst Du neue Social-Beiträge erzeugen, sie im Kalender planen
              und später als Kampagnenentwurf für bezahlte Werbung vorbereiten.
            </p>

            <div className="mt-5 flex flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap">
              <Link
                href="/admin/social/einstellungen"
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#E7D8C3] bg-[#FFFCF7] px-5 py-3 text-sm font-black text-[#A23A2E] shadow-sm transition hover:bg-[#F5E8D8]"
              >
                <Settings className="h-4 w-4" />
                Projektprofil bearbeiten
              </Link>

              <Link
                href="/admin/social/konten"
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-5 py-3 text-sm font-black text-blue-800 shadow-sm transition hover:bg-blue-100"
              >
                <PlugZap className="h-4 w-4" />
                Konten verwalten
              </Link>

              <Link
                href="/admin/social/ads"
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm font-black text-amber-800 shadow-sm transition hover:bg-amber-100"
              >
                <BadgeEuro className="h-4 w-4" />
                Ads-Modul öffnen
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

                      <span className="text-xs font-semibold text-[#627D98]">
                        Erstellt: {formatDateTime(post.created_at)}
                      </span>

                      <span className="rounded-full border border-[#E7D8C3] bg-white px-3 py-1 text-xs font-bold text-[#486581]">
                        {post.brand_project}
                      </span>

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