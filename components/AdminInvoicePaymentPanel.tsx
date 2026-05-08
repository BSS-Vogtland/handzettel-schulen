"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  Banknote,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Loader2,
  Lock,
  Mail,
  PackageCheck,
  ReceiptText,
  Send,
  ShieldCheck,
  Truck,
  Unlock,
} from "lucide-react";

type AdminInvoicePaymentPanelProps = {
  requestId: string;
  fulfillmentMethod?: string | null;
  subtotalAmount: number;
  currentShippingAmount?: number | string | null;
  currentInvoiceTotalAmount?: number | string | null;
  invoiceStatus?: string | null;
  paymentStatus?: string | null;
  selectedPaymentMethod?: string | null;

  cashOnPickupAllowed?: boolean | null;
  cashOnPickupAllowedAt?: string | null;
  cashOnPickupAllowedNote?: string | null;
};

type ApiResponse = {
  ok?: boolean;
  message?: string;
  invoiceId?: string;
  invoiceNumber?: string | null;
  invoiceStatus?: string | null;
  paymentStatus?: string | null;
  totalAmount?: number;
  paymentUrl?: string;
  cashOnPickupAllowed?: boolean;
};

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

function formatDateTime(value?: string | null) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getInvoiceStatusLabel(status?: string | null) {
  switch (status) {
    case "draft":
      return "Rechnung vorbereitet";
    case "sent":
      return "Rechnung versendet";
    case "cancelled":
      return "Rechnung storniert";
    case "not_created":
      return "Noch keine Rechnung";
    default:
      return status || "Noch keine Rechnung";
  }
}

function getPaymentStatusLabel(status?: string | null) {
  switch (status) {
    case "not_selected":
      return "Zahlungsart noch nicht gewählt";
    case "waiting_for_payment":
      return "Wartet auf Zahlung";
    case "payment_received":
      return "Bezahlt";
    case "cash_on_pickup":
      return "Barzahlung bei Abholung";
    case "cash_paid":
      return "Bar bezahlt";
    case "overdue":
      return "Überfällig";
    case "cancelled":
      return "Zahlung abgebrochen";
    default:
      return status || "Zahlung offen";
  }
}

function getPaymentMethodLabel(method?: string | null) {
  switch (method) {
    case "paypal":
      return "PayPal";
    case "bank_transfer":
      return "Überweisung Vorkasse";
    case "cash_on_pickup":
      return "Barzahlung bei Abholung";
    default:
      return "PayPal empfohlen";
  }
}

async function readApiResponse(response: Response): Promise<ApiResponse> {
  const rawText = await response.text();

  try {
    return rawText ? (JSON.parse(rawText) as ApiResponse) : {};
  } catch {
    return {
      ok: false,
      message:
        "Die Route hat keine JSON-Antwort geliefert. Prüfe bitte zusätzlich das Terminal.",
    };
  }
}

