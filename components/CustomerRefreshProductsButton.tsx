"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RefreshCw, Search } from "lucide-react";

type CustomerRefreshProductsButtonProps = {
  token: string;
  disabled?: boolean;
};

export default function CustomerRefreshProductsButton({
  token,
  disabled = false,
}: CustomerRefreshProductsButtonProps) {
  const router = useRouter();
  const [isRunning, setIsRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleRefreshProducts() {
    setMessage(null);
    setErrorMessage(null);

    if (!token) {
      setErrorMessage("Der persönliche Angebotslink ist ungültig.");
      return;
    }

    setIsRunning(true);

    try {
      const response = await fetch(`/api/offer/${token}/refresh-products`, {
        method: "POST",
        cache: "no-store",
      });

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok) {
        throw new Error(
          result?.message ||
            result?.error ||
            "Neue Produkte konnten nicht gesucht werden."
        );
      }

      setMessage(
        result?.message ||
          "Die Produktsuche wurde aktualisiert. Dein Paket wurde geprüft."
      );

      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Neue Produkte konnten nicht gesucht werden."
      );
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="rounded-[28px] border border-[#D6E7EF] bg-[#F5FAFD] p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-[#12395F]">
          <Search className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#12395F]">
            Neue Produkte suchen
          </p>

          <p className="mt-1 text-sm font-semibold leading-6 text-[#52616F]">
            Wir prüfen Deine erkannte Liste noch einmal mit dem aktuellen
            Produktbestand. Wenn neue sichere Treffer gefunden werden, werden
            sie automatisch ergänzt.
          </p>

          <button
            type="button"
            onClick={handleRefreshProducts}
            disabled={disabled || isRunning}
            className="mt-4 inline-flex w-full min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#12395F] px-4 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isRunning ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            {isRunning ? "Sucht..." : "Neue Produkte suchen"}
          </button>

          {message ? (
            <p className="mt-3 rounded-2xl border border-[#BFE3CD] bg-[#F0FFF6] px-3 py-2 text-xs font-bold leading-5 text-[#2F7D50]">
              {message}
            </p>
          ) : null}

          {errorMessage ? (
            <p className="mt-3 rounded-2xl border border-[#F1B5B5] bg-[#FFF5F5] px-3 py-2 text-xs font-bold leading-5 text-[#9F1D1D]">
              {errorMessage}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}