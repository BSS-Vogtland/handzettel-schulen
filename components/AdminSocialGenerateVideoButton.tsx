"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Video } from "lucide-react";

type AdminSocialGenerateVideoButtonProps = {
  postId: string;
  disabled?: boolean;
  disabledReason?: string;
};

const DURATION_OPTIONS = [
  {
    label: "7s Test",
    value: 7,
    description: "schnell",
  },
  {
    label: "15s Clip",
    value: 15,
    description: "kurz",
  },
  {
    label: "30s Musik",
    value: 30,
    description: "empfohlen",
  },
];

export default function AdminSocialGenerateVideoButton({
  postId,
  disabled = false,
  disabledReason,
}: AdminSocialGenerateVideoButtonProps) {
  const router = useRouter();
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeDuration, setActiveDuration] = useState<number | null>(null);

  async function handleGenerateVideo(durationSeconds: number) {
    if (disabled) {
      if (disabledReason) {
        alert(disabledReason);
      }

      return;
    }

    const confirmed = window.confirm(
      `${durationSeconds}-Sekunden-Video aus dem neuesten Social-Bild erzeugen?`
    );

    if (!confirmed) return;

    try {
      setIsGenerating(true);
      setActiveDuration(durationSeconds);

      const response = await fetch(`/api/admin/social/${postId}/generate-video`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          durationSeconds,
        }),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok) {
        throw new Error(
          result?.message || "Video konnte nicht erzeugt werden."
        );
      }

      alert(result.message || "Animiertes Video wurde erzeugt.");
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unbekannter Fehler beim Erzeugen des Videos.";

      alert(message);
    } finally {
      setIsGenerating(false);
      setActiveDuration(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {DURATION_OPTIONS.map((option) => {
          const isActive = activeDuration === option.value;

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => handleGenerateVideo(option.value)}
              disabled={disabled || isGenerating}
              title={disabled ? disabledReason : undefined}
              className={`inline-flex flex-col items-center justify-center gap-0.5 rounded-2xl px-4 py-3 text-sm font-black shadow-sm transition ${
                disabled || isGenerating
                  ? "cursor-not-allowed bg-slate-200 text-slate-500"
                  : option.value === 30
                    ? "bg-[#102A43] text-white hover:brightness-110"
                    : "border border-[#E7D8C3] bg-white text-[#A23A2E] hover:bg-[#F5E8D8]"
              }`}
            >
              <span className="inline-flex items-center gap-2">
                <Video className="h-4 w-4" />
                {isGenerating && isActive
                  ? "läuft ..."
                  : option.label}
              </span>

              <span className="text-[11px] font-bold opacity-80">
                {option.description}
              </span>
            </button>
          );
        })}
      </div>

      <p className="text-xs font-semibold leading-5 text-[#627D98]">
        30 Sekunden ist die bessere Grundlage, wenn später längere Musik oder Reel-Audio genutzt werden soll.
      </p>
    </div>
  );
}
