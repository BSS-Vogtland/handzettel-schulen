"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ExternalLink,
  Loader2,
  PlugZap,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";

type BufferChannel = {
  id: string;
  name?: string | null;
  displayName?: string | null;
  descriptor?: string | null;
  service?: string | null;
  type?: string | null;
  isDisconnected?: boolean | null;
  isLocked?: boolean | null;
  timezone?: string | null;
};

type BufferStatus = {
  ok: boolean;
  configured: boolean;
  message: string;
  organizations?: Array<{
    id: string;
    name: string;
    channelCount?: number;
    ownerEmail?: string | null;
  }>;
  channels?: BufferChannel[];
  tiktokChannels?: BufferChannel[];
};

function StatusBadge({
  ok,
  label,
}: {
  ok: boolean;
  label: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-black ${
        ok
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-amber-200 bg-amber-50 text-amber-800"
      }`}
    >
      {ok ? (
        <ShieldCheck className="h-3.5 w-3.5" />
      ) : (
        <XCircle className="h-3.5 w-3.5" />
      )}
      {label}
    </span>
  );
}

export default function AdminSocialBufferPage() {
  const [status, setStatus] = useState<BufferStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function loadStatus() {
    try {
      setIsLoading(true);

      const response = await fetch("/api/admin/social/buffer/status", {
        method: "GET",
        cache: "no-store",
      });

      const payload = (await response.json().catch(() => null)) as
        | BufferStatus
        | null;

      if (!payload) {
        throw new Error("Buffer-Status konnte nicht gelesen werden.");
      }

      setStatus(payload);
    } catch (error) {
      setStatus({
        ok: false,
        configured: false,
        message:
          error instanceof Error
            ? error.message
            : "Buffer-Status konnte nicht geladen werden.",
        organizations: [],
        channels: [],
        tiktokChannels: [],
      });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadStatus();
  }, []);

  const channels = status?.channels || [];
  const tiktokChannels = status?.tiktokChannels || [];

  return (
    <main className="min-h-screen bg-[#FBF7F0] px-4 py-8 text-[#102A43] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-[2rem] border border-[#E7D8C3] bg-white p-6 shadow-sm sm:p-8">
          <Link
            href="/admin/social"
            className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-[#A23A2E] hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            Zurück zum SocialPilot
          </Link>

          <div className="inline-flex items-center gap-2 rounded-full border border-[#E7D8C3] bg-[#FFFCF7] px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-[#8A5A35]">
            <PlugZap className="h-4 w-4" />
            Buffer Integration
          </div>

          <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
                Buffer als Publishing-Schicht
              </h1>

              <p className="mt-3 max-w-3xl text-base font-semibold leading-7 text-[#486581]">
                Buffer übernimmt später TikTok und weitere Plattformen. Unser
                SocialPilot bleibt für Content, Review, Bild, Video und Workflow
                zuständig.
              </p>
            </div>

            <button
              type="button"
              onClick={() => loadStatus()}
              disabled={isLoading}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#A23A2E] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Status neu laden
            </button>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <StatusBadge
              ok={Boolean(status?.configured)}
              label={status?.configured ? "API-Key gesetzt" : "API-Key fehlt"}
            />
            <StatusBadge
              ok={Boolean(status?.ok)}
              label={status?.ok ? "Buffer erreichbar" : "Buffer nicht erreichbar"}
            />
            <StatusBadge
              ok={tiktokChannels.length > 0}
              label={
                tiktokChannels.length > 0
                  ? `${tiktokChannels.length} TikTok-Kanal/Kanäle`
                  : "Kein TikTok-Kanal gefunden"
              }
            />
          </div>
        </header>

        <section
          className={`rounded-[2rem] border p-5 shadow-sm sm:p-7 ${
            status?.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-amber-200 bg-amber-50 text-amber-900"
          }`}
        >
          <h2 className="text-xl font-black">Status</h2>
          <p className="mt-2 text-sm font-bold leading-6">
            {isLoading ? "Buffer-Status wird geladen ..." : status?.message || "Noch nicht geladen."}
          </p>
        </section>

        <section className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm sm:p-7">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-2xl font-black">Gefundene Buffer-Kanäle</h2>
              <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#627D98]">
                Diese Channel-IDs brauchen wir später, um einen SocialPilot-Beitrag
                an den richtigen Buffer-Kanal zu übergeben.
              </p>
            </div>

            <a
              href="https://publish.buffer.com/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#E7D8C3] bg-[#FFFCF7] px-5 py-3 text-sm font-black text-[#A23A2E] shadow-sm transition hover:bg-[#F5E8D8]"
            >
              Buffer öffnen
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>

          {channels.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold leading-6 text-amber-900">
              Noch keine Channels gefunden. Prüfe, ob der API-Key stimmt und ob
              in Buffer mindestens ein Social-Kanal verbunden ist.
            </div>
          ) : (
            <div className="mt-5 overflow-hidden rounded-2xl border border-[#E7D8C3]">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="bg-[#FFFCF7] text-xs font-black uppercase tracking-[0.14em] text-[#8A5A35]">
                  <tr>
                    <th className="px-4 py-3">Service</th>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Typ</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Channel ID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E7D8C3] bg-white">
                  {channels.map((channel) => {
                    const locked = Boolean(channel.isLocked);
                    const disconnected = Boolean(channel.isDisconnected);

                    return (
                      <tr key={channel.id}>
                        <td className="px-4 py-3 font-black">
                          {channel.service || "—"}
                        </td>
                        <td className="px-4 py-3 font-semibold">
                          {channel.displayName || channel.name || "—"}
                          <div className="text-xs text-[#627D98]">
                            {channel.descriptor || ""}
                          </div>
                        </td>
                        <td className="px-4 py-3">{channel.type || "—"}</td>
                        <td className="px-4 py-3">
                          {locked || disconnected ? (
                            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-black text-amber-800">
                              prüfen
                            </span>
                          ) : (
                            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-800">
                              bereit
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">
                          {channel.id}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
