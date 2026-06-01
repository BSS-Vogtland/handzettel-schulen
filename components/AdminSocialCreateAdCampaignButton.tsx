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
}: {
  postId: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);

  async function handleCreateCampaign() {
    if (isCreating || disabled) return;

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
          json.message || "Der Ads-Kampagnenentwurf konnte nicht erstellt werden."
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
    <button
      type="button"
      onClick={handleCreateCampaign}
      disabled={disabled || isCreating}
      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-amber-700 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
    >
      {isCreating ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <BadgeEuro className="h-4 w-4" />
      )}
      {isCreating ? "Ads-Entwurf wird erstellt ..." : "Als Ads-Kampagne vorbereiten"}
    </button>
  );
}