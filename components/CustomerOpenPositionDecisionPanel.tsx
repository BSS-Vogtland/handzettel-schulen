"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
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
  const rawText = await response.text();

  try {
    return rawText ? (JSON.parse(rawText) as ApiResponse) : {};
  } catch {
    return {
      ok: false,
      message:
        "Die Serverantwort konnte nicht gelesen werden. Bitte versuche es erneut.",
    };
  }
}

export default function CustomerOpenPositionDecisionPanel({
  token,
  openChoiceCount,
  manualReviewCount,
  initialChoice = null,
}: CustomerOpenPositionDecisionPanelProps) {
  const router = useRouter();

  const totalOpenCount = openChoiceCount + manualReviewCount;
  const [choice, setChoice] = useState<Choice>(initialChoice);
  const [isSaving, setIsSaving] = useState<Choice>(null);
  const [message, setMessage] = useState<string | null>(null);

  const storageKey = useMemo(() => getStorageKey(token), [token]);

  useEffect(() => {
    if (initialChoice) {
      setChoice(initialChoice);

      try {
        window.localStorage.setItem(storageKey, initialChoice);
      } catch {
        // localStorage ist optional.
      }

      return;
    }

    try {
      const stored = window.localStorage.getItem(storageKey);

      if (stored === "self" || stored === "team") {
        setChoice(stored);
      }
    } catch {
      // localStorage ist optional.
    }
  }, [initialChoice, storageKey]);

  function rememberChoice(nextChoice: Exclude<Choice, null>) {
    setChoice(nextChoice);

    try {
      window.localStorage.setItem(storageKey, nextChoice);
    } catch {
      // localStorage ist optional.
    }
  }

  async function chooseSelf() {
    if (isSaving) return;

    try {
      setIsSaving("self");
      setMessage(null);

      const response = await fetch(
        `/api/offer/${encodeURIComponent(token)}/self-selection`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      const result = await readApiResponse(response);

      if (!response.ok || result.ok === false) {
        throw new Error(
          result.message ||
            result.error ||
            "Die Selbst-Auswahl konnte nicht gespeichert werden."
        );
      }

      rememberChoice("self");
      setMessage(result.message || "Auswahl gespeichert.");

      router.refresh();

      window.setTimeout(() => {
        const target = document.getElementById("customer-open-positions-list");
        target?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 250);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Die Selbst-Auswahl konnte nicht gespeichert werden."
      );
    } finally {
      setIsSaving(null);
    }
  }

  async function chooseTeam() {
    if (isSaving) return;

    try {
      setIsSaving("team");
      setMessage(null);

      const response = await fetch(
        `/api/offer/${encodeURIComponent(token)}/service-takeover`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      const result = await readApiResponse(response);

      if (!response.ok || result.ok === false) {
        throw new Error(
          result.message ||
            result.error ||
            "Die Team-Übernahme konnte nicht gespeichert werden."
        );
      }

      rememberChoice("team");
      setMessage(result.message || "Auswahl gespeichert.");

      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Die Team-Übernahme konnte nicht gespeichert werden."
      );
    } finally {
      setIsSaving(null);
    }
  }

  if (choice === "team") {
    return (
      <section className="rounded-[34px] border-2 border-[#2F7D50] bg-[#F0FFF6] p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4">
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

              <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-[#52616F]">
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
            disabled={Boolean(isSaving)}
            className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-full border-2 border-[#B5282D] bg-white px-5 py-3 text-sm font-black text-[#B5282D] transition hover:bg-[#FFF1F1] disabled:opacity-60"
          >
            {isSaving === "self" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            Doch selbst auswählen
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-[26px] border border-[#BFE3CD] bg-white p-5">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-2xl bg-[#F0FFF6] text-[#2F7D50]">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <p className="text-sm font-black uppercase tracking-[0.14em] text-[#2F7D50]">
              1. Prüfung
            </p>
            <p className="mt-2 text-sm font-semibold leading-6 text-[#52616F]">
              Wir schauen uns die offenen Positionen an und bearbeiten sie
              manuell.
            </p>
          </div>

          <div className="rounded-[26px] border border-[#BFE3CD] bg-white p-5">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-2xl bg-[#F0FFF6] text-[#2F7D50]">
              <Image
                src="/handzettel-logo.png"
                alt="Handzettel-Schulen.de"
                width={26}
                height={26}
                className="object-contain"
              />
            </div>
            <p className="text-sm font-black uppercase tracking-[0.14em] text-[#2F7D50]">
              2. E-Mail
            </p>
            <p className="mt-2 text-sm font-semibold leading-6 text-[#52616F]">
              Du bekommst eine Nachricht, sobald Dein Paketwunsch fertig ist.
            </p>
          </div>

          <div className="rounded-[26px] border border-[#BFE3CD] bg-white p-5">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-2xl bg-[#F0FFF6] text-[#2F7D50]">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <p className="text-sm font-black uppercase tracking-[0.14em] text-[#2F7D50]">
              3. Prüfung durch Dich
            </p>
            <p className="mt-2 text-sm font-semibold leading-6 text-[#52616F]">
              Danach prüfst Du das fertige Paket und schließt die Bestellung ab.
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-[28px] border-2 border-[#2F8F57] bg-[#F3FBF6] px-6 py-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#1E7A43]">
            Wichtiger Hinweis
          </p>
          <h3 className="mt-2 text-2xl font-black text-[#064E2E]">
            Du musst jetzt nichts weiter tun.
          </h3>
          <p className="mt-3 text-base font-semibold leading-7 text-[#102A43]">
            Du kannst diese Seite jetzt einfach schließen. Ab hier übernimmt
            Handzettel-Schulen.de. Sobald Dein Paketwunsch fertig ist, bekommst
            Du eine E-Mail und kannst danach die Bestellung abschließen.
          </p>
        </div>
      </section>
    );
  }

  if (choice === "self") {
    return (
      <section className="rounded-[28px] border border-[#F1D1A8] bg-[#FFF8EE] p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
              Selbst-Auswahl aktiv
            </p>
            <h2 className="mt-1 text-xl font-black text-[#102A43]">
              Du wählst die offenen Positionen selbst aus.
            </h2>
            <p className="mt-1 text-sm font-semibold leading-6 text-[#52616F]">
              Du kannst die offenen Artikel unten bearbeiten. Wenn Du nicht
              weiterkommst, kannst Du die offenen Positionen jederzeit an
              Handzettel-Schulen.de übergeben.
            </p>
          </div>

          <button
            type="button"
            onClick={chooseTeam}
            disabled={Boolean(isSaving)}
            className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-full border border-[#2F7D50] bg-white px-5 py-3 text-sm font-black text-[#2F7D50] transition hover:bg-[#F0FFF6] disabled:opacity-60"
          >
            {isSaving === "team" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            Handzettel-Schulen.de übernehmen lassen
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        {message ? (
          <p className="mt-3 text-sm font-black text-[#2F7D50]">{message}</p>
        ) : null}
      </section>
    );
  }

  return (
    <section className="rounded-[34px] border border-[#F1D1A8] bg-[#FFF8EE] p-5 shadow-sm sm:p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#A75B28]">
            Offene Positionen
          </p>
          <h2 className="mt-2 text-3xl font-black tracking-tight text-[#102A43] sm:text-4xl">
            Wähle den nächsten Schritt.
          </h2>
          <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-[#52616F]">
            {totalOpenCount} Position{totalOpenCount === 1 ? "" : "en"} brauchen
            noch eine Entscheidung. Du kannst selbst weitermachen oder die
            offenen Positionen an Handzettel-Schulen.de übergeben.
          </p>
        </div>

        <div className="rounded-2xl border border-[#F1D1A8] bg-white px-4 py-3 text-sm font-black text-[#A75B28]">
          {totalOpenCount} offen
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <button
          type="button"
          onClick={chooseSelf}
          disabled={Boolean(isSaving)}
          className="group flex min-h-[190px] flex-col items-start justify-between rounded-[30px] border-2 border-[#B5282D] bg-white p-5 text-left shadow-sm transition hover:shadow-md disabled:opacity-60"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-3xl bg-[#FFF1F1] text-[#B5282D]">
            <Search className="h-6 w-6" />
          </span>

          <span>
            <span className="block text-2xl font-black text-[#102A43]">
              Ich wähle die Artikel selbst aus
            </span>
            <span className="mt-3 block text-sm font-semibold leading-6 text-[#52616F]">
              Zur Positionsliste springen, Vorschläge auswählen oder selbst nach
              Artikeln suchen.
            </span>
          </span>

          <span className="inline-flex items-center gap-2 text-sm font-black text-[#B5282D]">
            {isSaving === "self" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            Jetzt selbst auswählen
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </span>
        </button>

        <button
          type="button"
          onClick={chooseTeam}
          disabled={Boolean(isSaving)}
          className="group flex min-h-[190px] flex-col items-start justify-between rounded-[30px] border-2 border-[#BFE3CD] bg-[#F6FFF9] p-5 text-left shadow-sm transition hover:border-[#2F7D50] hover:shadow-md disabled:opacity-60"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-3xl bg-white">
            <Image
              src="/handzettel-logo.png"
              alt="Handzettel-Schulen.de"
              width={34}
              height={34}
              className="object-contain"
            />
          </span>

          <span>
            <span className="block text-2xl font-black text-[#102A43]">
              Handzettel-Schulen.de soll übernehmen.
            </span>
            <span className="mt-3 block text-sm font-semibold leading-6 text-[#52616F]">
              Wir prüfen die offenen Positionen und melden uns, sobald Dein
              Paketwunsch fertig ist.
            </span>
          </span>

          <span className="inline-flex items-center gap-2 text-sm font-black text-[#2F7D50]">
            {isSaving === "team" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            Handzettel-Schulen.de übernehmen lassen
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </span>
        </button>
      </div>

      {message ? (
        <p className="mt-4 rounded-2xl border border-[#F1D1A8] bg-white px-4 py-3 text-sm font-black text-[#A75B28]">
          {message}
        </p>
      ) : null}
    </section>
  );
}
