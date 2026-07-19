"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";

type AdminCheckoutOverridePanelProps = {
  requestId: string;
  initialEnabled: boolean;
  initialEnabledAt: string | null;
  initialNote: string | null;
  initialEnabledBy: string | null;
  rawBlockingCount: number;
  offerItemsCount: number;
};

type ApiResponse = {
  ok?: boolean;
  message?: string;
  checkoutOverrideEnabled?: boolean;
  rawBlockingCount?: number;
};

function formatDateTime(value: string | null) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function AdminCheckoutOverridePanel({
  requestId,
  initialEnabled,
  initialEnabledAt,
  initialNote,
  initialEnabledBy,
  rawBlockingCount,
  offerItemsCount,
}: AdminCheckoutOverridePanelProps) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [enabledAt, setEnabledAt] = useState(initialEnabledAt);
  const [enabledBy, setEnabledBy] = useState(initialEnabledBy);
  const [note, setNote] = useState(initialNote || "");
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const formattedEnabledAt = formatDateTime(enabledAt);
  const hasPackageItems = offerItemsCount > 0;

  async function updateOverride(action: "enable" | "disable") {
    if (isSaving) return;

    const enabling = action === "enable";
    const confirmationText = enabling
      ? rawBlockingCount > 0
        ? `Kundenabschluss trotz ${rawBlockingCount} technisch offener Position${
            rawBlockingCount === 1 ? "" : "en"
          } freigeben?`
        : "Kundenabschluss zusätzlich manuell freigeben? Aktuell erkennt die zentrale Prüfung keine offenen Positionen."
      : "Manuelle Freigabe zurücknehmen? Der Kundenabschluss wird danach wieder durch offene Positionen blockiert.";

    if (!window.confirm(confirmationText)) {
      return;
    }

    try {
      setIsSaving(true);
      setMessage(null);
      setError(null);

      const response = await fetch(
        `/api/admin/requests/${encodeURIComponent(requestId)}/checkout-override`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action,
            note: enabling ? note.trim() : "",
          }),
        },
      );

      const payload = (await response
        .json()
        .catch(() => null)) as ApiResponse | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(
          payload?.message ||
            "Die manuelle Kundenabschluss-Freigabe konnte nicht gespeichert werden.",
        );
      }

      const nextEnabled = payload.checkoutOverrideEnabled === true;
      setEnabled(nextEnabled);
      setEnabledAt(nextEnabled ? new Date().toISOString() : null);
      setEnabledBy(nextEnabled ? "admin" : null);
      setMessage(payload.message || "Freigabe wurde gespeichert.");

      router.refresh();
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Die manuelle Kundenabschluss-Freigabe konnte nicht gespeichert werden.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section
      className={`rounded-[32px] border p-5 shadow-sm sm:p-6 ${
        enabled
          ? "border-[#BFE3CD] bg-[#F0FFF6]"
          : rawBlockingCount > 0
            ? "border-[#F1D1A8] bg-[#FFF8EE]"
            : "border-[#C8D8E8] bg-[#EEF4FA]"
      }`}
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white ${
              enabled
                ? "text-[#2F7D50]"
                : rawBlockingCount > 0
                  ? "text-[#A75B28]"
                  : "text-[#12395F]"
            }`}
          >
            {enabled ? (
              <ShieldCheck className="h-5 w-5" />
            ) : rawBlockingCount > 0 ? (
              <AlertTriangle className="h-5 w-5" />
            ) : (
              <CheckCircle2 className="h-5 w-5" />
            )}
          </div>

          <div className="min-w-0">
            <p
              className={`text-xs font-black uppercase tracking-[0.16em] ${
                enabled
                  ? "text-[#2F7D50]"
                  : rawBlockingCount > 0
                    ? "text-[#A75B28]"
                    : "text-[#12395F]"
              }`}
            >
              Kundenabschluss
            </p>

            <h2 className="mt-1 text-xl font-black text-[#102A43]">
              {enabled
                ? "Abschluss manuell freigegeben"
                : rawBlockingCount > 0
                  ? "Abschluss wird noch blockiert"
                  : "Abschluss automatisch freigegeben"}
            </h2>

            <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#52616F]">
              {enabled
                ? "Der Kunde kann den Checkout trotz technisch offener Listenpositionen abschließen. Ein leerer Paketwunsch und fehlende Checkout-Pflichtangaben bleiben weiterhin blockiert."
                : rawBlockingCount > 0
                  ? `${rawBlockingCount} Listenposition${
                      rawBlockingCount === 1 ? "" : "en"
                    } gelten nach der zentralen Workflowprüfung noch als offen. Du kannst die Ursache bearbeiten oder den Abschluss ausdrücklich übersteuern.`
                  : "Alle Listenpositionen gelten nach der zentralen Workflowprüfung als erledigt. Eine manuelle Übersteuerung ist derzeit nicht erforderlich."}
            </p>

            {enabled && (formattedEnabledAt || enabledBy || note) ? (
              <div className="mt-3 rounded-2xl border border-[#BFE3CD] bg-white px-4 py-3 text-xs font-semibold leading-5 text-[#52616F]">
                {formattedEnabledAt ? (
                  <p>
                    <span className="font-black text-[#102A43]">
                      Freigegeben:
                    </span>{" "}
                    {formattedEnabledAt}
                  </p>
                ) : null}
                {enabledBy ? (
                  <p className="mt-1">
                    <span className="font-black text-[#102A43]">Durch:</span>{" "}
                    {enabledBy}
                  </p>
                ) : null}
                {note ? (
                  <p className="mt-1">
                    <span className="font-black text-[#102A43]">Notiz:</span>{" "}
                    {note}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="w-full shrink-0 lg:w-[320px]">
          {!enabled ? (
            <label className="block">
              <span className="mb-2 block text-sm font-black text-[#102A43]">
                Interne Freigabenotiz
              </span>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={500}
                rows={3}
                placeholder="Optional, z. B. Paket vollständig geprüft."
                disabled={isSaving}
                className="w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 py-3 text-sm font-semibold text-[#102A43] outline-none transition focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10 disabled:opacity-60"
              />
            </label>
          ) : null}

          <button
            type="button"
            onClick={() => updateOverride(enabled ? "disable" : "enable")}
            disabled={isSaving || (!enabled && !hasPackageItems)}
            className={`mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-black shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60 ${
              enabled
                ? "border border-[#D8C8B8] bg-white text-[#102A43] hover:bg-[#FBF7F0]"
                : "bg-[#B5282D] text-white hover:brightness-110"
            }`}
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Wird gespeichert …
              </>
            ) : enabled ? (
              <>
                <RotateCcw className="h-4 w-4" />
                Freigabe zurücknehmen
              </>
            ) : (
              <>
                <ShieldCheck className="h-4 w-4" />
                Kundenabschluss manuell freigeben
              </>
            )}
          </button>

          {!hasPackageItems && !enabled ? (
            <p className="mt-2 text-xs font-semibold leading-5 text-[#A75B28]">
              Eine Freigabe ist erst möglich, sobald mindestens eine
              Paketposition vorhanden ist.
            </p>
          ) : null}

          {message ? (
            <p className="mt-3 rounded-2xl border border-[#BFE3CD] bg-white px-4 py-3 text-sm font-semibold text-[#2F7D50]">
              {message}
            </p>
          ) : null}

          {error ? (
            <p className="mt-3 rounded-2xl border border-[#F0C7C7] bg-white px-4 py-3 text-sm font-semibold text-[#B5282D]">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
