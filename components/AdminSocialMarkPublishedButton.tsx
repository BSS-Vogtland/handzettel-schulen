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
  disabledReason,
}: {
  postId: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);

  async function handleMarkPublished() {
    if (isSaving) return;

    if (disabled) {
      window.alert(disabledReason || "Diese Aktion ist aktuell gesperrt.");
      return;
    }

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
          json.message ||
            "Der Beitrag konnte nicht als veröffentlicht markiert werden."
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
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleMarkPublished}
        disabled={isSaving}
        className={`inline-flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-black shadow-sm transition disabled:cursor-not-allowed disabled:opacity-70 ${
          disabled
            ? "bg-slate-300 text-slate-700"
            : "bg-emerald-700 text-white hover:brightness-110"
        }`}
      >
        {isSaving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <CheckCircle2 className="h-4 w-4" />
        )}
        {isSaving ? "Wird gespeichert ..." : "Als veröffentlicht markieren"}
      </button>

      {disabled && disabledReason ? (
        <p className="text-xs font-bold leading-5 text-slate-700">
          {disabledReason}
        </p>
      ) : null}
    </div>
  );
}