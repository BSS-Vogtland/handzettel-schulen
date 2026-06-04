"use client";

import { ImageIcon } from "lucide-react";
import { useMemo, useState } from "react";

type AdminProductPreviewImageProps = {
  alt: string;
  sources: Array<string | null | undefined>;
  className?: string;
};

function cleanSources(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const cleaned = String(value || "").trim();

    if (!cleaned) continue;
    if (seen.has(cleaned)) continue;

    seen.add(cleaned);
    result.push(cleaned);
  }

  return result;
}

export default function AdminProductPreviewImage({
  alt,
  sources,
  className = "h-28 w-full object-contain p-2",
}: AdminProductPreviewImageProps) {
  const cleanedSources = useMemo(() => cleanSources(sources), [sources]);
  const [sourceIndex, setSourceIndex] = useState(0);
  const [hasFailedCompletely, setHasFailedCompletely] = useState(false);

  const currentSource = cleanedSources[sourceIndex] || null;

  if (!currentSource || hasFailedCompletely) {
    return (
      <div className="flex h-28 w-full flex-col items-center justify-center text-[#A75B28]">
        <ImageIcon className="h-6 w-6" />
        <span className="mt-2 text-xs font-black">Kein Bild</span>
      </div>
    );
  }

  return (
    <img
      src={currentSource}
      alt={alt}
      className={className}
      loading="lazy"
      decoding="async"
      onError={() => {
        const nextIndex = sourceIndex + 1;

        if (nextIndex < cleanedSources.length) {
          setSourceIndex(nextIndex);
          return;
        }

        setHasFailedCompletely(true);
      }}
    />
  );
}