"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type AdminAcceptMatchButtonProps = {
  requestId: string;
  matchId: string;
  disabled?: boolean;
  label?: string;
};

type ApiResponse = {
  ok?: boolean;
  message?: string;
  error?: string;
};
function findPackageChecklistElement(): HTMLElement | null {
  const direct =
    document.getElementById("paketwunsch-checkliste") ||
    document.querySelector<HTMLElement>("[data-package-checklist]") ||
    document.querySelector<HTMLElement>("[data-admin-package-checklist]");

  if (direct instanceof HTMLElement) {
    return direct;
  }

  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>("section, article, div, h1, h2, h3")
  );

  const heading = candidates.find((element) =>
    (element.textContent || "").toLowerCase().includes("paketwunsch-checkliste")
  );

  if (!heading) {
    return null;
  }

  return (
    heading.closest<HTMLElement>("section, article, div") ||
    heading
  );
}

function scrollToPackageChecklistWithRetry() {
  let attempt = 0;
  const maxAttempts = 16;

  function run() {
    attempt += 1;

    const target = findPackageChecklistElement();

    if (target) {
      target.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      return;
    }

    if (attempt < maxAttempts) {
      window.setTimeout(run, 250);
    }
  }

  window.setTimeout(run, 250);
}


async function readApiResponse(response: Response): Promise<ApiResponse> {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as ApiResponse;
  } catch {
    return {
      error: text,
    };
  }
}

export default function AdminAcceptMatchButton({
  requestId,
  matchId,
  disabled = false,
  label = "In Paket Ã¼bernehmen",
}: AdminAcceptMatchButtonProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function handleClick() {
    if (disabled || isSubmitting) return;

    setIsSubmitting(true);
    setFeedback(null);

    try {
      const response = await fetch(
        `/api/admin/requests/${encodeURIComponent(requestId)}/offer-items/from-match`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            matchId,
            match_id: matchId,
          }),
        }
      );

      const result = await readApiResponse(response);

      if (!response.ok || result.ok === false) {
        throw new Error(
          result.error || result.message || "Der Vorschlag konnte nicht Ã¼bernommen werden."
        );
      }

      setFeedback(result.message || "Vorschlag wurde in den Paketwunsch Ã¼bernommen.");
      router.refresh();
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "Der Vorschlag konnte nicht Ã¼bernommen werden."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || isSubmitting}
        className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-black text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? "Wird Ã¼bernommen ..." : label}
      </button>

      {feedback ? (
        <p className="max-w-[260px] text-right text-xs font-bold text-slate-600">
          {feedback}
        </p>
      ) : null}
    </div>
  );
}
