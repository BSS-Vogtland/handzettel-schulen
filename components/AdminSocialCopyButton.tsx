"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export default function AdminSocialCopyButton({
  value,
  label = "Kopieren",
}: {
  value: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!value.trim()) {
      window.alert("Es gibt nichts zu kopieren.");
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);

      window.setTimeout(() => {
        setCopied(false);
      }, 1800);
    } catch {
      window.alert(
        "Kopieren ist im Browser fehlgeschlagen. Bitte Text manuell markieren und kopieren."
      );
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#E7D8C3] bg-white px-4 py-2 text-sm font-black text-[#102A43] shadow-sm transition hover:bg-[#FFFCF7]"
    >
      {copied ? (
        <Check className="h-4 w-4 text-emerald-700" />
      ) : (
        <Copy className="h-4 w-4" />
      )}
      {copied ? "Kopiert" : label}
    </button>
  );
}