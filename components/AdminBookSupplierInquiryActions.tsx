"use client";

import { CheckCircle2, Clipboard, Loader2, Send } from "lucide-react";
import { useState } from "react";

type Props = {
  inquiryId: string;
  inquiryNumber: string;
  supplierPortalUrl: string;
  canSend: boolean;
  wasSent: boolean;
};

export default function AdminBookSupplierInquiryActions({
  inquiryId,
  inquiryNumber,
  supplierPortalUrl,
  canSend,
  wasSent,
}: Props) {
  const [isSending, setIsSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function sendInquiry() {
    if (isSending || !canSend) return;

    setIsSending(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch(
        `/api/admin/book-supplier/inquiries/${encodeURIComponent(
          inquiryId,
        )}/send`,
        {
          method: "POST",
        },
      );

      const payload = (await response.json()) as {
        ok?: boolean;
        message?: string;
      };

      if (!response.ok || !payload.ok) {
        throw new Error(
          payload.message || "Die Anfrage konnte nicht versendet werden.",
        );
      }

      setMessage(
        payload.message || `Die Anfrage ${inquiryNumber} wurde versendet.`,
      );
      window.setTimeout(() => window.location.reload(), 800);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Die Anfrage konnte nicht versendet werden.",
      );
    } finally {
      setIsSending(false);
    }
  }

  async function copyPortalUrl() {
    try {
      await navigator.clipboard.writeText(supplierPortalUrl);
      setMessage("Der Lieferantenlink wurde kopiert.");
      setError(null);
    } catch {
      setError("Der Lieferantenlink konnte nicht kopiert werden.");
    }
  }

  return (
    <div className="grid gap-3">
      {message ? (
        <div className="flex items-start gap-2 rounded-2xl border border-[#BFE3CD] bg-[#F0FFF6] p-3 text-sm font-bold text-[#2F7D50]">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          {message}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-[#F0B7BA] bg-[#FFF1F1] p-3 text-sm font-bold text-[#9F1D24]">
          {error}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => void sendInquiry()}
        disabled={isSending || !canSend}
        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#B5282D] px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Send className="h-4 w-4" />
        )}
        {wasSent ? "Erneut senden" : "Anfrage senden"}
      </button>

      <button
        type="button"
        onClick={() => void copyPortalUrl()}
        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-[#C8D8E8] bg-white px-4 py-3 text-sm font-black text-[#12395F]"
      >
        <Clipboard className="h-4 w-4" />
        Lieferantenlink kopieren
      </button>
    </div>
  );
}
