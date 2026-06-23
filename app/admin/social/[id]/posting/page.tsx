import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  CalendarClock,
  Camera,
  CheckCircle2,
  ExternalLink,
  FileText,
  Hash,
  ImageIcon,
  Megaphone,
  Share2,
  ShieldCheck,
  Video,
} from "lucide-react";
import { supabaseServer } from "@/lib/supabase/server";
import AdminSocialCopyButton from "@/components/AdminSocialCopyButton";
import AdminSocialMarkPublishedButton from "@/components/AdminSocialMarkPublishedButton";
import AdminSocialCreateAdCampaignButton from "@/components/AdminSocialCreateAdCampaignButton";
import AdminSocialMetaPublishButton from "@/components/AdminSocialMetaPublishButton";

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
  public_url: string | null;
  storage_path: string | null;
  file_size: number | null;
  status: string;
};

type SocialPublishEventRow = {
  id: string;
  created_at: string;
  platform: string;
  event_type: string;
  status: string;
  meta_id: string | null;
  meta_post_id: string | null;
  meta_creation_id: string | null;
  error_message: string | null;
  published_at: string | null;
};

function formatDateTime(value: string | null) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function normalizeHashtags(hashtags: string[] | null) {
  return (hashtags || [])
    .map((hashtag) => hashtag.trim())
    .filter(Boolean)
    .map((hashtag) => (hashtag.startsWith("#") ? hashtag : `#${hashtag}`));
}

