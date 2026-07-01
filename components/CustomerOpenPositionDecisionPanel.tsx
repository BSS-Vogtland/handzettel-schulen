"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Loader2,
  Mail,
  Search,
  ShieldCheck,
} from "lucide-react";

type Choice = "self" | "team" | null;

const TEAM_CARD_LOGO_SRC = "/handzettel-logo.png";

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

  if (choice === "team") {
    return (
      <section className="rounded-[34px] border-2 border-[#2F7D50] bg-[#F0FFF6] p-5 shadow-sm sm:p-7">
        <style>{`
          body:not([data-hds-open-position-choice="self"]) .hds-open-position-self-content {
            display: none;
          }
        `}</style>

        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex max-w-3xl items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-3xl bg-white text-[#2F7D50]">
              <CheckCircle2 className="h-7 w-7" />
            </div>

            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2F7D50]">
                Übernahme bestätigt
              </p>

              <h2 className="mt-2 text-3xl font-black tracking-tight text-[#102A43] sm:text-4xl">
                Handzettel-Schulen.de übernimmt die offenen Positionen.
              </h2>

              <p className="mt-3 text-sm font-semibold leading-6 text-[#52616F]">
                Du musst jetzt keine weiteren Artikel auswählen. Wir prüfen die
                offenen Positionen persönlich und bereiten den fertigen
                Paketwunsch für Dich vor.
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

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-[26px] border border-[#BFE3CD] bg-white p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#F0FFF6] text-[#2F7D50]">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <p className="mt-4 text-sm font-black uppercase tracking-[0.14em] text-[#2F7D50]">
              1. Prüfung
            </p>
            <p className="mt-2 text-sm font-semibold leading-6 text-[#52616F]">
              Wir schauen uns die offenen Positionen an und bearbeiten sie manuell.
            </p>
          </div>

          <div className="rounded-[26px] border border-[#BFE3CD] bg-white p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#F0FFF6] text-[#2F7D50]">
              <Mail className="h-5 w-5" />
            </div>
            <p className="mt-4 text-sm font-black uppercase tracking-[0.14em] text-[#2F7D50]">
              2. E-Mail
            </p>
            <p className="mt-2 text-sm font-semibold leading-6 text-[#52616F]">
              Du bekommst eine Nachricht, sobald Dein Paketwunsch fertig ist.
            </p>
          </div>

          <div className="rounded-[26px] border border-[#BFE3CD] bg-white p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#F0FFF6] text-[#2F7D50]">
              <Clock3 className="h-5 w-5" />
            </div>
            <p className="mt-4 text-sm font-black uppercase tracking-[0.14em] text-[#2F7D50]">
              3. Prüfung durch Dich
            </p>
            <p className="mt-2 text-sm font-semibold leading-6 text-[#52616F]">
              Danach prüfst Du das fertige Paket und schließt dann die Bestellung ab.
            </p>
          </div>
        </div>

        
        <div className="mt-6 rounded-[28px] border-2 border-[#2F8F57] bg-[#F3FBF6] px-6 py-6 shadow-[0_10px_30px_rgba(47,143,87,0.10)] sm:px-7 sm:py-7">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-[#1E7A43] shadow-sm">
              <span className="text-2xl font-black leading-none">✓</span>
            </div>

            <div className="flex-1">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#1E7A43]">
                Wichtiger Hinweis
              </p>

              <h3 className="mt-1 text-2xl font-black leading-tight text-[#123B23] sm:text-[30px]">
                Du musst jetzt nichts weiter tun.
              </h3>

              <p className="mt-3 text-base font-semibold leading-7 text-[#23435B] sm:text-lg">
                Du kannst diese Seite jetzt einfach schließen. Ab hier übernimmt
                Handzettel-Schulen.de.
              </p>

              <p className="mt-2 text-sm font-semibold leading-6 text-[#23435B] sm:text-base">
                Sobald Dein Paketwunsch fertig ist, bekommst Du eine E-Mail und
                kannst danach die Bestellung abschließen.
              </p>
            </div>
          </div>
        </div>
      </section>
    );
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
            Offene Positionen
          </p>

          <h2 className="mt-2 text-3xl font-black tracking-tight text-[#102A43] sm:text-4xl">
            Wähle den nächsten Schritt.
          </h2>

          <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-[#52616F]">
            {totalOpenCount === 1
              ? "Eine Position braucht noch eine Entscheidung."
              : `${totalOpenCount} Positionen brauchen noch eine Entscheidung.`} Du kannst selbst weitermachen oder die offenen Positionen an Handzettel-Schulen.de übergeben.
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
              ? "group flex min-h-[190px] flex-col items-start justify-between rounded-[30px] border-2 border-[#B5282D] bg-white px-6 py-6 text-left shadow-md transition hover:-translate-y-0.5"
              : "group flex min-h-[190px] flex-col items-start justify-between rounded-[30px] border-2 border-white bg-white px-6 py-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#B5282D]"
          }
        >
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FFF1F1] text-[#B5282D]">
            <Search className="h-5 w-5" />
          </span>

          <span className="mt-4 text-2xl font-black leading-tight text-[#102A43]">
            Ich wähle die Artikel selbst aus
          </span>

          <span className="mt-2 text-sm font-semibold leading-6 text-[#52616F]">
            Zur Positionsliste springen, Vorschläge auswählen oder selbst nach
            Artikeln suchen.
          </span>

          <span className="mt-5 inline-flex items-center text-sm font-black text-[#B5282D]">
            Jetzt selbst auswählen
            <ArrowRight className="ml-2 h-4 w-4 transition group-hover:translate-x-1" />
          </span>
        </button>

        <button
          type="button"
          onClick={chooseTeam}
          disabled={isSavingTeamChoice}
          className={
            "group flex min-h-[190px] flex-col items-start justify-between rounded-[30px] border-2 border-[#BFE3CD] bg-[#F7FBF8] px-6 py-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#2F7D50] disabled:cursor-not-allowed disabled:opacity-70"
          }
        >
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-[#2F7D50]">
            {isSavingTeamChoice ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Image
                src={TEAM_CARD_LOGO_SRC}
                alt="Handzettel-Schulen.de"
                width={28}
                height={28}
                className="h-7 w-auto object-contain"
              />
            )}
          </span>

          <span className="mt-4 text-2xl font-black leading-tight text-[#102A43]">
            Handzettel-Schulen.de übernimmt
          </span>

          <span className="mt-2 text-sm font-semibold leading-6 text-[#52616F]">
            Wir prüfen die offenen Positionen und melden uns, sobald Dein
            Paketwunsch fertig ist.
          </span>

          <span className="mt-5 inline-flex items-center text-sm font-black text-[#2F7D50]">
            Offene Positionen abgeben
            <ArrowRight className="ml-2 h-4 w-4 transition group-hover:translate-x-1" />
          </span>
        </button>
      </div>
    </section>
  );
}

