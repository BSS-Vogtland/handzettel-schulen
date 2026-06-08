"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

type AdminResolveQuestionButtonProps = {
  requestId: string;
  questionId: string;
};

type ApiResponse = {
  ok?: boolean;
  message?: string;
};

export default function AdminResolveQuestionButton({
  requestId,
  questionId,
}: AdminResolveQuestionButtonProps) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleResolve() {
    if (isSaving) return;

    setErrorMessage(null);

    const confirmed = window.confirm(
      "Diese Rückfrage als erledigt markieren?"
    );

    if (!confirmed) return;

    setIsSaving(true);

    try {
      const response = await fetch(
        `/api/admin/requests/${requestId}/questions/${questionId}/resolve`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          cache: "no-store",
          body: JSON.stringify({
            status: "resolved",
          }),
        }
      );

      const rawText = await response.text();

      let payload: ApiResponse | null = null;

      try {
        payload = rawText ? JSON.parse(rawText) : null;
      } catch {
        throw new Error(
          "Die Rückfrage-Route hat keine JSON-Antwort geliefert."
        );
      }

      if (!response.ok || !payload?.ok) {
        throw new Error(
          payload?.message || "Die Rückfrage konnte nicht erledigt werden."
        );
      }

      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Die Rückfrage konnte nicht erledigt werden."
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex shrink-0 flex-col gap-2 sm:items-end">
      <button
        type="button"
        onClick={handleResolve}
        disabled={isSaving}
        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl bg-[#2F7D50] px-3 py-2 text-xs font-black text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSaving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <CheckCircle2 className="h-4 w-4" />
        )}
        Als erledigt markieren
      </button>

      {errorMessage ? (
        <p className="max-w-xs rounded-2xl border border-[#F1B5B5] bg-[#FFF5F5] px-3 py-2 text-xs font-bold text-[#9F1D1D]">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
