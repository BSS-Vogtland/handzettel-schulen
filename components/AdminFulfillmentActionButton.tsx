"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

type FulfillmentAction =
  | "start_picking"
  | "mark_picked"
  | "mark_packed"
  | "ready_for_pickup"
  | "mark_picked_up"
  | "ready_for_shipping"
  | "mark_shipped";

type AdminFulfillmentActionButtonProps = {
  requestId: string;
  action: FulfillmentAction;
  label: string;
  variant?: "primary" | "green" | "blue" | "neutral";
  disabled?: boolean;
};

type ApiResponse = {
  ok?: boolean;
  message?: string;
};

function getButtonClass(variant: AdminFulfillmentActionButtonProps["variant"]) {
  switch (variant) {
    case "green":
      return "bg-[#2F7D50] text-white hover:brightness-110";
    case "blue":
      return "bg-[#12395F] text-white hover:brightness-110";
    case "neutral":
      return "border border-[#E8DED2] bg-white text-[#102A43] hover:bg-[#FBF7F0]";
    default:
      return "bg-[#B5282D] text-white hover:brightness-110";
  }
}

async function readApiResponse(response: Response): Promise<ApiResponse> {
  const rawText = await response.text();

  try {
    return rawText ? (JSON.parse(rawText) as ApiResponse) : {};
  } catch {
    return {
      ok: false,
      message:
        "Die Fulfillment-Route hat keine JSON-Antwort geliefert. Prüfe bitte zusätzlich das Terminal.",
    };
  }
}

export default function AdminFulfillmentActionButton({
  requestId,
  action,
  label,
  variant = "primary",
  disabled,
}: AdminFulfillmentActionButtonProps) {
  const router = useRouter();

  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  async function handleClick() {
    if (isSaving || disabled) return;

    try {
      setIsSaving(true);
      setFeedback(null);
      setIsSuccess(false);

      const response = await fetch(`/api/admin/requests/${requestId}/fulfillment`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action,
        }),
      });

      const payload = await readApiResponse(response);

      if (!response.ok || !payload.ok) {
        throw new Error(
          payload.message || "Der Status konnte nicht gespeichert werden."
        );
      }

      setIsSuccess(true);
      setFeedback(payload.message || "Status wurde gespeichert.");
      router.refresh();
    } catch (error) {
      setIsSuccess(false);
      setFeedback(
        error instanceof Error
          ? error.message
          : "Der Status konnte nicht gespeichert werden."
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || isSaving}
        className={`inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60 ${getButtonClass(
          variant
        )}`}
      >
        {isSaving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <CheckCircle2 className="h-4 w-4" />
        )}
        {isSaving ? "Speichert..." : label}
      </button>

      {feedback ? (
        <div
          className={`rounded-2xl px-3 py-2 text-xs font-bold leading-5 ${
            isSuccess
              ? "border border-[#BFE3CD] bg-[#F0FFF6] text-[#2F7D50]"
              : "border border-[#F1D1A8] bg-[#FFF8EE] text-[#A75B28]"
          }`}
        >
          {feedback}
        </div>
      ) : null}
    </div>
  );
}