"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  ImageIcon,
  RefreshCw,
  Send,
  ShieldCheck,
  Video,
  XCircle,
} from "lucide-react";

type UnknownRow = Record<string, unknown>;

type AssetRow = {
  id?: string;
  asset_type?: string | null;
  public_url?: string | null;
  storage_path?: string | null;
  mime_type?: string | null;
  status?: string | null;
  created_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

type OverviewResponse = {
  ok: boolean;
  checked_at?: string;
  message?: string;
  post?: UnknownRow;
  assets?: AssetRow[];
  publishEvents?: UnknownRow[];
  tiktok?: {
    connected: boolean;
    scope: string;
    uploadEnabled: boolean;
    hasVideoUploadScope: boolean;
    canUpload: boolean;
    blockedReason: string;
  } | null;
};

type PlatformCard = {
  key: string;
  platform: "facebook" | "instagram" | "tiktok";
  title: string;
  subtitle: string;
  mediaType: "image" | "video";
  assetReady: boolean;
  published: boolean;
  blocked: boolean;
  blockedReason?: string;
  event?: UnknownRow | null;
  href?: string;
};

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function lower(value: unknown) {
  return normalizeText(value).toLowerCase();
}

function getRowText(row: UnknownRow | null | undefined, keys: string[]) {
  if (!row) return "";

  for (const key of keys) {
    const value = normalizeText(row[key]);

    if (value) return value;
  }

  return "";
}

function getNestedText(row: UnknownRow | null | undefined, path: string[]) {
  if (!row) return "";

  let current: unknown = row;

  for (const key of path) {
    if (!current || typeof current !== "object") return "";

    current = (current as Record<string, unknown>)[key];
  }

  return normalizeText(current);
}

function getEventPlatform(event: UnknownRow | null | undefined) {
  return lower(
    getRowText(event, [
      "platform",
      "target_platform",
      "provider",
      "channel",
      "network",
      "destination",
    ])
  );
}

function getEventMediaType(event: UnknownRow | null | undefined) {
  const direct = lower(
    getRowText(event, [
      "media_type",
      "mediaType",
      "asset_type",
      "assetType",
      "content_type",
      "contentType",
      "post_type",
      "postType",
    ])
  );

  if (direct) return direct;

  const metadataMediaType = lower(getNestedText(event, ["metadata", "media_type"]));
  const rawMediaType = lower(getNestedText(event, ["raw_response", "media_type"]));

  return metadataMediaType || rawMediaType;
}

function getEventType(event: UnknownRow | null | undefined) {
  return lower(
    getRowText(event, [
      "event_type",
      "eventType",
      "type",
      "action",
      "operation",
      "publish_type",
      "publishType",
    ])
  );
}

function getEventStatus(event: UnknownRow | null | undefined) {
  return lower(
    getRowText(event, [
      "status",
      "state",
      "result",
      "publish_status",
      "publishStatus",
      "event_status",
      "eventStatus",
    ])
  );
}

function getEventError(event: UnknownRow | null | undefined) {
  return getRowText(event, [
    "error_message",
    "errorMessage",
    "error",
    "failure_reason",
    "failureReason",
    "failed_reason",
    "failedReason",
    "exception",
  ]);
}

function getEventExternalId(event: UnknownRow | null | undefined) {
  return getRowText(event, [
    "meta_post_id",
    "metaPostId",
    "meta_id",
    "metaId",
    "external_id",
    "externalId",
    "remote_id",
    "remoteId",
    "post_id_external",
    "publish_id",
    "publishId",
    "creation_id",
    "creationId",
    "id_on_platform",
  ]);
}

function getEventDate(event: UnknownRow | null | undefined) {
  return getRowText(event, [
    "published_at",
    "publishedAt",
    "created_at",
    "createdAt",
    "updated_at",
    "updatedAt",
    "finished_at",
    "finishedAt",
  ]);
}

function isFailureEvent(event: UnknownRow | null | undefined) {
  const status = getEventStatus(event);
  const type = getEventType(event);
  const error = getEventError(event);

  return (
    Boolean(error) ||
    status === "failed" ||
    status === "failure" ||
    status === "error" ||
    status === "rejected" ||
    status === "cancelled" ||
    type.includes("failed") ||
    type.includes("error")
  );
}

function isSuccessEvent(event: UnknownRow | null | undefined) {
  if (!event || isFailureEvent(event)) return false;

  const status = getEventStatus(event);
  const eventType = getEventType(event);
  const externalId = getEventExternalId(event);
  const publishedAt = getRowText(event, ["published_at", "publishedAt"]);

  if (
    status === "success" ||
    status === "published" ||
    status === "completed" ||
    status === "complete" ||
    status === "ok" ||
    status === "posted" ||
    status === "uploaded"
  ) {
    return true;
  }

  if (
    eventType.includes("success") ||
    eventType.includes("published") ||
    eventType.includes("posted") ||
    eventType.includes("uploaded")
  ) {
    return true;
  }

  if (externalId && !isFailureEvent(event)) {
    return true;
  }

  if (publishedAt && !isFailureEvent(event)) {
    return true;
  }

  return false;
}

function eventMatches({
  event,
  platform,
  mediaType,
}: {
  event: UnknownRow;
  platform: string;
  mediaType: "image" | "video";
}) {
  const rowPlatform = getEventPlatform(event);
  const rowMediaType = getEventMediaType(event);
  const rowEventType = getEventType(event);
  const rawText = JSON.stringify(event).toLowerCase();

  if (rowPlatform && rowPlatform !== platform) return false;

  if (!rowPlatform && !rawText.includes(platform)) return false;

  if (rowMediaType === mediaType) return true;

  if (mediaType === "image") {
    return (
      rowMediaType.includes("image") ||
      rowMediaType.includes("photo") ||
      rowEventType.includes("image") ||
      rowEventType.includes("photo") ||
      rowEventType.includes("bild") ||
      rawText.includes("image") ||
      rawText.includes("photo")
    );
  }

  return (
    rowMediaType.includes("video") ||
    rowMediaType.includes("reel") ||
    rowEventType.includes("video") ||
    rowEventType.includes("reel") ||
    rowEventType.includes("draft") ||
    rawText.includes("video") ||
    rawText.includes("reel")
  );
}

function isImageAsset(asset: AssetRow) {
  const type = lower(asset.asset_type);
  const mime = lower(asset.mime_type);
  const url = lower(asset.public_url || asset.storage_path);

  return (
    type.includes("image") ||
    type.includes("photo") ||
    mime.startsWith("image/") ||
    url.endsWith(".png") ||
    url.endsWith(".jpg") ||
    url.endsWith(".jpeg") ||
    url.endsWith(".webp")
  );
}

function isVideoAsset(asset: AssetRow) {
  const type = lower(asset.asset_type);
  const mime = lower(asset.mime_type);
  const url = lower(asset.public_url || asset.storage_path);

  return (
    type.includes("video") ||
    mime.startsWith("video/") ||
    url.endsWith(".mp4") ||
    url.endsWith(".mov") ||
    url.endsWith(".webm")
  );
}

function formatDate(value: unknown) {
  const dateValue = normalizeText(value);

  if (!dateValue) return "—";

  try {
    return new Intl.DateTimeFormat("de-DE", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(dateValue));
  } catch {
    return dateValue;
  }
}

function getStatusLabel(card: PlatformCard) {
  if (card.published) return "Veröffentlicht";
  if (card.blocked) return "Gesperrt";
  if (card.assetReady) return "Vorbereitet";
  return "Asset fehlt";
}

function getStatusStyle(card: PlatformCard) {
  if (card.published) {
    return "border-emerald-200 bg-emerald-50 text-emerald-950";
  }

  if (card.blocked) {
    return "border-amber-200 bg-amber-50 text-amber-950";
  }

  if (card.assetReady) {
    return "border-sky-200 bg-sky-50 text-sky-950";
  }

  return "border-slate-200 bg-slate-50 text-slate-700";
}

function StatusIcon({ card }: { card: PlatformCard }) {
  if (card.published) {
    return <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-700" />;
  }

  if (card.blocked) {
    return <AlertTriangle className="h-5 w-5 shrink-0 text-amber-700" />;
  }

  if (card.assetReady) {
    return <Send className="h-5 w-5 shrink-0 text-sky-700" />;
  }

  return <XCircle className="h-5 w-5 shrink-0 text-slate-500" />;
}

function MediaIcon({ mediaType }: { mediaType: "image" | "video" }) {
  if (mediaType === "image") {
    return <ImageIcon className="h-5 w-5" />;
  }

  return <Video className="h-5 w-5" />;
}

function summarizeEvent(event: UnknownRow | null | undefined) {
  if (!event) return "—";

  const platform = getEventPlatform(event) || "—";
  const mediaType = getEventMediaType(event) || "—";
  const status = getEventStatus(event) || "—";
  const eventType = getEventType(event) || "—";
  const externalId = getEventExternalId(event) || "—";

  return `${platform} · ${mediaType} · ${status} · ${eventType} · ${externalId}`;
}

function getEventKey(event: UnknownRow, index: number) {
  const id = getRowText(event, ["id", "event_id", "eventId"]);
  return id || `event-${index}`;
}

export default function AdminSocialPublishingOverview({
  postId,
}: {
  postId: string;
}) {
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showEvents, setShowEvents] = useState(false);

  async function loadOverview() {
    try {
      setIsLoading(true);

      const response = await fetch(
        `/api/admin/social/${postId}/publishing-overview`,
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const result = (await response.json().catch(() => null)) as
        | OverviewResponse
        | null;

      if (!response.ok || !result) {
        throw new Error(
          result?.message || "Publishing-Übersicht konnte nicht geladen werden."
        );
      }

      setOverview(result);
    } catch (error) {
      setOverview({
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Publishing-Übersicht konnte nicht geladen werden.",
      });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  const assets = overview?.assets || [];
  const events = overview?.publishEvents || [];
  const imageAsset = assets.find(isImageAsset) || null;
  const videoAsset = assets.find(isVideoAsset) || null;

  const cards = useMemo<PlatformCard[]>(() => {
    function latestEvent(
      platform: "facebook" | "instagram" | "tiktok",
      mediaType: "image" | "video"
    ) {
      const matchingEvents = events.filter((event) =>
        eventMatches({
          event,
          platform,
          mediaType,
        })
      );

      const successEvent = matchingEvents.find(isSuccessEvent);

      return successEvent || matchingEvents[0] || null;
    }

    const facebookImageEvent = latestEvent("facebook", "image");
    const facebookVideoEvent = latestEvent("facebook", "video");
    const instagramImageEvent = latestEvent("instagram", "image");
    const instagramVideoEvent = latestEvent("instagram", "video");
    const tiktokVideoEvent = latestEvent("tiktok", "video");

    const tiktokBlocked =
      !overview?.tiktok?.connected ||
      !overview?.tiktok?.hasVideoUploadScope ||
      !overview?.tiktok?.uploadEnabled ||
      !overview?.tiktok?.canUpload;

    return [
      {
        key: "facebook-image",
        platform: "facebook",
        title: "Facebook Bild",
        subtitle: "klassischer Facebook-Bildpost",
        mediaType: "image",
        assetReady: Boolean(imageAsset?.public_url),
        published: isSuccessEvent(facebookImageEvent),
        blocked: !imageAsset?.public_url,
        blockedReason: !imageAsset?.public_url ? "Bild-Asset fehlt." : "",
        event: facebookImageEvent,
      },
      {
        key: "facebook-video",
        platform: "facebook",
        title: "Facebook Video",
        subtitle: "Facebook Video/Reel-kompatibler MP4-Post",
        mediaType: "video",
        assetReady: Boolean(videoAsset?.public_url),
        published: isSuccessEvent(facebookVideoEvent),
        blocked: !videoAsset?.public_url,
        blockedReason: !videoAsset?.public_url ? "Video-Asset fehlt." : "",
        event: facebookVideoEvent,
      },
      {
        key: "instagram-image",
        platform: "instagram",
        title: "Instagram Bild",
        subtitle: "Instagram Feed-Bild",
        mediaType: "image",
        assetReady: Boolean(imageAsset?.public_url),
        published: isSuccessEvent(instagramImageEvent),
        blocked: !imageAsset?.public_url,
        blockedReason: !imageAsset?.public_url ? "Bild-Asset fehlt." : "",
        event: instagramImageEvent,
      },
      {
        key: "instagram-video",
        platform: "instagram",
        title: "Instagram Reel",
        subtitle: "Instagram Video/Reel",
        mediaType: "video",
        assetReady: Boolean(videoAsset?.public_url),
        published: isSuccessEvent(instagramVideoEvent),
        blocked: !videoAsset?.public_url,
        blockedReason: !videoAsset?.public_url ? "Video-Asset fehlt." : "",
        event: instagramVideoEvent,
      },
      {
        key: "tiktok-video",
        platform: "tiktok",
        title: "TikTok Video",
        subtitle: "Draft-Upload vorbereitet, echter Upload noch gesichert",
        mediaType: "video",
        assetReady: Boolean(videoAsset?.public_url),
        published: isSuccessEvent(tiktokVideoEvent),
        blocked: tiktokBlocked,
        blockedReason:
          overview?.tiktok?.blockedReason ||
          "TikTok video.upload ist noch nicht aktiv.",
        event: tiktokVideoEvent,
        href: `/admin/social/${postId}/tiktok`,
      },
    ];
  }, [events, imageAsset?.public_url, overview?.tiktok, postId, videoAsset?.public_url]);

  const publishedCount = cards.filter((card) => card.published).length;
  const preparedCount = cards.filter(
    (card) => !card.published && card.assetReady && !card.blocked
  ).length;
  const blockedCount = cards.filter((card) => card.blocked && !card.published)
    .length;

  return (
    <section className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#E7D8C3] bg-[#FFFCF7] px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-[#8A5A35]">
            <ShieldCheck className="h-4 w-4 text-[#A23A2E]" />
            Publishing-Übersicht
          </div>

          <h2 className="mt-4 text-2xl font-black text-[#102A43]">
            V2H.2 · Plattformstatus
          </h2>

          <p className="mt-2 max-w-4xl text-sm font-semibold leading-6 text-[#627D98]">
            Zusammenfassung der aktuellen Veröffentlichungslage für Facebook,
            Instagram und TikTok. Die Event-Erkennung toleriert unterschiedliche
            Log-Felder aus den bisherigen Publishing-Routen.
          </p>

          <p className="mt-2 text-xs font-bold text-[#8A5A35]">
            Letzte Prüfung: {formatDate(overview?.checked_at)}
          </p>
        </div>

        <button
          type="button"
          onClick={() => loadOverview()}
          disabled={isLoading}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#102A43] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          {isLoading ? "Prüft ..." : "Übersicht aktualisieren"}
        </button>
      </div>

      {overview?.ok === false ? (
        <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold leading-6 text-red-900">
          {overview.message || "Publishing-Übersicht konnte nicht geladen werden."}
        </div>
      ) : null}

      <div className="mt-6 grid gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
          <p className="text-xs font-black uppercase tracking-[0.16em]">
            Veröffentlicht
          </p>
          <p className="mt-2 text-3xl font-black">{publishedCount}</p>
        </div>

        <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sky-950">
          <p className="text-xs font-black uppercase tracking-[0.16em]">
            Vorbereitet
          </p>
          <p className="mt-2 text-3xl font-black">{preparedCount}</p>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
          <p className="text-xs font-black uppercase tracking-[0.16em]">
            Gesperrt/offen
          </p>
          <p className="mt-2 text-3xl font-black">{blockedCount}</p>
        </div>

        <button
          type="button"
          onClick={() => setShowEvents((value) => !value)}
          className="rounded-2xl border border-[#D9E2EC] bg-[#F8FAFC] p-4 text-left text-[#102A43] transition hover:bg-white"
        >
          <p className="text-xs font-black uppercase tracking-[0.16em]">
            Publish-Events
          </p>
          <p className="mt-2 text-3xl font-black">{events.length}</p>
          <p className="mt-1 text-xs font-bold text-[#627D98]">
            {showEvents ? "Details ausblenden" : "Details anzeigen"}
          </p>
        </button>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-5">
        {cards.map((card) => (
          <article
            key={card.key}
            className={`rounded-[1.5rem] border p-4 ${getStatusStyle(card)}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/80">
                  <MediaIcon mediaType={card.mediaType} />
                </div>

                <div>
                  <h3 className="text-base font-black">{card.title}</h3>
                  <p className="mt-1 text-xs font-bold leading-5 opacity-80">
                    {card.subtitle}
                  </p>
                </div>
              </div>

              <StatusIcon card={card} />
            </div>

            <div className="mt-4 rounded-2xl bg-white/80 p-3 text-xs font-bold leading-5">
              <p>Status: {getStatusLabel(card)}</p>
              <p>Asset: {card.assetReady ? "vorhanden" : "fehlt"}</p>
              <p>Event: {card.event ? "vorhanden" : "—"}</p>
              <p>Datum: {formatDate(getEventDate(card.event))}</p>
              <p className="mt-2 break-words text-[11px] opacity-80">
                Match: {summarizeEvent(card.event)}
              </p>
            </div>

            {card.blocked && !card.published && card.blockedReason ? (
              <p className="mt-3 rounded-xl border border-white/80 bg-white/70 p-3 text-xs font-bold leading-5">
                {card.blockedReason}
              </p>
            ) : null}

            {card.href ? (
              <Link
                href={card.href}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-black text-[#102A43] transition hover:bg-[#FFFCF7]"
              >
                Öffnen
                <ExternalLink className="h-4 w-4" />
              </Link>
            ) : null}
          </article>
        ))}
      </div>

      {showEvents ? (
        <div className="mt-6 rounded-[1.5rem] border border-[#D9E2EC] bg-[#F8FAFC] p-4">
          <h3 className="text-lg font-black text-[#102A43]">
            Gefundene Publish-Events
          </h3>

          <p className="mt-1 text-sm font-semibold leading-6 text-[#627D98]">
            Dieser technische Abgleich hilft zu sehen, welche Events vorhanden
            sind und warum eine Plattform als veröffentlicht oder offen erkannt wird.
          </p>

          <div className="mt-4 space-y-3">
            {events.length === 0 ? (
              <div className="rounded-2xl border border-[#D9E2EC] bg-white p-4 text-sm font-bold text-[#627D98]">
                Für diesen Beitrag wurden noch keine Publish-Events gefunden.
              </div>
            ) : (
              events.map((event, index) => (
                <details
                  key={getEventKey(event, index)}
                  className="rounded-2xl border border-[#D9E2EC] bg-white p-4"
                >
                  <summary className="cursor-pointer text-sm font-black text-[#102A43]">
                    Event {index + 1}: {summarizeEvent(event)}
                  </summary>

                  <div className="mt-3 grid gap-3 text-xs font-bold leading-5 text-[#486581] md:grid-cols-3">
                    <p>Plattform: {getEventPlatform(event) || "—"}</p>
                    <p>Medientyp: {getEventMediaType(event) || "—"}</p>
                    <p>Status: {getEventStatus(event) || "—"}</p>
                    <p>Event-Typ: {getEventType(event) || "—"}</p>
                    <p>Externe ID: {getEventExternalId(event) || "—"}</p>
                    <p>Datum: {formatDate(getEventDate(event))}</p>
                  </div>

                  <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-xl border border-[#D9E2EC] bg-[#F8FAFC] p-3 text-[11px] font-bold leading-5 text-[#243B53]">
                    {JSON.stringify(event, null, 2)}
                  </pre>
                </details>
              ))
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
