"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Loader2,
  Save,
} from "lucide-react";

type IntegrationRow = {
  id: string;
  provider: string;
  provider_label: string;
  status: string;
  account_label: string | null;
  account_identifier: string | null;
  external_account_url: string | null;
  setup_notes: string | null;
  internal_notes: string | null;
  is_required: boolean;
  last_checked_at: string | null;
};

type ApiResponse = {
  ok?: boolean;
  message?: string;
};

type FormState = {
  status: string;
  account_label: string;
  account_identifier: string;
  external_account_url: string;
  setup_notes: string;
  internal_notes: string;
  is_required: boolean;
};

function getStatusLabel(status: string) {
  switch (status) {
    case "not_started":
      return "Noch nicht eingerichtet";
    case "prepared":
      return "Vorbereitet";
    case "connected":
      return "Verbunden";
    case "needs_attention":
      return "Prüfung nötig";
    case "error":
      return "Fehler";
    default:
      return status;
  }
}

function getStatusClasses(status: string) {
  switch (status) {
    case "connected":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "prepared":
      return "border-blue-200 bg-blue-50 text-blue-800";
    case "needs_attention":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "error":
      return "border-red-200 bg-red-50 text-red-800";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function getProviderHint(provider: string) {
  switch (provider) {
    case "openai":
      return "Der Kunde sollte seinen eigenen OpenAI-Account und API-Key betreiben. In V1 wird hier nur der Status dokumentiert, kein API-Key gespeichert.";
    case "meta":
      return "Für Facebook/Instagram Ads und späteres Posting braucht der Kunde Meta Business, eine Facebook-Seite, ein Instagram-Business-Konto und ein Werbekonto.";
    case "google_ads":
      return "Für Google Ads braucht der Kunde ein eigenes Google-Ads-Konto. Später wird hier die Google-Ads-Kundennummer oder Manager-Verknüpfung relevant.";
    case "tiktok":
      return "Für TikTok braucht der Kunde ein TikTok-Business-/Ads-Konto. Posting und Ads brauchen später getrennte API-Freigaben.";
    default:
      return "Hier wird der Einrichtungsstatus dieser externen Integration dokumentiert.";
  }
}

function formatDateTime(value: string | null) {
  if (!value) return "Noch nicht geprüft";

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function AdminSocialIntegrationCard({
  integration,
}: {
  integration: IntegrationRow;
}) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);

  const [form, setForm] = useState<FormState>(() => ({
    status: integration.status || "not_started",
    account_label: integration.account_label || "",
    account_identifier: integration.account_identifier || "",
    external_account_url: integration.external_account_url || "",
    setup_notes: integration.setup_notes || "",
    internal_notes: integration.internal_notes || "",
    is_required: Boolean(integration.is_required),
  }));

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function handleSave(markChecked = false) {
    if (isSaving) return;

    setIsSaving(true);

    try {
      const response = await fetch(
        `/api/admin/social/integrations/${integration.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            status: form.status,
            account_label: form.account_label,
            account_identifier: form.account_identifier,
            external_account_url: form.external_account_url,
            setup_notes: form.setup_notes,
            internal_notes: form.internal_notes,
            is_required: form.is_required,
            mark_checked: markChecked,
          }),
        }
      );

      const json = (await response.json()) as ApiResponse;

      if (!response.ok || !json.ok) {
        window.alert(json.message || "Integration konnte nicht gespeichert werden.");
        return;
      }

      window.alert(json.message || "Integration wurde gespeichert.");
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unbekannter Fehler beim Speichern.";

      window.alert(message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <article className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm sm:p-7">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${getStatusClasses(
                form.status
              )}`}
            >
              {getStatusLabel(form.status)}
            </span>

            {form.is_required ? (
              <span className="inline-flex rounded-full border border-[#E7D8C3] bg-[#FFFCF7] px-3 py-1 text-xs font-black text-[#8A5A35]">
                Erforderlich
              </span>
            ) : null}
          </div>

          <h2 className="mt-3 text-2xl font-black text-[#102A43]">
            {integration.provider_label}
          </h2>

          <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-[#52616F]">
            {getProviderHint(integration.provider)}
          </p>
        </div>

        <div className="rounded-2xl border border-[#E7D8C3] bg-[#FFFCF7] px-4 py-3 text-sm font-bold text-[#52616F]">
          Letzte Prüfung:
          <br />
          <span className="text-[#102A43]">
            {formatDateTime(integration.last_checked_at)}
          </span>
        </div>
      </div>

      <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold leading-6 text-amber-900">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <p>
            Keine geheimen API-Keys oder Passwörter in diese Felder schreiben.
            Zugangsdaten werden später über sichere OAuth-/Vault-Logik oder
            serverseitige Secrets gelöst.
          </p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-black text-[#102A43]">
            Status
          </label>
          <select
            value={form.status}
            onChange={(event) => updateField("status", event.target.value)}
            className="w-full rounded-2xl border border-[#E7D8C3] bg-white px-4 py-3 text-sm font-black outline-none focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
          >
            <option value="not_started">Noch nicht eingerichtet</option>
            <option value="prepared">Vorbereitet</option>
            <option value="connected">Verbunden</option>
            <option value="needs_attention">Prüfung nötig</option>
            <option value="error">Fehler</option>
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm font-black text-[#102A43]">
            Für dieses Projekt erforderlich?
          </label>
          <select
            value={form.is_required ? "yes" : "no"}
            onChange={(event) =>
              updateField("is_required", event.target.value === "yes")
            }
            className="w-full rounded-2xl border border-[#E7D8C3] bg-white px-4 py-3 text-sm font-black outline-none focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
          >
            <option value="yes">Ja</option>
            <option value="no">Nein</option>
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm font-black text-[#102A43]">
            Konto-/Account-Name
          </label>
          <input
            value={form.account_label}
            onChange={(event) =>
              updateField("account_label", event.target.value)
            }
            className="w-full rounded-2xl border border-[#E7D8C3] bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
            placeholder="z. B. Meta Business Müller GmbH"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-black text-[#102A43]">
            Account-ID / Referenz
          </label>
          <input
            value={form.account_identifier}
            onChange={(event) =>
              updateField("account_identifier", event.target.value)
            }
            className="w-full rounded-2xl border border-[#E7D8C3] bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
            placeholder="z. B. Werbekonto-ID, Kundennummer, Business-ID"
          />
        </div>

        <div className="lg:col-span-2">
          <label className="mb-2 block text-sm font-black text-[#102A43]">
            Externer Konto-Link
          </label>
          <input
            value={form.external_account_url}
            onChange={(event) =>
              updateField("external_account_url", event.target.value)
            }
            className="w-full rounded-2xl border border-[#E7D8C3] bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
            placeholder="https://..."
          />

          {form.external_account_url ? (
            <a
              href={form.external_account_url}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-2 text-sm font-black text-[#B5282D] hover:underline"
            >
              Link öffnen
              <ExternalLink className="h-4 w-4" />
            </a>
          ) : null}
        </div>

        <div>
          <label className="mb-2 block text-sm font-black text-[#102A43]">
            Einrichtungshinweise
          </label>
          <textarea
            value={form.setup_notes}
            onChange={(event) => updateField("setup_notes", event.target.value)}
            rows={5}
            className="w-full rounded-2xl border border-[#E7D8C3] bg-white px-4 py-3 text-sm font-semibold leading-6 outline-none focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
            placeholder="Was muss der Kunde noch einrichten?"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-black text-[#102A43]">
            Interne Notiz
          </label>
          <textarea
            value={form.internal_notes}
            onChange={(event) =>
              updateField("internal_notes", event.target.value)
            }
            rows={5}
            className="w-full rounded-2xl border border-[#E7D8C3] bg-white px-4 py-3 text-sm font-semibold leading-6 outline-none focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
            placeholder="Support-Hinweise, Prüfstand, Besonderheiten ..."
          />
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          onClick={() => handleSave(false)}
          disabled={isSaving}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#B5282D] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {isSaving ? "Speichern ..." : "Integration speichern"}
        </button>

        <button
          type="button"
          onClick={() => handleSave(true)}
          disabled={isSaving}
          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#E7D8C3] bg-[#FFFCF7] px-5 py-3 text-sm font-black text-[#102A43] shadow-sm transition hover:bg-[#F5E8D8] disabled:cursor-not-allowed disabled:opacity-70"
        >
          <CheckCircle2 className="h-4 w-4" />
          Speichern & als geprüft markieren
        </button>
      </div>
    </article>
  );
}