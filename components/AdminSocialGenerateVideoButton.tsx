"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Video } from "lucide-react";

type AdminSocialGenerateVideoButtonProps = {
  postId: string;
  disabled?: boolean;
  disabledReason?: string;
};

export default function AdminSocialGenerateVideoButton({
  postId,
  disabled = false,
  disabledReason,
}: AdminSocialGenerateVideoButtonProps) {
  const router = useRouter();
  const [isGenerating, setIsGenerating] = useState(false);

  async function handleGenerateVideo() {
    if (disabled) {
      if (disabledReason) {
        alert(disabledReason);
      }

      return;
    }

    const confirmed = window.confirm(
      "Animiertes Video aus dem neuesten Social-Bild erzeugen?"
    );

    if (!confirmed) return;

    try {
      setIsGenerating(true);

      const response = await fetch(`/api/admin/social/${postId}/generate-video`, {
        method: "POST",
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
    }
  }

  return (
    <button
      type="button"
      onClick={handleGenerateVideo}
      disabled={disabled || isGenerating}
      title={disabled ? disabledReason : undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-black shadow-sm transition ${
        disabled || isGenerating
          ? "cursor-not-allowed bg-slate-200 text-slate-500"
          : "bg-[#102A43] text-white hover:brightness-110"
      }`}
    >
      <Video className="h-4 w-4" />
      {isGenerating ? "Video wird erzeugt ..." : "Animiertes Video erzeugen"}
    </button>
  );
}
