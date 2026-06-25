"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
  Video,
  XCircle,
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

function stringifyPayload(value: unknown) {
  if (!value) return "";

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function getSourceLabel(source: TikTokStatusResponse["source"]) {
  switch (source) {
    case "database":
      return "Supabase Verbindung";
    case "environment":
      return "ENV Fallback";
    case "none":
    default:
      return "keine Verbindung";
  }
}

function getShortOpenId(value: string | null | undefined) {
  if (!value) return "—";
  if (value.length <= 14) return value;

  return `${value.slice(0, 7)}…${value.slice(-5)}`;
}

export default function AdminSocialTikTokConnectionStatus() {
  const [status, setStatus] = useState<TikTokStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);

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

  async function refreshToken() {
    try {
      setIsRefreshing(true);

      const response = await fetch("/api/admin/social/tiktok/oauth/refresh", {
        method: "POST",
        cache: "no-store",
      });

      const result = (await response.json().catch(() => null)) as
        | { ok?: boolean; message?: string }
        | null;

      if (!response.ok || !result?.ok) {
        throw new Error(
          result?.message || "TikTok Token konnte nicht aktualisiert werden."
        );
      }

      await loadStatus();
    } catch (error) {
      setStatus((current) => ({
        ...(current || { ok: false }),
        ok: false,
        checked_at: new Date().toISOString(),
        message:
          error instanceof Error
            ? error.message
            : "TikTok Token konnte nicht aktualisiert werden.",
      }));
    } finally {
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    void loadStatus();
  }, []);

  const config = status?.config;
  const verification = status?.verification;
  const user = verification?.user || null;
  const isConfigured = Boolean(config?.configured);
  const isConnected = Boolean(verification?.ok);
  const accountName =
    user?.display_name || config?.accountName || "TikTok-Konto verbunden";
  const openId = user?.open_id || config?.externalAccountId || null;

  return (
    <section className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#E7D8C3] bg-[#FFFCF7] px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-[#8A5A35]">
            <ShieldCheck className="h-4 w-4 text-[#A23A2E]" />
            TikTok-Systemstatus
          </div>

          <h2 className="mt-4 text-2xl font-black text-[#102A43]">
            TikTok Verbindung
          </h2>

          <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#627D98]">
            TikTok ist aktuell per Login Kit angebunden. Der OAuth-Flow speichert
            Access- und Refresh-Token serverseitig in Supabase. Video-Upload und
            echtes Publishing folgen nach der Content-Posting-Freigabe.
          </p>

          <p className="mt-2 text-xs font-bold text-[#8A5A35]">
            Letzte Prüfung: {formatDate(status?.checked_at)}
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <a
            href="/api/admin/social/tiktok/oauth/start"
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#A23A2E] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110"
          >
            <ExternalLink className="h-4 w-4" />
            TikTok verbinden
          </a>

          <button
            type="button"
            onClick={() => refreshToken()}
            disabled={isRefreshing}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#E7D8C3] bg-white px-5 py-3 text-sm font-black text-[#486581] shadow-sm transition hover:bg-[#FFFCF7] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw
              className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
            />
            Token refresh
          </button>

          <button
            type="button"
            onClick={() => loadStatus()}
            disabled={isLoading}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#102A43] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            {isLoading ? "Prüft ..." : "Status prüfen"}
          </button>
        </div>
      </div>

      {status?.ok === false ? (
        <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold leading-6 text-red-900">
          {status.message || "TikTok-Systemstatus konnte nicht geprüft werden."}
        </div>
      ) : null}

      <div
        className={`mt-6 rounded-[1.5rem] border p-4 ${
          isConnected
            ? "border-emerald-200 bg-emerald-50 text-emerald-900"
            : isConfigured
              ? "border-amber-200 bg-amber-50 text-amber-900"
              : "border-slate-200 bg-slate-50 text-slate-700"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white">
              {user?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.avatar_url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <Video className="h-5 w-5" />
              )}
            </div>

            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] opacity-80">
                TikTok · {getSourceLabel(status?.source)}
              </p>

              <h3 className="mt-1 text-lg font-black">
                {isConnected
                  ? "Verbunden"
                  : isConfigured
                    ? "OAuth vorbereitet"
                    : "Nicht vollständig konfiguriert"}
              </h3>

              {isConnected ? (
                <p className="mt-1 text-sm font-bold opacity-90">
                  Konto: {accountName}
                </p>
              ) : null}
            </div>
          </div>

          {isConnected ? (
            <CheckCircle2 className="h-5 w-5 shrink-0" />
          ) : isConfigured ? (
            <AlertTriangle className="h-5 w-5 shrink-0" />
          ) : (
            <XCircle className="h-5 w-5 shrink-0" />
          )}
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
            <p>Open ID: {config?.openIdSet ? "gesetzt" : "fehlt"}</p>
            <p>Open ID kurz: {getShortOpenId(openId)}</p>
            <p>Token bis: {formatDate(config?.expiresAt)}</p>
            <p>Refresh bis: {formatDate(config?.refreshExpiresAt)}</p>
          </div>
        </div>

        {verification?.reason ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-white p-3 text-xs font-bold leading-5 text-amber-900">
            {verification.reason}
          </div>
        ) : null}

        {verification?.error ? (
          <pre className="mt-4 max-h-64 overflow-auto rounded-xl border border-red-200 bg-white p-3 text-xs font-bold leading-5 text-red-900">
            {stringifyPayload(verification.error)}
          </pre>
        ) : null}

        {verification?.payload ? (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setShowTechnicalDetails((value) => !value)}
              className="rounded-xl border border-emerald-200 bg-white px-4 py-2 text-xs font-black text-emerald-900 transition hover:bg-emerald-50"
            >
              {showTechnicalDetails
                ? "Technische Details ausblenden"
                : "Technische Details anzeigen"}
            </button>

            {showTechnicalDetails ? (
              <pre className="mt-3 max-h-64 overflow-auto rounded-xl border border-emerald-200 bg-white p-3 text-xs font-bold leading-5 text-emerald-900">
                {stringifyPayload(verification.payload)}
              </pre>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold leading-5 text-amber-900">
        Aktueller Stand: TikTok Login Kit ist verbunden und der Scope user.info.basic
        funktioniert. Content Posting API, video.upload und später video.publish sind
        bewusst der nächste Block, weil dafür Demo-Video, Review und zusätzliche Freigaben
        sauber vorbereitet werden müssen.
      </div>
    </section>
  );
}
