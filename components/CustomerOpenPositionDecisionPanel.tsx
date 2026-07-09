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
          keepalive: true,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            openChoiceCount,
            manualReviewCount,
          }),
        }
      );

      const result = await readApiResponse(response);

      if (!response.ok || result.ok === false) {
        throw new Error(
          result.error ||
            result.message ||
            "Die Selbstauswahl konnte nicht gespeichert werden."
        );
      }
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set("mode", "team");
      nextUrl.searchParams.set("refresh", Date.now().toString());
      nextUrl.hash = "offene-positionen";

      window.location.replace(nextUrl.toString());
      return;
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "Die Selbstauswahl konnte nicht gespeichert werden."
      );
    } finally {
      setIsSaving(null);
    }
  }

  async function chooseTeam(options: { silent?: boolean } = {}) {
    if (isSaving && !options.silent) return;

    if (!options.silent) {
      setIsSaving("team");
      setFeedback(null);
    }

    try {
      const response = await fetch(
        `/api/offer/${encodeURIComponent(token)}/service-takeover`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            openChoiceCount,
            manualReviewCount,
          }),
        }
      );

      const result = await readApiResponse(response);

      if (!response.ok || result.ok === false) {
        throw new Error(
          result.error ||
            result.message ||
            "Die Team-ÃƒÅ“bernahme konnte nicht gespeichert werden."
        );
      }

      rememberChoice("team");

      if (!options.silent) {
        setFeedback("Handzettel-Schulen.de ÃƒÂ¼bernimmt die offenen Positionen.");
      }
    } catch (error) {
      if (!options.silent) {
        setFeedback(
          error instanceof Error
            ? error.message
            : "Die Team-ÃƒÅ“bernahme konnte nicht gespeichert werden."
        );
      }
    } finally {
      if (!options.silent) {
        setIsSaving(null);
      }
    }
  }

  useEffect(() => {
    if (initialChoice === "self" || initialChoice === "team") {
      rememberChoice(initialChoice);
      return;
    }

    try {
      const mode = new URLSearchParams(window.location.search).get("mode");
      if (mode === "self") {
        rememberChoice("self");
        return;
      }
    } catch {
      // URL-Auswertung ist nur Komfort, nicht kritisch.
    }

    if (didAutoPersistTeam.current) return;

    didAutoPersistTeam.current = true;
    rememberChoice("team");
    // Kein stiller service-takeover-Call mehr:
    // Ein fehlendes initialChoice darf eine aktive Selbst-Auswahl und deren Mail-Trigger nicht ÃƒÂ¼berschreiben.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialChoice]);

  if (totalOpenCount <= 0) return null;

  if (choice === "self") {
    return (
      <section
        className="mx-auto flex w-full max-w-6xl flex-col items-center justify-center gap-3 rounded-[30px] border border-[#2F7D50] bg-[#EAF8EF] p-5 shadow-sm sm:p-6"
        data-self-selection-team-return
      >
        <button
          type="button"
          onClick={() => chooseTeam()}
          disabled={isSaving !== null}
          className="w-full rounded-[26px] bg-[#2F7D50] px-8 py-5 text-center text-base font-black text-white shadow-lg transition hover:bg-[#256942] disabled:cursor-not-allowed disabled:opacity-60 sm:text-lg lg:min-w-[430px] lg:w-auto"
        >
          {isSaving === "team"
            ? "Wird gespeichert ..."
            : "Handzettel-Schulen.de soll doch ÃƒÂ¼bernehmen"}
        </button>

        <p className="max-w-2xl text-center text-sm font-semibold leading-6 text-[#52616F]">
          Du kannst die offenen Positionen unten selbst auswÃƒÂ¤hlen. Wenn wir die offenen Positionen doch ÃƒÂ¼bernehmen sollen, klickst Du hier.
        </p>

        {feedback ? (
          <p className="rounded-2xl bg-white/80 px-4 py-3 text-sm font-bold text-[#52616F]">
            {feedback}
          </p>
        ) : null}
      </section>
    );
  }


  return (
    <section
      data-customer-team-only-panel className="rounded-[32px] border border-[#2F7D50] bg-[#F0FFF6] p-5 shadow-sm sm:p-7"
      data-open-position-service-default
    >
      <style
        dangerouslySetInnerHTML={{
          __html:
            "main:has([data-customer-team-only-panel]) > *:not(:has([data-customer-team-only-panel])) { display: none !important; } [data-customer-team-only-panel] ~ * { display: none !important; }",
        }}
      />

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2F7D50]">
            Handzettel-Schulen.de ÃƒÂ¼bernimmt
          </p>

          <h2 className="mt-2 max-w-3xl text-2xl font-black leading-tight text-[#102A43] sm:text-3xl">
            Die meisten Produkte wurden automatisch erkannt. Den Rest prÃƒÂ¼ft Handzettel-Schulen.de persÃƒÂ¶nlich fÃƒÂ¼r Dich.
          </h2>
        </div>

        <div className="rounded-2xl border border-[#9BD5B0] bg-white px-5 py-4 text-center">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#2F7D50]">
            Offen
          </p>
          <p className="mt-1 text-2xl font-black text-[#102A43]">
            {openLabel}
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-[#9BD5B0] bg-white px-4 py-4">
        <p className="text-sm font-bold leading-relaxed text-[#35546B]">
          Du musst jetzt nichts weiter tun. Sobald Dein fertiger Paketwunsch bereit ist,
          bekommst Du eine Nachricht und kannst die Bestellung abschlieÃƒÅ¸en.
        </p>
      </div>

      {businessWhatsappUrl ? (
        <div className="mt-5" data-whatsapp-updates-team-takeover>
          <CustomerWhatsappUpdatesPanel
            token={token}
            requestNumber={requestNumber}
            initialEnabled={initialWhatsappUpdatesEnabled}
            businessWhatsappUrl={businessWhatsappUrl}
          />
        </div>
      ) : null}

      <div className="mt-5 flex flex-col gap-2 border-t border-[#B9E5C8] pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs font-bold text-[#52616F]">
          Du mÃƒÂ¶chtest die offenen Positionen lieber selbst bearbeiten?
        </p>

        <a
          href={`/angebot/${encodeURIComponent(token)}?mode=self#offene-positionen`}
          onClick={(event) => {
            if (isSaving !== null) {
              event.preventDefault();
              return;
            }

            event.currentTarget.href = `/angebot/${encodeURIComponent(
              token
            )}?mode=self&refresh=${Date.now()}#offene-positionen`;

            void chooseSelf();
          }}
          aria-disabled={isSaving !== null}
          className="self-start rounded-full border border-[#C8D8E8] bg-white px-3 py-1.5 text-xs font-black text-[#12395F] transition hover:border-[#A75B28] hover:text-[#A75B28] aria-disabled:pointer-events-none aria-disabled:opacity-60 sm:self-auto"
        >
          {isSaving === "self" ? "Wird geÃƒÂ¶ffnet ..." : "Artikel selbst auswÃƒÂ¤hlen"}
        </a>
      </div>

      {feedback ? (
        <p className="mt-3 text-sm font-bold text-[#52616F]">{feedback}</p>
      ) : null}
    </section>
  );
}
