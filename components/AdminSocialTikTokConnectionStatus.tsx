"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  ShieldCheck,
  Video,
  XCircle,
} from "lucide-react";

type TikTokStatusResponse = {
  ok: boolean;
  checked_at?: string;
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
  };
  verification?: {
    ok: boolean;
    status?: number;
    skipped?: boolean;
    reason?: string;
    error?: unknown;
    payload?: unknown;
  } | null;
};

function formatDate(value: string | undefined) {
  if (!value) return "noch nicht geprüft";

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

export default function AdminSocialTikTokConnectionStatus() {
  const [status, setStatus] = useState<TikTokStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);

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

  useEffect(() => {
    void loadStatus();
  }, []);

  const config = status?.config;
  const verification = status?.verification;
  const isConfigured = Boolean(config?.configured);
  const isConnected = Boolean(verification?.ok);

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
            Prüft, ob TikTok-App, OAuth-Umleitung und Zugriffstoken vorbereitet sind.
            Das echte Video-Publishing bauen wir erst nach sauberem OAuth-Setup.
          </p>

          <p className="mt-2 text-xs font-bold text-[#8A5A35]">
            Letzte Prüfung: {formatDate(status?.checked_at)}
          </p>
        </div>

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
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white">
              <Video className="h-5 w-5" />
            </div>

            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] opacity-80">
                TikTok
              </p>

              <h3 className="mt-1 text-lg font-black">
                {isConnected
                  ? "Verbunden"
                  : isConfigured
                    ? "OAuth vorbereitet"
                    : "Nicht vollständig konfiguriert"}
              </h3>
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
          </div>

          <div>
            <p>Access Token: {config?.accessTokenSet ? "gesetzt" : "fehlt"}</p>
            <p>Refresh Token: {config?.refreshTokenSet ? "gesetzt" : "fehlt"}</p>
            <p>Open ID: {config?.openIdSet ? "gesetzt" : "fehlt"}</p>
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
          <pre className="mt-4 max-h-64 overflow-auto rounded-xl border border-emerald-200 bg-white p-3 text-xs font-bold leading-5 text-emerald-900">
            {stringifyPayload(verification.payload)}
          </pre>
        ) : null}
      </div>

      <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold leading-5 text-amber-900">
        TikTok benötigt eine Developer App, das Content Posting API Produkt und freigegebene Scopes.
        Für Draft-/Inbox-Upload wird video.upload genutzt, für echtes Direct Posting video.publish.
      </div>
    </section>
  );
}
