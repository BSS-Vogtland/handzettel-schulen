"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useState } from "react";

type DeleteResponse = {
  ok?: boolean;
  message?: string;
};

type AdminDeleteRequestItemButtonProps = {
  requestId: string;
  requestItemId: string;
  itemLabel: string;
};

export default function AdminDeleteRequestItemButton({
  requestId,
  requestItemId,
  itemLabel,
}: AdminDeleteRequestItemButtonProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleDelete() {
    if (isDeleting) return;

    const confirmed = window.confirm(
      `Soll die manuell angelegte Listenposition „${itemLabel}“ wirklich gelöscht werden?`
    );

    if (!confirmed) return;

    setIsDeleting(true);
    setErrorMessage(null);

    try {
      const response = await fetch(
        `/api/admin/requests/${encodeURIComponent(
          requestId
        )}/items/${encodeURIComponent(requestItemId)}`,
        {
          method: "DELETE",
        }
      );

      const payload = (await response.json().catch(() => null)) as
        | DeleteResponse
        | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(
          payload?.message || "Die Listenposition konnte nicht gelöscht werden."
        );
      }

      const url = new URL(window.location.href);
      url.searchParams.set("refresh", Date.now().toString());
      url.hash = "";
      window.location.href = url.toString();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Die Listenposition konnte nicht gelöscht werden."
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
        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl border border-[#F0C7C7] bg-white px-4 py-2 text-xs font-black text-[#B5282D] transition hover:bg-[#FFF5F5] disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isDeleting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Trash2 className="h-4 w-4" />
        )}
        Listenposition löschen
      </button>

      {errorMessage ? (
        <p className="mt-2 rounded-2xl border border-[#F0C7C7] bg-[#FFF5F5] px-3 py-2 text-xs font-bold text-[#B5282D]">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}