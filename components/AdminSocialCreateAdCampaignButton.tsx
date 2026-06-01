"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeEuro, Loader2 } from "lucide-react";

type ApiResponse = {
  ok?: boolean;
  message?: string;
  campaign?: {
    id?: string;
  };
};

export default function AdminSocialCreateAdCampaignButton({
  postId,
  disabled,
  disabledReason,
}: {
  postId: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);

  async function handleCreateCampaign() {
    if (isCreating) return;

    if (disabled) {
      window.alert(disabledReason || "Diese Aktion ist aktuell gesperrt.");
      return;
    }

    const confirmed = window.confirm(
      "Soll aus diesem Beitrag ein Ads-Kampagnenentwurf erstellt werden? Es wird noch keine Werbung geschaltet und kein Budget ausgegeben."
    );

    if (!confirmed) return;

    setIsCreating(true);

    try {
      const response = await fetch(
        `/api/admin/social/${postId}/create-ad-campaign`,
        {
          method: "POST",
        }
      );

      const json = (await response.json()) as ApiResponse;

      if (!response.ok || !json.ok) {
        window.alert(
          json.message ||
            "Der Ads-Kampagnenentwurf konnte nicht erstellt werden."
        );
        return;
      }

      window.alert(json.message || "Ads-Kampagnenentwurf wurde erstellt.");

      if (json.campaign?.id) {
        router.push(`/admin/social/ads/${json.campaign.id}`);
        return;
      }

      router.push("/admin/social/ads");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unbekannter Fehler beim Erstellen der Ads-Kampagne.";

      window.alert(message);
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleCreateCampaign}
        disabled={isCreating}
        className={`inline-flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-black shadow-sm transition disabled:cursor-not-allowed disabled:opacity-70 ${
          disabled
            ? "bg-slate-300 text-slate-700"
            : "bg-amber-700 text-white hover:brightness-110"
        }`}
      >
        {isCreating ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <BadgeEuro className="h-4 w-4" />
        )}
        {isCreating
          ? "Ads-Entwurf wird erstellt ..."
          : "Als Ads-Kampagne vorbereiten"}
      </button>

      {disabled && disabledReason ? (
        <p className="text-xs font-bold leading-5 text-slate-700">
          {disabledReason}
        </p>
      ) : null}
    </div>
  );
}