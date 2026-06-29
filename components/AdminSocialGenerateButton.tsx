"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";

type ApiResponse = {
  ok?: boolean;
  message?: string;
};

const POST_COUNT_OPTIONS = [
  { value: 3, label: "3", hint: "Test" },
  { value: 5, label: "5", hint: "kurz" },
  { value: 8, label: "8", hint: "Standard" },
  { value: 14, label: "14", hint: "2 Wochen" },
];

export default function AdminSocialGenerateButton() {
  const [isLoading, setIsLoading] = useState(false);
  const [postCount, setPostCount] = useState(8);

  async function handleGenerate() {
    if (isLoading) return;

    const confirmed = window.confirm(
      `Sollen jetzt ${postCount} neue Social-Media-Entwürfe für Handzettel-Schulen.de erzeugt werden?`
    );

    if (!confirmed) return;

    setIsLoading(true);

    try {
      const response = await fetch("/api/admin/social/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          postCount,
        }),
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
    <div className="rounded-2xl border border-[#E7D8C3] bg-white p-3 shadow-sm">
      <div className="mb-2 grid grid-cols-4 gap-1.5">
        {POST_COUNT_OPTIONS.map((option) => {
          const isActive = postCount === option.value;

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setPostCount(option.value)}
              disabled={isLoading}
              className={`rounded-xl border px-2 py-1.5 text-center transition disabled:cursor-not-allowed disabled:opacity-60 ${
                isActive
                  ? "border-[#A23A2E] bg-[#A23A2E] text-white"
                  : "border-[#E7D8C3] bg-[#FFFCF7] text-[#102A43] hover:bg-[#F5E8D8]"
              }`}
              title={`${option.value} Beiträge erzeugen`}
            >
              <span className="block text-sm font-black leading-4">
                {option.label}
              </span>
              <span className="block text-[10px] font-bold leading-4 opacity-80">
                {option.hint}
              </span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={handleGenerate}
        disabled={isLoading}
        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#A23A2E] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#8F3027] disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Sparkles className="h-4 w-4" />
        )}
        {isLoading
          ? `${postCount} Beiträge werden erstellt ...`
          : `${postCount} Social-Beiträge erzeugen`}
      </button>
    </div>
  );
}
