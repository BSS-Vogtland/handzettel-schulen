"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  MapPin,
  PackageCheck,
  Send,
  Truck,
} from "lucide-react";

type FulfillmentMethod = "pickup" | "shipping";

type ConfirmMode =
  | "already_confirmed"
  | "manual_review_required"
  | "updated_offer_confirmed"
  | "offer_confirmed"
  | string;

type ApiResponse = {
  ok?: boolean;
  mode?: ConfirmMode;
  fulfillmentMethod?: FulfillmentMethod;
  shippingAmount?: number;
  invoicePrepared?: boolean;
  invoiceMailSent?: boolean;
  invoiceId?: string;
  invoiceNumber?: string | null;
  invoiceTotalAmount?: number;
  message?: string;
};

type ConfirmOfferButtonProps = {
  token?: string | null;
  offerToken?: string | null;
  customerOfferToken?: string | null;
  confirmUrl?: string | null;

  disabled?: boolean;
  isDisabled?: boolean;

  buttonLabel?: string;
  className?: string;

  pickupLocationLabel?: string | null;
  pickupAddressSnapshot?: string | null;
  pickupMapsUrlSnapshot?: string | null;

  defaultFulfillmentMethod?: FulfillmentMethod | null;

  [key: string]: unknown;
};

const SHIPPING_FLAT_RATE_AMOUNT = 5.95;

function toNumber(value: unknown, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatMoney(value: unknown) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(toNumber(value, 0));
}

function resolveTokenFromConfirmUrl(confirmUrl?: string | null) {
  if (!confirmUrl) return null;

  const match = confirmUrl.match(/\/api\/offer\/([^/]+)\/confirm/);
  return match?.[1] || null;
}

function getOfferToken(props: ConfirmOfferButtonProps) {
  return (
    props.token ||
    props.offerToken ||
    props.customerOfferToken ||
    resolveTokenFromConfirmUrl(props.confirmUrl) ||
    null
  );
}

async function readApiResponse(response: Response): Promise<ApiResponse> {
  const rawText = await response.text();

  try {
    return rawText ? (JSON.parse(rawText) as ApiResponse) : {};
  } catch {
    return {
      ok: false,
      message:
        "Die Bestätigungs-Route hat keine JSON-Antwort geliefert. Prüfe bitte zusätzlich das Terminal.",
    };
  }
}

