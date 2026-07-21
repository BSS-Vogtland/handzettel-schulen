"use client";

import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  Loader2,
  PackageCheck,
  Send,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

type InquiryItem = {
  id: string;
  isbn: string;
  title: string;
  subtitle: string | null;
  authors: string[] | null;
  publisher: string | null;
  cover_url: string | null;
  requested_quantity: number;
  availability_status: string;
  available_quantity: number | null;
  lead_time_days: number | null;
  reservation_until: string | null;
};

type DraftItem = InquiryItem & {
  selected: boolean;
  quantity: number;
};

type Props = {
  inquiryId: string;
  inquiryNumber: string;
  partnerEmail: string | null;
  initialItems: InquiryItem[];
};

function getAvailabilityLabel(status: string) {
  switch (status) {
    case "in_store":
      return "Im Laden verfügbar";
    case "orderable":
      return "Bestellbar";
    case "partially_available":
      return "Teilweise verfügbar";
    case "unavailable":
      return "Nicht verfügbar";
    case "checking":
      return "Noch zu prüfen";
    default:
      return "Noch offen";
  }
}

function createRequestKey() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return "";
}

export default function AdminBookSupplierOrderComposer({
  inquiryId,
  inquiryNumber,
  partnerEmail,
  initialItems,
}: Props) {
  const [items, setItems] = useState<DraftItem[]>(
    initialItems.map((item) => {
      const suggestedQuantity =
        item.available_quantity !== null &&
        item.available_quantity > 0
          ? Math.min(
              item.requested_quantity,
              item.available_quantity,
            )
          : item.requested_quantity;

      return {
        ...item,
        selected: [
          "in_store",
          "orderable",
          "partially_available",
        ].includes(item.availability_status),
        quantity: Math.max(1, suggestedQuantity),
      };
    }),
  );

  const [customerReference, setCustomerReference] =
    useState("");
  const [fulfillmentMethod, setFulfillmentMethod] =
    useState<"pickup" | "delivery">("pickup");
  const [adminNote, setAdminNote] = useState("");
  const [paymentConfirmed, setPaymentConfirmed] =
    useState(false);
  const [requestKey, setRequestKey] = useState(
    createRequestKey,
  );

  const [isCreating, setIsCreating] = useState(false);
  const [errorMessage, setErrorMessage] =
    useState<string | null>(null);
  const [successMessage, setSuccessMessage] =
    useState<string | null>(null);
  const [createdOrder, setCreatedOrder] = useState<{
    id: string;
    orderNumber: string;
    sent: boolean;
  } | null>(null);

  const selectedItems = useMemo(
    () => items.filter((item) => item.selected),
    [items],
  );

  const totalQuantity = useMemo(
    () =>
      selectedItems.reduce(
        (sum, item) => sum + item.quantity,
        0,
      ),
    [selectedItems],
  );

  function patchItem(
    itemId: string,
    patch: Partial<DraftItem>,
  ) {
    setItems((current) =>
      current.map((item) =>
        item.id === itemId
          ? {
              ...item,
              ...patch,
            }
          : item,
      ),
    );
  }

  async function createOrder(sendNow: boolean) {
    if (isCreating) return;

    setErrorMessage(null);
    setSuccessMessage(null);
    setCreatedOrder(null);

    if (selectedItems.length === 0) {
      setErrorMessage(
        "Wähle mindestens eine Buchposition für den Auftrag aus.",
      );
      return;
    }

    if (sendNow && !partnerEmail) {
      setErrorMessage(
        "Bei der Vogtländischen Buchhandlung ist noch keine E-Mail-Adresse hinterlegt.",
      );
      return;
    }

    if (sendNow && !paymentConfirmed) {
      setErrorMessage(
        "Bestätige vor dem Versand, dass Du den Zahlungseingang geprüft hast.",
      );
      return;
    }

    let effectiveRequestKey = requestKey;

    if (!effectiveRequestKey) {
      effectiveRequestKey = createRequestKey();
      setRequestKey(effectiveRequestKey);
    }

    if (!effectiveRequestKey) {
      setErrorMessage(
        "Der sichere Auftragsvorgang konnte nicht initialisiert werden. Lade die Seite neu.",
      );
      return;
    }

    setIsCreating(true);

    try {
      const response = await fetch(
        "/api/admin/book-supplier/orders",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            requestKey: effectiveRequestKey,
            inquiryId,
            customerReference,
            fulfillmentMethod,
            adminNote,
            paymentConfirmed,
            sendNow,
            items: selectedItems.map((item) => ({
              inquiryItemId: item.id,
              quantity: item.quantity,
            })),
          }),
        },
      );

      const payload = (await response.json()) as {
        ok?: boolean;
        sent?: boolean;
        warning?: string | null;
        message?: string;
        order?: {
          id: string;
          orderNumber: string;
        };
      };

      if (!response.ok || !payload.ok || !payload.order) {
        throw new Error(
          payload.message ||
            "Der Buchauftrag konnte nicht erstellt werden.",
        );
      }

      setCreatedOrder({
        id: payload.order.id,
        orderNumber: payload.order.orderNumber,
        sent: Boolean(payload.sent),
      });

      setSuccessMessage(
        payload.warning ||
          (payload.sent
            ? `Der Auftrag ${payload.order.orderNumber} wurde verbindlich versendet.`
            : `Der Auftrag ${payload.order.orderNumber} wurde als Entwurf gespeichert.`),
      );

      setRequestKey(createRequestKey());
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Der Buchauftrag konnte nicht erstellt werden.",
      );
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <section className="grid gap-5">
      {errorMessage ? (
        <div className="flex items-start gap-3 rounded-2xl border border-[#F0B7BA] bg-[#FFF1F1] p-4 text-[#9F1D24]">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <p className="font-bold leading-6">
            {errorMessage}
          </p>
        </div>
      ) : null}

      {successMessage ? (
        <div className="flex items-start gap-3 rounded-2xl border border-[#BFE3CD] bg-[#F0FFF6] p-4 text-[#2F7D50]">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-bold leading-6">
              {successMessage}
            </p>

            {createdOrder ? (
              <Link
                href={`/admin/buchhandlung/auftraege/${createdOrder.id}`}
                className="mt-2 inline-flex font-black underline"
              >
                {createdOrder.orderNumber} öffnen
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="rounded-[30px] border border-[#E8DED2] bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
              Bezug
            </p>
            <h2 className="mt-1 text-2xl font-black">
              Verfügbarkeitsanfrage {inquiryNumber}
            </h2>
            <p className="mt-2 font-semibold text-[#52616F]">
              Wähle die tatsächlich benötigten Bücher und
              Mengen manuell aus.
            </p>
          </div>

          <div className="rounded-2xl bg-[#EEF4FA] px-4 py-3 text-right">
            <p className="text-xs font-black uppercase text-[#12395F]">
              Auftrag
            </p>
            <p className="mt-1 font-black">
              {selectedItems.length} Position(en) ·{" "}
              {totalQuantity} Exemplar(e)
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4">
        {items.map((item, index) => {
          const unavailable =
            item.availability_status === "unavailable";
          const pending =
            item.availability_status === "pending";

          return (
            <article
              key={item.id}
              className={`rounded-[28px] border p-5 shadow-sm ${
                item.selected
                  ? "border-[#BFE3CD] bg-[#F8FFFB]"
                  : "border-[#E8DED2] bg-white"
              }`}
            >
              <div className="grid gap-4 md:grid-cols-[auto_80px_1fr_170px] md:items-start">
                <label className="flex min-h-12 items-center gap-3 font-black">
                  <input
                    type="checkbox"
                    checked={item.selected}
                    onChange={(event) =>
                      patchItem(item.id, {
                        selected: event.target.checked,
                      })
                    }
                    className="h-5 w-5 accent-[#B5282D]"
                  />
                  Auswählen
                </label>

                <div className="h-28 w-20 overflow-hidden rounded-xl border border-[#E8DED2] bg-[#FBF7F0]">
                  {item.cover_url ? (
                    <img
                      src={item.cover_url}
                      alt={item.title}
                      className="h-full w-full object-contain p-1"
                    />
                  ) : null}
                </div>

                <div>
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-[#A75B28]">
                    Position {index + 1}
                  </p>
                  <h3 className="mt-1 text-lg font-black">
                    {item.title}
                  </h3>
                  <p className="mt-1 text-sm font-bold text-[#52616F]">
                    ISBN {item.isbn}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-black ${
                        unavailable
                          ? "bg-[#FFF1F1] text-[#9F1D24]"
                          : pending
                            ? "bg-[#FFF8EE] text-[#A75B28]"
                            : "bg-[#F0FFF6] text-[#2F7D50]"
                      }`}
                    >
                      {getAvailabilityLabel(
                        item.availability_status,
                      )}
                    </span>

                    <span className="rounded-full bg-[#FBF7F0] px-3 py-1 text-xs font-black text-[#52616F]">
                      Angefragt: {item.requested_quantity}
                    </span>

                    {item.available_quantity !== null ? (
                      <span className="rounded-full bg-[#EEF4FA] px-3 py-1 text-xs font-black text-[#12395F]">
                        Verfügbar: {item.available_quantity}
                      </span>
                    ) : null}

                    {item.lead_time_days !== null ? (
                      <span className="rounded-full bg-[#EEF4FA] px-3 py-1 text-xs font-black text-[#12395F]">
                        Lieferzeit: {item.lead_time_days} Tage
                      </span>
                    ) : null}
                  </div>

                  {unavailable || pending ? (
                    <p className="mt-3 text-sm font-bold text-[#A75B28]">
                      Diese Position ist nicht bestätigt. Eine
                      Bestellung ist trotzdem bewusst manuell möglich.
                    </p>
                  ) : null}
                </div>

                <label className="block">
                  <span className="mb-2 block text-sm font-black">
                    Bestellmenge
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={999}
                    value={item.quantity}
                    disabled={!item.selected}
                    onChange={(event) =>
                      patchItem(item.id, {
                        quantity: Math.max(
                          1,
                          Math.min(
                            999,
                            Math.trunc(
                              Number(event.target.value) || 1,
                            ),
                          ),
                        ),
                      })
                    }
                    className="min-h-12 w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 text-center font-black disabled:bg-[#F4F4F4] disabled:opacity-60"
                  />
                </label>
              </div>
            </article>
          );
        })}
      </div>

      <div className="grid gap-5 rounded-[30px] border border-[#E8DED2] bg-white p-5 shadow-sm lg:grid-cols-2">
        <label className="block">
          <span className="mb-2 block text-sm font-black">
            Kunden- oder Vorgangsreferenz
          </span>
          <input
            value={customerReference}
            onChange={(event) =>
              setCustomerReference(event.target.value)
            }
            placeholder="z. B. HS-2026-00056 oder Kundenname"
            className="min-h-12 w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 font-semibold outline-none focus:border-[#B5282D]"
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-black">
            Abwicklung
          </span>
          <select
            value={fulfillmentMethod}
            onChange={(event) =>
              setFulfillmentMethod(
                event.target.value === "delivery"
                  ? "delivery"
                  : "pickup",
              )
            }
            className="min-h-12 w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 font-bold"
          >
            <option value="pickup">
              Abholung bei der Buchhandlung
            </option>
            <option value="delivery">
              Lieferung an Handzettel-Schulen.de
            </option>
          </select>
        </label>

        <label className="block lg:col-span-2">
          <span className="mb-2 block text-sm font-black">
            Hinweis an die Buchhandlung
          </span>
          <textarea
            rows={4}
            value={adminNote}
            onChange={(event) =>
              setAdminNote(event.target.value)
            }
            placeholder="Optionaler Hinweis zum verbindlichen Auftrag"
            className="w-full rounded-2xl border border-[#D8C8B8] bg-white p-4 font-semibold outline-none focus:border-[#B5282D]"
          />
        </label>
      </div>

      <div className="rounded-[30px] border border-[#F1D1A8] bg-[#FFF8EE] p-5">
        <div className="flex items-start gap-3">
          <CreditCard className="mt-0.5 h-6 w-6 shrink-0 text-[#A75B28]" />
          <div>
            <h2 className="text-lg font-black">
              Zahlung manuell geprüft
            </h2>
            <p className="mt-1 font-semibold leading-6 text-[#52616F]">
              Das System prüft den Zahlungseingang bewusst
              nicht automatisch. Vor dem verbindlichen Versand
              bestätigst Du die Prüfung selbst.
            </p>

            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-[#F1D1A8] bg-white p-4 font-black">
              <input
                type="checkbox"
                checked={paymentConfirmed}
                onChange={(event) =>
                  setPaymentConfirmed(event.target.checked)
                }
                className="mt-0.5 h-5 w-5 accent-[#B5282D]"
              />
              <span>
                Ich habe den Zahlungseingang geprüft und möchte
                diesen Auftrag verbindlich senden.
              </span>
            </label>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => void createOrder(true)}
        disabled={
          isCreating ||
          selectedItems.length === 0 ||
          !paymentConfirmed
        }
        className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-[#B5282D] px-5 py-4 font-black text-white disabled:opacity-50"
      >
        {isCreating ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <>
            <PackageCheck className="h-5 w-5" />
            <Send className="h-4 w-4" />
          </>
        )}
        Verbindlich speichern und senden
      </button>
    </section>
  );
}
