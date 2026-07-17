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

type TimePart = {
  value: number;
  singular: string;
  plural: string;
};

function formatTimePart(part: TimePart) {
  const label = part.value === 1 ? part.singular : part.plural;

  return `${part.value} ${label}`;
}

function joinTimeParts(parts: string[]) {
  if (parts.length === 0) {
    return "";
  }

  if (parts.length === 1) {
    return parts[0];
  }

  if (parts.length === 2) {
    return `${parts[0]} und ${parts[1]}`;
  }

  return `${parts.slice(0, -1).join(", ")} und ${parts.at(-1)}`;
}

function getRelativeLabel(secondsAgo: number | null) {
  if (secondsAgo === null) {
    return "noch keine Aktivität erfasst";
  }

  const safeSeconds = Math.max(0, Math.floor(secondsAgo));

  if (safeSeconds < 10) {
    return "gerade eben";
  }

  if (safeSeconds < 60) {
    return safeSeconds === 1
      ? "vor 1 Sekunde"
      : `vor ${safeSeconds} Sekunden`;
  }

  const totalMinutes = Math.max(1, Math.floor(safeSeconds / 60));

  const minutesPerHour = 60;
  const minutesPerDay = 24 * minutesPerHour;
  const minutesPerWeek = 7 * minutesPerDay;

  const weeks = Math.floor(totalMinutes / minutesPerWeek);
  const remainingAfterWeeks = totalMinutes % minutesPerWeek;

  const days = Math.floor(remainingAfterWeeks / minutesPerDay);
  const remainingAfterDays = remainingAfterWeeks % minutesPerDay;

  const hours = Math.floor(remainingAfterDays / minutesPerHour);
  const minutes = remainingAfterDays % minutesPerHour;

  const parts: TimePart[] = [
    {
      value: weeks,
      singular: "Woche",
      plural: "Wochen",
    },
    {
      value: days,
      singular: "Tag",
      plural: "Tagen",
    },
    {
      value: hours,
      singular: "Stunde",
      plural: "Stunden",
    },
    {
      value: minutes,
      singular: "Minute",
      plural: "Minuten",
    },
  ];

  const formattedParts = parts
    .filter((part) => part.value > 0)
    .map(formatTimePart);

  return `vor ${joinTimeParts(formattedParts)}`;
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

    void loadPresence();

    const interval = window.setInterval(() => {
      void loadPresence();
    }, 20000);

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