"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";

type ApiResponse = {
  ok?: boolean;
  message?: string;
};

export default function AdminSocialAdDeleteButton({
  campaignId,
  campaignName,
  disabled,
}: {
  campaignId: string;
  campaignName: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    if (isDeleting || disabled) return;

    const confirmed = window.confirm(
      `Soll die Kampagne "${campaignName}" wirklich gelöscht werden?\n\nDer Kampagnenentwurf und vorhandene Freigabeprotokolle zu dieser Kampagne werden entfernt.`
    );

    if (!confirmed) return;

    const secondConfirmed = window.confirm(
      "Bitte nochmal bestätigen: Diese Aktion kann nicht rückgängig gemacht werden."
    );

    if (!secondConfirmed) return;

    setIsDeleting(true);

    try {
      const response = await fetch(`/api/admin/social/ads/${campaignId}`, {
        method: "DELETE",
      });

      const json = (await response.json()) as ApiResponse;

      if (!response.ok || !json.ok) {
        window.alert(json.message || "Die Kampagne konnte nicht gelöscht werden.");
        return;
      }

      window.alert(json.message || "Kampagne wurde gelöscht.");
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unbekannter Fehler beim Löschen der Kampagne.";

      window.alert(message);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={disabled || isDeleting}
      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-black text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isDeleting ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Trash2 className="h-4 w-4" />
      )}
      {isDeleting ? "Löschen ..." : "Kampagne löschen"}
    </button>
  );
}