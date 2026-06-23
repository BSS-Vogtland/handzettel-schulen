import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  ImageIcon,
  Megaphone,
  Share2,
  ShieldCheck,
} from "lucide-react";
import { supabaseServer } from "@/lib/supabase/server";
import AdminSocialPostEditor from "@/components/AdminSocialPostEditor";
import AdminSocialImageGenerateButton from "@/components/AdminSocialImageGenerateButton";
import AdminSocialAssetDeleteButton from "@/components/AdminSocialAssetDeleteButton";

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
  id: string;
  created_at: string;
  post_id: string;
  asset_type: string;
  provider: string;
  model: string;
  prompt: string;
  storage_bucket: string;
  storage_path: string;
  public_url: string | null;
  mime_type: string | null;
  file_size: number | null;
  status: string;
  metadata: Record<string, unknown> | null;
};

function formatDateTime(value: string | null) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatBytes(value: number | null) {
  if (!value || value <= 0) return "—";

  if (value < 1024 * 1024) {
    return `${Math.round(value / 1024)} KB`;
  }

  return `${(value / 1024 / 1024).toFixed(1)} MB`;
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
      return "Noch nicht geprüft";
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

export default async function AdminSocialPostDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data, error } = await supabaseServer
    .from("social_posts")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    notFound();
  }

  const post = data as SocialPostRow;

  const { data: assetsData } = await supabaseServer
    .from("social_assets")
    .select("*")
    .eq("post_id", id)
    .eq("asset_type", "image")
    .neq("status", "archived")
    .order("created_at", { ascending: false });

  const assets = (assetsData || []) as SocialAssetRow[];

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

                <Link
                  href={`/admin/social/${post.id}/review`}
                  className="inline-flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-black text-emerald-800 transition hover:bg-emerald-100"
                >
                  <ShieldCheck className="h-4 w-4" />
                  Review öffnen
                </Link>

                <Link
                  href={`/admin/social/${post.id}/posting`}
                  className="inline-flex items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-black text-blue-800 transition hover:bg-blue-100"
                >
                  <Share2 className="h-4 w-4" />
                  Posting vorbereiten
                </Link>
              </div>

              <div className="inline-flex items-center gap-2 rounded-full border border-[#E7D8C3] bg-[#FFFCF7] px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[#8A5A35]">
                <Megaphone className="h-4 w-4" />
                SocialPilot Beitrag
              </div>

              <h1 className="mt-4 text-3xl font-black tracking-tight text-[#102A43] sm:text-4xl">
                {post.topic}
              </h1>

              <p className="mt-3 max-w-3xl text-base leading-7 text-[#486581]">
                Bearbeite Hook, Caption, Plattform-Versionen, Hashtags,
                Keywords sowie Bild- und Video-Prompts. Über „Review öffnen“
                prüfst Du den Beitrag vor Veröffentlichung oder Ads-Nutzung.
                Über „Posting vorbereiten“ erhältst Du eine Veröffentlichungsmappe
                mit Copy-Buttons für TikTok, Instagram und Facebook.
              </p>
            </div>

            <div className="rounded-[1.5rem] border border-[#E7D8C3] bg-[#FFFCF7] p-4">
              <div className="flex flex-wrap gap-2">
                <span
                  className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${getStatusClasses(
                    post.status
                  )}`}
                >
                  {getStatusLabel(post.status)}
                </span>

                <span
                  className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${getReviewClasses(
                    post.review_status
                  )}`}
                >
                  {getReviewLabel(post.review_status)}
                </span>
              </div>

              <div className="mt-4 space-y-3 text-sm font-semibold text-[#52616F]">
                <div className="flex items-center gap-2">
                  <CalendarClock className="h-4 w-4 text-[#A23A2E]" />
                  Erstellt: {formatDateTime(post.created_at)}
                </div>

                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-[#A23A2E]" />
                  Aktualisiert: {formatDateTime(post.updated_at)}
                </div>

                {post.reviewed_at ? (
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-[#A23A2E]" />
                    Review: {formatDateTime(post.reviewed_at)}
                  </div>
                ) : null}

                {post.reviewed_by_name ? (
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-[#A23A2E]" />
                    Prüfer: {post.reviewed_by_name}
                  </div>
                ) : null}

                {post.scheduled_at ? (
                  <div className="flex items-center gap-2">
                    <CalendarClock className="h-4 w-4 text-[#A23A2E]" />
                    Geplant: {formatDateTime(post.scheduled_at)}
                  </div>
                ) : null}

                {post.published_at ? (
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-[#A23A2E]" />
                    Veröffentlicht: {formatDateTime(post.published_at)}
                  </div>
                ) : null}
              </div>

              <div className="mt-5 flex flex-col gap-3">
                <Link
                  href={`/admin/social/${post.id}/review`}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-4 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110"
                >
                  <ShieldCheck className="h-4 w-4" />
                  Review öffnen
                </Link>

                <Link
                  href={`/admin/social/${post.id}/posting`}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-700 px-4 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110"
                >
                  <Share2 className="h-4 w-4" />
                  Posting vorbereiten
                </Link>
              </div>
            </div>
          </div>
        </header>

        <section className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#E7D8C3] bg-[#FFFCF7] px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[#8A5A35]">
                <ImageIcon className="h-4 w-4" />
                Bildgenerierung
              </div>

              <h2 className="mt-4 text-2xl font-black text-[#102A43]">
                Social-Bilder für diesen Beitrag
              </h2>

              <p className="mt-2 text-sm font-semibold leading-6 text-[#52616F]">
                Erzeuge ein 9:16-Bild aus dem gespeicherten Bild-Prompt. Der
                Prompt wird zusätzlich mit Thema, Hook und Caption verknüpft,
                damit das Bild stärker zur Überschrift passt.
              </p>

              {!post.image_prompt ? (
                <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
                  Für diesen Beitrag fehlt noch ein Bild-Prompt. Bitte unten im
                  Editor ergänzen und speichern.
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-3">
              <AdminSocialImageGenerateButton
                postId={post.id}
                disabled={!post.image_prompt}
              />

              <Link
                href={`/admin/social/${post.id}/review`}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-black text-emerald-800 shadow-sm transition hover:bg-emerald-100"
              >
                <ShieldCheck className="h-4 w-4" />
                Zum Content-Review
              </Link>

              <Link
                href={`/admin/social/${post.id}/posting`}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-5 py-3 text-sm font-black text-blue-800 shadow-sm transition hover:bg-blue-100"
              >
                <Share2 className="h-4 w-4" />
                Zur Posting-Vorbereitung
              </Link>
            </div>
          </div>

          {assets.length === 0 ? (
            <div className="mt-6 rounded-[1.5rem] border border-dashed border-[#D9C4A8] bg-[#FFFCF7] p-6 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-[#B5282D]">
                <ImageIcon className="h-6 w-6" />
              </div>

              <h3 className="mt-3 text-lg font-black text-[#102A43]">
                Noch kein Bild erzeugt
              </h3>

              <p className="mx-auto mt-2 max-w-xl text-sm font-semibold leading-6 text-[#627D98]">
                Sobald Du auf „Bild erzeugen“ klickst, wird das Bild hier
                gespeichert und angezeigt. Danach kannst Du es im Content-Review
                prüfen und in der Posting-Vorbereitung direkt nutzen.
              </p>
            </div>
          ) : (
            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {assets.map((asset) => (
                <article
                  key={asset.id}
                  className="overflow-hidden rounded-[1.5rem] border border-[#E7D8C3] bg-[#FFFCF7] shadow-sm"
                >
                  {asset.public_url ? (
                    <a
                      href={asset.public_url}
                      target="_blank"
                      rel="noreferrer"
                      className="block bg-[#102A43]"
                    >
                      <img
                        src={asset.public_url}
                        alt="Generiertes Social-Media-Bild"
                        className="aspect-[2/3] w-full object-contain"
                      />
                    </a>
                  ) : (
                    <div className="flex aspect-[2/3] items-center justify-center bg-[#FBF7F0] text-sm font-bold text-[#627D98]">
                      Kein Bild-Link vorhanden
                    </div>
                  )}

                  <div className="space-y-3 p-4">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8A5A35]">
                        {asset.model}
                      </p>

                      <p className="mt-1 text-sm font-bold text-[#52616F]">
                        Erstellt: {formatDateTime(asset.created_at)}
                      </p>

                      <p className="mt-1 text-sm font-bold text-[#52616F]">
                        Größe: {formatBytes(asset.file_size)}
                      </p>
                    </div>

                    <div className="flex flex-col gap-2">
                      {asset.public_url ? (
                        <a
                          href={asset.public_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#E7D8C3] bg-white px-4 py-2 text-sm font-black text-[#B5282D] transition hover:bg-[#F5E8D8]"
                        >
                          Bild öffnen
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      ) : null}

                      <AdminSocialAssetDeleteButton assetId={asset.id} />
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <AdminSocialPostEditor post={post} />
      </div>
    </main>
  );
}