function getSuccessContent(payload: ApiResponse) {
  const method = payload.fulfillmentMethod;
  const shippingAmount = formatMoney(
    payload.shippingAmount ?? SHIPPING_FLAT_RATE_AMOUNT
  );

  if (payload.mode === "manual_review_required") {
    return {
      tone: "amber" as const,
      icon: AlertTriangle,
      title: "Dein Paketwunsch ist eingegangen.",
      text:
        method === "shipping"
          ? `Einzelne Positionen prüfen wir jetzt persönlich, damit nichts Falsches in Deinem Schulpaket landet. Du hast Versand gewählt. Die Versandpauschale beträgt ${shippingAmount}. Du bekommst danach ein aktualisiertes Angebot per E-Mail. Erst danach erhältst Du die Rechnung und kannst bezahlen.`
          : "Einzelne Positionen prüfen wir jetzt persönlich, damit nichts Falsches in Deinem Schulpaket landet. Du hast Abholung im Laden gewählt. Du bekommst danach ein aktualisiertes Angebot per E-Mail. Erst danach erhältst Du die Rechnung und kannst bezahlen.",
      steps: [
        "Wir prüfen die offenen Positionen persönlich.",
        "Du erhältst danach ein aktualisiertes Angebot per E-Mail.",
        "Die Rechnung und Zahlung folgen erst nach Deiner finalen Bestätigung.",
      ],
    };
  }

  if (payload.mode === "updated_offer_confirmed") {
    if (payload.invoiceMailSent) {
      return {
        tone: "green" as const,
        icon: CheckCircle2,
        title: "Dein aktualisiertes Angebot wurde bestätigt.",
        text:
          method === "shipping"
            ? `Wir haben Deine geprüften Positionen übernommen. Die Rechnung wurde automatisch erstellt und per E-Mail an Dich versendet. Die Versandpauschale von ${shippingAmount} ist im Gesamtbetrag enthalten. Nach Zahlungseingang bereiten wir Dein Schulpaket für den Versand vor.`
            : "Wir haben Deine geprüften Positionen übernommen. Die Rechnung wurde automatisch erstellt und per E-Mail an Dich versendet. Nach Zahlungseingang oder bei Barzahlung vor Ort bereiten wir Dein Schulpaket für die Abholung vor.",
        steps: [
          "Bitte öffne die Rechnungs-Mail.",
          "Wähle dort Deine Zahlungsart.",
          "Nach Zahlungseingang bereiten wir Dein Paket vor.",
        ],
      };
    }

    return {
      tone: "amber" as const,
      icon: AlertTriangle,
      title: "Dein aktualisiertes Angebot wurde bestätigt.",
      text:
        "Die Bestätigung ist eingegangen. Die Rechnung wurde vorbereitet, aber die Rechnungs-Mail konnte nicht automatisch versendet werden. Wir prüfen das intern und melden uns bei Dir.",
      steps: [
        "Deine Bestätigung ist gespeichert.",
        "Wir prüfen die Rechnungs-Mail intern.",
        "Du erhältst die Zahlungsinformationen anschließend per E-Mail.",
      ],
    };
  }

  if (payload.mode === "already_confirmed") {
    return {
      tone: "green" as const,
      icon: CheckCircle2,
      title: "Dieses Angebot wurde bereits bestätigt.",
      text:
        "Deine Bestätigung liegt bereits vor. Falls Du noch keine Rechnungs-Mail erhalten hast, prüfe bitte auch Deinen Spam-Ordner oder melde Dich direkt bei uns.",
      steps: [
        "Bestätigung liegt bereits vor.",
        "Rechnungs-Mail prüfen.",
        "Bei Fragen kurz Kontakt aufnehmen.",
      ],
    };
  }

  if (payload.invoiceMailSent) {
    return {
      tone: "green" as const,
      icon: CheckCircle2,
      title: "Dein Schulpaket ist vollständig vorbereitet.",
      text:
        method === "shipping"
          ? `Alle erkannten Positionen konnten sicher zugeordnet werden. Die Rechnung wurde automatisch erstellt und per E-Mail an Dich versendet. Die Versandpauschale von ${shippingAmount} ist bereits im Gesamtbetrag enthalten. Nach Zahlungseingang bereiten wir Dein Paket für den Versand vor.`
          : "Alle erkannten Positionen konnten sicher zugeordnet werden. Die Rechnung wurde automatisch erstellt und per E-Mail an Dich versendet. Nach Zahlungseingang oder bei Barzahlung vor Ort bereiten wir Dein Paket für die Abholung vor.",
      steps: [
        "Bitte öffne die Rechnungs-Mail.",
        "Wähle dort Deine Zahlungsart.",
        "Nach Zahlungseingang bereiten wir Dein Paket vor.",
      ],
    };
  }

  if (payload.invoicePrepared) {
    return {
      tone: "amber" as const,
      icon: AlertTriangle,
      title: "Dein Schulpaket wurde bestätigt.",
      text:
        "Die Rechnung wurde vorbereitet, aber die Rechnungs-Mail konnte nicht automatisch versendet werden. Wir prüfen das intern und senden Dir die Zahlungsinformationen anschließend per E-Mail.",
      steps: [
        "Deine Bestätigung ist gespeichert.",
        "Die Rechnung ist intern vorbereitet.",
        "Die Zahlungsinformationen folgen per E-Mail.",
      ],
    };
  }

  return {
    tone: "amber" as const,
    icon: AlertTriangle,
    title: "Dein Schulpaket wurde bestätigt.",
    text:
      "Deine Bestätigung ist eingegangen. Die Rechnung wird intern geprüft und Dir anschließend per E-Mail zugesendet.",
    steps: [
      "Deine Bestätigung ist gespeichert.",
      "Wir prüfen die Rechnung intern.",
      "Du erhältst die Zahlungsinformationen per E-Mail.",
    ],
  };
}

function getResultClasses(tone: "green" | "amber") {
  if (tone === "green") {
    return {
      wrap: "border-[#BFE3CD] bg-[#F0FFF6]",
      icon: "bg-white text-[#2F7D50]",
      title: "text-[#1F5D3A]",
      step: "bg-white text-[#2F7D50]",
    };
  }

  return {
    wrap: "border-[#F1D1A8] bg-[#FFF8EE]",
    icon: "bg-white text-[#A75B28]",
    title: "text-[#8A4A1F]",
    step: "bg-white text-[#A75B28]",
  };
}

