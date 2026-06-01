"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";

type ApiResponse = {
  ok?: boolean;
  message?: string;
};

export default function AdminSocialMarkPublishedButton({
  postId,
  disabled,
}: {
  postId: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);

  async function handleMarkPublished() {
    if (isSaving || disabled) return;

    const confirmed = window.confirm(
      "Soll dieser Beitrag als veröffentlicht markiert werden? Dadurch wird der Status auf „Veröffentlicht“ gesetzt und ein Veröffentlichungsdatum gespeichert."
    );

    if (!confirmed) return;

    setIsSaving(true);

    try {
      const response = await fetch(
        `/api/admin/social/${postId}/mark-published`,
        {
          method: "POST",
        }
      );

      const json = (await response.json()) as ApiResponse;

      if (!response.ok || !json.ok) {
        window.alert(
          json.message || "Der Beitrag konnte nicht als veröffentlicht markiert werden."
        );
        return;
      }

      window.alert(json.message || "Beitrag wurde als veröffentlicht markiert.");
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unbekannter Fehler beim Markieren als veröffentlicht.";

      window.alert(message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleMarkPublished}
      disabled={disabled || isSaving}
      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
    >
      {isSaving ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <CheckCircle2 className="h-4 w-4" />
      )}
      {isSaving ? "Wird gespeichert ..." : "Als veröffentlicht markieren"}
    </button>
  );
}