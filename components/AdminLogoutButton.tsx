"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";

export default function AdminLogoutButton() {
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleLogout() {
    setIsSubmitting(true);

    try {
      await fetch("/api/admin/logout", {
        method: "POST",
      });
    } finally {
      window.location.href = "/admin/login";
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={isSubmitting}
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-[#E8DED2] bg-white px-4 py-3 text-sm font-black text-[#12395F] shadow-sm transition hover:bg-[#EEF4FA] disabled:cursor-not-allowed disabled:opacity-60"
    >
      <LogOut className="h-4 w-4" />
      {isSubmitting ? "Abmelden …" : "Abmelden"}
    </button>
  );
}
