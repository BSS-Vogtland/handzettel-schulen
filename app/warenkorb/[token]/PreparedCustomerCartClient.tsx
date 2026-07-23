"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  PackageCheck,
  ShoppingCart,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  getShopCartCount,
  readShopCart,
  ShopCartItem,
  writeShopCart,
} from "@/app/shop/_lib/shopCart";
import {
  PreparedCartCheckoutContext,
  writePreparedCartCheckoutContext,
} from "@/app/shop/_lib/preparedCartCheckout";

type PreparedProduct = ShopCartItem & {
  preparedItemId: string;
  preparedPrice: number;
};

type UnavailableProduct = {
  id: string;
  productId: string;
  name: string;
  sku: string | null;
  quantity: number;
  reason: string;
};

type PreparedCartPayload = {
  id: string;
  token: string;
  title: string | null;
  customerName: string | null;
  email: string | null;
  phone: string | null;
  expiresAt: string | null;
  subtotalAmount: number;
  items: PreparedProduct[];
  unavailableItems: UnavailableProduct[];
  checkoutPrefill: PreparedCartCheckoutContext;
};

type ApiResponse = {
  ok?: boolean;
  message?: string;
  status?: string;
  alreadyOrdered?: boolean;
  title?: string | null;
  customerName?: string | null;
  orderedAt?: string | null;
  invoiceUrl?: string | null;
  cart?: PreparedCartPayload;
};

function formatMoney(value: unknown) {
  const parsed = Number(String(value ?? 0).replace(",", "."));

  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(Number.isFinite(parsed) ? parsed : 0);
}

function formatDate(value: string | null) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function mergeCartItems(
  existingItems: ShopCartItem[],
  preparedItems: PreparedProduct[]
) {
  const itemsByProductId = new Map<string, ShopCartItem>();

  for (const item of existingItems) {
    itemsByProductId.set(item.productId, item);
  }

  for (const preparedItem of preparedItems) {
    const existing = itemsByProductId.get(preparedItem.productId);

    if (existing) {
      itemsByProductId.set(preparedItem.productId, {
        ...existing,
        quantity: Math.min(
          99,
          existing.quantity + preparedItem.quantity
        ),
      });
      continue;
    }

    itemsByProductId.set(preparedItem.productId, {
      productId: preparedItem.productId,
      name: preparedItem.name,
      sku: preparedItem.sku,
      price: preparedItem.price,
      imageUrl: preparedItem.imageUrl,
      quantity: preparedItem.quantity,
      category: preparedItem.category,
      format: preparedItem.format,
      color: preparedItem.color,
      lineature: preparedItem.lineature,
      sourceType: "shop",
    });
  }

  return Array.from(itemsByProductId.values());
}

function preparedItemsToShopItems(
  preparedItems: PreparedProduct[]
): ShopCartItem[] {
  return preparedItems.map((item) => ({
    productId: item.productId,
    name: item.name,
    sku: item.sku,
    price: item.price,
    imageUrl: item.imageUrl,
    quantity: item.quantity,
    category: item.category,
    format: item.format,
    color: item.color,
    lineature: item.lineature,
    sourceType: "shop",
  }));
}

