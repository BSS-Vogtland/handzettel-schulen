"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";

type AdminRegenerateProductKeywordsButtonProps = {
  productId: string;
  productName: string;
};

type RegenerateResponse = {
  ok?: boolean;
  message?: string;
  aliases?: string[];
  matchKeywords?: string[];
  aliasCount?: number;
  matchKeywordCount?: number;
};

export default function AdminRegenerateProductKeywordsButton({
  productId,
  productName,
}: AdminRegenerateProductKeywordsButtonProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleRegenerate() {
    if (isRunning) return;

    const confirmed = window.confirm(
      `Keywords/Suchbegriffe für dieses Produkt neu erzeugen?\n\n${productName}\n\nVorhandene Aliase werden dabei neu aufgebaut.`
    );

    if (!confirmed) return;

    setIsRunning(true);
    setMessage(null);

    try {
      const response = await fetch(
        `/api/admin/products/${encodeURIComponent(
          productId
        )}/regenerate-keywords`,
        {
          method: "POST",
          cache: "no-store",
        }
      );

      const rawText = await response.text();

      let payload: RegenerateResponse | null = null;

      try {
        payload = rawText ? JSON.parse(rawText) : null;
      } catch {
        throw new Error(
          "Die Keyword-Route hat keine JSON-Antwort geliefert. Bitte Terminal/Vercel-Logs prüfen."
        );
      }

      if (!response.ok || !payload?.ok) {
        throw new Error(
          payload?.message || "Keywords konnten nicht erzeugt werden."
        );
      }

      const aliases = Array.isArray(payload.aliases) ? payload.aliases : [];

      const successMessage =
        payload.message ||
        `Keywords wurden erzeugt. Aliase: ${
          payload.aliasCount ?? aliases.length
        }, Match-Keywords: ${payload.matchKeywordCount ?? 0}.`;

      window.dispatchEvent(
        new CustomEvent("product-keywords-regenerated", {
          detail: {
            productId,
            aliases,
            message: successMessage,
            aliasCount: payload.aliasCount ?? aliases.length,
            matchKeywordCount: payload.matchKeywordCount ?? 0,
          },
        })
      );

      setMessage(successMessage);
      window.alert(successMessage);

      /*
        Wichtig:
        Kein router.refresh() hier.
        Der Refresh hat das gerade gefüllte Alias-Feld wieder mit den alten/leeren
        Server-Props überschrieben. Die API speichert die Aliase bereits in der DB,
        das offene Formular bekommt sie direkt per Browser-Event.
      */
    } catch (error) {
      const errorText =
        error instanceof Error
          ? error.message
          : "Keywords konnten nicht erzeugt werden.";

      setMessage(errorText);
      window.alert(errorText);
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={handleRegenerate}
        disabled={isRunning}
        className="inline-flex w-full min-h-11 items-center justify-center gap-2 rounded-2xl border border-[#D6E7EF] bg-[#EEF4FA] px-4 py-3 text-sm font-black text-[#12395F] transition hover:bg-[#DDECF5] disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isRunning ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Keywords werden erzeugt …
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" />
            Keywords erzeugen
          </>
        )}
      </button>

      {message ? (
        <p className="mt-2 rounded-2xl border border-[#D6E7EF] bg-white px-3 py-2 text-xs font-bold leading-5 text-[#12395F]">
          {message}
        </p>
      ) : null}
    </div>
  );
}