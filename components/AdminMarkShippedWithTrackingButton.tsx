"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Truck } from "lucide-react";

type AdminMarkShippedWithTrackingButtonProps = {
  requestId: string;
  disabled?: boolean;
};

type MarkShippedResponse = {
  ok?: boolean;
  mailSent?: boolean;
  message?: string;
  error?: string;
  trackingUrl?: string;
};

function buildTrackingUrl(carrier: string, trackingNumber: string) {
  const encoded = encodeURIComponent(trackingNumber.trim());

  if (!encoded) return "";

  switch (carrier) {
    case "dpd":
      return `https://tracking.dpd.de/status/de_DE/parcel/${encoded}`;
    case "dhl":
      return `https://www.dhl.de/de/privatkunden/dhl-sendungsverfolgung.html?piececode=${encoded}`;
    case "hermes":
      return `https://www.myhermes.de/empfangen/sendungsverfolgung/?su=${encoded}`;
    case "gls":
      return `https://gls-group.com/DE/de/paketverfolgung?match=${encoded}`;
    case "ups":
      return `https://www.ups.com/track?tracknum=${encoded}`;
    default:
      return "";
  }
}

export default function AdminMarkShippedWithTrackingButton({
  requestId,
  disabled = false,
}: AdminMarkShippedWithTrackingButtonProps) {
  const router = useRouter();

  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [carrier, setCarrier] = useState("dpd");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [customTrackingUrl, setCustomTrackingUrl] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [variant, setVariant] = useState<"success" | "error" | null>(null);

  const suggestedTrackingUrl = useMemo(
    () => buildTrackingUrl(carrier, trackingNumber),
    [carrier, trackingNumber]
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSaving) return;

    const cleanTrackingNumber = trackingNumber.trim();

    if (!cleanTrackingNumber) {
      setVariant("error");
      setMessage("Bitte gib eine Paketnummer ein.");
      return;
    }

    setIsSaving(true);
    setMessage(null);
    setVariant(null);

    try {
      const response = await fetch(
        `/api/admin/requests/${encodeURIComponent(requestId)}/shipping/mark-shipped`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            carrier,
            trackingNumber: cleanTrackingNumber,
            trackingUrl: customTrackingUrl.trim(),
          }),
        }
      );

      const result = (await response.json().catch(() => null)) as
        | MarkShippedResponse
        | null;

      if (!response.ok || !result?.ok) {
        throw new Error(
          result?.message ||
            result?.error ||
            "Paket konnte nicht als versendet markiert werden."
        );
      }

      setVariant(result.mailSent ? "success" : "error");
      setMessage(result.message || "Paket wurde als versendet markiert.");

      window.setTimeout(() => {
        router.refresh();
      }, 700);
    } catch (error) {
      setVariant("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Paket konnte nicht als versendet markiert werden."
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(true)}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#2F7D50] px-4 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Truck className="h-4 w-4" />
        Versendet
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full rounded-2xl border border-[#BFE3CD] bg-[#F0FFF6] p-4"
    >
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[#2F7D50]">
            Versanddaten
          </p>
          <h3 className="mt-1 text-base font-black text-[#102A43]">
            Versand bestätigen und Kundenmail senden
          </h3>
          <p className="mt-1 text-xs font-bold leading-5 text-[#52616F]">
            Nach dem Speichern wird der Vorgang auf versendet gesetzt und der
            Kunde erhält eine Mail mit Sendungsverfolgung.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsOpen(false)}
          disabled={isSaving}
          className="rounded-xl bg-white px-3 py-2 text-xs font-black text-[#52616F]"
        >
          Abbrechen
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label>
          <span className="mb-1 block text-xs font-black uppercase tracking-[0.12em] text-[#52616F]">
            Versanddienst
          </span>
          <select
            value={carrier}
            onChange={(event) => setCarrier(event.target.value)}
            className="min-h-11 w-full rounded-2xl border border-[#BFE3CD] bg-white px-3 py-2 text-sm font-bold text-[#102A43] outline-none"
          >
            <option value="dpd">DPD</option>
            <option value="dhl">DHL</option>
            <option value="hermes">Hermes</option>
            <option value="gls">GLS</option>
            <option value="ups">UPS</option>
            <option value="sonstiges">Sonstiges</option>
          </select>
        </label>

        <label>
          <span className="mb-1 block text-xs font-black uppercase tracking-[0.12em] text-[#52616F]">
            Paketnummer
          </span>
          <input
            value={trackingNumber}
            onChange={(event) => setTrackingNumber(event.target.value)}
            placeholder="z. B. DPD Paketnummer"
            className="min-h-11 w-full rounded-2xl border border-[#BFE3CD] bg-white px-3 py-2 text-sm font-bold text-[#102A43] outline-none"
          />
        </label>

        <label className="md:col-span-2">
          <span className="mb-1 block text-xs font-black uppercase tracking-[0.12em] text-[#52616F]">
            Trackinglink optional überschreiben
          </span>
          <input
            value={customTrackingUrl}
            onChange={(event) => setCustomTrackingUrl(event.target.value)}
            placeholder={suggestedTrackingUrl || "Optionaler Link zur Sendungsverfolgung"}
            className="min-h-11 w-full rounded-2xl border border-[#BFE3CD] bg-white px-3 py-2 text-sm font-bold text-[#102A43] outline-none"
          />

          {suggestedTrackingUrl && !customTrackingUrl.trim() ? (
            <p className="mt-2 break-all text-xs font-bold leading-5 text-[#2F7D50]">
              Automatischer Link: {suggestedTrackingUrl}
            </p>
          ) : null}
        </label>
      </div>

      {message ? (
        <p
          className={`mt-3 rounded-2xl border px-4 py-3 text-sm font-bold ${
            variant === "success"
              ? "border-[#BFE3CD] bg-white text-[#2F7D50]"
              : "border-[#F2B8B8] bg-white text-[#B5282D]"
          }`}
        >
          {message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isSaving}
        className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#2F7D50] px-4 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSaving ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Speichere und sende Mail ...
          </>
        ) : (
          <>
            <CheckCircle2 className="h-4 w-4" />
            Versand speichern und Mail senden
          </>
        )}
      </button>
    </form>
  );
}
