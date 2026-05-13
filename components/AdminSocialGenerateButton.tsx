"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";

type ApiResponse = {
  ok?: boolean;
  message?: string;
};

export default function AdminSocialGenerateButton() {
  const [isLoading, setIsLoading] = useState(false);

  async function handleGenerate() {
    if (isLoading) return;

    const confirmed = window.confirm(
      "Sollen jetzt neue Social-Media-Entwürfe für Handzettel-Schulen.de erzeugt werden?"
    );

    if (!confirmed) return;

    setIsLoading(true);

    try {
      const response = await fetch("/api/admin/social/generate", {
        method: "POST",
      });

      const json = (await response.json()) as ApiResponse;

      if (!response.ok || !json.ok) {
        window.alert(
          json.message ||
            "Die Social-Beiträge konnten nicht erzeugt werden."
        );
        return;
      }

      window.alert(json.message || "Social-Beiträge wurden erzeugt.");
      window.location.reload();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unbekannter Fehler beim Erzeugen der Social-Beiträge.";

      window.alert(message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleGenerate}
      disabled={isLoading}
      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#A23A2E] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#8F3027] disabled:cursor-not-allowed disabled:opacity-70"
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Sparkles className="h-4 w-4" />
      )}
      {isLoading ? "KI erstellt Beiträge ..." : "Neue Social-Beiträge erzeugen"}
    </button>
  );
}