"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

type AcceptMatchButtonProps = {
  requestId: string;
  matchId: string;
  alreadyAccepted?: boolean;
};

type AcceptMatchApiResponse = {
  ok?: boolean;
  message?: string;
};

async function readApiResponse(
  response: Response
): Promise<AcceptMatchApiResponse> {
  const text = await response.text();

  if (!text) {
    return {
      ok: false,
      message: "Der Server hat keine Antwort gesendet.",
    };
  }

  try {
    return JSON.parse(text) as AcceptMatchApiResponse;
  } catch {
    return {
      ok: false,
      message:
        "Die Übernahme-Route hat keine JSON-Antwort geliefert. Prüfe bitte zusätzlich das Terminal.",
    };
  }
}

export default function AcceptMatchButton({
  requestId,
  matchId,
  alreadyAccepted,
}: AcceptMatchButtonProps) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState("");

  async function handleAccept() {
    try {
      setIsSaving(true);
      setFeedback("Produkt wird ins Angebot übernommen ...");

      const response = await fetch(
        `/api/admin/requests/${requestId}/offer-items/from-match`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            matchId,
          }),
        }
      );

      const result = await readApiResponse(response);

      if (!response.ok || !result.ok) {
        throw new Error(
          result.message ||
            `Produkt konnte nicht übernommen werden. Status: ${response.status}`
        );
      }

      setFeedback("Produkt wurde ins Angebot übernommen.");
      router.refresh();
    } catch (error) {
      console.error(error);
      setFeedback(
        error instanceof Error
          ? error.message
          : "Produkt konnte nicht übernommen werden."
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleAccept}
        disabled={isSaving}
        className={`inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black shadow-sm transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70 ${
          alreadyAccepted
            ? "bg-[#EAF7EE] text-[#2F7D50] ring-1 ring-[#CDE8D4]"
            : "bg-[#12395F] text-white hover:bg-[#0D2D4C]"
        }`}
      >
        {isSaving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <CheckCircle2 className="h-4 w-4" />
        )}
        {isSaving
          ? "Wird übernommen ..."
          : alreadyAccepted
          ? "Bereits im Angebot"
          : "Ins Angebot übernehmen"}
      </button>

      {feedback ? (
        <div
          className={`rounded-2xl px-4 py-3 text-xs font-bold leading-5 ring-1 ${
            feedback.includes("übernommen")
              ? "bg-[#EAF7EE] text-[#2F7D50] ring-[#CDE8D4]"
              : feedback.includes("wird")
              ? "bg-[#EAF2FA] text-[#12395F] ring-[#CCDDEA]"
              : "bg-[#FFF1F1] text-[#B5282D] ring-[#F3C6C8]"
          }`}
        >
          {feedback}
        </div>
      ) : null}
    </div>
  );
}