function buildPostingText({
  hook,
  caption,
  cta,
  hashtags,
}: {
  hook: string;
  caption: string;
  cta: string | null;
  hashtags: string[] | null;
}) {
  const parts = [
    hook.trim(),
    caption.trim(),
    cta?.trim() || "",
    normalizeHashtags(hashtags).join(" "),
  ].filter(Boolean);

  return parts.join("\n\n");
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

function getPublishEventPlatformLabel(platform: string) {
  switch (platform) {
    case "facebook":
      return "Facebook";
    case "instagram":
      return "Instagram";
    default:
      return platform || "Meta";
  }
}

function getPublishEventStatusLabel(status: string) {
  switch (status) {
    case "success":
      return "Erfolgreich";
    case "failed":
      return "Fehlgeschlagen";
    default:
      return status || "Unbekannt";
  }
}

function getPublishEventStatusClasses(status: string) {
  switch (status) {
    case "success":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "failed":
      return "border-red-200 bg-red-50 text-red-800";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function getMetaReference(event: SocialPublishEventRow) {
  return event.meta_post_id || event.meta_id || event.meta_creation_id || "-";
}

function PostingBlock({
  title,
  icon,
  hook,
  caption,
  cta,
  hashtags,
  platformNote,
}: {
  title: string;
  icon: ReactNode;
  hook: string;
  caption: string;
  cta: string | null;
  hashtags: string[] | null;
  platformNote: string;
}) {
  const hashtagsText = normalizeHashtags(hashtags).join(" ");
  const fullText = buildPostingText({
    hook,
    caption,
    cta,
    hashtags,
  });

  return (
    <article className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#E7D8C3] bg-[#FFFCF7] px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-[#8A5A35]">
            {icon}
            {title}
          </div>

          <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-[#52616F]">
            {platformNote}
          </p>
        </div>

        <AdminSocialCopyButton value={fullText} label="Alles kopieren" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-[#E7D8C3] bg-[#FFFCF7] p-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-[#8A5A35]">
            <Megaphone className="h-4 w-4" />
            Hook
          </div>

          <p className="whitespace-pre-line text-sm font-bold leading-6 text-[#102A43]">
            {hook || "—"}
          </p>

          <div className="mt-3">
            <AdminSocialCopyButton value={hook || ""} label="Hook kopieren" />
          </div>
        </div>

        <div className="rounded-2xl border border-[#E7D8C3] bg-[#FFFCF7] p-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-[#8A5A35]">
            <Hash className="h-4 w-4" />
            Hashtags
          </div>

          <p className="whitespace-pre-line text-sm font-bold leading-6 text-[#102A43]">
            {hashtagsText || "—"}
          </p>

          <div className="mt-3">
            <AdminSocialCopyButton
              value={hashtagsText}
              label="Hashtags kopieren"
            />
          </div>
        </div>

        <div className="rounded-2xl border border-[#E7D8C3] bg-[#FFFCF7] p-4 lg:col-span-2">
          <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-[#8A5A35]">
            <FileText className="h-4 w-4" />
            Caption
          </div>

          <p className="whitespace-pre-line text-sm font-semibold leading-6 text-[#102A43]">
            {caption || "—"}
          </p>

          <div className="mt-3">
            <AdminSocialCopyButton
              value={caption || ""}
              label="Caption kopieren"
            />
          </div>
        </div>

        {cta ? (
          <div className="rounded-2xl border border-[#E7D8C3] bg-white p-4 lg:col-span-2">
            <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-[#8A5A35]">
              <CheckCircle2 className="h-4 w-4" />
              CTA
            </div>

            <p className="text-sm font-bold leading-6 text-[#102A43]">{cta}</p>

            <div className="mt-3">
              <AdminSocialCopyButton value={cta} label="CTA kopieren" />
            </div>
          </div>
        ) : null}
      </div>
    </article>
  );
}

export default async function AdminSocialPostingPage({
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
    .select("id, created_at, public_url, storage_path, file_size, status")
    .eq("post_id", id)
    .eq("asset_type", "image")
    .neq("status", "archived")
    .order("created_at", { ascending: false })
    .limit(6);

  const assets = (assetsData || []) as SocialAssetRow[];
  const latestAsset = assets[0] || null;
  const hasReadyImage = Boolean(latestAsset?.public_url?.trim());

  const { data: publishEventsData } = await supabaseServer
    .from("social_publish_events")
    .select(
      "id, created_at, platform, event_type, status, meta_id, meta_post_id, meta_creation_id, error_message, published_at"
    )
    .eq("post_id", id)
    .order("created_at", { ascending: false })
    .limit(12);

  const publishEvents = (publishEventsData || []) as SocialPublishEventRow[];

  const tiktokHook = post.tiktok_hook || post.hook;
  const tiktokCaption = post.tiktok_caption || post.caption;

  const instagramHook = post.instagram_hook || post.hook;
  const instagramCaption = post.instagram_caption || post.caption;

  const facebookHook = post.facebook_hook || post.hook;
  const facebookCaption = post.facebook_caption || post.caption;

  const isPublished = post.status === "published";
  const isReviewApproved = post.review_status === "approved";

  const reviewGateReason = isReviewApproved
    ? undefined
    : "Content-Review ist noch nicht freigegeben. Bitte zuerst Review öffnen und den Beitrag freigeben.";

  const imageGateReason = hasReadyImage
    ? undefined
    : "Es ist noch kein veröffentlichbares Social-Bild vorhanden. Bitte zuerst ein Bild erzeugen.";

  const publishDisabledReason = isPublished
    ? "Dieser Beitrag ist bereits als veröffentlicht markiert."
    : !isReviewApproved
      ? reviewGateReason
      : !hasReadyImage
        ? imageGateReason
        : undefined;

  const adDisabledReason = !isReviewApproved
    ? reviewGateReason
    : !hasReadyImage
      ? "Für eine Ads-Kampagne sollte zuerst ein veröffentlichbares Social-Bild erzeugt werden."
      : undefined;

  return (
    <main className="min-h-screen bg-[#FBF7F0] px-4 py-8 text-[#102A43] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="rounded-[2rem] border border-[#E7D8C3] bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-4xl">
              <div className="mb-4 flex flex-wrap gap-3">
                <Link
                  href={`/admin/social/${post.id}`}
                  className="inline-flex items-center gap-2 rounded-2xl border border-[#E7D8C3] bg-[#FFFCF7] px-4 py-2 text-sm font-black text-[#A23A2E] transition hover:bg-[#F5E8D8]"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Zurück zum Beitrag
                </Link>

                <Link
                  href={`/admin/social/${post.id}/review`}
                  className="inline-flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-black text-emerald-800 transition hover:bg-emerald-100"
                >
                  <ShieldCheck className="h-4 w-4" />
                  Review öffnen
                </Link>

                <Link
                  href="/admin/social"
                  className="inline-flex items-center gap-2 rounded-2xl border border-[#E7D8C3] bg-white px-4 py-2 text-sm font-black text-[#486581] transition hover:bg-[#FFFCF7]"
                >
                  Zum SocialPilot
                </Link>
              </div>

              <div className="inline-flex items-center gap-2 rounded-full border border-[#E7D8C3] bg-[#FFFCF7] px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[#8A5A35]">
                <Share2 className="h-4 w-4" />
                Posting-Vorbereitung
              </div>

              <h1 className="mt-4 text-3xl font-black tracking-tight text-[#102A43] sm:text-4xl">
                {post.topic}
              </h1>

              <p className="mt-3 max-w-3xl text-base leading-7 text-[#486581]">
                Hier findest Du alle Texte, Hashtags, Bild- und Promptdaten für
                die manuelle Veröffentlichung. Veröffentlichung und
                Ads-Vorbereitung sind erst nach freigegebenem Content-Review und
                vorhandenem Social-Bild möglich.
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

                <span
                  className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${
                    hasReadyImage
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-amber-200 bg-amber-50 text-amber-800"
                  }`}
                >
                  {hasReadyImage ? "Bild vorhanden" : "Bild fehlt"}
                </span>
              </div>

              <div className="mt-4 space-y-3 text-sm font-semibold text-[#52616F]">
                <div className="flex items-center gap-2">
                  <CalendarClock className="h-4 w-4 text-[#A23A2E]" />
                  Geplant: {formatDateTime(post.scheduled_at)}
                </div>

                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-[#A23A2E]" />
                  Veröffentlicht: {formatDateTime(post.published_at)}
                </div>

                {post.reviewed_at ? (
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-[#A23A2E]" />
                    Review: {formatDateTime(post.reviewed_at)}
                  </div>
                ) : null}
              </div>

              <div className="mt-5 flex flex-col gap-3">
                <AdminSocialMarkPublishedButton
                  postId={post.id}
                  disabled={Boolean(publishDisabledReason)}
                  disabledReason={publishDisabledReason}
                />

                <AdminSocialMetaPublishButton
                  postId={post.id}
                  disabled={Boolean(publishDisabledReason)}
                  disabledReason={publishDisabledReason}
                />

                <AdminSocialCreateAdCampaignButton
                  postId={post.id}
                  disabled={Boolean(adDisabledReason)}
                  disabledReason={adDisabledReason}
                />
              </div>
            </div>
          </div>
        </header>

        {!isReviewApproved ? (
          <section className="rounded-[2rem] border border-amber-200 bg-amber-50 p-5 shadow-sm sm:p-7">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-amber-700">
                  <ShieldCheck className="h-6 w-6" />
                </div>

                <div>
                  <h2 className="text-xl font-black text-amber-950">
                    Review-Gate aktiv
                  </h2>
                  <p className="mt-2 max-w-3xl text-sm font-bold leading-6 text-amber-900">
                    Dieser Beitrag ist noch nicht freigegeben. Du kannst die
                    Texte hier prüfen und kopieren, aber Veröffentlichung und
                    Ads-Kampagnen-Erstellung sind blockiert, bis das
                    Content-Review freigegeben wurde.
                  </p>
                </div>
              </div>

              <Link
                href={`/admin/social/${post.id}/review`}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-amber-700 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110"
              >
                <ShieldCheck className="h-4 w-4" />
                Review öffnen
              </Link>
            </div>
          </section>
        ) : !hasReadyImage ? (
          <section className="rounded-[2rem] border border-amber-200 bg-amber-50 p-5 shadow-sm sm:p-7">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-amber-700">
                  <ImageIcon className="h-6 w-6" />
                </div>

                <div>
                  <h2 className="text-xl font-black text-amber-950">
                    Bild-Gate aktiv
                  </h2>
                  <p className="mt-2 max-w-3xl text-sm font-bold leading-6 text-amber-900">
                    Das Review ist freigegeben, aber es ist noch kein
                    veröffentlichbares Social-Bild vorhanden. Der Beitrag kann
                    erst als veröffentlicht markiert oder für Ads vorbereitet
                    werden, wenn ein Bild erzeugt wurde.
                  </p>
                </div>
              </div>

              <Link
                href={`/admin/social/${post.id}`}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-amber-700 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110"
              >
                <ImageIcon className="h-4 w-4" />
                Beitrag öffnen
              </Link>
            </div>
          </section>
        ) : (
          <section className="rounded-[2rem] border border-emerald-200 bg-emerald-50 p-5 shadow-sm sm:p-7">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-emerald-700">
                <ShieldCheck className="h-6 w-6" />
              </div>

              <div>
                <h2 className="text-xl font-black text-emerald-950">
                  Content-Review und Bild freigegeben
                </h2>
                <p className="mt-2 text-sm font-bold leading-6 text-emerald-900">
                  Dieser Beitrag darf veröffentlicht oder als Grundlage für eine
                  Ads-Kampagne vorbereitet werden. Werbebudget wird trotzdem
                  separat im Ads-Modul freigegeben.
                </p>
              </div>
            </div>
          </section>
        )}

        <section className="grid gap-5 lg:grid-cols-[1fr_360px]">
          <section className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm sm:p-7">
            <div className="mb-5 flex items-center gap-2">
              <ImageIcon className="h-5 w-5 text-[#B5282D]" />
              <h2 className="text-2xl font-black text-[#102A43]">
                Bild / Motiv
              </h2>
            </div>

            {latestAsset?.public_url ? (
              <div className="grid gap-5 md:grid-cols-[280px_1fr]">
                <a
                  href={latestAsset.public_url}
                  target="_blank"
                  rel="noreferrer"
                  className="block overflow-hidden rounded-[1.5rem] bg-[#102A43]"
                >
                  <img
                    src={latestAsset.public_url}
                    alt="Social-Media-Bild"
                    className="aspect-[2/3] w-full object-contain"
                  />
                </a>

                <div className="space-y-4">
                  <p className="text-sm font-semibold leading-6 text-[#52616F]">
                    Nutze dieses Bild für TikTok, Instagram oder Facebook. Für
                    Reels/TikTok kannst Du es als Standbild, Thumbnail oder
                    Story-Motiv verwenden.
                  </p>

                  <a
                    href={latestAsset.public_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-2xl bg-[#B5282D] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110"
                  >
                    Bild öffnen
                    <ExternalLink className="h-4 w-4" />
                  </a>

                  <div className="rounded-2xl border border-[#E7D8C3] bg-[#FFFCF7] p-4">
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8A5A35]">
                      Bild-Prompt
                    </p>
                    <p className="mt-2 whitespace-pre-line text-sm font-semibold leading-6 text-[#102A43]">
                      {post.image_prompt || "—"}
                    </p>

                    <div className="mt-3">
                      <AdminSocialCopyButton
                        value={post.image_prompt || ""}
                        label="Bild-Prompt kopieren"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-[1.5rem] border border-dashed border-[#D9C4A8] bg-[#FFFCF7] p-6 text-center">
                <ImageIcon className="mx-auto h-10 w-10 text-[#B5282D]" />
                <h3 className="mt-3 text-lg font-black text-[#102A43]">
                  Noch kein Bild vorhanden
                </h3>
                <p className="mx-auto mt-2 max-w-xl text-sm font-semibold leading-6 text-[#627D98]">
                  Öffne den Beitrag und erzeuge zuerst ein Social-Bild. Danach
                  erscheint es hier in der Posting-Vorbereitung.
                </p>

                <Link
                  href={`/admin/social/${post.id}`}
                  className="mt-5 inline-flex items-center justify-center gap-2 rounded-2xl bg-[#B5282D] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110"
                >
                  Beitrag öffnen
                </Link>
              </div>
            )}
          </section>

          <aside className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm sm:p-7">
            <h2 className="text-2xl font-black text-[#102A43]">
              Veröffentlichungs-Checkliste
            </h2>

            <div className="mt-5 space-y-3 text-sm font-bold leading-6 text-[#52616F]">
              <p>{isReviewApproved ? "âœ…" : "â–¡"} Content-Review freigegeben</p>
              <p>{hasReadyImage ? "âœ…" : "â–¡"} Social-Bild vorhanden</p>
              <p>â–¡ Hook geprüft</p>
              <p>â–¡ Caption geprüft</p>
              <p>â–¡ Hashtags geprüft</p>
              <p>â–¡ Bild passt zur Botschaft</p>
              <p>â–¡ Landingpage / Link geprüft</p>
              <p>â–¡ Plattform ausgewählt</p>
              <p>â–¡ Veröffentlichungszeit geprüft</p>
              <p>â–¡ Beitrag nach Veröffentlichung markieren</p>
              <p>â–¡ Optional: Ads-Kampagne vorbereiten</p>
            </div>

            <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold leading-6 text-amber-900">
              Diese Seite postet noch nicht automatisch. Sie ist die saubere
              Zwischenstufe für manuelle Veröffentlichung, spätere
              API-Anbindung und Ads-Vorbereitung.
            </div>
          </aside>
        </section>

        <section className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[#E7D8C3] bg-[#FFFCF7] px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-[#8A5A35]">
                Meta-Protokoll
              </div>

              <h2 className="mt-3 text-2xl font-black text-[#102A43]">
                Meta-Veröffentlichungsprotokoll
              </h2>

              <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#52616F]">
                Hier siehst Du die letzten Veröffentlichungsversuche für diesen Beitrag.
                Gespeichert werden Plattform, Status, Meta-Referenz, Zeitpunkt und mögliche Fehler.
              </p>
            </div>

            <Link
              href="/admin/social/automation/events"
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#E7D8C3] bg-[#FFFCF7] px-4 py-2 text-sm font-black text-[#A23A2E] transition hover:bg-[#F5E8D8]"
            >
              Ereignisse öffnen
            </Link>
          </div>

          {publishEvents.length > 0 ? (
            <div className="overflow-hidden rounded-[1.5rem] border border-[#E7D8C3]">
              <div className="grid gap-3 border-b border-[#E7D8C3] bg-[#FFFCF7] px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-[#8A5A35] md:grid-cols-[1fr_1fr_1.2fr_1fr]">
                <span>Plattform</span>
                <span>Status</span>
                <span>Meta-Referenz</span>
                <span>Zeitpunkt</span>
              </div>

              <div className="divide-y divide-[#E7D8C3] bg-white">
                {publishEvents.map((event) => (
                  <article key={event.id} className="px-4 py-4">
                    <div className="grid gap-3 md:grid-cols-[1fr_1fr_1.2fr_1fr] md:items-center">
                      <div className="text-sm font-black text-[#102A43]">
                        {getPublishEventPlatformLabel(event.platform)}
                      </div>

                      <div>
                        <span
                          className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${getPublishEventStatusClasses(
                            event.status
                          )}`}
                        >
                          {getPublishEventStatusLabel(event.status)}
                        </span>
                      </div>

                      <div className="break-all rounded-xl border border-[#E7D8C3] bg-[#FFFCF7] px-3 py-2 text-xs font-bold leading-5 text-[#486581]">
                        {getMetaReference(event)}
                      </div>

                      <div className="text-xs font-bold leading-5 text-[#627D98]">
                        {formatDateTime(event.published_at || event.created_at)}
                      </div>
                    </div>

                    {event.error_message ? (
                      <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold leading-5 text-red-800">
                        {event.error_message}
                      </div>
                    ) : null}

                    {event.meta_creation_id && event.meta_creation_id !== getMetaReference(event) ? (
                      <div className="mt-2 text-xs font-semibold leading-5 text-[#627D98]">
                        Creation-ID: <span className="font-bold">{event.meta_creation_id}</span>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-[1.5rem] border border-dashed border-[#D9C4A8] bg-[#FFFCF7] p-6 text-center">
              <h3 className="text-lg font-black text-[#102A43]">
                Noch keine Meta-Veröffentlichung protokolliert
              </h3>
              <p className="mx-auto mt-2 max-w-2xl text-sm font-semibold leading-6 text-[#627D98]">
                Sobald Du diesen Beitrag über Facebook oder Instagram veröffentlichst, erscheint hier ein Protokolleintrag.
              </p>
            </div>
          )}
        </section>

        <PostingBlock
          title="TikTok"
          icon={<Video className="h-4 w-4" />}
          hook={tiktokHook}
          caption={tiktokCaption}
          cta={post.cta}
          hashtags={post.hashtags}
          platformNote="Für TikTok kurz, klar und hooklastig halten. Der erste Satz muss sofort funktionieren."
        />

        <PostingBlock
          title="Instagram"
          icon={<Camera className="h-4 w-4" />}
          hook={instagramHook}
          caption={instagramCaption}
          cta={post.cta}
          hashtags={post.hashtags}
          platformNote="Für Instagram eignen sich klare Reels-/Carousel-Texte mit emotionalem Einstieg und sauberem CTA."
        />

        <PostingBlock
          title="Facebook"
          icon={<Share2 className="h-4 w-4" />}
          hook={facebookHook}
          caption={facebookCaption}
          cta={post.cta}
          hashtags={post.hashtags}
          platformNote="Für Facebook darf die Erklärung etwas ausführlicher und vertrauensbildender sein."
        />

        <section className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-4 flex items-center gap-2">
            <Video className="h-5 w-5 text-[#B5282D]" />
            <h2 className="text-2xl font-black text-[#102A43]">
              Video-Prompt
            </h2>
          </div>

          <p className="whitespace-pre-line text-sm font-semibold leading-6 text-[#102A43]">
            {post.video_prompt || "—"}
          </p>

          <div className="mt-4">
            <AdminSocialCopyButton
              value={post.video_prompt || ""}
              label="Video-Prompt kopieren"
            />
          </div>
        </section>
      </div>
    </main>
  );
}


