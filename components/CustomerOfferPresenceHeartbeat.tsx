"use client";

import { useEffect, useMemo } from "react";

type CustomerOfferPresenceHeartbeatProps = {
  token: string;
  context?: string;
};

const HEARTBEAT_INTERVAL_MS = 25000;

function getClientId() {
  const key = "handzettel_offer_presence_client_id";

  try {
    const existing = window.localStorage.getItem(key);
    if (existing) return existing;

    const next =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    window.localStorage.setItem(key, next);
    return next;
  } catch {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

export default function CustomerOfferPresenceHeartbeat({
  token,
  context = "offer_page",
}: CustomerOfferPresenceHeartbeatProps) {
  const endpoint = useMemo(
    () => `/api/offer/${encodeURIComponent(token)}/presence`,
    [token]
  );

  useEffect(() => {
    if (!token) return;

    let stopped = false;
    const clientId = getClientId();

    async function sendHeartbeat(nextContext = context) {
      if (stopped || document.visibilityState === "hidden") return;

      try {
        await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            clientId,
            context: nextContext,
          }),
          cache: "no-store",
          keepalive: true,
        });
      } catch {
        // Nur Admin-Anzeige. Der Kundenflow darf dadurch nie blockieren.
      }
    }

    sendHeartbeat();

    const interval = window.setInterval(() => {
      sendHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        sendHeartbeat("offer_page_visible");
      }
    }

    function handleFocus() {
      sendHeartbeat("offer_page_focus");
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);

    return () => {
      stopped = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
    };
  }, [context, endpoint, token]);

  return null;
}
