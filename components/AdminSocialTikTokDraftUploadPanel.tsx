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
  channelName?: string;
  alreadyBuffered?: boolean;
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
  bufferPostId?: string;
  alreadyBuffered?: boolean;
  channelName?: string;
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

      const response = await fetch(`/api/admin/social/${postId}/publish-buffer`, {
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
          result?.message || "Buffer-Vorschau konnte nicht geladen werden."
        );
      }

      setPreview(result);
    } catch (error) {
      setPreview({
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Buffer-Vorschau konnte nicht geladen werden.",
        canUpload: false,
      });
    } finally {
      setIsPreviewLoading(false);
    }
  }

  async function startUpload() {
    const targetChannel = preview?.channelName || "Handzettel_Schulen.de";

    if (
      !window.confirm(
        `Dieses TikTok-Video wirklich als Buffer-Entwurf im Kanal ${targetChannel} erstellen?`
      )
    ) {
      return;
    }

    try {
      setIsUploading(true);
      setUploadResult(null);

      const response = await fetch(`/api/admin/social/${postId}/publish-buffer`, {
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
          result?.message || "Buffer-Entwurf konnte nicht erstellt werden."
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
            : "Buffer-Entwurf konnte nicht erstellt werden.",
      });
    } finally {
      setIsUploading(false);
    }
  }

  useEffect(() => {
    void loadPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  const blockedReason = preview?.blockedReason || "";
  const videoUrl = preview?.videoAsset?.public_url || "";
  const hasVideoAsset = Boolean(preview?.videoAsset?.public_url);
  const hasFinalText = Boolean(preview?.finalText);
  const reviewApproved = preview?.post?.review_status === "approved";
  const bufferReady = Boolean(preview?.canUpload);
  const alreadyBuffered = Boolean(preview?.alreadyBuffered);

  return (
    <section className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#E7D8C3] bg-[#FFFCF7] px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-[#8A5A35]">
            <ShieldCheck className="h-4 w-4 text-[#A23A2E]" />
            TikTok via Buffer
          </div>

          <h2 className="mt-4 text-2xl font-black text-[#102A43]">
            V2M.1 · TikTok-Entwurf an Buffer übergeben
          </h2>

          <p className="mt-2 max-w-4xl text-sm font-semibold leading-6 text-[#627D98]">
            Diese Ansicht nutzt weiter den bestehenden TikTok-Workflow: Video,
            finaler TikTok-Text und Review-Prüfung bleiben hier sichtbar. Die
            Übergabe geht aber nicht mehr direkt an TikTok, sondern als Entwurf
            an Buffer.
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
            disabled={!bufferReady || isUploading}
            title={
              !bufferReady
                ? blockedReason || "Für Buffer müssen Review, TikTok-Text und Video vorhanden sein."
                : undefined
            }
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#A23A2E] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            {isUploading ? "Erstelle Entwurf ..." : "In Buffer als Entwurf"}
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
              ? "Buffer-Entwurf wurde erstellt."
              : "Buffer-Entwurf konnte nicht erstellt werden.")}
          {uploadResult.bufferPostId || uploadResult.publishId ? (
            <p className="mt-2 text-xs">
              Buffer Post ID: {uploadResult.bufferPostId || uploadResult.publishId}
            </p>
          ) : null}
        </div>
      ) : null}

      <div
        className={`mt-6 rounded-[1.5rem] border p-4 ${
          bufferReady
            ? "border-emerald-200 bg-emerald-50"
            : "border-amber-200 bg-amber-50"
        }`}
      >
        <div className="flex items-start gap-3">
          {bufferReady ? (
            <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-emerald-700" />
          ) : (
            <Lock className="mt-1 h-5 w-5 shrink-0 text-amber-700" />
          )}

          <div>
            <h3 className="text-lg font-black text-[#102A43]">
              {bufferReady
                ? "Buffer-Entwurf ist bereit"
                : alreadyBuffered
                  ? "Buffer-Entwurf wurde bereits erstellt"
                  : "Buffer-Entwurf ist vorbereitet, aber noch gesperrt"}
            </h3>

            <p className="mt-2 text-sm font-semibold leading-6 text-[#486581]">
              {bufferReady
                ? "Video, finaler TikTok-Text und Review-Freigabe sind vorhanden."
                : blockedReason ||
                  preview?.message ||
                  "Für Buffer müssen Review, finaler TikTok-Text und Video vorhanden sein."}
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
              {getStatusIcon(hasFinalText)}
              TikTok-Text: {hasFinalText ? "vorhanden" : "fehlt"}
            </p>
            <p>Ziel: Buffer · {preview?.channelName || "Handzettel_Schulen.de"}</p>
            <p>Direkte TikTok-API: nicht genutzt</p>
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
              Buffer-Check dieser TikTok-Version
            </h3>

            <p className="mt-1 text-sm font-semibold leading-6 text-[#627D98]">
              Vor der Übergabe an Buffer werden Video, Text und Review geprüft.
              Tokens, Secrets, ENV-Werte oder Kundendaten werden hier nicht
              angezeigt.
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
              hasFinalText
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-amber-200 bg-amber-50 text-amber-900"
            }`}
          >
            <div className="flex items-center gap-2">
              {hasFinalText ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <AlertTriangle className="h-4 w-4" />
              )}
              TikTok-Text
            </div>
            <p className="mt-1 font-bold">
              {hasFinalText ? "vorhanden" : "fehlt"}
            </p>
          </div>

          <div
            className={`rounded-2xl border p-3 text-xs font-black leading-5 ${
              reviewApproved
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-amber-200 bg-amber-50 text-amber-900"
            }`}
          >
            <div className="flex items-center gap-2">
              {reviewApproved ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <Lock className="h-4 w-4" />
              )}
              Review
            </div>
            <p className="mt-1 font-bold">
              {reviewApproved ? "freigegeben" : "noch offen"}
            </p>
          </div>

          <div
            className={`rounded-2xl border p-3 text-xs font-black leading-5 ${
              alreadyBuffered
                ? "border-amber-200 bg-amber-50 text-amber-900"
                : "border-emerald-200 bg-emerald-50 text-emerald-900"
            }`}
          >
            <div className="flex items-center gap-2">
              {alreadyBuffered ? (
                <Lock className="h-4 w-4" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Buffer-Modus
            </div>
            <p className="mt-1 font-bold">
              {alreadyBuffered ? "bereits erstellt" : "Entwurf statt Live-Post"}
            </p>
          </div>
        </div>
      </div>

      {videoUrl ? (
        <div className="mt-6 rounded-[1.5rem] border border-[#D9E2EC] bg-[#F8FAFC] p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-lg font-black text-[#102A43]">
              TikTok-Video für Buffer
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

      <div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-xs font-bold leading-5 text-sky-900">
        Aktueller Sicherheitsmodus: Die direkte TikTok-API bleibt deaktiviert.
        Diese Seite erstellt nur einen Buffer-Entwurf. Die finale Planung oder
        Veröffentlichung erfolgt anschließend in Buffer.
      </div>
    </section>
  );
}
