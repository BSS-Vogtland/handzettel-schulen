"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Loader2 } from "lucide-react";

type AdminSocialCreateWeekPlanButtonProps = {
  eligibleCount: number;
  scheduledCount: number;
};

export default function AdminSocialCreateWeekPlanButton({
  eligibleCount,
  scheduledCount,
}: AdminSocialCreateWeekPlanButtonProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const hasActivePlan = scheduledCount > 0;
  const hasEligiblePosts = eligibleCount > 0;
  const canCreatePlan = !hasActivePlan && hasEligiblePosts && !isLoading;

  function getBlockedMessage() {
    if (hasActivePlan) {
      return `Es sind bereits ${scheduledCount} Beitrag${
        scheduledCount === 1 ? "" : "e"
      } geplant. Entferne zuerst bestehende Termine oder veröffentliche die geplanten Beiträge, bevor ein neuer Wochenplan erstellt wird.`;
    }

    if (!hasEligiblePosts) {
      return "Es gibt aktuell keine freigegebenen, ungeplanten Beiträge für einen Wochenplan.";
    }

    return "Der Wochenplan kann aktuell nicht erstellt werden.";
  }

  async function handleCreateWeekPlan() {
    if (!canCreatePlan) {
      window.alert(getBlockedMessage());
      return;
    }

    const confirmed = window.confirm(
      `Es werden bis zu 7 freigegebene, ungeplante Beiträge automatisch für die nächste Woche geplant.\n\nPlanbare Beiträge aktuell: ${eligibleCount}\n\nFortfahren?`
    );

    if (!confirmed) return;

    setIsLoading(true);

    try {
      const response = await fetch("/api/admin/social/create-week-plan", {
        method: "POST",
        headers: {
          Accept: "application/json",
        },
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            ok?: boolean;
            message?: string;
            plannedPosts?: unknown[];
          }
        | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(
          payload?.message || "Der Wochenplan konnte nicht erstellt werden."
        );
      }

      window.alert(payload.message || "Wochenplan wurde erstellt.");
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unbekannter Fehler beim Erstellen des Wochenplans.";

      window.alert(message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleCreateWeekPlan}
      disabled={isLoading}
      className={`inline-flex items-center justify-center gap-2 rounded-2xl border px-5 py-3 text-sm font-black shadow-sm transition ${
        canCreatePlan
          ? "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
          : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100"
      }`}
      title={canCreatePlan ? "Wochenplan erstellen" : getBlockedMessage()}
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <CalendarClock className="h-4 w-4" />
      )}
      {isLoading
        ? "Plane..."
        : hasActivePlan
          ? "Wochenplan aktiv"
          : "Wochenplan erstellen"}
    </button>
  );
}