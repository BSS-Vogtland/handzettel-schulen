"use client";

import { useState } from "react";

type SocialShareButtonsProps = {
  shareText: string;
  shareUrl: string;
};

export default function SocialShareButtons({
  shareText,
  shareUrl,
}: SocialShareButtonsProps) {
  const [copied, setCopied] = useState(false);

  const fullText = `${shareText}

Mehr erfahren: ${shareUrl}`;

  const encodedShareUrl = encodeURIComponent(shareUrl);
  const encodedShareText = encodeURIComponent(shareText);

  async function copyShareText() {
    try {
      await navigator.clipboard.writeText(fullText);
      setCopied(true);

      window.setTimeout(() => {
        setCopied(false);
      }, 2500);
    } catch {
      setCopied(false);
      window.prompt("Beitrag kopieren:", fullText);
    }
  }

  return (
    <div className="mt-5 flex flex-wrap gap-3">
      <button
        type="button"
        onClick={copyShareText}
        className="rounded-full bg-[#102A43] px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-white transition hover:bg-[#B5282D]"
      >
        {copied ? "Beitrag kopiert" : "Beitrag kopieren"}
      </button>

      <a
        href={`https://www.facebook.com/sharer/sharer.php?u=${encodedShareUrl}`}
        target="_blank"
        rel="noreferrer"
        className="rounded-full bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-[#12395F] shadow-sm transition hover:text-[#B5282D]"
      >
        Facebook öffnen
      </a>

      <a
        href="https://www.instagram.com/"
        target="_blank"
        rel="noreferrer"
        className="rounded-full bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-[#12395F] shadow-sm transition hover:text-[#B5282D]"
      >
        Instagram öffnen
      </a>

      <a
        href={`https://wa.me/?text=${encodedShareText}%20${encodedShareUrl}`}
        target="_blank"
        rel="noreferrer"
        className="rounded-full bg-[#2F7D50] px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-white transition hover:bg-[#102A43]"
      >
        WhatsApp teilen
      </a>
    </div>
  );
}
