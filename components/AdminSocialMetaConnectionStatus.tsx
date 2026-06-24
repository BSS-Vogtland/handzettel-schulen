"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Facebook,
  Instagram,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";

type MetaConfigPlatformStatus = {
  configured: boolean;
  pageIdSet?: boolean;
  businessAccountIdSet?: boolean;
  tokenSet: boolean;
};

type MetaVerificationPlatformStatus = {
  ok: boolean;
  name?: string | null;
  username?: string | null;
  id?: string | null;
  error?: string;
};

type MetaStatusResponse = {
  ok: boolean;
  message?: string;
  checked_at?: string;
  config?: {
    graphApiVersion?: string;
    facebook?: MetaConfigPlatformStatus;
    instagram?: MetaConfigPlatformStatus;
  };
  verification?: {
    facebook?: MetaVerificationPlatformStatus;
    instagram?: MetaVerificationPlatformStatus;
  };
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

function getStatusLabel({
  configured,
  verification,
}: {
  configured: boolean;
  verification?: MetaVerificationPlatformStatus;
}) {
  if (!configured) return "Nicht konfiguriert";
  if (!verification) return "Nicht geprüft";
  if (verification.ok) return "Verbunden";

  return "Fehler";
}

function getStatusClasses({
  configured,
  verification,
}: {
  configured: boolean;
  verification?: MetaVerificationPlatformStatus;
}) {
  if (!configured) {
    return "border-slate-200 bg-slate-50 text-slate-700";
  }

  if (!verification) {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }

  if (verification.ok) {
    return "border-emerald-200 bg-emerald-50 text-emerald-900";
  }

  return "border-red-200 bg-red-50 text-red-900";
}

function PlatformCard({
  type,
  configured,
  configLabel,
  verification,
}: {
  type: "facebook" | "instagram";
  configured: boolean;
  configLabel: string;
  verification?: MetaVerificationPlatformStatus;
}) {
  const Icon = type === "facebook" ? Facebook : Instagram;
  const label = type === "facebook" ? "Facebook" : "Instagram";
  const statusLabel = getStatusLabel({ configured, verification });

  return (
    <article
      className={`rounded-[1.5rem] border p-4 ${getStatusClasses({
        configured,
        verification,
      })}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white">
            <Icon className="h-5 w-5" />
          </div>

          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] opacity-80">
              {label}
            </p>

            <h3 className="mt-1 text-lg font-black">{statusLabel}</h3>
          </div>
        </div>

        {configured && verification?.ok ? (
          <CheckCircle2 className="h-5 w-5 shrink-0" />
        ) : configured && verification && !verification.ok ? (
          <XCircle className="h-5 w-5 shrink-0" />
        ) : (
          <AlertTriangle className="h-5 w-5 shrink-0" />
        )}
      </div>

      <div className="mt-4 rounded-2xl bg-white/80 p-3 text-xs font-bold leading-5">
        <p>{configLabel}</p>

        {verification?.ok ? (
          <p className="mt-2">
            Konto:{" "}
            <span className="font-black">
              {verification.name || verification.username || verification.id || "-"}
            </span>
          </p>
        ) : null}

        {verification?.error ? (
          <div className="mt-3 rounded-xl border border-red-200 bg-white p-3 text-xs font-bold leading-5 text-red-900">
            {verification.error}
          </div>
        ) : null}
      </div>
    </article>
  );
}

export default function AdminSocialMetaConnectionStatus() {
  const [status, setStatus] = useState<MetaStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function loadStatus() {
    try {
      setIsLoading(true);

      const response = await fetch("/api/admin/social/meta/status", {
        method: "GET",
        cache: "no-store",
      });

      const result = (await response.json().catch(() => null)) as
        | MetaStatusResponse
        | null;

      if (!response.ok || !result) {
        throw new Error(
          result?.message || "Meta-Systemstatus konnte nicht geladen werden."
        );
      }

      setStatus(result);
    } catch (error) {
      setStatus({
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Meta-Systemstatus konnte nicht geladen werden.",
        checked_at: new Date().toISOString(),
      });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadStatus();
  }, []);

  const facebookConfigured = Boolean(status?.config?.facebook?.configured);
  const instagramConfigured = Boolean(status?.config?.instagram?.configured);

  return (
    <section className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#E7D8C3] bg-[#FFFCF7] px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-[#8A5A35]">
            <ShieldCheck className="h-4 w-4 text-[#A23A2E]" />
            Meta-Systemstatus
          </div>

          <h2 className="mt-4 text-2xl font-black text-[#102A43]">
            Facebook / Instagram Verbindung
          </h2>

          <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#627D98]">
            Prüft, ob die hinterlegten Meta-Tokens gültig sind und ob Facebook-Seite und Instagram-Business-Konto erreichbar sind.
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
          {status.message || "Meta-Systemstatus konnte nicht geprüft werden."}
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <PlatformCard
          type="facebook"
          configured={facebookConfigured}
          configLabel={
            facebookConfigured
              ? "Page-ID und Token sind gesetzt."
              : "Facebook ist nicht vollständig konfiguriert."
          }
          verification={status?.verification?.facebook}
        />

        <PlatformCard
          type="instagram"
          configured={instagramConfigured}
          configLabel={
            instagramConfigured
              ? "Instagram-Business-ID und Token sind gesetzt."
              : "Instagram ist nicht vollständig konfiguriert."
          }
          verification={status?.verification?.instagram}
        />
      </div>

      <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold leading-5 text-amber-900">
        Wenn hier „Session has expired“, „Code 190“ oder „OAuthException“ erscheint, ist der Meta-Token abgelaufen oder ungültig. Dann muss der Token in Vercel ersetzt und neu deployed werden.
      </div>
    </section>
  );
}
