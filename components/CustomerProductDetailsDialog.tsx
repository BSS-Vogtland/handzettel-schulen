"use client";

import { useState } from "react";
import { ImageIcon, Info, X } from "lucide-react";

type CustomerProductDetailsDialogProps = {
  product?: Record<string, unknown> | null;
  productName: string;
  productSku?: string | null;
  productPrice?: number | string | null;
  imageUrl?: string | null;
  quantity?: number | string | null;
};

function cleanText(value: unknown) {
  if (value === null || value === undefined) return "";
  const text = String(value).trim();
  return text.length > 0 ? text : "";
}

function getFirstText(
  product: Record<string, unknown> | null | undefined,
  keys: string[]
) {
  if (!product) return "";

  for (const key of keys) {
    const value = cleanText(product[key]);
    if (value) return value;
  }

  return "";
}

function toNumber(value: unknown, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatMoney(value: unknown) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(toNumber(value, 0));
}

function getBookMeasure(product: Record<string, unknown> | null | undefined) {
  if (!product) return "";

  const width =
    getFirstText(product, ["book_width_mm", "width_mm", "bookWidthMm"]) || "";
  const height =
    getFirstText(product, ["book_height_mm", "height_mm", "bookHeightMm"]) ||
    "";

  if (width && height) return `${width} × ${height} mm`;

  return getFirstText(product, [
    "book_size_note",
    "size_note",
    "dimensions",
    "measure",
  ]);
}

export default function CustomerProductDetailsDialog({
  product = null,
  productName,
  productSku,
  productPrice,
  imageUrl,
  quantity,
}: CustomerProductDetailsDialogProps) {
  const [isOpen, setIsOpen] = useState(false);

  const title =
    getFirstText(product, ["name", "product_name", "title"]) ||
    productName ||
    "Artikel";

  const sku =
    productSku ||
    getFirstText(product, ["sku", "product_sku", "article_number"]);

  const price =
    productPrice ??
    getFirstText(product, [
      "price",
      "product_price",
      "sale_price_gross",
      "sale_price",
    ]);

  const description = getFirstText(product, [
    "short_description",
    "meta_description",
    "description",
    "product_description",
    "notes",
  ]);

  const facts = [
    ["Kategorie", getFirstText(product, ["category", "product_category"])],
    ["Typ", getFirstText(product, ["product_type", "type"])],
    ["Format", getFirstText(product, ["format"])],
    ["Farbe", getFirstText(product, ["color"])],
    ["Lineatur", getFirstText(product, ["lineature"])],
    ["EAN", getFirstText(product, ["ean", "barcode", "gtin"])],
    ["Maße", getBookMeasure(product)],
    ["Einheit", getFirstText(product, ["unit", "unit_label"])],
  ].filter(([, value]) => Boolean(value));

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="mt-3 inline-flex items-center justify-center gap-2 rounded-xl border border-[#D6E7EF] bg-[#F5FAFD] px-3 py-2 text-xs font-black text-[#12395F] shadow-sm transition hover:border-[#12395F] hover:bg-white"
      >
        <Info className="h-3.5 w-3.5" />
        Artikeldetails anzeigen
      </button>

      {isOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#102A43]/60 px-4 py-6"
          role="dialog"
          aria-modal="true"
          aria-label={`Artikeldetails zu ${title}`}
        >
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            onClick={() => setIsOpen(false)}
            aria-label="Artikeldetails schließen"
          />

          <section className="relative max-h-[90vh] w-full max-w-3xl overflow-auto rounded-[32px] border border-[#E8DED2] bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-[#E8DED2] px-5 py-4 sm:px-6">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#A75B28]">
                  Artikeldetails
                </p>
                <h2 className="mt-1 text-2xl font-black text-[#102A43]">
                  {title}
                </h2>
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#FBF7F0] text-[#102A43] transition hover:bg-[#FFECEC] hover:text-[#B5282D]"
                aria-label="Schließen"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-5 p-5 sm:grid-cols-[220px_1fr] sm:p-6">
              <div className="overflow-hidden rounded-[24px] border border-[#E8DED2] bg-[#FBF7F0]">
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt={title}
                    className="h-56 w-full bg-white object-contain p-4"
                  />
                ) : (
                  <div className="flex h-56 w-full items-center justify-center text-[#A75B28]">
                    <ImageIcon className="h-10 w-10" />
                  </div>
                )}
              </div>

              <div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {sku ? (
                    <div className="rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] p-3">
                      <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#8A6A4F]">
                        Art.-Nr.
                      </p>
                      <p className="mt-1 text-sm font-black text-[#102A43]">
                        {sku}
                      </p>
                    </div>
                  ) : null}

                  <div className="rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] p-3">
                    <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#8A6A4F]">
                      Preis
                    </p>
                    <p className="mt-1 text-sm font-black text-[#102A43]">
                      {formatMoney(price)}
                    </p>
                  </div>

                  {quantity ? (
                    <div className="rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] p-3">
                      <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#8A6A4F]">
                        Menge im Paket
                      </p>
                      <p className="mt-1 text-sm font-black text-[#102A43]">
                        {quantity}
                      </p>
                    </div>
                  ) : null}
                </div>

                {facts.length > 0 ? (
                  <dl className="mt-4 grid gap-2">
                    {facts.map(([label, value]) => (
                      <div
                        key={`${label}-${value}`}
                        className="flex flex-col gap-1 rounded-2xl border border-[#E8DED2] bg-white px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <dt className="text-xs font-black uppercase tracking-[0.12em] text-[#8A6A4F]">
                          {label}
                        </dt>
                        <dd className="text-sm font-bold text-[#102A43]">
                          {value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : null}

                {description ? (
                  <div className="mt-4 rounded-2xl border border-[#D6E7EF] bg-[#F5FAFD] p-4">
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-[#12395F]">
                      Beschreibung
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6 text-[#52616F]">
                      {description}
                    </p>
                  </div>
                ) : (
                  <p className="mt-4 rounded-2xl border border-[#D6E7EF] bg-[#F5FAFD] p-4 text-sm font-semibold leading-6 text-[#52616F]">
                    Für diesen Artikel sind aktuell keine zusätzlichen Details
                    hinterlegt. Maßgeblich sind Artikelname, Art.-Nr. und Preis.
                  </p>
                )}
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
