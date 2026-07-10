"use client";

import { useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  MessageSquareText,
} from "lucide-react";

type AdminOfferItemSpecialInstructionsFormProps = {
  requestId: string;
  itemId: string;
  productName: string;
  initialNote?: string | null;
  compact?: boolean;
};

type SaveResponse = {
  ok?: boolean;
  message?: string;
  customerNote?: string | null;
};

const MAX_NOTE_LENGTH = 500;

async function readJsonSafely(response: Response): Promise<SaveResponse | null> {
  const rawText = await response.text();

  try {
    return rawText ? (JSON.parse(rawText) as SaveResponse) : null;
  } catch {
    return null;
  }
}

export default function AdminOfferItemSpecialInstructionsForm({
  requestId,
  itemId,
  productName,
  initialNote = "",
  compact = false,
}: AdminOfferItemSpecialInstructionsFormProps) {
  const [isOpen, setIsOpen] = useState(Boolean(initialNote));
  const [note, setNote] = useState(initialNote || "");
  const [lastSavedNote, setLastSavedNote] = useState(initialNote || "");
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const remainingCharacters = MAX_NOTE_LENGTH - note.length;
  const hasChanges = note.trim() !== lastSavedNote.trim();
  const previewText = lastSavedNote.trim();

  async function handleSave() {
    if (isSaving) return;

    setFeedback(null);
    setErrorMessage(null);

    if (note.length > MAX_NOTE_LENGTH) {
      setErrorMessage(
        `Der Hinweis ist zu lang. Bitte maximal ${MAX_NOTE_LENGTH} Zeichen verwenden.`
      );
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch(
        `/api/admin/requests/${encodeURIComponent(
          requestId
        )}/offer-items/${encodeURIComponent(itemId)}/special-instructions`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            customerNote: note.trim(),
          }),
        }
      );

      const payload = await readJsonSafely(response);

      if (!response.ok || !payload?.ok) {
        throw new Error(
          payload?.message || "Der besondere Hinweis konnte nicht gespeichert werden."
        );
      }

      const savedNote = payload.customerNote || "";

      setNote(savedNote);
      setLastSavedNote(savedNote);
      setFeedback(payload.message || "Besonderer Hinweis wurde gespeichert.");

      if (!savedNote) {
        setIsOpen(false);
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Der besondere Hinweis konnte nicht gespeichert werden."
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (!isOpen) {
    return (
      <div
        className={`mt-4 rounded-2xl border border-[#D6E7EF] bg-[#F5FAFD] ${
          compact ? "p-3" : "p-4"
        }`}
      >
        <button
          type="button"
          onClick={() => {
            setIsOpen(true);
            setFeedback(null);
            setErrorMessage(null);
          }}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-[#12395F]">
              <MessageSquareText className="h-5 w-5" />
            </div>

            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[#12395F]">
                Besondere Hinweise
              </p>
              <p className="mt-1 text-sm font-semibold leading-6 text-[#52616F]">
                {previewText
                  ? previewText
                  : "Optionalen Hinweis zur Paketposition öffnen."}
              </p>
            </div>
          </div>

          <ChevronDown className="h-5 w-5 shrink-0 text-[#12395F]" />
        </button>

        {feedback ? (
          <p className="mt-3 rounded-2xl border border-[#BFE3CD] bg-[#F0FFF6] px-4 py-3 text-sm font-bold text-[#2F7D50]">
            {feedback}
          </p>
        ) : null}

        {errorMessage ? (
          <p className="mt-3 rounded-2xl border border-[#F0C7C7] bg-[#FFF5F5] px-4 py-3 text-sm font-bold text-[#B5282D]">
            {errorMessage}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={`mt-4 rounded-2xl border border-[#D6E7EF] bg-[#F5FAFD] ${
        compact ? "p-3" : "p-4"
      }`}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-[#12395F]">
            <MessageSquareText className="h-5 w-5" />
          </div>

          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[#12395F]">
              Besondere Hinweise
            </p>
            <p className="mt-1 text-sm font-semibold leading-6 text-[#52616F]">
              Hinweis zu „{productName}“. Dieser Text ist im Paketwunsch bei der
              jeweiligen Position sichtbar.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-[#12395F] transition hover:bg-[#E4EEF8]"
          aria-label="Hinweisfeld einklappen"
        >
          <ChevronUp className="h-5 w-5" />
        </button>
      </div>

      <textarea
        value={note}
        onChange={(event) => {
          setNote(event.target.value);
          setFeedback(null);
          setErrorMessage(null);
        }}
        maxLength={MAX_NOTE_LENGTH}
        rows={compact ? 2 : 3}
        placeholder="Optional: z. B. bitte in Blau liefern, falls verfügbar. Sonst Ersatzartikel möglich."
        className="w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 py-3 text-sm font-semibold text-[#102A43] outline-none transition placeholder:text-[#9AA7B2] focus:border-[#12395F] focus:ring-4 focus:ring-[#12395F]/10"
      />

      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p
          className={`text-xs font-bold ${
            remainingCharacters < 40 ? "text-[#B5282D]" : "text-[#52616F]"
          }`}
        >
          {remainingCharacters} Zeichen übrig
        </p>

        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving || !hasChanges}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl bg-[#12395F] px-4 py-2 text-sm font-black text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Wird gespeichert …
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4" />
              Hinweis speichern
            </>
          )}
        </button>
      </div>

      {feedback ? (
        <p className="mt-3 rounded-2xl border border-[#BFE3CD] bg-[#F0FFF6] px-4 py-3 text-sm font-bold text-[#2F7D50]">
          {feedback}
        </p>
      ) : null}

      {errorMessage ? (
        <p className="mt-3 rounded-2xl border border-[#F0C7C7] bg-[#FFF5F5] px-4 py-3 text-sm font-bold text-[#B5282D]">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
