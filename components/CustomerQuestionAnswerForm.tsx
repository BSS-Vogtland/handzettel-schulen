"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Send } from "lucide-react";

type CustomerQuestionAnswerFormProps = {
  token: string;
  questionId: string;
};

type ApiResponse = {
  ok?: boolean;
  message?: string;
};

export default function CustomerQuestionAnswerForm({
  token,
  questionId,
}: CustomerQuestionAnswerFormProps) {
  const router = useRouter();

  const [answerText, setAnswerText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSaving) return;

    setMessage(null);
    setErrorMessage(null);

    const cleanedAnswer = answerText.trim();

    if (cleanedAnswer.length < 1) {
      setErrorMessage("Bitte gib eine kurze Antwort ein.");
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch(
        `/api/offer/${token}/questions/${questionId}/answer`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          cache: "no-store",
          body: JSON.stringify({
            answerText: cleanedAnswer,
          }),
        }
      );

      const rawText = await response.text();

      let payload: ApiResponse | null = null;

      try {
        payload = rawText ? JSON.parse(rawText) : null;
      } catch {
        throw new Error(
          "Die Antwort konnte nicht verarbeitet werden. Bitte versuche es erneut."
        );
      }

      if (!response.ok || !payload?.ok) {
        throw new Error(
          payload?.message || "Die Antwort konnte nicht gespeichert werden."
        );
      }

      setMessage(payload.message || "Danke, Deine Antwort wurde gespeichert.");
      setAnswerText("");
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Die Antwort konnte nicht gespeichert werden."
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4">
      <label className="mb-2 block text-sm font-black text-[#102A43]">
        Deine Antwort
      </label>

      <textarea
        value={answerText}
        onChange={(event) => setAnswerText(event.target.value)}
        rows={4}
        placeholder="z. B. rot, A4, Lineatur 3 oder kurze Erklärung"
        className="w-full rounded-2xl border border-[#D8C8B8] bg-[#FBF7F0] px-4 py-3 text-sm font-semibold leading-6 text-[#102A43] outline-none transition placeholder:text-[#9AA7B2] focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
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
        disabled={isSaving}
        className="mt-3 inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#B5282D] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSaving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Send className="h-4 w-4" />
        )}
        {isSaving ? "Speichert..." : "Antwort senden"}
      </button>
    </form>
  );
}
