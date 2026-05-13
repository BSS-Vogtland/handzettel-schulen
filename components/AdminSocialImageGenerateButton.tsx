"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ImageIcon, Loader2 } from "lucide-react";

type ApiResponse = {
  ok?: boolean;
  message?: string;
};

export default function AdminSocialImageGenerateButton({
  postId,
  disabled,
}: {
  postId: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [isGenerating, setIsGenerating] = useState(false);

  async function handleGenerate() {
    if (isGenerating || disabled) return;

    const confirmed = window.confirm(
      "Soll jetzt ein neues Social-Bild über OpenAI erzeugt werden? Für Entwürfe nutzen wir bewusst eine günstige Low-Quality-Version."
    );

    if (!confirmed) return;

    setIsGenerating(true);

    try {
      const response = await fetch(
        `/api/admin/social/${postId}/generate-image`,
        {
          method: "POST",
        }
      );

      const json = (await response.json()) as ApiResponse;

      if (!response.ok || !json.ok) {
        window.alert(json.message || "Das Bild konnte nicht erzeugt werden.");
        return;
      }

      window.alert(json.message || "Bild wurde erzeugt.");
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unbekannter Fehler beim Erzeugen des Bildes.";

      window.alert(message);
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleGenerate}
      disabled={disabled || isGenerating}
      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#B5282D] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isGenerating ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <ImageIcon className="h-4 w-4" />
      )}
      {isGenerating ? "Bild wird erzeugt ..." : "Bild erzeugen"}
    </button>
  );
}