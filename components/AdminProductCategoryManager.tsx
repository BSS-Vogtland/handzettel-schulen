"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export type AdminProductCategoryRow = {
  id: string;
  value: string;
  label: string;
  keywords: string[];
  sortOrder: number;
  isActive: boolean;
  productCount: number;
  source?: "database" | "fallback";
};

type EditableCategoryRow = AdminProductCategoryRow & {
  keywordsText: string;
  replacementLabel: string;
};

type AdminProductCategoryManagerProps = {
  initialCategories: AdminProductCategoryRow[];
};

type StatusState = {
  type: "idle" | "saving" | "success" | "error";
  message: string;
};

function toEditable(row: AdminProductCategoryRow): EditableCategoryRow {
  return {
    ...row,
    keywordsText: row.keywords.join("\n"),
    replacementLabel: "",
  };
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
  "min-h-11 w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 text-sm font-bold text-[#102A43] outline-none transition focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10";

const textareaClass =
  "min-h-[96px] w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 py-3 text-sm font-bold text-[#102A43] outline-none transition focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10";

export default function AdminProductCategoryManager({
  initialCategories,
}: AdminProductCategoryManagerProps) {
  const router = useRouter();

  const [rows, setRows] = useState(initialCategories.map(toEditable));
  const [newLabel, setNewLabel] = useState("");
  const [newKeywords, setNewKeywords] = useState("");
  const [status, setStatus] = useState<StatusState>({
    type: "idle",
    message: "",
  });

  useEffect(() => {
    setRows(initialCategories.map(toEditable));
  }, [initialCategories]);

  const activeRows = useMemo(
    () => rows.filter((row) => row.isActive),
    [rows]
  );

  const hasFallbackRows = rows.some((row) => row.source === "fallback");

  function updateRow(
    id: string,
    field: keyof EditableCategoryRow,
    value: string | number | boolean
  ) {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, [field]: value } : row))
    );

    setStatus({
      type: "idle",
      message: "",
    });
  }

  async function createCategory() {
    const label = newLabel.trim();

    if (!label) {
      setStatus({
        type: "error",
        message: "Bitte gib einen Kategorienamen ein.",
      });
      return;
    }

    setStatus({
      type: "saving",
      message: "Kategorie wird angelegt ...",
    });

    try {
      const response = await fetch("/api/admin/product-categories", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({
          label,
          keywords: newKeywords,
          sortOrder: (rows.length + 1) * 10,
        }),
      });

      const payload = await readJson(response);

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message || "Kategorie konnte nicht angelegt werden.");
      }

      setNewLabel("");
      setNewKeywords("");

      setStatus({
        type: "success",
        message: "Kategorie wurde angelegt.",
      });

      router.refresh();
    } catch (error) {
      setStatus({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Kategorie konnte nicht angelegt werden.",
      });
    }
  }

  async function saveCategory(row: EditableCategoryRow) {
    if (row.source === "fallback") {
      setStatus({
        type: "error",
        message:
          "Die Datenbank-Tabelle fuer Kategorien fehlt noch. Bitte zuerst die SQL-Migration ausfuehren.",
      });
      return;
    }

    const label = row.label.trim();

    if (!label) {
      setStatus({
        type: "error",
        message: "Kategorie darf keinen leeren Namen haben.",
      });
      return;
    }

    setStatus({
      type: "saving",
      message: "Kategorie wird gespeichert ...",
    });

    try {
      const response = await fetch(
        "/api/admin/product-categories/" + encodeURIComponent(row.id),
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          cache: "no-store",
          body: JSON.stringify({
            label,
            keywords: row.keywordsText,
            sortOrder: row.sortOrder,
            isActive: row.isActive,
            updateProducts: true,
          }),
        }
      );

      const payload = await readJson(response);

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message || "Kategorie konnte nicht gespeichert werden.");
      }

      setStatus({
        type: "success",
        message: "Kategorie wurde gespeichert.",
      });

      router.refresh();
    } catch (error) {
      setStatus({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Kategorie konnte nicht gespeichert werden.",
      });
    }
  }

  async function deleteCategory(row: EditableCategoryRow) {
    if (row.source === "fallback") {
      setStatus({
        type: "error",
        message:
          "Die Datenbank-Tabelle fuer Kategorien fehlt noch. Bitte zuerst die SQL-Migration ausfuehren.",
      });
      return;
    }

    if (row.productCount > 0 && !row.replacementLabel) {
      setStatus({
        type: "error",
        message:
          "Diese Kategorie wird noch von Produkten genutzt. Bitte zuerst eine Zielkategorie fuer den Umzug waehlen.",
      });
      return;
    }

    const confirmed = window.confirm(
      row.productCount > 0
        ? "Kategorie loeschen und " +
            row.productCount +
            " Produkte nach \"" +
            row.replacementLabel +
            "\" umziehen?"
        : "Kategorie \"" + row.label + "\" wirklich loeschen?"
    );

    if (!confirmed) return;

    setStatus({
      type: "saving",
      message: "Kategorie wird geloescht ...",
    });

    try {
      const response = await fetch(
        "/api/admin/product-categories/" + encodeURIComponent(row.id),
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          cache: "no-store",
          body: JSON.stringify({
            replacementLabel: row.replacementLabel || null,
          }),
        }
      );

      const payload = await readJson(response);

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message || "Kategorie konnte nicht geloescht werden.");
      }

      setStatus({
        type: "success",
        message: "Kategorie wurde geloescht.",
      });

      router.refresh();
    } catch (error) {
      setStatus({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Kategorie konnte nicht geloescht werden.",
      });
    }
  }

  return (
    <div className="grid gap-5">
      {hasFallbackRows ? (
        <div className="rounded-[24px] border border-[#F4C7C7] bg-[#FFF1F1] p-4 text-sm font-bold leading-6 text-[#B5282D]">
          Die Seite zeigt aktuell nur die Fallback-Kategorien aus dem Code. Damit
          Hinzufuegen, Speichern und Loeschen funktionieren, muss die SQL-Migration
          fuer <code>school_product_categories</code> in Supabase ausgefuehrt sein.
        </div>
      ) : null}

      <section className="rounded-[28px] border border-[#E8DED2] bg-white p-5 shadow-sm">
        <h2 className="text-xl font-black text-[#102A43]">
          Neue Kategorie anlegen
        </h2>

        <div className="mt-4 grid gap-3 lg:grid-cols-[320px_1fr_auto] lg:items-start">
          <div>
            <label className="mb-2 block text-xs font-black uppercase tracking-[0.14em] text-[#A75B28]">
              Name
            </label>
            <input
              value={newLabel}
              onChange={(event) => setNewLabel(event.target.value)}
              placeholder="z. B. Papier & Zeichenpapier"
              className={inputClass}
            />
          </div>

          <div>
            <label className="mb-2 block text-xs font-black uppercase tracking-[0.14em] text-[#A75B28]">
              Keywords
            </label>
            <textarea
              value={newKeywords}
              onChange={(event) => setNewKeywords(event.target.value)}
              placeholder={"Ein Begriff pro Zeile, z. B.\nZeichenpapier\nTonpapier\nMillimeterpapier"}
              className={textareaClass}
            />
          </div>

          <button
            type="button"
            onClick={createCategory}
            disabled={status.type === "saving"}
            className="min-h-12 rounded-2xl bg-[#12395F] px-5 text-sm font-black text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 lg:mt-7"
          >
            Kategorie anlegen
          </button>
        </div>
      </section>

      {status.message ? (
        <div
          className={
            "rounded-[24px] border p-4 text-sm font-bold " +
            (status.type === "error"
              ? "border-[#F4C7C7] bg-[#FFF1F1] text-[#B5282D]"
              : "border-[#CDEBD8] bg-[#F0FFF6] text-[#2F7D50]")
          }
        >
          {status.message}
        </div>
      ) : null}

      <section className="overflow-hidden rounded-[28px] border border-[#E8DED2] bg-white shadow-sm">
        <div className="border-b border-[#E8DED2] p-5">
          <h2 className="text-xl font-black text-[#102A43]">
            Bestehende Kategorien
          </h2>
          <p className="mt-1 text-sm font-semibold text-[#52616F]">
            {rows.length} Kategorien, davon {activeRows.length} aktiv.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1350px] border-collapse text-left text-sm">
            <thead className="bg-[#FBF7F0] text-[#102A43]">
              <tr className="border-b border-[#E8DED2]">
                <th className="w-20 px-4 py-3 font-black">Aktiv</th>
                <th className="w-24 px-4 py-3 font-black">Sort.</th>
                <th className="w-72 px-4 py-3 font-black">Kategorie</th>
                <th className="w-96 px-4 py-3 font-black">Keywords</th>
                <th className="w-32 px-4 py-3 font-black">Produkte</th>
                <th className="w-72 px-4 py-3 font-black">Loeschen / Umziehen</th>
                <th className="w-44 px-4 py-3 font-black">Aktion</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((row) => {
                const replacementOptions = activeRows.filter(
                  (option) => option.id !== row.id
                );

                return (
                  <tr key={row.id} className="border-b border-[#E8DED2] align-top">
                    <td className="px-4 py-4">
                      <input
                        type="checkbox"
                        checked={row.isActive}
                        onChange={(event) =>
                          updateRow(row.id, "isActive", event.target.checked)
                        }
                        className="h-5 w-5"
                      />
                    </td>

                    <td className="px-4 py-4">
                      <input
                        value={String(row.sortOrder)}
                        onChange={(event) =>
                          updateRow(
                            row.id,
                            "sortOrder",
                            Number(event.target.value.replace(/[^\d]/g, "") || 0)
                          )
                        }
                        className={inputClass}
                      />
                    </td>

                    <td className="px-4 py-4">
                      <input
                        value={row.label}
                        onChange={(event) =>
                          updateRow(row.id, "label", event.target.value)
                        }
                        className={inputClass}
                      />
                      <p className="mt-2 text-xs font-bold text-[#52616F]">
                        ID: {row.value}
                      </p>
                    </td>

                    <td className="px-4 py-4">
                      <textarea
                        value={row.keywordsText}
                        onChange={(event) =>
                          updateRow(row.id, "keywordsText", event.target.value)
                        }
                        className={textareaClass}
                      />
                    </td>

                    <td className="px-4 py-4">
                      <span className="inline-flex rounded-full bg-[#FBF7F0] px-3 py-1 text-xs font-black text-[#102A43]">
                        {row.productCount} Produkte
                      </span>
                    </td>

                    <td className="px-4 py-4">
                      {row.productCount > 0 ? (
                        <select
                          value={row.replacementLabel}
                          onChange={(event) =>
                            updateRow(row.id, "replacementLabel", event.target.value)
                          }
                          className={inputClass}
                        >
                          <option value="">Zielkategorie waehlen</option>
                          {replacementOptions.map((option) => (
                            <option key={option.id} value={option.label}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <p className="rounded-2xl bg-[#FBF7F0] px-4 py-3 text-xs font-bold text-[#52616F]">
                          Wird nicht genutzt.
                        </p>
                      )}

                      <button
                        type="button"
                        onClick={() => deleteCategory(row)}
                        disabled={status.type === "saving"}
                        className="mt-2 min-h-10 w-full rounded-xl border border-[#F4C7C7] bg-[#FFF1F1] px-3 text-xs font-black text-[#B5282D] transition hover:bg-[#FFE4E4] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Loeschen
                      </button>
                    </td>

                    <td className="px-4 py-4">
                      <button
                        type="button"
                        onClick={() => saveCategory(row)}
                        disabled={status.type === "saving"}
                        className="min-h-10 w-full rounded-xl bg-[#12395F] px-3 text-xs font-black text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Speichern
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
