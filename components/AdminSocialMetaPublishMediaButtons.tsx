"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Camera, ImageIcon, Send, Video } from "lucide-react";

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

function getMediaLabel(mediaType: MediaType) {
  return mediaType === "video" ? "Video/Reel" : "Bildpost";
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

  async function handlePublish(option: PublishOption) {
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

    const confirmed = window.confirm(
      `${getMediaLabel(option.mediaType)} wirklich auf ${getPlatformLabel(
        option.platform
      )} veröffentlichen?\n\nDas löst eine echte Veröffentlichung über Meta aus.`
    );

    if (!confirmed) return;

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
        }),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok) {
        throw new Error(
          result?.message || "Meta-Veröffentlichung ist fehlgeschlagen."
        );
      }

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

  return (
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
              onClick={() => handlePublish(option)}
              disabled={isBlocked || Boolean(activeKey)}
              title={
                disabled
                  ? disabledReason
                  : isVideo && !hasReadyVideo
                    ? videoDisabledReason
                    : undefined
              }
              className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                isBlocked || activeKey
                  ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-500"
                  : option.tone === "video"
                    ? "border-[#102A43] bg-[#102A43] text-white hover:brightness-110"
                    : "border-[#E7D8C3] bg-[#FFFCF7] text-[#102A43] hover:bg-[#F5E8D8]"
              }`}
            >
              <span
                className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
                  isBlocked || activeKey
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
                  {isActive ? "Veröffentlicht ..." : option.label}
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
        Achtung: Diese Buttons veröffentlichen wirklich. Musik/Reel-Audio wird
        aktuell nicht über die API gesetzt und kann später manuell in der
        Plattform ergänzt werden.
      </p>
    </div>
  );
}
