"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Loader2 } from "lucide-react";

type RestoreRequestButtonProps = {
  requestId: string;
  label?: string;
};

export default function RestoreRequestButton({
  requestId,
  label = "Anfrage wiederherstellen",
}: RestoreRequestButtonProps) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isRestoring, setIsRestoring] = useState(false);

  function restoreRequest() {
    if (
      !window.confirm(
        "Diese Anfrage wirklich wieder aktiv setzen? Sie erscheint danach wieder in den normalen Arbeitslisten."
      )
    ) {
      return;
    }

    setMessage(null);
    setIsRestoring(true);

    startTransition(async () => {
      try {
        const response = await fetch(`/api/admin/requests/${requestId}/restore`, {
          method: "POST",
        });

        const payload = await response.json().catch(() => null);

        if (!response.ok || payload?.ok === false) {
          setMessage(
            payload?.message || "Anfrage konnte nicht wiederhergestellt werden."
          );
          setIsRestoring(false);
          return;
        }

        setMessage(payload?.message || "Anfrage wurde wiederhergestellt.");
        setIsRestoring(false);
        router.refresh();
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Anfrage konnte nicht wiederhergestellt werden."
        );
        setIsRestoring(false);
      }
    });
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={restoreRequest}
        disabled={isPending || isRestoring}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#12395F] px-4 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending || isRestoring ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <RotateCcw className="h-4 w-4" />
        )}
        {label}
      </button>

      {message ? (
        <p className="rounded-xl border border-[#D6E7EF] bg-[#F5FAFD] px-3 py-2 text-xs font-bold text-[#12395F]">
          {message}
        </p>
      ) : null}
    </div>
  );
}