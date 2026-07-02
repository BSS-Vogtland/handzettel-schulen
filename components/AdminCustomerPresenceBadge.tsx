"use client";

import { useEffect, useMemo, useState } from "react";

type PresenceResponse = {
  ok: boolean;
  isActive: boolean;
  lastSeenAt: string | null;
  secondsAgo: number | null;
  context: string | null;
};

type AdminCustomerPresenceBadgeProps = {
  requestId: string;
};

function getRelativeLabel(secondsAgo: number | null) {
  if (secondsAgo === null) return "noch keine Aktivität erfasst";
  if (secondsAgo < 10) return "gerade eben";
  if (secondsAgo < 60) return `vor ${secondsAgo} Sekunden`;

  const minutes = Math.max(1, Math.round(secondsAgo / 60));
  if (minutes === 1) return "vor 1 Minute";

  return `vor ${minutes} Minuten`;
}

export default function AdminCustomerPresenceBadge({
  requestId,
}: AdminCustomerPresenceBadgeProps) {
  const endpoint = useMemo(
    () => `/api/admin/requests/${encodeURIComponent(requestId)}/presence`,
    [requestId]
  );

  const [presence, setPresence] = useState<PresenceResponse | null>(null);

  useEffect(() => {
    let stopped = false;

    async function loadPresence() {
      try {
        const response = await fetch(endpoint, {
          method: "GET",
          cache: "no-store",
        });

        const result = (await response.json()) as PresenceResponse;

        if (!stopped) {
          setPresence(result);
        }
      } catch {
        if (!stopped) {
          setPresence({
            ok: false,
            isActive: false,
            lastSeenAt: null,
            secondsAgo: null,
            context: null,
          });
        }
      }
    }

    loadPresence();

    const interval = window.setInterval(loadPresence, 20000);

    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [endpoint]);

  const isActive = Boolean(presence?.isActive);
  const label = isActive ? "Kunde gerade aktiv" : "Kunde nicht aktiv";
  const relative = getRelativeLabel(presence?.secondsAgo ?? null);

  return (
    <div
      className={`rounded-2xl border px-4 py-3 text-sm ${
        isActive
          ? "border-[#BFE3CD] bg-[#F0FFF6] text-[#2F7D50]"
          : "border-[#E8DED2] bg-white text-[#52616F]"
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`h-2.5 w-2.5 rounded-full ${
            isActive ? "bg-[#2F7D50]" : "bg-[#CBD5E1]"
          }`}
        />
        <span className="font-black">{label}</span>
      </div>

      <p className="mt-1 text-xs font-bold leading-5">
        Letzte Aktivität: {relative}
      </p>
    </div>
  );
}
