"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Brain, RefreshCw } from "lucide-react";

type AdminReanalyzeRequestButtonProps = {
  requestId: string;
  itemCount: number;
  offerItemsCount: number;
};

export default function AdminReanalyzeRequestButton({
  requestId,
  itemCount,
  offerItemsCount,
}: AdminReanalyzeRequestButtonProps) {
  const router = useRouter();
  const [isRunning, setIsRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleReanalyze() {
    setMessage(null);
    setErrorMessage(null);

    if (!requestId) {
      setErrorMessage("Keine Anfrage-ID vorhanden.");
      return;
    }

    const warningLines = [
      "Materialliste erneut analysieren?",
      "",
      "Dabei läuft die KI/OCR-Auswertung erneut über die hochgeladene Datei.",
      "Die erkannten Listenpositionen und Produktvorschläge werden neu aufgebaut.",
      "",
      "Das ist sinnvoll, wenn vorher fast nichts oder falsch erkannt wurde.",
    ];

    if (itemCount > 0) {
      warningLines.push(
        "",
        `Aktuell sind bereits ${itemCount} erkannte Positionen vorhanden. Diese können durch die neue Analyse ersetzt werden.`
      );
    }

    if (offerItemsCount > 0) {
      warningLines.push(
        "",
        `Achtung: Es gibt bereits ${offerItemsCount} Paketpositionen. Bitte danach prüfen, ob alles noch sauber passt.`
      );
    }

    const confirmed = window.confirm(warningLines.join("\n"));

    if (!confirmed) {
      return;
    }

    setIsRunning(true);

    try {
      const analyzeResponse = await fetch(
        `/api/admin/requests/${requestId}/analyze`,
        {
          method: "POST",
          cache: "no-store",
        }
      );

      const analyzeResult = await analyzeResponse.json().catch(() => null);

      if (!analyzeResponse.ok || !analyzeResult?.ok) {
        throw new Error(
          analyzeResult?.message ||
            analyzeResult?.error ||
            "Die Materialliste konnte nicht erneut analysiert werden."
        );
      }

      const nextItemCount =
        typeof analyzeResult.itemCount === "number"
          ? analyzeResult.itemCount
          : 0;

      if (nextItemCount <= 0) {
        setMessage(
          "Die Materialliste wurde erneut analysiert, aber es wurden weiterhin keine eindeutigen Positionen erkannt. Bitte manuell prüfen."
        );

        router.refresh();
        return;
      }

      const matchResponse = await fetch(`/api/admin/requests/${requestId}/match`, {
        method: "POST",
        cache: "no-store",
      });

      const matchResult = await matchResponse.json().catch(() => null);

      if (!matchResponse.ok || !matchResult?.ok) {
        throw new Error(
          matchResult?.message ||
            matchResult?.error ||
            "Die Materialliste wurde analysiert, aber die Produktvorschläge konnten nicht neu berechnet werden."
        );
      }

      setMessage(
        `Materialliste wurde erneut analysiert. ${nextItemCount} Positionen wurden erkannt und die Produktvorschläge wurden neu berechnet.`
      );

      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Die Materialliste konnte nicht erneut analysiert werden."
      );
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleReanalyze}
        disabled={isRunning}
        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#A75B28] px-4 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isRunning ? (
          <RefreshCw className="h-4 w-4 animate-spin" />
        ) : (
          <Brain className="h-4 w-4" />
        )}
        {isRunning ? "Analysiert..." : "Liste erneut analysieren"}
      </button>

      {itemCount <= 0 ? (
        <p className="rounded-2xl border border-[#F1D1A8] bg-[#FFF8EE] px-3 py-2 text-xs font-bold leading-5 text-[#A75B28]">
          Geeignet, wenn vorher keine Positionen erkannt wurden.
        </p>
      ) : null}

      {message ? (
        <p className="rounded-2xl border border-[#BFE3CD] bg-[#F0FFF6] px-3 py-2 text-xs font-bold leading-5 text-[#2F7D50]">
          {message}
        </p>
      ) : null}

      {errorMessage ? (
        <p className="rounded-2xl border border-[#F1B5B5] bg-[#FFF5F5] px-3 py-2 text-xs font-bold leading-5 text-[#9F1D1D]">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}