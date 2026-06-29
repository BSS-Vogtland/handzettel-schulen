"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileVideo,
  ImageIcon,
  Music,
  RefreshCw,
  ShieldCheck,
  Video,
  XCircle,
} from "lucide-react";

type AssetItem = {
  id: string;
  asset_type: string;
  provider: string;
  model: string;
  version: string;
  public_url: string;
  storage_path: string;
  mime_type: string;
  file_size: number;
  status: string;
  created_at: string;
  source_media_asset_id?: string;
  source_media_type?: string;
  source_music_status?: string;
  audio?: {
    has_audio: boolean;
    music_status: string;
    note: string;
  };
};

type BestSource = {
  media_type: "video" | "image";
  score: number;
  reason: string;
  audio: {
    has_audio: boolean;
    music_status: string;
    note: string;
  };
  asset: AssetItem;
};

type AssetStatusResponse = {
  ok: boolean;
  message?: string;
  checked_at?: string;
  summary?: {
    total_assets: number;
    source_candidates: number;
    normal_videos: number;
    images: number;
    tiktok_videos: number;
  };
  best_source?: BestSource | null;
  current_tiktok_video?: AssetItem | null;
  tiktok_videos?: AssetItem[];
  normal_videos?: AssetItem[];
  images?: AssetItem[];
};

