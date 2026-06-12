"use client";

import { useRouter } from "next/navigation";
import { ChangeEvent, FormEvent, KeyboardEvent, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ImagePlus,
  Loader2,
  PackagePlus,
  RotateCcw,
  Sparkles,
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

type AliasInput = {
  productName: string;
  productSku: string;
  category: string;
  productType: string;
  format: string;
  color: string;
  lineature: string;
  bookWidthMm: string;
  bookHeightMm: string;
  bookSizeNote: string;
};

type InitialCopyProduct = {
  sourceProductName?: string | null;
  productName?: string | null;
  productPrice?: number | string | null;
  category?: string | null;
  productType?: string | null;
  format?: string | null;
  color?: string | null;
  lineature?: string | null;
  bookWidthMm?: string | null;
  bookHeightMm?: string | null;
  bookSizeNote?: string | null;
};

type AdminQuickProductFormProps = {
  initialCopyProduct?: InitialCopyProduct | null;
};

function cleanValue(value: unknown) {
  return String(value || "").trim();
}

function normalizeValue(value: unknown) {
  return cleanValue(value)
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/grün/g, "gruen")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueList(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const cleaned = cleanValue(value).replace(/\s+/g, " ");

    if (!cleaned) continue;

    const key = normalizeValue(cleaned);

    if (!key || seen.has(key)) continue;

    seen.add(key);
    result.push(cleaned);
  }

  return result;
}

function containsAny(text: string, words: string[]) {
  return words.some((word) => text.includes(word));
}

function normalizeOptionalIntegerInput(value: string) {
  const cleaned = cleanValue(value).replace(/[^\d]/g, "");

  if (!cleaned) {
    return "";
  }

  return cleaned;
}

function formatInitialPrice(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "";
    return String(value).replace(".", ",");
  }

  return String(value).trim().replace(".", ",");
}

function getBaseProductType(input: AliasInput) {
  const combined = normalizeValue(
    `${input.productName} ${input.category} ${input.productType}`
  );

  if (
    containsAny(combined, [
      "umschlag",
      "hefthuelle",
      "hefthuellen",
      "huelle",
      "huellen",
      "schutzumschlag",
      "buchumschlag",
      "buchhuelle",
      "buchhülle",
    ])
  ) {
    return "umschlag";
  }

  if (
    containsAny(combined, [
      "arbeitsheft",
      "arbeitsbuch",
      "buch",
      "schulbuch",
      "lehrbuch",
    ])
  ) {
    return "buch";
  }

  if (
    containsAny(combined, [
      "hausaufgabenheft",
      "hausaufgaben",
      "aufgabenheft",
    ])
  ) {
    return "hausaufgabenheft";
  }

  if (
    containsAny(combined, ["schulheft", "schreibheft", "heft"]) &&
    !containsAny(combined, ["umschlag", "huelle"])
  ) {
    return "heft";
  }

  if (containsAny(combined, ["schnellhefter", "hefter"])) {
    return "schnellhefter";
  }

  if (containsAny(combined, ["block", "collegeblock", "zeichenblock"])) {
    return "block";
  }

  if (containsAny(combined, ["mappe", "sammelmappe", "ordner"])) {
    return "mappe";
  }

  if (
    containsAny(combined, [
      "bleistift",
      "buntstift",
      "filzstift",
      "fineliner",
      "kugelschreiber",
      "fueller",
      "filler",
      "stift",
    ])
  ) {
    return "stift";
  }

  if (containsAny(combined, ["zirkel", "lineal", "geodreieck"])) {
    return "geometrie";
  }

  if (containsAny(combined, ["kleber", "klebestift", "schere"])) {
    return "basteln";
  }

  return cleanValue(input.productType || input.category || "");
}

function buildPart(...parts: Array<string | null | undefined>) {
  return parts.map(cleanValue).filter(Boolean).join(" ");
}

function getBookSizeLabel(input: AliasInput) {
  const width = cleanValue(input.bookWidthMm);
  const height = cleanValue(input.bookHeightMm);

  if (!width || !height) {
    return "";
  }

  return `${width} x ${height} mm`;
}

