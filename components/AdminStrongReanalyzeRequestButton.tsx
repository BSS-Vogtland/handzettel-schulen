"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Sparkles } from "lucide-react";

type AdminStrongReanalyzeRequestButtonProps = {
  requestId: string;
};

type AnalyzeResponse = {
  ok?: boolean;
  itemCount?: number;
  message?: string;
  error?: string;
};

type MatchResponse = {
  ok?: boolean;
  matchCount?: number;
  message?: string;
  error?: string;
};

export default function AdminStrongReanalyzeRequestButton({
  requestId,
}: AdminStrongReanalyzeRequestButtonProps) {
  const router = useRouter();

  const [isRunning, setIsRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [variant, setVariant] = useState<"success" | "error" | null>(null);

  async function handleStrongReanalyze() {
    const confirmed = window.confirm(
      "Mit stärkerer KI neu auslesen?\n\nDiese Analyse ist für schwierige oder unvollständig erkannte Listen gedacht. Bestehende automatisch erkannte Listenpositionen und automatische Vorschläge werden neu aufgebaut. Manuelle Produktzuordnungen können dabei beeinflusst werden.\n\nFortfahren?"
    );

    if (!confirmed) return;

    setIsRunning(true);
    setMessage(null);
    setVariant(null);

    try {
      const analyzeResponse = await fetch(
        `/api/admin/requests/${requestId}/analyze`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            analyzeMode: "strong",
          }),
        }
      );

      const analyzeResult = (await analyzeResponse.json().catch(() => null)) as
        | AnalyzeResponse
        | null;

      if (!analyzeResponse.ok || !analyzeResult?.ok) {
        throw new Error(
          analyzeResult?.message ||
            analyzeResult?.error ||
            "Die starke Neuanalyse ist fehlgeschlagen."
        );
      }

      const matchResponse = await fetch(`/api/admin/requests/${requestId}/match`, {
        method: "POST",
      });

      const matchResult = (await matchResponse.json().catch(() => null)) as
        | MatchResponse
        | null;

      if (!matchResponse.ok || !matchResult?.ok) {
        throw new Error(
          matchResult?.message ||
            matchResult?.error ||
            "Die starke Neuanalyse war erfolgreich, aber das Matching ist fehlgeschlagen."
        );
      }

      setVariant("success");
      setMessage(
        `Starke Neuanalyse abgeschlossen. Erkannte Positionen: ${
          analyzeResult.itemCount ?? 0
        }, Produktvorschläge: ${matchResult.matchCount ?? 0}.`
      );

      window.setTimeout(() => {
        router.refresh();
      }, 900);
    } catch (error) {
      setVariant("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Die starke Neuanalyse konnte nicht abgeschlossen werden."
      );
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={handleStrongReanalyze}
        disabled={isRunning}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-[#8A3FB0] bg-[#FBF4FF] px-4 py-3 text-sm font-black text-[#6F2C91] shadow-sm transition hover:bg-[#F2E4FA] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isRunning ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Sparkles className="h-4 w-4" />
        )}
        {isRunning ? "Starke KI liest neu aus ..." : "Mit stärkerer KI neu auslesen"}
      </button>

      <p className="max-w-sm text-xs font-semibold leading-5 text-[#52616F]">
        Für schwierige Fotos, Tabellen, fehlende Artikel oder falsch erkannte
        Größen wie klein/groß, A3/A4/A5 und Lineatur.
      </p>

      {message ? (
        <p
          className={`rounded-2xl border px-4 py-3 text-xs font-bold leading-5 ${
            variant === "success"
              ? "border-[#BFE3CD] bg-[#F0FFF6] text-[#2F7D50]"
              : "border-[#F2B8B8] bg-[#FFF1F1] text-[#B5282D]"
          }`}
        >
          {variant === "error" ? (
            <span className="inline-flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{message}</span>
            </span>
          ) : (
            message
          )}
        </p>
      ) : null}
    </div>
  );
}
