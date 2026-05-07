"use client";

import { useState } from "react";
import { Mail, Loader2 } from "lucide-react";

type AdminSendOfferUpdateMailButtonProps = {
  requestId: number | string;
};

export default function AdminSendOfferUpdateMailButton({
  requestId,
}: AdminSendOfferUpdateMailButtonProps) {
  const [isSending, setIsSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [variant, setVariant] = useState<"success" | "error" | null>(null);

  async function handleSend() {
    const confirmed = window.confirm(
      "Aktualisierungsmail senden?\n\nDer Kunde erhält das aktuelle Angebot als PDF und einen Button zur offiziellen Annahme."
    );

    if (!confirmed) return;

    setIsSending(true);
    setMessage(null);
    setVariant(null);

    try {
      const response = await fetch(
        `/api/admin/requests/${requestId}/send-update-mail`,
        {
          method: "POST",
        }
      );

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok) {
        throw new Error(
          result?.error ||
            "Die Aktualisierungsmail konnte nicht gesendet werden."
        );
      }

      setVariant("success");
      setMessage("Aktualisierungsmail wurde erfolgreich gesendet.");
    } catch (error) {
      setVariant("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Die Aktualisierungsmail konnte nicht gesendet werden."
      );
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="rounded-3xl border border-[#E8DCCB] bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[#8A3A2B]">
            Aktualisiertes Angebot
          </p>
          <h3 className="mt-1 text-xl font-black text-[#102A43]">
            Angebot erneut per Mail senden
          </h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#5C6B73]">
            Sendet dem Kunden das aktuelle manuell angepasste Angebot als PDF.
            In der Mail befindet sich ein Button, über den der Kunde das Angebot
            offiziell annehmen kann.
          </p>
        </div>

        <button
          type="button"
          onClick={handleSend}
          disabled={isSending}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-[#102A43] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-[#163A5C] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Wird gesendet...
            </>
          ) : (
            <>
              <Mail className="h-4 w-4" />
              Aktualisierungsmail senden
            </>
          )}
        </button>
      </div>

      {message ? (
        <div
          className={
            variant === "success"
              ? "mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800"
              : "mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800"
          }
        >
          {message}
        </div>
      ) : null}
    </div>
  );
}