"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { HelpCircle, Loader2, PlusCircle, X } from "lucide-react";

type AdminRequestItemQuestionFormProps = {
  requestId: string;
  requestItemId: string | null;
  itemLabel?: string | null;
};

type ApiResponse = {
  ok?: boolean;
  message?: string;
};

export default function AdminRequestItemQuestionForm({
  requestId,
  requestItemId,
  itemLabel,
}: AdminRequestItemQuestionFormProps) {
  const router = useRouter();

  const [isOpen, setIsOpen] = useState(false);
  const [questionText, setQuestionText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSaving) return;

    setMessage(null);
    setErrorMessage(null);

    const cleanedQuestion = questionText.trim();

    if (cleanedQuestion.length < 3) {
      setErrorMessage("Bitte gib eine konkrete Rückfrage ein.");
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch(`/api/admin/requests/${requestId}/questions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({
          requestItemId,
          questionText: cleanedQuestion,
        }),
      });

      const rawText = await response.text();

      let payload: ApiResponse | null = null;

      try {
        payload = rawText ? JSON.parse(rawText) : null;
      } catch {
        throw new Error(
          "Die Rückfrage-Route hat keine JSON-Antwort geliefert."
        );
      }

      if (!response.ok || !payload?.ok) {
        throw new Error(
          payload?.message || "Die Rückfrage konnte nicht gespeichert werden."
        );
      }

      setMessage(payload.message || "Rückfrage wurde gespeichert.");
      setQuestionText("");
      setIsOpen(false);
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Die Rückfrage konnte nicht gespeichert werden."
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (!isOpen) {
    return (
      <div className="flex flex-col gap-2 sm:items-end">
        <button
          type="button"
          onClick={() => {
            setIsOpen(true);
            setMessage(null);
            setErrorMessage(null);
          }}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#A75B28] px-4 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110"
        >
          <HelpCircle className="h-4 w-4" />
          Rückfrage stellen
        </button>

        {message ? (
          <p className="rounded-2xl border border-[#BFE3CD] bg-[#F0FFF6] px-3 py-2 text-xs font-bold text-[#2F7D50]">
            {message}
          </p>
        ) : null}

        {errorMessage ? (
          <p className="rounded-2xl border border-[#F1B5B5] bg-[#FFF5F5] px-3 py-2 text-xs font-bold text-[#9F1D1D]">
            {errorMessage}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-3 w-full rounded-[22px] border border-[#E8DED2] bg-[#FBF7F0] p-4 sm:mt-0 sm:max-w-xl"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
            Rückfrage an Kunde
          </p>
          <p className="mt-1 text-sm font-semibold leading-6 text-[#52616F]">
            {itemLabel
              ? `Zur Position „${itemLabel}“`
              : "Allgemeine Rückfrage zur Anfrage"}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-[#B5282D] transition hover:bg-[#FFECEC]"
          aria-label="Rückfrageformular schließen"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <textarea
        value={questionText}
        onChange={(event) => setQuestionText(event.target.value)}
        rows={4}
        placeholder="z. B. Welche Farbe wird benötigt?"
        className="w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 py-3 text-sm font-semibold leading-6 text-[#102A43] outline-none transition placeholder:text-[#9AA7B2] focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
      />

      {errorMessage ? (
        <p className="mt-3 rounded-2xl border border-[#F1B5B5] bg-[#FFF5F5] px-3 py-2 text-xs font-bold text-[#9F1D1D]">
          {errorMessage}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isSaving}
        className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#12395F] px-4 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSaving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <PlusCircle className="h-4 w-4" />
        )}
        {isSaving ? "Speichert..." : "Rückfrage speichern"}
      </button>
    </form>
  );
}
