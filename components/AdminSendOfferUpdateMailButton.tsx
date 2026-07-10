"use client";

import { CheckCircle2, Loader2, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type AdminSendOfferUpdateMailButtonProps = {
  requestId: string;
};

type ApiResponse = {
  ok?: boolean;
  message?: string;
  error?: string;
};

async function readApiResponse(response: Response): Promise<ApiResponse> {
  const text = await response.text();

  if (!text) return {};

  try {
    return JSON.parse(text) as ApiResponse;
  } catch {
    return { error: text };
  }
}

export default function AdminSendOfferUpdateMailButton({
  requestId,
}: AdminSendOfferUpdateMailButtonProps) {
  const router = useRouter();
  const [isStarting, setIsStarting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isSent, setIsSent] = useState(false);

  function handleSend() {
    const confirmed = window.confirm(
      "Paketwunsch-Mail senden?\n\nDer Kunde erhält den Link zur Kundenseite, kann den vorbereiteten Paketwunsch prüfen und anschließend bewusst bestätigen. Diese Mail enthält keine Rechnung und keine Zahlungsaufforderung."
    );

    if (!confirmed || isStarting || isSent) return;

    setIsStarting(true);
    setMessage("Paketwunsch-Mailversand wurde gestartet. Die Oberfläche wartet nicht auf SMTP.");
    setIsSent(true);

    const requestPromise = fetch(
      `/api/admin/requests/${requestId}/send-update-mail`,
      {
        method: "POST",
        cache: "no-store",
        keepalive: true,
      }
    )
      .then(async (response) => {
        const result = await readApiResponse(response);

        if (!response.ok || result.ok === false) {
          throw new Error(
            result.error ||
              result.message ||
              "Die Paketwunsch-Mail konnte nicht gestartet werden."
          );
        }

        setMessage(
          result.message ||
            "Paketwunsch-Mailversand wurde gestartet. Der Versand läuft im Hintergrund."
        );

        window.setTimeout(() => {
          router.refresh();
        }, 600);
      })
      .catch((error) => {
        setIsSent(false);
        setMessage(
          error instanceof Error
            ? error.message
            : "Die Paketwunsch-Mail konnte nicht gestartet werden."
        );
      })
      .finally(() => {
        setIsStarting(false);
      });

    void requestPromise;

    window.setTimeout(() => {
      setIsStarting(false);
    }, 700);
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleSend}
        disabled={isStarting || isSent}
        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#B5282D] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isStarting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isSent ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : (
          <Mail className="h-4 w-4" />
        )}

        {isStarting
          ? "Wird gestartet ..."
          : isSent
            ? "Mailversand gestartet"
            : "Paketwunsch-Mail senden"}
      </button>

      {message ? (
        <div className="mt-3 flex items-start gap-2 rounded-2xl border border-[#BFE3CD] bg-[#F0FFF6] px-4 py-3 text-sm font-semibold text-[#2F7D50]">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{message}</span>
        </div>
      ) : null}
    </div>
  );
}
