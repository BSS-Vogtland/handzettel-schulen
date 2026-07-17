"use client";

import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
} from "react";
import type { CustomerPartnerRecommendation } from "@/app/lib/recommendations/customerRecommendationTypes";

const INTERNAL_REDIRECT_ORIGIN =
  "https://recommendation.internal";

const MIN_CONTEXT_LENGTH = 20;
const MAX_CONTEXT_LENGTH = 4096;

type ConsentState = {
  partnerId: string;
  partnerName: string;
  partnerCode: string;
  requestId: string;
  requestItemId: string;
  granted: boolean;
  grantedAt: string | null;
  revokedAt: string | null;
  consentVersion: string | null;
};

type ApiResponse = {
  ok?: boolean;
  message?: string;
  state?: ConsentState;
};

type ConsentStatus =
  | "loading"
  | "idle"
  | "saving"
  | "revoking"
  | "granted"
  | "error";

function safeRedirectPath(
  value: string,
) {
  const rawValue = String(
    value || "",
  ).trim();

  if (
    !rawValue.startsWith(
      "/empfehlung/",
    )
  ) {
    return null;
  }

  try {
    const parsedUrl = new URL(
      rawValue,
      INTERNAL_REDIRECT_ORIGIN,
    );

    if (
      parsedUrl.origin !==
      INTERNAL_REDIRECT_ORIGIN
    ) {
      return null;
    }

    if (
      !/^\/empfehlung\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(
        parsedUrl.pathname,
      )
    ) {
      return null;
    }

    if (parsedUrl.hash) {
      return null;
    }

    const parameterNames =
      Array.from(
        parsedUrl.searchParams.keys(),
      );

    if (
      parameterNames.length !== 1 ||
      parameterNames[0] !==
        "context" ||
      parsedUrl.searchParams.getAll(
        "context",
      ).length !== 1
    ) {
      return null;
    }

    const context =
      parsedUrl.searchParams.get(
        "context",
      );

    if (
      !context ||
      context.length <
        MIN_CONTEXT_LENGTH ||
      context.length >
        MAX_CONTEXT_LENGTH
    ) {
      return null;
    }

    return (
      `${parsedUrl.pathname}` +
      `?context=${encodeURIComponent(
        context,
      )}`
    );
  } catch {
    return null;
  }
}

function getOfferTokenFromPathname() {
  if (
    typeof window === "undefined"
  ) {
    return null;
  }

  const match =
    window.location.pathname.match(
      /^\/angebot\/([^/]+)\/?$/,
    );

  if (!match?.[1]) {
    return null;
  }

  try {
    const token =
      decodeURIComponent(match[1])
        .trim();

    if (
      !token ||
      token.length > 250 ||
      !/^[A-Za-z0-9_-]+$/.test(
        token,
      )
    ) {
      return null;
    }

    return token;
  } catch {
    return null;
  }
}

async function readApiResponse(
  response: Response,
): Promise<ApiResponse> {
  const contentType =
    response.headers.get(
      "content-type",
    ) || "";

  if (
    !contentType.includes(
      "application/json",
    )
  ) {
    throw new Error(
      "Der Server hat keine gültige Antwort geliefert.",
    );
  }

  const body =
    (await response.json()) as ApiResponse;

  if (
    !response.ok ||
    body.ok !== true
  ) {
    throw new Error(
      body.message ||
        "Die Einwilligung konnte nicht verarbeitet werden.",
    );
  }

  return body;
}

