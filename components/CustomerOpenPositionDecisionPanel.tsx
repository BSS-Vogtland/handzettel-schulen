"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Loader2,
  Search,
  ShieldCheck,
} from "lucide-react";

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

      setMessage("Auswahl gespeichert.");
    } catch {
      setMessage(
        "Die Auswahl wurde lokal gespeichert. Falls nötig, informiere uns bitte zusätzlich kurz per E-Mail."
      );
    } finally {
      setIsSavingTeamChoice(false);
    }
  }

  return (
    <section className="rounded-[34px] border-2 border-[#F1D1A8] bg-[#FFF8EE] p-5 shadow-sm sm:p-6">
      <style>{`
        body:not([data-hds-open-position-choice="self"]) .hds-open-position-self-content {
          display: none;
        }
      `}</style>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#A75B28]">
            Nächster Schritt
          </p>

          <h2 className="mt-2 text-3xl font-black tracking-tight text-[#102A43] sm:text-4xl">
            Was soll mit {totalOpenCount === 1 ? "der offenen Position" : "den offenen Positionen"} passieren?
          </h2>

          <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-[#52616F]">
            Wähle eine klare Richtung. Du kannst später jederzeit wechseln,
            falls Du doch nicht weiterkommst oder die Positionen lieber abgeben möchtest.
          </p>
        </div>

        <div className="rounded-2xl border border-[#F1D1A8] bg-white px-4 py-3 text-sm font-black text-[#A75B28]">
          {totalOpenCount} offen
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <button
          type="button"
          onClick={chooseSelf}
          className={
            choice === "self"
              ? "flex min-h-[172px] flex-col items-start justify-between rounded-[30px] border-2 border-[#B5282D] bg-white px-6 py-6 text-left shadow-md transition hover:-translate-y-0.5"
              : "flex min-h-[172px] flex-col items-start justify-between rounded-[30px] border-2 border-white bg-white px-6 py-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#B5282D]"
          }
        >
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FFF1F1] text-[#B5282D]">
            <Search className="h-5 w-5" />
          </span>

          <span className="mt-4 text-2xl font-black leading-tight text-[#102A43]">
            Ich wähle die offenen Artikel selbst aus
          </span>

          <span className="mt-2 text-sm font-semibold leading-6 text-[#52616F]">
            Du springst direkt zur Positionsliste und kannst passende Vorschläge
            auswählen oder selbst nach Artikeln suchen.
          </span>

          <span className="mt-5 inline-flex rounded-full bg-[#B5282D] px-5 py-3 text-sm font-black text-white">
            Jetzt selbst Artikel auswählen
            <ArrowRight className="ml-2 h-4 w-4" />
          </span>
        </button>

        <button
          type="button"
          onClick={chooseTeam}
          disabled={isSavingTeamChoice}
          className={
            choice === "team"
              ? "flex min-h-[172px] flex-col items-start justify-between rounded-[30px] border-2 border-[#2F7D50] bg-[#F0FFF6] px-6 py-6 text-left shadow-md transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70"
              : "flex min-h-[172px] flex-col items-start justify-between rounded-[30px] border-2 border-[#BFE3CD] bg-[#F7FBF8] px-6 py-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#2F7D50] disabled:cursor-not-allowed disabled:opacity-70"
          }
        >
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-[#2F7D50]">
            {isSavingTeamChoice ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <ShieldCheck className="h-5 w-5" />
            )}
          </span>

          <span className="mt-4 text-2xl font-black leading-tight text-[#102A43]">
            Handzettel-Schulen.de übernimmt
          </span>

          <span className="mt-2 text-sm font-semibold leading-6 text-[#52616F]">
            Wir prüfen die offenen Positionen persönlich und melden uns, sobald
            Dein Paketwunsch fertig ist.
          </span>

          <span className="mt-5 inline-flex rounded-full bg-[#2F7D50] px-5 py-3 text-sm font-black text-white">
            Offene Positionen prüfen lassen
            <ArrowRight className="ml-2 h-4 w-4" />
          </span>
        </button>
      </div>

      {choice === "team" ? (
        <div className="mt-6 rounded-[28px] border-2 border-[#2F7D50] bg-white p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#F0FFF6] text-[#2F7D50]">
                <CheckCircle2 className="h-5 w-5" />
              </div>

              <div>
                <p className="text-lg font-black text-[#102A43]">
                  Auswahl gespeichert: Wir übernehmen die offenen Positionen.
                </p>

                <p className="mt-2 text-sm font-semibold leading-6 text-[#52616F]">
                  Nächster Schritt: Du musst hier nichts weiter auswählen.
                  Handzettel-Schulen.de prüft die offenen Positionen und schickt
                  Dir den fertigen Paketwunsch per E-Mail.
                </p>

                {message ? (
                  <p className="mt-3 text-sm font-black text-[#2F7D50]">
                    {message}
                  </p>
                ) : null}
              </div>
            </div>

            <button
              type="button"
              onClick={chooseSelf}
              className="inline-flex shrink-0 items-center justify-center rounded-full border border-[#B5282D] bg-white px-5 py-3 text-sm font-black text-[#B5282D] transition hover:bg-[#FFF1F1]"
            >
              Doch selbst auswählen
              <ArrowRight className="ml-2 h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}

      {choice === "self" ? (
        <div className="mt-6 rounded-[28px] border-2 border-[#B5282D] bg-white p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-lg font-black text-[#102A43]">
                Selbst-Auswahl aktiv.
              </p>

              <p className="mt-2 text-sm font-semibold leading-6 text-[#52616F]">
                Nächster Schritt: Wähle unten passende Artikel aus oder suche
                selbst nach Produkten. Wenn Du nicht weiterkommst, kannst Du die
                offenen Positionen an Handzettel-Schulen.de übergeben.
              </p>
            </div>

            <button
              type="button"
              onClick={chooseTeam}
              disabled={isSavingTeamChoice}
              className="inline-flex shrink-0 items-center justify-center rounded-full border border-[#2F7D50] bg-[#F0FFF6] px-5 py-3 text-sm font-black text-[#2F7D50] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-70"
            >
              Team übernehmen lassen
              <ArrowRight className="ml-2 h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
