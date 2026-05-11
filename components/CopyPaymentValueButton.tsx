"use client";

import { CheckCircle2, Copy } from "lucide-react";
import { useState } from "react";

type CopyPaymentValueButtonProps = {
  value: string;
  label?: string;
};

export default function CopyPaymentValueButton({
  value,
  label = "Kopieren",
}: CopyPaymentValueButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);

      window.setTimeout(() => {
        setCopied(false);
      }, 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl border border-[#E8DED2] bg-white px-4 py-2 text-xs font-black text-[#12395F] shadow-sm transition hover:bg-[#EEF4FA]"
    >
      {copied ? (
        <CheckCircle2 className="h-4 w-4 text-[#2F7D50]" />
      ) : (
        <Copy className="h-4 w-4" />
      )}
      {copied ? "Kopiert" : label}
    </button>
  );
}