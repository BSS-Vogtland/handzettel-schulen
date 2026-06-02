"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, RefreshCw } from "lucide-react";

type AdminAdoptSafeMatchesButtonProps = {
  requestId: string;
  itemCount: number;
};

export default function AdminAdoptSafeMatchesButton({
  requestId,
  itemCount,
}: AdminAdoptSafeMatchesButtonProps) {
  const router = useRouter();
  const [isRunning, setIsRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleAdoptSafeMatches() {
    setMessage(null);
    setErrorMessage(null);

    if (!requestId) {
      setErrorMessage("Keine Anfrage-ID vorhanden.");
      return;
    }

    if (itemCount <= 0) {
      setErrorMessage(
        "Es sind keine erkannten Materialpositionen vorhanden. Bitte zuerst die Liste erneut analysieren."
      );
      return;
    }

    const confirmed = window.confirm(
      [
        "Sichere neue Treffer übernehmen?",
        "",
        "Es werden nur Produktvorschläge ab 85 % übernommen.",
        "Es werden nur erkannte Positionen berücksichtigt, die noch keine Paketposition haben.",
        "",
        "Bestehende manuelle oder bereits ausgewählte Paketpositionen werden nicht überschrieben.",
      ].join("\n")
    );

    if (!confirmed) {
      return;
    }

    setIsRunning(true);

    try {
      const response = await fetch(
        `/api/admin/requests/${requestId}/adopt-safe-matches`,
        {
          method: "POST",
          cache: "no-store",
        }
      );

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok) {
        throw new Error(
          result?.message ||
            result?.error ||
            "Sichere Treffer konnten nicht übernommen werden."
        );
      }

      setMessage(
        result?.message ||
          "Sichere Treffer wurden in den Paketwunsch übernommen."
      );

      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Sichere Treffer konnten nicht übernommen werden."
      );
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleAdoptSafeMatches}
        disabled={isRunning}
        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#2F7D50] px-4 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isRunning ? (
          <RefreshCw className="h-4 w-4 animate-spin" />
        ) : (
          <CheckCircle2 className="h-4 w-4" />
        )}
        {isRunning ? "Übernimmt..." : "Sichere Treffer übernehmen"}
      </button>

      <p className="rounded-2xl border border-[#BFE3CD] bg-[#F0FFF6] px-3 py-2 text-xs font-bold leading-5 text-[#2F7D50]">
        Übernimmt nur Treffer ab 85 %, wenn noch keine Paketposition vorhanden ist.
      </p>

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