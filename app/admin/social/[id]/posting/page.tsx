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
import AdminSocialMetaPublishMediaButtons from "@/components/AdminSocialMetaPublishMediaButtons";
import AdminSocialGenerateVideoButton from "@/components/AdminSocialGenerateVideoButton";
import AdminSocialMusicStatusControl from "@/components/AdminSocialMusicStatusControl";
import AdminSocialVideoMusicComposer from "@/components/AdminSocialVideoMusicComposer";
import AdminSocialPublishingOverview from "@/components/AdminSocialPublishingOverview";

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
  asset_type: string | null;
  mime_type: string | null;
  metadata: Record<string, unknown> | null;
};


type SocialMusicTrackRow = {
  id: string;
  title: string;
  public_url: string | null;
  duration_seconds: number | null;
  mood_tags: string[] | null;
  template_keys: string[] | null;
  license_type: string | null;
  license_note: string | null;
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
  message: string | null;
  image_url: string | null;
  payload: Record<string, unknown> | null;
  published_at: string | null;
};

function formatDateTime(value: string | null) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  }).format(new Date(value));
}


type MusicStatus = "none" | "manual_added" | "planned";

function getAssetMusicStatus(metadata: Record<string, unknown> | null | undefined): MusicStatus {
  if (!metadata || typeof metadata !== "object") return "none";

  const flatStatus = metadata.music_status;

  if (flatStatus === "manual_added") return "manual_added";
  if (flatStatus === "planned") return "planned";

  const audio = metadata.audio;

  if (audio && typeof audio === "object") {
    const audioStatus = (audio as Record<string, unknown>).status;

    if (audioStatus === "manual_added") return "manual_added";
    if (audioStatus === "planned") return "planned";
  }

  return "none";
}

function getAssetMusicNote(metadata: Record<string, unknown> | null | undefined) {
  if (!metadata || typeof metadata !== "object") return "";

  const flatNote = metadata.music_note;

  if (typeof flatNote === "string" && flatNote.trim()) {
    return flatNote.trim();
  }

  const audio = metadata.audio;

  if (audio && typeof audio === "object") {
    const audioNote = (audio as Record<string, unknown>).note;

    if (typeof audioNote === "string" && audioNote.trim()) {
      return audioNote.trim();
    }
  }

  return "";
}

function getMusicStatusLabel(status: MusicStatus) {
  if (status === "manual_added") return "Musik manuell ergänzt";
  if (status === "planned") return "Musik später geplant";

  return "Keine Musik";
}

