"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Send,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";

type ConfirmOfferButtonProps = {
  token: string;
};

type FeedbackState =
  | {
      type: "success" | "error";
      message: string;
      mode?: string | null;
    }
  | null;

type ConfirmResponse = {
  ok?: boolean;
  mode?: string;
  message?: string;
};

async function readJsonSafely(response: Response): Promise<ConfirmResponse | null> {
  const rawText = await response.text();

  try {
    return rawText ? JSON.parse(rawText) : null;
  } catch {
    return null;
  }
}

function getButtonLabelByMode(mode?: string | null) {
  switch (mode) {
    case "updated_offer_confirmed":
      return "Aktualisiertes Angebot bestätigt";
    case "manual_review_required":
      return "Paketwunsch abgesendet";
    case "offer_confirmed":
      return "Angebot bestätigt";
    case "already_confirmed":
      return "Bereits bestätigt";
    default:
      return "Erfolgreich abgesendet";
  }
}

export default function ConfirmOfferButton({ token }: ConfirmOfferButtonProps) {
  const router = useRouter();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState>(null);

  function openModal() {
    if (isSubmitting) return;
    setFeedback(null);
    setIsModalOpen(true);
  }

  function closeModal() {
    if (isSubmitting) return;
    setIsModalOpen(false);
  }

  async function handleConfirm() {
    try {
      setIsSubmitting(true);
      setFeedback(null);

      const response = await fetch(`/api/offer/${token}/confirm`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
      });

      const payload = await readJsonSafely(response);

      if (!response.ok || payload?.ok === false) {
        setFeedback({
          type: "error",
          message:
            payload?.message ||
            "Der Paketwunsch konnte nicht verbindlich abgesendet werden.",
          mode: payload?.mode || null,
        });
        setIsSubmitting(false);
        return;
      }

      const successMessage =
        payload?.message ||
        "Dein Paketwunsch wurde erfolgreich verbindlich abgesendet.";

      setFeedback({
        type: "success",
        message: successMessage,
        mode: payload?.mode || null,
      });

      setIsModalOpen(false);
      setIsSubmitting(false);

      router.refresh();

      window.setTimeout(() => {
        window.location.reload();
      }, 450);
    } catch (error) {
      setFeedback({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Beim Absenden ist ein unerwarteter Fehler aufgetreten.",
        mode: null,
      });
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <div className="space-y-3">
        {feedback ? (
          <div
            className={`rounded-3xl border px-4 py-4 shadow-sm ${
              feedback.type === "success"
                ? "border-[#BFE3CD] bg-[#F0FFF6] text-[#2F7D50]"
                : "border-[#F1D1A8] bg-[#FFF8EE] text-[#A75B28]"
            }`}
          >
            <div className="flex items-start gap-3">
              {feedback.type === "success" ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
              ) : (
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
              )}

              <div>
                <p className="font-black">
                  {feedback.type === "success"
                    ? getButtonLabelByMode(feedback.mode)
                    : "Absenden nicht möglich"}
                </p>
                <p className="mt-1 text-sm leading-6">{feedback.message}</p>
              </div>
            </div>
          </div>
        ) : null}

        <button
          type="button"
          onClick={openModal}
          disabled={isSubmitting}
          className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#12395F] px-5 py-4 text-sm font-black text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Wird abgesendet...
            </>
          ) : (
            <>
              <Send className="h-4 w-4" />
              Angebot offiziell annehmen
            </>
          )}
        </button>

        <p className="text-center text-xs font-semibold leading-5 text-[#52616F]">
          Erst mit diesem Klick wird Dein aktuelles Angebot offiziell an
          Handzettel-Schulen.de bestätigt.
        </p>
      </div>

      {isModalOpen ? (
        <div className="fixed inset-0 z-[100] overflow-y-auto bg-[#102A43]/55 px-3 py-4 backdrop-blur-sm sm:px-4 sm:py-8">
          <button
            type="button"
            onClick={closeModal}
            className="fixed inset-0 cursor-default"
            aria-label="Bestätigung schließen"
          />

          <div className="relative z-10 mx-auto flex min-h-full w-full max-w-2xl items-start justify-center sm:items-center">
            <div className="relative my-auto w-full max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-[26px] border border-[#E8DED2] bg-white shadow-[0_30px_100px_rgba(16,42,67,0.30)] sm:max-h-[calc(100dvh-4rem)] sm:rounded-[34px]">
              <div className="sticky top-0 z-20 h-2 bg-[#12395F]" />

              <button
                type="button"
                onClick={closeModal}
                disabled={isSubmitting}
                className="absolute right-3 top-4 z-30 inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#FBF7F0] text-[#52616F] transition hover:bg-[#F4E9DC] hover:text-[#102A43] disabled:cursor-not-allowed disabled:opacity-70 sm:right-4 sm:top-5 sm:h-10 sm:w-10"
                aria-label="Fenster schließen"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="p-4 pt-6 sm:p-7">
                <div className="flex flex-col items-center text-center">
                  <div className="relative mb-3 h-16 w-16 overflow-hidden rounded-[22px] border border-[#E8DED2] bg-[#FBF7F0] shadow-sm sm:mb-4 sm:h-24 sm:w-24 sm:rounded-[28px]">
                    <Image
                      src="/handzettel-logo.png"
                      alt="Handzettel-Schulen.de"
                      fill
                      className="object-contain p-2 sm:p-3"
                      priority
                    />
                  </div>

                  <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[#FBF7F0] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-[#A75B28] sm:px-4 sm:text-xs">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Offizielle Annahme
                  </div>

                  <h3 className="max-w-xl text-xl font-black leading-tight tracking-tight text-[#102A43] sm:text-3xl">
                    Möchtest Du dieses Angebot jetzt offiziell annehmen?
                  </h3>

                  <p className="mt-3 max-w-xl text-sm leading-6 text-[#52616F] sm:mt-4 sm:text-base sm:leading-7">
                    Mit diesem Schritt bestätigst Du den aktuell sichtbaren
                    Schulmaterial-Paketwunsch offiziell. Falls das Angebot von
                    Handzettel-Schulen.de manuell angepasst wurde, bestätigst Du
                    hier die aktualisierte Fassung.
                  </p>

                  <div className="mt-5 grid w-full gap-3 sm:mt-6 sm:grid-cols-3">
                    <div className="rounded-3xl border border-[#E8DED2] bg-[#FBF7F0] p-4 text-left sm:p-4">
                      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-[#A75B28] shadow-sm">
                        <Send className="h-4 w-4" />
                      </div>

                      <p className="text-xs font-black uppercase tracking-[0.14em] text-[#A75B28]">
                        1. Annehmen
                      </p>

                      <p className="mt-2 text-xs font-semibold leading-5 text-[#52616F]">
                        Du bestätigst das aktuell sichtbare Angebot offiziell.
                      </p>
                    </div>

                    <div className="rounded-3xl border border-[#D8C8B8] bg-white p-4 text-left shadow-sm sm:p-4">
                      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-[#F4E9DC] text-[#A75B28] shadow-sm">
                        <Sparkles className="h-4 w-4" />
                      </div>

                      <p className="text-xs font-black uppercase tracking-[0.14em] text-[#A75B28]">
                        2. Übermittlung
                      </p>

                      <p className="mt-2 text-xs font-semibold leading-5 text-[#52616F]">
                        Handzettel-Schulen.de erhält die Annahme automatisch.
                      </p>
                    </div>

                    <div className="rounded-3xl border border-[#E8DED2] bg-[#FBF7F0] p-4 text-left sm:p-4">
                      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-[#2F7D50] shadow-sm">
                        <CheckCircle2 className="h-4 w-4" />
                      </div>

                      <p className="text-xs font-black uppercase tracking-[0.14em] text-[#A75B28]">
                        3. Bestätigt
                      </p>

                      <p className="mt-2 text-xs font-semibold leading-5 text-[#52616F]">
                        Danach ist das Angebot offiziell angenommen.
                      </p>
                    </div>
                  </div>

                  {feedback?.type === "error" ? (
                    <div className="mt-5 w-full rounded-3xl border border-[#F1D1A8] bg-[#FFF8EE] p-4 text-left text-[#A75B28]">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                        <div>
                          <p className="font-black">Absenden nicht möglich</p>
                          <p className="mt-1 text-sm leading-6">
                            {feedback.message}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className="sticky bottom-0 -mx-4 mt-5 grid w-[calc(100%+2rem)] gap-3 border-t border-[#E8DED2] bg-white/95 px-4 py-4 backdrop-blur sm:static sm:mx-0 sm:mt-6 sm:w-full sm:grid-cols-2 sm:border-t-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-0">
                    <button
                      type="button"
                      onClick={closeModal}
                      disabled={isSubmitting}
                      className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-[#E8DED2] bg-white px-4 py-3 text-sm font-black text-[#52616F] transition hover:bg-[#FBF7F0] hover:text-[#102A43] disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      Noch einmal prüfen
                    </button>

                    <button
                      type="button"
                      onClick={handleConfirm}
                      disabled={isSubmitting}
                      className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#B5282D] px-4 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Wird bestätigt...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-4 w-4" />
                          Angebot offiziell annehmen
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <style jsx>{`
                @keyframes modalIn {
                  from {
                    opacity: 0;
                    transform: translateY(12px) scale(0.98);
                  }
                  to {
                    opacity: 1;
                    transform: translateY(0) scale(1);
                  }
                }
              `}</style>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}