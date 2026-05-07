"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, Loader2, ShoppingBasket } from "lucide-react";

type CustomerSelectProductButtonProps = {
  token: string;
  matchId: string;
  alreadySelected?: boolean;
  disabled?: boolean;
};

type SelectApiResponse = {
  ok?: boolean;
  message?: string;
};

async function readApiResponse(response: Response): Promise<SelectApiResponse> {
  const text = await response.text();

  if (!text) {
    return {
      ok: false,
      message: "Der Server hat keine Antwort gesendet.",
    };
  }

  try {
    return JSON.parse(text) as SelectApiResponse;
  } catch {
    return {
      ok: false,
      message:
        "Die Auswahl-Route hat keine JSON-Antwort geliefert. Prüfe bitte zusätzlich das Terminal.",
    };
  }
}

export default function CustomerSelectProductButton({
  token,
  matchId,
  alreadySelected,
  disabled,
}: CustomerSelectProductButtonProps) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState("");

  async function handleSelect() {
    if (alreadySelected) {
      setFeedback("Dieses Produkt liegt bereits in Deinem Paket.");
      return;
    }

    try {
      setIsSaving(true);
      setFeedback("Produkt wird in Dein Paket gelegt ...");

      const response = await fetch(`/api/offer/${token}/items/from-match`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          matchId,
        }),
      });

      const result = await readApiResponse(response);

      if (!response.ok || !result.ok) {
        throw new Error(
          result.message ||
            `Produkt konnte nicht übernommen werden. Status: ${response.status}`
        );
      }

      setFeedback(result.message || "Produkt wurde in Dein Paket gelegt.");
      router.refresh();
    } catch (error) {
      console.error(error);
      setFeedback(
        error instanceof Error
          ? error.message
          : "Produkt konnte nicht übernommen werden."
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleSelect}
        disabled={isSaving || disabled}
        className={`inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black shadow-sm transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70 ${
          alreadySelected
            ? "bg-[#EAF7EE] text-[#2F7D50] ring-1 ring-[#CDE8D4]"
            : "bg-[#12395F] text-white hover:bg-[#0D2D4C]"
        }`}
      >
        {isSaving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : alreadySelected ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : (
          <ShoppingBasket className="h-4 w-4" />
        )}

        {isSaving
          ? "Wird übernommen ..."
          : alreadySelected
          ? "Liegt im Paket"
          : "In Paket übernehmen"}
      </button>

      {feedback ? (
        <div
          className={`rounded-2xl px-4 py-3 text-xs font-bold leading-5 ring-1 ${
            feedback.includes("Paket") || feedback.includes("übernommen")
              ? "bg-[#EAF7EE] text-[#2F7D50] ring-[#CDE8D4]"
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