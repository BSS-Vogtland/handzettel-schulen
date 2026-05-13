"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";

type ApiResponse = {
  ok?: boolean;
  message?: string;
};

export default function AdminSocialAssetDeleteButton({
  assetId,
}: {
  assetId: string;
}) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    if (isDeleting) return;

    const confirmed = window.confirm(
      "Soll dieses Bild wirklich gelöscht werden? Das Bild wird aus Supabase Storage und aus der Social-Asset-Liste entfernt."
    );

    if (!confirmed) return;

    setIsDeleting(true);

    try {
      const response = await fetch(`/api/admin/social/assets/${assetId}`, {
        method: "DELETE",
      });

      const json = (await response.json()) as ApiResponse;

      if (!response.ok || !json.ok) {
        window.alert(json.message || "Das Bild konnte nicht gelöscht werden.");
        return;
      }

      window.alert(json.message || "Bild wurde gelöscht.");
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unbekannter Fehler beim Löschen des Bildes.";

      window.alert(message);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={isDeleting}
      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-black text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isDeleting ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Trash2 className="h-4 w-4" />
      )}
      {isDeleting ? "Löschen ..." : "Bild löschen"}
    </button>
  );
}