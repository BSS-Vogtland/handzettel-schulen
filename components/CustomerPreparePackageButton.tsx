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
  { min: 0, label: "Liste wird geprÃ¼ft" },
  { min: 22, label: "Schulmaterialien werden erkannt" },
  { min: 48, label: "Sichere Treffer werden gesucht" },
  { min: 72, label: "Paketwunsch wird vorbereitet" },
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

  return "Alles ist bei uns angekommen. Die automatische Vorbereitung konnte Deine Liste nicht direkt eindeutig zuordnen â€“ das ist kein Problem. Genau dafÃ¼r gibt es unseren persÃ¶nlichen Service: Wir schauen uns Deine Liste jetzt manuell an und suchen die passenden Schulmaterialien fÃ¼r Dich heraus.";
}

function isManualServicePayload(
  response: Response,
  payload: PrepareResponse | null
) {
  if (payload?.manualReview) return true;
  if (response.status === 422) return true;

  const message = payload?.message || "";

  return /manuell|manuelle|persÃ¶nlich|persoenlich|keine positionen|nicht eindeutig|nicht gefunden/i.test(
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

  async function handlePrepare() {
    if (isLoading || serviceMessage) return;

    setErrorMessage(null);
    setFeedbackMessage(null);
    setServiceMessage(null);
    setIsLoading(true);
    setProgress(4);

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
            "Deine Anfrage ist angekommen. Wir prÃ¼fen Deine Liste persÃ¶nlich und bereiten Deinen Paketwunsch manuell vor."
          )
        );
        return;
      }

      setProgress(100);
      setFeedbackMessage(
        payload.message ||
          "Deine Liste wurde ausgewertet. Sichere Treffer wurden bereits fÃ¼r Dich ins Paket gelegt."
      );

      await new Promise((resolve) => window.setTimeout(resolve, 700));
      router.refresh();
    } catch {
      setIsLoading(false);
      setProgress(0);
      setServiceMessage(
        buildFriendlyServiceMessage(
          "Deine Anfrage ist angekommen. Wir prÃ¼fen Deine Liste persÃ¶nlich und bereiten Deinen Paketwunsch manuell vor."
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
              Automatische Paketvorbereitung
            </div>

            <h2 className="mt-4 text-3xl font-black tracking-tight text-[#102A43]">
              Dein Paketwunsch wird vorbereitet.
            </h2>

            <p className="mt-3 max-w-2xl text-base leading-7 text-[#52616F]">
              Wir prÃ¼fen Deine Schulmaterialliste, erkennen passende Produkte
              und legen sichere Treffer automatisch fÃ¼r Dich ins Paket. Alles,
              was nicht eindeutig ist, bleibt zur Auswahl offen oder wird
              persÃ¶nlich geprÃ¼ft.
            </p>

            <div className="mt-6 rounded-[24px] border border-[#E8DED2] bg-[#FBF7F0] p-4">
              <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-[#102A43]">
                    {currentStepLabel}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[#52616F]">
                    Fortschritt der Paketvorbereitung
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
                            ? "Wird gerade ausgefÃ¼hrt"
                            : "Als NÃ¤chstes"}
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
                  Schulpaket wird vorbereitet
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
    ? "Wir Ã¼bernehmen die persÃ¶nliche PrÃ¼fung."
    : "Deine Liste ist angekommen.";

  const introText = serviceMessage
    ? "Deine Liste liegt bei uns vor. Ab hier Ã¼bernehmen wir persÃ¶nlich und suchen die passenden Schulmaterialien fÃ¼r Dich heraus."
    : "Starte jetzt die Auswertung. Sichere Treffer ab 80 % werden direkt fÃ¼r Dich in den Paketwunsch gelegt. Produkte mit niedrigerer Ãœbereinstimmung kannst Du danach selbst auswÃ¤hlen. Wenn etwas nicht eindeutig ist, Ã¼bernehmen wir die persÃ¶nliche PrÃ¼fung fÃ¼r Dich.";

  return (
    <section className="rounded-[32px] border border-[#E8DED2] bg-white p-5 shadow-sm sm:p-7">
      <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
        <div>
          <div
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.16em] ${
              serviceMessage
                ? "bg-[#F0FFF6] text-[#2F7D50]"
                : "bg-[#FBF7F0] text-[#A75B28]"
            }`}
          >
            {serviceMessage ? (
              <ShieldCheck className="h-3.5 w-3.5" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {serviceMessage
              ? "PersÃ¶nlicher Service"
              : "Automatische Paketvorbereitung"}
          </div>

          <h2 className="mt-4 text-3xl font-black tracking-tight text-[#102A43]">
            {introHeadline}
          </h2>

          <p className="mt-3 max-w-2xl text-base leading-7 text-[#52616F]">
            {introText}
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {serviceMessage ? (
              <>
                <div className="rounded-2xl border border-[#BFE3CD] bg-[#F0FFF6] p-4">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-[#2F7D50]">
                    BestÃ¤tigt
                  </p>
                  <p className="mt-1 text-sm font-bold leading-5 text-[#2F7D50]">
                    Deine Anfrage ist angekommen.
                  </p>
                </div>

                <div className="rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] p-4">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-[#A75B28]">
                    Service
                  </p>
                  <p className="mt-1 text-sm font-bold leading-5 text-[#52616F]">
                    Wir prÃ¼fen die Liste persÃ¶nlich.
                  </p>
                </div>

                <div className="rounded-2xl border border-[#D6E7EF] bg-[#F5FAFD] p-4">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-[#12395F]">
                    NÃ¤chster Schritt
                  </p>
                  <p className="mt-1 text-sm font-bold leading-5 text-[#12395F]">
                    Du erhÃ¤ltst Deinen Paketwunsch per E-Mail.
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="rounded-2xl border border-[#BFE3CD] bg-[#F0FFF6] p-4">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-[#2F7D50]">
                    Sicher
                  </p>
                  <p className="mt-1 text-sm font-bold leading-5 text-[#2F7D50]">
                    Treffer ab 80 % werden vorausgewÃ¤hlt.
                  </p>
                </div>

                <div className="rounded-2xl border border-[#F1D1A8] bg-[#FFF8EE] p-4">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-[#A75B28]">
                    Offen
                  </p>
                  <p className="mt-1 text-sm font-bold leading-5 text-[#A75B28]">
                    Unsichere VorschlÃ¤ge kannst Du aktiv wÃ¤hlen.
                  </p>
                </div>

                <div className="rounded-2xl border border-[#D6E7EF] bg-[#F5FAFD] p-4">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-[#12395F]">
                    Service
                  </p>
                  <p className="mt-1 text-sm font-bold leading-5 text-[#12395F]">
                    Artikel unter 80 % prÃ¼fen wir persÃ¶nlich fÃ¼r Dich.
                  </p>
                </div>
              </>
            )}
          </div>

          {serviceMessage ? (
            <div className="mt-5 rounded-[24px] border border-[#BFE3CD] bg-[#F7FBF8] p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#F0FFF6] text-[#2F7D50]">
                  <ShieldCheck className="h-5 w-5" />
                </div>

                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-[#2F7D50]">
                    Du bist gut aufgehoben
                  </p>

                  <h3 className="mt-1 text-xl font-black text-[#102A43]">
                    Genau hier beginnt unser persÃ¶nlicher Service.
                  </h3>

                  <p className="mt-2 text-sm leading-6 text-[#52616F]">
                    {serviceMessage}
                  </p>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-[#E8DED2] bg-white p-3">
                      <p className="text-xs font-black uppercase tracking-[0.12em] text-[#A75B28]">
                        1
                      </p>
                      <p className="mt-1 text-sm font-bold text-[#102A43]">
                        Du musst nichts weiter tun
                      </p>
                    </div>

                    <div className="rounded-2xl border border-[#E8DED2] bg-white p-3">
                      <p className="text-xs font-black uppercase tracking-[0.12em] text-[#A75B28]">
                        2
                      </p>
                      <p className="mt-1 text-sm font-bold text-[#102A43]">
                        Wir suchen die passenden Artikel
                      </p>
                    </div>

                    <div className="rounded-2xl border border-[#E8DED2] bg-white p-3">
                      <p className="text-xs font-black uppercase tracking-[0.12em] text-[#A75B28]">
                        3
                      </p>
                      <p className="mt-1 text-sm font-bold text-[#102A43]">
                        Danach erhÃ¤ltst Du Deinen Paketwunsch
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {feedbackMessage ? (
            <div className="mt-5 flex items-start gap-3 rounded-[24px] border border-[#BFE3CD] bg-[#F0FFF6] px-4 py-4 text-sm font-semibold text-[#2F7D50]">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
              <span>{feedbackMessage}</span>
            </div>
          ) : null}

          {errorMessage ? (
            <div className="mt-5 rounded-[24px] border border-[#F1D1A8] bg-[#FFF8EE] px-4 py-4 text-sm font-semibold text-[#A75B28]">
              {errorMessage}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-4">
          {serviceMessage ? (
            <div className="inline-flex min-h-[76px] w-full items-center justify-center gap-3 rounded-[28px] border border-[#BFE3CD] bg-[#F0FFF6] px-8 py-5 text-center text-xl font-black text-[#2F7D50] shadow-sm">
              <CheckCircle2 className="h-6 w-6" />
              <span>Wird jetzt persÃ¶nlich fÃ¼r Dich vorbereitet</span>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={handlePrepare}
                className="inline-flex min-h-[76px] w-full items-center justify-center gap-3 rounded-[28px] bg-[#C6282D] px-8 py-5 text-center text-2xl font-black text-white shadow-[0_18px_50px_rgba(198,40,45,0.24)] transition hover:-translate-y-0.5 hover:brightness-105"
              >
                <span>Paket jetzt vorbereiten</span>
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
                alt="Freundliche Mitarbeiterin sucht passende Schulhefte fÃ¼r den Kunden aus dem Regal"
                fill
                className="object-cover"
                priority
              />
            </div>

            <div className="p-5">
              <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-[#A75B28]">
                <Search className="h-3.5 w-3.5" />
                Unser Service fÃ¼r Dich
              </div>

              <h3 className="mt-3 text-xl font-black text-[#102A43]">
                Wir suchen nicht nur automatisch â€“ wir prÃ¼fen auch persÃ¶nlich.
              </h3>

              <p className="mt-2 text-sm leading-6 text-[#52616F]">
                Wenn ein Artikel nicht sofort automatisch erkannt wird, ist das
                kein Problem. Unser Team schaut sich Deine Liste an und sucht
                die passenden Schulmaterialien fÃ¼r Dich heraus.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

