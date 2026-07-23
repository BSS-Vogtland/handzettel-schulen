"use client";

import Link from "next/link";
import PreparedCartCommunicationPanel from "@/components/PreparedCartCommunicationPanel";
import {
  ClipboardCopy,
  Loader2,
  Minus,
  PackagePlus,
  Plus,
  RefreshCw,
  Search,
  ShoppingCart,
  Trash2,
  UserRound,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type PreparedCartItem = {
  id: string;
  cart_id: string;
  product_id: string;
  quantity: number | string;
  product_name_snapshot: string;
  product_sku_snapshot: string | null;
  unit_price_snapshot: number | string;
  image_url_snapshot: string | null;
  category_snapshot: string | null;
  format_snapshot: string | null;
  color_snapshot: string | null;
  lineature_snapshot: string | null;
  admin_note: string | null;
};

type PreparedCart = {
  id: string;
  token: string;
  source_request_id: string | null;
  ordered_request_id: string | null;
  title: string | null;
  status: string;

  customer_name: string | null;
  email: string | null;
  phone: string | null;

  child_name: string | null;
  school_name: string | null;
  class_name: string | null;

  fulfillment_method: string | null;
  payment_method: string | null;

  expires_at: string;
  created_at: string;
  customerUrl: string | null;

  items: PreparedCartItem[];
};

type CustomerOption = {
  id: string;
  request_number: string | null;
  customer_name: string | null;
  email: string | null;
  phone: string | null;
  child_name: string | null;
  school_name: string | null;
  class_name: string | null;
  created_at: string | null;
};

type ProductSearchResult = {
  id: string;
  productName: string;
  productSku: string | null;
  productPrice: number;
  imageUrl: string | null;
  category: string | null;
  productType: string | null;
  format: string | null;
  color: string | null;
  lineature: string | null;
};

type LoadResponse = {
  ok?: boolean;
  message?: string;
  carts?: PreparedCart[];
  customers?: CustomerOption[];
};

function formatMoney(value: unknown) {
  const parsed = Number(String(value ?? 0).replace(",", "."));

  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(Number.isFinite(parsed) ? parsed : 0);
}

function formatDateTime(value: string | null) {
  if (!value) return "â€”";

  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function toQuantity(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.max(1, Math.min(99, Math.floor(parsed)))
    : 1;
}

function getStatusLabel(status: string) {
  switch (status) {
    case "draft":
      return "Entwurf";
    case "sent":
      return "Gesendet";
    case "opened":
      return "GeÃ¶ffnet";
    case "edited":
      return "Bearbeitet";
    case "ordered":
      return "Bestellt";
    case "expired":
      return "Abgelaufen";
    case "cancelled":
      return "ZurÃ¼ckgezogen";
    default:
      return status;
  }
}

function getStatusClasses(status: string) {
  switch (status) {
    case "ordered":
      return "border-[#BFE3CD] bg-[#F0FFF6] text-[#2F7D50]";
    case "sent":
    case "opened":
    case "edited":
      return "border-[#C8D8E8] bg-[#EEF4FA] text-[#12395F]";
    case "expired":
    case "cancelled":
      return "border-[#F2B8B8] bg-[#FFF1F1] text-[#B5282D]";
    default:
      return "border-[#E8DED2] bg-white text-[#52616F]";
  }
}

export default function AdminPreparedCartsClient() {
  const [carts, setCarts] = useState<PreparedCart[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);

  const [selectedCartId, setSelectedCartId] = useState<string | null>(null);

  const [sourceRequestId, setSourceRequestId] = useState("");
  const [title, setTitle] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("30");

  const [productQuery, setProductQuery] = useState("");
  const [productResults, setProductResults] = useState<ProductSearchResult[]>([]);
  const [productQuantities, setProductQuantities] = useState<
    Record<string, number>
  >({});

  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedCart =
    carts.find((cart) => cart.id === selectedCartId) || null;

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/admin/prepared-carts", {
        method: "GET",
        cache: "no-store",
      });

      const result = (await response.json()) as LoadResponse;

      if (!response.ok || !result.ok) {
        setErrorMessage(
          result.message ||
            "Vorbereitete WarenkÃ¶rbe konnten nicht geladen werden."
        );
        return;
      }

      const nextCarts = result.carts || [];

      setCarts(nextCarts);
      setCustomers(result.customers || []);

      setSelectedCartId((current) => {
        if (current && nextCarts.some((cart) => cart.id === current)) {
          return current;
        }

        return nextCarts[0]?.id || null;
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Vorbereitete WarenkÃ¶rbe konnten nicht geladen werden."
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const selectedCartTotal = useMemo(() => {
    if (!selectedCart) return 0;

    return selectedCart.items.reduce((sum, item) => {
      return (
        sum +
        toQuantity(item.quantity) *
          Number(String(item.unit_price_snapshot).replace(",", "."))
      );
    }, 0);
  }, [selectedCart]);

  function handleCustomerSelection(requestId: string) {
    setSourceRequestId(requestId);

    const customer = customers.find((entry) => entry.id === requestId);

    if (!customer) return;

    setCustomerName(customer.customer_name || "");
    setEmail(customer.email || "");
    setPhone(customer.phone || "");

    if (!title.trim()) {
      setTitle(
        customer.customer_name
          ? `Warenkorb fÃ¼r ${customer.customer_name}`
          : ""
      );
    }
  }

  async function handleCreateCart() {
    setSuccessMessage(null);
    setErrorMessage(null);

    if (!customerName.trim()) {
      setErrorMessage("Bitte gib einen Kundennamen ein.");
      return;
    }

    if (!email.trim() || !email.includes("@")) {
      setErrorMessage("Bitte gib eine gÃ¼ltige E-Mail-Adresse ein.");
      return;
    }

    setIsCreating(true);

    try {
      const response = await fetch("/api/admin/prepared-carts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sourceRequestId: sourceRequestId || null,
          title,
          customerName,
          email,
          phone,
          expiresInDays,
        }),
      });

      const result = (await response.json()) as {
        ok?: boolean;
        message?: string;
        cart?: PreparedCart;
      };

      if (!response.ok || !result.ok || !result.cart) {
        setErrorMessage(
          result.message ||
            "Der vorbereitete Warenkorb konnte nicht erstellt werden."
        );
        return;
      }

      setCarts((current) => [result.cart as PreparedCart, ...current]);
      setSelectedCartId(result.cart.id);

      setSourceRequestId("");
      setTitle("");
      setCustomerName("");
      setEmail("");
      setPhone("");
      setExpiresInDays("30");

      setSuccessMessage("Der vorbereitete Warenkorb wurde angelegt.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Der vorbereitete Warenkorb konnte nicht erstellt werden."
      );
    } finally {
      setIsCreating(false);
    }
  }

  async function handleProductSearch() {
    const query = productQuery.trim();

    setSuccessMessage(null);
    setErrorMessage(null);

    if (query.length < 2) {
      setProductResults([]);
      setErrorMessage("Bitte gib mindestens zwei Zeichen ein.");
      return;
    }

    setIsSearching(true);

    try {
      const response = await fetch(
        `/api/admin/products/search?q=${encodeURIComponent(query)}`,
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const result = (await response.json()) as {
        ok?: boolean;
        message?: string;
        products?: ProductSearchResult[];
      };

      if (!response.ok || !result.ok) {
        setErrorMessage(
          result.message || "Produkte konnten nicht gesucht werden."
        );
        return;
      }

      setProductResults(result.products || []);
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

  async function handleAddProduct(product: ProductSearchResult) {
    if (!selectedCart) {
      setErrorMessage("Bitte wÃ¤hle zuerst einen vorbereiteten Warenkorb aus.");
      return;
    }

    const busyId = `add-${product.id}`;
    setBusyKey(busyId);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const response = await fetch(
        `/api/admin/prepared-carts/${encodeURIComponent(
          selectedCart.id
        )}/items`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            productId: product.id,
            quantity: productQuantities[product.id] || 1,
          }),
        }
      );

      const result = (await response.json()) as {
        ok?: boolean;
        message?: string;
      };

      if (!response.ok || !result.ok) {
        setErrorMessage(
          result.message || "Das Produkt konnte nicht hinzugefÃ¼gt werden."
        );
        return;
      }

      setSuccessMessage(
        result.message || "Das Produkt wurde zum Warenkorb hinzugefÃ¼gt."
      );

      await loadData();
      setSelectedCartId(selectedCart.id);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Das Produkt konnte nicht hinzugefÃ¼gt werden."
      );
    } finally {
      setBusyKey(null);
    }
  }

  async function handleUpdateQuantity(
    item: PreparedCartItem,
    nextQuantity: number
  ) {
    if (!selectedCart) return;

    const safeQuantity = Math.max(1, Math.min(99, nextQuantity));
    const busyId = `quantity-${item.id}`;

    setBusyKey(busyId);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const response = await fetch(
        `/api/admin/prepared-carts/${encodeURIComponent(
          selectedCart.id
        )}/items/${encodeURIComponent(item.id)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            quantity: safeQuantity,
            adminNote: item.admin_note,
          }),
        }
      );

      const result = (await response.json()) as {
        ok?: boolean;
        message?: string;
      };

      if (!response.ok || !result.ok) {
        setErrorMessage(
          result.message || "Die Menge konnte nicht aktualisiert werden."
        );
        return;
      }

      setCarts((current) =>
        current.map((cart) => {
          if (cart.id !== selectedCart.id) return cart;

          return {
            ...cart,
            items: cart.items.map((currentItem) =>
              currentItem.id === item.id
                ? {
                    ...currentItem,
                    quantity: safeQuantity,
                  }
                : currentItem
            ),
          };
        })
      );

      setSuccessMessage("Die Menge wurde aktualisiert.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Die Menge konnte nicht aktualisiert werden."
      );
    } finally {
      setBusyKey(null);
    }
  }

  async function handleDeleteItem(item: PreparedCartItem) {
    if (!selectedCart) return;

    const confirmed = window.confirm(
      `Soll â€ž${item.product_name_snapshot}â€œ aus dem vorbereiteten Warenkorb entfernt werden?`
    );

    if (!confirmed) return;

    const busyId = `delete-${item.id}`;

    setBusyKey(busyId);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const response = await fetch(
        `/api/admin/prepared-carts/${encodeURIComponent(
          selectedCart.id
        )}/items/${encodeURIComponent(item.id)}`,
        {
          method: "DELETE",
        }
      );

      const result = (await response.json()) as {
        ok?: boolean;
        message?: string;
      };

      if (!response.ok || !result.ok) {
        setErrorMessage(
          result.message ||
            "Die Warenkorbposition konnte nicht entfernt werden."
        );
        return;
      }

      setCarts((current) =>
        current.map((cart) => {
          if (cart.id !== selectedCart.id) return cart;

          return {
            ...cart,
            items: cart.items.filter(
              (currentItem) => currentItem.id !== item.id
            ),
          };
        })
      );

      setSuccessMessage("Die Warenkorbposition wurde entfernt.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Die Warenkorbposition konnte nicht entfernt werden."
      );
    } finally {
      setBusyKey(null);
    }
  }

  async function handleDeleteCart(cart: PreparedCart) {
    if (cart.status === "ordered") {
      setSuccessMessage(null);
      setErrorMessage(
        "Bereits bestellte WarenkÃ¶rbe kÃ¶nnen nicht gelÃ¶scht werden."
      );
      return;
    }

    const cartLabel =
      cart.title ||
      cart.customer_name ||
      "diesen vorbereiteten Warenkorb";

    const confirmed = window.confirm(
      `Soll â€ž${cartLabel}â€œ wirklich vollstÃ¤ndig gelÃ¶scht werden?

Dabei werden auch alle enthaltenen Warenkorbpositionen gelÃ¶scht.`
    );

    if (!confirmed) return;

    const busyId = `delete-cart-${cart.id}`;

    setBusyKey(busyId);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const response = await fetch(
        `/api/admin/prepared-carts/${encodeURIComponent(cart.id)}`,
        {
          method: "DELETE",
        }
      );

      const result = (await response.json()) as {
        ok?: boolean;
        message?: string;
      };

      if (!response.ok || !result.ok) {
        setErrorMessage(
          result.message ||
            "Der vorbereitete Warenkorb konnte nicht gelÃ¶scht werden."
        );
        return;
      }

      setCarts((current) => {
        const nextCarts = current.filter(
          (currentCart) => currentCart.id !== cart.id
        );

        if (selectedCartId === cart.id) {
          setSelectedCartId(nextCarts[0]?.id || null);
        }

        return nextCarts;
      });

      setSuccessMessage(
        result.message ||
          "Der vorbereitete Warenkorb wurde gelÃ¶scht."
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Der vorbereitete Warenkorb konnte nicht gelÃ¶scht werden."
      );
    } finally {
      setBusyKey(null);
    }
  }

  async function handleCopyLink() {
    if (!selectedCart?.customerUrl) return;

    try {
      await navigator.clipboard.writeText(selectedCart.customerUrl);
      setSuccessMessage("Der Kundenlink wurde kopiert.");
      setErrorMessage(null);
    } catch {
      setErrorMessage(
        "Der Link konnte nicht automatisch kopiert werden. Bitte markiere ihn manuell."
      );
    }
  }

  return (
    <div className="grid gap-6">
      {errorMessage ? (
        <div className="rounded-2xl border border-[#F2B8B8] bg-[#FFF1F1] px-5 py-4 text-sm font-bold text-[#B5282D]">
          {errorMessage}
        </div>
      ) : null}

      {successMessage ? (
        <div className="rounded-2xl border border-[#BFE3CD] bg-[#F0FFF6] px-5 py-4 text-sm font-bold text-[#2F7D50]">
          {successMessage}
        </div>
      ) : null}

      <section className="rounded-[32px] border border-[#E8DED2] bg-white p-5 shadow-sm sm:p-7">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-3xl bg-[#FBF7F0] text-[#A75B28]">
            <UserRound className="h-5 w-5" />
          </div>

          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
              Neuer Bestandskunden-Warenkorb
            </p>
            <h2 className="mt-1 text-2xl font-black text-[#102A43]">
              Kundendaten Ã¼bernehmen oder neu eingeben
            </h2>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-black text-[#102A43]">
              Bestehenden Kunden auswÃ¤hlen
            </label>

            <select
              value={sourceRequestId}
              onChange={(event) =>
                handleCustomerSelection(event.target.value)
              }
              className="w-full rounded-2xl border border-[#D8C8B8] bg-[#FBF7F0] px-4 py-4 text-sm font-bold text-[#102A43] outline-none focus:border-[#12395F]"
            >
              <option value="">Kundendaten manuell eingeben</option>

              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.customer_name || "Ohne Namen"}
                  {customer.email ? ` Â· ${customer.email}` : ""}
                  {customer.request_number
                    ? ` Â· ${customer.request_number}`
                    : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-black text-[#102A43]">
              Interner Titel
            </label>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="z. B. Nachbestellung Familie MÃ¼ller"
              className="w-full rounded-2xl border border-[#D8C8B8] bg-[#FBF7F0] px-4 py-4 text-sm font-bold text-[#102A43] outline-none focus:border-[#12395F]"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-black text-[#102A43]">
              GÃ¼ltigkeit in Tagen
            </label>
            <input
              type="number"
              min={1}
              max={365}
              value={expiresInDays}
              onChange={(event) => setExpiresInDays(event.target.value)}
              className="w-full rounded-2xl border border-[#D8C8B8] bg-[#FBF7F0] px-4 py-4 text-sm font-bold text-[#102A43] outline-none focus:border-[#12395F]"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-black text-[#102A43]">
              Kundenname *
            </label>
            <input
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              className="w-full rounded-2xl border border-[#D8C8B8] bg-[#FBF7F0] px-4 py-4 text-sm font-bold text-[#102A43] outline-none focus:border-[#12395F]"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-black text-[#102A43]">
              E-Mail *
            </label>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-2xl border border-[#D8C8B8] bg-[#FBF7F0] px-4 py-4 text-sm font-bold text-[#102A43] outline-none focus:border-[#12395F]"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-black text-[#102A43]">
              Telefon
            </label>
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className="w-full rounded-2xl border border-[#D8C8B8] bg-[#FBF7F0] px-4 py-4 text-sm font-bold text-[#102A43] outline-none focus:border-[#12395F]"
            />
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={handleCreateCart}
              disabled={isCreating}
              className="inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl bg-[#2F7D50] px-5 py-4 text-sm font-black text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isCreating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <PackagePlus className="h-4 w-4" />
              )}

              Warenkorb anlegen
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <aside className="rounded-[32px] border border-[#E8DED2] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
                Vorbereitete WarenkÃ¶rbe
              </p>
              <p className="mt-1 text-2xl font-black text-[#102A43]">
                {carts.length}
              </p>
            </div>

            <button
              type="button"
              onClick={() => void loadData()}
              disabled={isLoading}
              className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[#D6E7EF] bg-white text-[#12395F]"
              aria-label="Aktualisieren"
            >
              <RefreshCw
                className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
              />
            </button>
          </div>

          <div className="mt-5 space-y-3">
            {isLoading ? (
              <div className="rounded-2xl bg-[#FBF7F0] p-4 text-sm font-bold text-[#52616F]">
                WarenkÃ¶rbe werden geladen â€¦
              </div>
            ) : null}

            {!isLoading && carts.length === 0 ? (
              <div className="rounded-2xl bg-[#FBF7F0] p-4 text-sm font-bold text-[#52616F]">
                Noch kein vorbereiteter Warenkorb vorhanden.
              </div>
            ) : null}

            {carts.map((cart) => {
              const isSelected = cart.id === selectedCartId;
              const itemCount = cart.items.reduce(
                (sum, item) => sum + toQuantity(item.quantity),
                0
              );

              const cartDeleteBusy =
                busyKey === `delete-cart-${cart.id}`;

              return (
                <div
                  key={cart.id}
                  className={`rounded-2xl border transition ${
                    isSelected
                      ? "border-[#12395F] bg-[#EEF4FA]"
                      : "border-[#E8DED2] bg-[#FBF7F0] hover:bg-white"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedCartId(cart.id)}
                    className="w-full p-4 text-left"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full border px-3 py-1 text-[11px] font-black ${getStatusClasses(
                          cart.status
                        )}`}
                      >
                        {getStatusLabel(cart.status)}
                      </span>

                      <span className="rounded-full bg-white px-3 py-1 text-[11px] font-black text-[#52616F]">
                        {itemCount} Artikel
                      </span>
                    </div>

                    <p className="mt-3 font-black text-[#102A43]">
                      {cart.title ||
                        cart.customer_name ||
                        "Vorbereiteter Warenkorb"}
                    </p>

                    <p className="mt-1 text-xs font-semibold text-[#52616F]">
                      {cart.email || "Keine E-Mail"}
                    </p>

                    <p className="mt-2 text-[11px] font-bold text-[#52616F]">
                      Erstellt: {formatDateTime(cart.created_at)}
                    </p>
                  </button>

                  <div className="border-t border-[#E8DED2] px-3 py-3">
                    <button
                      type="button"
                      onClick={() => void handleDeleteCart(cart)}
                      disabled={
                        cartDeleteBusy || cart.status === "ordered"
                      }
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#F2B8B8] bg-[#FFF1F1] px-3 py-2.5 text-xs font-black text-[#B5282D] transition hover:bg-[#FFE4E4] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {cartDeleteBusy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}

                      {cart.status === "ordered"
                        ? "Bestellter Warenkorb"
                        : "Warenkorb lÃ¶schen"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        <div className="space-y-6">
          {!selectedCart ? (
            <section className="rounded-[32px] border border-[#E8DED2] bg-white p-7 text-center shadow-sm">
              <ShoppingCart className="mx-auto h-10 w-10 text-[#A75B28]" />
              <h2 className="mt-4 text-2xl font-black text-[#102A43]">
                Kein Warenkorb ausgewÃ¤hlt
              </h2>
              <p className="mt-2 text-sm font-semibold text-[#52616F]">
                Lege einen Warenkorb an oder wÃ¤hle links einen vorhandenen aus.
              </p>
            </section>
          ) : (
            <>
              <section className="rounded-[32px] border border-[#D6E7EF] bg-[#F5FAFD] p-5 shadow-sm sm:p-6">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-black ${getStatusClasses(
                          selectedCart.status
                        )}`}
                      >
                        {getStatusLabel(selectedCart.status)}
                      </span>

                      <span className="rounded-full border border-[#D6E7EF] bg-white px-3 py-1 text-xs font-black text-[#12395F]">
                        gÃ¼ltig bis {formatDateTime(selectedCart.expires_at)}
                      </span>
                    </div>

                    <h2 className="mt-3 text-2xl font-black text-[#102A43]">
                      {selectedCart.title ||
                        selectedCart.customer_name ||
                        "Vorbereiteter Warenkorb"}
                    </h2>

                    <p className="mt-2 text-sm font-semibold text-[#52616F]">
                      {selectedCart.customer_name || "Kein Kundenname"}
                      {selectedCart.email
                        ? ` Â· ${selectedCart.email}`
                        : ""}
                      {selectedCart.phone
                        ? ` Â· ${selectedCart.phone}`
                        : ""}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-[#D6E7EF] bg-white p-4 lg:min-w-[240px]">
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-[#12395F]">
                      Warenwert
                    </p>
                    <p className="mt-1 text-2xl font-black text-[#102A43]">
                      {formatMoney(selectedCartTotal)}
                    </p>
                  </div>
                </div>

                {selectedCart.customerUrl ? (
                  <div className="mt-5 rounded-2xl border border-[#D6E7EF] bg-white p-4">
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-[#12395F]">
                      Kundenlink
                    </p>

                    <p className="mt-2 break-all text-sm font-semibold text-[#52616F]">
                      {selectedCart.customerUrl}
                    </p>

                    <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                      <button
                        type="button"
                        onClick={handleCopyLink}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#12395F] px-4 py-3 text-sm font-black text-white"
                      >
                        <ClipboardCopy className="h-4 w-4" />
                        Link kopieren
                      </button>

                      <a
                        href={selectedCart.customerUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center rounded-2xl border border-[#D6E7EF] bg-white px-4 py-3 text-sm font-black text-[#12395F]"
                      >
                        Kundenlink Ã¶ffnen
                      </a>
                    </div>
                  </div>
                ) : null}

                <PreparedCartCommunicationPanel
                  cart={selectedCart}
                  onChanged={async () => {
                    await loadData();
                    setSelectedCartId(selectedCart.id);
                  }}
                />
              </section>

              <section className="rounded-[32px] border border-[#E8DED2] bg-white p-5 shadow-sm sm:p-6">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#FBF7F0] text-[#A75B28]">
                    <Search className="h-5 w-5" />
                  </div>

                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
                      Produkt hinzufÃ¼gen
                    </p>
                    <h2 className="mt-1 text-xl font-black text-[#102A43]">
                      Produktkatalog durchsuchen
                    </h2>
                  </div>
                </div>

                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                  <input
                    value={productQuery}
                    onChange={(event) =>
                      setProductQuery(event.target.value)
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void handleProductSearch();
                      }
                    }}
                    placeholder="Produktname, Artikelnummer, Format, Farbe â€¦"
                    className="min-h-12 flex-1 rounded-2xl border border-[#D8C8B8] bg-[#FBF7F0] px-4 py-3 text-sm font-bold text-[#102A43] outline-none focus:border-[#12395F]"
                  />

                  <button
                    type="button"
                    onClick={() => void handleProductSearch()}
                    disabled={isSearching}
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#102A43] px-5 py-3 text-sm font-black text-white disabled:opacity-60"
                  >
                    {isSearching ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                    Suchen
                  </button>
                </div>

                {productResults.length > 0 ? (
                  <div className="mt-5 grid gap-3">
                    {productResults.map((product) => {
                      const quantity =
                        productQuantities[product.id] || 1;
                      const addBusy = busyKey === `add-${product.id}`;

                      return (
                        <article
                          key={product.id}
                          className="rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] p-4"
                        >
                          <div className="grid gap-4 sm:grid-cols-[80px_1fr_auto] sm:items-center">
                            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl bg-white">
                              {product.imageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={product.imageUrl}
                                  alt={product.productName}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <ShoppingCart className="h-6 w-6 text-[#A75B28]" />
                              )}
                            </div>

                            <div>
                              <p className="font-black text-[#102A43]">
                                {product.productName}
                              </p>

                              <p className="mt-1 text-xs font-semibold text-[#52616F]">
                                {product.productSku
                                  ? `Art.-Nr.: ${product.productSku}`
                                  : "Ohne Artikelnummer"}
                              </p>

                              <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-bold text-[#52616F]">
                                {product.category ? (
                                  <span className="rounded-full bg-white px-3 py-1">
                                    {product.category}
                                  </span>
                                ) : null}

                                {product.format ? (
                                  <span className="rounded-full bg-white px-3 py-1">
                                    Format: {product.format}
                                  </span>
                                ) : null}

                                {product.color ? (
                                  <span className="rounded-full bg-white px-3 py-1">
                                    Farbe: {product.color}
                                  </span>
                                ) : null}
                              </div>

                              <p className="mt-3 text-lg font-black text-[#102A43]">
                                {formatMoney(product.productPrice)}
                              </p>
                            </div>

                            <div className="flex flex-col gap-2">
                              <input
                                type="number"
                                min={1}
                                max={99}
                                value={quantity}
                                onChange={(event) =>
                                  setProductQuantities((current) => ({
                                    ...current,
                                    [product.id]: Math.max(
                                      1,
                                      Math.min(
                                        99,
                                        Number(event.target.value) || 1
                                      )
                                    ),
                                  }))
                                }
                                className="w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 py-3 text-center text-sm font-black text-[#102A43]"
                              />

                              <button
                                type="button"
                                onClick={() =>
                                  void handleAddProduct(product)
                                }
                                disabled={addBusy}
                                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#2F7D50] px-4 py-3 text-sm font-black text-white disabled:opacity-60"
                              >
                                {addBusy ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Plus className="h-4 w-4" />
                                )}
                                HinzufÃ¼gen
                              </button>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : null}

                <PreparedCartCommunicationPanel
                  cart={selectedCart}
                  onChanged={async () => {
                    await loadData();
                    setSelectedCartId(selectedCart.id);
                  }}
                />
              </section>

              <section className="rounded-[32px] border border-[#E8DED2] bg-white p-5 shadow-sm sm:p-6">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
                  Warenkorbpositionen
                </p>

                <h2 className="mt-1 text-xl font-black text-[#102A43]">
                  {selectedCart.items.length} Positionen
                </h2>

                {selectedCart.items.length === 0 ? (
                  <div className="mt-5 rounded-2xl bg-[#FBF7F0] p-5 text-sm font-bold text-[#52616F]">
                    Noch keine Produkte hinzugefÃ¼gt.
                  </div>
                ) : (
                  <div className="mt-5 space-y-3">
                    {selectedCart.items.map((item) => {
                      const quantity = toQuantity(item.quantity);
                      const quantityBusy =
                        busyKey === `quantity-${item.id}`;
                      const deleteBusy =
                        busyKey === `delete-${item.id}`;

                      return (
                        <article
                          key={item.id}
                          className="rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] p-4"
                        >
                          <div className="grid gap-4 md:grid-cols-[80px_1fr_auto] md:items-center">
                            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl bg-white">
                              {item.image_url_snapshot ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={item.image_url_snapshot}
                                  alt={item.product_name_snapshot}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <ShoppingCart className="h-6 w-6 text-[#A75B28]" />
                              )}
                            </div>

                            <div>
                              <p className="font-black text-[#102A43]">
                                {item.product_name_snapshot}
                              </p>

                              <p className="mt-1 text-xs font-semibold text-[#52616F]">
                                {item.product_sku_snapshot
                                  ? `Art.-Nr.: ${item.product_sku_snapshot}`
                                  : "Ohne Artikelnummer"}
                              </p>

                              <p className="mt-3 text-sm font-black text-[#102A43]">
                                {formatMoney(item.unit_price_snapshot)} pro StÃ¼ck
                              </p>

                              <p className="mt-1 text-lg font-black text-[#2F7D50]">
                                Gesamt:{" "}
                                {formatMoney(
                                  Number(item.unit_price_snapshot) * quantity
                                )}
                              </p>
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  void handleUpdateQuantity(
                                    item,
                                    quantity - 1
                                  )
                                }
                                disabled={quantityBusy || quantity <= 1}
                                className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[#D8C8B8] bg-white text-[#102A43] disabled:opacity-40"
                              >
                                <Minus className="h-4 w-4" />
                              </button>

                              <div className="min-w-12 rounded-2xl bg-white px-3 py-3 text-center text-sm font-black text-[#102A43]">
                                {quantity}
                              </div>

                              <button
                                type="button"
                                onClick={() =>
                                  void handleUpdateQuantity(
                                    item,
                                    quantity + 1
                                  )
                                }
                                disabled={quantityBusy || quantity >= 99}
                                className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#102A43] text-white disabled:opacity-40"
                              >
                                <Plus className="h-4 w-4" />
                              </button>

                              <button
                                type="button"
                                onClick={() => void handleDeleteItem(item)}
                                disabled={deleteBusy}
                                className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[#F2B8B8] bg-[#FFF1F1] text-[#B5282D] disabled:opacity-40"
                                aria-label="Position entfernen"
                              >
                                {deleteBusy ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                              </button>
                            </div>
                          </div>
                        </article>
                      );
                    })}

                    <div className="rounded-2xl bg-[#102A43] p-5 text-white">
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-sm font-bold text-white/75">
                          Vorbereiteter Warenwert
                        </span>
                        <span className="text-2xl font-black">
                          {formatMoney(selectedCartTotal)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </section>
    </div>
  );
}