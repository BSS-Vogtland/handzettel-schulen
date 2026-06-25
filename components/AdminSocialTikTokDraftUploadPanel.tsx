"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  Lock,
  RefreshCw,
  Send,
  ShieldCheck,
  XCircle,
} from "lucide-react";

type TikTokDraftPreview = {
  ok: boolean;
  dryRun?: boolean;
  message?: string;
  canUpload?: boolean;
  blockedReason?: string;
  readiness?: {
    uploadEnabled: boolean;
    hasVideoUploadScope: boolean;
    scope: string;
  };
  post?: {
    id: string;
    topic: string | null;
    review_status: string | null;
    status: string | null;
  };
  videoAsset?: {
    id: string;
    public_url: string | null;
    file_size: number | null;
    mime_type: string | null;
    status: string | null;
    created_at: string | null;
  } | null;
  finalText?: string;
};

type UploadResult = {
  ok: boolean;
  message?: string;
  publishId?: string;
};

function formatFileSize(value: number | null | undefined) {
  if (!value) return "—";

  if (value < 1024 * 1024) {
    return `${Math.round(value / 1024)} KB`;
  }

  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function getStatusIcon(ok: boolean | undefined) {
  if (ok) return <CheckCircle2 className="h-5 w-5 text-emerald-700" />;
  return <XCircle className="h-5 w-5 text-amber-700" />;
}

function getReviewLabel(status: string | null | undefined) {
  switch (status) {
    case "approved":
      return "freigegeben";
    case "needs_changes":
      return "Überarbeitung nötig";
    case "rejected":
      return "abgelehnt";
    case "not_reviewed":
    case null:
    case undefined:
    default:
      return "offen";
  }
}

export default function AdminSocialTikTokDraftUploadPanel({
  postId,
  initialVideoAssetId,
}: {
  postId: string;
  initialVideoAssetId?: string | null;
}) {
  const [preview, setPreview] = useState<TikTokDraftPreview | null>(null);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showText, setShowText] = useState(true);

  const videoAssetId = useMemo(
    () => initialVideoAssetId || preview?.videoAsset?.id || "",
    [initialVideoAssetId, preview?.videoAsset?.id]
  );

  async function loadPreview() {
    try {
      setIsPreviewLoading(true);
      setUploadResult(null);

      const response = await fetch(`/api/admin/social/${postId}/publish-tiktok`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dryRun: true,
          assetId: videoAssetId || undefined,
        }),
      });

      const result = (await response.json().catch(() => null)) as
        | TikTokDraftPreview
        | null;

      if (!response.ok || !result) {
        throw new Error(
          result?.message || "TikTok-Sicherheitsvorschau konnte nicht geladen werden."
        );
      }

      setPreview(result);
    } catch (error) {
      setPreview({
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "TikTok-Sicherheitsvorschau konnte nicht geladen werden.",
        canUpload: false,
      });
    } finally {
      setIsPreviewLoading(false);
    }
  }

  async function startUpload() {
    if (!window.confirm("TikTok-Draft-Upload wirklich starten?")) return;

    try {
      setIsUploading(true);
      setUploadResult(null);

      const response = await fetch(`/api/admin/social/${postId}/publish-tiktok`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dryRun: false,
          assetId: videoAssetId || undefined,
        }),
      });

      const result = (await response.json().catch(() => null)) as
        | UploadResult
        | null;

      if (!response.ok || !result?.ok) {
        throw new Error(
          result?.message || "TikTok-Draft-Upload ist fehlgeschlagen."
        );
      }

      setUploadResult(result);
      await loadPreview();
    } catch (error) {
      setUploadResult({
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "TikTok-Draft-Upload ist fehlgeschlagen.",
      });
    } finally {
      setIsUploading(false);
    }
  }

  useEffect(() => {
    void loadPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  const canUpload = Boolean(preview?.canUpload);
  const blockedReason = preview?.blockedReason || "";
  const videoUrl = preview?.videoAsset?.public_url || "";
  const hasVideoAsset = Boolean(preview?.videoAsset?.public_url);
  const hasVideoUploadScope = Boolean(preview?.readiness?.hasVideoUploadScope);
  const uploadFlagEnabled = Boolean(preview?.readiness?.uploadEnabled);

  return (
    <section className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#E7D8C3] bg-[#FFFCF7] px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-[#8A5A35]">
            <ShieldCheck className="h-4 w-4 text-[#A23A2E]" />
            TikTok Draft-Upload
          </div>

          <h2 className="mt-4 text-2xl font-black text-[#102A43]">
            V2J.1B · Review-Demo und Upload-Sicherheitsprüfung
          </h2>

          <p className="mt-2 max-w-4xl text-sm font-semibold leading-6 text-[#627D98]">
            Diese Ansicht zeigt TikTok den vorbereiteten Draft-Upload-Workflow:
            Video-Asset, finalen TikTok-Text, Scope-Prüfung, Upload-Flag und den
            konkreten Sperrgrund. Der echte Upload startet nur, wenn alle
            Sicherheitsbedingungen erfüllt sind.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => loadPreview()}
            disabled={isPreviewLoading}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#E7D8C3] bg-white px-5 py-3 text-sm font-black text-[#486581] shadow-sm transition hover:bg-[#FFFCF7] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw
              className={`h-4 w-4 ${isPreviewLoading ? "animate-spin" : ""}`}
            />
            Vorschau prüfen
          </button>

          <button
            type="button"
            onClick={() => startUpload()}
            disabled={!canUpload || isUploading}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#A23A2E] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            {isUploading ? "Lädt hoch ..." : "Draft-Upload starten"}
          </button>
        </div>
      </div>

      {uploadResult ? (
        <div
          className={`mt-5 rounded-2xl border p-4 text-sm font-bold leading-6 ${
            uploadResult.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-red-200 bg-red-50 text-red-900"
          }`}
        >
          {uploadResult.message ||
            (uploadResult.ok
              ? "TikTok-Draft-Upload wurde gestartet."
              : "TikTok-Draft-Upload ist fehlgeschlagen.")}
          {uploadResult.publishId ? (
            <p className="mt-2 text-xs">Publish ID: {uploadResult.publishId}</p>
          ) : null}
        </div>
      ) : null}

      <div
        className={`mt-6 rounded-[1.5rem] border p-4 ${
          canUpload
            ? "border-emerald-200 bg-emerald-50"
            : "border-amber-200 bg-amber-50"
        }`}
      >
        <div className="flex items-start gap-3">
          {canUpload ? (
            <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-emerald-700" />
          ) : (
            <Lock className="mt-1 h-5 w-5 shrink-0 text-amber-700" />
          )}

          <div>
            <h3 className="text-lg font-black text-[#102A43]">
              {canUpload
                ? "TikTok-Draft-Upload ist freigegeben"
                : "TikTok-Draft-Upload ist vorbereitet, aber gesperrt"}
            </h3>

            <p className="mt-2 text-sm font-semibold leading-6 text-[#486581]">
              {blockedReason ||
                preview?.message ||
                "Alle technischen Vorbedingungen sind erfüllt."}
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 rounded-2xl bg-white/80 p-3 text-xs font-bold leading-5 md:grid-cols-2">
          <div>
            <p className="flex items-center gap-2">
              {getStatusIcon(hasVideoAsset)}
              Video-Asset: {hasVideoAsset ? "vorhanden" : "fehlt"}
            </p>
            <p>Dateigröße: {formatFileSize(preview?.videoAsset?.file_size)}</p>
            <p>MIME-Type: {preview?.videoAsset?.mime_type || "—"}</p>
            <p>Review: {getReviewLabel(preview?.post?.review_status)}</p>
          </div>

          <div>
            <p className="flex items-center gap-2">
              {getStatusIcon(hasVideoUploadScope)}
              video.upload Scope: {hasVideoUploadScope ? "gesetzt" : "fehlt"}
            </p>
            <p>
              Upload-Flag: {uploadFlagEnabled ? "aktiv" : "deaktiviert"}
            </p>
            <p>Scopes: {preview?.readiness?.scope || "—"}</p>
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-[1.5rem] border border-[#D9E2EC] bg-[#F8FAFC] p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-[#102A43]">
            <ClipboardCheck className="h-5 w-5" />
          </div>

          <div>
            <h3 className="text-lg font-black text-[#102A43]">
              Review-Demo-Check dieser Seite
            </h3>

            <p className="mt-1 text-sm font-semibold leading-6 text-[#627D98]">
              Für die TikTok-Aufnahme sollten genau diese Punkte sichtbar sein.
              Keine Tokens, Secrets, ENV-Werte oder Kundendaten zeigen.
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div
            className={`rounded-2xl border p-3 text-xs font-black leading-5 ${
              hasVideoAsset
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-amber-200 bg-amber-50 text-amber-900"
            }`}
          >
            <div className="flex items-center gap-2">
              {hasVideoAsset ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <AlertTriangle className="h-4 w-4" />
              )}
              Video-Vorschau
            </div>
            <p className="mt-1 font-bold">
              {hasVideoAsset ? "sichtbar" : "noch nicht sichtbar"}
            </p>
          </div>

          <div
            className={`rounded-2xl border p-3 text-xs font-black leading-5 ${
              preview?.finalText
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-amber-200 bg-amber-50 text-amber-900"
            }`}
          >
            <div className="flex items-center gap-2">
              {preview?.finalText ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <AlertTriangle className="h-4 w-4" />
              )}
              TikTok-Text
            </div>
            <p className="mt-1 font-bold">
              {preview?.finalText ? "vorhanden" : "fehlt"}
            </p>
          </div>

          <div
            className={`rounded-2xl border p-3 text-xs font-black leading-5 ${
              hasVideoUploadScope
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-amber-200 bg-amber-50 text-amber-900"
            }`}
          >
            <div className="flex items-center gap-2">
              {hasVideoUploadScope ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <Lock className="h-4 w-4" />
              )}
              video.upload
            </div>
            <p className="mt-1 font-bold">
              {hasVideoUploadScope ? "im Scope" : "noch nicht im Scope"}
            </p>
          </div>

          <div
            className={`rounded-2xl border p-3 text-xs font-black leading-5 ${
              uploadFlagEnabled
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-amber-200 bg-amber-50 text-amber-900"
            }`}
          >
            <div className="flex items-center gap-2">
              {uploadFlagEnabled ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <Lock className="h-4 w-4" />
              )}
              Upload-Flag
            </div>
            <p className="mt-1 font-bold">
              {uploadFlagEnabled ? "aktiv" : "deaktiviert"}
            </p>
          </div>
        </div>
      </div>

      {videoUrl ? (
        <div className="mt-6 rounded-[1.5rem] border border-[#D9E2EC] bg-[#F8FAFC] p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-lg font-black text-[#102A43]">
              TikTok-Video
            </h3>

            <a
              href={videoUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-[#D9E2EC] bg-white px-4 py-2 text-xs font-black text-[#102A43] transition hover:bg-[#FFFCF7]"
            >
              Video öffnen
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>

          <video
            src={videoUrl}
            controls
            className="max-h-[520px] w-full rounded-2xl bg-black object-contain"
          />
        </div>
      ) : null}

      <div className="mt-6 rounded-[1.5rem] border border-[#E7D8C3] bg-[#FFFCF7] p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-black text-[#102A43]">
            Finaler TikTok-Text
          </h3>

          <button
            type="button"
            onClick={() => setShowText((value) => !value)}
            className="rounded-xl border border-[#E7D8C3] bg-white px-4 py-2 text-xs font-black text-[#102A43] transition hover:bg-[#FFFCF7]"
          >
            {showText ? "Text ausblenden" : "Text anzeigen"}
          </button>
        </div>

        {showText ? (
          <pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap rounded-2xl border border-[#E7D8C3] bg-white p-4 text-xs font-bold leading-5 text-[#243B53]">
            {preview?.finalText || "Noch keine Vorschau geladen."}
          </pre>
        ) : null}
      </div>

      <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold leading-5 text-amber-900">
        Aktueller Sicherheitsmodus: Der echte TikTok-Upload bleibt gesperrt, bis
        Content Posting API / video.upload in TikTok freigegeben ist und
        TIKTOK_ENABLE_DRAFT_UPLOAD=true bewusst in Vercel gesetzt wurde.
      </div>
    </section>
  );
}

