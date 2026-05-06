"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";

type AdminDeleteOfferItemButtonProps = {
  requestId: string;
  itemId: string;
  productName: string;
};

type DeleteResponse = {
  ok?: boolean;
  message?: string;
};

export default function AdminDeleteOfferItemButton({
  requestId,
  itemId,
  productName,
}: AdminDeleteOfferItemButtonProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleDelete() {
    if (isDeleting) return;

    const confirmed = window.confirm(
      `Möchtest Du diese Paketposition wirklich löschen?\n\n${productName}`
    );

    if (!confirmed) return;

    setIsDeleting(true);
    setErrorMessage(null);

    try {
      const response = await fetch(
        `/api/admin/requests/${requestId}/offer-items/${itemId}`,
        {
          method: "DELETE",
        }
      );

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
          payload?.message || "Die Paketposition konnte nicht gelöscht werden."
        );
      }

      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Die Paketposition konnte nicht gelöscht werden."
      );
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={handleDelete}
        disabled={isDeleting}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#FFF5F5] px-3 py-2 text-xs font-black text-[#B5282D] transition hover:bg-[#FFECEC] disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isDeleting ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Wird gelöscht …
          </>
        ) : (
          <>
            <Trash2 className="h-3.5 w-3.5" />
            Position löschen
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