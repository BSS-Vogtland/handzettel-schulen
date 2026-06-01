"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CopyPlus, Loader2 } from "lucide-react";

type ApiResponse = {
  ok?: boolean;
  message?: string;
  campaign?: {
    id?: string;
  };
};

export default function AdminSocialAdCreateVersionButton({
  campaignId,
}: {
  campaignId: string;
}) {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);

  async function handleCreateVersion() {
    if (isCreating) return;

    const confirmed = window.confirm(
      "Soll aus dieser Kampagne eine neue bearbeitbare Version erstellt werden?\n\nDie bestehende Kampagne und vorhandene Freigaben bleiben unverändert. Die neue Version startet wieder als Entwurf und muss später neu freigegeben werden."
    );

    if (!confirmed) return;

    setIsCreating(true);

    try {
      const response = await fetch(
        `/api/admin/social/ads/${campaignId}/duplicate`,
        {
          method: "POST",
        }
      );

      const json = (await response.json()) as ApiResponse;

      if (!response.ok || !json.ok) {
        window.alert(
          json.message || "Neue Kampagnenversion konnte nicht erstellt werden."
        );
        return;
      }

      window.alert(json.message || "Neue Kampagnenversion wurde erstellt.");

      if (json.campaign?.id) {
        router.push(`/admin/social/ads/${json.campaign.id}`);
        return;
      }

      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unbekannter Fehler beim Erstellen der Kampagnenversion.";

      window.alert(message);
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleCreateVersion}
      disabled={isCreating}
      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-700 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
    >
      {isCreating ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <CopyPlus className="h-4 w-4" />
      )}
      {isCreating ? "Version wird erstellt ..." : "Neue Kampagnenversion erstellen"}
    </button>
  );
}