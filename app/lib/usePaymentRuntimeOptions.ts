"use client";

import { useEffect, useState } from "react";

export function usePayPalPaymentsEnabled() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    void fetch("/api/payment-options", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return false;
        const body = (await response.json()) as {
          paypalPaymentsEnabled?: unknown;
        };
        return body.paypalPaymentsEnabled === true;
      })
      .then(setEnabled)
      .catch(() => setEnabled(false));

    return () => controller.abort();
  }, []);

  return enabled;
}
