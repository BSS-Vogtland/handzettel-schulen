"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Trash2,
} from "lucide-react";

type AliasItem = {
  id: string;
  alias: string;
};

type FeedbackState =
  | {
      type: "success" | "error";
      message: string;
    }
  | null;

type AdminProductAliasManagerProps = {
  productId: string;
  productName: string;
  initialAliases: AliasItem[];
};

async function readJsonSafely(response: Response) {
  const rawText = await response.text();

  try {
    return rawText ? JSON.parse(rawText) : null;
  } catch {
    return null;
  }
}

export default function AdminProductAliasManager({
  productId,
  productName,
  initialAliases,
}: AdminProductAliasManagerProps) {
  const router = useRouter();

  const [isOpen, setIsOpen] = useState(false);
  const [aliases, setAliases] = useState(initialAliases);
  const [deletingAliasId, setDeletingAliasId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState>(null);

  async function handleDeleteAlias(aliasItem: AliasItem) {
    if (deletingAliasId) return;

    const confirmed = window.confirm(
      `Gespeicherte Zuordnung wirklich löschen?\n\n${aliasItem.alias}\n\nProdukt: ${productName}`
    );

    if (!confirmed) return;

    setDeletingAliasId(aliasItem.id);
    setFeedback(null);

    try {
      const response = await fetch(
        `/api/admin/products/${productId}/aliases/${aliasItem.id}`,
        {
          method: "DELETE",
          cache: "no-store",
        }
      );

      const payload = await readJsonSafely(response);

      if (!response.ok || !payload?.ok) {
        throw new Error(
          payload?.message || "Gespeicherte Zuordnung konnte nicht gelöscht werden."
        );
      }

      setAliases((current) =>
        current.filter((item) => item.id !== aliasItem.id)
      );

      setFeedback({
        type: "success",
        message:
          payload.message || "Gespeicherte Zuordnung wurde gelöscht.",
      });

      router.refresh();
    } catch (error) {
      setFeedback({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Gespeicherte Zuordnung konnte nicht gelöscht werden.",
      });
    } finally {
      setDeletingAliasId(null);
    }
  }

  return (
    <div className="mt-4 rounded-2xl border border-[#E8DED2] bg-white p-3">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="inline-flex items-center gap-2 text-sm font-black text-[#12395F]">
          Gespeicherte Zuordnungen
          <span className="rounded-full bg-[#FBF7F0] px-2 py-0.5 text-xs font-black text-[#A75B28]">
            {aliases.length}
          </span>
        </span>

        {isOpen ? (
          <ChevronUp className="h-4 w-4 text-[#52616F]" />
        ) : (
          <ChevronDown className="h-4 w-4 text-[#52616F]" />
        )}
      </button>

      {isOpen ? (
        <div className="mt-4 space-y-3">
          <p className="rounded-2xl border border-[#D6E7EF] bg-[#F5FAFD] px-4 py-3 text-xs font-semibold leading-5 text-[#12395F]">
            Hier löschst Du nur gespeicherte Alias-Zuordnungen für spätere
            Listen. Das Produkt selbst, Artikelnummer, Preis und Bild bleiben
            unverändert.
          </p>

          {feedback ? (
            <div
              className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${
                feedback.type === "success"
                  ? "border-[#BFE3CD] bg-[#F0FFF6] text-[#2F7D50]"
                  : "border-[#F1D1A8] bg-[#FFF8EE] text-[#A75B28]"
              }`}
            >
              <div className="flex items-start gap-2">
                {feedback.type === "success" ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                ) : (
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                )}
                <p>{feedback.message}</p>
              </div>
            </div>
          ) : null}

          {aliases.length > 0 ? (
            <div className="space-y-2">
              {aliases.map((aliasItem) => (
                <div
                  key={aliasItem.id}
                  className="flex flex-col gap-2 rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <p className="text-sm font-bold text-[#102A43]">
                    {aliasItem.alias}
                  </p>

                  <button
                    type="button"
                    onClick={() => handleDeleteAlias(aliasItem)}
                    disabled={Boolean(deletingAliasId)}
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl border border-[#F0C7C7] bg-white px-3 py-2 text-xs font-black text-[#B5282D] transition hover:bg-[#FFF5F5] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {deletingAliasId === aliasItem.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    Löschen
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-2xl border border-dashed border-[#D8C8B8] bg-[#FBF7F0] px-4 py-3 text-sm font-semibold text-[#52616F]">
              Keine gespeicherten Zuordnungen vorhanden.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