export default function ConfirmOfferButton(props: ConfirmOfferButtonProps) {
  const router = useRouter();

  const offerToken = getOfferToken(props);

  const [isOpen, setIsOpen] = useState(false);
  const [fulfillmentMethod, setFulfillmentMethod] =
    useState<FulfillmentMethod>(
      props.defaultFulfillmentMethod === "pickup" ||
        props.defaultFulfillmentMethod === "shipping"
        ? props.defaultFulfillmentMethod
        : "pickup"
    );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isDisabled = Boolean(props.disabled || props.isDisabled || !offerToken);

  const pickupLocationLabel =
    props.pickupLocationLabel || "Handzettel-Schulen.de · Abholung im Laden";

  const pickupAddressSnapshot =
    props.pickupAddressSnapshot ||
    "Die genaue Abholadresse steht in Deiner E-Mail.";

  const pickupMapsUrlSnapshot = props.pickupMapsUrlSnapshot || null;

  const successContent = useMemo(() => {
    if (!result?.ok) return null;
    return getSuccessContent(result);
  }, [result]);

  async function handleConfirm() {
    if (!offerToken || isSubmitting) return;

    try {
      setIsSubmitting(true);
      setError(null);
      setResult(null);

      const response = await fetch(`/api/offer/${offerToken}/confirm`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fulfillmentMethod,
          pickupLocationLabel:
            fulfillmentMethod === "pickup" ? pickupLocationLabel : null,
          pickupAddressSnapshot:
            fulfillmentMethod === "pickup" ? pickupAddressSnapshot : null,
          pickupMapsUrlSnapshot:
            fulfillmentMethod === "pickup" ? pickupMapsUrlSnapshot : null,
        }),
      });

      const payload = await readApiResponse(response);

      if (!response.ok || !payload.ok) {
        throw new Error(
          payload.message || "Der Paketwunsch konnte nicht bestätigt werden."
        );
      }

      setResult(payload);
      router.refresh();
    } catch (confirmError) {
      setError(
        confirmError instanceof Error
          ? confirmError.message
          : "Der Paketwunsch konnte nicht bestätigt werden."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setIsOpen(true);
          setError(null);
          setResult(null);
        }}
        disabled={isDisabled}
        className={
          props.className ||
          "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#B5282D] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        }
      >
        <PackageCheck className="h-4 w-4" />
        {props.buttonLabel || "Paketwunsch bestätigen"}
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 px-4 py-4 sm:items-center">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[32px] border border-[#E8DED2] bg-[#FBF7F0] p-4 shadow-2xl sm:p-5">
            {!successContent ? (
              <div className="rounded-[28px] bg-white p-5">
                <div className="mb-5 flex items-start gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#F0FFF6] text-[#2F7D50]">
                    <PackageCheck className="h-6 w-6" />
                  </div>

                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
                      Paketwunsch bestätigen
                    </p>

                    <h2 className="mt-1 text-2xl font-black text-[#102A43]">
                      Wie möchtest Du Dein Schulpaket erhalten?
                    </h2>

                    <p className="mt-2 text-sm font-semibold leading-6 text-[#52616F]">
                      Wichtig: Wenn alle Positionen vollständig zugeordnet sind,
                      bekommst Du im Anschluss automatisch Deine Rechnung per
                      E-Mail. Wenn einzelne Positionen noch geprüft werden
                      müssen, erhältst Du zuerst ein aktualisiertes Angebot.
                    </p>
                  </div>
                </div>

                <div className="grid gap-3">
                  <button
                    type="button"
                    onClick={() => setFulfillmentMethod("pickup")}
                    className={`rounded-[24px] border p-4 text-left transition ${
                      fulfillmentMethod === "pickup"
                        ? "border-[#BFE3CD] bg-[#F0FFF6]"
                        : "border-[#E8DED2] bg-[#FBF7F0] hover:bg-white"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
                          fulfillmentMethod === "pickup"
                            ? "bg-white text-[#2F7D50]"
                            : "bg-white text-[#A75B28]"
                        }`}
                      >
                        <MapPin className="h-5 w-5" />
                      </div>

                      <div>
                        <p className="font-black text-[#102A43]">
                          Ich hole im Laden ab
                        </p>
                        <p className="mt-1 text-sm font-semibold leading-6 text-[#52616F]">
                          Bei Abholung kannst Du später PayPal, Überweisung oder
                          Barzahlung vor Ort wählen. Bei Barzahlung wird Dein
                          Paket nur für eine begrenzte Zeit reserviert.
                        </p>

                        <div className="mt-3 rounded-2xl bg-white p-3 text-xs font-semibold leading-5 text-[#52616F]">
                          <p className="font-black text-[#102A43]">
                            {pickupLocationLabel}
                          </p>
                          <p>{pickupAddressSnapshot}</p>

                          {pickupMapsUrlSnapshot ? (
                            <a
                              href={pickupMapsUrlSnapshot}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-2 inline-flex font-black text-[#2F7D50]"
                            >
                              Route öffnen
                            </a>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFulfillmentMethod("shipping")}
                    className={`rounded-[24px] border p-4 text-left transition ${
                      fulfillmentMethod === "shipping"
                        ? "border-[#C8D8E8] bg-[#EEF4FA]"
                        : "border-[#E8DED2] bg-[#FBF7F0] hover:bg-white"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
                          fulfillmentMethod === "shipping"
                            ? "bg-white text-[#12395F]"
                            : "bg-white text-[#A75B28]"
                        }`}
                      >
                        <Truck className="h-5 w-5" />
                      </div>

                      <div>
                        <p className="font-black text-[#102A43]">
                          Bitte per Versand zusenden
                        </p>
                        <p className="mt-1 text-sm font-semibold leading-6 text-[#52616F]">
                          Für den Versand wird aktuell eine Versandpauschale von{" "}
                          <span className="font-black text-[#102A43]">
                            {formatMoney(SHIPPING_FLAT_RATE_AMOUNT)}
                          </span>{" "}
                          berechnet. Diese ist später direkt in der Rechnung
                          enthalten.
                        </p>
                      </div>
                    </div>
                  </button>
                </div>

                {error ? (
                  <div className="mt-4 rounded-2xl border border-[#F2B8B8] bg-[#FFF1F1] px-4 py-3 text-sm font-bold leading-6 text-[#B5282D]">
                    {error}
                  </div>
                ) : null}

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-[#E8DED2] bg-white px-5 py-3 text-sm font-black text-[#102A43] transition hover:bg-[#FBF7F0]"
                  >
                    Zurück
                  </button>

                  <button
                    type="button"
                    onClick={handleConfirm}
                    disabled={isSubmitting}
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#B5282D] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSubmitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    {isSubmitting
                      ? "Wird bestätigt..."
                      : "Jetzt verbindlich bestätigen"}
                  </button>
                </div>
              </div>
            ) : (
              <div
                className={`rounded-[28px] border p-5 ${
                  getResultClasses(successContent.tone).wrap
                }`}
              >
                {(() => {
                  const classes = getResultClasses(successContent.tone);
                  const ResultIcon = successContent.icon;

                  return (
                    <>
                      <div className="mb-5 flex items-start gap-3">
                        <div
                          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${classes.icon}`}
                        >
                          <ResultIcon className="h-6 w-6" />
                        </div>

                        <div>
                          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
                            Bestätigung gespeichert
                          </p>

                          <h2
                            className={`mt-1 text-2xl font-black ${classes.title}`}
                          >
                            {successContent.title}
                          </h2>

                          <p className="mt-2 text-sm font-semibold leading-6 text-[#52616F]">
                            {successContent.text}
                          </p>

                          {result?.invoiceNumber ? (
                            <p className="mt-3 inline-flex rounded-full bg-white px-3 py-1 text-xs font-black text-[#102A43]">
                              Rechnung: {result.invoiceNumber}
                            </p>
                          ) : null}
                        </div>
                      </div>

                      <div className="grid gap-2">
                        {successContent.steps.map((step, index) => (
                          <div
                            key={step}
                            className={`flex items-start gap-2 rounded-2xl px-3 py-2 text-sm font-bold leading-6 ${classes.step}`}
                          >
                            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#FBF7F0] text-xs font-black text-[#102A43]">
                              {index + 1}
                            </span>
                            <span>{step}</span>
                          </div>
                        ))}
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setIsOpen(false);
                          router.refresh();
                        }}
                        className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#102A43] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Verstanden
                      </button>
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}