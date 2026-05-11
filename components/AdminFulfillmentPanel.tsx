"use client";

import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  ClipboardList,
  Clock,
  Lock,
  MapPin,
  PackageCheck,
  Printer,
  ShieldCheck,
  ShoppingBasket,
  Truck,
} from "lucide-react";
import AdminFulfillmentActionButton from "@/components/AdminFulfillmentActionButton";

type OfferItem = {
  id: string;
  product_name: string;
  product_sku: string | null;
  product_price: number | string | null;
  quantity: number | string | null;
  unit: string | null;
  source: string | null;
  notes: string | null;
};

type AdminFulfillmentPanelProps = {
  requestId: string;
  requestStatus: string | null;
  offerStatus: string | null;
  fulfillmentMethod?: string | null;
  fulfillmentStatus?: string | null;
  pickingStatus?: string | null;
  shippingCostStatus?: string | null;
  selectedPaymentMethod?: string | null;
  paymentStatus?: string | null;
  pickupLocationLabel?: string | null;
  pickupAddressSnapshot?: string | null;
  pickupMapsUrlSnapshot?: string | null;
  confirmedAt?: string | null;
  pickingStartedAt?: string | null;
  pickedAt?: string | null;
  packedAt?: string | null;
  shippedAt?: string | null;
  pickedUpAt?: string | null;
  offerItems: OfferItem[];
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

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getFulfillmentMethodLabel(method?: string | null) {
  if (method === "pickup") return "Abholung im Laden";
  if (method === "shipping") return "Versand";
  return "Noch nicht gewählt";
}

function getFulfillmentStatusLabel(status?: string | null) {
  switch (status) {
    case "pickup_requested":
      return "Abholung vorbereiten";
    case "shipping_requested":
      return "Versand vorbereiten";
    case "ready_for_pickup":
      return "Abholbereit";
    case "shipping_ready":
      return "Versandbereit";
    case "shipped":
      return "Versendet";
    case "picked_up":
      return "Abgeholt";
    default:
      return "Noch offen";
  }
}

function getPickingStatusLabel(status?: string | null) {
  switch (status) {
    case "picking":
      return "Picking läuft";
    case "picked":
      return "Artikel gepickt";
    case "packed":
      return "Paket gepackt";
    default:
      return "Picking offen";
  }
}

function getShippingCostLabel(status?: string | null) {
  switch (status) {
    case "flat_rate_applied":
      return "Versandpauschale angesetzt";
    case "pending_calculation":
      return "Versandkosten müssen noch berechnet werden";
    case "not_required":
      return "Keine Versandkosten nötig";
    default:
      return "Noch nicht gesetzt";
  }
}

function getSourceLabel(source: string | null) {
  switch (source) {
    case "auto_preselected":
      return "Automatisch vorausgewählt";
    case "customer_selection":
      return "Vom Kunden gewählt";
    case "customer_search":
      return "Vom Kunden gesucht";
    case "admin_manual":
      return "Manuell ergänzt";
    case "admin_existing_product":
      return "Von BSS ergänzt";
    case "match":
      return "Aus Treffer übernommen";
    default:
      return "Paketposition";
  }
}

function getPaymentMethodLabel(method?: string | null) {
  switch (method) {
    case "paypal":
      return "PayPal";
    case "bank_transfer":
      return "Überweisung";
    case "cash_on_pickup":
      return "Barzahlung bei Abholung";
    default:
      return "Noch nicht gewählt";
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
      return "Barzahlung bei Abholung gewählt";
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

function isPaidStatus(status?: string | null) {
  return status === "payment_received" || status === "cash_paid";
}

function getCurrentStep(
  pickingStatus?: string | null,
  fulfillmentStatus?: string | null
) {
  if (fulfillmentStatus === "picked_up" || fulfillmentStatus === "shipped") {
    return 5;
  }

  if (
    fulfillmentStatus === "ready_for_pickup" ||
    fulfillmentStatus === "shipping_ready"
  ) {
    return 4;
  }

  if (pickingStatus === "packed") return 3;
  if (pickingStatus === "picked") return 2;
  if (pickingStatus === "picking") return 1;

  return 0;
}

function getStepClass(active: boolean, completed: boolean) {
  if (completed) {
    return "border-[#2F7D50] bg-[#2F7D50] text-white";
  }

  if (active) {
    return "border-[#A75B28] bg-[#FFF8EE] text-[#A75B28]";
  }

  return "border-[#E8DED2] bg-white text-[#52616F]";
}

export default function AdminFulfillmentPanel({
  requestId,
  requestStatus,
  offerStatus,
  fulfillmentMethod,
  fulfillmentStatus,
  pickingStatus,
  shippingCostStatus,
  selectedPaymentMethod,
  paymentStatus,
  pickupLocationLabel,
  pickupAddressSnapshot,
  pickupMapsUrlSnapshot,
  confirmedAt,
  pickingStartedAt,
  pickedAt,
  packedAt,
  shippedAt,
  pickedUpAt,
  offerItems,
}: AdminFulfillmentPanelProps) {
  const isConfirmed =
    requestStatus === "confirmed" || offerStatus === "confirmed";

  const total = offerItems.reduce((sum, item) => {
    return sum + toNumber(item.quantity, 1) * toNumber(item.product_price, 0);
  }, 0);

  const totalQuantity = offerItems.reduce((sum, item) => {
    return sum + toNumber(item.quantity, 1);
  }, 0);

  const isPickup = fulfillmentMethod === "pickup";
  const isShipping = fulfillmentMethod === "shipping";

  const paymentIsPaid = isPaidStatus(paymentStatus);

  const cashOnPickupPending =
    selectedPaymentMethod === "cash_on_pickup" &&
    paymentStatus === "cash_on_pickup" &&
    isPickup;

  const canPrepareFulfillment =
    isConfirmed && (paymentIsPaid || cashOnPickupPending);
  const canFinishPickup = isConfirmed && paymentIsPaid;
  const canShip = isConfirmed && paymentIsPaid;

  const PaymentGateIcon = paymentIsPaid
    ? CheckCircle2
    : cashOnPickupPending
    ? Banknote
    : Lock;

  const paymentGateTitle = paymentIsPaid
    ? "Abwicklung freigegeben"
    : cashOnPickupPending
    ? "Vorbereitung erlaubt · Abholung erst nach Barzahlung"
    : "Abwicklung bis Zahlungseingang gesperrt";

  const paymentGateText = paymentIsPaid
    ? "Die Zahlung ist verbucht. Picking, Packen und Übergabe können fortgeführt werden."
    : cashOnPickupPending
    ? "Der Kunde hat Barzahlung bei Abholung gewählt. Du darfst das Paket vorbereiten und abholbereit setzen. Als abgeholt markieren bitte erst, wenn die Barzahlung im Admin als erhalten markiert wurde."
    : "Bei PayPal oder Überweisung bitte erst nach Zahlungseingang fortfahren. Die technische Sperre verhindert zusätzlich, dass Picking oder Versand zu früh gestartet werden.";

  const paymentGateClasses = paymentIsPaid
    ? "border-[#BFE3CD] bg-[#F0FFF6] text-[#2F7D50]"
    : cashOnPickupPending
    ? "border-[#F1D1A8] bg-[#FFF8EE] text-[#A75B28]"
    : "border-[#F2B8B8] bg-[#FFF1F1] text-[#B5282D]";

  const currentStep = getCurrentStep(pickingStatus, fulfillmentStatus);

  const workflowSteps = [
    {
      label: "Offen",
      description: "Noch nicht gestartet",
    },
    {
      label: "Picking",
      description: "Artikel werden gesucht",
    },
    {
      label: "Gepickt",
      description: "Artikel liegen bereit",
    },
    {
      label: "Gepackt",
      description: "Paket ist gepackt",
    },
    {
      label: isShipping ? "Versandbereit" : "Abholbereit",
      description: isShipping ? "Bereit zum Versand" : "Bereit zur Abholung",
    },
    {
      label: isShipping ? "Versendet" : "Abgeholt",
      description: "Abgeschlossen",
    },
  ];

  return (
    <section className="rounded-[32px] border border-[#BFE3CD] bg-[#F0FFF6] p-5 shadow-sm sm:p-6 print:border-0 print:bg-white print:p-0 print:shadow-none">
      <style jsx global>{`
        .picking-print-only {
          display: none;
        }

        @media print {
          @page {
            size: A4;
            margin: 9mm;
          }

          body {
            background: white !important;
          }

          body * {
            visibility: hidden !important;
          }

          .picking-print-only,
          .picking-print-only * {
            visibility: visible !important;
          }

          .picking-print-only {
            display: block !important;
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            color: #111827 !important;
            font-family: Arial, sans-serif !important;
          }

          .picking-screen-only {
            display: none !important;
          }

          .print-row {
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
      `}</style>

      <div className="picking-print-only">
        <div style={{ borderBottom: "2px solid #111827", paddingBottom: 10 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 16,
              alignItems: "flex-start",
            }}
          >
            <div>
              <p
                style={{
                  margin: 0,
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                }}
              >
                Handzettel-Schulen.de · interne Pickingliste
              </p>

              <h1
                style={{
                  margin: "4px 0 0",
                  fontSize: 22,
                  lineHeight: 1.1,
                  fontWeight: 900,
                }}
              >
                Pickingliste
              </h1>

              <p
                style={{
                  margin: "6px 0 0",
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                Vorgang: {requestId}
              </p>
            </div>

            <div
              style={{
                border: "1px solid #111827",
                padding: "8px 10px",
                minWidth: 180,
                fontSize: 11,
                lineHeight: 1.45,
              }}
            >
              <p style={{ margin: 0 }}>
                <strong>Übergabe:</strong>{" "}
                {getFulfillmentMethodLabel(fulfillmentMethod)}
              </p>
              <p style={{ margin: 0 }}>
                <strong>Zahlung:</strong> {getPaymentStatusLabel(paymentStatus)}
              </p>
              <p style={{ margin: 0 }}>
                <strong>Gedruckt:</strong>{" "}
                {formatDateTime(new Date().toISOString())}
              </p>
            </div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr 1fr",
            gap: 8,
            marginTop: 10,
            marginBottom: 10,
            fontSize: 11,
          }}
        >
          <div style={{ border: "1px solid #111827", padding: 6 }}>
            <strong>Status</strong>
            <br />
            {getPickingStatusLabel(pickingStatus)}
          </div>

          <div style={{ border: "1px solid #111827", padding: 6 }}>
            <strong>Abwicklung</strong>
            <br />
            {getFulfillmentStatusLabel(fulfillmentStatus)}
          </div>

          <div style={{ border: "1px solid #111827", padding: 6 }}>
            <strong>Positionen</strong>
            <br />
            {offerItems.length}
          </div>

          <div style={{ border: "1px solid #111827", padding: 6 }}>
            <strong>Artikel gesamt</strong>
            <br />
            {totalQuantity}
          </div>
        </div>

        {isPickup ? (
          <div
            style={{
              border: "1px solid #111827",
              padding: 7,
              marginBottom: 10,
              fontSize: 11,
              lineHeight: 1.4,
            }}
          >
            <strong>Abholung:</strong>{" "}
            {pickupLocationLabel || "Abholung im Laden"}
            {pickupAddressSnapshot ? ` · ${pickupAddressSnapshot}` : ""}
          </div>
        ) : null}

        {isShipping ? (
          <div
            style={{
              border: "1px solid #111827",
              padding: 7,
              marginBottom: 10,
              fontSize: 11,
              lineHeight: 1.4,
            }}
          >
            <strong>Versand:</strong> Versand vom Kunden gewünscht ·{" "}
            {getShippingCostLabel(shippingCostStatus)}
          </div>
        ) : null}

        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 11,
          }}
        >
          <thead>
            <tr>
              <th
                style={{
                  border: "1px solid #111827",
                  padding: 6,
                  textAlign: "left",
                  width: 26,
                }}
              >
                ✓
              </th>
              <th
                style={{
                  border: "1px solid #111827",
                  padding: 6,
                  textAlign: "left",
                  width: 48,
                }}
              >
                Menge
              </th>
              <th
                style={{
                  border: "1px solid #111827",
                  padding: 6,
                  textAlign: "left",
                }}
              >
                Artikel
              </th>
              <th
                style={{
                  border: "1px solid #111827",
                  padding: 6,
                  textAlign: "left",
                  width: 95,
                }}
              >
                Art.-Nr.
              </th>
              <th
                style={{
                  border: "1px solid #111827",
                  padding: 6,
                  textAlign: "left",
                  width: 115,
                }}
              >
                Bemerkung
              </th>
            </tr>
          </thead>

          <tbody>
            {offerItems.length > 0 ? (
              offerItems.map((item) => {
                const quantity = toNumber(item.quantity, 1);

                return (
                  <tr key={item.id} className="print-row">
                    <td
                      style={{
                        border: "1px solid #111827",
                        padding: 6,
                        verticalAlign: "top",
                      }}
                    >
                      ☐
                    </td>

                    <td
                      style={{
                        border: "1px solid #111827",
                        padding: 6,
                        verticalAlign: "top",
                        fontWeight: 800,
                      }}
                    >
                      {quantity}
                      {item.unit ? ` ${item.unit}` : ""}
                    </td>

                    <td
                      style={{
                        border: "1px solid #111827",
                        padding: 6,
                        verticalAlign: "top",
                        fontWeight: 800,
                      }}
                    >
                      {item.product_name}

                      {item.notes ? (
                        <div
                          style={{
                            marginTop: 3,
                            fontSize: 10,
                            fontWeight: 500,
                            color: "#374151",
                          }}
                        >
                          Hinweis: {item.notes}
                        </div>
                      ) : null}
                    </td>

                    <td
                      style={{
                        border: "1px solid #111827",
                        padding: 6,
                        verticalAlign: "top",
                      }}
                    >
                      {item.product_sku || "—"}
                    </td>

                    <td
                      style={{
                        border: "1px solid #111827",
                        padding: 6,
                        verticalAlign: "top",
                      }}
                    />
                  </tr>
                );
              })
            ) : (
              <tr>
                <td
                  colSpan={5}
                  style={{
                    border: "1px solid #111827",
                    padding: 10,
                    textAlign: "center",
                    fontWeight: 700,
                  }}
                >
                  Noch keine Paketpositionen vorhanden.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 10,
            marginTop: 12,
            fontSize: 11,
          }}
        >
          <div style={{ border: "1px solid #111827", padding: 8 }}>
            <strong>Kontrolle</strong>
            <div style={{ marginTop: 8, lineHeight: 1.8 }}>
              ☐ alle Artikel gepickt
              <br />
              ☐ alle Artikel gepackt
              <br />☐ Zahlung geprüft
            </div>
          </div>

          <div style={{ border: "1px solid #111827", padding: 8 }}>
            <strong>Gepackt von</strong>
            <div style={{ marginTop: 32, borderBottom: "1px solid #111827" }} />
            <div style={{ marginTop: 4, fontSize: 10 }}>Name / Kürzel</div>
          </div>

          <div style={{ border: "1px solid #111827", padding: 8 }}>
            <strong>Abschluss</strong>
            <div style={{ marginTop: 32, borderBottom: "1px solid #111827" }} />
            <div style={{ marginTop: 4, fontSize: 10 }}>Datum / Unterschrift</div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 10,
            paddingTop: 8,
            borderTop: "1px solid #111827",
            fontSize: 10,
            fontWeight: 700,
          }}
        >
          <span>
            Gesamt: {offerItems.length} Position
            {offerItems.length === 1 ? "" : "en"} · {totalQuantity} Artikel
          </span>
          <span>Paketwert intern: {formatMoney(total)}</span>
        </div>
      </div>

      <div className="picking-screen-only">
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-[#2F7D50]">
              <PackageCheck className="h-6 w-6" />
            </div>

            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#2F7D50]">
                Angebot bestätigt · Abwicklung
              </p>

              <h2 className="text-2xl font-black text-[#102A43]">
                Pickingliste & Übergabe-Workflow
              </h2>

              <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#52616F]">
                Sobald das Angebot bestätigt wurde, beginnt hier die operative
                Bearbeitung: Produkte picken, Paket packen und je nach
                Kundenwunsch zur Abholung oder zum Versand vorbereiten.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              if (typeof window !== "undefined") window.print();
            }}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-[#BFE3CD] bg-white px-4 py-3 text-sm font-black text-[#2F7D50] shadow-sm transition hover:brightness-105"
          >
            <Printer className="h-4 w-4" />
            Pickingliste drucken
          </button>
        </div>

        {!isConfirmed ? (
          <div className="mb-5 rounded-3xl border border-[#F1D1A8] bg-[#FFF8EE] p-4 text-sm font-bold leading-6 text-[#A75B28]">
            Dieser Bereich wird vollständig relevant, sobald der Kunde das
            Angebot verbindlich bestätigt hat.
          </div>
        ) : null}

        {isConfirmed ? (
          <div
            className={`mb-5 rounded-3xl border p-4 text-sm font-bold leading-6 ${paymentGateClasses}`}
          >
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white">
                <PaymentGateIcon className="h-5 w-5" />
              </div>

              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em]">
                  Zahlungsfreigabe
                </p>

                <h3 className="mt-1 text-lg font-black">{paymentGateTitle}</h3>

                <p className="mt-1">{paymentGateText}</p>

                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-2xl bg-white/80 px-3 py-2">
                    <p className="text-xs font-bold opacity-80">Zahlungsart</p>
                    <p className="font-black">
                      {getPaymentMethodLabel(selectedPaymentMethod)}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-white/80 px-3 py-2">
                    <p className="text-xs font-bold opacity-80">Status</p>
                    <p className="font-black">
                      {getPaymentStatusLabel(paymentStatus)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-5">
          <div className="rounded-[24px] border border-[#BFE3CD] bg-white p-4">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-[#F0FFF6] text-[#2F7D50]">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[#2F7D50]">
              Bestätigung
            </p>
            <p className="mt-2 font-black text-[#102A43]">
              {isConfirmed ? "Bestätigt" : "Noch nicht bestätigt"}
            </p>
            <p className="mt-1 text-xs font-semibold text-[#52616F]">
              {formatDateTime(confirmedAt)}
            </p>
          </div>

          <div className="rounded-[24px] border border-[#E8DED2] bg-white p-4">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-[#FBF7F0] text-[#A75B28]">
              <ShoppingBasket className="h-5 w-5" />
            </div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[#A75B28]">
              Picking
            </p>
            <p className="mt-2 font-black text-[#102A43]">
              {getPickingStatusLabel(pickingStatus)}
            </p>
            <p className="mt-1 text-xs font-semibold text-[#52616F]">
              Start: {formatDateTime(pickingStartedAt)}
            </p>
          </div>

          <div className="rounded-[24px] border border-[#E8DED2] bg-white p-4">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-[#FBF7F0] text-[#12395F]">
              {isShipping ? (
                <Truck className="h-5 w-5" />
              ) : (
                <MapPin className="h-5 w-5" />
              )}
            </div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[#12395F]">
              Übergabe
            </p>
            <p className="mt-2 font-black text-[#102A43]">
              {getFulfillmentMethodLabel(fulfillmentMethod)}
            </p>
            <p className="mt-1 text-xs font-semibold text-[#52616F]">
              {getFulfillmentStatusLabel(fulfillmentStatus)}
            </p>
          </div>

          <div className="rounded-[24px] border border-[#E8DED2] bg-white p-4">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-[#FBF7F0] text-[#52616F]">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[#52616F]">
              Zahlung
            </p>
            <p className="mt-2 font-black text-[#102A43]">
              {paymentIsPaid
                ? "Bezahlt"
                : cashOnPickupPending
                ? "Bar bei Abholung"
                : "Noch offen"}
            </p>
            <p className="mt-1 text-xs font-semibold text-[#52616F]">
              {getPaymentMethodLabel(selectedPaymentMethod)}
            </p>
          </div>

          <div className="rounded-[24px] border border-[#E8DED2] bg-white p-4">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-[#FBF7F0] text-[#52616F]">
              <Clock className="h-5 w-5" />
            </div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[#52616F]">
              Paketwert
            </p>
            <p className="mt-2 font-black text-[#102A43]">
              {formatMoney(total)}
            </p>
            <p className="mt-1 text-xs font-semibold text-[#52616F]">
              {offerItems.length} Position
              {offerItems.length === 1 ? "" : "en"} · {totalQuantity} Artikel
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-[28px] border border-[#E8DED2] bg-white p-4">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
            Abwicklungsstand
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-6">
            {workflowSteps.map((step, index) => {
              const active = index === currentStep;
              const completed = index < currentStep;

              return (
                <div
                  key={step.label}
                  className={`rounded-2xl border p-3 ${getStepClass(
                    active,
                    completed
                  )}`}
                >
                  <p className="text-sm font-black">{step.label}</p>
                  <p className="mt-1 text-xs font-semibold opacity-80">
                    {step.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {isPickup ? (
          <div className="mt-5 rounded-[26px] border border-[#BFE3CD] bg-white p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[#2F7D50]">
                  Abholung
                </p>
                <h3 className="mt-1 font-black text-[#102A43]">
                  {pickupLocationLabel || "Abholung im Laden"}
                </h3>
                <p className="mt-1 text-sm font-semibold leading-6 text-[#52616F]">
                  {pickupAddressSnapshot || "Keine Abholadresse gespeichert."}
                </p>
              </div>

              {pickupMapsUrlSnapshot ? (
                <a
                  href={pickupMapsUrlSnapshot}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#2F7D50] px-4 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110"
                >
                  <MapPin className="h-4 w-4" />
                  Route öffnen
                </a>
              ) : null}
            </div>
          </div>
        ) : null}

        {isShipping ? (
          <div className="mt-5 rounded-[26px] border border-[#C8D8E8] bg-white p-4">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[#12395F]">
              Versand
            </p>
            <h3 className="mt-1 font-black text-[#102A43]">
              Versand vom Kunden gewünscht
            </h3>
            <p className="mt-1 text-sm font-semibold leading-6 text-[#52616F]">
              Versandkostenstatus: {getShippingCostLabel(shippingCostStatus)}
            </p>
          </div>
        ) : null}

        <div className="mt-5 rounded-[28px] border border-[#E8DED2] bg-white p-4">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#FBF7F0] text-[#A75B28]">
                <ClipboardList className="h-5 w-5" />
              </div>

              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
                  Pickingliste
                </p>
                <h3 className="font-black text-[#102A43]">
                  Diese Positionen müssen gepackt werden
                </h3>
              </div>
            </div>
          </div>

          {offerItems.length > 0 ? (
            <div className="overflow-hidden rounded-2xl border border-[#E8DED2]">
              <div className="grid grid-cols-[44px_72px_1fr_100px] bg-[#102A43] px-4 py-3 text-xs font-black uppercase tracking-[0.12em] text-white md:grid-cols-[52px_80px_1fr_150px_120px]">
                <div>OK</div>
                <div>Menge</div>
                <div>Artikel</div>
                <div className="hidden md:block">Art.-Nr.</div>
                <div className="text-right">Wert</div>
              </div>

              {offerItems.map((item, index) => {
                const quantity = toNumber(item.quantity, 1);
                const price = toNumber(item.product_price, 0);
                const lineTotal = quantity * price;

                return (
                  <div
                    key={item.id}
                    className={`grid grid-cols-[44px_72px_1fr_100px] gap-3 px-4 py-4 text-sm md:grid-cols-[52px_80px_1fr_150px_120px] ${
                      index % 2 === 0 ? "bg-[#FBF7F0]" : "bg-white"
                    }`}
                  >
                    <div>
                      <div className="h-6 w-6 rounded-md border-2 border-[#102A43] bg-white" />
                    </div>

                    <div className="font-black text-[#102A43]">
                      {quantity}
                      {item.unit ? ` ${item.unit}` : ""}
                    </div>

                    <div>
                      <p className="font-black text-[#102A43]">
                        {item.product_name}
                      </p>

                      <p className="mt-1 text-xs font-semibold text-[#52616F] md:hidden">
                        {item.product_sku || "Ohne Art.-Nr."}
                      </p>

                      <p className="mt-1 inline-flex rounded-full bg-white px-2 py-1 text-[11px] font-black text-[#A75B28]">
                        {getSourceLabel(item.source)}
                      </p>

                      {item.notes ? (
                        <p className="mt-2 text-xs font-semibold leading-5 text-[#52616F]">
                          Hinweis: {item.notes}
                        </p>
                      ) : null}
                    </div>

                    <div className="hidden text-sm font-semibold text-[#52616F] md:block">
                      {item.product_sku || "—"}
                    </div>

                    <div className="text-right font-black text-[#102A43]">
                      {formatMoney(lineTotal)}
                    </div>
                  </div>
                );
              })}

              <div className="grid grid-cols-[1fr_140px] bg-white px-4 py-4 text-sm">
                <div className="font-black text-[#102A43]">
                  Gesamt: {offerItems.length} Position
                  {offerItems.length === 1 ? "" : "en"} · {totalQuantity} Artikel
                </div>
                <div className="text-right text-lg font-black text-[#102A43]">
                  {formatMoney(total)}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-[#D8C8B8] bg-[#FBF7F0] p-5 text-sm font-semibold text-[#52616F]">
              Noch keine Paketpositionen vorhanden.
            </div>
          )}
        </div>

        <div className="mt-5 rounded-[28px] border border-[#E8DED2] bg-white p-4">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
            Workflow-Aktionen
          </p>

          <h3 className="mt-1 font-black text-[#102A43]">
            Status für Picking, Abholung oder Versand setzen
          </h3>

          <div className="mt-3 rounded-2xl bg-[#FBF7F0] p-4 text-sm font-bold leading-6 text-[#52616F]">
            {paymentIsPaid ? (
              <div className="flex items-start gap-2 text-[#2F7D50]">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                Zahlung verbucht. Alle passenden Abwicklungsschritte sind
                freigegeben.
              </div>
            ) : cashOnPickupPending ? (
              <div className="flex items-start gap-2 text-[#A75B28]">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                Barzahlung bei Abholung gewählt. Picking, Packen und Abholbereit
                sind erlaubt. „Abgeholt“ bleibt bis zur Barzahlungsbuchung
                gesperrt.
              </div>
            ) : (
              <div className="flex items-start gap-2 text-[#B5282D]">
                <Lock className="mt-0.5 h-4 w-4 shrink-0" />
                Abwicklung ist gesperrt, bis die Zahlung eingegangen und
                verbucht ist.
              </div>
            )}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <AdminFulfillmentActionButton
              requestId={requestId}
              action="start_picking"
              label="Picking starten"
              variant="blue"
              disabled={!canPrepareFulfillment}
            />

            <AdminFulfillmentActionButton
              requestId={requestId}
              action="mark_picked"
              label="Als gepickt markieren"
              variant="neutral"
              disabled={!canPrepareFulfillment}
            />

            <AdminFulfillmentActionButton
              requestId={requestId}
              action="mark_packed"
              label="Als gepackt markieren"
              variant="green"
              disabled={!canPrepareFulfillment}
            />

            {isPickup ? (
              <>
                <AdminFulfillmentActionButton
                  requestId={requestId}
                  action="ready_for_pickup"
                  label="Abholbereit"
                  variant="green"
                  disabled={!canPrepareFulfillment}
                />

                <AdminFulfillmentActionButton
                  requestId={requestId}
                  action="mark_picked_up"
                  label="Abgeholt"
                  variant="green"
                  disabled={!canFinishPickup}
                />
              </>
            ) : null}

            {isShipping ? (
              <>
                <AdminFulfillmentActionButton
                  requestId={requestId}
                  action="ready_for_shipping"
                  label="Versandbereit"
                  variant="blue"
                  disabled={!canShip}
                />

                <AdminFulfillmentActionButton
                  requestId={requestId}
                  action="mark_shipped"
                  label="Versendet"
                  variant="green"
                  disabled={!canShip}
                />
              </>
            ) : null}
          </div>

          <div className="mt-4 grid gap-3 rounded-2xl bg-[#FBF7F0] p-4 text-xs font-semibold leading-5 text-[#52616F] md:grid-cols-2">
            <div>
              <p className="font-black text-[#102A43]">Zeitpunkte</p>
              <p>Picking gestartet: {formatDateTime(pickingStartedAt)}</p>
              <p>Gepickt: {formatDateTime(pickedAt)}</p>
              <p>Gepackt: {formatDateTime(packedAt)}</p>
            </div>

            <div>
              <p className="font-black text-[#102A43]">Übergabe</p>
              <p>Versendet: {formatDateTime(shippedAt)}</p>
              <p>Abgeholt: {formatDateTime(pickedUpAt)}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}