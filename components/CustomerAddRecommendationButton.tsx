"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, Loader2, PlusCircle } from "lucide-react";

type CustomerAddRecommendationButtonProps = {
  token: string;
  recommendationId: string;
  productName: string;
  disabled?: boolean;
  onAdded?: () => void;
};

type AddResponse = {
  ok?: boolean;
  message?: string;
};

async function readJsonSafely(response: Response): Promise<AddResponse | null> {
  const rawText = await response.text();

  try {
    return rawText ? (JSON.parse(rawText) as AddResponse) : null;
  } catch {
    return null;
  }
}

export default function CustomerAddRecommendationButton({
  token,
  recommendationId,
  productName,
  disabled = false,
  onAdded,
}: CustomerAddRecommendationButtonProps) {
  const router = useRouter();

  const [isAdding, setIsAdding] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function handleAdd() {
    if (isAdding || disabled) return;

    setIsAdding(true);
    setFeedback(null);

    try {
      const response = await fetch(
        `/api/offer/${encodeURIComponent(
          token
        )}/recommendations/${encodeURIComponent(recommendationId)}/add`,
        {
          method: "POST",
          cache: "no-store",
        }
      );

      const payload = await readJsonSafely(response);

      if (!response.ok || !payload?.ok) {
        throw new Error(
          payload?.message || "Die Empfehlung konnte nicht übernommen werden."
        );
      }

      setFeedback(payload.message || `${productName} wurde zum Paket hinzugefügt.`);
      onAdded?.();
      router.refresh();
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "Die Empfehlung konnte nicht übernommen werden."
      );
    } finally {
      setIsAdding(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleAdd}
        disabled={isAdding || disabled}
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-[#12395F] px-4 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isAdding ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Wird hinzugefügt …
          </>
        ) : (
          <>
            <PlusCircle className="h-4 w-4" />
            Zum Paket hinzufügen
          </>
        )}
      </button>

      {feedback ? (
        <p
          className={`rounded-2xl px-3 py-2 text-xs font-bold leading-5 ${
            feedback.includes("hinzugefügt")
              ? "bg-[#F0FFF6] text-[#2F7D50]"
              : "bg-[#FFF5F5] text-[#B5282D]"
          }`}
        >
          {feedback}
        </p>
      ) : null}
    </div>
  );
}