"use client";

import { useEffect, useRef, useState } from "react";
import CustomerWhatsappUpdatesPanel from "@/components/CustomerWhatsappUpdatesPanel";

type Choice = "self" | "team" | null;

type CustomerOpenPositionDecisionPanelProps = {
  token: string;
  openChoiceCount: number;
  manualReviewCount: number;
  requestNumber?: string | null;
  initialWhatsappUpdatesEnabled?: boolean;
  businessWhatsappUrl?: string;
  initialChoice?: Choice;
};

type ApiResponse = {
  ok?: boolean;
  message?: string;
  error?: string;
};

function getStorageKey(token: string) {
  return `hds-open-position-choice-${token}`;
}

async function readApiResponse(response: Response): Promise<ApiResponse> {
  const text = await response.text();

  if (!text) return {};

  try {
    return JSON.parse(text) as ApiResponse;
  } catch {
    return { error: text };
  }
}

export default function CustomerOpenPositionDecisionPanel({
  token,
  openChoiceCount,
  manualReviewCount,
  requestNumber = null,
  initialWhatsappUpdatesEnabled = true,
  businessWhatsappUrl = "",
  initialChoice = null,
}: CustomerOpenPositionDecisionPanelProps) {
  const totalOpenCount = openChoiceCount + manualReviewCount;
  const openLabel =
    totalOpenCount === 1
      ? "1 Position offen"
      : `${totalOpenCount} Positionen offen`;

  const storageKey = getStorageKey(token);
  const didAutoPersistTeam = useRef(false);

  const [choice, setChoice] = useState<Choice>(
    initialChoice === "self" ? "self" : "team"
  );
  const [isSaving, setIsSaving] = useState<Choice>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  function rememberChoice(nextChoice: Exclude<Choice, null>) {
    setChoice(nextChoice);

    try {
      window.localStorage.setItem(storageKey, nextChoice);
    } catch {
      // LocalStorage ist nur Komfort, nicht kritisch.
    }
  }

  async function chooseSelf() {
    if (isSaving) return;

    setIsSaving("self");
    setFeedback(null);

    try {
      const response = await fetch(
        `/api/offer/${encodeURIComponent(token)}/self-selection`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            openChoiceCount,
            manualReviewCount,
          }),
        }
      );

      const payload = await readApiResponse(response);

      if (!response.ok || payload.ok === false) {
        throw new Error(
          payload.message ||
            payload.error ||
            "Die Selbst-Auswahl konnte gerade nicht gespeichert werden."
        );
      }

      rememberChoice("self");

      const url = new URL(window.location.href);
      url.searchParams.set("mode", "self");
      url.searchParams.delete("team");
      window.location.href = url.toString();
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "Die Selbst-Auswahl konnte gerade nicht geöffnet werden."
      );
    } finally {
      setIsSaving(null);
    }
  }

  async function chooseTeam(options?: { silent?: boolean }) {
    if (isSaving) return;

    if (!options?.silent) {
      setIsSaving("team");
      setFeedback(null);
    }

    try {
      const response = await fetch(
        `/api/offer/${encodeURIComponent(token)}/service-takeover`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            openChoiceCount,
            manualReviewCount,
          }),
        }
      );

      const payload = await readApiResponse(response);

      if (!response.ok || payload.ok === false) {
        throw new Error(
          payload.message ||
            payload.error ||
            "Die Team-Übernahme konnte gerade nicht gespeichert werden."
        );
      }

      rememberChoice("team");

      if (!options?.silent) {
        setFeedback(
          payload.message ||
            "Handzettel-Schulen.de übernimmt die offenen Positionen."
        );
      }
    } catch (error) {
      if (!options?.silent) {
        setFeedback(
          error instanceof Error
            ? error.message
            : "Die Team-Übernahme konnte gerade nicht gespeichert werden."
        );
      }
    } finally {
      if (!options?.silent) {
        setIsSaving(null);
      }
    }
  }

  useEffect(() => {
    if (didAutoPersistTeam.current) return;
    if (initialChoice === "self") return;

    didAutoPersistTeam.current = true;
    void chooseTeam({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialChoice]);

  const isTeam = choice !== "self";

  return (
    <section
      className="rounded-[34px] border border-[#2F7D50]/70 bg-[#EAF8F0] p-6 shadow-sm sm:p-7"
      data-customer-team-info-panel-v2
    >
      <style
        dangerouslySetInnerHTML={{
          __html:
            "[data-team-whatsapp-component-wrap] { transform: scale(0.78) !important; transform-origin: top left !important; width: 128.3% !important; margin-top: 16px !important; margin-bottom: 18px !important; opacity: .86 !important; } " +
            "[data-team-whatsapp-component-wrap] * { font-size: 10px !important; line-height: 1.16 !important; } " +
            "[data-team-whatsapp-component-wrap] h1, [data-team-whatsapp-component-wrap] h2, [data-team-whatsapp-component-wrap] h3, [data-team-whatsapp-component-wrap] strong { font-size: 11px !important; line-height: 1.15 !important; } " +
            "[data-team-whatsapp-component-wrap] p { margin-top: 2px !important; margin-bottom: 2px !important; } " +
            "[data-team-whatsapp-component-wrap] button, [data-team-whatsapp-component-wrap] a { padding: 5px 9px !important; min-height: 0 !important; font-size: 10px !important; border-radius: 10px !important; } " +
            "[data-team-whatsapp-component-wrap] input { width: 13px !important; height: 13px !important; }",
        }}
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_230px] lg:items-start">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-[#1E7A48]">
            Handzettel-Schulen.de übernimmt
          </p>

          <h1 className="mt-3 max-w-4xl text-2xl font-black leading-tight text-[#102A43] sm:text-[2rem]">
            Wir haben Deine Liste ausgewertet. Sicher erkannte Artikel bleiben
            vorbereitet – offene Positionen übernehmen wir persönlich für Dich.
          </h1>
        </div>

        <div className="rounded-[24px] border border-[#9BD5B0] bg-white px-5 py-4 text-center shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-[#2F7D50]">
            Offen
          </p>
          <p className="mt-2 text-2xl font-black text-[#102A43]">
            {openLabel}
          </p>
        </div>
      </div>

      {isTeam ? (
        <div className="mt-7 rounded-[30px] border border-[#9BD5B0] bg-white px-6 py-6 shadow-sm sm:px-7 sm:py-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#2F7D50] text-3xl font-black text-white">
              ✓
            </div>

            <div className="min-w-0 flex-1">
              <h2 className="text-2xl font-black leading-tight text-[#102A43]">
                Handzettel-Schulen.de übernimmt die offenen Positionen.
              </h2>

              <p className="mt-3 max-w-4xl text-base font-black leading-7 text-[#2F7D50]">
                Du musst nichts weiter tun. Die sicher erkannten Artikel bleiben
                vorbereitet, offene Positionen prüfen wir persönlich.
              </p>

              <div
                className="mt-5 grid gap-3 sm:grid-cols-2"
                data-team-status-summary
              >
                <div className="rounded-[22px] border border-[#BFE3CD] bg-[#F4FFF8] p-4">
                  <p className="text-[0.68rem] font-black uppercase tracking-[0.16em] text-[#2F7D50]">
                    Bereits vorbereitet
                  </p>
                  <p className="mt-2 text-sm font-black leading-5 text-[#102A43]">
                    Sicher erkannte Artikel bleiben im Paketwunsch vorgemerkt.
                  </p>
                </div>

                <div className="rounded-[22px] border border-[#E7C9A6] bg-[#FFF8EE] p-4">
                  <p className="text-[0.68rem] font-black uppercase tracking-[0.16em] text-[#A75B28]">
                    Noch offen
                  </p>
                  <p className="mt-2 text-sm font-black leading-5 text-[#102A43]">
                    {openLabel} prüft Handzettel-Schulen.de persönlich.
                  </p>
                </div>
              </div>

              <p className="mt-6 text-2xl font-black leading-tight text-[#102A43] sm:text-[2.05rem]">
                Sobald Dein fertiger Paketwunsch bereit ist, bekommst Du eine
                Nachricht. Danach prüfst Du alles in Ruhe und schließt die
                Bestellung ab.
              </p>

              <div
                className="mt-5 grid gap-2 text-sm font-bold text-[#52616F] sm:grid-cols-3"
                data-team-next-steps
              >
                <div className="rounded-2xl bg-[#F4F8FB] px-4 py-3">
                  <span className="mr-2 font-black text-[#2F7D50]">1.</span>
                  Wir prüfen die offenen Positionen.
                </div>
                <div className="rounded-2xl bg-[#F4F8FB] px-4 py-3">
                  <span className="mr-2 font-black text-[#2F7D50]">2.</span>
                  Du bekommst eine Nachricht.
                </div>
                <div className="rounded-2xl bg-[#F4F8FB] px-4 py-3">
                  <span className="mr-2 font-black text-[#2F7D50]">3.</span>
                  Du prüfst den fertigen Paketwunsch.
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {businessWhatsappUrl ? (
        <div className="mt-5" data-whatsapp-updates-team-takeover>
          <div data-team-whatsapp-component-wrap>
            <CustomerWhatsappUpdatesPanel
              token={token}
              requestNumber={requestNumber}
              initialEnabled={initialWhatsappUpdatesEnabled}
              businessWhatsappUrl={businessWhatsappUrl}
            />
          </div>
        </div>
      ) : null}

      {feedback ? (
        <p className="mt-4 rounded-2xl border border-[#9BD5B0] bg-white px-4 py-3 text-sm font-bold text-[#2F7D50]">
          {feedback}
        </p>
      ) : null}

      <div className="mt-8 border-t border-[#9BD5B0] pt-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-bold leading-6 text-[#52616F]">
            Du möchtest die offenen Positionen lieber selbst prüfen?
          </p>

          <button
            type="button"
            onClick={chooseSelf}
            disabled={isSaving !== null}
            className="inline-flex min-h-14 min-w-[250px] items-center justify-center rounded-full border-2 border-[#B8C7E0] bg-white px-9 py-4 text-base font-black text-[#102A43] shadow-lg transition hover:bg-[#EEF4FA] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving === "self" ? "Wird geöffnet ..." : "Artikel selbst auswählen"}
          </button>
        </div>
      </div>
    </section>
  );
}
