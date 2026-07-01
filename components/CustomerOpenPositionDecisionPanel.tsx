"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, Loader2, Search, ShieldCheck } from "lucide-react";

type Choice = "self" | "team" | null;

type CustomerOpenPositionDecisionPanelProps = {
  token: string;
  openChoiceCount: number;
  manualReviewCount: number;
};

function getStorageKey(token: string) {
  return `hds_open_position_choice_${token}`;
}

export default function CustomerOpenPositionDecisionPanel({
  token,
  openChoiceCount,
  manualReviewCount,
}: CustomerOpenPositionDecisionPanelProps) {
  const [choice, setChoice] = useState<Choice>(null);
  const [isSavingTeamChoice, setIsSavingTeamChoice] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const totalOpenCount = openChoiceCount + manualReviewCount;

  const storageKey = useMemo(() => getStorageKey(token), [token]);

  useEffect(() => {
    try {
      const storedChoice = window.localStorage.getItem(storageKey);

      if (storedChoice === "self" || storedChoice === "team") {
        setChoice(storedChoice);
        return;
      }
    } catch {
      // Lokaler Speicher ist optional.
    }

    setChoice(null);
  }, [storageKey]);

  useEffect(() => {
    const body = document.body;

    if (choice === "self") {
      body.setAttribute("data-hds-open-position-choice", "self");
    } else if (choice === "team") {
      body.setAttribute("data-hds-open-position-choice", "team");
    } else {
      body.setAttribute("data-hds-open-position-choice", "pending");
    }

    return () => {
      body.removeAttribute("data-hds-open-position-choice");
    };
  }, [choice]);

  function rememberChoice(nextChoice: Exclude<Choice, null>) {
    try {
      window.localStorage.setItem(storageKey, nextChoice);
    } catch {
      // Lokaler Speicher ist optional.
    }

    setChoice(nextChoice);
  }

  function chooseSelf() {
    setMessage(null);
    rememberChoice("self");

    window.setTimeout(() => {
      document
        .getElementById("customer-open-positions-list")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }

  async function chooseTeam() {
    if (isSavingTeamChoice) return;

    setMessage(null);
    rememberChoice("team");
    setIsSavingTeamChoice(true);

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

      const payload = await response.json().catch(() => null);

      if (!response.ok || payload?.ok === false) {
        setMessage(
          payload?.message ||
            "Die Auswahl wurde lokal gespeichert. Falls nötig, informiere uns bitte zusätzlich kurz per E-Mail."
        );
        return;
      }

      setMessage(
        "Gespeichert. Handzettel-Schulen.de übernimmt die offenen Positionen."
      );
    } catch {
      setMessage(
        "Die Auswahl wurde lokal gespeichert. Falls nötig, informiere uns bitte zusätzlich kurz per E-Mail."
      );
    } finally {
      setIsSavingTeamChoice(false);
    }
  }

  return (
    <section className="rounded-[34px] border border-[#F1D1A8] bg-[#FFF8EE] p-5 shadow-sm sm:p-6">
      <style>{`
        body:not([data-hds-open-position-choice="self"]) .hds-open-position-self-content {
          display: none;
        }
      `}</style>

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
            Entscheidung erforderlich
          </p>

          <h2 className="mt-2 text-2xl font-black text-[#102A43] sm:text-3xl">
            {totalOpenCount === 1
              ? "Eine Position ist noch offen."
              : `${totalOpenCount} Positionen sind noch offen.`}
          </h2>

          <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#52616F]">
            Entscheide jetzt, ob Du die offenen Artikel selbst suchst und ergänzt
            oder ob Handzettel-Schulen.de die offenen Positionen für Dich übernimmt.
          </p>
        </div>

        <div className="rounded-2xl border border-[#E8DED2] bg-white px-4 py-3 text-sm font-black text-[#102A43]">
          Offen zur Auswahl: {openChoiceCount} · Persönliche Prüfung:{" "}
          {manualReviewCount}
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <button
          type="button"
          onClick={chooseSelf}
          className={
            choice === "self"
              ? "flex min-h-[128px] flex-col items-start justify-center rounded-[28px] border-2 border-[#B5282D] bg-white px-5 py-5 text-left shadow-sm transition hover:-translate-y-0.5"
              : "flex min-h-[128px] flex-col items-start justify-center rounded-[28px] border border-[#E8DED2] bg-white px-5 py-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#B5282D]"
          }
        >
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FFF1F1] text-[#B5282D]">
            <Search className="h-5 w-5" />
          </span>

          <span className="mt-4 text-xl font-black text-[#102A43]">
            Ich suche und ergänze die Artikel selbst
          </span>

          <span className="mt-2 text-sm font-semibold leading-6 text-[#52616F]">
            Die Seite springt zur Positionsliste. Dort kannst Du Vorschläge
            auswählen oder selbst nach passenden Produkten suchen.
          </span>

          <span className="mt-4 inline-flex items-center gap-2 text-sm font-black text-[#B5282D]">
            Zur Positionsliste
            <ArrowRight className="h-4 w-4" />
          </span>
        </button>

        <button
          type="button"
          onClick={chooseTeam}
          disabled={isSavingTeamChoice}
          className={
            choice === "team"
              ? "flex min-h-[128px] flex-col items-start justify-center rounded-[28px] border-2 border-[#2F7D50] bg-[#F0FFF6] px-5 py-5 text-left shadow-sm transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70"
              : "flex min-h-[128px] flex-col items-start justify-center rounded-[28px] border border-[#BFE3CD] bg-[#F7FBF8] px-5 py-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#2F7D50] disabled:cursor-not-allowed disabled:opacity-70"
          }
        >
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[#2F7D50]">
            {isSavingTeamChoice ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <ShieldCheck className="h-5 w-5" />
            )}
          </span>

          <span className="mt-4 text-xl font-black text-[#102A43]">
            Handzettel-Schulen.de soll übernehmen
          </span>

          <span className="mt-2 text-sm font-semibold leading-6 text-[#52616F]">
            Wir prüfen die offenen Positionen persönlich und melden uns, sobald
            Dein Paketwunsch fertig ist.
          </span>

          <span className="mt-4 inline-flex items-center gap-2 text-sm font-black text-[#2F7D50]">
            Team übernehmen lassen
            <ArrowRight className="h-4 w-4" />
          </span>
        </button>
      </div>

      {choice === "team" ? (
        <div className="mt-5 rounded-[24px] border border-[#BFE3CD] bg-white p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#F0FFF6] text-[#2F7D50]">
              <CheckCircle2 className="h-5 w-5" />
            </div>

            <div>
              <p className="text-sm font-black text-[#102A43]">
                Wir übernehmen jetzt die offenen Positionen.
              </p>

              <p className="mt-1 text-sm font-semibold leading-6 text-[#52616F]">
                Du musst an dieser Stelle nichts weiter auswählen. Wenn Du doch
                selbst weitermachen möchtest, kannst Du jederzeit wieder auf
                „Ich suche und ergänze die Artikel selbst“ wechseln.
              </p>

              {message ? (
                <p className="mt-3 text-sm font-black text-[#2F7D50]">
                  {message}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {choice === "self" ? (
        <div className="mt-5 rounded-[24px] border border-[#D6E7EF] bg-white p-4">
          <p className="text-sm font-black text-[#102A43]">
            Selbst-Auswahl aktiv.
          </p>
          <p className="mt-1 text-sm font-semibold leading-6 text-[#52616F]">
            Unten findest Du die offenen Positionen. Wenn Du doch nicht weiterkommst,
            kannst Du hier jederzeit auf „Handzettel-Schulen.de soll übernehmen“
            umschwenken.
          </p>
        </div>
      ) : null}
    </section>
  );
}
