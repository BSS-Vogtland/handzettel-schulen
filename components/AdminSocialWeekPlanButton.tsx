"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Loader2 } from "lucide-react";

type ApiResponse = {
  ok?: boolean;
  message?: string;
};

export default function AdminSocialWeekPlanButton() {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);

  async function handleCreateWeekPlan() {
    if (isCreating) return;

    const confirmed = window.confirm(
      "Soll jetzt automatisch ein Wochenplan für offene Social-Entwürfe erstellt werden? Geplant wird für die nächste Woche von Montag bis Sonntag."
    );

    if (!confirmed) return;

    setIsCreating(true);

    try {
      const response = await fetch("/api/admin/social/create-week-plan", {
        method: "POST",
      });

      const json = (await response.json()) as ApiResponse;

      if (!response.ok || !json.ok) {
        window.alert(
          json.message || "Der Wochenplan konnte nicht erstellt werden."
        );
        return;
      }

      window.alert(json.message || "Wochenplan wurde erstellt.");
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unbekannter Fehler beim Erstellen des Wochenplans.";

      window.alert(message);
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleCreateWeekPlan}
      disabled={isCreating}
      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#B5282D] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
    >
      {isCreating ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <CalendarClock className="h-4 w-4" />
      )}
      {isCreating ? "Wochenplan wird erstellt ..." : "Wochenplan automatisch erstellen"}
    </button>
  );
}