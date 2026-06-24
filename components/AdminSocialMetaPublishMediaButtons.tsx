"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ExternalLink,
  ImageIcon,
  Send,
  Video,
  X,
} from "lucide-react";

type MediaType = "image" | "video";
type Platform = "facebook" | "instagram";

type AdminSocialMetaPublishMediaButtonsProps = {
  postId: string;
  disabled?: boolean;
  disabledReason?: string;
  hasReadyVideo?: boolean;
  videoDisabledReason?: string;
};

type PublishOption = {
  key: string;
  label: string;
  note: string;
  platform: Platform;
  mediaType: MediaType;
  tone: "image" | "video";
};

type PreviewResponse = {
  ok: boolean;
  dryRun?: boolean;
  message?: string;
  mediaType?: MediaType;
  mediaTypeLabel?: string;
  platformLabels?: string[];
  asset?: {
    id: string | null;
    public_url: string | null;
    storage_path: string | null;
    status: string | null;
    asset_type: string | null;
    mime_type: string | null;
    music_status?: "none" | "manual_added" | "planned";
    music_note?: string;
  };
  captions?: {
    platform: Platform;
    platformLabel: string;
    caption: string;
  }[];
  post?: {
    id: string;
    topic: string;
    status: string;
    review_status: string | null;
    scheduled_at: string | null;
    published_at: string | null;
  };
};

type PreviewState = {
  option: PublishOption;
  response: PreviewResponse;
};

const PUBLISH_OPTIONS: PublishOption[] = [
  {
    key: "facebook-image",
    label: "Bild auf Facebook veröffentlichen",
    note: "Standard-Feedpost mit aktuellem Bild.",
    platform: "facebook",
    mediaType: "image",
    tone: "image",
  },
  {
    key: "instagram-image",
    label: "Bild auf Instagram veröffentlichen",
    note: "Instagram-Bildpost mit aktuellem Bild.",
    platform: "instagram",
    mediaType: "image",
    tone: "image",
  },
  {
    key: "facebook-video",
    label: "Video auf Facebook veröffentlichen",
    note: "Facebook-Video mit aktueller MP4-Datei.",
    platform: "facebook",
    mediaType: "video",
    tone: "video",
  },
  {
    key: "instagram-video",
    label: "Reel auf Instagram veröffentlichen",
    note: "Instagram-Reel mit aktueller MP4-Datei.",
    platform: "instagram",
    mediaType: "video",
    tone: "video",
  },
];

function getPlatformLabel(platform: Platform) {
  return platform === "facebook" ? "Facebook" : "Instagram";
}


function buildMetaPublishErrorMessage(result: unknown) {
  if (!result || typeof result !== "object") {
    return "Meta-Veröffentlichung ist fehlgeschlagen.";
  }

  const record = result as Record<string, unknown>;
  const baseMessage =
    typeof record.message === "string" && record.message.trim()
      ? record.message.trim()
      : "Meta-Veröffentlichung ist fehlgeschlagen.";

  const rawResults = Array.isArray(record.results) ? record.results : [];

  const detailMessages = rawResults
    .map((item) => {
      if (!item || typeof item !== "object") return "";

      const itemRecord = item as Record<string, unknown>;
      const platform =
        typeof itemRecord.platform === "string" ? itemRecord.platform : "meta";
      const message =
        typeof itemRecord.message === "string" ? itemRecord.message : "";

      if (!message.trim()) return "";

      return `${platform}: ${message.trim()}`;
    })
    .filter(Boolean);

  if (detailMessages.length === 0) {
    return baseMessage;
  }

  return `${baseMessage}\n\nDetails:\n${detailMessages.join("\n")}`;
}

function getMediaLabel(mediaType: MediaType) {
  return mediaType === "video" ? "Video/Reel" : "Bildpost";
}


function getMusicStatusLabel(status: string | undefined) {
  if (status === "manual_added") return "Musik manuell ergänzt";
  if (status === "planned") return "Musik später geplant";

  return "Keine Musik";
}

function getAssetLabel(mediaType: MediaType) {
  return mediaType === "video" ? "MP4-Video" : "Bild";
}

