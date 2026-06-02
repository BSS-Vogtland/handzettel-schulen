"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RefreshCw, Sparkles } from "lucide-react";

type AdminRematchRequestButtonProps = {
  requestId: string;
  itemCount: number;
};

export default function AdminRematchRequestButton({
  requestId,
  itemCount,
}: AdminRematchRequestButtonProps) {
  const router = useRouter();
  const [isRunning, setIsRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleRematch() {
    setMessage(null);
    setErrorMessage(null);

    if (!requestId) {
      setErrorMessage("Keine Anfrage-ID vorhanden.");
      return;
    }

    if (itemCount <= 0) {
      setErrorMessage(
        "Es sind noch keine Materialpositionen erkannt. Bitte zuerst die Liste analysieren."
      );
      return;
    }

    const confirmed = window.confirm(
      [
        "Produktvorschläge neu berechnen?",
        "",
        "Dabei werden die vorhandenen erkannten Listenpositionen behalten.",
        "Es werden nur die Produktvorschläge auf Basis des aktuellen Produktbestands neu berechnet.",
        "",
        "Bestehende Paketpositionen werden dadurch nicht absichtlich gelöscht.",
      ].join("\n")
    );

    if (!confirmed) {
      return;
    }

    setIsRunning(true);

    try {
      const response = await fetch(`/api/admin/requests/${requestId}/match`, {
        method: "POST",
        cache: "no-store",
      });

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok) {
        throw new Error(
          result?.message ||
            result?.error ||
            "Die Produktvorschläge konnten nicht neu berechnet werden."
        );
      }

      setMessage(
        result?.message ||
          "Die Produktvorschläge wurden auf Basis des aktuellen Produktbestands neu berechnet."
      );

      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Die Produktvorschläge konnten nicht neu berechnet werden."
      );
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleRematch}
        disabled={isRunning || itemCount <= 0}
        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#B5282D] px-4 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isRunning ? (
          <RefreshCw className="h-4 w-4 animate-spin" />
        ) : (
          <Sparkles className="h-4 w-4" />
        )}
        {isRunning ? "Berechnet..." : "Vorschläge neu berechnen"}
      </button>

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