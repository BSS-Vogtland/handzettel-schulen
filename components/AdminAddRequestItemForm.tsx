"use client";

import { FormEvent, useState } from "react";
import { PlusCircle } from "lucide-react";

type AdminAddRequestItemChildOption = {
  id: string;
  label: string;
};

type AdminAddRequestItemFormProps = {
  requestId: string;
  childOptions?: AdminAddRequestItemChildOption[];
  defaultChildId?: string | null;
};

type AddItemResponse = {
  ok?: boolean;
  message?: string;
  itemId?: string;
};

export default function AdminAddRequestItemForm({
  requestId,
  childOptions = [],
  defaultChildId = null,
}: AdminAddRequestItemFormProps) {
  const [isOpen, setIsOpen] = useState(false);
    const [selectedChildId, setSelectedChildId] = useState(defaultChildId || "");
  const showChildSelect = childOptions.length > 0 && !defaultChildId;
const [isSaving, setIsSaving] = useState(false);
  const [rawText, setRawText] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [category, setCategory] = useState("");
  const [format, setFormat] = useState("");
  const [color, setColor] = useState("");
  const [lineature, setLineature] = useState("");
  const [notes, setNotes] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSaving) return;

    const cleanRawText = rawText.trim();

    if (!cleanRawText) {
      setErrorMessage("Bitte gib eine Bezeichnung fÃ¼r die neue Position ein.");
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      if (showChildSelect && !selectedChildId.trim()) {

        setErrorMessage("Bitte ein Kind auswÃ¤hlen.");

        return;

      }


      const response = await fetch(
        `/api/admin/requests/${encodeURIComponent(requestId)}/items/manual`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            
        childId: childOptions.length > 0 ? selectedChildId.trim() || defaultChildId || null : null,
            rawText: cleanRawText,
            normalizedName: cleanRawText,
            quantity,
            category,
            format,
            color,
            lineature,
            notes,
          }),
        }
      );

      const payload = (await response.json().catch(() => null)) as
        | AddItemResponse
        | null;

      if (!response.ok || !payload?.ok || !payload.itemId) {
        throw new Error(
          payload?.message || "Die neue Listenposition konnte nicht angelegt werden."
        );
      }

      const url = new URL(window.location.href);
      url.searchParams.set("addedItem", payload.itemId);
      url.searchParams.set("refresh", Date.now().toString());
      url.hash = `position-${payload.itemId}`;
      window.location.href = url.toString();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Die neue Listenposition konnte nicht angelegt werden."
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#12395F] px-4 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110"
      >
        <PlusCircle className="h-4 w-4" />
        Neue Listenposition hinzufÃ¼gen
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-[24px] border border-[#C8D8E8] bg-[#EEF4FA] p-4"
    >
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#12395F]">
            Manuell ergÃ¤nzen
          </p>
          <h3 className="mt-1 text-lg font-black text-[#102A43]">
            Neue Listenposition anlegen
          </h3>
          <p className="mt-1 text-sm font-semibold leading-6 text-[#52616F]">
            Nutze das, wenn die KI/OCR eine Position nicht erkannt hat. Danach
            erscheint die Position in der Liste und Du kannst darunter Produkte
            hinzufÃ¼gen.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="rounded-2xl border border-[#D8C8B8] bg-white px-4 py-2 text-xs font-black text-[#52616F] transition hover:bg-[#FBF7F0]"
        >
          Abbrechen
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
                {showChildSelect ? (
          <div className="rounded-[22px] border border-[#D6E7EF] bg-[#F5FAFD] p-4">
            <label
              htmlFor="manual-request-item-child-id"
              className="text-xs font-black uppercase tracking-[0.14em] text-[#12395F]"
            >
              Kind fÃ¼r neue Listenposition
            </label>

            <select
              id="manual-request-item-child-id"
              value={selectedChildId}
              onChange={(event) => setSelectedChildId(event.target.value)}
              className="mt-2 min-h-12 w-full rounded-2xl border border-[#D6E7EF] bg-white px-4 py-3 text-sm font-bold text-[#102A43] outline-none transition focus:border-[#12395F]"
            >
              <option value="">Kind auswÃ¤hlen</option>
              {childOptions.map((child) => (
                <option key={child.id} value={child.id}>
                  {child.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}
<label className="md:col-span-2">
          <span className="mb-1 block text-xs font-black uppercase tracking-[0.14em] text-[#52616F]">
            Bezeichnung / Listenzeile
          </span>
          <input
            value={rawText}
            onChange={(event) => setRawText(event.target.value)}
            placeholder="z. B. Zeichenblock A3 weiÃŸ, 20 Blatt"
            className="min-h-12 w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 py-3 text-sm font-bold text-[#102A43] outline-none transition focus:border-[#12395F]"
          />
        </label>

        <label>
          <span className="mb-1 block text-xs font-black uppercase tracking-[0.14em] text-[#52616F]">
            Menge
          </span>
          <input
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            inputMode="decimal"
            className="min-h-12 w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 py-3 text-sm font-bold text-[#102A43] outline-none transition focus:border-[#12395F]"
          />
        </label>

        <label>
          <span className="mb-1 block text-xs font-black uppercase tracking-[0.14em] text-[#52616F]">
            Kategorie
          </span>
          <input
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            placeholder="z. B. Block, Heft, Stift"
            className="min-h-12 w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 py-3 text-sm font-bold text-[#102A43] outline-none transition focus:border-[#12395F]"
          />
        </label>

        <label>
          <span className="mb-1 block text-xs font-black uppercase tracking-[0.14em] text-[#52616F]">
            Format
          </span>
          <input
            value={format}
            onChange={(event) => setFormat(event.target.value)}
            placeholder="z. B. A4, A5, A3"
            className="min-h-12 w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 py-3 text-sm font-bold text-[#102A43] outline-none transition focus:border-[#12395F]"
          />
        </label>

        <label>
          <span className="mb-1 block text-xs font-black uppercase tracking-[0.14em] text-[#52616F]">
            Farbe
          </span>
          <input
            value={color}
            onChange={(event) => setColor(event.target.value)}
            placeholder="z. B. blau, rot, weiÃŸ"
            className="min-h-12 w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 py-3 text-sm font-bold text-[#102A43] outline-none transition focus:border-[#12395F]"
          />
        </label>

        <label>
          <span className="mb-1 block text-xs font-black uppercase tracking-[0.14em] text-[#52616F]">
            Lineatur
          </span>
          <input
            value={lineature}
            onChange={(event) => setLineature(event.target.value)}
            placeholder="z. B. 0, 8f, kariert"
            className="min-h-12 w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 py-3 text-sm font-bold text-[#102A43] outline-none transition focus:border-[#12395F]"
          />
        </label>

        <label className="md:col-span-2">
          <span className="mb-1 block text-xs font-black uppercase tracking-[0.14em] text-[#52616F]">
            Notiz
          </span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            placeholder="Optional: Zusatzinfo aus der Liste oder interne Notiz"
            className="w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 py-3 text-sm font-bold text-[#102A43] outline-none transition focus:border-[#12395F]"
          />
        </label>
      </div>

      {errorMessage ? (
        <p className="mt-4 rounded-2xl border border-[#F2B8B8] bg-[#FFF1F1] px-4 py-3 text-sm font-bold text-[#B5282D]">
          {errorMessage}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isSaving}
        className="mt-4 inline-flex min-h-12 items-center justify-center rounded-2xl bg-[#12395F] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSaving ? "Speichere ..." : "Listenposition anlegen"}
      </button>
    </form>
  );
}

