"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import {
  CheckCircle2,
  ImageIcon,
  Loader2,
  Pencil,
  Save,
  Search,
  X,
} from "lucide-react";

type AdminEditOfferItemFormProps = {
  requestId: string;
  itemId: string;
  productId?: string | null;
  productName: string;
  productSku?: string | null;
  productPrice?: number | string | null;
  quantity?: number | string | null;
  unit?: string | null;
  notes?: string | null;
};

type UpdateResponse = {
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

function toInputValue(value: number | string | null | undefined) {
  if (value === null || value === undefined) return "";
  return String(value).replace(".", ",");
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(value || 0);
}

export default function AdminEditOfferItemForm({
  requestId,
  itemId,
  productId: initialProductId,
  productName: initialProductName,
  productSku: initialProductSku,
  productPrice: initialProductPrice,
  quantity: initialQuantity,
  unit: initialUnit,
  notes: initialNotes,
}: AdminEditOfferItemFormProps) {
  const router = useRouter();

  const [isOpen, setIsOpen] = useState(false);

  const [productName, setProductName] = useState(initialProductName || "");
  const [productSku, setProductSku] = useState(initialProductSku || "");
  const [productPrice, setProductPrice] = useState(
    toInputValue(initialProductPrice)
  );
  const [quantity, setQuantity] = useState(
    toInputValue(initialQuantity) || "1"
  );
  const [unit, setUnit] = useState(initialUnit || "");
  const [notes, setNotes] = useState(initialNotes || "");

  const [searchQuery, setSearchQuery] = useState(initialProductName || "");
  const [searchResults, setSearchResults] = useState<ProductSearchResult[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    null
  );
  const [selectedProductLabel, setSelectedProductLabel] = useState<
    string | null
  >(null);
  const [selectedProductImageUrl, setSelectedProductImageUrl] = useState<
    string | null
  >(null);
  const [isSearching, setIsSearching] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const hasSelectedProduct = Boolean(selectedProductId);

  function resetForm() {
    setProductName(initialProductName || "");
    setProductSku(initialProductSku || "");
    setProductPrice(toInputValue(initialProductPrice));
    setQuantity(toInputValue(initialQuantity) || "1");
    setUnit(initialUnit || "");
    setNotes(initialNotes || "");
    setSearchQuery(initialProductName || "");
    setSearchResults([]);
    setSelectedProductId(null);
    setSelectedProductLabel(null);
    setSelectedProductImageUrl(null);
    setFeedback(null);
    setErrorMessage(null);
  }

  async function searchProducts() {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    setFeedback(null);
    setErrorMessage(null);

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

    setSearchResults([]);
    setFeedback(null);
    setErrorMessage(null);
  }

  function clearSelectedProduct() {
    setSelectedProductId(null);
    setSelectedProductLabel(null);
    setSelectedProductImageUrl(null);
    setFeedback(null);
    setErrorMessage(null);
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

    if (!quantity.trim()) {
      setErrorMessage("Bitte gib eine Menge ein.");
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch(
        `/api/admin/requests/${requestId}/offer-items/${itemId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            productName: productName.trim(),
            productSku: productSku.trim(),
            productPrice: productPrice.trim(),
            quantity: quantity.trim(),
            unit: unit.trim(),
            notes: notes.trim(),
            existingProductId: selectedProductId,
          }),
        }
      );

      const rawText = await response.text();

      let payload: UpdateResponse | null = null;

      try {
        payload = rawText ? JSON.parse(rawText) : null;
      } catch {
        throw new Error(
          "Die Bearbeitungs-Route hat keine JSON-Antwort geliefert. Prüfe bitte zusätzlich das Terminal."
        );
      }

      if (!response.ok || !payload?.ok) {
        throw new Error(
          payload?.message || "Die Paketposition konnte nicht aktualisiert werden."
        );
      }

      setFeedback(payload.message || "Paketposition wurde aktualisiert.");
      setIsOpen(false);
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Die Paketposition konnte nicht aktualisiert werden."
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (!isOpen) {
    return (
      <div className="mt-3">
        <button
          type="button"
          onClick={() => {
            resetForm();
            setIsOpen(true);
          }}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#EEF4FA] px-3 py-2 text-xs font-black text-[#12395F] transition hover:bg-[#E4EEF8]"
        >
          <Pencil className="h-3.5 w-3.5" />
          Bearbeiten
        </button>

        {feedback ? (
          <div className="mt-2 flex items-start gap-2 rounded-xl border border-[#BFE3CD] bg-[#F0FFF6] px-3 py-2 text-xs font-semibold text-[#2F7D50]">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{feedback}</span>
          </div>
        ) : null}

        {errorMessage ? (
          <div className="mt-2 rounded-xl border border-[#F0C7C7] bg-[#FFF5F5] px-3 py-2 text-xs font-semibold text-[#B5282D]">
            {errorMessage}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-3 rounded-2xl border border-[#D8C8B8] bg-white p-4 text-left"
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
            Paketposition bearbeiten
          </p>
          <h4 className="mt-1 font-black text-[#102A43]">
            Shopartikel, Menge, Preis und Artikelangaben ändern
          </h4>
          <p className="mt-1 text-xs font-semibold leading-5 text-[#52616F]">
            Suche ein Bestandsprodukt, wenn diese Paketposition auf einen anderen
            Shopartikel wechseln soll. Ohne Auswahl werden nur die Felder unten
            angepasst.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setIsOpen(false);
            resetForm();
          }}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#FBF7F0] text-[#B5282D] transition hover:bg-[#FFECEC]"
          aria-label="Formular schließen"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-5 rounded-[22px] border border-[#E8DED2] bg-[#FBF7F0] p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
            Shopartikel ändern
          </p>

          {initialProductId ? (
            <span className="w-fit rounded-full bg-white px-3 py-1 text-[11px] font-black text-[#52616F]">
              Aktuell mit Produkt verknüpft
            </span>
          ) : (
            <span className="w-fit rounded-full bg-white px-3 py-1 text-[11px] font-black text-[#A75B28]">
              Aktuell ohne Produktbezug
            </span>
          )}
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
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

        {hasSelectedProduct ? (
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
                    Neuer Shopartikel gewählt
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
      </div>

      <div className="grid gap-4">
        <div>
          <label className="mb-2 block text-sm font-black text-[#102A43]">
            Produktname*
          </label>
          <input
            type="text"
            value={productName}
            readOnly={hasSelectedProduct}
            onChange={(event) => setProductName(event.target.value)}
            className={`min-h-12 w-full rounded-2xl border border-[#D8C8B8] px-4 text-sm font-semibold text-[#102A43] outline-none transition placeholder:text-[#9AA7B2] focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10 ${
              hasSelectedProduct ? "bg-[#FBF7F0]" : "bg-white"
            }`}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-2 block text-sm font-black text-[#102A43]">
              Art.-Nr.
            </label>
            <input
              type="text"
              value={productSku}
              readOnly={hasSelectedProduct}
              onChange={(event) => setProductSku(event.target.value)}
              placeholder="optional"
              className={`min-h-12 w-full rounded-2xl border border-[#D8C8B8] px-4 text-sm font-semibold text-[#102A43] outline-none transition placeholder:text-[#9AA7B2] focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10 ${
                hasSelectedProduct ? "bg-[#FBF7F0]" : "bg-white"
              }`}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-black text-[#102A43]">
              Einzelpreis
            </label>
            <input
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
            <label className="mb-2 block text-sm font-black text-[#102A43]">
              Menge*
            </label>
            <input
              type="text"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              className="min-h-12 w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 text-sm font-semibold text-[#102A43] outline-none transition placeholder:text-[#9AA7B2] focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
          <div>
            <label className="mb-2 block text-sm font-black text-[#102A43]">
              Einheit
            </label>
            <input
              type="text"
              value={unit}
              onChange={(event) => setUnit(event.target.value)}
              placeholder="z. B. Stück"
              className="min-h-12 w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 text-sm font-semibold text-[#102A43] outline-none transition placeholder:text-[#9AA7B2] focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-black text-[#102A43]">
              Notiz
            </label>
            <input
              type="text"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="optional"
              className="min-h-12 w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 text-sm font-semibold text-[#102A43] outline-none transition placeholder:text-[#9AA7B2] focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
            />
          </div>
        </div>

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
              Wird gespeichert …
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Änderungen speichern
            </>
          )}
        </button>
      </div>
    </form>
  );
}
