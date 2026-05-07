"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, X } from "lucide-react";

type CustomerRemoveOfferItemButtonProps = {
  token: string;
  itemId: string;
  productName: string;
};

type RemoveApiResponse = {
  ok?: boolean;
  message?: string;
};

async function readApiResponse(response: Response): Promise<RemoveApiResponse> {
  const text = await response.text();

  if (!text) {
    return {
      ok: false,
      message: "Der Server hat keine Antwort gesendet.",
    };
  }

  try {
    return JSON.parse(text) as RemoveApiResponse;
  } catch {
    return {
      ok: false,
      message:
        "Die Entfernen-Route hat keine JSON-Antwort geliefert. Prüfe bitte zusätzlich das Terminal.",
    };
  }
}

export default function CustomerRemoveOfferItemButton({
  token,
  itemId,
  productName,
}: CustomerRemoveOfferItemButtonProps) {
  const router = useRouter();

  const [isRemoving, setIsRemoving] = useState(false);
  const [feedback, setFeedback] = useState("");

  async function handleRemove() {
    if (isRemoving) return;

    const confirmed = window.confirm(
      `Möchtest Du „${productName}“ wirklich aus Deinem Paket entfernen?`
    );

    if (!confirmed) return;

    try {
      setIsRemoving(true);
      setFeedback("Produkt wird aus dem Paket entfernt ...");

      const response = await fetch(`/api/offer/${token}/items/${itemId}`, {
        method: "DELETE",
      });

      const result = await readApiResponse(response);

      if (!response.ok || !result.ok) {
        throw new Error(
          result.message ||
            `Produkt konnte nicht entfernt werden. Status: ${response.status}`
        );
      }

      setFeedback(result.message || "Produkt wurde aus dem Paket entfernt.");
      router.refresh();
    } catch (error) {
      console.error(error);
      setFeedback(
        error instanceof Error
          ? error.message
          : "Produkt konnte nicht entfernt werden."
      );
    } finally {
      setIsRemoving(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleRemove}
        disabled={isRemoving}
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-[#E8DED2] bg-white px-4 py-3 text-sm font-black text-[#52616F] shadow-sm transition hover:-translate-y-0.5 hover:border-[#B5282D] hover:text-[#B5282D] disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isRemoving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <X className="h-4 w-4" />
        )}

        {isRemoving ? "Wird entfernt ..." : "Aus Paket entfernen"}
      </button>

      {feedback ? (
        <div
          className={`rounded-2xl px-4 py-3 text-xs font-bold leading-5 ring-1 ${
            feedback.includes("entfernt")
              ? "bg-[#FFF8EE] text-[#A75B28] ring-[#F1D1A8]"
              : feedback.includes("wird")
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