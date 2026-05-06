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
    }
  | null;

async function readJsonSafely(response: Response) {
  const rawText = await response.text();

  try {
    return rawText ? JSON.parse(rawText) : null;
  } catch {
    return null;
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
      });

      const payload = await readJsonSafely(response);

      if (!response.ok || payload?.ok === false) {
        setFeedback({
          type: "error",
          message:
            payload?.message ||
            "Der Paketwunsch konnte nicht verbindlich abgesendet werden.",
        });
        setIsSubmitting(false);
        return;
      }

      setFeedback({
        type: "success",
        message:
          payload?.message ||
          "Dein Paketwunsch wurde erfolgreich verbindlich abgesendet.",
      });

      setIsModalOpen(false);
      setIsSubmitting(false);
      router.refresh();
    } catch (error) {
      setFeedback({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Beim Absenden ist ein unerwarteter Fehler aufgetreten.",
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
                    ? "Erfolgreich abgesendet"
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
              Paketwunsch verbindlich absenden
            </>
          )}
        </button>

        <p className="text-center text-xs font-semibold leading-5 text-[#52616F]">
          Mit dem Absenden wird Dein aktueller Paketwunsch verbindlich an
          Handzettel-Schulen.de übermittelt.
        </p>
      </div>

      {isModalOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#102A43]/55 px-4 py-6 backdrop-blur-sm">
          <button
            type="button"
            onClick={closeModal}
            className="absolute inset-0 cursor-default"
            aria-label="Bestätigung schließen"
          />

          <div className="relative z-10 w-full max-w-2xl animate-[modalIn_180ms_ease-out] overflow-hidden rounded-[34px] border border-[#E8DED2] bg-white shadow-[0_30px_100px_rgba(16,42,67,0.30)]">
            <div className="absolute inset-x-0 top-0 h-2 bg-[#12395F]" />

            <button
              type="button"
              onClick={closeModal}
              disabled={isSubmitting}
              className="absolute right-4 top-5 z-20 inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#FBF7F0] text-[#52616F] transition hover:bg-[#F4E9DC] hover:text-[#102A43] disabled:cursor-not-allowed disabled:opacity-70"
              aria-label="Fenster schließen"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="p-5 sm:p-7">
              <div className="flex flex-col items-center text-center">
                <div className="relative mb-4 h-24 w-24 overflow-hidden rounded-[28px] border border-[#E8DED2] bg-[#FBF7F0] shadow-sm">
                  <Image
                    src="/handzettel-logo.png"
                    alt="Handzettel-Schulen.de"
                    fill
                    className="object-contain p-3"
                    priority
                  />
                </div>

                <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[#FBF7F0] px-4 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Verbindliche Bestätigung
                </div>

                <h3 className="max-w-xl text-2xl font-black tracking-tight text-[#102A43] sm:text-3xl">
                  Möchtest Du Deinen Paketwunsch jetzt verbindlich absenden?
                </h3>

                <p className="mt-4 max-w-xl text-sm leading-7 text-[#52616F] sm:text-base">
                  Dein aktueller Schulmaterial-Paketwunsch wird an
                  Handzettel-Schulen.de übermittelt. Danach prüft
                  Handzettel-Schulen.de Deine Auswahl final und kann bei Bedarf
                  noch sauber ergänzen oder korrigieren.
                </p>

                <div className="mt-6 grid w-full gap-3 sm:grid-cols-3">
                  <div className="rounded-3xl border border-[#E8DED2] bg-[#FBF7F0] p-4 text-left">
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-[#A75B28] shadow-sm">
                      <Send className="h-4 w-4" />
                    </div>

                    <p className="text-xs font-black uppercase tracking-[0.14em] text-[#A75B28]">
                      1. Absenden
                    </p>

                    <p className="mt-2 text-xs font-semibold leading-5 text-[#52616F]">
                      Dein Paketwunsch wird verbindlich an
                      Handzettel-Schulen.de übermittelt.
                    </p>
                  </div>

                  <div className="rounded-3xl border border-[#D8C8B8] bg-white p-4 text-left shadow-sm">
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-[#F4E9DC] text-[#A75B28] shadow-sm">
                      <Sparkles className="h-4 w-4" />
                    </div>

                    <p className="text-xs font-black uppercase tracking-[0.14em] text-[#A75B28]">
                      2. Persönlich geprüft
                    </p>

                    <p className="mt-2 text-xs font-semibold leading-5 text-[#52616F]">
                      Handzettel-Schulen.de prüft Deine Auswahl final und
                      ergänzt sie bei Bedarf.
                    </p>
                  </div>

                  <div className="rounded-3xl border border-[#E8DED2] bg-[#FBF7F0] p-4 text-left">
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-[#2F7D50] shadow-sm">
                      <CheckCircle2 className="h-4 w-4" />
                    </div>

                    <p className="text-xs font-black uppercase tracking-[0.14em] text-[#A75B28]">
                      3. Erledigt
                    </p>

                    <p className="mt-2 text-xs font-semibold leading-5 text-[#52616F]">
                      Danach siehst Du den abgesendeten Stand auf Deiner Seite.
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

                <div className="mt-6 grid w-full gap-3 sm:grid-cols-2">
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
                        Jetzt verbindlich absenden
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
      ) : null}
    </>
  );
}