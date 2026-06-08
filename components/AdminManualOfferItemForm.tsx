"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ImageIcon,
  Loader2,
  PackagePlus,
  PlusCircle,
  Search,
  X,
} from "lucide-react";

type AdminManualOfferItemFormProps = {
  requestId: string;
  requestItemId?: string | null;
  defaultProductName?: string | null;
  defaultQuantity?: number | string | null;
  buttonLabel?: string;
};

type ManualOfferItemResponse = {
  ok?: boolean;
  message?: string;
};

type ProductSearchResult = {
  id: string;
  productName: string;
  productSku: string;
  productPrice: number;
  imageUrl?: string | null;
  category?: string | null;
  productType?: string | null;
  format?: string | null;
  color?: string | null;
  lineature?: string | null;
};

type ProductSearchResponse = {
  ok?: boolean;
  products?: ProductSearchResult[];
  message?: string;
};

function toInputNumber(
  value: number | string | null | undefined,
  fallback = "1"
) {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value).replace(".", ",");
}

function parseGermanNumber(value: string) {
  const normalized = String(value || "")
    .trim()
    .replace(/\./g, "")
    .replace(",", ".");

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(value || 0);
}

export default function AdminManualOfferItemForm({
  requestId,
  requestItemId = null,
  defaultProductName,
  defaultQuantity,
  buttonLabel = "Manuell Produkt ergänzen",
}: AdminManualOfferItemFormProps) {
  const router = useRouter();

  const fieldKey = useMemo(
    () => requestItemId || "global-manual-offer-item",
    [requestItemId]
  );

  const [isOpen, setIsOpen] = useState(false);

  const [productName, setProductName] = useState(defaultProductName || "");
  const [productSku, setProductSku] = useState("");
  const [productPrice, setProductPrice] = useState("");
  const [quantity, setQuantity] = useState(toInputNumber(defaultQuantity, "1"));
  const [unit, setUnit] = useState("");
  const [notes, setNotes] = useState("");

  const [productCategory, setProductCategory] = useState("");
  const [productType, setProductType] = useState("");
  const [productFormat, setProductFormat] = useState("");
  const [productColor, setProductColor] = useState("");
  const [productLineature, setProductLineature] = useState("");

  const [aliasText, setAliasText] = useState(defaultProductName || "");
  const [rememberForFuture, setRememberForFuture] = useState(true);
  const [createProductMode, setCreateProductMode] = useState(false);

  const [searchQuery, setSearchQuery] = useState(defaultProductName || "");
  const [searchResults, setSearchResults] = useState<ProductSearchResult[]>([]);

  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selectedProductLabel, setSelectedProductLabel] = useState<string | null>(
    null
  );
  const [selectedProductImageUrl, setSelectedProductImageUrl] = useState<
    string | null
  >(null);

  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const hasSelectedProduct = Boolean(selectedProductId);
  const isCreatingNewProduct = createProductMode && !selectedProductId;
  const showProductFields = hasSelectedProduct || isCreatingNewProduct;

  useEffect(() => {
    if (!isOpen) {
      setProductName(defaultProductName || "");
      setQuantity(toInputNumber(defaultQuantity, "1"));
      setProductSku("");
      setProductPrice("");
      setUnit("");
      setNotes("");

      setProductCategory("");
      setProductType("");
      setProductFormat("");
      setProductColor("");
      setProductLineature("");

      setAliasText(defaultProductName || "");
      setSearchQuery(defaultProductName || "");
      setSearchResults([]);

      setSelectedProductId(null);
      setSelectedProductLabel(null);
      setSelectedProductImageUrl(null);

      setCreateProductMode(false);
      setRememberForFuture(true);
    }
  }, [defaultProductName, defaultQuantity, isOpen]);

  async function searchProducts() {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    setErrorMessage(null);
    setFeedback(null);

    try {
      const response = await fetch(
        `/api/admin/products/search?q=${encodeURIComponent(searchQuery.trim())}`
      );

      const rawText = await response.text();

      let payload: ProductSearchResponse | null = null;

      try {
        payload = rawText ? JSON.parse(rawText) : null;
      } catch {
        throw new Error(
          "Die Produktsuche hat keine JSON-Antwort geliefert. Prüfe bitte zusätzlich das Terminal."
        );
      }

      if (!response.ok || !payload?.ok) {
        throw new Error(
          payload?.message || "Produkte konnten nicht gesucht werden."
        );
      }

      setSearchResults(payload.products || []);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Produkte konnten nicht gesucht werden."
      );
    } finally {
      setIsSearching(false);
    }
  }

  function selectProduct(product: ProductSearchResult) {
    setSelectedProductId(product.id);
    setSelectedProductLabel(product.productName);
    setSelectedProductImageUrl(product.imageUrl || null);

    setProductName(product.productName || "");
    setProductSku(product.productSku || "");
    setProductPrice(
      product.productPrice ? String(product.productPrice).replace(".", ",") : ""
    );

    setProductCategory(product.category || "");
    setProductType(product.productType || "");
    setProductFormat(product.format || "");
    setProductColor(product.color || "");
    setProductLineature(product.lineature || "");

    setCreateProductMode(false);
    setRememberForFuture(true);
    setSearchResults([]);
    setErrorMessage(null);
  }

  function clearSelectedProduct() {
    setSelectedProductId(null);
    setSelectedProductLabel(null);
    setSelectedProductImageUrl(null);
  }

  function startCreateProductMode() {
    clearSelectedProduct();
    setCreateProductMode(true);
    setProductName((current) => current || searchQuery || defaultProductName || "");
    setAliasText((current) => current || searchQuery || defaultProductName || "");
    setErrorMessage(null);
    setFeedback(null);
  }

  function stopCreateProductMode() {
    setCreateProductMode(false);
    setProductName(defaultProductName || "");
    setProductSku("");
    setProductPrice("");
    setUnit("");
    setNotes("");
    setProductCategory("");
    setProductType("");
    setProductFormat("");
    setProductColor("");
    setProductLineature("");
    setAliasText(defaultProductName || "");
  }

  function validateBeforeSubmit() {
    const priceNumber = parseGermanNumber(productPrice);
    const quantityNumber = parseGermanNumber(quantity);

    if (!selectedProductId && !createProductMode) {
      return "Bitte suche zuerst ein Bestandsprodukt. Wenn es nicht vorhanden ist, klicke bewusst auf „Neues Produkt erfassen“. ";
    }

    if (!productName.trim() && !selectedProductId) {
      return "Bitte gib einen Produktnamen ein oder wähle ein Bestandsprodukt aus.";
    }

    if (quantityNumber <= 0) {
      return "Bitte gib eine Menge größer als 0 ein.";
    }

    if (selectedProductId && priceNumber <= 0) {
      return "Das gewählte Bestandsprodukt hat keinen gültigen Preis. Bitte pflege den Preis zuerst in der Produktverwaltung.";
    }

    if (createProductMode && !selectedProductId) {
      const missingFields: string[] = [];

      if (!productName.trim()) missingFields.push("Produktname");
      if (priceNumber <= 0) missingFields.push("Einzelpreis größer 0");
      if (!productCategory.trim()) missingFields.push("Kategorie");
      if (!productType.trim()) missingFields.push("Produkttyp");
      if (!unit.trim()) missingFields.push("Einheit");

      if (missingFields.length > 0) {
        return `Neues Produkt nicht gespeichert: Bitte fülle folgende Pflichtfelder aus: ${missingFields.join(
          ", "
        )}.`;
      }
    }

    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSaving) return;

    setFeedback(null);
    setErrorMessage(null);

    const validationError = validateBeforeSubmit();

    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch(
        `/api/admin/requests/${requestId}/offer-items/manual`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            requestItemId: requestItemId || null,
            productName: productName.trim(),
            productSku: productSku.trim(),
            productPrice: productPrice.trim(),
            quantity: quantity.trim(),
            unit: unit.trim(),
            notes: notes.trim(),

            existingProductId: selectedProductId,
            saveAsProduct: createProductMode && !selectedProductId,
            rememberForFuture,

            productCategory: productCategory.trim(),
            productType: productType.trim(),
            productFormat: productFormat.trim(),
            productColor: productColor.trim(),
            productLineature: productLineature.trim(),
            aliasText: aliasText.trim(),
          }),
        }
      );

      const rawText = await response.text();

      let payload: ManualOfferItemResponse | null = null;

      try {
        payload = rawText ? JSON.parse(rawText) : null;
      } catch {
        throw new Error(
          "Die Admin-Route hat keine JSON-Antwort geliefert. Prüfe bitte zusätzlich das Terminal."
        );
      }

      if (!response.ok || !payload?.ok) {
        throw new Error(
          payload?.message ||
            "Die manuelle Position konnte nicht gespeichert werden."
        );
      }

      setFeedback(payload.message || "Manuelle Position wurde hinzugefügt.");

