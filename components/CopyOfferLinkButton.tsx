"use client";

import { useState } from "react";
import { CheckCircle2, Copy, Link as LinkIcon } from "lucide-react";

type CopyOfferLinkButtonProps = {
  url: string;
  label?: string;
  copiedLabel?: string;
  variant?: "primary" | "light";
};

export default function CopyOfferLinkButton({
  url,
  label = "Angebotslink kopieren",
  copiedLabel = "Link kopiert",
  variant = "light",
}: CopyOfferLinkButtonProps) {
  const [copied, setCopied] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleCopy() {
    setErrorMessage(null);

    try {
      if (!url) {
        throw new Error("Kein Angebotslink vorhanden.");
      }

      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = url;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        textArea.style.top = "-9999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }

      setCopied(true);

      window.setTimeout(() => {
        setCopied(false);
      }, 2200);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Der Link konnte nicht kopiert werden."
      );
    }
  }

  const baseClass =
    "inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black shadow-sm transition disabled:cursor-not-allowed disabled:opacity-70";

  const variantClass =
    variant === "primary"
      ? "bg-[#B5282D] text-white hover:brightness-110"
      : "bg-white text-[#12395F] hover:bg-[#EEF4FA]";

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={handleCopy}
        disabled={!url}
        className={`${baseClass} ${variantClass} w-full`}
      >
        {copied ? (
          <>
            <CheckCircle2 className="h-4 w-4" />
            {copiedLabel}
          </>
        ) : (
          <>
            <Copy className="h-4 w-4" />
            {label}
          </>
        )}
      </button>

      {copied ? (
        <div className="mt-2 flex items-start gap-2 rounded-xl border border-[#BFE3CD] bg-[#F0FFF6] px-3 py-2 text-xs font-semibold text-[#2F7D50]">
          <LinkIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Der Angebotslink wurde in die Zwischenablage kopiert.</span>
        </div>
      ) : null}

      {errorMessage ? (
        <div className="mt-2 rounded-xl border border-[#F0C7C7] bg-[#FFF5F5] px-3 py-2 text-xs font-semibold text-[#B5282D]">
          {errorMessage}
        </div>
      ) : null}
    </div>
  );
}