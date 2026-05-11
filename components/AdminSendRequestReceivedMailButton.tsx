"use client";

import { useState } from "react";
import { CheckCircle2, Inbox, Loader2 } from "lucide-react";

type AdminSendRequestReceivedMailButtonProps = {
  requestId: number | string;
};

export default function AdminSendRequestReceivedMailButton({
  requestId,
}: AdminSendRequestReceivedMailButtonProps) {
  const [isSending, setIsSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [variant, setVariant] = useState<"success" | "error" | null>(null);

  async function handleSend() {
    const confirmed = window.confirm(
      "Eingangsmail senden?\n\nDer Kunde erhält eine kurze Bestätigung, dass seine Schulmaterialliste bei uns angekommen ist. Es wird noch kein Paketwunsch-Link gesendet."
    );

    if (!confirmed) return;

    setIsSending(true);
    setMessage(null);
    setVariant(null);

    try {
      const response = await fetch(
        `/api/admin/requests/${requestId}/send-received-mail`,
        {
          method: "POST",
        }
      );

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok) {
        throw new Error(
          result?.error || "Die Eingangsmail konnte nicht gesendet werden."
        );
      }

      setVariant("success");
      setMessage(result?.message || "Eingangsmail wurde erfolgreich gesendet.");
    } catch (error) {
      setVariant("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Die Eingangsmail konnte nicht gesendet werden."
      );
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="rounded-[32px] border border-[#E8DED2] bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#FBF7F0] text-[#A75B28]">
            <Inbox className="h-5 w-5" />
          </div>

          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
              Eingangsmail
            </p>

            <h3 className="mt-1 text-xl font-black text-[#102A43]">
              Eingang der Liste bestätigen
            </h3>

            <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-[#52616F]">
              Sendet dem Kunden eine kurze Bestätigung, dass die
              Schulmaterialliste bei uns angekommen ist. Diese Mail enthält noch
              keinen Paketwunsch-Link.
            </p>

            <div className="mt-3 rounded-2xl border border-[#F1D1A8] bg-[#FFF8EE] px-4 py-3 text-sm font-bold leading-6 text-[#A75B28]">
              Wichtig: Diese Mail ist nur die Eingangsbestätigung. Der
              Paketwunsch wird erst später nach der Vorbereitung gesendet.
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSend}
          disabled={isSending}
          className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-2xl bg-[#12395F] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Wird gesendet …
            </>
          ) : (
            <>
              <Inbox className="h-4 w-4" />
              Eingangsmail senden
            </>
          )}
        </button>
      </div>

      {message ? (
        <div
          className={
            variant === "success"
              ? "mt-4 flex items-start gap-2 rounded-2xl border border-[#BFE3CD] bg-[#F0FFF6] px-4 py-3 text-sm font-bold text-[#2F7D50]"
              : "mt-4 rounded-2xl border border-[#F2B8B8] bg-[#FFF1F1] px-4 py-3 text-sm font-bold text-[#B5282D]"
          }
        >
          {variant === "success" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          ) : null}
          <span>{message}</span>
        </div>
      ) : null}
    </div>
  );
}