function generateRuleBasedAliases(input: AliasInput) {
  const productName = cleanValue(input.productName);
  const sku = cleanValue(input.productSku);
  const category = cleanValue(input.category);
  const productType = cleanValue(input.productType);
  const format = cleanValue(input.format).toUpperCase();
  const color = cleanValue(input.color).toLowerCase();
  const lineatureRaw = cleanValue(input.lineature);
  const lineature = lineatureRaw
    .replace(/^lineatur\s*/i, "")
    .replace(/^lin\.\s*/i, "")
    .trim();

  const bookWidth = cleanValue(input.bookWidthMm);
  const bookHeight = cleanValue(input.bookHeightMm);
  const bookSizeLabel = getBookSizeLabel(input);
  const bookSizeNote = cleanValue(input.bookSizeNote);

  const baseType = getBaseProductType(input);
  const aliases: string[] = [];

  if (productName) aliases.push(productName);
  if (sku) aliases.push(sku);

  if (category && productName) aliases.push(`${category} ${productName}`);
  if (productType && productName) aliases.push(`${productType} ${productName}`);

  if (bookSizeLabel) {
    aliases.push(
      buildPart(productName, bookSizeLabel),
      buildPart(productName, bookWidth, bookHeight),
      buildPart(bookSizeLabel, productName),
      buildPart(bookWidth, "x", bookHeight),
      buildPart(bookWidth, bookHeight),
      buildPart("Buchmaß", bookSizeLabel),
      buildPart("Buchmass", bookSizeLabel)
    );
  }

  if (bookSizeNote) {
    aliases.push(buildPart(productName, bookSizeNote));
  }

  if (baseType === "umschlag") {
    aliases.push(
      buildPart("Umschlag", format, color),
      buildPart("Heftumschlag", format, color),
      buildPart("Buchumschlag", format, color),
      buildPart("Buchhülle", format, color),
      buildPart("Hefthülle", format, color),
      buildPart("Heft Hülle", format, color),
      buildPart("Schutzumschlag", format, color),
      buildPart(format, "Umschlag", color),
      buildPart(color, "Umschlag", format)
    );

    if (bookSizeLabel) {
      aliases.push(
        buildPart("Umschlag", bookSizeLabel, color),
        buildPart("Buchumschlag", bookSizeLabel, color),
        buildPart("Buchhülle", bookSizeLabel, color),
        buildPart("Schutzumschlag", bookSizeLabel, color),
        buildPart("Umschlag", bookWidth, "x", bookHeight, color),
        buildPart("Buchumschlag", bookWidth, "x", bookHeight, color)
      );
    }
  }

  if (baseType === "buch") {
    aliases.push(
      buildPart("Buch", productName),
      buildPart("Schulbuch", productName),
      buildPart("Arbeitsbuch", productName),
      buildPart("Arbeitsheft", productName),
      buildPart("Buch", bookSizeLabel),
      buildPart("Schulbuch", bookSizeLabel),
      buildPart("Arbeitsheft", bookSizeLabel)
    );
  }

  if (baseType === "heft") {
    aliases.push(
      buildPart(
        "Schulheft",
        format,
        lineature ? `Lineatur ${lineature}` : "",
        color
      ),
      buildPart(
        "Schreibheft",
        format,
        lineature ? `Lineatur ${lineature}` : "",
        color
      ),
      buildPart("Heft", format, lineature ? `Lineatur ${lineature}` : "", color),
      buildPart("Heft", format, lineature, color),
      buildPart(
        format,
        "Heft",
        lineature ? `Lineatur ${lineature}` : "",
        color
      ),
      buildPart("Lineatur", lineature, format),
      buildPart("Lin", lineature, format),
      buildPart("L", lineature, format)
    );

    if (lineature === "8" || lineature.toLowerCase() === "8f") {
      aliases.push(
        buildPart("Schulheft", format, "Lineatur 8f", color),
        buildPart("Schulheft", format, "Lineatur 8", color),
        buildPart("Heft", format, "8f", color),
        buildPart("Heft", format, "8", color)
      );
    }

    if (lineature === "0") {
      aliases.push(
        buildPart("blanko Heft", format, color),
        buildPart("unliniertes Heft", format, color),
        buildPart("Heft ohne Lineatur", format, color),
        buildPart("Heft", format, "Lineatur 0", color)
      );
    }
  }

  if (baseType === "hausaufgabenheft") {
    aliases.push(
      buildPart("Hausaufgabenheft", format),
      buildPart("Hausaufgaben Heft", format),
      buildPart("Aufgabenheft", format),
      buildPart("Schülerkalender", format)
    );
  }

  if (baseType === "schnellhefter") {
    aliases.push(
      buildPart("Schnellhefter", format, color),
      buildPart("Hefter", format, color),
      buildPart("Plastik Schnellhefter", format, color),
      buildPart("Schnellhefter", color),
      buildPart("Hefter", color),
      buildPart("Mappe", color)
    );
  }

  if (baseType === "block") {
    aliases.push(
      buildPart("Block", format, lineature ? `Lineatur ${lineature}` : ""),
      buildPart("Schreibblock", format, lineature ? `Lineatur ${lineature}` : ""),
      buildPart("Collegeblock", format, lineature ? `Lineatur ${lineature}` : ""),
      buildPart("Notizblock", format),
      buildPart(format, "Block", lineature)
    );
  }

  if (baseType === "mappe") {
    aliases.push(
      buildPart("Mappe", format, color),
      buildPart("Sammelmappe", format, color),
      buildPart("Eckspanner", format, color),
      buildPart("Ordner", format, color)
    );
  }

  if (baseType === "stift") {
    aliases.push(
      buildPart("Stift", color),
      buildPart("Schreibstift", color),
      buildPart("Buntstift", color),
      buildPart("Filzstift", color),
      buildPart("Fineliner", color)
    );
  }

  if (baseType === "geometrie") {
    aliases.push(
      buildPart("Geometrie", productName),
      buildPart("Lineal", format),
      buildPart("Geodreieck"),
      buildPart("Zirkel")
    );
  }

  if (baseType === "basteln") {
    aliases.push(
      buildPart("Basteln", productName),
      buildPart("Kleber"),
      buildPart("Klebestift"),
      buildPart("Schere")
    );
  }

  aliases.push(
    buildPart(category, format, color),
    buildPart(productType, format, color),
    buildPart(productName, format),
    buildPart(productName, color),
    buildPart(productName, lineature ? `Lineatur ${lineature}` : ""),
    buildPart(productName, format, color),
    buildPart(
      productName,
      format,
      lineature ? `Lineatur ${lineature}` : "",
      color
    )
  );

  return uniqueList(aliases).slice(0, 36);
}

