"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clipboard,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
  Video,
} from "lucide-react";

type TikTokStatusResponse = {
  ok: boolean;
  checked_at?: string;
  source?: "database" | "environment" | "none";
  message?: string;
  config?: {
    clientKeySet: boolean;
    clientSecretSet: boolean;
    redirectUriSet: boolean;
    accessTokenSet: boolean;
    refreshTokenSet: boolean;
    openIdSet: boolean;
    configured: boolean;
    tokenConfigured: boolean;
    scopes: string;
    expiresAt: string | null;
    refreshExpiresAt: string | null;
    storedConnectionId: string | null;
    accountName?: string | null;
    externalAccountId?: string | null;
  };
  verification?: {
    ok: boolean;
    status?: number;
    skipped?: boolean;
    reason?: string;
    error?: unknown;
    payload?: unknown;
    user?: {
      open_id?: string;
      display_name?: string;
      avatar_url?: string;
    } | null;
  } | null;
};

const reviewText = `The app is used by our internal admin team for handzettel-schulen.de. It connects our own TikTok account to our private SocialPilot dashboard.

Current integration:
- Login Kit is used to authorize our own TikTok account through OAuth and connect it to the SocialPilot dashboard.
- user.info.basic is used to identify the connected TikTok account in the admin dashboard.
- The SocialPilot dashboard prepares our own generated short videos for TikTok.
- A TikTok 9:16 MP4 version can be generated from an existing SocialPilot video asset.
- The TikTok Draft Upload page shows the video preview, final caption, asset status, audio status, and the current safety lock.

Planned Content Posting integration:
- Content Posting API will be used to upload our own generated short videos from the SocialPilot dashboard to TikTok.
- video.upload will be used to upload videos to TikTok as drafts so they can be completed or posted through TikTok.

Current safety behavior:
- Real TikTok upload is intentionally blocked until video.upload is approved and TIKTOK_ENABLE_DRAFT_UPLOAD is explicitly enabled.
- The app does not allow public users or third parties to upload content.

The app is not available to public users and does not allow third parties to upload content. Only authorized internal administrators can access the dashboard.`;

const demoScript = `Demo video script for TikTok App Review

1. Open https://www.handzettel-schulen.de/admin/social.
2. Show the SocialPilot dashboard and the TikTok system status.
3. Show that TikTok Login Kit is connected and the TikTok account is visible.
4. Open one prepared SocialPilot post.
5. Open the TikTok Draft Upload page for this post.
6. Show the generated TikTok 9:16 MP4 video preview.
7. Show the asset status block: preferred render source, audio/music status, current TikTok version, and older TikTok versions.
8. Show the final TikTok caption text.
9. Show that the upload flow is prepared but blocked because video.upload is missing and/or the upload safety flag is disabled.
10. Explain that Content Posting API will only be used to upload our own generated short videos as drafts to TikTok.
11. After video.upload is approved, repeat the demo and show the TikTok Draft Upload button, confirmation step, upload result, and protocol/status log.`;

const productionNotes = `Production submission notes

App name:
Handzettel Schulen SocialPilot

Website:
https://www.handzettel-schulen.de/

Terms of Service URL:
https://www.handzettel-schulen.de/impressum

Privacy Policy URL:
https://www.handzettel-schulen.de/datenschutz

Web Redirect URI:
https://www.handzettel-schulen.de/api/admin/social/tiktok/oauth/callback

Current scope:
user.info.basic

Requested next scope:
video.upload

Current SocialPilot behavior:
- Login Kit connection is visible in the internal admin dashboard.
- A prepared SocialPilot post can be opened from the dashboard.
- The TikTok Draft Upload page shows the generated TikTok 9:16 MP4 video, the final caption, asset source, audio status, and safety lock.
- Real upload is intentionally disabled until video.upload is approved and TIKTOK_ENABLE_DRAFT_UPLOAD is explicitly enabled.

Important:
Do not submit or enable the real Content Posting API upload before the complete upload demo can be recorded without exposing secrets or private customer data.`;

const recordingChecklist = [
  "Browser zoom on 100% or 110%, no private data visible.",
  "Open /admin/social and show TikTok connected status.",
  "Show account name, scope user.info.basic, and connection source.",
  "Open TikTok Review-Vorbereitung block.",
  "Open a prepared post with approved review status.",
  "Click TikTok Upload vorbereiten.",
  "Show the TikTok 9:16 video preview.",
  "Show the asset status: render source, audio/music detection, current TikTok version.",
  "Show the final TikTok caption.",
  "Show the safety lock: video.upload missing and/or upload flag disabled.",
  "Do not show tokens, secrets, Supabase service keys, Vercel ENV values, or private customer data.",
];

