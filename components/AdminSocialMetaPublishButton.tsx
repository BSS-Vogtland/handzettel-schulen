"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, Send, Share2, ShieldAlert } from "lucide-react";

type MetaPlatform = "facebook" | "instagram";

type MetaStatusResponse = {
  ok?: boolean;
  configured?: {
    facebook?: { configured?: boolean; pageIdSet?: boolean; tokenSet?: boolean };
    instagram?: {
      configured?: boolean;
      businessAccountIdSet?: boolean;
      tokenSet?: boolean;
    };
  };
  message?: string;
};

type MetaPublishResponse = {
  ok?: boolean;
  message?: string;
  results?: Array<{
    platform: MetaPlatform;
    ok: boolean;
    message?: string;
    id?: string | null;
    postId?: string | null;
  }>;
};

export default function AdminSocialMetaPublishButton({
  postId,
  disabled,
  disabledReason,
}: {
  postId: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<MetaStatusResponse | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [publishingKey, setPublishingKey] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadStatus() {
      setIsLoadingStatus(true);
      setStatusError(null);

      try {
        const response = await fetch("/api/admin/social/meta/status", {
          method: "GET",
          headers: { Accept: "application/json" },
        });

        const payload = (await response.json().catch(() => null)) as
          | MetaStatusResponse
          | null;

        if (!isMounted) return;

        if (!response.ok || !payload?.ok) {
          throw new Error(
            payload?.message || "Meta-Konfiguration konnte nicht geprüft werden."
          );
        }

        setStatus(payload);
      } catch (error) {
        if (!isMounted) return;
        setStatusError(
          error instanceof Error
            ? error.message
            : "Meta-Konfiguration konnte nicht geprüft werden."
        );
      } finally {
        if (isMounted) setIsLoadingStatus(false);
      }
    }

    loadStatus();

    return () => {
      isMounted = false;
    };
  }, []);

  const facebookConfigured = Boolean(status?.configured?.facebook?.configured);
  const instagramConfigured = Boolean(status?.configured?.instagram?.configured);

  const availablePlatforms = useMemo(() => {
    const platforms: MetaPlatform[] = [];
    if (facebookConfigured) platforms.push("facebook");
    if (instagramConfigured) platforms.push("instagram");
    return platforms;
  }, [facebookConfigured, instagramConfigured]);

  async function publish(platforms: MetaPlatform[]) {
    if (publishingKey) return;

    if (disabled) {
      window.alert(disabledReason || "Meta-Veröffentlichung ist aktuell gesperrt.");
      return;
    }

    if (platforms.length === 0) {
      window.alert(
        "Keine Meta-Plattform ist vollständig konfiguriert. Bitte Vercel ENV prüfen."
      );
      return;
    }

    const platformLabel = platforms
      .map((platform) => (platform === "facebook" ? "Facebook" : "Instagram"))
      .join(" und ");

    const confirmed = window.confirm(
      `Soll dieser Beitrag jetzt über Meta auf ${platformLabel} veröffentlicht werden?\n\nNach erfolgreicher Veröffentlichung wird der Beitrag im SocialPilot als veröffentlicht markiert.`
    );

    if (!confirmed) return;

    const key = platforms.join("+");
    setPublishingKey(key);

    try {
      const response = await fetch(`/api/admin/social/${postId}/publish-meta`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ platforms }),
      });

      const payload = (await response.json().catch(() => null)) as
        | MetaPublishResponse
        | null;

      if (!response.ok || !payload?.ok) {
        const detail = payload?.results
          ?.map((result) => {
            const name = result.platform === "facebook" ? "Facebook" : "Instagram";
            return `${name}: ${result.message || (result.ok ? "OK" : "Fehler")}`;
          })
          .join("\n");

        window.alert(
          `${payload?.message || "Meta-Veröffentlichung ist fehlgeschlagen."}${
            detail ? `\n\n${detail}` : ""
          }`
        );
        return;
      }

      window.alert(payload.message || "Meta-Veröffentlichung abgeschlossen.");
      router.refresh();
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : "Unbekannter Fehler bei der Meta-Veröffentlichung."
      );
    } finally {
      setPublishingKey(null);
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-blue-950">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-white p-2 text-blue-700">
          <Send className="h-4 w-4" />
        </div>
        <div>
          <h3 className="text-sm font-black">Meta-Veröffentlichung V1</h3>
          <p className="mt-1 text-xs font-bold leading-5 text-blue-900/80">
            Postet das vorhandene Social-Bild mit Plattformtext direkt über die
            Meta Graph API. Token werden nur serverseitig aus Vercel ENV gelesen.
          </p>
        </div>
      </div>

      {isLoadingStatus ? (
        <div className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-black text-blue-800">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Meta-Konfiguration wird geprüft ...
        </div>
      ) : statusError ? (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold leading-5 text-red-900">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          {statusError}
        </div>
      ) : availablePlatforms.length === 0 ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-900">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          Meta ist noch nicht vollständig über Vercel ENV konfiguriert.
          Benötigt werden mindestens Facebook Page-ID/Token oder Instagram
          Business Account-ID/Token.
        </div>
      ) : null}

      <div className="grid gap-2">
        {facebookConfigured ? (
          <button
            type="button"
            onClick={() => publish(["facebook"])}
            disabled={Boolean(publishingKey)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#1877F2] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {publishingKey === "facebook" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Share2 className="h-4 w-4" />
            )}
            {publishingKey === "facebook"
              ? "Facebook wird veröffentlicht ..."
              : "Auf Facebook veröffentlichen"}
          </button>
        ) : null}

        {instagramConfigured ? (
          <button
            type="button"
            onClick={() => publish(["instagram"])}
            disabled={Boolean(publishingKey)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#C13584] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {publishingKey === "instagram" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Camera className="h-4 w-4" />
            )}
            {publishingKey === "instagram"
              ? "Instagram wird veröffentlicht ..."
              : "Auf Instagram veröffentlichen"}
          </button>
        ) : null}

        {facebookConfigured && instagramConfigured ? (
          <button
            type="button"
            onClick={() => publish(["facebook", "instagram"])}
            disabled={Boolean(publishingKey)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#102A43] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {publishingKey === "facebook+instagram" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {publishingKey === "facebook+instagram"
              ? "Meta wird veröffentlicht ..."
              : "Auf Facebook + Instagram veröffentlichen"}
          </button>
        ) : null}
      </div>

      {disabled && disabledReason ? (
        <p className="text-xs font-bold leading-5 text-slate-700">
          {disabledReason}
        </p>
      ) : null}
    </div>
  );
}