export default function AdminSocialMetaPublishMediaButtons({
  postId,
  disabled = false,
  disabledReason,
  hasReadyVideo = false,
  videoDisabledReason,
}: AdminSocialMetaPublishMediaButtonsProps) {
  const router = useRouter();
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);

  async function requestPreview(option: PublishOption) {
    if (disabled) {
      alert(disabledReason || "Veröffentlichung ist aktuell nicht möglich.");
      return;
    }

    if (option.mediaType === "video" && !hasReadyVideo) {
      alert(
        videoDisabledReason ||
          "Es ist noch kein veröffentlichbares Video vorhanden."
      );
      return;
    }

    try {
      setActiveKey(option.key);

      const response = await fetch(`/api/admin/social/${postId}/publish-meta`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          platforms: [option.platform],
          mediaType: option.mediaType,
          dryRun: true,
        }),
      });

      const result = (await response.json().catch(() => null)) as
        | PreviewResponse
        | null;

      if (!response.ok || !result?.ok) {
        throw new Error(
          result?.message ||
            "Veröffentlichungs-Vorschau konnte nicht erstellt werden."
        );
      }

      setPreview({
        option,
        response: result,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unbekannter Fehler bei der Veröffentlichungs-Vorschau.";

      alert(message);
    } finally {
      setActiveKey(null);
    }
  }

  async function confirmPublish() {
    if (!preview) return;

    const option = preview.option;

    try {
      setActiveKey(option.key);

      const response = await fetch(`/api/admin/social/${postId}/publish-meta`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          platforms: [option.platform],
          mediaType: option.mediaType,
          dryRun: false,
        }),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok) {
        throw new Error(buildMetaPublishErrorMessage(result));
      }

      setPreview(null);
      alert(result.message || "Meta-Veröffentlichung war erfolgreich.");
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unbekannter Fehler bei der Meta-Veröffentlichung.";

      alert(message);
    } finally {
      setActiveKey(null);
    }
  }

  const isBusy = Boolean(activeKey);

  return (
    <>
      <div className="rounded-2xl border border-[#E7D8C3] bg-white p-4">
        <div className="mb-3 flex items-center gap-2">
          <Send className="h-4 w-4 text-[#A23A2E]" />
          <p className="text-sm font-black text-[#102A43]">
            Direkt über Meta veröffentlichen
          </p>
        </div>

        <div className="grid gap-2">
          {PUBLISH_OPTIONS.map((option) => {
            const isVideo = option.mediaType === "video";
            const isBlocked = disabled || (isVideo && !hasReadyVideo);
            const isActive = activeKey === option.key;

            return (
              <button
                key={option.key}
                type="button"
                onClick={() => requestPreview(option)}
                disabled={isBlocked || isBusy}
                title={
                  disabled
                    ? disabledReason
                    : isVideo && !hasReadyVideo
                      ? videoDisabledReason
                      : undefined
                }
                className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                  isBlocked || isBusy
                    ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-500"
                    : option.tone === "video"
                      ? "border-[#102A43] bg-[#102A43] text-white hover:brightness-110"
                      : "border-[#E7D8C3] bg-[#FFFCF7] text-[#102A43] hover:bg-[#F5E8D8]"
                }`}
              >
                <span
                  className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
                    isBlocked || isBusy
                      ? "bg-white text-slate-400"
                      : option.tone === "video"
                        ? "bg-white/15 text-white"
                        : "bg-white text-[#A23A2E]"
                  }`}
                >
                  {option.mediaType === "video" ? (
                    <Video className="h-4 w-4" />
                  ) : option.platform === "instagram" ? (
                    <Camera className="h-4 w-4" />
                  ) : (
                    <ImageIcon className="h-4 w-4" />
                  )}
                </span>

                <span>
                  <span className="block text-sm font-black">
                    {isActive ? "Vorschau wird geprüft ..." : option.label}
                  </span>
                  <span className="mt-1 block text-xs font-bold leading-5 opacity-80">
                    {option.note}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <p className="mt-3 text-xs font-semibold leading-5 text-[#627D98]">
          Jeder Button öffnet zuerst eine Sicherheitsvorschau. Erst die zweite
          Bestätigung veröffentlicht wirklich. Musik/Reel-Audio wird aktuell
          nicht über die API gesetzt.
        </p>
      </div>

      {preview ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#102A43]/70 px-4 py-6">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[2rem] border border-[#E7D8C3] bg-[#FFFCF7] p-5 shadow-2xl sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-amber-900">
                  <AlertTriangle className="h-4 w-4" />
                  Sicherheitsvorschau
                </div>

                <h3 className="mt-4 text-2xl font-black text-[#102A43]">
                  Veröffentlichung prüfen
                </h3>

                <p className="mt-2 text-sm font-bold leading-6 text-[#52616F]">
                  Es wurde noch nichts veröffentlicht. Prüfe Plattform, Medium,
                  Asset und finalen Text.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setPreview(null)}
                disabled={isBusy}
                className="rounded-2xl border border-[#E7D8C3] bg-white p-3 text-[#102A43] hover:bg-[#F5E8D8]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-[#E7D8C3] bg-white p-4">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[#8A5A35]">
                  Plattform
                </p>
                <p className="mt-2 text-lg font-black text-[#102A43]">
                  {getPlatformLabel(preview.option.platform)}
                </p>
              </div>

              <div className="rounded-2xl border border-[#E7D8C3] bg-white p-4">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[#8A5A35]">
                  Medium
                </p>
                <p className="mt-2 text-lg font-black text-[#102A43]">
                  {getMediaLabel(preview.option.mediaType)}
                </p>
              </div>

              <div className="rounded-2xl border border-[#E7D8C3] bg-white p-4 sm:col-span-2">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[#8A5A35]">
                  Asset
                </p>

                <p className="mt-2 text-sm font-bold text-[#102A43]">
                  {getAssetLabel(preview.option.mediaType)}
                  {preview.response.asset?.mime_type
                    ? ` · ${preview.response.asset.mime_type}`
                    : ""}
                </p>

                {preview.response.asset?.public_url ? (
                  <a
                    href={preview.response.asset.public_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-2 rounded-2xl border border-[#E7D8C3] bg-[#FFFCF7] px-4 py-2 text-xs font-black text-[#102A43] hover:bg-[#F5E8D8]"
                  >
                    Asset öffnen
                    <ExternalLink className="h-4 w-4" />
                  </a>
                ) : null}

                {preview.response.asset?.id ? (
                  <p className="mt-3 break-all text-xs font-semibold text-[#627D98]">
                    Asset-ID: {preview.response.asset.id}
                  </p>
                ) : null}

                {preview.option.mediaType === "video" ? (
                  <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold leading-5 text-blue-900">
                    <span className="block font-black">Musikstatus</span>
                    <span className="mt-1 block">
                      {getMusicStatusLabel(preview.response.asset?.music_status)}
                    </span>
                    {preview.response.asset?.music_note ? (
                      <span className="mt-2 block whitespace-pre-line">
                        {preview.response.asset.music_note}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-[#E7D8C3] bg-white p-4">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[#8A5A35]">
                Finaler Posting-Text
              </p>

              <div className="mt-3 grid gap-3">
                {(preview.response.captions || []).map((item) => (
                  <div
                    key={item.platform}
                    className="rounded-2xl border border-[#E7D8C3] bg-[#FFFCF7] p-4"
                  >
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-[#8A5A35]">
                      {item.platformLabel}
                    </p>
                    <p className="mt-2 whitespace-pre-line text-sm font-semibold leading-6 text-[#102A43]">
                      {item.caption || "Kein Text vorhanden."}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold leading-6 text-red-900">
              Diese Aktion veröffentlicht den Beitrag wirklich über Meta. Nach
              erfolgreicher Veröffentlichung wird der Beitrag im SocialPilot als
              veröffentlicht markiert.
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setPreview(null)}
                disabled={isBusy}
                className="rounded-2xl border border-[#E7D8C3] bg-white px-5 py-3 text-sm font-black text-[#102A43] hover:bg-[#F5E8D8] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Abbrechen
              </button>

              <button
                type="button"
                onClick={confirmPublish}
                disabled={isBusy}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#B5282D] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <CheckCircle2 className="h-4 w-4" />
                {isBusy
                  ? "Wird veröffentlicht ..."
                  : "Endgültig veröffentlichen"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
