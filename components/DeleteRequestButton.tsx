"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";

type DeleteRequestButtonProps = {
  requestId: string;
  requestLabel?: string | null;
};

type DeleteResponse = {
  ok?: boolean;
  message?: string;
};

export default function DeleteRequestButton({
  requestId,
  requestLabel,
}: DeleteRequestButtonProps) {
  const router = useRouter();

  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleDelete() {
    if (isDeleting) return;

    const confirmed = window.confirm(
      `Möchtest Du diese Anfrage wirklich löschen?\n\n${
        requestLabel || requestId
      }\n\nDabei werden auch verknüpfte Dateien, Positionen, Vorschläge und Paketpositionen entfernt.`
    );

    if (!confirmed) return;

    setIsDeleting(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/admin/requests/${requestId}`, {
        method: "DELETE",
      });

      const rawText = await response.text();

      let payload: DeleteResponse | null = null;

      try {
        payload = rawText ? JSON.parse(rawText) : null;
      } catch {
        throw new Error(
          "Die Lösch-Route hat keine JSON-Antwort geliefert. Prüfe bitte zusätzlich das Terminal."
        );
      }

      if (!response.ok || !payload?.ok) {
        throw new Error(
          payload?.message || "Die Anfrage konnte nicht gelöscht werden."
        );
      }

      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Die Anfrage konnte nicht gelöscht werden."
      );
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={handleDelete}
        disabled={isDeleting}
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-[#F0C7C7] bg-[#FFF5F5] px-4 py-3 text-sm font-black text-[#B5282D] shadow-sm transition hover:bg-[#FFECEC] disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isDeleting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Wird gelöscht …
          </>
        ) : (
          <>
            <Trash2 className="h-4 w-4" />
            Anfrage löschen
          </>
        )}
      </button>

      {errorMessage ? (
        <div className="mt-2 rounded-xl border border-[#F0C7C7] bg-[#FFF5F5] px-3 py-2 text-xs font-semibold text-[#B5282D]">
          {errorMessage}
        </div>
      ) : null}
    </div>
  );
}