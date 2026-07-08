"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  clearShopCart,
  formatShopPrice,
  getShopCartCount,
  getShopCartSubtotal,
  readShopCart,
  removeShopCartItem,
  ShopCartItem,
  updateShopCartItemQuantity,
} from "../_lib/shopCart";

type DiscountPreview = {
  ok: boolean;
  hasCampaign: boolean;
  wouldApply: boolean;
  subtotalAmount: number;
  minimumOrderAmount: number | null;
  missingAmount: number | null;
  discountCampaignId: string | null;
  discountName: string | null;
  discountType: "percent" | "fixed_amount" | null;
  discountValue: number | null;
  discountAmount: number;
  totalAfterDiscount: number;
  message?: string;
};

function getDiscountLabel(preview: DiscountPreview | null) {
  if (!preview?.hasCampaign || !preview.discountName) {
    return "Rabatt";
  }

  if (preview.discountType === "percent" && preview.discountValue) {
    return `${preview.discountName} (${preview.discountValue.toLocaleString(
      "de-DE",
      {
        maximumFractionDigits: 2,
      }
    )} %)`;
  }

  if (preview.discountType === "fixed_amount" && preview.discountValue) {
    return `${preview.discountName} (${formatShopPrice(preview.discountValue)})`;
  }

  return preview.discountName;
}

function getDiscountInfoText(preview: DiscountPreview | null) {
  if (!preview?.hasCampaign) {
    return null;
  }

  if (preview.wouldApply && preview.discountAmount > 0) {
    return `Rabatt aktiv: Du sparst ${formatShopPrice(preview.discountAmount)}.`;
  }

  if (
    preview.minimumOrderAmount !== null &&
    preview.missingAmount !== null &&
    preview.missingAmount > 0
  ) {
    return `Noch ${formatShopPrice(
      preview.missingAmount
    )} bis zum Rabatt "${preview.discountName}".`;
  }

  return `Rabattaktion "${preview.discountName}" ist aktiv, greift aber fÃ¼r diesen Warenkorb noch nicht.`;
}