// Wichtig für Sammelpositionen:
// Formular bleibt offen, damit direkt das nächste Produkt aus derselben
// Listenposition gesucht und übernommen werden kann.
setSelectedProductId(null);
setSelectedProductLabel(null);
setSelectedProductImageUrl(null);

setProductName("");
setProductSku("");
setProductPrice("");
setProductCategory("");
setProductType("");
setProductFormat("");
setProductColor("");
setProductLineature("");
setNotes("");

setCreateProductMode(false);
setSearchResults([]);
setSearchQuery("");
setAliasText(defaultProductName || "");

router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Die manuelle Position konnte nicht gespeichert werden."
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (!isOpen) {
    return (
      <div className="mt-4">
        <button
          type="button"
          onClick={() => {
            setIsOpen(true);
            setFeedback(null);
            setErrorMessage(null);
          }}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#12395F] px-4 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110 sm:w-auto"
        >
          <PlusCircle className="h-4 w-4" />
          {buttonLabel}
        </button>

        {feedback ? (
          <div className="mt-3 flex items-start gap-2 rounded-2xl border border-[#BFE3CD] bg-[#F0FFF6] px-4 py-3 text-sm font-semibold text-[#2F7D50]">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{feedback}</span>
          </div>
        ) : null}

        {errorMessage ? (
          <div className="mt-3 rounded-2xl border border-[#F0C7C7] bg-[#FFF5F5] px-4 py-3 text-sm font-semibold text-[#B5282D]">
            {errorMessage}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 rounded-[24px] border border-[#D8C8B8] bg-white p-4"
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
            Manuelle Paketposition
          </p>
          <h4 className="mt-1 font-black text-[#102A43]">
            Erst Bestandsprodukt suchen, dann bewusst erfassen
          </h4>
          <p className="mt-1 text-sm font-semibold leading-6 text-[#52616F]">
            Suche zuerst im Produktkatalog. Nur wenn der Artikel dort wirklich
            nicht vorhanden ist, kannst Du ein neues Produkt mit Pflichtfeldern
            anlegen.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#FBF7F0] text-[#B5282D] transition hover:bg-[#FFECEC]"
          aria-label="Formular schließen"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-5 rounded-[22px] border border-[#E8DED2] bg-[#FBF7F0] p-4">
        <p className="mb-3 text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
          1. Bestandsprodukt suchen
        </p>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="z. B. Umschlag A5 rot oder Artikelnummer"
            className="min-h-12 w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 text-sm font-semibold text-[#102A43] outline-none transition placeholder:text-[#9AA7B2] focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
          />

          <button
            type="button"
            onClick={searchProducts}
            disabled={isSearching}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#12395F] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSearching ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Suche …
              </>
            ) : (
              <>
                <Search className="h-4 w-4" />
                Suchen
              </>
            )}
          </button>
        </div>

        {selectedProductId ? (
          <div className="mt-3 rounded-2xl border border-[#BFE3CD] bg-[#F0FFF6] p-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="h-16 w-16 overflow-hidden rounded-2xl border border-[#BFE3CD] bg-white">
                  {selectedProductImageUrl ? (
                    <img
                      src={selectedProductImageUrl}
                      alt={selectedProductLabel || "Produkt"}
                      className="h-full w-full object-contain p-1"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[#A75B28]">
                      <ImageIcon className="h-5 w-5" />
                    </div>
                  )}
                </div>

                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-[#2F7D50]">
                    Bestandsprodukt gewählt
                  </p>
                  <p className="mt-1 font-black text-[#102A43]">
                    {selectedProductLabel}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={clearSelectedProduct}
                className="inline-flex items-center justify-center rounded-xl bg-white px-3 py-2 text-xs font-black text-[#B5282D]"
              >
                Auswahl entfernen
              </button>
            </div>
          </div>
        ) : null}

        {searchResults.length > 0 ? (
          <div className="mt-3 grid gap-2">
            {searchResults.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => selectProduct(product)}
                className="rounded-2xl border border-[#E8DED2] bg-white p-3 text-left transition hover:border-[#12395F]"
              >
                <div className="grid gap-3 sm:grid-cols-[72px_1fr_auto] sm:items-center">
                  <div className="overflow-hidden rounded-2xl border border-[#E8DED2] bg-[#FBF7F0]">
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt={product.productName}
                        className="h-20 w-full object-contain p-1 sm:h-16"
                      />
                    ) : (
                      <div className="flex h-20 w-full items-center justify-center text-[#A75B28] sm:h-16">
                        <ImageIcon className="h-5 w-5" />
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="font-black text-[#102A43]">
                      {product.productName}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-[#52616F]">
                      {product.productSku
                        ? `Art.-Nr.: ${product.productSku}`
                        : "Ohne Art.-Nr."}
                    </p>
                  </div>

                  <p className="font-black text-[#102A43] sm:text-right">
                    {formatMoney(product.productPrice)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        ) : null}

        {!selectedProductId && !createProductMode ? (
          <div className="mt-4 rounded-2xl border border-[#F1D1A8] bg-[#FFF8EE] p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-[#A75B28]">
                  <AlertTriangle className="h-5 w-5" />
                </div>

                <div>
                  <p className="text-sm font-black text-[#8A4A1F]">
                    Produkt nicht gefunden?
                  </p>
                  <p className="mt-1 text-xs font-semibold leading-5 text-[#8A4A1F]">
                    Lege nur dann ein neues Bestandsprodukt an, wenn Du vorher
                    gesucht hast und der Artikel wirklich nicht im Shop ist.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={startCreateProductMode}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#B5282D] px-4 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110"
              >
                <PackagePlus className="h-4 w-4" />
                Neues Produkt erfassen
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {showProductFields ? (
        <div className="grid gap-4">
          {isCreatingNewProduct ? (
            <div className="rounded-[22px] border border-[#F1D1A8] bg-[#FFF8EE] p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
                    2. Neues Bestandsprodukt erfassen
                  </p>
                  <p className="mt-1 text-sm font-bold leading-6 text-[#8A4A1F]">
                    Pflichtfelder: Produktname, Einzelpreis, Kategorie,
                    Produkttyp, Menge und Einheit. Die Artikelnummer wird
                    automatisch erzeugt, wenn Du sie leer lässt.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={stopCreateProductMode}
                  className="inline-flex items-center justify-center rounded-xl bg-white px-3 py-2 text-xs font-black text-[#B5282D]"
                >
                  Zurück zur Suche
                </button>
              </div>
            </div>
          ) : null}

          <div>
            <label
              htmlFor={`manual-product-name-${fieldKey}`}
              className="mb-2 block text-sm font-black text-[#102A43]"
            >
              Produktname*
            </label>
            <input
              id={`manual-product-name-${fieldKey}`}
              type="text"
              value={productName}
              readOnly={hasSelectedProduct}
              onChange={(event) => setProductName(event.target.value)}
              placeholder="z. B. Umschlag A5 rot"
              className={`min-h-12 w-full rounded-2xl border border-[#D8C8B8] px-4 text-sm font-semibold text-[#102A43] outline-none transition placeholder:text-[#9AA7B2] focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10 ${
                hasSelectedProduct ? "bg-[#FBF7F0]" : "bg-white"
              }`}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label
                htmlFor={`manual-product-sku-${fieldKey}`}
                className="mb-2 block text-sm font-black text-[#102A43]"
              >
                Art.-Nr.
              </label>
              <input
                id={`manual-product-sku-${fieldKey}`}
                type="text"
                value={productSku}
                readOnly={hasSelectedProduct}
                onChange={(event) => setProductSku(event.target.value)}
                placeholder={
                  isCreatingNewProduct ? "wird automatisch erzeugt" : "optional"
                }
                className={`min-h-12 w-full rounded-2xl border border-[#D8C8B8] px-4 text-sm font-semibold text-[#102A43] outline-none transition placeholder:text-[#9AA7B2] focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10 ${
                  hasSelectedProduct ? "bg-[#FBF7F0]" : "bg-white"
                }`}
              />
            </div>

            <div>
              <label
                htmlFor={`manual-product-price-${fieldKey}`}
                className="mb-2 block text-sm font-black text-[#102A43]"
              >
                Einzelpreis*
              </label>
              <input
                id={`manual-product-price-${fieldKey}`}
                type="text"
                value={productPrice}
                readOnly={hasSelectedProduct}
                onChange={(event) => setProductPrice(event.target.value)}
                placeholder="z. B. 0,39"
                className={`min-h-12 w-full rounded-2xl border border-[#D8C8B8] px-4 text-sm font-semibold text-[#102A43] outline-none transition placeholder:text-[#9AA7B2] focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10 ${
                  hasSelectedProduct ? "bg-[#FBF7F0]" : "bg-white"
                }`}
              />
            </div>

            <div>
              <label
                htmlFor={`manual-quantity-${fieldKey}`}
                className="mb-2 block text-sm font-black text-[#102A43]"
              >
                Menge*
              </label>
              <input
                id={`manual-quantity-${fieldKey}`}
                type="text"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                placeholder="1"
                className="min-h-12 w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 text-sm font-semibold text-[#102A43] outline-none transition placeholder:text-[#9AA7B2] focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
            <div>
              <label
                htmlFor={`manual-unit-${fieldKey}`}
                className="mb-2 block text-sm font-black text-[#102A43]"
              >
                Einheit{isCreatingNewProduct ? "*" : ""}
              </label>
              <input
                id={`manual-unit-${fieldKey}`}
                type="text"
                value={unit}
                onChange={(event) => setUnit(event.target.value)}
                placeholder="z. B. Stück"
                className="min-h-12 w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 text-sm font-semibold text-[#102A43] outline-none transition placeholder:text-[#9AA7B2] focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
              />
            </div>

            <div>
              <label
                htmlFor={`manual-notes-${fieldKey}`}
                className="mb-2 block text-sm font-black text-[#102A43]"
              >
                Notiz
              </label>
              <input
                id={`manual-notes-${fieldKey}`}
                type="text"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="optional, z. B. Ersatzartikel"
                className="min-h-12 w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 text-sm font-semibold text-[#102A43] outline-none transition placeholder:text-[#9AA7B2] focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
              />
            </div>
          </div>

          {isCreatingNewProduct ? (
            <div className="rounded-[22px] border border-[#E8DED2] bg-[#FBF7F0] p-4">
              <p className="mb-3 text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
                Produktdaten für Katalog & Matching
              </p>

              <div className="grid gap-4 sm:grid-cols-5">
                <div className="sm:col-span-1">
                  <label className="mb-2 block text-xs font-black text-[#102A43]">
                    Kategorie*
                  </label>
                  <input
                    type="text"
                    value={productCategory}
                    onChange={(event) => setProductCategory(event.target.value)}
                    placeholder="z. B. Basteln"
                    className="min-h-12 w-full rounded-2xl border border-[#D8C8B8] bg-white px-3 text-sm font-semibold text-[#102A43] outline-none"
                  />
                </div>

                <div className="sm:col-span-1">
                  <label className="mb-2 block text-xs font-black text-[#102A43]">
                    Produkttyp*
                  </label>
                  <input
                    type="text"
                    value={productType}
                    onChange={(event) => setProductType(event.target.value)}
                    placeholder="z. B. Malkittel"
                    className="min-h-12 w-full rounded-2xl border border-[#D8C8B8] bg-white px-3 text-sm font-semibold text-[#102A43] outline-none"
                  />
                </div>

                <div className="sm:col-span-1">
                  <label className="mb-2 block text-xs font-black text-[#102A43]">
                    Format
                  </label>
                  <input
                    type="text"
                    value={productFormat}
                    onChange={(event) => setProductFormat(event.target.value)}
                    placeholder="z. B. A4"
                    className="min-h-12 w-full rounded-2xl border border-[#D8C8B8] bg-white px-3 text-sm font-semibold text-[#102A43] outline-none"
                  />
                </div>

                <div className="sm:col-span-1">
                  <label className="mb-2 block text-xs font-black text-[#102A43]">
                    Farbe
                  </label>
                  <input
                    type="text"
                    value={productColor}
                    onChange={(event) => setProductColor(event.target.value)}
                    placeholder="z. B. weiß"
                    className="min-h-12 w-full rounded-2xl border border-[#D8C8B8] bg-white px-3 text-sm font-semibold text-[#102A43] outline-none"
                  />
                </div>

                <div className="sm:col-span-1">
                  <label className="mb-2 block text-xs font-black text-[#102A43]">
                    Lineatur
                  </label>
                  <input
                    type="text"
                    value={productLineature}
                    onChange={(event) => setProductLineature(event.target.value)}
                    placeholder="z. B. 8f"
                    className="min-h-12 w-full rounded-2xl border border-[#D8C8B8] bg-white px-3 text-sm font-semibold text-[#102A43] outline-none"
                  />
                </div>
              </div>
            </div>
          ) : null}

          <div className="rounded-[22px] border border-[#E8DED2] bg-[#FBF7F0] p-4">
            <p className="mb-3 text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
              Für zukünftige Anfragen merken
            </p>

            <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-white p-3">
              <input
                type="checkbox"
                checked={rememberForFuture}
                onChange={(event) => setRememberForFuture(event.target.checked)}
                className="mt-1 h-4 w-4"
              />
              <span>
                <span className="block text-sm font-black text-[#102A43]">
                  Zuordnung für spätere Listen merken
                </span>
                <span className="mt-1 block text-xs font-semibold leading-5 text-[#52616F]">
                  Speichert die erkannte Listenposition als Alias zum gewählten
                  Produkt. Dadurch wird dieses Produkt bei ähnlichen Listen künftig
                  besser vorgeschlagen.
                </span>
              </span>
            </label>

            <div className="mt-4">
              <label className="mb-2 block text-sm font-black text-[#102A43]">
                Alias / Suchbegriff
              </label>
              <input
                type="text"
                value={aliasText}
                onChange={(event) => setAliasText(event.target.value)}
                placeholder="z. B. Umschlag A5 rot"
                className="min-h-12 w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 text-sm font-semibold text-[#102A43] outline-none transition placeholder:text-[#9AA7B2] focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
              />
            </div>
          </div>

          {errorMessage ? (
            <div className="rounded-2xl border border-[#F0C7C7] bg-[#FFF5F5] px-4 py-3 text-sm font-semibold text-[#B5282D]">
              {errorMessage}
            </div>
          ) : null}

          {feedback ? (
            <div className="flex items-start gap-2 rounded-2xl border border-[#BFE3CD] bg-[#F0FFF6] px-4 py-3 text-sm font-semibold text-[#2F7D50]">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{feedback}</span>
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
                Wird gespeichert …
              </>
            ) : (
              <>
                <PackagePlus className="h-4 w-4" />
                Produkt in Paketwunsch übernehmen
              </>
            )}
          </button>
        </div>
      ) : (
        <div className="rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] px-4 py-3 text-sm font-semibold leading-6 text-[#52616F]">
          Suche zuerst ein Produkt. Erst wenn kein Treffer passt, öffnest Du die
          Erfassung für ein neues Bestandsprodukt.
        </div>
      )}
    </form>
  );
}