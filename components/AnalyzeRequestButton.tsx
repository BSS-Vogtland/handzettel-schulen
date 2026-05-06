"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Bot, Loader2 } from "lucide-react";

type AnalyzeRequestButtonProps = {
  requestId: string;
};

type AnalyzeApiResponse = {
  ok?: boolean;
  message?: string;
  itemCount?: number;
};

async function readApiResponse(response: Response): Promise<AnalyzeApiResponse> {
  const text = await response.text();

  if (!text) {
    return {
      ok: false,
      message: "Der Server hat keine Antwort gesendet.",
    };
  }

  try {
    return JSON.parse(text) as AnalyzeApiResponse;
  } catch {
    return {
      ok: false,
      message:
        "Die Analyse-Route hat keine JSON-Antwort geliefert. Wahrscheinlich gibt es einen Fehler in der API-Route oder der Pfad wurde nicht gefunden. Prüfe bitte zusätzlich das Terminal.",
    };
  }
}

export default function AnalyzeRequestButton({
  requestId,
}: AnalyzeRequestButtonProps) {
  const router = useRouter();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [feedback, setFeedback] = useState("");

  async function handleAnalyze() {
    try {
      setIsAnalyzing(true);
      setFeedback("Die Materialliste wird analysiert ...");

      const response = await fetch(`/api/admin/requests/${requestId}/analyze`, {
        method: "POST",
      });

      const result = await readApiResponse(response);

      if (!response.ok || !result.ok) {
        throw new Error(
          result.message ||
            `Die Analyse ist fehlgeschlagen. Status: ${response.status}`
        );
      }

      setFeedback(
        `Analyse abgeschlossen. Erkannte Positionen: ${result.itemCount ?? 0}`
      );

      router.refresh();
    } catch (error) {
      console.error(error);
      setFeedback(
        error instanceof Error
          ? error.message
          : "Die Analyse ist fehlgeschlagen."
      );
    } finally {
      setIsAnalyzing(false);
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={handleAnalyze}
        disabled={isAnalyzing}
        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#12395F] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#0D2D4C] disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isAnalyzing ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Bot className="h-4 w-4" />
        )}
        {isAnalyzing ? "Analyse läuft ..." : "Liste analysieren"}
      </button>

      {feedback ? (
        <div
          className={`rounded-2xl px-4 py-3 text-xs font-bold leading-5 ring-1 ${
            feedback.includes("abgeschlossen")
              ? "bg-[#EAF7EE] text-[#2F7D50] ring-[#CDE8D4]"
              : feedback.includes("analysiert")
              ? "bg-[#EAF2FA] text-[#12395F] ring-[#CCDDEA]"
              : "bg-[#FFF1F1] text-[#B5282D] ring-[#F3C6C8]"
          }`}
        >
          {feedback}
        </div>
      ) : null}
    </div>
  );
}