function formatDate(value: string | undefined) {
  if (!value) return "—";

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

function formatSize(bytes: number | undefined) {
  const value = Number(bytes || 0);

  if (!value) return "—";

  const mb = value / 1024 / 1024;

  if (mb >= 1) {
    return `${mb.toFixed(1)} MB`;
  }

  return `${Math.round(value / 1024)} KB`;
}

function shortId(value: string | undefined) {
  if (!value) return "—";

  return value.slice(0, 8);
}

function AssetLink({ asset }: { asset: AssetItem }) {
  if (!asset.public_url) return null;

  return (
    <a
      href={asset.public_url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-2 rounded-xl border border-[#D9E2EC] bg-white px-3 py-2 text-xs font-black text-[#102A43] transition hover:bg-[#FFFCF7]"
    >
      Öffnen
      <ExternalLink className="h-4 w-4" />
    </a>
  );
}

function AudioBadge({ asset }: { asset: AssetItem }) {
  const hasAudio = Boolean(asset.audio?.has_audio);

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-black ${
        hasAudio
          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
          : "border-slate-200 bg-slate-50 text-slate-700"
      }`}
    >
      <Music className="h-3.5 w-3.5" />
      {hasAudio ? "Audio/Musik erkannt" : "Kein Audio erkannt"}
    </span>
  );
}

function AssetCard({
  title,
  asset,
  icon,
  accent,
}: {
  title: string;
  asset: AssetItem;
  icon: React.ReactNode;
  accent: "green" | "blue" | "amber" | "slate";
}) {
  const classes = {
    green: "border-emerald-200 bg-emerald-50 text-emerald-950",
    blue: "border-sky-200 bg-sky-50 text-sky-950",
    amber: "border-amber-200 bg-amber-50 text-amber-950",
    slate: "border-slate-200 bg-slate-50 text-slate-800",
  }[accent];

  return (
    <article className={`rounded-2xl border p-4 ${classes}`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-black">
            {icon}
            {title}
          </div>

          <p className="mt-2 text-xs font-bold leading-5 opacity-85">
            Version: {asset.version || asset.model || "—"} · Typ:{" "}
            {asset.mime_type || asset.asset_type || "—"} · Größe:{" "}
            {formatSize(asset.file_size)}
          </p>

          <p className="mt-1 text-xs font-bold leading-5 opacity-85">
            Erstellt: {formatDate(asset.created_at)} · ID: {shortId(asset.id)}
          </p>

          {asset.source_media_asset_id ? (
            <p className="mt-1 text-xs font-bold leading-5 opacity-85">
              Quelle: {asset.source_media_type || "—"} ·{" "}
              {shortId(asset.source_media_asset_id)}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <AudioBadge asset={asset} />
          <AssetLink asset={asset} />
        </div>
      </div>

      {asset.audio?.note ? (
        <p className="mt-3 rounded-xl bg-white/80 p-3 text-xs font-bold leading-5 opacity-90">
          {asset.audio.note}
        </p>
      ) : null}
    </article>
  );
}

export default function AdminSocialTikTokAssetStatus({
  postId,
}: {
  postId: string;
}) {
  const [status, setStatus] = useState<AssetStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showAllTikTokVersions, setShowAllTikTokVersions] = useState(false);

  async function loadStatus() {
    try {
      setIsLoading(true);

      const response = await fetch(`/api/admin/social/${postId}/tiktok-assets`, {
        method: "GET",
        cache: "no-store",
      });

      const payload = (await response.json().catch(() => null)) as
        | AssetStatusResponse
        | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(
          payload?.message || "TikTok-Asset-Status konnte nicht geladen werden."
        );
      }

      setStatus(payload);
    } catch (error) {
      setStatus({
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "TikTok-Asset-Status konnte nicht geladen werden.",
      });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadStatus();
  }, [postId]);

  const bestSource = status?.best_source || null;
  const currentTikTokVideo = status?.current_tiktok_video || null;
  const tiktokVideos = status?.tiktok_videos || [];
  const olderTikTokVideos = currentTikTokVideo
    ? tiktokVideos.filter((asset) => asset.id !== currentTikTokVideo.id)
    : tiktokVideos;

  return (
    <section className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#E7D8C3] bg-[#FFFCF7] px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-[#8A5A35]">
            <ShieldCheck className="h-4 w-4 text-[#A23A2E]" />
            TikTok Asset-Auswahl
          </div>

          <h2 className="mt-4 text-2xl font-black text-[#102A43]">
            V2I.4 · Quelle, Audio und TikTok-Versionen
          </h2>

          <p className="mt-2 max-w-4xl text-sm font-semibold leading-6 text-[#627D98]">
            Zeigt, welches Quellmedium für das 9:16-Rendering bevorzugt wird,
            ob Audio/Musik erkannt wurde und welche TikTok-Version aktuell
            vorbereitet ist. Diese Ansicht veröffentlicht nichts.
          </p>

          <p className="mt-2 text-xs font-bold text-[#8A5A35]">
            Letzte Prüfung: {formatDate(status?.checked_at)}
          </p>
        </div>

        <button
          type="button"
          onClick={() => loadStatus()}
          disabled={isLoading}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#102A43] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          {isLoading ? "Prüft ..." : "Assets prüfen"}
        </button>
      </div>

      {status?.ok === false ? (
        <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold leading-6 text-red-900">
          <div className="flex items-start gap-3">
            <XCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <span>
              {status.message || "TikTok-Asset-Status konnte nicht geladen werden."}
            </span>
          </div>
        </div>
      ) : null}

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-2xl border border-[#D9E2EC] bg-[#F8FAFC] p-4 text-[#102A43]">
          <p className="text-xs font-black uppercase tracking-[0.16em]">
            Assets
          </p>
          <p className="mt-2 text-3xl font-black">
            {status?.summary?.total_assets ?? "—"}
          </p>
        </div>

        <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sky-950">
          <p className="text-xs font-black uppercase tracking-[0.16em]">
            Videos
          </p>
          <p className="mt-2 text-3xl font-black">
            {status?.summary?.normal_videos ?? "—"}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-slate-700">
          <p className="text-xs font-black uppercase tracking-[0.16em]">
            Bilder
          </p>
          <p className="mt-2 text-3xl font-black">
            {status?.summary?.images ?? "—"}
          </p>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
          <p className="text-xs font-black uppercase tracking-[0.16em]">
            TikTok-Versionen
          </p>
          <p className="mt-2 text-3xl font-black">
            {status?.summary?.tiktok_videos ?? "—"}
          </p>
        </div>

        <div
          className={`rounded-2xl border p-4 ${
            bestSource?.audio?.has_audio
              ? "border-emerald-200 bg-emerald-50 text-emerald-950"
              : "border-slate-200 bg-slate-50 text-slate-700"
          }`}
        >
          <p className="text-xs font-black uppercase tracking-[0.16em]">
            Audio
          </p>
          <p className="mt-2 text-sm font-black">
            {bestSource?.audio?.has_audio ? "erkannt" : "nicht erkannt"}
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-4">
        {bestSource ? (
          <AssetCard
            title={`Bevorzugte Render-Quelle · ${bestSource.reason}`}
            asset={bestSource.asset}
            icon={
              bestSource.media_type === "video" ? (
                <FileVideo className="h-5 w-5" />
              ) : (
                <ImageIcon className="h-5 w-5" />
              )
            }
            accent={bestSource.media_type === "video" ? "blue" : "slate"}
          />
        ) : (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold leading-6 text-amber-900">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <span>
                Keine geeignete Render-Quelle gefunden. Bitte zuerst ein
                SocialPilot-Bild oder Video erzeugen.
              </span>
            </div>
          </div>
        )}

        {currentTikTokVideo ? (
          <AssetCard
            title="Aktuelle TikTok-9:16-Version"
            asset={currentTikTokVideo}
            icon={<Video className="h-5 w-5" />}
            accent="green"
          />
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-bold leading-6 text-slate-700">
            Noch kein TikTok-9:16-Video erzeugt.
          </div>
        )}
      </div>

      {olderTikTokVideos.length > 0 ? (
        <div className="mt-5 rounded-[1.5rem] border border-[#D9E2EC] bg-[#F8FAFC] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-black text-[#102A43]">
                Frühere TikTok-Versionen
              </h3>
              <p className="mt-1 text-xs font-bold text-[#627D98]">
                Alte Render-Versionen bleiben nachvollziehbar, werden aber nicht
                als aktuelle Version hervorgehoben.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowAllTikTokVersions((value) => !value)}
              className="rounded-xl border border-[#D9E2EC] bg-white px-4 py-2 text-xs font-black text-[#102A43] transition hover:bg-[#FFFCF7]"
            >
              {showAllTikTokVersions ? "Ausblenden" : "Alle anzeigen"}
            </button>
          </div>

          {showAllTikTokVersions ? (
            <div className="mt-4 grid gap-3">
              {olderTikTokVideos.map((asset) => (
                <AssetCard
                  key={asset.id}
                  title={`Frühere Version · ${asset.version}`}
                  asset={asset}
                  icon={<Video className="h-5 w-5" />}
                  accent="amber"
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold leading-5 text-amber-900">
        Diese Prüfung ändert keine Auswahl und aktiviert keinen Upload. Der echte
        TikTok-Upload bleibt weiterhin gesperrt, solange video.upload nicht
        autorisiert und TIKTOK_ENABLE_DRAFT_UPLOAD nicht aktiv gesetzt ist.
      </div>
    </section>
  );
}

