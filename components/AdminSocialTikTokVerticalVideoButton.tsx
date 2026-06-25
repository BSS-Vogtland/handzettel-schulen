"use client";

import { useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  Smartphone,
  Video,
  XCircle,
} from "lucide-react";

type RenderResult = {
  ok: boolean;
  message?: string;
  asset?: {
    id?: string;
    public_url?: string | null;
    mime_type?: string | null;
    status?: string | null;
    metadata?: Record<string, unknown> | null;
  };
};

export default function AdminSocialTikTokVerticalVideoButton({
  postId,
}: {
  postId: string;
}) {
  const [isRendering, setIsRendering] = useState(false);
  const [result, setResult] = useState<RenderResult | null>(null);

  async function renderVideo() {
    try {
      setIsRendering(true);
      setResult(null);

      const response = await fetch(
        `/api/admin/social/${postId}/generate-tiktok-video`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            durationSeconds: 14,
          }),
        }
      );

      const payload = (await response.json().catch(() => null)) as
        | RenderResult
        | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(
          payload?.message || "TikTok 9:16 Video konnte nicht erzeugt werden."
        );
      }

      setResult(payload);

      window.setTimeout(() => {
        window.location.reload();
      }, 1400);
    } catch (error) {
      setResult({
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "TikTok 9:16 Video konnte nicht erzeugt werden.",
      });
    } finally {
      setIsRendering(false);
    }
  }

  return (
    <section className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#E7D8C3] bg-[#FFFCF7] px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-[#8A5A35]">
            <Smartphone className="h-4 w-4 text-[#A23A2E]" />
            TikTok 9:16 Rendering
          </div>

          <h2 className="mt-4 text-2xl font-black text-[#102A43]">
            V2I.2 · TikTok-Video aus bestehendem Video erzeugen
          </h2>

          <p className="mt-2 max-w-4xl text-sm font-semibold leading-6 text-[#627D98]">
            Erzeugt aus dem vorhandenen SocialPilot-Bild ein vertikales MP4 im
            9:16-Format mit leichter Bewegung. Der echte TikTok-Upload bleibt
            weiterhin gesperrt, bis video.upload freigegeben ist.
          </p>
        </div>

        <button
          type="button"
          onClick={() => renderVideo()}
          disabled={isRendering}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#A23A2E] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRendering ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Video className="h-4 w-4" />
          )}
          {isRendering ? "Erzeuge 9:16 Video ..." : "9:16 TikTok-Video aus Video erzeugen"}
        </button>
      </div>

      {result ? (
        <div
          className={`mt-5 rounded-2xl border p-4 text-sm font-bold leading-6 ${
            result.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-red-200 bg-red-50 text-red-900"
          }`}
        >
          <div className="flex items-start gap-3">
            {result.ok ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
            ) : (
              <XCircle className="mt-0.5 h-5 w-5 shrink-0" />
            )}

            <div>
              <p>
                {result.message ||
                  (result.ok
                    ? "TikTok 9:16 Video wurde erzeugt."
                    : "TikTok 9:16 Video konnte nicht erzeugt werden.")}
              </p>

              {result.asset?.public_url ? (
                <a
                  href={result.asset.public_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-black text-[#102A43] transition hover:bg-[#FFFCF7]"
                >
                  Video öffnen
                  <ExternalLink className="h-4 w-4" />
                </a>
              ) : null}

              {result.ok ? (
                <p className="mt-2 text-xs">
                  Die Seite lädt gleich neu, damit die TikTok-Vorschau das neue
                  Video übernimmt.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold leading-5 text-amber-900">
        Dieser Render erzeugt nur das Video-Asset. Er veröffentlicht nichts auf
        TikTok und aktiviert keinen Upload.
      </div>
    </section>
  );
}
