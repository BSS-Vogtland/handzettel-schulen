"use client";

import { useEffect } from "react";
import { LEAD_SOURCE_COOKIE_NAME, normalizeLeadSource } from "@/lib/lead-source";

const STORAGE_KEY = LEAD_SOURCE_COOKIE_NAME;
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;

function detectLeadSource() {
  if (typeof window === "undefined") return "direct";

  const url = new URL(window.location.href);
  const params = url.searchParams;

  const explicitSource =
    params.get("utm_source") ||
    params.get("source") ||
    params.get("src") ||
    params.get("fbclid") ||
    params.get("gclid") ||
    params.get("ttclid");

  if (explicitSource) {
    return normalizeLeadSource(explicitSource, "direct");
  }

  const referrer = document.referrer || "";

  if (referrer) {
    return normalizeLeadSource(referrer, "direct");
  }

  return "direct";
}

function writeCookie(value: string) {
  document.cookie = `${LEAD_SOURCE_COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
}

export default function LeadSourceTracker() {
  useEffect(() => {
    const detected = detectLeadSource();

    try {
      const existing = window.localStorage.getItem(STORAGE_KEY);

      if (existing && existing !== "direct" && detected === "direct") {
        writeCookie(existing);
        return;
      }

      window.localStorage.setItem(STORAGE_KEY, detected);
      writeCookie(detected);
    } catch {
      writeCookie(detected);
    }
  }, []);

  return null;
}