export default function PreparedCustomerCartClient({
  token,
}: {
  token: string;
}) {
  const router = useRouter();

  const [data, setData] = useState<ApiResponse | null>(null);
  const [existingCartCount, setExistingCartCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isTakingOver, setIsTakingOver] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(
    null
  );

  useEffect(() => {
    setExistingCartCount(getShopCartCount(readShopCart()));

    let cancelled = false;

    async function loadPreparedCart() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const response = await fetch(
          `/api/prepared-carts/${encodeURIComponent(token)}`,
          {
            method: "GET",
            cache: "no-store",
          }
        );

        const result = (await response.json()) as ApiResponse;

        if (cancelled) return;

        setData(result);

        if (!response.ok || !result.ok) {
          setErrorMessage(
            result.message ||
              "Der vorbereitete Warenkorb konnte nicht geladen werden."
          );
        }
      } catch (error) {
        if (cancelled) return;

        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Der vorbereitete Warenkorb konnte nicht geladen werden."
        );
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadPreparedCart();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const cart = data?.cart || null;

  const preparedCartCount = useMemo(() => {
    return (
      cart?.items.reduce((sum, item) => {
        return sum + item.quantity;
      }, 0) || 0
    );
  }, [cart]);

  function handleTakeOver(mode: "replace" | "merge") {
    if (!cart || cart.items.length === 0) {
      setErrorMessage(
        "Dieser vorbereitete Warenkorb enthält keine verfügbaren Produkte."
      );
      return;
    }

    setIsTakingOver(true);
    setErrorMessage(null);

    try {
      const preparedItems = preparedItemsToShopItems(cart.items);
      const nextCart =
        mode === "merge"
          ? mergeCartItems(readShopCart(), cart.items)
          : preparedItems;

      writeShopCart(nextCart);
      writePreparedCartCheckoutContext(cart.checkoutPrefill);

      router.push("/shop/warenkorb");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Der Warenkorb konnte nicht übernommen werden."
      );
      setIsTakingOver(false);
    }
  }

  if (isLoading) {
    return (
      <main className="min-h-screen bg-[#f7f1e8] px-5 py-16 text-[#172033]">
        <div className="mx-auto max-w-3xl rounded-[2rem] bg-white p-10 text-center shadow-xl ring-1 ring-[#eadfce]">
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-[#9b2f23]" />
          <h1 className="mt-5 text-2xl font-black">
            Dein Warenkorb wird geladen.
          </h1>
          <p className="mt-2 text-sm font-semibold text-[#5b667a]">
            Wir prüfen dabei auch aktuelle Preise und Verfügbarkeit.
          </p>
        </div>
      </main>
    );
  }

  if (data?.alreadyOrdered) {
    return (
      <main className="min-h-screen bg-[#f7f1e8] px-5 py-16 text-[#172033]">
        <div className="mx-auto max-w-3xl rounded-[2rem] bg-white p-8 text-center shadow-xl ring-1 ring-[#eadfce] md:p-12">
          <CheckCircle2 className="mx-auto h-14 w-14 text-[#2F7D50]" />

          <p className="mt-5 text-sm font-black uppercase tracking-[0.16em] text-[#2F7D50]">
            Bereits bestellt
          </p>

          <h1 className="mt-2 text-3xl font-black">
            Dieser Warenkorb wurde bereits bestellt.
          </h1>

          <p className="mt-4 text-sm font-semibold leading-6 text-[#5b667a]">
            {data.orderedAt
              ? `Bestellt am ${formatDate(data.orderedAt)}.`
              : "Die Bestellung wurde bereits erfolgreich angelegt."}
          </p>

          {data.invoiceUrl ? (
            <Link
              href={data.invoiceUrl}
              className="mt-7 inline-flex rounded-2xl bg-[#172033] px-6 py-4 text-sm font-black text-white"
            >
              Rechnung und Zahlung öffnen
            </Link>
          ) : (
            <Link
              href="/"
              className="mt-7 inline-flex rounded-2xl bg-[#172033] px-6 py-4 text-sm font-black text-white"
            >
              Zur Startseite
            </Link>
          )}
        </div>
      </main>
    );
  }

  if (errorMessage || !cart) {
    return (
      <main className="min-h-screen bg-[#f7f1e8] px-5 py-16 text-[#172033]">
        <div className="mx-auto max-w-3xl rounded-[2rem] bg-white p-8 text-center shadow-xl ring-1 ring-[#eadfce] md:p-12">
          <AlertTriangle className="mx-auto h-14 w-14 text-[#B5282D]" />

          <h1 className="mt-5 text-3xl font-black">
            Warenkorb nicht verfügbar
          </h1>

          <p className="mt-4 text-sm font-semibold leading-6 text-[#5b667a]">
            {errorMessage ||
              "Dieser Warenkorb-Link ist ungültig oder abgelaufen."}
          </p>

          <Link
            href="/"
            className="mt-7 inline-flex rounded-2xl bg-[#172033] px-6 py-4 text-sm font-black text-white"
          >
            Zur Startseite
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f1e8] text-[#172033]">
      <section className="border-b border-[#eadfce] bg-gradient-to-br from-[#fffaf2] via-[#f7f1e8] to-[#e8eef7]">
        <div className="mx-auto w-full max-w-6xl px-5 py-10 md:px-8 lg:py-14">
          <div className="inline-flex items-center gap-2 rounded-full bg-[#172033] px-4 py-2 text-sm font-bold text-white">
            <PackageCheck className="h-4 w-4" />
            Für Dich vorbereitet
          </div>

          <h1 className="mt-5 text-4xl font-black tracking-tight md:text-5xl">
            {cart.title || "Dein vorbereiteter Warenkorb"}
          </h1>

          <p className="mt-4 max-w-3xl text-lg leading-8 text-[#4c5870]">
            Wir haben passende Produkte für Dich zusammengestellt. Prüfe
            die Artikel und übernimm sie anschließend in den normalen
            Shop-Warenkorb. Dort kannst Du Mengen ändern, weitere Produkte
            ergänzen oder Artikel entfernen.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <span className="rounded-2xl bg-white px-4 py-3 text-sm font-black shadow-sm ring-1 ring-[#eadfce]">
              {preparedCartCount} Artikel
            </span>

            <span className="rounded-2xl bg-white px-4 py-3 text-sm font-black shadow-sm ring-1 ring-[#eadfce]">
              Warenwert {formatMoney(cart.subtotalAmount)}
            </span>

            {cart.expiresAt ? (
              <span className="rounded-2xl bg-white px-4 py-3 text-sm font-black shadow-sm ring-1 ring-[#eadfce]">
                Gültig bis {formatDate(cart.expiresAt)}
              </span>
            ) : null}
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-6xl gap-6 px-5 py-8 md:px-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          {cart.items.map((item) => (
            <article
              key={item.productId}
              className="overflow-hidden rounded-[2rem] bg-white shadow-sm ring-1 ring-[#eadfce]"
            >
              <div className="grid md:grid-cols-[180px_1fr]">
                <div className="flex min-h-[180px] items-center justify-center bg-[#eef2f7]">
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <ShoppingCart className="h-10 w-10 text-[#9b2f23]" />
                  )}
                </div>

                <div className="p-5 md:p-6">
                  {item.category ? (
                    <span className="inline-flex rounded-full bg-[#f7f1e8] px-3 py-1 text-xs font-black text-[#4c5870]">
                      {item.category}
                    </span>
                  ) : null}

                  <h2 className="mt-3 text-xl font-black">
                    {item.name}
                  </h2>

                  {item.sku ? (
                    <p className="mt-2 text-sm font-semibold text-[#7a8496]">
                      Art.-Nr.: {item.sku}
                    </p>
                  ) : null}

                  <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-[#4c5870]">
                    {item.format ? (
                      <span className="rounded-full bg-[#f7f1e8] px-3 py-1.5">
                        Format: {item.format}
                      </span>
                    ) : null}

                    {item.lineature ? (
                      <span className="rounded-full bg-[#f7f1e8] px-3 py-1.5">
                        Lineatur: {item.lineature}
                      </span>
                    ) : null}

                    {item.color ? (
                      <span className="rounded-full bg-[#f7f1e8] px-3 py-1.5">
                        Farbe: {item.color}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-5 flex items-end justify-between gap-4 border-t border-[#eadfce] pt-5">
                    <div>
                      <p className="text-sm font-bold text-[#5b667a]">
                        Menge: {item.quantity}
                      </p>
                      <p className="mt-1 text-sm font-bold text-[#5b667a]">
                        Einzelpreis: {formatMoney(item.price)}
                      </p>
                    </div>

                    <p className="text-xl font-black">
                      {formatMoney(item.price * item.quantity)}
                    </p>
                  </div>
                </div>
              </div>
            </article>
          ))}

          {cart.unavailableItems.length > 0 ? (
            <section className="rounded-[2rem] border border-[#F1D1A8] bg-[#FFF8EE] p-5">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#A75B28]" />

                <div>
                  <h2 className="font-black text-[#8A4A1F]">
                    Nicht verfügbare Artikel
                  </h2>

                  <p className="mt-1 text-sm font-semibold leading-6 text-[#8A4A1F]">
                    Diese Artikel werden nicht in den Shop-Warenkorb
                    übernommen:
                  </p>

                  <div className="mt-3 space-y-2">
                    {cart.unavailableItems.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-2xl bg-white px-4 py-3"
                      >
                        <p className="font-black">{item.name}</p>
                        <p className="mt-1 text-xs font-semibold text-[#8A4A1F]">
                          {item.reason}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          ) : null}
        </div>

        <aside className="h-fit rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-[#eadfce] lg:sticky lg:top-6">
          <p className="text-sm font-black uppercase tracking-[0.16em] text-[#9b2f23]">
            Warenkorb übernehmen
          </p>

          <h2 className="mt-3 text-2xl font-black">
            {formatMoney(cart.subtotalAmount)}
          </h2>

          <p className="mt-3 text-sm font-semibold leading-6 text-[#5b667a]">
            Im nächsten Schritt kannst Du die Zusammenstellung noch
            vollständig bearbeiten. Erst an der Kasse wird verbindlich
            bestellt.
          </p>

          {existingCartCount > 0 ? (
            <div className="mt-5 rounded-2xl border border-[#F1D1A8] bg-[#FFF8EE] p-4">
              <p className="font-black text-[#8A4A1F]">
                Bereits Artikel im Shop-Warenkorb
              </p>
              <p className="mt-1 text-sm font-semibold leading-6 text-[#8A4A1F]">
                Dein aktueller Warenkorb enthält bereits {existingCartCount}{" "}
                Artikel. Du kannst ihn ergänzen oder ersetzen.
              </p>
            </div>
          ) : null}

          {cart.items.length > 0 ? (
            <div className="mt-6 space-y-3">
              {existingCartCount > 0 ? (
                <button
                  type="button"
                  onClick={() => handleTakeOver("merge")}
                  disabled={isTakingOver}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#2F7D50] px-5 py-4 text-sm font-black text-white disabled:opacity-60"
                >
                  {isTakingOver ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  Bestehenden Warenkorb ergänzen
                </button>
              ) : null}

              <button
                type="button"
                onClick={() => handleTakeOver("replace")}
                disabled={isTakingOver}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#172033] px-5 py-4 text-sm font-black text-white disabled:opacity-60"
              >
                {isTakingOver ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ShoppingCart className="h-4 w-4" />
                )}

                {existingCartCount > 0
                  ? "Warenkorb ersetzen"
                  : "In meinen Warenkorb übernehmen"}
              </button>
            </div>
          ) : (
            <div className="mt-6 rounded-2xl bg-[#FFF1F1] p-4 text-sm font-bold text-[#B5282D]">
              Aktuell ist kein Produkt aus dieser Zusammenstellung
              verfügbar.
            </div>
          )}

          <p className="mt-4 text-xs font-semibold leading-5 text-[#7a8496]">
            Preise und Produktverfügbarkeit werden beim Bestellabschluss
            erneut serverseitig geprüft.
          </p>
        </aside>
      </section>
    </main>
  );
}