function formatDate(value: string | undefined | null) {
  if (!value) return "—";

  try {
    return new Intl.DateTimeFormat("de-DE", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function getShortValue(value: string | null | undefined) {
  if (!value) return "—";
  if (value.length <= 16) return value;

  return `${value.slice(0, 7)}…${value.slice(-5)}`;
}

async function copyToClipboard(value: string) {
  await navigator.clipboard.writeText(value);
}

export default function AdminSocialTikTokReviewMaterial() {
  const [status, setStatus] = useState<TikTokStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  async function loadStatus() {
    try {
      setIsLoading(true);

      const response = await fetch("/api/admin/social/tiktok/status", {
        method: "GET",
        cache: "no-store",
      });

      const result = (await response.json().catch(() => null)) as
        | TikTokStatusResponse
        | null;

      if (!response.ok || !result) {
        throw new Error(
          result?.message || "TikTok-Systemstatus konnte nicht geladen werden."
        );
      }

      setStatus(result);
    } catch (error) {
      setStatus({
        ok: false,
        checked_at: new Date().toISOString(),
        message:
          error instanceof Error
            ? error.message
            : "TikTok-Systemstatus konnte nicht geladen werden.",
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCopy(key: string, value: string) {
    await copyToClipboard(value);
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(null), 1800);
  }

  useEffect(() => {
    void loadStatus();
  }, []);

  const user = status?.verification?.user || null;
  const config = status?.config;
  const accountName =
    user?.display_name || config?.accountName || "TikTok-Konto";
  const isConnected = Boolean(status?.verification?.ok);
  const hasUploadScope = useMemo(() => {
    return String(config?.scopes || "")
      .split(/[,\s]+/)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .includes("video.upload");
  }, [config?.scopes]);

  return (
    <section className="space-y-6">
      <div className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#E7D8C3] bg-[#FFFCF7] px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-[#8A5A35]">
              <ShieldCheck className="h-4 w-4 text-[#A23A2E]" />
              TikTok Review-Material
            </div>

            <h2 className="mt-4 text-2xl font-black text-[#102A43]">
              V2J.1 · Demo- und Review-Material
            </h2>

            <p className="mt-2 max-w-4xl text-sm font-semibold leading-6 text-[#627D98]">
              Diese Seite sammelt Texte, URLs und Aufnahmeschritte für die
              TikTok-App-Review. Sie beschreibt jetzt den aktuellen Stand:
              Login Kit verbunden, TikTok-9:16-Video sichtbar, Asset-/Audio-Status
              sichtbar und echter Upload aus Sicherheitsgründen noch gesperrt.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => loadStatus()}
              disabled={isLoading}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#102A43] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw
                className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
              />
              Status prüfen
            </button>

            <a
              href="https://developers.tiktok.com/apps"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#E7D8C3] bg-[#FFFCF7] px-5 py-3 text-sm font-black text-[#102A43] shadow-sm transition hover:bg-white"
            >
              Developer Portal
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </div>

        <div
          className={`mt-6 rounded-[1.5rem] border p-4 ${
            isConnected
              ? "border-emerald-200 bg-emerald-50 text-emerald-950"
              : "border-amber-200 bg-amber-50 text-amber-950"
          }`}
        >
          <div className="flex items-start gap-3">
            {isConnected ? (
              <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-emerald-700" />
            ) : (
              <AlertTriangle className="mt-1 h-5 w-5 shrink-0 text-amber-700" />
            )}

            <div>
              <h3 className="text-lg font-black">
                {isConnected
                  ? "TikTok Login Kit ist verbunden"
                  : "TikTok Verbindung noch prüfen"}
              </h3>

              <p className="mt-1 text-sm font-bold leading-6">
                Konto: {accountName} · Quelle: {status?.source || "—"} · letzte
                Prüfung: {formatDate(status?.checked_at)}
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 rounded-2xl bg-white/80 p-3 text-xs font-bold leading-5 md:grid-cols-2">
            <div>
              <p>Client Key: {config?.clientKeySet ? "gesetzt" : "fehlt"}</p>
              <p>Client Secret: {config?.clientSecretSet ? "gesetzt" : "fehlt"}</p>
              <p>Redirect URI: {config?.redirectUriSet ? "gesetzt" : "fehlt"}</p>
              <p>Scopes: {config?.scopes || "—"}</p>
            </div>

            <div>
              <p>Access Token: {config?.accessTokenSet ? "gesetzt" : "fehlt"}</p>
              <p>Refresh Token: {config?.refreshTokenSet ? "gesetzt" : "fehlt"}</p>
              <p>Open ID kurz: {getShortValue(config?.externalAccountId)}</p>
              <p>Token bis: {formatDate(config?.expiresAt)}</p>
            </div>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold leading-5 text-amber-900">
          {hasUploadScope
            ? "video.upload ist im Scope sichtbar. Vor echter Aktivierung trotzdem zuerst den vollständigen Upload-Demo-Flow prüfen und TIKTOK_ENABLE_DRAFT_UPLOAD bewusst setzen."
            : "video.upload ist noch nicht im aktiven Scope. Das ist aktuell korrekt: Review-/Demo-Flow vorbereiten, danach Content Posting API / video.upload beantragen."}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm sm:p-7">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-xl font-black text-[#102A43]">
                Review-Text
              </h3>
              <p className="mt-1 text-sm font-semibold leading-6 text-[#627D98]">
                Text für das TikTok-App-Review-Feld.
              </p>
            </div>

            <button
              type="button"
              onClick={() => handleCopy("reviewText", reviewText)}
              className="inline-flex items-center gap-2 rounded-xl border border-[#E7D8C3] bg-[#FFFCF7] px-4 py-2 text-xs font-black text-[#102A43] transition hover:bg-white"
            >
              <Clipboard className="h-4 w-4" />
              {copiedKey === "reviewText" ? "Kopiert" : "Kopieren"}
            </button>
          </div>

          <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap rounded-2xl border border-[#E7D8C3] bg-[#FFFCF7] p-4 text-xs font-bold leading-5 text-[#243B53]">
            {reviewText}
          </pre>
        </div>

        <div className="rounded-[2rem] border border-[#D9E2EC] bg-white p-5 shadow-sm sm:p-7">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-xl font-black text-[#102A43]">
                Demo-Video-Skript
              </h3>
              <p className="mt-1 text-sm font-semibold leading-6 text-[#627D98]">
                Ablauf für die Bildschirmaufnahme.
              </p>
            </div>

            <button
              type="button"
              onClick={() => handleCopy("demoScript", demoScript)}
              className="inline-flex items-center gap-2 rounded-xl border border-[#D9E2EC] bg-[#F8FAFC] px-4 py-2 text-xs font-black text-[#102A43] transition hover:bg-white"
            >
              <Clipboard className="h-4 w-4" />
              {copiedKey === "demoScript" ? "Kopiert" : "Kopieren"}
            </button>
          </div>

          <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap rounded-2xl border border-[#D9E2EC] bg-[#F8FAFC] p-4 text-xs font-bold leading-5 text-[#243B53]">
            {demoScript}
          </pre>
        </div>
      </div>

      <div className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm sm:p-7">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-black text-[#102A43]">
              Production Submission Notes
            </h3>
            <p className="mt-1 text-sm font-semibold leading-6 text-[#627D98]">
              Felder und URLs für TikTok Production.
            </p>
          </div>

          <button
            type="button"
            onClick={() => handleCopy("productionNotes", productionNotes)}
            className="inline-flex items-center gap-2 rounded-xl border border-[#E7D8C3] bg-[#FFFCF7] px-4 py-2 text-xs font-black text-[#102A43] transition hover:bg-white"
          >
            <Clipboard className="h-4 w-4" />
            {copiedKey === "productionNotes" ? "Kopiert" : "Kopieren"}
          </button>
        </div>

        <pre className="mt-4 overflow-auto whitespace-pre-wrap rounded-2xl border border-[#E7D8C3] bg-[#FFFCF7] p-4 text-xs font-bold leading-5 text-[#243B53]">
          {productionNotes}
        </pre>
      </div>

      <div className="rounded-[2rem] border border-[#D9E2EC] bg-white p-5 shadow-sm sm:p-7">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#F8FAFC] text-[#102A43]">
            <Video className="h-5 w-5" />
          </div>

          <div>
            <h3 className="text-xl font-black text-[#102A43]">
              Recording-Checkliste
            </h3>
            <p className="mt-1 text-sm font-semibold leading-6 text-[#627D98]">
              Diese Punkte vor der Demo-Aufnahme prüfen.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {recordingChecklist.map((item, index) => (
            <div
              key={item}
              className="rounded-2xl border border-[#D9E2EC] bg-[#F8FAFC] p-3 text-sm font-bold leading-6 text-[#243B53]"
            >
              <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#102A43] text-xs font-black text-white">
                {index + 1}
              </span>
              {item}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
