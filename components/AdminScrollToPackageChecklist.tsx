"use client";

import { useEffect } from "react";

export default function AdminScrollToPackageChecklist() {
  useEffect(() => {
    const url = new URL(window.location.href);
    const shouldFocusChecklist =
      url.searchParams.get("focus") === "package-checklist" ||
      window.location.hash === "#package-checklist";

    if (!shouldFocusChecklist) return;

    window.requestAnimationFrame(() => {
      document
        .getElementById("package-checklist")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  return null;
}