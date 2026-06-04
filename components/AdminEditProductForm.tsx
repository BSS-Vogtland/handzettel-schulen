"use client";

import { useRouter } from "next/navigation";
import { ChangeEvent, useEffect, useState } from "react";
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ImagePlus,
  Loader2,
  Pencil,
  Save,
  Wand2,
  X,
} from "lucide-react";

type AdminEditProductFormProps = {
  productId: string;
  productName: string;
  productSku: string | null;
  ean: string | null;
  productPrice: number;
  category: string | null;
  productType: string | null;
  format: string | null;
  color: string | null;
  lineature: string | null;
  bookWidthMm: string | null;
  bookHeightMm: string | null;
  bookSizeNote: string | null;
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

function normalizeOptionalIntegerInput(value: string) {
  const cleaned = String(value || "").replace(/[^\d]/g, "");

  if (!cleaned) {
    return "";
  }

  return cleaned;
}

export default function AdminEditProductForm({
  productId,
  productName,
  productSku,
  ean,
  productPrice,
  category,
  productType,
  format,
  color,
  lineature,
  bookWidthMm,
  bookHeightMm,
  bookSizeNote,
  imageUrl,
  active,
  aliases,
}: AdminEditProductFormProps) {
  const router = useRouter();

  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isStyling, setIsStyling] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState>(null);

  const [productImage, setProductImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    productName,
    productSku: productSku || "",
    ean: ean || "",
    productPrice: formatPriceInput(productPrice),
    category: category || "",
    productType: productType || "",
    format: format || "",
    color: color || "",
    lineature: lineature || "",
    bookWidthMm: bookWidthMm || "",
    bookHeightMm: bookHeightMm || "",
    bookSizeNote: bookSizeNote || "",
    imageUrl: imageUrl || "",
    active,
    aliases: aliases.join(", "),
  });

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

  function updateField(field: keyof typeof formData, value: string | boolean) {
    setFormData((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function updateBookWidth(value: string) {
    updateField("bookWidthMm", normalizeOptionalIntegerInput(value));
  }

  function updateBookHeight(value: string) {
    updateField("bookHeightMm", normalizeOptionalIntegerInput(value));
  }

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null;

    setFeedback(null);

    if (!file) {
      setProductImage(null);
      return;
    }

    if (!file.type.startsWith("image/")) {
      setFeedback({
        type: "error",
        message: "Bitte wähle eine Bilddatei aus.",
      });
      event.target.value = "";
      return;
    }

    const maxSize = 8 * 1024 * 1024;

    if (file.size > maxSize) {
      setFeedback({
        type: "error",
        message: "Das Produktbild darf maximal 8 MB groß sein.",
      });
      event.target.value = "";
      return;
    }

    setProductImage(file);
  }

  function removeSelectedImage() {
    setProductImage(null);
    setPreviewUrl(null);

    const input = document.getElementById(
      `product-image-${productId}`
    ) as HTMLInputElement | null;

    if (input) {
      input.value = "";
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSaving || isStyling) return;

    if (!formData.productName.trim()) {
      setFeedback({
        type: "error",
        message: "Bitte gib einen Produktnamen ein.",
      });
      return;
    }

    const width = formData.bookWidthMm.trim();
    const height = formData.bookHeightMm.trim();

    if ((width && !height) || (!width && height)) {
      setFeedback({
        type: "error",
        message:
          "Bitte gib beim Buchmaß entweder Breite und Höhe an oder lasse beide Felder leer.",
      });
      return;
    }

    try {
      setIsSaving(true);
      setFeedback(null);

      const submitData = new FormData();

      submitData.append("productName", formData.productName);
      submitData.append("productSku", formData.productSku);
      submitData.append("ean", formData.ean);
      submitData.append("productPrice", formData.productPrice);
      submitData.append("category", formData.category);
      submitData.append("productType", formData.productType);
      submitData.append("format", formData.format);
      submitData.append("color", formData.color);
      submitData.append("lineature", formData.lineature);
      submitData.append("bookWidthMm", formData.bookWidthMm);
      submitData.append("bookHeightMm", formData.bookHeightMm);
      submitData.append("bookSizeNote", formData.bookSizeNote);
      submitData.append("imageUrl", formData.imageUrl);
      submitData.append("active", String(formData.active));
      submitData.append("aliases", formData.aliases);

      if (productImage) {
        submitData.append("productImage", productImage);
      }

      const response = await fetch(`/api/admin/products/${productId}`, {
        method: "PATCH",
        body: submitData,
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

      if (payload?.imageUrl) {
        setFormData((current) => ({
          ...current,
          imageUrl: payload.imageUrl,
        }));
      }

      setProductImage(null);
      setPreviewUrl(null);

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

  async function handleStyleImage() {
    if (isSaving || isStyling) return;

    try {
      setIsStyling(true);
      setFeedback({
        type: "success",
        message:
          "KI-Hintergrund wird erzeugt. Das kann je nach Bild einige Sekunden dauern.",
      });

      const response = await fetch(
        `/api/admin/products/${productId}/style-image`,
        {
          method: "POST",
        }
      );

      const payload = await readJsonSafely(response);

      if (!response.ok || payload?.ok === false) {
        setFeedback({
          type: "error",
          message:
            payload?.message ||
            "Der KI-Hintergrund konnte nicht erzeugt werden.",
        });
        setIsStyling(false);
        return;
      }

      setFeedback({
        type: "success",
        message:
          payload?.message ||
          "KI-Hintergrund wurde erzeugt und gespeichert.",
      });

      setIsStyling(false);
      router.refresh();
    } catch (error) {
      setFeedback({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Der KI-Hintergrund konnte nicht erzeugt werden.",
      });
      setIsStyling(false);
    }
  }

  const visibleImageUrl = previewUrl || formData.imageUrl || null;

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
                onChange={(event) =>
                  updateField("productSku", event.target.value)
                }
                placeholder="Wird automatisch erzeugt, wenn leer"
                className="min-h-11 w-full rounded-2xl border border-[#D8C8B8] bg-[#FBF7F0] px-3 text-sm font-bold outline-none transition focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
              />
              <span className="mt-1 block text-xs font-semibold text-[#52616F]">
                Leer lassen, wenn das System beim Speichern automatisch eine sprechende Art.-Nr. erzeugen soll.
              </span>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-black uppercase tracking-[0.12em] text-[#A75B28]">
                EAN
              </span>
              <input
                value={formData.ean}
                onChange={(event) => updateField("ean", event.target.value)}
                inputMode="numeric"
                placeholder="Optional: Barcode / EAN"
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

          <section className="rounded-[24px] border border-[#D6E7EF] bg-[#F5FAFD] p-4">
            <div className="mb-3">
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-[#12395F]">
                Optional
              </div>

              <h3 className="font-black text-[#102A43]">
                Buchmaße für passende Umschläge
              </h3>

              <p className="mt-1 text-xs font-semibold leading-5 text-[#52616F]">
                Breite und Höhe in Millimetern. Beispiel: 230 x 440 mm.
                Diese Werte werden später für das automatische Umschlag-Matching
                genutzt.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-[1fr_1fr_2fr]">
              <label className="block">
                <span className="mb-1 block text-xs font-black uppercase tracking-[0.12em] text-[#12395F]">
                  Breite mm
                </span>
                <input
                  value={formData.bookWidthMm}
                  onChange={(event) => updateBookWidth(event.target.value)}
                  inputMode="numeric"
                  placeholder="z. B. 230"
                  className="min-h-11 w-full rounded-2xl border border-[#D8C8B8] bg-white px-3 text-sm font-bold outline-none transition focus:border-[#12395F] focus:ring-4 focus:ring-[#12395F]/10"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-black uppercase tracking-[0.12em] text-[#12395F]">
                  Höhe mm
                </span>
                <input
                  value={formData.bookHeightMm}
                  onChange={(event) => updateBookHeight(event.target.value)}
                  inputMode="numeric"
                  placeholder="z. B. 440"
                  className="min-h-11 w-full rounded-2xl border border-[#D8C8B8] bg-white px-3 text-sm font-bold outline-none transition focus:border-[#12395F] focus:ring-4 focus:ring-[#12395F]/10"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-black uppercase tracking-[0.12em] text-[#12395F]">
                  Hinweis
                </span>
                <input
                  value={formData.bookSizeNote}
                  onChange={(event) =>
                    updateField("bookSizeNote", event.target.value)
                  }
                  placeholder="z. B. passend für großes Arbeitsbuch"
                  className="min-h-11 w-full rounded-2xl border border-[#D8C8B8] bg-white px-3 text-sm font-bold outline-none transition focus:border-[#12395F] focus:ring-4 focus:ring-[#12395F]/10"
                />
              </label>
            </div>

            {formData.bookWidthMm && formData.bookHeightMm ? (
              <div className="mt-3 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-[#12395F]">
                Erfasstes Buchmaß: {formData.bookWidthMm} x{" "}
                {formData.bookHeightMm} mm
              </div>
            ) : null}
          </section>

          <section className="rounded-[24px] border border-[#E8DED2] bg-[#FBF7F0] p-4">
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-[#A75B28]">
                  <ImagePlus className="h-3.5 w-3.5" />
                  Produktbild
                </div>

                <h3 className="font-black text-[#102A43]">
                  Bild nachträglich ändern
                </h3>

                <p className="mt-1 text-xs font-semibold leading-5 text-[#52616F]">
                  Am Handy kannst Du direkt die Kamera öffnen und das Produktfoto
                  sofort speichern.
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:items-end">
                <label
                  htmlFor={`product-image-${productId}`}
                  className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-[#12395F] px-4 py-2 text-xs font-black text-white transition hover:brightness-110"
                >
                  <Camera className="h-3.5 w-3.5" />
                  Foto aufnehmen / hochladen
                </label>

                <button
                  type="button"
                  onClick={handleStyleImage}
                  disabled={isSaving || isStyling || !formData.imageUrl}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl bg-[#B5282D] px-4 py-2 text-xs font-black text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isStyling ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      KI-Hintergrund läuft...
                    </>
                  ) : (
                    <>
                      <Wand2 className="h-3.5 w-3.5" />
                      KI-Hintergrund neu erzeugen
                    </>
                  )}
                </button>
              </div>

              <input
                id={`product-image-${productId}`}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleImageChange}
                className="hidden"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-[160px_1fr] md:items-start">
              <div className="overflow-hidden rounded-2xl border border-[#E8DED2] bg-white">
                {visibleImageUrl ? (
                  <div className="relative">
                    <img
                      src={visibleImageUrl}
                      alt={formData.productName || "Produktbild"}
                      className="h-40 w-full object-contain p-2"
                    />

                    {productImage ? (
                      <button
                        type="button"
                        onClick={removeSelectedImage}
                        className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white text-[#B5282D] shadow-sm"
                        aria-label="Ausgewähltes Bild entfernen"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <div className="flex h-40 flex-col items-center justify-center p-4 text-center text-[#A75B28]">
                    <ImagePlus className="h-7 w-7" />
                    <p className="mt-2 text-xs font-black">Noch kein Bild</p>
                  </div>
                )}
              </div>

              <div>
                <label className="block">
                  <span className="mb-1 block text-xs font-black uppercase tracking-[0.12em] text-[#A75B28]">
                    Bild-URL
                  </span>
                  <input
                    value={formData.imageUrl}
                    onChange={(event) =>
                      updateField("imageUrl", event.target.value)
                    }
                    placeholder="Optional: Produktbild-URL"
                    className="min-h-11 w-full rounded-2xl border border-[#D8C8B8] bg-white px-3 text-sm font-bold outline-none transition focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
                  />
                </label>

                <p className="mt-2 text-xs font-semibold leading-5 text-[#52616F]">
                  Wenn Du ein neues Foto auswählst, wird es beim Speichern
                  hochgeladen und ersetzt die aktuelle Bild-URL automatisch.
                  Der KI-Hintergrund wird separat erzeugt und kann danach
                  jederzeit neu angestoßen werden.
                </p>
              </div>
            </div>
          </section>

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
            disabled={isSaving || isStyling}
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