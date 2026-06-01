"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Loader2, Trash2 } from "lucide-react";

type ApiResponse = {
  ok?: boolean;
  message?: string;
};

function toLocalDateTimeInput(value: string | null) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  const pad = (number: number) => String(number).padStart(2, "0");

  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export default function AdminSocialSchedulePostForm({
  postId,
  initialScheduledAt,
  disabled,
  disabledReason,
}: {
  postId: string;
  initialScheduledAt: string | null;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const router = useRouter();
  const [scheduledAt, setScheduledAt] = useState(() =>
    toLocalDateTimeInput(initialScheduledAt)
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  async function handleSchedule() {
    if (isSaving || isRemoving) return;

    if (disabled) {
      window.alert(disabledReason || "Dieser Beitrag kann aktuell nicht geplant werden.");
      return;
    }

    if (!scheduledAt.trim()) {
      window.alert("Bitte wähle einen Veröffentlichungszeitpunkt aus.");
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch(`/api/admin/social/${postId}/schedule`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          scheduled_at: scheduledAt,
        }),
      });

      const json = (await response.json()) as ApiResponse;

      if (!response.ok || !json.ok) {
        window.alert(json.message || "Der Beitrag konnte nicht geplant werden.");
        return;
      }

      window.alert(json.message || "Beitrag wurde geplant.");
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unbekannter Fehler beim Planen des Beitrags.";

      window.alert(message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRemoveSchedule() {
    if (isSaving || isRemoving) return;

    const confirmed = window.confirm(
      "Soll die Kalenderplanung für diesen Beitrag entfernt werden?"
    );

    if (!confirmed) return;

    setIsRemoving(true);

    try {
      const response = await fetch(`/api/admin/social/${postId}/schedule`, {
        method: "DELETE",
      });

      const json = (await response.json()) as ApiResponse;

      if (!response.ok || !json.ok) {
        window.alert(
          json.message || "Die Kalenderplanung konnte nicht entfernt werden."
        );
        return;
      }

      window.alert(json.message || "Kalenderplanung wurde entfernt.");
      setScheduledAt("");
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unbekannter Fehler beim Entfernen der Kalenderplanung.";

      window.alert(message);
    } finally {
      setIsRemoving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-2 block text-sm font-black text-[#102A43]">
          Veröffentlichungszeitpunkt
        </label>

        <input
          type="datetime-local"
          value={scheduledAt}
          onChange={(event) => setScheduledAt(event.target.value)}
          disabled={Boolean(disabled)}
          className="w-full rounded-2xl border border-[#E7D8C3] bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
        />
      </div>

      {disabled && disabledReason ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold leading-5 text-amber-900">
          {disabledReason}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          onClick={handleSchedule}
          disabled={isSaving || isRemoving}
          className={`inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-black shadow-sm transition disabled:cursor-not-allowed disabled:opacity-70 ${
            disabled
              ? "bg-slate-300 text-slate-700"
              : "bg-[#B5282D] text-white hover:brightness-110"
          }`}
        >
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CalendarClock className="h-4 w-4" />
          )}
          {isSaving ? "Wird geplant ..." : "Planung speichern"}
        </button>

        {initialScheduledAt ? (
          <button
            type="button"
            onClick={handleRemoveSchedule}
            disabled={isSaving || isRemoving}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-black text-red-700 shadow-sm transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isRemoving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            {isRemoving ? "Wird entfernt ..." : "Planung entfernen"}
          </button>
        ) : null}
      </div>
    </div>
  );
}