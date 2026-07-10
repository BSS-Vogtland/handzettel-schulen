"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Pencil,
  Ruler,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

type CustomerPreparePackageButtonProps = {
  token: string;
  requestId?: string | null;
};

type PrepareResponse = {
  ok?: boolean;
  itemCount?: number;
  matchCount?: number;
  preselectedCount?: number;
  manualReview?: boolean;
  reason?: string;
  message?: string;
};

const TIMELINE_STEPS = [
  { min: 0, label: "Liste wird geprüft" },
  { min: 22, label: "Schulmaterialien werden erkannt" },
  { min: 48, label: "Sichere Treffer werden gesucht" },
  { min: 72, label: "Ergebnis wird vorbereitet" },
  { min: 96, label: "Offene Positionen werden markiert" },
];

function getCurrentStep(progress: number) {
  let current = TIMELINE_STEPS[0].label;

  for (const step of TIMELINE_STEPS) {
    if (progress >= step.min) {
      current = step.label;
    }
  }

  return current;
}

function getStepState(progress: number, min: number, nextMin?: number) {
  if (progress >= min && (!nextMin || progress < nextMin)) return "active";
  if (progress >= min) return "done";
  return "pending";
}

function buildFriendlyServiceMessage(message?: string | null) {
  if (message && message.trim().length > 0) {
    return message.trim();
  }

  return "Alles ist bei uns angekommen. Die automatische Vorbereitung konnte Deine Liste nicht direkt eindeutig zuordnen – das ist kein Problem. Genau dafür gibt es unseren persönlichen Service: Wir schauen uns Deine Liste jetzt manuell an und suchen die passenden Schulmaterialien für Dich heraus.";
}

function isManualServicePayload(
  response: Response,
  payload: PrepareResponse | null
) {
  if (payload?.manualReview) return true;
  if (response.status === 422) return true;

  const message = payload?.message || "";

  return /manuell|manuelle|persönlich|keine positionen|nicht eindeutig|nicht gefunden/i.test(
    message
  );
}

