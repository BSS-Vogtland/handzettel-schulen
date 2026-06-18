"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";

type ResolutionStatus =
  | "customer_supplies_self"
  | "covered_by_alternative"
  | "open";

type AdminResolveRequestItemButtonProps = {
  requestId: string;
  requestItemId: string;
  resolutionStatus: ResolutionStatus;
  buttonLabel: string;
  confirmMessage?: string;
  className?: string;
};

export default function AdminResolveRequestItemButton({
  requestId,
  requestItemId,
  resolutionStatus,
  buttonLabel,
  confirmMessage,
  className,
}: AdminResolveRequestItemButtonProps) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleClick() {
    if (isSaving) return;

    if (confirmMessage && !window.confirm(confirmMessage)) {
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      const response = await fetch(
        `/api/admin/requests/${requestId}/items/${requestItemId}/resolve`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            resolutionStatus,
          }),
        }
      );

      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.ok) {
        throw new Error(
          payload?.message || "Position konnte nicht gespeichert werden."
        );
      }

      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Position konnte nicht gespeichert werden."
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={isSaving}
        className={
          className ||
          "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-[#D8C8B8] bg-white px-4 py-3 text-sm font-black text-[#102A43] transition hover:border-[#12395F] hover:bg-[#F5FAFD] disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
        }
      >
        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {isSaving ? "Speichere ..." : buttonLabel}
      </button>

      {errorMessage ? (
        <p className="mt-2 rounded-2xl border border-[#F2B8B8] bg-[#FFF1F1] px-3 py-2 text-xs font-bold text-[#B5282D]">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
