"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Filter,
  ImageIcon,
  RefreshCw,
  ShieldCheck,
  Video,
  XCircle,
} from "lucide-react";

type UnknownRow = Record<string, unknown>;

type AssetRow = {
  id?: string;
  post_id?: string | null;
  asset_type?: string | null;
  public_url?: string | null;
  storage_path?: string | null;
  mime_type?: string | null;
  status?: string | null;
  created_at?: string | null;
};

type DashboardResponse = {
  ok: boolean;
  checked_at?: string;
  message?: string;
  posts?: UnknownRow[];
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

type PlatformState = "published" | "prepared" | "blocked" | "missing";
type DashboardFilter =
  | "relevant"
  | "published"
  | "prepared"
  | "blocked"
  | "missing"
  | "all";

type ComputedPlatform = {
  state: PlatformState;
  event: UnknownRow | null;
  reason: string;
};

type ComputedRow = {
  post: UnknownRow;
  postId: string;
  facebookImage: ComputedPlatform;
  facebookVideo: ComputedPlatform;
  instagramImage: ComputedPlatform;
  instagramVideo: ComputedPlatform;
  tiktokVideo: ComputedPlatform;
  states: PlatformState[];
  hasAnyAsset: boolean;
  hasAnyEvent: boolean;
  isRelevant: boolean;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function lower(value: unknown) {
  return text(value).toLowerCase();
}

function rowText(row: UnknownRow | null | undefined, keys: string[]) {
  if (!row) return "";

  for (const key of keys) {
    const value = text(row[key]);

    if (value) return value;
  }

  return "";
}

function eventPlatform(event: UnknownRow | null | undefined) {
  return lower(
    rowText(event, [
      "platform",
      "target_platform",
      "provider",
      "channel",
      "network",
    ])
  );
}

function eventMediaType(event: UnknownRow | null | undefined) {
  return lower(
    rowText(event, [
      "media_type",
      "mediaType",
      "asset_type",
      "content_type",
      "post_type",
    ])
  );
}

function eventType(event: UnknownRow | null | undefined) {
  return lower(
    rowText(event, [
      "event_type",
      "eventType",
      "type",
      "action",
      "operation",
      "publish_type",
    ])
  );
}

function eventStatus(event: UnknownRow | null | undefined) {
  return lower(
    rowText(event, [
      "status",
      "state",
      "result",
      "publish_status",
      "event_status",
    ])
  );
}

function eventError(event: UnknownRow | null | undefined) {
  return rowText(event, [
    "error_message",
    "errorMessage",
    "error",
    "failure_reason",
    "failureReason",
    "failed_reason",
    "exception",
  ]);
}

function eventExternalId(event: UnknownRow | null | undefined) {
  return rowText(event, [
    "meta_post_id",
    "metaPostId",
    "meta_id",
    "metaId",
    "external_id",
    "externalId",
    "remote_id",
    "publish_id",
    "creation_id",
  ]);
}

function eventDate(event: UnknownRow | null | undefined) {
  return rowText(event, [
    "published_at",
    "publishedAt",
    "created_at",
    "createdAt",
    "updated_at",
    "updatedAt",
  ]);
}

function isFailureEvent(event: UnknownRow | null | undefined) {
  const status = eventStatus(event);
  const type = eventType(event);
  const error = eventError(event);

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

  const status = eventStatus(event);
  const type = eventType(event);
  const externalId = eventExternalId(event);
  const publishedAt = rowText(event, ["published_at", "publishedAt"]);

  return (
    status === "success" ||
    status === "published" ||
    status === "completed" ||
    status === "complete" ||
    status === "ok" ||
    status === "posted" ||
    status === "uploaded" ||
    type.includes("success") ||
    type.includes("published") ||
    type.includes("posted") ||
    type.includes("uploaded") ||
    Boolean(externalId) ||
    Boolean(publishedAt)
  );
}

function eventMatches({
  event,
  platform,
  mediaType,
}: {
  event: UnknownRow;
  platform: "facebook" | "instagram" | "tiktok";
  mediaType: "image" | "video";
}) {
  const platformValue = eventPlatform(event);
  const mediaValue = eventMediaType(event);
  const typeValue = eventType(event);
  const rawText = JSON.stringify(event).toLowerCase();

  if (platformValue && platformValue !== platform) return false;
  if (!platformValue && !rawText.includes(platform)) return false;

  if (mediaValue === mediaType) return true;

  if (mediaType === "image") {
    return (
      mediaValue.includes("image") ||
      mediaValue.includes("photo") ||
      typeValue.includes("image") ||
      typeValue.includes("photo") ||
      rawText.includes("image") ||
      rawText.includes("photo")
    );
  }

  return (
    mediaValue.includes("video") ||
    mediaValue.includes("reel") ||
    typeValue.includes("video") ||
    typeValue.includes("reel") ||
    typeValue.includes("draft") ||
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
  const dateValue = text(value);

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

function getPostId(post: UnknownRow) {
  return text(post.id);
}

function getPostTitle(post: UnknownRow) {
  return (
    text(post.topic) ||
    text(post.title) ||
    text(post.hook) ||
    text(post.caption).slice(0, 80) ||
    "SocialPilot Beitrag"
  );
}

function getStateLabel(state: PlatformState) {
  switch (state) {
    case "published":
      return "Veröffentlicht";
    case "prepared":
      return "Vorbereitet";
    case "blocked":
      return "Gesperrt";
    case "missing":
    default:
      return "Fehlt";
  }
}

function getStateClass(state: PlatformState) {
  switch (state) {
    case "published":
      return "border-emerald-200 bg-emerald-50 text-emerald-950";
    case "prepared":
      return "border-sky-200 bg-sky-50 text-sky-950";
    case "blocked":
      return "border-amber-200 bg-amber-50 text-amber-950";
    case "missing":
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function StateIcon({ state }: { state: PlatformState }) {
  if (state === "published") return <CheckCircle2 className="h-4 w-4" />;
  if (state === "prepared") return <ImageIcon className="h-4 w-4" />;
  if (state === "blocked") return <AlertTriangle className="h-4 w-4" />;

  return <XCircle className="h-4 w-4" />;
}

function computePlatformState({
  postId,
  platform,
  mediaType,
  assets,
  events,
  tiktok,
}: {
  postId: string;
  platform: "facebook" | "instagram" | "tiktok";
  mediaType: "image" | "video";
  assets: AssetRow[];
  events: UnknownRow[];
  tiktok?: DashboardResponse["tiktok"];
}): ComputedPlatform {
  const postAssets = assets.filter((asset) => text(asset.post_id) === postId);
  const postEvents = events.filter((event) => text(event.post_id) === postId);

  const assetReady =
    mediaType === "image"
      ? postAssets.some((asset) => isImageAsset(asset) && Boolean(asset.public_url))
      : postAssets.some((asset) => isVideoAsset(asset) && Boolean(asset.public_url));

  const matchingEvents = postEvents.filter((event) =>
    eventMatches({ event, platform, mediaType })
  );
  const successEvent = matchingEvents.find(isSuccessEvent) || null;

  if (successEvent) {
    return {
      state: "published",
      event: successEvent,
      reason: "",
    };
  }

  if (platform === "tiktok") {
    if (!assetReady) {
      return {
        state: "missing",
        event: matchingEvents[0] || null,
        reason: "Video fehlt",
      };
    }

    if (!tiktok?.canUpload) {
      return {
        state: "blocked",
        event: matchingEvents[0] || null,
        reason: tiktok?.blockedReason || "video.upload fehlt",
      };
    }
  }

  if (assetReady) {
    return {
      state: "prepared",
      event: matchingEvents[0] || null,
      reason: "",
    };
  }

  return {
    state: "missing",
    event: matchingEvents[0] || null,
    reason: "Asset fehlt",
  };
}

function filterRows(rows: ComputedRow[], filter: DashboardFilter) {
  switch (filter) {
    case "published":
      return rows.filter((row) => row.states.includes("published"));
    case "prepared":
      return rows.filter((row) => row.states.includes("prepared"));
    case "blocked":
      return rows.filter((row) => row.states.includes("blocked"));
    case "missing":
      return rows.filter(
        (row) =>
          row.states.includes("missing") &&
          !row.states.includes("published") &&
          !row.states.includes("prepared") &&
          !row.states.includes("blocked")
      );
    case "all":
      return rows;
    case "relevant":
    default:
      return rows.filter((row) => row.isRelevant);
  }
}

const filterButtons: { key: DashboardFilter; label: string }[] = [
  { key: "relevant", label: "Relevant" },
  { key: "published", label: "Veröffentlicht" },
  { key: "prepared", label: "Vorbereitet" },
  { key: "blocked", label: "Gesperrt" },
  { key: "missing", label: "Nur fehlende Assets" },
  { key: "all", label: "Alle" },
];

export default function AdminSocialPublishingDashboard() {
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState<DashboardFilter>("relevant");

  async function loadDashboard() {
    try {
      setIsLoading(true);

      const response = await fetch("/api/admin/social/publishing-dashboard", {
        method: "GET",
        cache: "no-store",
      });

      const result = (await response.json().catch(() => null)) as
        | DashboardResponse
        | null;

      if (!response.ok || !result) {
        throw new Error(
          result?.message || "Publishing-Dashboard konnte nicht geladen werden."
        );
      }

      setDashboard(result);
    } catch (error) {
      setDashboard({
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Publishing-Dashboard konnte nicht geladen werden.",
      });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadDashboard();
  }, []);

  const posts = dashboard?.posts || [];
  const assets = dashboard?.assets || [];
  const events = dashboard?.publishEvents || [];

  const rows = useMemo<ComputedRow[]>(() => {
    return posts.map((post) => {
      const postId = getPostId(post);
      const postAssets = assets.filter((asset) => text(asset.post_id) === postId);
      const postEvents = events.filter((event) => text(event.post_id) === postId);

      const facebookImage = computePlatformState({
        postId,
        platform: "facebook",
        mediaType: "image",
        assets,
        events,
        tiktok: dashboard?.tiktok,
      });
      const facebookVideo = computePlatformState({
        postId,
        platform: "facebook",
        mediaType: "video",
        assets,
        events,
        tiktok: dashboard?.tiktok,
      });
      const instagramImage = computePlatformState({
        postId,
        platform: "instagram",
        mediaType: "image",
        assets,
        events,
        tiktok: dashboard?.tiktok,
      });
      const instagramVideo = computePlatformState({
        postId,
        platform: "instagram",
        mediaType: "video",
        assets,
        events,
        tiktok: dashboard?.tiktok,
      });
      const tiktokVideo = computePlatformState({
        postId,
        platform: "tiktok",
        mediaType: "video",
        assets,
        events,
        tiktok: dashboard?.tiktok,
      });

      const states = [
        facebookImage.state,
        facebookVideo.state,
        instagramImage.state,
        instagramVideo.state,
        tiktokVideo.state,
      ];

      const hasAnyAsset = postAssets.some((asset) => Boolean(asset.public_url));
      const hasAnyEvent = postEvents.length > 0;
      const isRelevant =
        hasAnyAsset ||
        hasAnyEvent ||
        states.includes("published") ||
        states.includes("prepared") ||
        states.includes("blocked");

      return {
        post,
        postId,
        facebookImage,
        facebookVideo,
        instagramImage,
        instagramVideo,
        tiktokVideo,
        states,
        hasAnyAsset,
        hasAnyEvent,
        isRelevant,
      };
    });
  }, [assets, dashboard?.tiktok, events, posts]);

  const visibleRows = useMemo(
    () => filterRows(rows, activeFilter),
    [activeFilter, rows]
  );

  const allStates = rows.flatMap((row) => row.states);
  const publishedCount = allStates.filter((state) => state === "published").length;
  const preparedCount = allStates.filter((state) => state === "prepared").length;
  const blockedCount = allStates.filter((state) => state === "blocked").length;
  const missingOnlyRows = rows.filter(
    (row) =>
      row.states.every((state) => state === "missing") &&
      !row.hasAnyAsset &&
      !row.hasAnyEvent
  ).length;
  const hiddenEmptyRows =
    activeFilter === "relevant" ? rows.length - visibleRows.length : 0;

  return (
    <section className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#E7D8C3] bg-[#FFFCF7] px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-[#8A5A35]">
            <ShieldCheck className="h-4 w-4 text-[#A23A2E]" />
            Publishing Dashboard
          </div>

          <h2 className="mt-4 text-2xl font-black text-[#102A43]">
            V2H.5 · Kompaktstatus
          </h2>

          <p className="mt-2 max-w-4xl text-sm font-semibold leading-6 text-[#627D98]">
            Kompakte Übersicht der letzten SocialPilot-Beiträge. Standardmäßig
            werden nur relevante Beiträge angezeigt; reine Entwürfe ohne Assets
            und Events bleiben ausgeblendet.
          </p>

          <p className="mt-2 text-xs font-bold text-[#8A5A35]">
            Letzte Prüfung: {formatDate(dashboard?.checked_at)}
          </p>
        </div>

        <button
          type="button"
          onClick={() => loadDashboard()}
          disabled={isLoading}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#102A43] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          {isLoading ? "Prüft ..." : "Dashboard aktualisieren"}
        </button>
      </div>

      {dashboard?.ok === false ? (
        <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold leading-6 text-red-900">
          {dashboard.message || "Publishing-Dashboard konnte nicht geladen werden."}
        </div>
      ) : null}

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
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
            Gesperrt
          </p>
          <p className="mt-2 text-3xl font-black">{blockedCount}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-slate-700">
          <p className="text-xs font-black uppercase tracking-[0.16em]">
            Leere Entwürfe
          </p>
          <p className="mt-2 text-3xl font-black">{missingOnlyRows}</p>
        </div>

        <div className="rounded-2xl border border-[#E7D8C3] bg-[#FFFCF7] p-4 text-[#102A43]">
          <p className="text-xs font-black uppercase tracking-[0.16em]">
            Sichtbar
          </p>
          <p className="mt-2 text-3xl font-black">{visibleRows.length}</p>
          <p className="mt-1 text-xs font-bold text-[#8A5A35]">
            {hiddenEmptyRows > 0
              ? `${hiddenEmptyRows} leere ausgeblendet`
              : "keine ausgeblendet"}
          </p>
        </div>
      </div>

      <div className="mt-5 rounded-[1.5rem] border border-[#D9E2EC] bg-[#F8FAFC] p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2 text-sm font-black text-[#102A43]">
            <Filter className="h-4 w-4" />
            Filter
          </div>

          <div className="flex flex-wrap gap-2">
            {filterButtons.map((button) => (
              <button
                key={button.key}
                type="button"
                onClick={() => setActiveFilter(button.key)}
                className={`rounded-xl border px-3 py-2 text-xs font-black transition ${
                  activeFilter === button.key
                    ? "border-[#102A43] bg-[#102A43] text-white"
                    : "border-[#D9E2EC] bg-white text-[#486581] hover:bg-[#FFFCF7]"
                }`}
              >
                {button.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-[1.5rem] border border-[#D9E2EC]">
        <div className="hidden grid-cols-[1.4fr_repeat(5,0.7fr)_0.55fr] gap-0 bg-[#F8FAFC] px-4 py-3 text-xs font-black uppercase tracking-[0.12em] text-[#627D98] xl:grid">
          <div>Beitrag</div>
          <div>FB Bild</div>
          <div>FB Video</div>
          <div>IG Bild</div>
          <div>IG Reel</div>
          <div>TikTok</div>
          <div>Aktion</div>
        </div>

        <div className="divide-y divide-[#D9E2EC] bg-white">
          {visibleRows.length === 0 ? (
            <div className="p-5 text-sm font-bold text-[#627D98]">
              Für diesen Filter wurden keine Beiträge gefunden.
            </div>
          ) : (
            visibleRows.map((row) => (
              <article
                key={row.postId}
                className="grid gap-3 p-4 xl:grid-cols-[1.4fr_repeat(5,0.7fr)_0.55fr] xl:items-center"
              >
                <div>
                  <h3 className="text-sm font-black text-[#102A43]">
                    {getPostTitle(row.post)}
                  </h3>
                  <p className="mt-1 text-xs font-bold leading-5 text-[#627D98]">
                    Status: {text(row.post.status) || "—"} · Review:{" "}
                    {text(row.post.review_status) || "—"}
                  </p>
                  <p className="mt-1 text-xs font-bold text-[#8A5A35]">
                    {formatDate(rowText(row.post, ["scheduled_at", "created_at", "updated_at"]))}
                  </p>
                </div>

                {[
                  row.facebookImage,
                  row.facebookVideo,
                  row.instagramImage,
                  row.instagramVideo,
                  row.tiktokVideo,
                ].map((state, index) => (
                  <div
                    key={`${row.postId}-${index}`}
                    className={`rounded-2xl border px-3 py-2 text-xs font-black ${getStateClass(
                      state.state
                    )}`}
                    title={state.reason || undefined}
                  >
                    <div className="flex items-center gap-2">
                      <StateIcon state={state.state} />
                      {getStateLabel(state.state)}
                    </div>

                    {state.event ? (
                      <p className="mt-1 text-[10px] font-bold opacity-80">
                        {formatDate(eventDate(state.event))}
                      </p>
                    ) : null}
                  </div>
                ))}

                <div className="flex flex-wrap gap-2 xl:justify-end">
                  <Link
                    href={`/admin/social/${row.postId}/posting`}
                    className="inline-flex items-center gap-2 rounded-xl border border-[#D9E2EC] bg-[#F8FAFC] px-3 py-2 text-xs font-black text-[#102A43] transition hover:bg-white"
                  >
                    Öffnen
                    <ExternalLink className="h-4 w-4" />
                  </Link>

                  <Link
                    href={`/admin/social/${row.postId}/tiktok`}
                    className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-black text-amber-900 transition hover:bg-amber-100"
                  >
                    TikTok
                    <Video className="h-4 w-4" />
                  </Link>
                </div>
              </article>
            ))
          )}
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold leading-5 text-amber-900">
        TikTok bleibt aktuell bewusst gesperrt, solange video.upload nicht
        autorisiert und TIKTOK_ENABLE_DRAFT_UPLOAD nicht aktiv gesetzt ist. Leere
        Entwürfe ohne Assets werden standardmäßig ausgeblendet, bleiben über den
        Filter „Alle“ oder „Nur fehlende Assets“ aber sichtbar.
      </div>
    </section>
  );
}
