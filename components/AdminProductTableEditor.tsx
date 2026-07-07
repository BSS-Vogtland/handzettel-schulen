"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  PRODUCT_CATEGORY_OPTIONS,
  isAllowedProductCategory,
  normalizeProductCategory,
} from "@/lib/productCategories";

export type AdminProductTableRow = {
  id: string;
  active: boolean;
  productName: string;
  productSku: string;
  ean: string;
  productPrice: string;
  category: string;
  productType: string;
  format: string;
  color: string;
  lineature: string;
  bookWidthMm: string;
  bookHeightMm: string;
  bookSizeNote: string;
  imageUrl: string;
  stockQuantity: string;
  storageLocation: string;
  supplierName: string;
  aliases: string;
  createdAt: string | null;
  updatedAt: string | null;
};

type SaveState = {
  type: "idle" | "saving" | "success" | "error";
  message: string;
};

type AdminProductTableEditorProps = {
  initialRows: AdminProductTableRow[];
};

type EditableField = keyof Omit<
  AdminProductTableRow,
  "id" | "createdAt" | "updatedAt"
>;

function formatDate(value: string | null) {
  if (!value) return "-";

  try {
    return new Intl.DateTimeFormat("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    }).format(new Date(value));
  } catch {
    return "-";
  }
}

function normalizeRow(row: AdminProductTableRow) {
  return {
    ...row,
    productName: row.productName.trim(),
    productSku: row.productSku.trim(),
    ean: row.ean.trim(),
    productPrice: row.productPrice.trim(),
    category: normalizeProductCategory(row.category),
    productType: row.productType.trim(),
    format: row.format.trim(),
    color: row.color.trim(),
    lineature: row.lineature.trim(),
    bookWidthMm: row.bookWidthMm.trim(),
    bookHeightMm: row.bookHeightMm.trim(),
    bookSizeNote: row.bookSizeNote.trim(),
    imageUrl: row.imageUrl.trim(),
    stockQuantity: row.stockQuantity.trim(),
    storageLocation: row.storageLocation.trim(),
    supplierName: row.supplierName.trim(),
    aliases: row.aliases.trim(),
  };
}

function rowFingerprint(row: AdminProductTableRow) {
  return JSON.stringify(normalizeRow(row));
}

async function readJson(response: Response) {
  const raw = await response.text();

  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const inputClass =
  "h-10 w-full rounded-xl border border-[#D8C8B8] bg-white px-3 text-xs font-bold text-[#102A43] outline-none transition focus:border-[#B5282D] focus:ring-2 focus:ring-[#B5282D]/10";

const textareaClass =
  "min-h-10 w-full rounded-xl border border-[#D8C8B8] bg-white px-3 py-2 text-xs font-bold text-[#102A43] outline-none transition focus:border-[#B5282D] focus:ring-2 focus:ring-[#B5282D]/10";

export default function AdminProductTableEditor({
  initialRows,
}: AdminProductTableEditorProps) {
  const router = useRouter();

  const [rows, setRows] = useState(initialRows);
  const [originalRows, setOriginalRows] = useState(initialRows);
  const [query, setQuery] = useState("");
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});

  const originalById = useMemo(() => {
    return new Map(originalRows.map((row) => [row.id, row]));
  }, [originalRows]);

  function isDirty(row: AdminProductTableRow) {
    const original = originalById.get(row.id);
    if (!original) return true;

    return rowFingerprint(row) !== rowFingerprint(original);
  }

  const changedCount = rows.filter(isDirty).length;

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return rows.filter((row) => {
      const dirty = isDirty(row);

      if (onlyChanged && !dirty) return false;

      if (!normalizedQuery) return true;

      const searchText = [
        row.productName,
        row.productSku,
        row.ean,
        row.category,
        row.productType,
        row.format,
        row.color,
        row.lineature,
        row.bookSizeNote,
        row.storageLocation,
        row.supplierName,
      ]
        .join(" ")
        .toLowerCase();

      return searchText.includes(normalizedQuery);
    });
  }, [rows, query, onlyChanged, originalById]);

  function updateRow(id: string, field: EditableField, value: string | boolean) {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, [field]: value } : row))
    );

    setSaveStates((current) => ({
      ...current,
      [id]: {
        type: "idle",
        message: "",
      },
    }));
  }

  function resetRow(row: AdminProductTableRow) {
    const original = originalById.get(row.id);
    if (!original) return;

    setRows((current) =>
      current.map((entry) => (entry.id === row.id ? original : entry))
    );

    setSaveStates((current) => ({
      ...current,
      [row.id]: {
        type: "idle",
        message: "",
      },
    }));
  }

  async function saveRow(row: AdminProductTableRow) {
    const normalized = normalizeRow(row);

    if (!normalized.productName) {
      setSaveStates((current) => ({
        ...current,
        [row.id]: {
          type: "error",
          message: "Produktname fehlt.",
        },
      }));
      return;
    }

    if (!isAllowedProductCategory(normalized.category)) {
      setSaveStates((current) => ({
        ...current,
        [row.id]: {
          type: "error",
          message: "Kategorie fehlt oder ist nicht erlaubt.",
        },
      }));
      return;
    }

    const formData = new FormData();
    formData.append("productName", normalized.productName);
    formData.append("productSku", normalized.productSku);
    formData.append("ean", normalized.ean);
    formData.append("productPrice", normalized.productPrice);
    formData.append("category", normalized.category);
    formData.append("productType", normalized.productType);
    formData.append("format", normalized.format);
    formData.append("color", normalized.color);
    formData.append("lineature", normalized.lineature);
    formData.append("bookWidthMm", normalized.bookWidthMm);
    formData.append("bookHeightMm", normalized.bookHeightMm);
    formData.append("bookSizeNote", normalized.bookSizeNote);
    formData.append("imageUrl", normalized.imageUrl);
    formData.append("active", String(normalized.active));
    formData.append("stockQuantity", normalized.stockQuantity);
    formData.append("storageLocation", normalized.storageLocation);
    formData.append("supplierName", normalized.supplierName);
    formData.append("aliases", normalized.aliases);

    setSaveStates((current) => ({
      ...current,
      [row.id]: {
        type: "saving",
        message: "Speichert ...",
      },
    }));

    try {
      const response = await fetch(
        "/api/admin/products/" + encodeURIComponent(row.id) + "/table-update",
        {
          method: "POST",
          body: formData,
          cache: "no-store",
        }
      );

      const payload = await readJson(response);

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message || "Produkt konnte nicht gespeichert werden.");
      }

      const savedRow: AdminProductTableRow = {
        ...normalized,
        category: normalizeProductCategory(normalized.category),
        updatedAt: new Date().toISOString(),
      };

      setRows((current) =>
        current.map((entry) => (entry.id === row.id ? savedRow : entry))
      );

      setOriginalRows((current) =>
        current.map((entry) => (entry.id === row.id ? savedRow : entry))
      );

      setSaveStates((current) => ({
        ...current,
        [row.id]: {
          type: "success",
          message: "Gespeichert.",
        },
      }));

      router.refresh();
    } catch (error) {
      setSaveStates((current) => ({
        ...current,
        [row.id]: {
          type: "error",
          message:
            error instanceof Error
              ? error.message
              : "Produkt konnte nicht gespeichert werden.",
        },
      }));
    }
  }

  return (
    <div className="rounded-[28px] border border-[#E8DED2] bg-white shadow-[0_18px_45px_rgba(16,42,67,0.10)]">
      <div className="flex flex-col gap-3 border-b border-[#E8DED2] p-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
            Tabellenpflege
          </p>
          <h2 className="mt-1 text-2xl font-black text-[#102A43]">
            Produkte direkt bearbeiten
          </h2>
          <p className="mt-1 text-sm font-semibold text-[#52616F]">
            {rows.length} Produkte geladen. {changedCount} Zeile
            {changedCount === 1 ? "" : "n"} geaendert.
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-[1fr_auto] lg:min-w-[520px]">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Suche nach Name, SKU, EAN, Kategorie, Typ ..."
            className="min-h-12 rounded-2xl border border-[#D8C8B8] bg-white px-4 text-sm font-bold text-[#102A43] outline-none transition focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
          />

          <button
            type="button"
            onClick={() => setOnlyChanged((current) => !current)}
            className={
              "min-h-12 rounded-2xl border px-4 text-sm font-black transition " +
              (onlyChanged
                ? "border-[#B5282D] bg-[#B5282D] text-white"
                : "border-[#D8C8B8] bg-[#FBF7F0] text-[#102A43] hover:border-[#B5282D]")
            }
          >
            Nur geaenderte
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[2200px] border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-[#FBF7F0] text-[#102A43]">
            <tr className="border-b border-[#E8DED2]">
              <th className="w-24 px-3 py-3 font-black">Bild</th>
              <th className="w-20 px-3 py-3 font-black">Aktiv</th>
              <th className="w-72 px-3 py-3 font-black">Produktname</th>
              <th className="w-44 px-3 py-3 font-black">SKU</th>
              <th className="w-40 px-3 py-3 font-black">EAN</th>
              <th className="w-28 px-3 py-3 font-black">Preis</th>
              <th className="w-56 px-3 py-3 font-black">Kategorie</th>
              <th className="w-44 px-3 py-3 font-black">Typ</th>
              <th className="w-28 px-3 py-3 font-black">Format</th>
              <th className="w-32 px-3 py-3 font-black">Farbe</th>
              <th className="w-28 px-3 py-3 font-black">Lineatur</th>
              <th className="w-24 px-3 py-3 font-black">Breite</th>
              <th className="w-24 px-3 py-3 font-black">Hoehe</th>
              <th className="w-72 px-3 py-3 font-black">Massnotiz</th>
              <th className="w-28 px-3 py-3 font-black">Bestand</th>
              <th className="w-40 px-3 py-3 font-black">Lagerort</th>
              <th className="w-44 px-3 py-3 font-black">Lieferant</th>
              <th className="w-80 px-3 py-3 font-black">Bild-URL</th>
              <th className="w-32 px-3 py-3 font-black">Geaendert</th>
              <th className="w-44 px-3 py-3 font-black">Aktion</th>
            </tr>
          </thead>

          <tbody>
            {filteredRows.map((row) => {
              const dirty = isDirty(row);
              const saveState =
                saveStates[row.id] || ({
                  type: "idle",
                  message: "",
                } satisfies SaveState);

              return (
                <tr
                  key={row.id}
                  className={
                    "border-b border-[#E8DED2] align-top " +
                    (dirty ? "bg-[#FFF8EE]" : "bg-white")
                  }
                >
                  <td className="px-3 py-3">
                    <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-[#E8DED2] bg-[#FBF7F0]">
                      {row.imageUrl ? (
                        <img
                          src={row.imageUrl}
                          alt={row.productName || "Produkt"}
                          className="h-full w-full object-contain p-1"
                        />
                      ) : (
                        <span className="text-[10px] font-black text-[#A75B28]">
                          kein Bild
                        </span>
                      )}
                    </div>
                  </td>

                  <td className="px-3 py-3">
                    <label className="flex min-h-10 items-center gap-2 rounded-xl border border-[#D8C8B8] bg-white px-3 text-xs font-black text-[#102A43]">
                      <input
                        type="checkbox"
                        checked={row.active}
                        onChange={(event) =>
                          updateRow(row.id, "active", event.target.checked)
                        }
                      />
                      aktiv
                    </label>
                  </td>

                  <td className="px-3 py-3">
                    <textarea
                      value={row.productName}
                      onChange={(event) =>
                        updateRow(row.id, "productName", event.target.value)
                      }
                      className={textareaClass}
                    />
                  </td>

                  <td className="px-3 py-3">
                    <input
                      value={row.productSku}
                      onChange={(event) =>
                        updateRow(row.id, "productSku", event.target.value)
                      }
                      className={inputClass}
                    />
                  </td>

                  <td className="px-3 py-3">
                    <input
                      value={row.ean}
                      onChange={(event) =>
                        updateRow(row.id, "ean", event.target.value.replace(/[^\d]/g, ""))
                      }
                      className={inputClass}
                    />
                  </td>

                  <td className="px-3 py-3">
                    <input
                      value={row.productPrice}
                      onChange={(event) =>
                        updateRow(row.id, "productPrice", event.target.value)
                      }
                      inputMode="decimal"
                      className={inputClass}
                    />
                  </td>

                  <td className="px-3 py-3">
                    <select
                      value={row.category}
                      onChange={(event) =>
                        updateRow(row.id, "category", event.target.value)
                      }
                      className={inputClass}
                    >
                      <option value="">Kategorie auswaehlen</option>
                      {PRODUCT_CATEGORY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.label}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </td>

                  <td className="px-3 py-3">
                    <input
                      value={row.productType}
                      onChange={(event) =>
                        updateRow(row.id, "productType", event.target.value)
                      }
                      className={inputClass}
                    />
                  </td>

                  <td className="px-3 py-3">
                    <input
                      value={row.format}
                      onChange={(event) =>
                        updateRow(row.id, "format", event.target.value)
                      }
                      className={inputClass}
                    />
                  </td>

                  <td className="px-3 py-3">
                    <input
                      value={row.color}
                      onChange={(event) =>
                        updateRow(row.id, "color", event.target.value)
                      }
                      className={inputClass}
                    />
                  </td>

                  <td className="px-3 py-3">
                    <input
                      value={row.lineature}
                      onChange={(event) =>
                        updateRow(row.id, "lineature", event.target.value)
                      }
                      className={inputClass}
                    />
                  </td>

                  <td className="px-3 py-3">
                    <input
                      value={row.bookWidthMm}
                      onChange={(event) =>
                        updateRow(row.id, "bookWidthMm", event.target.value.replace(/[^\d]/g, ""))
                      }
                      inputMode="numeric"
                      className={inputClass}
                    />
                  </td>

                  <td className="px-3 py-3">
                    <input
                      value={row.bookHeightMm}
                      onChange={(event) =>
                        updateRow(row.id, "bookHeightMm", event.target.value.replace(/[^\d]/g, ""))
                      }
                      inputMode="numeric"
                      className={inputClass}
                    />
                  </td>

                  <td className="px-3 py-3">
                    <textarea
                      value={row.bookSizeNote}
                      onChange={(event) =>
                        updateRow(row.id, "bookSizeNote", event.target.value)
                      }
                      className={textareaClass}
                    />
                  </td>

                  <td className="px-3 py-3">
                    <input
                      value={row.stockQuantity}
                      onChange={(event) =>
                        updateRow(row.id, "stockQuantity", event.target.value)
                      }
                      inputMode="numeric"
                      className={inputClass}
                    />
                  </td>

                  <td className="px-3 py-3">
                    <input
                      value={row.storageLocation}
                      onChange={(event) =>
                        updateRow(row.id, "storageLocation", event.target.value)
                      }
                      className={inputClass}
                    />
                  </td>

                  <td className="px-3 py-3">
                    <input
                      value={row.supplierName}
                      onChange={(event) =>
                        updateRow(row.id, "supplierName", event.target.value)
                      }
                      className={inputClass}
                    />
                  </td>

                  <td className="px-3 py-3">
                    <textarea
                      value={row.imageUrl}
                      onChange={(event) =>
                        updateRow(row.id, "imageUrl", event.target.value)
                      }
                      className={textareaClass}
                    />
                  </td>

                  <td className="px-3 py-3 text-xs font-bold text-[#52616F]">
                    {formatDate(row.updatedAt)}
                  </td>

                  <td className="px-3 py-3">
                    <div className="grid gap-2">
                      <button
                        type="button"
                        disabled={!dirty || saveState.type === "saving"}
                        onClick={() => saveRow(row)}
                        className="min-h-10 rounded-xl bg-[#12395F] px-3 text-xs font-black text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {saveState.type === "saving" ? "Speichert ..." : "Speichern"}
                      </button>

                      {dirty ? (
                        <button
                          type="button"
                          onClick={() => resetRow(row)}
                          className="min-h-9 rounded-xl border border-[#D8C8B8] bg-white px-3 text-xs font-black text-[#102A43] transition hover:border-[#B5282D]"
                        >
                          Zuruecksetzen
                        </button>
                      ) : null}

                      <Link
                        href={"/admin/produkte/" + row.id}
                        className="min-h-9 rounded-xl border border-[#D8C8B8] bg-[#FBF7F0] px-3 py-2 text-center text-xs font-black text-[#102A43] transition hover:border-[#B5282D]"
                      >
                        Oeffnen
                      </Link>

                      {saveState.message ? (
                        <p
                          className={
                            "rounded-xl px-2 py-2 text-[11px] font-bold " +
                            (saveState.type === "error"
                              ? "bg-[#FFF1F1] text-[#B5282D]"
                              : saveState.type === "success"
                                ? "bg-[#F0FFF6] text-[#2F7D50]"
                                : "bg-[#FBF7F0] text-[#52616F]")
                          }
                        >
                          {saveState.message}
                        </p>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filteredRows.length === 0 ? (
        <div className="p-8 text-center text-sm font-bold text-[#52616F]">
          Keine Produkte fuer diese Suche.
        </div>
      ) : null}
    </div>
  );
}
