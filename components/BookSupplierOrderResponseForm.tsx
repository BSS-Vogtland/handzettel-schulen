"use client";

import {
  CheckCircle2,
  Loader2,
  Save,
} from "lucide-react";
import { useState } from "react";

type OrderItem = {
  id: string;
  isbn: string;
  title: string;
  subtitle: string | null;
  authors: string[] | null;
  publisher: string | null;
  cover_url: string | null;
  quantity: number;
  supplier_status: string;
  accepted_quantity: number | null;
  supplier_note: string | null;
};

type Props = {
  token: string;
  orderNumber: string;
  initialSupplierNote: string | null;
  initialItems: OrderItem[];
};

const STATUS_OPTIONS = [
  ["pending", "Noch nicht beantwortet"],
  ["accepted", "Angenommen"],
  ["partially_accepted", "Teilweise angenommen"],
  ["unavailable", "Nicht lieferbar"],
  ["ready", "Zur Abholung bereit"],
] as const;

export default function BookSupplierOrderResponseForm({
  token,
  orderNumber,
  initialSupplierNote,
  initialItems,
}: Props) {
  const [supplierNote, setSupplierNote] = useState(
    initialSupplierNote || "",
  );
  const [items, setItems] = useState(initialItems);
  const [isSaving, setIsSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  function patchItem(
    itemId: string,
    patch: Partial<OrderItem>,
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

  async function saveResponse() {
    if (isSaving) return;

    setIsSaving(true);
    setSuccess(null);
    setError(null);

    try {
      const response = await fetch(
        `/api/book-supplier/orders/${encodeURIComponent(
          token,
        )}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            supplierNote,
            items: items.map((item) => ({
              id: item.id,
              supplierStatus: item.supplier_status,
              acceptedQuantity: item.accepted_quantity,
              supplierNote: item.supplier_note,
            })),
          }),
        },
      );

      const payload = (await response.json()) as {
        ok?: boolean;
        message?: string;
      };

      if (!response.ok || !payload.ok) {
        throw new Error(
          payload.message ||
            "Die Auftragsrückmeldung konnte nicht gespeichert werden.",
        );
      }

      setSuccess(
        payload.message ||
          `Die Rückmeldung zu ${orderNumber} wurde gespeichert.`,
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Die Auftragsrückmeldung konnte nicht gespeichert werden.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="grid gap-5">
      {success ? (
        <div className="flex items-start gap-3 rounded-2xl border border-[#BFE3CD] bg-[#F0FFF6] p-4 text-[#2F7D50]">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          <p className="font-bold leading-6">{success}</p>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-[#F0B7BA] bg-[#FFF1F1] p-4 font-bold text-[#9F1D24]">
          {error}
        </div>
      ) : null}

      {items.map((item, index) => (
        <article
          key={item.id}
          className="rounded-[28px] border border-[#E8DED2] bg-white p-5 shadow-sm"
        >
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="h-36 w-24 shrink-0 overflow-hidden rounded-xl border border-[#E8DED2] bg-[#FBF7F0]">
              {item.cover_url ? (
                <img
                  src={item.cover_url}
                  alt={item.title}
                  className="h-full w-full object-contain p-1"
                />
              ) : null}
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[#A75B28]">
                Position {index + 1}
              </p>
              <h2 className="mt-1 text-xl font-black text-[#102A43]">
                {item.title}
              </h2>

              {item.subtitle ? (
                <p className="mt-1 font-semibold text-[#52616F]">
                  {item.subtitle}
                </p>
              ) : null}

              <p className="mt-2 text-sm font-bold text-[#52616F]">
                ISBN {item.isbn} · Verbindlich bestellt:{" "}
                {item.quantity} Exemplar(e)
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-black">
                Auftragsstatus*
              </span>
              <select
                value={item.supplier_status}
                onChange={(event) =>
                  patchItem(item.id, {
                    supplier_status: event.target.value,
                    accepted_quantity:
                      event.target.value === "accepted" ||
                      event.target.value === "ready"
                        ? item.quantity
                        : item.accepted_quantity,
                  })
                }
                className="min-h-12 w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 font-bold"
              >
                {STATUS_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-black">
                Bestätigte Menge
              </span>
              <input
                type="number"
                min={0}
                max={item.quantity}
                value={item.accepted_quantity ?? ""}
                onChange={(event) =>
                  patchItem(item.id, {
                    accepted_quantity:
                      event.target.value === ""
                        ? null
                        : Math.max(
                            0,
                            Math.min(
                              item.quantity,
                              Math.trunc(
                                Number(event.target.value) || 0,
                              ),
                            ),
                          ),
                  })
                }
                className="min-h-12 w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 font-bold"
              />
            </label>

            <label className="block sm:col-span-2">
              <span className="mb-2 block text-sm font-black">
                Bemerkung zur Position
              </span>
              <textarea
                rows={3}
                value={item.supplier_note || ""}
                onChange={(event) =>
                  patchItem(item.id, {
                    supplier_note: event.target.value,
                  })
                }
                className="w-full rounded-2xl border border-[#D8C8B8] bg-white p-4 font-semibold"
              />
            </label>
          </div>
        </article>
      ))}

      <label className="block rounded-[28px] border border-[#E8DED2] bg-white p-5 shadow-sm">
        <span className="mb-2 block text-sm font-black">
          Allgemeine Rückmeldung zum Auftrag
        </span>
        <textarea
          rows={4}
          value={supplierNote}
          onChange={(event) =>
            setSupplierNote(event.target.value)
          }
          className="w-full rounded-2xl border border-[#D8C8B8] bg-white p-4 font-semibold"
        />
      </label>

      <button
        type="button"
        onClick={() => void saveResponse()}
        disabled={isSaving}
        className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-[#B5282D] px-6 py-4 text-base font-black text-white disabled:opacity-60"
      >
        {isSaving ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <Save className="h-5 w-5" />
        )}
        Auftragsrückmeldung speichern
      </button>
    </div>
  );
}