function PartnerRecommendationCard({
  recommendation,
}: {
  recommendation: CustomerPartnerRecommendation;
}) {
  const [offerToken, setOfferToken] =
    useState<string | null>(null);

  const [
    identityReleaseChecked,
    setIdentityReleaseChecked,
  ] = useState(false);

  const [
    consentGranted,
    setConsentGranted,
  ] = useState(false);

  const [
    consentStatus,
    setConsentStatus,
  ] = useState<ConsentStatus>(
    "loading",
  );

  const [
    feedbackMessage,
    setFeedbackMessage,
  ] = useState<string | null>(
    null,
  );

  const consentApiUrl =
    useMemo(() => {
      if (!offerToken) {
        return null;
      }

      return (
        `/api/offer/${encodeURIComponent(
          offerToken,
        )}` +
        "/recommendation-consent"
      );
    }, [offerToken]);

  useEffect(() => {
    let cancelled = false;

    const token =
      getOfferTokenFromPathname();

    setOfferToken(token);

    if (!token) {
      setConsentStatus("error");
      setFeedbackMessage(
        "Die freiwillige Datenfreigabe ist hier derzeit nicht verfügbar. Die Partnerempfehlung kann weiterhin ohne Datenfreigabe geöffnet werden.",
      );
      return;
    }

    const loadConsent = async () => {
      try {
        const query =
          new URLSearchParams({
            partner_id:
              recommendation.partner.id,
            request_item_id:
              recommendation.requestItemId,
          });

        const response =
          await fetch(
            `/api/offer/${encodeURIComponent(
              token,
            )}/recommendation-consent?${query.toString()}`,
            {
              method: "GET",
              cache: "no-store",
              headers: {
                Accept:
                  "application/json",
              },
            },
          );

        const result =
          await readApiResponse(
            response,
          );

        if (cancelled) {
          return;
        }

        const granted =
          result.state?.granted ===
          true;

        setConsentGranted(granted);
        setIdentityReleaseChecked(
          granted,
        );

        setConsentStatus(
          granted
            ? "granted"
            : "idle",
        );
      } catch (error) {
        if (cancelled) {
          return;
        }

        setConsentStatus("error");
        setFeedbackMessage(
          error instanceof Error
            ? error.message
            : "Der Einwilligungsstatus konnte nicht geladen werden.",
        );
      }
    };

    void loadConsent();

    return () => {
      cancelled = true;
    };
  }, [
    recommendation.partner.id,
    recommendation.requestItemId,
  ]);

  const saveConsent = async (
    granted: boolean,
  ) => {
    if (!consentApiUrl) {
      throw new Error(
        "Der Angebotszugang konnte nicht ermittelt werden.",
      );
    }

    const response = await fetch(
      consentApiUrl,
      {
        method: "PUT",
        headers: {
          Accept:
            "application/json",
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          partnerId:
            recommendation.partner.id,
          requestItemId:
            recommendation.requestItemId,
          granted,
        }),
      },
    );

    return readApiResponse(response);
  };

  const openWithoutSaving = () => {
    window.open(
      recommendation.partner
        .redirectPath,
      "_blank",
      "noopener,noreferrer",
    );
  };

  const handleOpenPartner =
    async () => {
      setFeedbackMessage(null);

      if (
        !identityReleaseChecked
      ) {
        openWithoutSaving();
        return;
      }

      if (consentGranted) {
        openWithoutSaving();
        return;
      }

      const popup = window.open(
        "",
        "_blank",
      );

      if (!popup) {
        setConsentStatus("error");
        setFeedbackMessage(
          "Der Browser hat das neue Fenster blockiert. Erlaube Pop-ups für diese Seite und versuche es erneut.",
        );
        return;
      }

      try {
        popup.document.title =
          "Partner wird geöffnet …";

        popup.document.body.innerHTML =
          [
            '<main style="font-family:Arial,sans-serif;max-width:560px;margin:60px auto;padding:24px;color:#102A43">',
            "<h1>Partner wird geöffnet …</h1>",
            "<p>Die freiwillige Datenfreigabe wird sicher gespeichert.</p>",
            "</main>",
          ].join("");

        setConsentStatus("saving");

        const result =
          await saveConsent(true);

        setConsentGranted(true);
        setIdentityReleaseChecked(
          true,
        );
        setConsentStatus("granted");
        setFeedbackMessage(
          result.message ||
            "Die freiwillige Datenfreigabe wurde gespeichert.",
        );

        popup.location.replace(
          recommendation.partner
            .redirectPath,
        );
      } catch (error) {
        popup.close();

        setConsentGranted(false);
        setConsentStatus("error");
        setFeedbackMessage(
          error instanceof Error
            ? error.message
            : "Die freiwillige Datenfreigabe konnte nicht gespeichert werden.",
        );
      }
    };

  const handleConsentChange =
    async (
      checked: boolean,
    ) => {
      setFeedbackMessage(null);

      if (checked) {
        setIdentityReleaseChecked(
          true,
        );

        if (!consentGranted) {
          setConsentStatus("idle");
        }

        return;
      }

      setIdentityReleaseChecked(
        false,
      );

      if (!consentGranted) {
        setConsentStatus("idle");
        return;
      }

      try {
        setConsentStatus(
          "revoking",
        );

        const result =
          await saveConsent(false);

        setConsentGranted(false);
        setConsentStatus("idle");
        setFeedbackMessage(
          result.message ||
            "Die Datenfreigabe wurde widerrufen.",
        );
      } catch (error) {
        setIdentityReleaseChecked(
          true,
        );
        setConsentStatus("error");
        setFeedbackMessage(
          error instanceof Error
            ? error.message
            : "Die Datenfreigabe konnte nicht widerrufen werden.",
        );
      }
    };

  const busy =
    consentStatus === "saving" ||
    consentStatus === "revoking";

  return (
    <article className="flex flex-col rounded-[20px] border border-[#E8DED2] bg-white p-4">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
        {recommendation.category}
      </p>

      <div className="mt-3 flex items-center gap-3">
        {recommendation.partner
          .logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={
              recommendation.partner
                .logoUrl
            }
            alt={`${recommendation.partner.name} Logo`}
            className="h-14 w-14 rounded-2xl border border-[#E8DED2] bg-white object-contain p-2"
          />
        ) : null}

        <h5 className="text-lg font-black text-[#102A43]">
          {
            recommendation.partner
              .name
          }
        </h5>
      </div>

      {recommendation.partner
        .description ? (
        <p className="mt-4 text-sm font-semibold leading-6 text-[#52616F]">
          {
            recommendation.partner
              .description
          }
        </p>
      ) : null}

      <p className="mt-3 text-sm font-semibold leading-6 text-[#52616F]">
        {
          recommendation.categoryReason
        }
      </p>

      <div className="mt-4 rounded-2xl border border-[#D6E4F0] bg-[#F5FAFE] p-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[#1D5D8F]">
            <ShieldCheck className="h-5 w-5" />
          </div>

          <div className="min-w-0">
            <p className="text-sm font-black text-[#102A43]">
              Bestellung leichter
              zuordnen
            </p>

            <label className="mt-3 flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={
                  identityReleaseChecked
                }
                disabled={busy}
                onChange={(event) => {
                  void handleConsentChange(
                    event.target
                      .checked,
                  );
                }}
                className="mt-1 h-5 w-5 shrink-0 rounded border-[#9FB3C8] accent-[#102A43]"
              />

              <span className="text-xs font-semibold leading-5 text-[#40566B] sm:text-sm">
                Ich bin damit
                einverstanden, dass
                Handzettel-Schulen.de
                meinen Namen und meine
                E-Mail-Adresse zusammen
                mit dem
                Vermittlungscode an{" "}
                <strong>
                  {
                    recommendation.partner
                      .name
                  }
                </strong>{" "}
                übermittelt. Der Partner
                darf die Daten
                ausschließlich zur
                Zuordnung einer dort
                erfolgten Bestellung und
                zur Rückmeldung des
                Bestellstatus verwenden.
              </span>
            </label>

            <p className="mt-3 text-xs font-semibold leading-5 text-[#60758A]">
              Die Freigabe ist
              freiwillig. Ohne Freigabe
              kannst Du die Empfehlung
              trotzdem öffnen; die
              Zuordnung erfolgt dann nur
              über den
              Vermittlungscode. Ein
              Widerruf ist jederzeit
              durch Entfernen des
              Hakens möglich. Weitere
              Informationen findest Du
              in der{" "}
              <Link
                href="/datenschutz"
                target="_blank"
                className="font-black text-[#1D5D8F] underline decoration-2 underline-offset-2"
              >
                Datenschutzerklärung
              </Link>
              .
            </p>

            {consentStatus ===
            "loading" ? (
              <p className="mt-3 flex items-center gap-2 text-xs font-bold text-[#60758A]">
                <Loader2 className="h-4 w-4 animate-spin" />
                Freigabestatus wird
                geprüft …
              </p>
            ) : null}

            {consentStatus ===
            "granted" ? (
              <p className="mt-3 flex items-start gap-2 rounded-xl border border-[#BFE3CD] bg-[#F0FFF6] px-3 py-2 text-xs font-bold leading-5 text-[#17653A]">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                Die freiwillige
                Datenfreigabe ist aktiv.
              </p>
            ) : null}

            {feedbackMessage ? (
              <p
                className={`mt-3 flex items-start gap-2 rounded-xl border px-3 py-2 text-xs font-bold leading-5 ${
                  consentStatus ===
                  "error"
                    ? "border-[#F1C2C2] bg-[#FFF4F4] text-[#9B2C2C]"
                    : "border-[#BFE3CD] bg-[#F0FFF6] text-[#17653A]"
                }`}
              >
                {consentStatus ===
                "error" ? (
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                ) : (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                )}

                {feedbackMessage}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={() => {
          void handleOpenPartner();
        }}
        className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#102A43] px-5 py-3 text-sm font-black text-white transition hover:bg-[#1D3E5E] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {consentStatus ===
        "saving" ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Freigabe wird gespeichert …
          </>
        ) : (
          <>
            Zum Partner
            <ExternalLink className="h-4 w-4" />
          </>
        )}
      </button>
    </article>
  );
}

