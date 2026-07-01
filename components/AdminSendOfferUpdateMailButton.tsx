"use client";

import { CheckCircle2, Loader2, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type AdminSendOfferUpdateMailButtonProps = {
  requestId: string;
};

export default function AdminSendOfferUpdateMailButton({
  requestId,
}: AdminSendOfferUpdateMailButtonProps) {
  const router = useRouter();
  const [isSending, setIsSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isSent, setIsSent] = useState(false);

  async function handleSend() {
    const confirmed = window.confirm(
      "Paketwunsch-Mail senden?\n\nDer Kunde erhält den Link zur Kundenseite, kann den vorbereiteten Paketwunsch prüfen und anschließend bewusst bestätigen. Diese Mail enthält keine Rechnung und keine Zahlungsaufforderung."
    );

    if (!confirmed) return;

    setIsSending(true);
    setMessage(null);

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
          result?.error || "Die Paketwunsch-Mail konnte nicht gesendet werden."
        );
      }

      setIsSent(true);
      setMessage(result?.message || "Paketwunsch-Mail wurde erfolgreich gesendet.");
      router.refresh();
    } catch (error) {
      setIsSent(false);
      setMessage(
        error instanceof Error
          ? error.message
          : "Die Paketwunsch-Mail konnte nicht gesendet werden."
      );
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="rounded-3xl border border-[#E8DED2] bg-[#FBF7F0] p-5">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-[#A75B28]">
          <Mail className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
            Paketwunsch-Mail
          </p>

          <h3 className="mt-1 text-lg font-black text-[#102A43]">
            „Dein Paketwunsch ist fertig“ senden
          </h3>

          <p className="mt-2 text-sm font-semibold leading-6 text-[#52616F]">
            Der Kunde erhält den Link zur Kundenseite, prüft dort den vorbereiteten
            Paketwunsch und bestätigt ihn anschließend selbst. Erst danach geht es
            in den Checkout.
          </p>

          <p className="mt-3 rounded-2xl border border-[#F1D1A8] bg-[#FFF8EE] p-3 text-xs font-bold leading-5 text-[#A75B28]">
            Wichtig: Diese Mail ist keine Rechnung, keine Zahlungsaufforderung und
            keine automatische Bestellung.
          </p>

          <button
            type="button"
            onClick={handleSend}
            disabled={isSending}
            className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#B5282D] px-4 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Wird gesendet ...
              </>
            ) : isSent ? (
              <>
                <CheckCircle2 className="h-4 w-4" />
                Paketwunsch-Mail gesendet
              </>
            ) : (
              <>
                <Mail className="h-4 w-4" />
                Paketwunsch ist fertig senden
              </>
            )}
          </button>

          {message ? (
            <p className="mt-3 text-sm font-bold leading-6 text-[#52616F]">
              {message}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