export default function CustomerPreparePackageButton({
  token,
  requestId,
}: CustomerPreparePackageButtonProps) {
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [serviceMessage, setServiceMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading) return;

    const interval = window.setInterval(() => {
      setProgress((prev) => {
        if (prev >= 94) return prev;

        let next = prev;

        if (prev < 18) next += 4;
        else if (prev < 40) next += 3;
        else if (prev < 65) next += 2;
        else if (prev < 84) next += 1;
        else next += 0.5;

        return Math.min(94, Math.round(next));
      });
    }, 260);

    return () => window.clearInterval(interval);
  }, [isLoading]);

  const displayProgress = Math.max(0, Math.min(100, Math.round(progress)));
  const currentStepLabel = useMemo(
    () => getCurrentStep(displayProgress),
    [displayProgress]
  );
  function triggerOfferAccessMailLater() {
    window.setTimeout(() => {
      fetch(`/api/offer/${encodeURIComponent(token)}/send-access-mail`, {
        method: "POST",
        cache: "no-store",
        keepalive: true,
      }).catch(() => {
        // Die Link-Mail ist Zusatzkomfort. Der Kundenflow darf dadurch nie blockieren.
      });
    }, 125000);
  }
  async function handlePrepare() {
    if (isLoading || serviceMessage) return;

    setErrorMessage(null);
    setFeedbackMessage(null);
    setServiceMessage(null);
    setIsLoading(true);
    setProgress(4);
    triggerOfferAccessMailLater();

    try {
      const response = await fetch(
        `/api/offer/${encodeURIComponent(token)}/prepare`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            requestId: requestId || null,
          }),
        }
      );

      const rawText = await response.text();

      let payload: PrepareResponse | null = null;

      try {
        payload = rawText ? (JSON.parse(rawText) as PrepareResponse) : null;
      } catch {
        setIsLoading(false);
        setProgress(0);
        setServiceMessage(buildFriendlyServiceMessage());
        return;
      }

      if (isManualServicePayload(response, payload)) {
        setIsLoading(false);
        setProgress(0);
        setServiceMessage(buildFriendlyServiceMessage(payload?.message));
        return;
      }

      if (!response.ok || !payload?.ok) {
        setIsLoading(false);
        setProgress(0);
        setServiceMessage(
          buildFriendlyServiceMessage(
            "Deine Anfrage ist angekommen. Wir prüfen Deine Liste persönlich und bereiten Deinen Paketwunsch manuell vor."
          )
        );
        return;
      }

      setProgress(100);
      setFeedbackMessage(
        payload.message ||
          "Deine Liste wurde erfasst. Sichere Treffer wurden bereits für Dich ins Paket gelegt."
      );

      await new Promise((resolve) => window.setTimeout(resolve, 700));
      router.refresh();
    } catch {
      setIsLoading(false);
      setProgress(0);
      setServiceMessage(
        buildFriendlyServiceMessage(
          "Deine Anfrage ist angekommen. Wir prüfen Deine Liste persönlich und bereiten Deinen Paketwunsch manuell vor."
        )
      );
    }
  }

  if (isLoading) {
    return (
      <section className="rounded-[32px] border border-[#E8DED2] bg-white p-5 shadow-sm sm:p-7">
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-[#FBF7F0] px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
              <Sparkles className="h-3.5 w-3.5" />
              2. Schritt - Liste auslesen
            </div>

            <h2 className="mt-4 text-3xl font-black tracking-tight text-[#102A43]">
              Deine Liste wird ausgelesen.
            </h2>

            <p className="mt-3 max-w-2xl text-base leading-7 text-[#52616F]">
              Wir prüfen Deine Schulmaterialliste, erkennen passende Produkte
              und legen sichere Treffer automatisch für Dich ins Paket. Alles,
              was nicht eindeutig ist, bleibt zur Auswahl offen oder wird
              persönlich geprüft.
            </p>

            <div className="mt-6 rounded-[24px] border border-[#E8DED2] bg-[#FBF7F0] p-4">
              <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-[#102A43]">
                    {currentStepLabel}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[#52616F]">
                    Fortschritt beim Auslesen
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-3xl font-black leading-none text-[#B5282D]">
                    {displayProgress} %
                  </p>
                </div>
              </div>

              <div className="h-4 overflow-hidden rounded-full bg-white">
                <div
                  className="h-full rounded-full bg-[#B5282D] transition-all duration-300"
                  style={{ width: `${displayProgress}%` }}
                />
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {TIMELINE_STEPS.map((step, index) => {
                const nextMin = TIMELINE_STEPS[index + 1]?.min;
                const state = getStepState(displayProgress, step.min, nextMin);

                return (
                  <div
                    key={step.label}
                    className={`flex items-center gap-3 rounded-2xl border px-4 py-3 transition ${
                      state === "done"
                        ? "border-[#BFE3CD] bg-[#F0FFF6]"
                        : state === "active"
                          ? "border-[#F1D1A8] bg-[#FFF8EE]"
                          : "border-[#E8DED2] bg-white"
                    }`}
                  >
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                        state === "done"
                          ? "bg-[#2F7D50] text-white"
                          : state === "active"
                            ? "bg-[#A75B28] text-white"
                            : "bg-[#FBF7F0] text-[#A75B28]"
                      }`}
                    >
                      {state === "done" ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        <span className="text-xs font-black">{index + 1}</span>
                      )}
                    </div>

                    <div>
                      <p className="text-sm font-black text-[#102A43]">
                        {step.label}
                      </p>
                      <p className="text-xs font-semibold text-[#52616F]">
                        {state === "done"
                          ? "Abgeschlossen"
                          : state === "active"
                            ? "Wird gerade ausgeführt"
                            : "Als Nächstes"}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-[28px] border border-[#E8DED2] bg-[#FBF7F0] p-5">
            <div className="relative mx-auto h-[320px] w-full max-w-[420px] overflow-hidden rounded-[28px] bg-white">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(181,40,45,0.08),_transparent_60%)]" />

              <div className="absolute left-1/2 top-1/2 z-20 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-[32px] border border-[#E8DED2] bg-white shadow-[0_20px_60px_rgba(16,42,67,0.12)]">
                <div className="relative h-full w-full overflow-hidden rounded-[32px]">
                  <Image
                    src="/handzettel-logo.png"
                    alt="Handzettel-Schulen.de"
                    fill
                    className="object-contain p-5"
                    priority
                  />
                </div>
              </div>

              <div className="absolute left-1/2 top-1/2 z-30 flex h-14 w-14 -translate-x-1/2 translate-y-14 items-center justify-center rounded-full border-4 border-white bg-[#B5282D] text-lg font-black text-white shadow-lg">
                {displayProgress}%
              </div>

              <div className="packing-item packing-item-1">
                <BookOpen className="h-6 w-6" />
              </div>

              <div className="packing-item packing-item-2">
                <Pencil className="h-6 w-6" />
              </div>

              <div className="packing-item packing-item-3">
                <Ruler className="h-6 w-6" />
              </div>

              <div className="packing-item packing-item-4">
                <BookOpen className="h-6 w-6" />
              </div>

              <div className="absolute bottom-5 left-1/2 z-10 w-[80%] -translate-x-1/2 rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] px-4 py-3 text-center">
                <p className="text-sm font-black text-[#102A43]">
                  Ergebnis wird vorbereitet
                </p>
                <p className="mt-1 text-xs font-semibold text-[#52616F]">
                  Sichere Treffer kommen direkt ins Paket
                </p>
              </div>
            </div>
          </div>
        </div>

        <style jsx>{`
          .packing-item {
            position: absolute;
            z-index: 10;
            display: flex;
            height: 52px;
            width: 52px;
            align-items: center;
            justify-content: center;
            border-radius: 16px;
            border: 1px solid #e8ded2;
            background: #ffffff;
            color: #12395f;
            box-shadow: 0 10px 30px rgba(16, 42, 67, 0.1);
            opacity: 0;
          }

          .packing-item-1 {
            animation: packItem1 2.9s ease-in-out infinite;
          }

          .packing-item-2 {
            animation: packItem2 3.1s ease-in-out infinite 0.3s;
          }

          .packing-item-3 {
            animation: packItem3 2.8s ease-in-out infinite 0.6s;
          }

          .packing-item-4 {
            animation: packItem4 3s ease-in-out infinite 0.9s;
          }

          @keyframes packItem1 {
            0% {
              left: 18px;
              top: 26px;
              opacity: 0;
              transform: translate(0, 0) scale(0.9) rotate(-8deg);
            }
            12% {
              opacity: 1;
            }
            62% {
              left: 50%;
              top: 50%;
              opacity: 1;
              transform: translate(-50%, -50%) scale(0.8) rotate(0deg);
            }
            78% {
              opacity: 0;
              transform: translate(-50%, -50%) scale(0.35);
            }
            100% {
              left: 50%;
              top: 50%;
              opacity: 0;
              transform: translate(-50%, -50%) scale(0.35);
            }
          }

          @keyframes packItem2 {
            0% {
              right: 20px;
              top: 38px;
              opacity: 0;
              transform: translate(0, 0) scale(0.9) rotate(10deg);
            }
            12% {
              opacity: 1;
            }
            62% {
              right: 50%;
              top: 50%;
              opacity: 1;
              transform: translate(50%, -50%) scale(0.78) rotate(0deg);
            }
            78% {
              opacity: 0;
              transform: translate(50%, -50%) scale(0.35);
            }
            100% {
              right: 50%;
              top: 50%;
              opacity: 0;
              transform: translate(50%, -50%) scale(0.35);
            }
          }

          @keyframes packItem3 {
            0% {
              left: 30px;
              bottom: 72px;
              opacity: 0;
              transform: translate(0, 0) scale(0.9) rotate(-6deg);
            }
            12% {
              opacity: 1;
            }
            62% {
              left: 50%;
              bottom: 50%;
              opacity: 1;
              transform: translate(-50%, 50%) scale(0.78) rotate(0deg);
            }
            78% {
              opacity: 0;
              transform: translate(-50%, 50%) scale(0.35);
            }
            100% {
              left: 50%;
              bottom: 50%;
              opacity: 0;
              transform: translate(-50%, 50%) scale(0.35);
            }
          }

          @keyframes packItem4 {
            0% {
              right: 24px;
              bottom: 88px;
              opacity: 0;
              transform: translate(0, 0) scale(0.9) rotate(7deg);
            }
            12% {
              opacity: 1;
            }
            62% {
              right: 50%;
              bottom: 50%;
              opacity: 1;
              transform: translate(50%, 50%) scale(0.8) rotate(0deg);
            }
            78% {
              opacity: 0;
              transform: translate(50%, 50%) scale(0.35);
            }
            100% {
              right: 50%;
              bottom: 50%;
              opacity: 0;
              transform: translate(50%, 50%) scale(0.35);
            }
          }
        `}</style>
      </section>
    );
  }

  const introHeadline = serviceMessage
    ? "Wir übernehmen die persönliche Prüfung."
    : "Deine Liste ist angekommen.";

  const introText = serviceMessage
    ? "Deine Liste liegt bei uns vor. Ab hier übernehmen wir persönlich und suchen die passenden Schulmaterialien für Dich heraus."
    : "Starte jetzt das Auslesen Deiner Liste. Sichere Treffer werden direkt in den Paketwunsch gelegt. Wenn danach noch Positionen offen sind, entscheidest Du selbst: Artikel suchen und ergänzen oder Handzettel-Schulen.de übernehmen lassen.";

  return (
    <section className="mx-auto w-full max-w-[620px] rounded-[32px] border border-[#E8DED2] bg-white p-5 shadow-sm sm:p-7">
      <div className="mx-auto w-full max-w-[620px]">
        <div className="flex flex-col gap-4">
          {serviceMessage ? (
            <div className="inline-flex min-h-[76px] w-full items-center justify-center gap-3 rounded-[28px] border border-[#BFE3CD] bg-[#F0FFF6] px-8 py-5 text-center text-xl font-black text-[#2F7D50] shadow-sm">
              <CheckCircle2 className="h-6 w-6" />
              <span>Wird jetzt persönlich für Dich vorbereitet</span>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={handlePrepare}
                className="inline-flex min-h-[76px] w-full items-center justify-center gap-3 rounded-[28px] bg-[#C6282D] px-8 py-5 text-center text-2xl font-black text-white shadow-[0_18px_50px_rgba(198,40,45,0.24)] transition hover:-translate-y-0.5 hover:brightness-105"
              >
                <span>2. Schritt - Liste auslesen</span>
                <ArrowRight className="h-7 w-7" />
              </button>

              <p className="text-center text-sm font-semibold leading-6 text-[#52616F]">
                Danach siehst Du sofort, was bereits im Paket liegt und was noch
                offen ist.
              </p>
            </>
          )}

          <div className="overflow-hidden rounded-[28px] border border-[#E8DED2] bg-[#FBF7F0] shadow-sm">
            <div className="relative h-[260px] w-full bg-white">
              <Image
                src="/service-schulheft-assistentin.png"
                alt="Freundliche Mitarbeiterin sucht passende Schulhefte für den Kunden aus dem Regal"
                fill
                className="object-cover"
                priority
              />
            </div>

            <div className="p-5">
              <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-[#A75B28]">
                <Search className="h-3.5 w-3.5" />
                Unser Service für Dich
              </div>

              <h3 className="mt-3 text-xl font-black text-[#102A43]">
                Das Team von Handzettel-Schulen.de prüft persönlich.
              </h3>

              <p className="mt-2 text-sm leading-6 text-[#52616F]">
                Das Team von Handzettel-Schulen.de schaut sich Deine Liste persönlich an und sucht die passenden Schulmaterialien für Dich heraus.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

