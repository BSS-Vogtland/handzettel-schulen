"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, HelpCircle, Loader2, PlusCircle, X } from "lucide-react";

type AdminRequestItemQuestionFormProps = {
  requestId: string;
  requestItemId: string | null;
  itemLabel?: string | null;
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

export default function AdminRequestItemQuestionForm({
  requestId,
  requestItemId,
  itemLabel,
}: AdminRequestItemQuestionFormProps) {
  const router = useRouter();

  const [isOpen, setIsOpen] = useState(false);
  const [questionText, setQuestionText] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isStarting) return;

    setMessage(null);
    setErrorMessage(null);

    const cleanedQuestion = questionText.trim();

    if (cleanedQuestion.length < 3) {
      setErrorMessage("Bitte gib eine konkrete Rückfrage ein.");
      return;
    }

    setIsStarting(true);
    setMessage("Rückfrage wird gespeichert. Der Mailversand läuft im Hintergrund.");

    const requestPromise = fetch(`/api/admin/requests/${requestId}/questions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
      keepalive: true,
      body: JSON.stringify({
        requestItemId,
        questionText: cleanedQuestion,
      }),
    })
      .then(async (response) => {
        const payload = await readApiResponse(response);

        if (!response.ok || payload.ok === false) {
          throw new Error(
            payload.message ||
              payload.error ||
              "Die Rückfrage konnte nicht gespeichert werden."
          );
        }

        setMessage(
          payload.message ||
            "Rückfrage wurde gespeichert. Der Mailversand läuft im Hintergrund."
        );
        setQuestionText("");
        setIsOpen(false);

        window.setTimeout(() => {
          router.refresh();
        }, 600);
      })
      .catch((error) => {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Die Rückfrage konnte nicht gespeichert werden."
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

  if (!isOpen) {
    return (
      <div>
        {message ? (
          <div className="mb-3 flex items-start gap-2 rounded-2xl border border-[#BFE3CD] bg-[#F0FFF6] px-4 py-3 text-sm font-semibold text-[#2F7D50]">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{message}</span>
          </div>
        ) : null}

        {errorMessage ? (
          <p className="mb-3 rounded-2xl border border-[#F1B5B5] bg-[#FFF5F5] px-4 py-3 text-sm font-semibold text-[#9F1D1D]">
            {errorMessage}
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => {
            setIsOpen(true);
            setMessage(null);
            setErrorMessage(null);
          }}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl border border-[#E8DED2] bg-white px-4 py-2 text-xs font-black text-[#102A43] shadow-sm transition hover:bg-[#FBF7F0]"
        >
          <PlusCircle className="h-4 w-4" />
          Rückfrage an Kunden
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-3 rounded-[24px] border border-[#E8DED2] bg-[#FBF7F0] p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-black text-[#102A43]">
            <HelpCircle className="h-4 w-4 text-[#A75B28]" />
            Rückfrage an Kunden
          </p>

          {itemLabel ? (
            <p className="mt-1 text-xs font-semibold leading-5 text-[#52616F]">
              Zur Position: {itemLabel}
            </p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => {
            if (isStarting) return;
            setIsOpen(false);
            setQuestionText("");
          }}
          className="rounded-full border border-[#E8DED2] bg-white p-2 text-[#52616F] transition hover:bg-[#F4F8FB]"
          aria-label="Rückfrage schließen"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <textarea
        value={questionText}
        onChange={(event) => setQuestionText(event.target.value)}
        rows={4}
        className="mt-4 w-full rounded-2xl border border-[#D8E0EA] bg-white px-4 py-3 text-sm font-semibold text-[#102A43] outline-none transition placeholder:text-[#9AA6B2] focus:border-[#A75B28]"
        placeholder="Welche Angabe fehlt oder soll der Kunde bestätigen?"
        disabled={isStarting}
      />

      {message ? (
        <div className="mt-3 flex items-start gap-2 rounded-2xl border border-[#BFE3CD] bg-[#F0FFF6] px-4 py-3 text-sm font-semibold text-[#2F7D50]">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{message}</span>
        </div>
      ) : null}

      {errorMessage ? (
        <p className="mt-3 rounded-2xl border border-[#F1B5B5] bg-[#FFF5F5] px-4 py-3 text-sm font-semibold text-[#9F1D1D]">
          {errorMessage}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isStarting}
        className="mt-3 inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#B5282D] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isStarting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <HelpCircle className="h-4 w-4" />
        )}
        {isStarting ? "Wird gestartet ..." : "Rückfrage speichern und senden"}
      </button>
    </form>
  );
}