export default function ShopCartPage() {
  const [cartItems, setCartItems] = useState<ShopCartItem[]>([]);
  const [lastActionMessage, setLastActionMessage] = useState<string | null>(null);
  const [discountPreview, setDiscountPreview] = useState<DiscountPreview | null>(
    null
  );
  const [isLoadingDiscountPreview, setIsLoadingDiscountPreview] = useState(false);

  useEffect(() => {
    setCartItems(readShopCart());

    function handleCartUpdate() {
      setCartItems(readShopCart());
    }

    window.addEventListener("shop-cart-updated", handleCartUpdate);
    window.addEventListener("storage", handleCartUpdate);

    return () => {
      window.removeEventListener("shop-cart-updated", handleCartUpdate);
      window.removeEventListener("storage", handleCartUpdate);
    };
  }, []);

  const cartCount = useMemo(() => {
    return getShopCartCount(cartItems);
  }, [cartItems]);

  const subtotal = useMemo(() => {
    return getShopCartSubtotal(cartItems);
  }, [cartItems]);

  const discountAmount = discountPreview?.wouldApply
    ? discountPreview.discountAmount
    : 0;

  const totalBeforeShipping = discountPreview?.hasCampaign
    ? discountPreview.totalAfterDiscount
    : subtotal;

  const discountInfoText = getDiscountInfoText(discountPreview);

  useEffect(() => {
    let isCancelled = false;

    async function loadDiscountPreview() {
      if (cartItems.length === 0) {
        setDiscountPreview(null);
        return;
      }

      setIsLoadingDiscountPreview(true);

      try {
        const response = await fetch(
          `/api/shop/discount-preview?subtotal=${encodeURIComponent(
            subtotal.toFixed(2)
          )}`,
          {
            method: "GET",
            cache: "no-store",
          }
        );

        const result = (await response.json()) as DiscountPreview;

        if (!isCancelled) {
          if (response.ok && result.ok) {
            setDiscountPreview(result);
          } else {
            setDiscountPreview(null);
          }
        }
      } catch {
        if (!isCancelled) {
          setDiscountPreview(null);
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingDiscountPreview(false);
        }
      }
    }

    void loadDiscountPreview();

    return () => {
      isCancelled = true;
    };
  }, [cartItems.length, subtotal]);

  function showTemporaryMessage(message: string) {
    setLastActionMessage(message);

    window.setTimeout(() => {
      setLastActionMessage(null);
    }, 2600);
  }

  function handleDecreaseQuantity(item: ShopCartItem) {
    const nextCart = updateShopCartItemQuantity(
      item.productId,
      item.quantity - 1
    );

    setCartItems(nextCart);

    if (item.quantity <= 1) {
      showTemporaryMessage(`â€ž${item.name}â€œ wurde aus dem Warenkorb entfernt.`);
      return;
    }

    showTemporaryMessage(`Menge von â€ž${item.name}â€œ wurde aktualisiert.`);
  }

  function handleIncreaseQuantity(item: ShopCartItem) {
    const nextCart = updateShopCartItemQuantity(
      item.productId,
      item.quantity + 1
    );

    setCartItems(nextCart);
    showTemporaryMessage(`Menge von â€ž${item.name}â€œ wurde aktualisiert.`);
  }

  function handleRemoveItem(item: ShopCartItem) {
    const nextCart = removeShopCartItem(item.productId);

    setCartItems(nextCart);
    showTemporaryMessage(`â€ž${item.name}â€œ wurde aus dem Warenkorb entfernt.`);
  }

  function handleClearCart() {
    const confirmed = window.confirm(
      "MÃ¶chtest Du den gesamten Warenkorb wirklich leeren?"
    );

    if (!confirmed) {
      return;
    }

    clearShopCart();
    setCartItems([]);
    setDiscountPreview(null);
    showTemporaryMessage("Der Warenkorb wurde geleert.");
  }

  return (
    <main className="min-h-screen bg-[#f7f1e8] text-[#172033]">
      <section className="border-b border-[#eadfce] bg-gradient-to-br from-[#fffaf2] via-[#f7f1e8] to-[#e8eef7]">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-5 py-10 md:px-8 lg:flex-row lg:items-center lg:justify-between lg:py-14">
          <div className="max-w-3xl">
            <Link
              href="/shop"
              className="mb-5 inline-flex rounded-full bg-white px-4 py-2 text-sm font-bold text-[#172033] shadow-sm ring-1 ring-[#eadfce] transition hover:bg-[#172033] hover:text-white"
            >
              â† ZurÃ¼ck zum Shop
            </Link>

            <p className="mb-3 inline-flex rounded-full bg-[#172033] px-4 py-2 text-sm font-semibold text-white shadow-sm">
              Schulmaterial-Shop Â· Warenkorb
            </p>

            <h1 className="text-4xl font-black tracking-tight text-[#172033] md:text-5xl">
              Dein Warenkorb.
            </h1>

            <p className="mt-5 max-w-2xl text-lg leading-8 text-[#4c5870]">
              Hier siehst Du alle Produkte, die Du aktuell ausgewÃ¤hlt hast. Du
              kannst Mengen Ã¤ndern oder Artikel wieder entfernen.
            </p>
          </div>

          <div className="rounded-[2rem] bg-white p-6 shadow-xl ring-1 ring-[#eadfce] lg:min-w-[360px]">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#9b2f23]">
              Zusammenfassung
            </p>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-[#f7f1e8] p-4">
                <p className="text-sm font-semibold text-[#5b667a]">Artikel</p>
                <p className="mt-1 text-3xl font-black text-[#172033]">
                  {cartCount}
                </p>
              </div>

              <div className="rounded-2xl bg-[#f7f1e8] p-4">
                <p className="text-sm font-semibold text-[#5b667a]">
                  Zwischensumme
                </p>
                <p className="mt-1 text-2xl font-black text-[#172033]">
                  {formatShopPrice(subtotal)}
                </p>
              </div>
            </div>

            {discountPreview?.hasCampaign ? (
              <div
                className={`mt-5 rounded-2xl p-4 text-sm font-bold leading-6 ring-1 ${
                  discountPreview.wouldApply
                    ? "bg-[#e7f7ec] text-[#246b3a] ring-[#bfe7c9]"
                    : "bg-[#fff8ea] text-[#8a5a00] ring-[#f1d7a3]"
                }`}
              >
                {discountInfoText}
              </div>
            ) : null}

            <div className="mt-5 rounded-2xl bg-[#e7f7ec] p-4 text-sm font-bold leading-6 text-[#246b3a] ring-1 ring-[#bfe7c9]">
              Im nÃ¤chsten Schritt gibst Du Deine Daten ein. Danach lÃ¤uft alles
              Ã¼ber die bestehende Rechnung & Zahlung.
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-5 py-8 md:px-8">
        {lastActionMessage ? (
          <div className="mb-5 rounded-2xl bg-[#e7f7ec] px-5 py-4 text-sm font-bold text-[#246b3a] ring-1 ring-[#bfe7c9]">
            {lastActionMessage}
          </div>
        ) : null}

        {cartItems.length === 0 ? (
          <div className="rounded-[2rem] bg-white p-8 text-center shadow-sm ring-1 ring-[#eadfce] md:p-12">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-[2rem] bg-[#f7f1e8] text-4xl">
              ðŸ›’
            </div>

            <h2 className="text-2xl font-black text-[#172033]">
              Dein Warenkorb ist noch leer.
            </h2>

            <p className="mx-auto mt-3 max-w-xl text-base leading-7 text-[#5b667a]">
              Suche im Shop nach Schulmaterial und lege passende Artikel in den
              Warenkorb.
            </p>

            <Link
              href="/shop"
              className="mt-7 inline-flex rounded-2xl bg-[#172033] px-6 py-4 text-sm font-black text-white shadow-sm transition hover:bg-[#9b2f23]"
            >
              Produkte ansehen
            </Link>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
            <div className="space-y-4">
              {cartItems.map((item) => {
                const lineTotal = item.price * item.quantity;

                return (
                  <article
                    key={item.productId}
                    className="overflow-hidden rounded-[2rem] bg-white shadow-sm ring-1 ring-[#eadfce]"
                  >
                    <div className="grid gap-0 md:grid-cols-[180px_1fr]">
                      <div className="flex aspect-[4/3] items-center justify-center bg-[#eef2f7] md:aspect-auto">
                        {item.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.imageUrl}
                            alt={item.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full min-h-[180px] w-full flex-col items-center justify-center px-6 text-center">
                            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-white text-3xl shadow-sm">
                              ðŸ“š
                            </div>
                            <p className="text-sm font-bold text-[#5b667a]">
                              Produktbild folgt
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col gap-5 p-5 md:p-6">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            {item.category ? (
                              <p className="mb-2 inline-flex rounded-full bg-[#f7f1e8] px-3 py-1 text-xs font-black text-[#4c5870]">
                                {item.category}
                              </p>
                            ) : null}

                            <h2 className="text-xl font-black leading-tight text-[#172033]">
                              {item.name}
                            </h2>

                            {item.sku ? (
                              <p className="mt-2 text-sm font-semibold text-[#7a8496]">
                                Art.-Nr.: {item.sku}
                              </p>
                            ) : null}

                            <div className="mt-4 flex flex-wrap gap-2">
                              {item.format ? (
                                <span className="rounded-full bg-[#f7f1e8] px-3 py-1.5 text-xs font-bold text-[#4c5870]">
                                  Format: {item.format}
                                </span>
                              ) : null}

                              {item.lineature ? (
                                <span className="rounded-full bg-[#f7f1e8] px-3 py-1.5 text-xs font-bold text-[#4c5870]">
                                  Lineatur: {item.lineature}
                                </span>
                              ) : null}

                              {item.color ? (
                                <span className="rounded-full bg-[#f7f1e8] px-3 py-1.5 text-xs font-bold text-[#4c5870]">
                                  Farbe: {item.color}
                                </span>
                              ) : null}

                              {item.sourceType ===
                              "reorder_from_school_list" ? (
                                <span className="rounded-full bg-[#e7f7ec] px-3 py-1.5 text-xs font-bold text-[#246b3a]">
                                  Nachkauf aus Liste
                                </span>
                              ) : null}
                            </div>
                          </div>

                          <div className="text-left lg:text-right">
                            <p className="text-sm font-bold uppercase tracking-[0.16em] text-[#9b2f23]">
                              Einzelpreis
                            </p>
                            <p className="mt-1 text-2xl font-black text-[#172033]">
                              {formatShopPrice(item.price)}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-col gap-4 border-t border-[#eadfce] pt-5 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => handleDecreaseQuantity(item)}
                              className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f7f1e8] text-xl font-black text-[#172033] ring-1 ring-[#eadfce] transition hover:bg-white"
                              aria-label="Menge verringern"
                            >
                              âˆ’
                            </button>

                            <div className="min-w-[70px] rounded-2xl bg-white px-4 py-3 text-center text-lg font-black text-[#172033] ring-1 ring-[#d8cdbb]">
                              {item.quantity}
                            </div>

                            <button
                              type="button"
                              onClick={() => handleIncreaseQuantity(item)}
                              className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#172033] text-xl font-black text-white transition hover:bg-[#9b2f23]"
                              aria-label="Menge erhÃ¶hen"
                            >
                              +
                            </button>
                          </div>

                          <div className="flex flex-col gap-3 sm:items-end">
                            <p className="text-lg font-black text-[#172033]">
                              Gesamt: {formatShopPrice(lineTotal)}
                            </p>

                            <button
                              type="button"
                              onClick={() => handleRemoveItem(item)}
                              className="text-sm font-black text-[#9b2f23] underline-offset-4 hover:underline"
                            >
                              Artikel entfernen
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            <aside className="h-fit rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-[#eadfce] lg:sticky lg:top-6">
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#9b2f23]">
                Bestellung vorbereiten
              </p>

              <h2 className="mt-3 text-2xl font-black text-[#172033]">
                Warenkorb-Summe
              </h2>

              <div className="mt-6 space-y-4">
                <div className="flex items-center justify-between border-b border-[#eadfce] pb-4 text-sm font-bold text-[#4c5870]">
                  <span>Artikelanzahl</span>
                  <span>{cartCount}</span>
                </div>

                <div className="flex items-center justify-between border-b border-[#eadfce] pb-4 text-sm font-bold text-[#4c5870]">
                  <span>Zwischensumme</span>
                  <span>{formatShopPrice(subtotal)}</span>
                </div>

                {discountPreview?.hasCampaign ? (
                  <div className="border-b border-[#eadfce] pb-4">
                    <div className="flex items-center justify-between gap-4 text-sm font-bold text-[#4c5870]">
                      <span>{getDiscountLabel(discountPreview)}</span>
                      <span
                        className={
                          discountPreview.wouldApply
                            ? "text-[#246b3a]"
                            : "text-[#8a5a00]"
                        }
                      >
                        {discountPreview.wouldApply
                          ? `-${formatShopPrice(discountAmount)}`
                          : "noch nicht aktiv"}
                      </span>
                    </div>

                    {discountInfoText ? (
                      <p
                        className={`mt-3 rounded-2xl px-4 py-3 text-sm font-bold leading-6 ${
                          discountPreview.wouldApply
                            ? "bg-[#e7f7ec] text-[#246b3a] ring-1 ring-[#bfe7c9]"
                            : "bg-[#fff8ea] text-[#8a5a00] ring-1 ring-[#f1d7a3]"
                        }`}
                      >
                        {discountInfoText}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {isLoadingDiscountPreview ? (
                  <div className="border-b border-[#eadfce] pb-4 text-sm font-bold text-[#7a8496]">
                    Rabatt wird geprÃ¼ft...
                  </div>
                ) : null}

                <div className="flex items-center justify-between text-lg font-black text-[#172033]">
                  <span>Gesamt vor Versand</span>
                  <span>{formatShopPrice(totalBeforeShipping)}</span>
                </div>
              </div>

              <div className="mt-6 rounded-2xl bg-[#f7f1e8] p-4 text-sm leading-6 text-[#5b667a]">
                Im nÃ¤chsten Schritt gibst Du Kundendaten und Ãœbergabeart ein.
                Danach wird automatisch eine Rechnung erzeugt und Du kannst
                PayPal oder Ãœberweisung nutzen.
              </div>

              <Link
                href="/shop/kasse"
                className="mt-5 flex w-full justify-center rounded-2xl bg-[#172033] px-5 py-4 text-sm font-black text-white shadow-sm transition hover:bg-[#9b2f23]"
              >
                Weiter zur Kasse
              </Link>

              <button
                type="button"
                onClick={handleClearCart}
                className="mt-3 w-full rounded-2xl bg-white px-5 py-4 text-sm font-black text-[#9b2f23] ring-1 ring-[#eadfce] transition hover:bg-[#fff7ed]"
              >
                Warenkorb leeren
              </button>

              <Link
                href="/shop"
                className="mt-3 flex w-full justify-center rounded-2xl bg-white px-5 py-4 text-sm font-black text-[#172033] ring-1 ring-[#eadfce] transition hover:bg-[#f7f1e8]"
              >
                Weiter einkaufen
              </Link>
            </aside>
          </div>
        )}
      </section>
    </main>
  );
}