export default function AdminInvoicePaymentPanel({
  requestId,
  fulfillmentMethod,
  subtotalAmount,
  currentShippingAmount,
  currentInvoiceTotalAmount,
  invoiceStatus,
  paymentStatus,
  selectedPaymentMethod,
  cashOnPickupAllowed,
  cashOnPickupAllowedAt,
  cashOnPickupAllowedNote,
}: AdminInvoicePaymentPanelProps) {
  const router = useRouter();

  const [shippingAmountInput, setShippingAmountInput] = useState(
    String(toNumber(currentShippingAmount, 0)).replace(".", ",")
  );
  const [adminNote, setAdminNote] = useState("");
  const [cashNote, setCashNote] = useState(cashOnPickupAllowedNote || "");
  const [localCashAllowed, setLocalCashAllowed] = useState(
    Boolean(cashOnPickupAllowed)
  );

  const [isSaving, setIsSaving] = useState(false);
  const [isSendingMail, setIsSendingMail] = useState(false);
  const [isUpdatingCash, setIsUpdatingCash] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const shippingAmount = useMemo(
    () => toNumber(shippingAmountInput, 0),
    [shippingAmountInput]
  );

  const calculatedTotal = subtotalAmount + shippingAmount;
  const storedTotal = toNumber(currentInvoiceTotalAmount, 0);

  const isPickup = fulfillmentMethod === "pickup";
  const isShipping = fulfillmentMethod === "shipping";

  const hasPreparedInvoice =
    invoiceStatus === "draft" ||
    invoiceStatus === "sent" ||
    storedTotal > 0;

  const pdfUrl = `/api/admin/requests/${requestId}/invoice/pdf`;

  async function handleCreateInvoice() {
    if (isSaving) return;

    try {
      setIsSaving(true);
      setFeedback(null);
      setIsSuccess(false);

      const response = await fetch(
        `/api/admin/requests/${requestId}/invoice/create`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            shippingAmount,
            adminNote,
          }),
        }
      );

      const payload = await readApiResponse(response);

      if (!response.ok || !payload.ok) {
        throw new Error(
          payload.message || "Die Rechnung konnte nicht vorbereitet werden."
        );
      }

      setIsSuccess(true);
      setFeedback(
        payload.message ||
          `Rechnung ${
            payload.invoiceNumber ? payload.invoiceNumber : ""
          } wurde vorbereitet.`
      );

      router.refresh();
    } catch (error) {
      setIsSuccess(false);
      setFeedback(
        error instanceof Error
          ? error.message
          : "Die Rechnung konnte nicht vorbereitet werden."
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSendInvoiceMail() {
    if (isSendingMail || !hasPreparedInvoice) return;

    try {
      setIsSendingMail(true);
      setFeedback(null);
      setIsSuccess(false);

      const response = await fetch(
        `/api/admin/requests/${requestId}/invoice/send-mail`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      const payload = await readApiResponse(response);

      if (!response.ok || !payload.ok) {
        throw new Error(
          payload.message || "Die Rechnungs-Mail konnte nicht gesendet werden."
        );
      }

      setIsSuccess(true);
      setFeedback(payload.message || "Die Rechnungs-Mail wurde gesendet.");

      router.refresh();
    } catch (error) {
      setIsSuccess(false);
      setFeedback(
        error instanceof Error
          ? error.message
          : "Die Rechnungs-Mail konnte nicht gesendet werden."
      );
    } finally {
      setIsSendingMail(false);
    }
  }

  async function handleToggleCashOnPickup(action: "allow" | "disable") {
    if (isUpdatingCash) return;

    try {
      setIsUpdatingCash(true);
      setFeedback(null);
      setIsSuccess(false);

      const response = await fetch(
        `/api/admin/requests/${requestId}/cash-on-pickup`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action,
            note: cashNote,
          }),
        }
      );

      const payload = await readApiResponse(response);

      if (!response.ok || !payload.ok) {
        throw new Error(
          payload.message || "Barzahlung konnte nicht aktualisiert werden."
        );
      }

      const nextAllowed =
        typeof payload.cashOnPickupAllowed === "boolean"
          ? payload.cashOnPickupAllowed
          : action === "allow";

      setLocalCashAllowed(nextAllowed);
      setIsSuccess(true);
      setFeedback(payload.message || "Barzahlung wurde aktualisiert.");

      router.refresh();
    } catch (error) {
      setIsSuccess(false);
      setFeedback(
        error instanceof Error
          ? error.message
          : "Barzahlung konnte nicht aktualisiert werden."
      );
    } finally {
      setIsUpdatingCash(false);
    }
  }

  return (
    <section className="rounded-[32px] border border-[#E8DED2] bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#FBF7F0] text-[#A75B28]">
            <ReceiptText className="h-6 w-6" />
          </div>

          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
              Rechnung & Zahlung
            </p>

            <h2 className="text-2xl font-black text-[#102A43]">
              Rechnung vorbereiten
            </h2>

            <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#52616F]">
              Hier bereitest Du die Rechnung vor, ergänzt Versandkosten und
              legst den Gesamtbetrag fest. PayPal wird als bevorzugte
              Zahlungsart vorausgewählt. Barzahlung bei Abholung bleibt
              standardmäßig intern gesperrt und kann nur pro Anfrage freigegeben
              werden.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="rounded-2xl border border-[#BFE3CD] bg-[#F0FFF6] px-4 py-3 text-sm font-black text-[#2F7D50]">
            {getInvoiceStatusLabel(invoiceStatus)}
          </div>

          {hasPreparedInvoice ? (
            <a
              href={pdfUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#12395F] px-4 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110"
            >
              <ExternalLink className="h-4 w-4" />
              Rechnung als PDF öffnen
            </a>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-[24px] border border-[#E8DED2] bg-[#FBF7F0] p-4">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-[#A75B28]">
            <PackageCheck className="h-5 w-5" />
          </div>

          <p className="text-xs font-black uppercase tracking-[0.14em] text-[#A75B28]">
            Paketbetrag
          </p>

          <p className="mt-2 text-2xl font-black text-[#102A43]">
            {formatMoney(subtotalAmount)}
          </p>

          <p className="mt-1 text-xs font-semibold text-[#52616F]">
            Summe der aktuellen Paketpositionen
          </p>
        </div>

        <div className="rounded-[24px] border border-[#E8DED2] bg-[#FBF7F0] p-4">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-[#12395F]">
            <Truck className="h-5 w-5" />
          </div>

          <p className="text-xs font-black uppercase tracking-[0.14em] text-[#12395F]">
            Versandkosten
          </p>

          <div className="mt-2 flex items-center gap-2">
            <input
              value={shippingAmountInput}
              onChange={(event) => setShippingAmountInput(event.target.value)}
              inputMode="decimal"
              className="min-h-12 w-full rounded-2xl border border-[#E8DED2] bg-white px-4 py-3 text-lg font-black text-[#102A43] outline-none transition focus:border-[#12395F]"
              placeholder="0,00"
            />

            <span className="font-black text-[#102A43]">€</span>
          </div>

          <p className="mt-1 text-xs font-semibold text-[#52616F]">
            {isShipping
              ? "Bei Versand wird in V1 pauschal 5,95 € angesetzt."
              : "Bei Abholung normalerweise 0,00 €."}
          </p>
        </div>

        <div className="rounded-[24px] border border-[#BFE3CD] bg-[#F0FFF6] p-4">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-[#2F7D50]">
            <CheckCircle2 className="h-5 w-5" />
          </div>

          <p className="text-xs font-black uppercase tracking-[0.14em] text-[#2F7D50]">
            Gesamtbetrag
          </p>

          <p className="mt-2 text-2xl font-black text-[#102A43]">
            {formatMoney(calculatedTotal)}
          </p>

          <p className="mt-1 text-xs font-semibold text-[#52616F]">
            {storedTotal > 0
              ? `Zuletzt gespeichert: ${formatMoney(storedTotal)}`
              : "Noch nicht als Rechnung gespeichert."}
          </p>
        </div>
      </div>

      <div className="mt-5 rounded-[28px] border border-[#E8DED2] bg-[#FBF7F0] p-4">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
          Zahlungsarten V1
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-[#BFE3CD] bg-white p-4">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-[#F0FFF6] text-[#2F7D50]">
              <CreditCard className="h-5 w-5" />
            </div>

            <p className="font-black text-[#102A43]">PayPal</p>

            <p className="mt-1 text-xs font-semibold leading-5 text-[#52616F]">
              Bevorzugter Zahlungsweg. Direkte Weiterleitung zur
              PayPal-Zahlung mit Gesamtbetrag.
            </p>

            <p className="mt-3 inline-flex rounded-full bg-[#F0FFF6] px-3 py-1 text-xs font-black text-[#2F7D50]">
              Empfohlen
            </p>
          </div>

          <div className="rounded-2xl border border-[#E8DED2] bg-white p-4">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-[#FBF7F0] text-[#12395F]">
              <Banknote className="h-5 w-5" />
            </div>

            <p className="font-black text-[#102A43]">Überweisung Vorkasse</p>

            <p className="mt-1 text-xs font-semibold leading-5 text-[#52616F]">
              Bearbeitung startet nach Zahlungseingang.
            </p>
          </div>

          <div
            className={`rounded-2xl border p-4 ${
              isPickup && localCashAllowed
                ? "border-[#BFE3CD] bg-white"
                : "border-[#E8DED2] bg-white opacity-60"
            }`}
          >
            <div
              className={`mb-3 flex h-10 w-10 items-center justify-center rounded-2xl ${
                isPickup && localCashAllowed
                  ? "bg-[#F0FFF6] text-[#2F7D50]"
                  : "bg-[#FBF7F0] text-[#A75B28]"
              }`}
            >
              {isPickup && localCashAllowed ? (
                <Unlock className="h-5 w-5" />
              ) : (
                <Lock className="h-5 w-5" />
              )}
            </div>

            <p className="font-black text-[#102A43]">
              Barzahlung bei Abholung
            </p>

            <p className="mt-1 text-xs font-semibold leading-5 text-[#52616F]">
              {isPickup && localCashAllowed
                ? "Intern für diese Anfrage freigegeben. Kunde sieht diese Option auf der Zahlungsseite."
                : "Intern gesperrt. Kunde sieht diese Option nicht."}
            </p>

            <p
              className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-black ${
                isPickup && localCashAllowed
                  ? "bg-[#F0FFF6] text-[#2F7D50]"
                  : "bg-[#FBF7F0] text-[#52616F]"
              }`}
            >
              {isPickup && localCashAllowed ? "Freigegeben" : "Gesperrt"}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-[28px] border border-[#E8DED2] bg-white p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#FBF7F0] text-[#A75B28]">
            <ShieldCheck className="h-5 w-5" />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
              Interne Barzahlungs-Freigabe
            </p>

            <h3 className="mt-1 font-black text-[#102A43]">
              Barzahlung nur für Ausnahmekunden freigeben
            </h3>

            <p className="mt-1 text-sm font-semibold leading-6 text-[#52616F]">
              Standardmäßig wird der Kunde auf PayPal oder Überweisung geführt.
              Barzahlung bei Abholung wird auf der Kundenseite nur angezeigt,
              wenn Du sie hier bewusst freigibst und die Übergabeart Abholung
              ist.
            </p>

            {!isPickup ? (
              <div className="mt-4 rounded-2xl border border-[#F1D1A8] bg-[#FFF8EE] p-4 text-sm font-bold leading-6 text-[#A75B28]">
                Barzahlung kann nur sinnvoll freigegeben werden, wenn der Kunde
                Abholung gewählt hat. Bei Versand bleibt Barzahlung
                grundsätzlich unsichtbar.
              </div>
            ) : null}

            <label className="mt-4 block">
              <span className="text-xs font-black uppercase tracking-[0.14em] text-[#A75B28]">
                Interne Notiz zur Freigabe
              </span>

              <textarea
                value={cashNote}
                onChange={(event) => setCashNote(event.target.value)}
                className="mt-2 min-h-20 w-full rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] px-4 py-3 text-sm font-semibold leading-6 text-[#102A43] outline-none transition focus:border-[#A75B28]"
                placeholder="Optional, z. B. Stammkunde, telefonisch abgesprochen, Sonderfall..."
              />
            </label>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => handleToggleCashOnPickup("allow")}
                disabled={isUpdatingCash || !isPickup || localCashAllowed}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#2F7D50] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isUpdatingCash ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Unlock className="h-4 w-4" />
                )}
                Barzahlung freigeben
              </button>

              <button
                type="button"
                onClick={() => handleToggleCashOnPickup("disable")}
                disabled={isUpdatingCash || !localCashAllowed}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-[#E8DED2] bg-white px-5 py-3 text-sm font-black text-[#102A43] shadow-sm transition hover:bg-[#FBF7F0] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isUpdatingCash ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Lock className="h-4 w-4" />
                )}
                Barzahlung sperren
              </button>
            </div>

            <div className="mt-4 rounded-2xl bg-[#FBF7F0] p-4 text-xs font-semibold leading-5 text-[#52616F]">
              <p className="font-black text-[#102A43]">Aktueller Stand</p>
              <p>
                Barzahlung:{" "}
                <span className="font-black">
                  {localCashAllowed ? "freigegeben" : "gesperrt"}
                </span>
              </p>
              <p>
                Freigegeben am:{" "}
                <span className="font-black">
                  {localCashAllowed ? formatDateTime(cashOnPickupAllowedAt) : "—"}
                </span>
              </p>
              {cashOnPickupAllowedNote ? (
                <p>
                  Letzte Notiz:{" "}
                  <span className="font-black">{cashOnPickupAllowedNote}</span>
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-[28px] border border-[#E8DED2] bg-white p-4">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
          Aktueller Zahlungsstatus
        </p>

        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl bg-[#FBF7F0] p-3">
            <p className="text-xs font-bold text-[#52616F]">Zahlungsstatus</p>

            <p className="mt-1 font-black text-[#102A43]">
              {getPaymentStatusLabel(paymentStatus)}
            </p>
          </div>

          <div className="rounded-2xl bg-[#FBF7F0] p-3">
            <p className="text-xs font-bold text-[#52616F]">Zahlungsart</p>

            <p className="mt-1 font-black text-[#102A43]">
              {getPaymentMethodLabel(selectedPaymentMethod)}
            </p>
          </div>

          <div className="rounded-2xl bg-[#FBF7F0] p-3">
            <p className="text-xs font-bold text-[#52616F]">Übergabe</p>

            <p className="mt-1 font-black text-[#102A43]">
              {isPickup ? "Abholung" : isShipping ? "Versand" : "Noch offen"}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-[28px] border border-[#E8DED2] bg-white p-4">
        <label className="block">
          <span className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
            Interne Notiz zur Rechnung
          </span>

          <textarea
            value={adminNote}
            onChange={(event) => setAdminNote(event.target.value)}
            className="mt-2 min-h-24 w-full rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] px-4 py-3 text-sm font-semibold leading-6 text-[#102A43] outline-none transition focus:border-[#A75B28]"
            placeholder="Optional, z. B. Versandkosten manuell berechnet, Rücksprache mit Kunde, Sonderpositionen..."
          />
        </label>

        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_260px] md:items-start">
          <div className="rounded-2xl border border-[#F1D1A8] bg-[#FFF8EE] p-4 text-sm font-bold leading-6 text-[#A75B28]">
            <p className="font-black text-[#8A4A1F]">Wichtig für V1:</p>

            <p className="mt-1">
              Rechnung vorbereiten friert die aktuellen Paketpositionen ein.
              Danach kannst Du die PDF öffnen oder die Rechnung direkt per Mail
              mit Zahlungslink an den Kunden senden.
            </p>
          </div>

          <div className="grid gap-3">
            <button
              type="button"
              onClick={handleCreateInvoice}
              disabled={isSaving}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#B5282D] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ReceiptText className="h-4 w-4" />
              )}
              {isSaving ? "Wird vorbereitet..." : "Rechnung vorbereiten"}
            </button>

            <button
              type="button"
              onClick={handleSendInvoiceMail}
              disabled={isSendingMail || !hasPreparedInvoice}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#12395F] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSendingMail ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {isSendingMail
                ? "Wird gesendet..."
                : "Rechnung per Mail senden"}
            </button>
          </div>
        </div>

        {feedback ? (
          <div
            className={`mt-4 rounded-2xl px-4 py-3 text-sm font-bold leading-6 ${
              isSuccess
                ? "border border-[#BFE3CD] bg-[#F0FFF6] text-[#2F7D50]"
                : "border border-[#F1D1A8] bg-[#FFF8EE] text-[#A75B28]"
            }`}
          >
            {feedback}
          </div>
        ) : null}

        <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-[#52616F]">
          <Mail className="h-4 w-4" />
          Die Mail enthält PDF-Anhang, Kurzübersicht und Zahlungslink.
        </div>
      </div>
    </section>
  );
}