function formatFileSize(value: number | null) {
  if (!value || value <= 0) return "—";

  if (value < 1024 * 1024) {
    return `${Math.round(value / 1024)} KB`;
  }

  return `${(value / 1024 / 1024).toFixed(1)} MB`;
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

function getPublishEventPayload(event: SocialPublishEventRow) {
  return event.payload && typeof event.payload === "object" ? event.payload : {};
}

function getPublishEventPayloadString(event: SocialPublishEventRow, key: string) {
  const payload = getPublishEventPayload(event);
  const value = payload[key];

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getPublishEventMediaType(event: SocialPublishEventRow) {
  return getPublishEventPayloadString(event, "media_type") || "image";
}

function getPublishEventMediaLabel(event: SocialPublishEventRow) {
  const mediaType = getPublishEventMediaType(event);

  if (mediaType === "video") return "Video/Reel";
  if (mediaType === "image") return "Bildpost";

  return mediaType;
}

function getPublishEventAssetId(event: SocialPublishEventRow) {
  return getPublishEventPayloadString(event, "asset_id");
}

function getPublishEventMediaUrl(event: SocialPublishEventRow) {
  return getPublishEventPayloadString(event, "media_url") || event.image_url;
}

function getPublishEventFinalText(event: SocialPublishEventRow) {
  return getPublishEventPayloadString(event, "final_text");
}

const PUBLISH_COMBINATION_DEFINITIONS = [
  {
    key: "facebook-image",
    platform: "facebook",
    mediaType: "image",
    platformLabel: "Facebook",
    mediaLabel: "Bild",
  },
  {
    key: "facebook-video",
    platform: "facebook",
    mediaType: "video",
    platformLabel: "Facebook",
    mediaLabel: "Video",
  },
  {
    key: "instagram-image",
    platform: "instagram",
    mediaType: "image",
    platformLabel: "Instagram",
    mediaLabel: "Bild",
  },
  {
    key: "instagram-video",
    platform: "instagram",
    mediaType: "video",
    platformLabel: "Instagram",
    mediaLabel: "Reel",
  },
  {
    key: "tiktok-video",
    platform: "tiktok",
    mediaType: "video",
    platformLabel: "TikTok",
    mediaLabel: "Video",
  },
] as const;

function getPublishCombinationStatusItems(events: SocialPublishEventRow[]) {
  return PUBLISH_COMBINATION_DEFINITIONS.map((definition) => {
    const event =
      events.find((item) => {
        if (item.event_type !== "publish") return false;
        if (item.status !== "success") return false;
        if (item.platform !== definition.platform) return false;

        return getPublishEventMediaType(item) === definition.mediaType;
      }) || null;

    return {
      ...definition,
      isPublished: Boolean(event),
      event,
    };
  });
}

function formatPublishStatusDate(value: string | null) {
  if (!value) return "Noch nicht veröffentlicht";

  try {
    return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  }).format(new Date(value));
  } catch {
    return value;
  }
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

  const { data: imageAssetsData } = await supabaseServer
    .from("social_assets")
    .select("id, created_at, public_url, storage_path, file_size, status, asset_type, mime_type, metadata")
    .eq("post_id", id)
    .eq("asset_type", "image")
    .neq("status", "archived")
    .order("created_at", { ascending: false })
    .limit(6);

  const imageAssets = (imageAssetsData || []) as SocialAssetRow[];
  const latestAsset = imageAssets[0] || null;
  const hasReadyImage = Boolean(latestAsset?.public_url?.trim());

  const { data: videoAssetsData } = await supabaseServer
    .from("social_assets")
    .select("id, created_at, public_url, storage_path, file_size, status, asset_type, mime_type, metadata")
    .eq("post_id", id)
    .eq("asset_type", "video")
    .neq("status", "archived")
    .order("created_at", { ascending: false })
    .limit(6);

  const videoAssets = (videoAssetsData || []) as SocialAssetRow[];
  const latestVideoAsset = videoAssets[0] || null;
  const hasReadyVideo = Boolean(latestVideoAsset?.public_url?.trim());

  const { data: publishEventsData } = await supabaseServer
    .from("social_publish_events")
    .select(
      "id, created_at, platform, event_type, status, meta_id, meta_post_id, meta_creation_id, error_message, message, image_url, payload, published_at"
    )
    .eq("post_id", id)
    .order("created_at", { ascending: false })
    .limit(12);

  const publishEvents = (publishEventsData || []) as SocialPublishEventRow[];

  const { data: musicTracksData } = await supabaseServer
    .from("social_music_library")
    .select("id, title, public_url, duration_seconds, mood_tags, template_keys, license_type, license_note")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(100);

  const musicTracks = (musicTracksData || []) as SocialMusicTrackRow[];

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
                  href={`/admin/social/${post.id}/tiktok`}
                  className="inline-flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-black text-amber-900 transition hover:bg-amber-100"
                >
                  TikTok Upload vorbereiten
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

                <span
                  className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${
                    hasReadyVideo
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-slate-200 bg-slate-50 text-slate-700"
                  }`}
                >
                  {hasReadyVideo ? "Video vorhanden" : "Video optional"}
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

                <AdminSocialMetaPublishMediaButtons
                  postId={post.id}
                  disabled={Boolean(publishDisabledReason)}
                  disabledReason={publishDisabledReason}
                  hasReadyVideo={hasReadyVideo}
                  videoDisabledReason={
                    hasReadyVideo
                      ? undefined
                      : "Für Video/Reel-Veröffentlichung muss zuerst ein animiertes Video erzeugt werden."
                  }
                />

                
                <AdminSocialGenerateVideoButton
                  postId={post.id}
                  sourceImageAssetId={latestAsset?.id || null}
                  disabled={!hasReadyImage}
                  disabledReason={
                    hasReadyImage
                      ? undefined
                      : "Bitte zuerst ein Social-Bild erzeugen."
                  }
                />

          {latestVideoAsset?.id ? (
            <AdminSocialMusicStatusControl
              assetId={latestVideoAsset.id}
              currentStatus={getAssetMusicStatus(latestVideoAsset.metadata)}
              currentNote={getAssetMusicNote(latestVideoAsset.metadata)}
            />
          ) : null}

          {latestVideoAsset?.id ? (
            <AdminSocialVideoMusicComposer
              postId={post.id}
              sourceVideoAssetId={latestVideoAsset.id}
              tracks={musicTracks}
              templateKey={null}
            />
          ) : null}

                <AdminSocialCreateAdCampaignButton
                  postId={post.id}
                  disabled={Boolean(adDisabledReason)}
                  disabledReason={adDisabledReason}
                />
              </div>
            </div>
          </div>
        </header>

        
        <AdminSocialPublishingOverview postId={post.id} />
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
          <section className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm sm:p-7 lg:order-1">
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

          

            <div className="mt-6 rounded-[1.5rem] border border-[#E7D8C3] bg-[#FFFCF7] p-5 lg:order-3 lg:col-span-2">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <Video className="h-5 w-5 text-[#B5282D]" />
                    <h3 className="text-xl font-black text-[#102A43]">
                      Animiertes Video
                    </h3>
                  </div>

                  <p className="max-w-2xl text-sm font-semibold leading-6 text-[#52616F]">
                    Erzeugt aus dem neuesten freigegebenen Social-Bild ein kurzes MP4 mit dezenter Bewegung.
                    Dieses Video ist als Reel-/Story-Grundlage gedacht. Musik wird später separat behandelt.
                  </p>
                </div>

                <AdminSocialGenerateVideoButton
                  postId={post.id}
                  sourceImageAssetId={latestAsset?.id || null}
                  disabled={!hasReadyImage}
                  disabledReason={
                    hasReadyImage
                      ? undefined
                      : "Bitte zuerst ein Social-Bild erzeugen."
                  }
                />
              </div>

              {latestVideoAsset?.public_url ? (
                <div className="mt-5 grid gap-6 lg:grid-cols-[320px_1fr]">
                  <div className="overflow-hidden rounded-[1.25rem] bg-[#102A43]">
                    <video
                      src={latestVideoAsset.public_url}
                      controls
                      loop
                      playsInline
                      className="aspect-[4/5] w-full bg-[#102A43] object-contain"
                    />
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold leading-6 text-emerald-900">
                      Ein animiertes Video ist vorhanden. Neueste Datei:
                      <br />
                      <span className="font-black">
                        {formatDateTime(latestVideoAsset.created_at)} · {formatFileSize(latestVideoAsset.file_size)}
                      </span>
                    </div>

                    <a
                      href={latestVideoAsset.public_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-2xl bg-[#102A43] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110"
                    >
                      Video öffnen
                      <ExternalLink className="h-4 w-4" />
                    </a>

                    <div className="rounded-2xl border border-[#E7D8C3] bg-white p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8A5A35]">
                          Video-Versionen
                        </p>

                        <span className="rounded-full border border-[#E7D8C3] bg-[#FFFCF7] px-3 py-1 text-xs font-black text-[#486581]">
                          {videoAssets.length} vorhanden
                        </span>
                      </div>

                      <div className="space-y-3">
                        {videoAssets.map((videoAsset, index) => (
                          <div
                            key={videoAsset.id}
                            className="rounded-xl border border-[#E7D8C3] bg-[#FFFCF7] p-3"
                          >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-sm font-black text-[#102A43]">
                                    {index === 0 ? "Aktuelle Version" : `Version ${index + 1}`}
                                  </span>

                                  {index === 0 ? (
                                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-black text-emerald-800">
                                      neueste
                                    </span>
                                  ) : null}
                                </div>

                                <p className="mt-1 text-xs font-bold leading-5 text-[#627D98]">
                                  {formatDateTime(videoAsset.created_at)} · {formatFileSize(videoAsset.file_size)}
                                </p>
                              </div>

                              {videoAsset.public_url ? (
                                <a
                                  href={videoAsset.public_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#E7D8C3] bg-white px-3 py-2 text-xs font-black text-[#A23A2E] transition hover:bg-[#F5E8D8]"
                                >
                                  Öffnen
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                              ) : (
                                <span className="text-xs font-bold text-[#9FB3C8]">
                                  Kein Link
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      <p className="mt-3 text-xs font-semibold leading-5 text-[#627D98]">
                        Bei erneuter Erzeugung bleibt die alte Version als Asset erhalten. Die neueste Version wird oben angezeigt und als aktuelle Version genutzt.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-5 rounded-[1.25rem] border border-dashed border-[#D9C4A8] bg-white p-5 text-sm font-bold leading-6 text-[#627D98]">
                  Noch kein Video vorhanden. Sobald Du „Animiertes Video erzeugen“ klickst, erscheint hier die MP4-Vorschau.
                </div>
              )}
            </div>

          <aside className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm sm:p-7 lg:order-2">
            <h2 className="text-2xl font-black text-[#102A43]">
              Veröffentlichungs-Checkliste
            </h2>

            <div className="mt-5 space-y-3 text-sm font-bold leading-6 text-[#52616F]">
              <p>{isReviewApproved ? "✅" : "□"} Content-Review freigegeben</p>
              <p>{hasReadyImage ? "✅" : "□"} Social-Bild vorhanden</p>
              <p>□ Hook geprüft</p>
              <p>□ Caption geprüft</p>
              <p>□ Hashtags geprüft</p>
              <p>□ Bild passt zur Botschaft</p>
              <p>□ Landingpage / Link geprüft</p>
              <p>□ Plattform ausgewählt</p>
              <p>□ Veröffentlichungszeit geprüft</p>
              <p>□ Beitrag nach Veröffentlichung markieren</p>
              <p>□ Optional: Ads-Kampagne vorbereiten</p>
            </div>

            <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold leading-6 text-amber-900">
              Diese Seite postet noch nicht automatisch. Sie ist die saubere
              Zwischenstufe für manuelle Veröffentlichung, spätere
              API-Anbindung und Ads-Vorbereitung.
            </div>
          </aside>
        </section>

        
        
        <section className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[#E7D8C3] bg-[#FFFCF7] px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-[#8A5A35]">
                Veröffentlichungsstatus
              </div>

              <h2 className="mt-4 text-2xl font-black text-[#102A43]">
                Veröffentlichungsstatus je Plattform
              </h2>

              <p className="mt-2 max-w-4xl text-sm font-semibold leading-6 text-[#52616F]">
                Hier siehst Du getrennt, welche Kombination bereits veröffentlicht wurde.
                Blockiert wird nur dieselbe Kombination erneut, nicht der komplette Beitrag.
              </p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {getPublishCombinationStatusItems(publishEvents).map((item) => {
              const mediaUrl = item.event ? getPublishEventMediaUrl(item.event) : null;
              const reference = item.event ? getMetaReference(item.event) : "-";

              return (
                <article
                  key={item.key}
                  className={
                    item.isPublished
                      ? "rounded-[1.5rem] border border-emerald-200 bg-emerald-50 p-4"
                      : "rounded-[1.5rem] border border-[#E7D8C3] bg-[#FFFCF7] p-4"
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.14em] text-[#8A5A35]">
                        {item.platformLabel}
                      </p>

                      <h3 className="mt-1 text-lg font-black text-[#102A43]">
                        {item.mediaLabel}
                      </h3>
                    </div>

                    <span
                      className={
                        item.isPublished
                          ? "rounded-full bg-emerald-600 px-3 py-1 text-xs font-black text-white"
                          : "rounded-full border border-[#E7D8C3] bg-white px-3 py-1 text-xs font-black text-[#627D98]"
                      }
                    >
                      {item.isPublished ? "Veröffentlicht" : "Offen"}
                    </span>
                  </div>

                  <p className="mt-4 text-xs font-bold leading-5 text-[#52616F]">
                    {formatPublishStatusDate(item.event?.published_at || item.event?.created_at || null)}
                  </p>

                  {item.isPublished && item.event ? (
                    <div className="mt-4 space-y-2 text-xs font-semibold leading-5 text-[#627D98]">
                      <div>
                        Meta-Referenz:{" "}
                        <span className="break-all font-bold text-[#102A43]">
                          {reference}
                        </span>
                      </div>

                      {mediaUrl ? (
                        <a
                          href={mediaUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 rounded-full border border-[#E7D8C3] bg-white px-3 py-1 text-xs font-black text-[#A23A2E] hover:bg-[#F5E8D8]"
                        >
                          Asset öffnen
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : null}
                    </div>
                  ) : (
                    <p className="mt-4 text-xs font-bold leading-5 text-[#627D98]">
                      Diese Kombination kann noch veröffentlicht werden.
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        </section>

<section className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-5 flex items-center gap-2">
            <Share2 className="h-5 w-5 text-[#B5282D]" />
            <h2 className="text-2xl font-black text-[#102A43]">
              Posting-Medium auswählen
            </h2>
          </div>

          <p className="max-w-4xl text-sm font-semibold leading-6 text-[#52616F]">
            Entscheide hier fachlich, ob dieser Beitrag als Bildpost oder als animiertes Video/Reel genutzt werden soll.
            Diese Auswahl steuert aktuell noch nicht automatisch das Meta-Publishing, bereitet aber den nächsten Schritt sauber vor.
          </p>

          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            <article className={`rounded-[1.5rem] border p-5 ${
              hasReadyImage
                ? "border-emerald-200 bg-emerald-50"
                : "border-amber-200 bg-amber-50"
            }`}>
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-[#B5282D]">
                  <ImageIcon className="h-5 w-5" />
                </div>

                <div>
                  <h3 className="text-lg font-black text-[#102A43]">
                    Bildpost / Standard-Posting
                  </h3>

                  <p className="mt-2 text-sm font-bold leading-6 text-[#52616F]">
                    Geeignet für Facebook-Feed, Instagram-Feed, Story-Thumbnail und schnelle manuelle Veröffentlichungen.
                  </p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="rounded-full border border-white bg-white px-3 py-1 text-xs font-black text-emerald-800">
                      Facebook Feed
                    </span>
                    <span className="rounded-full border border-white bg-white px-3 py-1 text-xs font-black text-emerald-800">
                      Instagram Feed
                    </span>
                    <span className="rounded-full border border-white bg-white px-3 py-1 text-xs font-black text-[#486581]">
                      Thumbnail
                    </span>
                  </div>

                  {latestAsset?.public_url ? (
                    <a
                      href={latestAsset.public_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-[#B5282D] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110"
                    >
                      Aktuelles Bild öffnen
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  ) : (
                    <p className="mt-5 text-sm font-black text-amber-900">
                      Noch kein Bild vorhanden.
                    </p>
                  )}
                </div>
              </div>
            </article>

            <article className={`rounded-[1.5rem] border p-5 ${
              hasReadyVideo
                ? "border-emerald-200 bg-emerald-50"
                : "border-slate-200 bg-slate-50"
            }`}>
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-[#102A43]">
                  <Video className="h-5 w-5" />
                </div>

                <div>
                  <h3 className="text-lg font-black text-[#102A43]">
                    Video / Reel / Story
                  </h3>

                  <p className="mt-2 text-sm font-bold leading-6 text-[#52616F]">
                    Geeignet für Instagram Reels, Facebook Reels, Stories und TikTok-ähnliche Kurzformate.
                    Für Musik ist die 30-Sekunden-Version die beste Grundlage.
                  </p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="rounded-full border border-white bg-white px-3 py-1 text-xs font-black text-emerald-800">
                      Instagram Reel
                    </span>
                    <span className="rounded-full border border-white bg-white px-3 py-1 text-xs font-black text-emerald-800">
                      Facebook Reel
                    </span>
                    <span className="rounded-full border border-white bg-white px-3 py-1 text-xs font-black text-[#486581]">
                      Story
                    </span>
                    <span className="rounded-full border border-white bg-white px-3 py-1 text-xs font-black text-[#486581]">
                      Musikfähig ab 30s
                    </span>
                  </div>

                  {latestVideoAsset?.public_url ? (
                    <a
                      href={latestVideoAsset.public_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-[#102A43] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110"
                    >
                      Aktuelles Video öffnen
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  ) : (
                    <p className="mt-5 text-sm font-black text-slate-700">
                      Noch kein Video vorhanden. Erzeuge zuerst ein 15s- oder 30s-Video.
                    </p>
                  )}
                </div>
              </div>
            </article>
          </div>

          <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm font-bold leading-6 text-blue-900">
            Empfehlung: Für normale Posts reicht das Bild. Für Reichweite, Reels und spätere Musiknutzung die 30-Sekunden-Video-Version verwenden.
            Das automatische Meta-Publishing wird im nächsten Schritt so erweitert, dass Bild und Video sauber getrennt behandelt werden.
          </div>
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
                Gespeichert werden Plattform, Medium, Asset, Meta-Referenz, finaler Text, Zeitpunkt und mögliche Fehler.
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

                    <div className="mt-3 grid gap-3 rounded-2xl border border-[#E7D8C3] bg-[#FFFCF7] p-3 text-xs font-bold leading-5 text-[#486581] md:grid-cols-2">
                      <div>
                        <span className="block text-[11px] font-black uppercase tracking-[0.14em] text-[#8A5A35]">
                          Veröffentlichtes Medium
                        </span>
                        <span className="mt-1 inline-flex rounded-full border border-[#E7D8C3] bg-white px-3 py-1 text-xs font-black text-[#102A43]">
                          {getPublishEventMediaLabel(event)}
                        </span>
                      </div>

                      <div>
                        <span className="block text-[11px] font-black uppercase tracking-[0.14em] text-[#8A5A35]">
                          Asset
                        </span>

                        {getPublishEventMediaUrl(event) ? (
                          <a
                            href={getPublishEventMediaUrl(event) || "#"}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 inline-flex items-center gap-2 rounded-full border border-[#E7D8C3] bg-white px-3 py-1 text-xs font-black text-[#A23A2E] hover:bg-[#F5E8D8]"
                          >
                            Asset öffnen
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="mt-1 block text-[#627D98]">
                            Keine Asset-URL gespeichert
                          </span>
                        )}

                        {getPublishEventAssetId(event) ? (
                          <span className="mt-2 block break-all text-[11px] font-semibold text-[#627D98]">
                            Asset-ID: {getPublishEventAssetId(event)}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {event.message ? (
                      <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold leading-5 text-blue-900">
                        {event.message}
                      </div>
                    ) : null}

                    {getPublishEventFinalText(event) ? (
                      <details className="mt-3 rounded-xl border border-[#E7D8C3] bg-white px-3 py-2 text-xs leading-5 text-[#102A43]">
                        <summary className="cursor-pointer font-black text-[#8A5A35]">
                          Finalen Veröffentlichungstext anzeigen
                        </summary>
                        <p className="mt-3 whitespace-pre-line font-semibold">
                          {getPublishEventFinalText(event)}
                        </p>
                      </details>
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