export default function CustomerPartnerRecommendations({
  recommendations,
}: {
  recommendations: CustomerPartnerRecommendation[];
}) {
  const safeRecommendations =
    recommendations.flatMap(
      (recommendation) => {
        const redirectPath =
          safeRedirectPath(
            recommendation.partner
              .redirectPath,
          );

        if (
          !redirectPath ||
          !recommendation.partner.id
        ) {
          return [];
        }

        return [
          {
            ...recommendation,
            partner: {
              ...recommendation.partner,
              redirectPath,
            },
          },
        ];
      },
    );

  if (
    safeRecommendations.length === 0
  ) {
    return null;
  }

  return (
    <section className="mt-4 rounded-[24px] border border-[#F1D1A8] bg-[#FFF8EE] p-4">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-[#A75B28]">
          <Sparkles className="h-5 w-5" />
        </div>

        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
            Externe Alternative
          </p>

          <h4 className="mt-0.5 text-lg font-black text-[#102A43]">
            Passender Partner für diese
            Position
          </h4>
        </div>
      </div>

      <p className="mb-4 rounded-2xl border border-[#F1D1A8] bg-white p-3 text-xs font-semibold leading-5 text-[#70451F] sm:text-sm">
        Partnerempfehlung: Wenn Du über
        diesen Link etwas kaufst, kann
        Handzettel-Schulen.de eine
        Vergütung erhalten. Für Dich
        entstehen dadurch keine
        Mehrkosten.
      </p>

      <div className="grid gap-3">
        {safeRecommendations.map(
          (recommendation) => (
            <PartnerRecommendationCard
              key={`${recommendation.requestItemId}:${recommendation.category}:${recommendation.partner.partnerCode}`}
              recommendation={
                recommendation
              }
            />
          ),
        )}
      </div>
    </section>
  );
}