"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Pencil,
  Save,
} from "lucide-react";

type AdminEditProductFormProps = {
  productId: string;
  productName: string;
  productSku: string | null;
  productPrice: number;
  category: string | null;
  productType: string | null;
  format: string | null;
  color: string | null;
  lineature: string | null;
  imageUrl: string | null;
  active: boolean;
  aliases: string[];
};

type FeedbackState =
  | {
      type: "success" | "error";
      message: string;
    }
  | null;

async function readJsonSafely(response: Response) {
  const rawText = await response.text();

  try {
    return rawText ? JSON.parse(rawText) : null;
  } catch {
    return null;
  }
}

function formatPriceInput(value: number) {
  if (!Number.isFinite(value)) return "";

  return String(value).replace(".", ",");
}

export default function AdminEditProductForm({
  productId,
  productName,
  productSku,
  productPrice,
  category,
  productType,
  format,
  color,
  lineature,
  imageUrl,
  active,
  aliases,
}: AdminEditProductFormProps) {
  const router = useRouter();

  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState>(null);

  const [formData, setFormData] = useState({
    productName,
    productSku: productSku || "",
    productPrice: formatPriceInput(productPrice),
    category: category || "",
    productType: productType || "",
    format: format || "",
    color: color || "",
    lineature: lineature || "",
    imageUrl: imageUrl || "",
    active,
    aliases: aliases.join(", "),
  });

  function updateField(field: keyof typeof formData, value: string | boolean) {
    setFormData((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSaving) return;

    if (!formData.productName.trim()) {
      setFeedback({
        type: "error",
        message: "Bitte gib einen Produktnamen ein.",
      });
      return;
    }

    try {
      setIsSaving(true);
      setFeedback(null);

      const response = await fetch(`/api/admin/products/${productId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          productName: formData.productName,
          productSku: formData.productSku,
          productPrice: formData.productPrice,
          category: formData.category,
          productType: formData.productType,
          format: formData.format,
          color: formData.color,
          lineature: formData.lineature,
          imageUrl: formData.imageUrl,
          active: formData.active,
          aliases: formData.aliases,
        }),
      });

      const payload = await readJsonSafely(response);

      if (!response.ok || payload?.ok === false) {
        setFeedback({
          type: "error",
          message:
            payload?.message || "Das Produkt konnte nicht gespeichert werden.",
        });
        setIsSaving(false);
        return;
      }

      setFeedback({
        type: "success",
        message: payload?.message || "Produkt wurde gespeichert.",
      });

      setIsSaving(false);
      router.refresh();
    } catch (error) {
      setFeedback({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Beim Speichern ist ein unerwarteter Fehler aufgetreten.",
      });
      setIsSaving(false);
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
          <Pencil className="h-4 w-4" />
          Produkt bearbeiten
        </span>

        {isOpen ? (
          <ChevronUp className="h-4 w-4 text-[#52616F]" />
        ) : (
          <ChevronDown className="h-4 w-4 text-[#52616F]" />
        )}
      </button>

      {isOpen ? (
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
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

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-black uppercase tracking-[0.12em] text-[#A75B28]">
                Produktname
              </span>
              <input
                value={formData.productName}
                onChange={(event) =>
                  updateField("productName", event.target.value)
                }
                className="min-h-11 w-full rounded-2xl border border-[#D8C8B8] bg-[#FBF7F0] px-3 text-sm font-bold outline-none transition focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-black uppercase tracking-[0.12em] text-[#A75B28]">
                Art.-Nr.
              </span>
              <input
                value={formData.productSku}
                onChange={(event) => updateField("productSku", event.target.value)}
                className="min-h-11 w-full rounded-2xl border border-[#D8C8B8] bg-[#FBF7F0] px-3 text-sm font-bold outline-none transition focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-black uppercase tracking-[0.12em] text-[#A75B28]">
                Preis
              </span>
              <input
                value={formData.productPrice}
                onChange={(event) =>
                  updateField("productPrice", event.target.value)
                }
                className="min-h-11 w-full rounded-2xl border border-[#D8C8B8] bg-[#FBF7F0] px-3 text-sm font-bold outline-none transition focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-black uppercase tracking-[0.12em] text-[#A75B28]">
                Kategorie
              </span>
              <input
                value={formData.category}
                onChange={(event) => updateField("category", event.target.value)}
                className="min-h-11 w-full rounded-2xl border border-[#D8C8B8] bg-[#FBF7F0] px-3 text-sm font-bold outline-none transition focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-black uppercase tracking-[0.12em] text-[#A75B28]">
                Typ
              </span>
              <input
                value={formData.productType}
                onChange={(event) =>
                  updateField("productType", event.target.value)
                }
                className="min-h-11 w-full rounded-2xl border border-[#D8C8B8] bg-[#FBF7F0] px-3 text-sm font-bold outline-none transition focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-black uppercase tracking-[0.12em] text-[#A75B28]">
                Format
              </span>
              <input
                value={formData.format}
                onChange={(event) => updateField("format", event.target.value)}
                className="min-h-11 w-full rounded-2xl border border-[#D8C8B8] bg-[#FBF7F0] px-3 text-sm font-bold outline-none transition focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-black uppercase tracking-[0.12em] text-[#A75B28]">
                Farbe
              </span>
              <input
                value={formData.color}
                onChange={(event) => updateField("color", event.target.value)}
                className="min-h-11 w-full rounded-2xl border border-[#D8C8B8] bg-[#FBF7F0] px-3 text-sm font-bold outline-none transition focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-black uppercase tracking-[0.12em] text-[#A75B28]">
                Lineatur
              </span>
              <input
                value={formData.lineature}
                onChange={(event) =>
                  updateField("lineature", event.target.value)
                }
                className="min-h-11 w-full rounded-2xl border border-[#D8C8B8] bg-[#FBF7F0] px-3 text-sm font-bold outline-none transition focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-black uppercase tracking-[0.12em] text-[#A75B28]">
              Bild-URL
            </span>
            <input
              value={formData.imageUrl}
              onChange={(event) => updateField("imageUrl", event.target.value)}
              placeholder="Optional: Produktbild-URL"
              className="min-h-11 w-full rounded-2xl border border-[#D8C8B8] bg-[#FBF7F0] px-3 text-sm font-bold outline-none transition focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-black uppercase tracking-[0.12em] text-[#A75B28]">
              Aliase / Suchbegriffe
            </span>
            <textarea
              value={formData.aliases}
              onChange={(event) => updateField("aliases", event.target.value)}
              rows={4}
              className="w-full rounded-2xl border border-[#D8C8B8] bg-[#FBF7F0] px-3 py-3 text-sm font-bold outline-none transition focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
            />
            <span className="mt-1 block text-xs font-semibold text-[#52616F]">
              Mehrere Suchbegriffe kannst Du mit Komma, Semikolon oder neuer
              Zeile trennen.
            </span>
          </label>

          <label className="flex items-center gap-3 rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] px-4 py-3">
            <input
              type="checkbox"
              checked={formData.active}
              onChange={(event) => updateField("active", event.target.checked)}
              className="h-4 w-4"
            />
            <span className="text-sm font-black text-[#102A43]">
              Produkt ist aktiv und darf im Matching erscheinen
            </span>
          </label>

          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#B5282D] px-4 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Wird gespeichert...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Änderungen speichern
              </>
            )}
          </button>
        </form>
      ) : null}
    </div>
  );
}