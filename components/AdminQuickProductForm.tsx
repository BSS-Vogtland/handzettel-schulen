"use client";

import { useRouter } from "next/navigation";
import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import {
  CheckCircle2,
  ImagePlus,
  Loader2,
  PackagePlus,
  RotateCcw,
  X,
} from "lucide-react";

type QuickCreateResponse = {
  ok?: boolean;
  existing?: boolean;
  message?: string;
  aliasCount?: number;
  product?: {
    id: string;
    productName: string;
    productSku: string | null;
    productPrice: number;
    imageUrl?: string | null;
  };
};

export default function AdminQuickProductForm() {
  const router = useRouter();

  const [productName, setProductName] = useState("");
  const [productSku, setProductSku] = useState("");
  const [productPrice, setProductPrice] = useState("");
  const [category, setCategory] = useState("");
  const [productType, setProductType] = useState("");
  const [format, setFormat] = useState("");
  const [color, setColor] = useState("");
  const [lineature, setLineature] = useState("");
  const [aliases, setAliases] = useState("");

  const [productImage, setProductImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!productImage) {
      setPreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(productImage);
    setPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [productImage]);

  function resetForm() {
    setProductName("");
    setProductSku("");
    setProductPrice("");
    setCategory("");
    setProductType("");
    setFormat("");
    setColor("");
    setLineature("");
    setAliases("");
    setProductImage(null);
    setPreviewUrl(null);
    setFeedback(null);
    setErrorMessage(null);
  }

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null;

    setFeedback(null);
    setErrorMessage(null);

    if (!file) {
      setProductImage(null);
      return;
    }

    if (!file.type.startsWith("image/")) {
      setErrorMessage("Bitte wähle eine Bilddatei aus.");
      event.target.value = "";
      return;
    }

    const maxSize = 5 * 1024 * 1024;

    if (file.size > maxSize) {
      setErrorMessage("Das Produktbild darf maximal 5 MB groß sein.");
      event.target.value = "";
      return;
    }

    setProductImage(file);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSaving) return;

    setFeedback(null);
    setErrorMessage(null);

    if (!productName.trim()) {
      setErrorMessage("Bitte gib einen Produktnamen ein.");
      return;
    }

    setIsSaving(true);

    try {
      const formData = new FormData();

      formData.append("productName", productName.trim());
      formData.append("productSku", productSku.trim());
      formData.append("productPrice", productPrice.trim());
      formData.append("category", category.trim());
      formData.append("productType", productType.trim());
      formData.append("format", format.trim());
      formData.append("color", color.trim());
      formData.append("lineature", lineature.trim());
      formData.append("aliases", aliases.trim());

      if (productImage) {
        formData.append("productImage", productImage);
      }

      const response = await fetch("/api/admin/products/quick-create", {
        method: "POST",
        body: formData,
      });

      const rawText = await response.text();

      let payload: QuickCreateResponse | null = null;

      try {
        payload = rawText ? JSON.parse(rawText) : null;
      } catch {
        throw new Error(
          "Die Produkt-Route hat keine JSON-Antwort geliefert. Prüfe bitte zusätzlich das Terminal."
        );
      }

      if (!response.ok || !payload?.ok) {
        throw new Error(
          payload?.message || "Produkt konnte nicht gespeichert werden."
        );
      }

      setFeedback(payload.message || "Produkt wurde gespeichert.");
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Produkt konnte nicht gespeichert werden."
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-[32px] border border-[#E8DED2] bg-white p-5 shadow-sm sm:p-7"
    >
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-[#FBF7F0] px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
            <PackagePlus className="h-3.5 w-3.5" />
            Produkt-Schnellerfassung
          </div>

          <h2 className="text-2xl font-black text-[#102A43]">
            Neues Produkt erfassen
          </h2>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#52616F]">
            Lege Produkte inklusive Bild schnell an. Suchbegriffe werden direkt
            gespeichert, damit spätere Schulmateriallisten bessere Vorschläge
            erhalten.
          </p>
        </div>

        <button
          type="button"
          onClick={resetForm}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#FBF7F0] px-4 py-3 text-sm font-black text-[#12395F] transition hover:bg-[#EEF4FA]"
        >
          <RotateCcw className="h-4 w-4" />
          Felder leeren
        </button>
      </div>

      <div className="grid gap-4">
        <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
          <div>
            <label className="mb-2 block text-sm font-black text-[#102A43]">
              Produktname*
            </label>
            <input
              type="text"
              value={productName}
              onChange={(event) => setProductName(event.target.value)}
              placeholder="z. B. Umschlag A5 rot"
              className="min-h-12 w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 text-sm font-semibold text-[#102A43] outline-none transition placeholder:text-[#9AA7B2] focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
            />
          </div>

          <div className="rounded-[22px] border border-dashed border-[#D8C8B8] bg-[#FBF7F0] p-3">
            <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-[#A75B28]">
              <ImagePlus className="h-4 w-4" />
              Produktbild
            </div>

            {previewUrl ? (
              <div className="relative overflow-hidden rounded-2xl border border-[#E8DED2] bg-white">
                <img
                  src={previewUrl}
                  alt="Produktvorschau"
                  className="h-36 w-full object-contain p-2"
                />

                <button
                  type="button"
                  onClick={() => setProductImage(null)}
                  className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white text-[#B5282D] shadow-sm"
                  aria-label="Bild entfernen"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <label className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-2xl border border-[#E8DED2] bg-white px-4 py-5 text-center transition hover:border-[#12395F]">
                <ImagePlus className="mb-2 h-6 w-6 text-[#A75B28]" />
                <span className="text-sm font-black text-[#102A43]">
                  Bild auswählen
                </span>
                <span className="mt-1 text-xs font-semibold leading-5 text-[#52616F]">
                  JPG, PNG oder WEBP bis 5 MB
                </span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="hidden"
                />
              </label>
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-2 block text-sm font-black text-[#102A43]">
              Art.-Nr.
            </label>
            <input
              type="text"
              value={productSku}
              onChange={(event) => setProductSku(event.target.value)}
              placeholder="z. B. HS-UM-A5-ROT"
              className="min-h-12 w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 text-sm font-semibold text-[#102A43] outline-none transition placeholder:text-[#9AA7B2] focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-black text-[#102A43]">
              Preis
            </label>
            <input
              type="text"
              value={productPrice}
              onChange={(event) => setProductPrice(event.target.value)}
              placeholder="z. B. 0,29"
              className="min-h-12 w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 text-sm font-semibold text-[#102A43] outline-none transition placeholder:text-[#9AA7B2] focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-black text-[#102A43]">
              Kategorie
            </label>
            <input
              type="text"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              placeholder="z. B. Umschlag"
              className="min-h-12 w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 text-sm font-semibold text-[#102A43] outline-none transition placeholder:text-[#9AA7B2] focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-5">
          <div>
            <label className="mb-2 block text-sm font-black text-[#102A43]">
              Typ
            </label>
            <input
              type="text"
              value={productType}
              onChange={(event) => setProductType(event.target.value)}
              placeholder="umschlag"
              className="min-h-12 w-full rounded-2xl border border-[#D8C8B8] bg-white px-3 text-sm font-semibold text-[#102A43] outline-none transition placeholder:text-[#9AA7B2] focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-black text-[#102A43]">
              Format
            </label>
            <input
              type="text"
              value={format}
              onChange={(event) => setFormat(event.target.value)}
              placeholder="A5"
              className="min-h-12 w-full rounded-2xl border border-[#D8C8B8] bg-white px-3 text-sm font-semibold text-[#102A43] outline-none transition placeholder:text-[#9AA7B2] focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-black text-[#102A43]">
              Farbe
            </label>
            <input
              type="text"
              value={color}
              onChange={(event) => setColor(event.target.value)}
              placeholder="rot"
              className="min-h-12 w-full rounded-2xl border border-[#D8C8B8] bg-white px-3 text-sm font-semibold text-[#102A43] outline-none transition placeholder:text-[#9AA7B2] focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-black text-[#102A43]">
              Lineatur
            </label>
            <input
              type="text"
              value={lineature}
              onChange={(event) => setLineature(event.target.value)}
              placeholder="z. B. 1"
              className="min-h-12 w-full rounded-2xl border border-[#D8C8B8] bg-white px-3 text-sm font-semibold text-[#102A43] outline-none transition placeholder:text-[#9AA7B2] focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
            />
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-black text-[#102A43]">
            Aliase / Suchbegriffe
          </label>
          <textarea
            value={aliases}
            onChange={(event) => setAliases(event.target.value)}
            placeholder="z. B. Hefthülle A5 rot, Umschlag rot A5, Heftumschlag rot"
            rows={4}
            className="w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 py-3 text-sm font-semibold text-[#102A43] outline-none transition placeholder:text-[#9AA7B2] focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
          />
          <p className="mt-2 text-xs font-semibold text-[#52616F]">
            Mehrere Suchbegriffe kannst Du mit Komma, Semikolon oder neuer Zeile
            trennen.
          </p>
        </div>

        {feedback ? (
          <div className="flex items-start gap-2 rounded-2xl border border-[#BFE3CD] bg-[#F0FFF6] px-4 py-3 text-sm font-semibold text-[#2F7D50]">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{feedback}</span>
          </div>
        ) : null}

        {errorMessage ? (
          <div className="rounded-2xl border border-[#F0C7C7] bg-[#FFF5F5] px-4 py-3 text-sm font-semibold text-[#B5282D]">
            {errorMessage}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={isSaving}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#B5282D] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Produkt wird gespeichert …
            </>
          ) : (
            <>
              <PackagePlus className="h-4 w-4" />
              Produkt speichern
            </>
          )}
        </button>
      </div>
    </form>
  );
}