export default function AdminQuickProductForm({
  initialCopyProduct = null,
}: AdminQuickProductFormProps) {
  const router = useRouter();

  const [productName, setProductName] = useState("");
  const [productSku, setProductSku] = useState("");
  const [productPrice, setProductPrice] = useState("");
  const [category, setCategory] = useState("");
  const [productType, setProductType] = useState("");
  const [format, setFormat] = useState("");
  const [color, setColor] = useState("");
  const [lineature, setLineature] = useState("");
  const [bookWidthMm, setBookWidthMm] = useState("");
  const [bookHeightMm, setBookHeightMm] = useState("");
  const [bookSizeNote, setBookSizeNote] = useState("");
  const [aliases, setAliases] = useState("");
  const [aliasesWereManuallyEdited, setAliasesWereManuallyEdited] =
    useState(false);

  const [productImage, setProductImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const generatedAliases = useMemo(() => {
    return generateRuleBasedAliases({
      productName,
      productSku,
      category,
      productType,
      format,
      color,
      lineature,
      bookWidthMm,
      bookHeightMm,
      bookSizeNote,
    });
  }, [
    productName,
    productSku,
    category,
    productType,
    format,
    color,
    lineature,
    bookWidthMm,
    bookHeightMm,
    bookSizeNote,
  ]);

  useEffect(() => {
    if (aliasesWereManuallyEdited) return;

    setAliases(generatedAliases.join("\n"));
  }, [generatedAliases, aliasesWereManuallyEdited]);

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

  useEffect(() => {
    if (!initialCopyProduct) return;

    setProductName(cleanValue(initialCopyProduct.productName));
    setProductSku("");
    setProductPrice(formatInitialPrice(initialCopyProduct.productPrice));
    setCategory(cleanValue(initialCopyProduct.category));
    setProductType(cleanValue(initialCopyProduct.productType));
    setFormat(cleanValue(initialCopyProduct.format));
    setColor(cleanValue(initialCopyProduct.color));
    setLineature(cleanValue(initialCopyProduct.lineature));
    setBookWidthMm(
      normalizeOptionalIntegerInput(cleanValue(initialCopyProduct.bookWidthMm))
    );
    setBookHeightMm(
      normalizeOptionalIntegerInput(cleanValue(initialCopyProduct.bookHeightMm))
    );
    setBookSizeNote(cleanValue(initialCopyProduct.bookSizeNote));

    setAliases("");
    setAliasesWereManuallyEdited(false);
    setProductImage(null);
    setPreviewUrl(null);
    setErrorMessage(null);
    setFeedback(
      `Artikelkopie vorbereitet: „${
        cleanValue(initialCopyProduct.sourceProductName) ||
        cleanValue(initialCopyProduct.productName) ||
        "Artikel"
      }“. Art.-Nr., EAN und Keywords werden nicht übernommen.`
    );
  }, [initialCopyProduct]);

  function resetForm() {
    setProductName("");
    setProductSku("");
    setProductPrice("");
    setCategory("");
    setProductType("");
    setFormat("");
    setColor("");
    setLineature("");
    setBookWidthMm("");
    setBookHeightMm("");
    setBookSizeNote("");
    setAliases("");
    setAliasesWereManuallyEdited(false);
    setProductImage(null);
    setPreviewUrl(null);
    setFeedback(null);
    setErrorMessage(null);
  }

  function regenerateAliases() {
    setAliases(generatedAliases.join("\n"));
    setAliasesWereManuallyEdited(false);
    setFeedback("Suchbegriffe wurden automatisch neu generiert.");
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

  function handleBookWidthChange(value: string) {
    setBookWidthMm(normalizeOptionalIntegerInput(value));
  }

  function handleBookHeightChange(value: string) {
    setBookHeightMm(normalizeOptionalIntegerInput(value));
  }

  function handleFormKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key !== "Enter") return;

    const target = event.target as HTMLElement | null;
    const tagName = target?.tagName?.toLowerCase();

    if (tagName === "textarea") return;

    event.preventDefault();
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

    const width = bookWidthMm.trim();
    const height = bookHeightMm.trim();

    if ((width && !height) || (!width && height)) {
      setErrorMessage(
        "Bitte gib bei Maßangaben entweder Breite und Höhe an oder lasse beide Felder leer."
      );
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
      formData.append("bookWidthMm", bookWidthMm.trim());
      formData.append("bookHeightMm", bookHeightMm.trim());
      formData.append("bookSizeNote", bookSizeNote.trim());
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

      setFeedback(
        payload.message ||
          `Produkt wurde gespeichert. ${
            payload.aliasCount ? `${payload.aliasCount} Suchbegriffe angelegt.` : ""
          }`
      );
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
      onKeyDown={handleFormKeyDown}
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
            Lege Produkte inklusive Bild schnell an. Suchbegriffe werden
            automatisch aus Produktname, Kategorie, Typ, Format, Farbe, Lineatur
            und optionalen Produktdetails erzeugt.
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
              placeholder="z. B. Schulheft A5 Lineatur 8f rot"
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
              placeholder="z. B. HS-HEFT-A5-8F-ROT"
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
              placeholder="z. B. 0,89"
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
              placeholder="z. B. Heft"
              className="min-h-12 w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 text-sm font-semibold text-[#102A43] outline-none transition placeholder:text-[#9AA7B2] focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-4">
          <div>
            <label className="mb-2 block text-sm font-black text-[#102A43]">
              Typ
            </label>
            <input
              type="text"
              value={productType}
              onChange={(event) => setProductType(event.target.value)}
              placeholder="heft"
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
              placeholder="z. B. 8f"
              className="min-h-12 w-full rounded-2xl border border-[#D8C8B8] bg-white px-3 text-sm font-semibold text-[#102A43] outline-none transition placeholder:text-[#9AA7B2] focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
            />
          </div>
        </div>

        <div className="rounded-[24px] border border-[#D6E7EF] bg-[#F5FAFD] p-4">
          <div className="mb-4">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-[#12395F]">
              Optional
            </div>

            <h3 className="text-sm font-black text-[#102A43]">
              Optionale Produktdetails fürs Matching
            </h3>

            <p className="mt-1 text-xs font-semibold leading-5 text-[#52616F]">
              Erfasse hier Maße, Material, Packungsinhalt, Besonderheiten oder
              zusätzliche Suchbegriffe. Diese Angaben werden beim Speichern in
              Suchbegriffen und Matching-Keywords berücksichtigt.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-[1fr_1fr_2fr]">
            <div>
              <label className="mb-2 block text-sm font-black text-[#102A43]">
                Breite mm
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={bookWidthMm}
                onChange={(event) => handleBookWidthChange(event.target.value)}
                placeholder="Optional, z. B. 230"
                className="min-h-12 w-full rounded-2xl border border-[#D8C8B8] bg-white px-3 text-sm font-semibold text-[#102A43] outline-none transition placeholder:text-[#9AA7B2] focus:border-[#12395F] focus:ring-4 focus:ring-[#12395F]/10"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-black text-[#102A43]">
                Höhe mm
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={bookHeightMm}
                onChange={(event) => handleBookHeightChange(event.target.value)}
                placeholder="Optional, z. B. 440"
                className="min-h-12 w-full rounded-2xl border border-[#D8C8B8] bg-white px-3 text-sm font-semibold text-[#102A43] outline-none transition placeholder:text-[#9AA7B2] focus:border-[#12395F] focus:ring-4 focus:ring-[#12395F]/10"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-black text-[#102A43]">
                Details / Suchhinweise
              </label>
              <textarea
                value={bookSizeNote}
                onChange={(event) => setBookSizeNote(event.target.value)}
                rows={3}
                placeholder={
                  "z. B. Material: PVC\nPackung: 3 Stück\nGeeignet für: A5 Umschläge"
                }
                className="min-h-[92px] w-full rounded-2xl border border-[#D8C8B8] bg-white px-3 py-3 text-sm font-semibold text-[#102A43] outline-none transition placeholder:text-[#9AA7B2] focus:border-[#12395F] focus:ring-4 focus:ring-[#12395F]/10"
              />
            </div>
          </div>

          {(bookWidthMm && bookHeightMm) || bookSizeNote.trim() ? (
            <div className="mt-4 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-[#12395F]">
              {bookWidthMm && bookHeightMm ? (
                <p>
                  Erfasstes Maß: {bookWidthMm} x {bookHeightMm} mm
                </p>
              ) : null}

              {bookSizeNote.trim() ? (
                <p className={bookWidthMm && bookHeightMm ? "mt-1" : ""}>
                  Details: {bookSizeNote.trim()}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="rounded-[24px] border border-[#E8DED2] bg-[#FBF7F0] p-4">
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-[#A75B28]">
                <Sparkles className="h-3.5 w-3.5" />
                Automatisch generiert
              </div>

              <label className="block text-sm font-black text-[#102A43]">
                Aliase / Suchbegriffe
              </label>

              <p className="mt-1 text-xs font-semibold leading-5 text-[#52616F]">
                Diese Begriffe werden regelbasiert aus den Produktdaten erzeugt.
                Du kannst sie jederzeit manuell ändern.
              </p>
            </div>

            <button
              type="button"
              onClick={regenerateAliases}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl bg-[#12395F] px-4 py-2 text-xs font-black text-white transition hover:brightness-110"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Suchbegriffe neu generieren
            </button>
          </div>

          <textarea
            value={aliases}
            onChange={(event) => {
              setAliases(event.target.value);
              setAliasesWereManuallyEdited(true);
            }}
            placeholder="Suchbegriffe werden automatisch erzeugt, sobald Produktdaten eingetragen sind."
            rows={7}
            className="w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 py-3 text-sm font-semibold text-[#102A43] outline-none transition placeholder:text-[#9AA7B2] focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
          />

          <div className="mt-3 grid gap-3 text-xs font-semibold leading-5 text-[#52616F] sm:grid-cols-2">
            <p>
              Aktuell vorgeschlagen:{" "}
              <span className="font-black text-[#102A43]">
                {generatedAliases.length}
              </span>{" "}
              Suchbegriffe
            </p>

            <p>
              Hinweis: Später kann hier zusätzlich eine KI-Option ergänzt werden.
              Aktuell läuft alles bewusst ohne KI.
            </p>
          </div>
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