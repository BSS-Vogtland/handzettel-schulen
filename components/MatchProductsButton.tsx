"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";

type MatchProductsButtonProps = {
  requestId: string;
};

type MatchApiResponse = {
  ok?: boolean;
  message?: string;
  itemCount?: number;
  matchCount?: number;
};

async function readApiResponse(response: Response): Promise<MatchApiResponse> {
  const text = await response.text();

  if (!text) {
    return {
      ok: false,
      message: "Der Server hat keine Antwort gesendet.",
    };
  }

  try {
    return JSON.parse(text) as MatchApiResponse;
  } catch {
    return {
      ok: false,
      message:
        "Die Matching-Route hat keine JSON-Antwort geliefert. Prüfe bitte zusätzlich das Terminal.",
    };
  }
}

export default function MatchProductsButton({
  requestId,
}: MatchProductsButtonProps) {
  const router = useRouter();
  const [isMatching, setIsMatching] = useState(false);
  const [feedback, setFeedback] = useState("");

  async function handleMatch() {
    try {
      setIsMatching(true);
      setFeedback("Produktvorschläge werden erstellt ...");

      const response = await fetch(`/api/admin/requests/${requestId}/match`, {
        method: "POST",
      });

      const result = await readApiResponse(response);

      if (!response.ok || !result.ok) {
        throw new Error(
          result.message ||
            `Produktmatching ist fehlgeschlagen. Status: ${response.status}`
        );
      }

      setFeedback(
        `Produktmatching abgeschlossen. Vorschläge: ${
          result.matchCount ?? 0
        }`
      );

      router.refresh();
    } catch (error) {
      console.error(error);
      setFeedback(
        error instanceof Error
          ? error.message
          : "Produktmatching ist fehlgeschlagen."
      );
    } finally {
      setIsMatching(false);
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={handleMatch}
        disabled={isMatching}
        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#B5282D] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#9E1F25] disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isMatching ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Sparkles className="h-4 w-4" />
        )}
        {isMatching ? "Matching läuft ..." : "Produkte vorschlagen"}
      </button>

      {feedback ? (
        <div
          className={`rounded-2xl px-4 py-3 text-xs font-bold leading-5 ring-1 ${
            feedback.includes("abgeschlossen")
              ? "bg-[#EAF7EE] text-[#2F7D50] ring-[#CDE8D4]"
              : feedback.includes("werden erstellt")
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