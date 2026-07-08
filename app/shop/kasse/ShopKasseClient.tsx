"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  clearShopCart,
  formatShopPrice,
  getShopCartCount,
  getShopCartSubtotal,
  readShopCart,
  ShopCartItem,
} from "../_lib/shopCart";

type FulfillmentMethod = "pickup" | "shipping";
type PaymentMethod = "paypal" | "bank_transfer";

type CheckoutResponse = {
  ok?: boolean;
  message?: string;
  redirectUrl?: string;
};

const SHIPPING_AMOUNT = 5.95;

export default function ShopCheckoutPage() {
  const router = useRouter();

  const [cartItems, setCartItems] = useState<ShopCartItem[]>(() =>
    readShopCart()
  );

  const [customerName, setCustomerName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const [billingStreet, setBillingStreet] = useState("");
  const [billingPostalCode, setBillingPostalCode] = useState("");
  const [billingCity, setBillingCity] = useState("");

  const [shippingAddressDiffers, setShippingAddressDiffers] = useState(false);
  const [shippingName, setShippingName] = useState("");
  const [shippingStreet, setShippingStreet] = useState("");
  const [shippingPostalCode, setShippingPostalCode] = useState("");
  const [shippingCity, setShippingCity] = useState("");

  const [childName, setChildName] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [className, setClassName] = useState("");

  const [fulfillmentMethod, setFulfillmentMethod] =
    useState<FulfillmentMethod>("pickup");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("paypal");

  const [customerMessage, setCustomerMessage] = useState("");

  const [isReviewing, setIsReviewing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const cartCount = useMemo(() => {
    return getShopCartCount(cartItems);
  }, [cartItems]);

  const subtotal = useMemo(() => {
    return getShopCartSubtotal(cartItems);
  }, [cartItems]);

  const shippingAmount = fulfillmentMethod === "shipping" ? SHIPPING_AMOUNT : 0;
  const totalAmount = subtotal + shippingAmount;

  const effectiveShippingName = shippingAddressDiffers
    ? shippingName.trim()
    : customerName.trim();
  const effectiveShippingStreet = shippingAddressDiffers
    ? shippingStreet.trim()
    : billingStreet.trim();
  const effectiveShippingPostalCode = shippingAddressDiffers
    ? shippingPostalCode.trim()
    : billingPostalCode.trim();
  const effectiveShippingCity = shippingAddressDiffers
    ? shippingCity.trim()
    : billingCity.trim();

  function refreshCart() {
    setCartItems(readShopCart());
  }

  function validateCheckout(currentCartItems: ShopCartItem[]) {
    if (currentCartItems.length === 0) {
      setFormError("Dein Warenkorb ist leer.");
      return false;
    }

    if (!customerName.trim()) {
      setFormError("Bitte gib Deinen Namen ein.");
      return false;
    }

    if (!email.trim() || !email.includes("@")) {
      setFormError("Bitte gib eine gÃ¼ltige E-Mail-Adresse ein.");
      return false;
    }

    if (!billingStreet.trim()) {
      setFormError("Bitte gib StraÃŸe und Hausnummer Deiner Rechnungsadresse ein.");
      return false;
    }

    if (!billingPostalCode.trim()) {
      setFormError("Bitte gib die PLZ Deiner Rechnungsadresse ein.");
      return false;
    }

    if (!billingCity.trim()) {
      setFormError("Bitte gib den Ort Deiner Rechnungsadresse ein.");
      return false;
    }

    if (shippingAddressDiffers) {
      if (!shippingName.trim()) {
        setFormError("Bitte gib den Namen fÃ¼r die abweichende Lieferadresse ein.");
        return false;
      }

      if (!shippingStreet.trim()) {
        setFormError("Bitte gib StraÃŸe und Hausnummer der Lieferadresse ein.");
        return false;
      }

      if (!shippingPostalCode.trim()) {
        setFormError("Bitte gib die PLZ der Lieferadresse ein.");
        return false;
      }

      if (!shippingCity.trim()) {
        setFormError("Bitte gib den Ort der Lieferadresse ein.");
        return false;
      }
    }

    return true;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setFormMessage(null);
    setFormError(null);

    refreshCart();

    const currentCartItems = readShopCart();

    if (!validateCheckout(currentCartItems)) {
      return;
    }

    if (!isReviewing) {
      setIsReviewing(true);
      setFormMessage(
        "Bitte prÃ¼fe Deine Bestellung unten. Danach kannst Du verbindlich bestellen."
      );

      requestAnimationFrame(() => {
        document
          .getElementById("shop-checkout-review")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      });

      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/shop/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customerName,
          email,
          phone,

          billingName: customerName,
          billingEmail: email,
          billingPhone: phone,
          billingStreet,
          billingPostalCode,
          billingCity,

          shippingAddressDiffers,
          shippingName: shippingAddressDiffers ? shippingName : "",
          shippingStreet: shippingAddressDiffers ? shippingStreet : "",
          shippingPostalCode: shippingAddressDiffers ? shippingPostalCode : "",
          shippingCity: shippingAddressDiffers ? shippingCity : "",

          childName,
          schoolName,
          className,
          fulfillmentMethod,
          paymentMethod,
          customerMessage,
          cartItems: currentCartItems,
        }),
      });

      const data = (await response.json()) as CheckoutResponse;

      if (!response.ok || !data.ok || !data.redirectUrl) {
        setFormError(
          data.message ||
            "Die Bestellung konnte nicht abgeschlossen werden."
        );
        setIsSubmitting(false);
        return;
      }

      clearShopCart();
      setCartItems([]);
      setFormMessage("Bestellung erstellt. Du wirst zur Rechnung weitergeleitet.");

      router.push(data.redirectUrl);
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Die Bestellung konnte nicht abgeschlossen werden."
      );
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f1e8] text-[#172033]">
      <section className="border-b border-[#eadfce] bg-gradient-to-br from-[#fffaf2] via-[#f7f1e8] to-[#e8eef7]">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-5 py-10 md:px-8 lg:flex-row lg:items-center lg:justify-between lg:py-14">
          <div className="max-w-3xl">
            <Link
              href="/shop/warenkorb"
              className="mb-5 inline-flex rounded-full bg-white px-4 py-2 text-sm font-bold text-[#172033] shadow-sm ring-1 ring-[#eadfce] transition hover:bg-[#172033] hover:text-white"
            >
              â† ZurÃ¼ck zum Warenkorb
            </Link>

            <p className="mb-3 inline-flex rounded-full bg-[#172033] px-4 py-2 text-sm font-semibold text-white shadow-sm">
              Schulmaterial-Shop Â· Kasse
            </p>

            <h1 className="text-4xl font-black tracking-tight text-[#172033] md:text-5xl">
              Bestellung abschlieÃŸen.
            </h1>

            <p className="mt-5 max-w-2xl text-lg leading-8 text-[#4c5870]">
              Gib Deine Rechnungsdaten ein, wÃ¤hle Versand oder Abholung und prÃ¼fe
              Deine Bestellung. Danach kannst Du verbindlich bestellen.
            </p>
          </div>

          <div className="rounded-[2rem] bg-white p-6 shadow-xl ring-1 ring-[#eadfce] lg:min-w-[360px]">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#9b2f23]">
              Zusammenfassung
            </p>

            <div className="mt-5 space-y-3">
              <div className="flex items-center justify-between gap-4 text-sm font-bold text-[#4c5870]">
                <span>Artikel</span>
                <span>{cartCount}</span>
              </div>

              <div className="flex items-center justify-between gap-4 text-sm font-bold text-[#4c5870]">
                <span>Warenwert</span>
                <span>{formatShopPrice(subtotal)}</span>
              </div>

              <div className="flex items-center justify-between gap-4 text-sm font-bold text-[#4c5870]">
                <span>Versand</span>
                <span>{formatShopPrice(shippingAmount)}</span>
              </div>

              <div className="border-t border-[#eadfce] pt-4">
                <div className="flex items-center justify-between gap-4 text-lg font-black text-[#172033]">
                  <span>Gesamt</span>
                  <span>{formatShopPrice(totalAmount)}</span>
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-2xl bg-[#e7f7ec] p-4 text-sm font-bold leading-6 text-[#246b3a] ring-1 ring-[#bfe7c9]">
              PayPal ist vorausgewÃ¤hlt. Alternativ kannst Du Ãœberweisung wÃ¤hlen.
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-7xl gap-6 px-5 py-8 md:px-8 lg:grid-cols-[1fr_390px] lg:items-start">
        <form
          onSubmit={handleSubmit}
          className="rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-[#eadfce] md:p-7"
        >
          {formError ? (
            <div className="mb-5 rounded-2xl bg-[#fff0f0] px-5 py-4 text-sm font-bold text-[#9b2f23] ring-1 ring-[#f0c2c2]">
              {formError}
            </div>
          ) : null}

          {formMessage ? (
            <div className="mb-5 rounded-2xl bg-[#e7f7ec] px-5 py-4 text-sm font-bold text-[#246b3a] ring-1 ring-[#bfe7c9]">
              {formMessage}
            </div>
          ) : null}

          {cartItems.length === 0 ? (
            <div className="rounded-[2rem] bg-[#f7f1e8] p-6 text-center">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-[1.5rem] bg-white text-3xl shadow-sm">
                ðŸ›’
              </div>

              <h2 className="text-2xl font-black text-[#172033]">
                Dein Warenkorb ist leer.
              </h2>

              <p className="mt-2 text-sm font-semibold leading-6 text-[#5b667a]">
                Lege zuerst Produkte in den Warenkorb, bevor Du zur Kasse gehst.
              </p>

              <Link
                href="/shop"
                className="mt-6 inline-flex rounded-2xl bg-[#172033] px-6 py-4 text-sm font-black text-white shadow-sm transition hover:bg-[#9b2f23]"
              >
                ZurÃ¼ck zum Shop
              </Link>
            </div>
          ) : (
            <>
              <section>
                <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#9b2f23]">
                  Rechnungsdaten
                </p>

                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-bold text-[#172033]">
                      Name *
                    </label>
                    <input
                      value={customerName}
                      onChange={(event) => setCustomerName(event.target.value)}
                      className="w-full rounded-2xl border border-[#d8cdbb] bg-[#fffaf2] px-4 py-4 text-base font-medium text-[#172033] outline-none transition focus:border-[#9b2f23] focus:bg-white focus:ring-4 focus:ring-[#9b2f23]/10"
                      placeholder="Vor- und Nachname"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-bold text-[#172033]">
                      E-Mail *
                    </label>
                    <input
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      type="email"
                      className="w-full rounded-2xl border border-[#d8cdbb] bg-[#fffaf2] px-4 py-4 text-base font-medium text-[#172033] outline-none transition focus:border-[#9b2f23] focus:bg-white focus:ring-4 focus:ring-[#9b2f23]/10"
                      placeholder="name@beispiel.de"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-bold text-[#172033]">
                      Telefon
                    </label>
                    <input
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      className="w-full rounded-2xl border border-[#d8cdbb] bg-[#fffaf2] px-4 py-4 text-base font-medium text-[#172033] outline-none transition focus:border-[#9b2f23] focus:bg-white focus:ring-4 focus:ring-[#9b2f23]/10"
                      placeholder="Optional"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-bold text-[#172033]">
                      StraÃŸe und Hausnummer *
                    </label>
                    <input
                      value={billingStreet}
                      onChange={(event) => setBillingStreet(event.target.value)}
                      className="w-full rounded-2xl border border-[#d8cdbb] bg-[#fffaf2] px-4 py-4 text-base font-medium text-[#172033] outline-none transition focus:border-[#9b2f23] focus:bg-white focus:ring-4 focus:ring-[#9b2f23]/10"
                      placeholder="z. B. MusterstraÃŸe 1"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-bold text-[#172033]">
                      PLZ *
                    </label>
                    <input
                      value={billingPostalCode}
                      onChange={(event) =>
                        setBillingPostalCode(event.target.value)
                      }
                      className="w-full rounded-2xl border border-[#d8cdbb] bg-[#fffaf2] px-4 py-4 text-base font-medium text-[#172033] outline-none transition focus:border-[#9b2f23] focus:bg-white focus:ring-4 focus:ring-[#9b2f23]/10"
                      placeholder="z. B. 08468"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-bold text-[#172033]">
                      Ort *
                    </label>
                    <input
                      value={billingCity}
                      onChange={(event) => setBillingCity(event.target.value)}
                      className="w-full rounded-2xl border border-[#d8cdbb] bg-[#fffaf2] px-4 py-4 text-base font-medium text-[#172033] outline-none transition focus:border-[#9b2f23] focus:bg-white focus:ring-4 focus:ring-[#9b2f23]/10"
                      placeholder="z. B. Reichenbach"
                    />
                  </div>
                </div>
              </section>

              <section className="mt-8 rounded-[2rem] border border-[#eadfce] bg-[#fffaf2] p-5">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={shippingAddressDiffers}
                    onChange={(event) =>
                      setShippingAddressDiffers(event.target.checked)
                    }
                    className="mt-1 h-5 w-5 rounded border-[#d8cdbb]"
                  />
                  <span>
                    <span className="block text-sm font-black text-[#172033]">
                      Lieferadresse weicht von Rechnungsadresse ab
                    </span>
                    <span className="mt-1 block text-sm font-semibold leading-6 text-[#5b667a]">
                      Wenn Du hier nichts auswÃ¤hlst, verwenden wir die
                      Rechnungsadresse auch als Lieferadresse.
                    </span>
                  </span>
                </label>

                {shippingAddressDiffers ? (
                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-bold text-[#172033]">
                        Name Lieferadresse *
                      </label>
                      <input
                        value={shippingName}
                        onChange={(event) => setShippingName(event.target.value)}
                        className="w-full rounded-2xl border border-[#d8cdbb] bg-white px-4 py-4 text-base font-medium text-[#172033] outline-none transition focus:border-[#9b2f23] focus:ring-4 focus:ring-[#9b2f23]/10"
                        placeholder="Vor- und Nachname"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-bold text-[#172033]">
                        StraÃŸe und Hausnummer *
                      </label>
                      <input
                        value={shippingStreet}
                        onChange={(event) =>
                          setShippingStreet(event.target.value)
                        }
                        className="w-full rounded-2xl border border-[#d8cdbb] bg-white px-4 py-4 text-base font-medium text-[#172033] outline-none transition focus:border-[#9b2f23] focus:ring-4 focus:ring-[#9b2f23]/10"
                        placeholder="z. B. LieferstraÃŸe 2"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-bold text-[#172033]">
                        PLZ *
                      </label>
                      <input
                        value={shippingPostalCode}
                        onChange={(event) =>
                          setShippingPostalCode(event.target.value)
                        }
                        className="w-full rounded-2xl border border-[#d8cdbb] bg-white px-4 py-4 text-base font-medium text-[#172033] outline-none transition focus:border-[#9b2f23] focus:ring-4 focus:ring-[#9b2f23]/10"
                        placeholder="z. B. 08468"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-bold text-[#172033]">
                        Ort *
                      </label>
                      <input
                        value={shippingCity}
                        onChange={(event) => setShippingCity(event.target.value)}
                        className="w-full rounded-2xl border border-[#d8cdbb] bg-white px-4 py-4 text-base font-medium text-[#172033] outline-none transition focus:border-[#9b2f23] focus:ring-4 focus:ring-[#9b2f23]/10"
                        placeholder="z. B. Reichenbach"
                      />
                    </div>
                  </div>
                ) : null}
              </section>

              <section className="mt-8">
                <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#9b2f23]">
                  Schulinformationen
                </p>

                <div className="mt-5 grid gap-4 md:grid-cols-3">
                  <div>
                    <label className="mb-2 block text-sm font-bold text-[#172033]">
                      Kind
                    </label>
                    <input
                      value={childName}
                      onChange={(event) => setChildName(event.target.value)}
                      className="w-full rounded-2xl border border-[#d8cdbb] bg-[#fffaf2] px-4 py-4 text-base font-medium text-[#172033] outline-none transition focus:border-[#9b2f23] focus:bg-white focus:ring-4 focus:ring-[#9b2f23]/10"
                      placeholder="Optional"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-bold text-[#172033]">
                      Schule
                    </label>
                    <input
                      value={schoolName}
                      onChange={(event) => setSchoolName(event.target.value)}
                      className="w-full rounded-2xl border border-[#d8cdbb] bg-[#fffaf2] px-4 py-4 text-base font-medium text-[#172033] outline-none transition focus:border-[#9b2f23] focus:bg-white focus:ring-4 focus:ring-[#9b2f23]/10"
                      placeholder="Optional"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-bold text-[#172033]">
                      Klasse
                    </label>
                    <input
                      value={className}
                      onChange={(event) => setClassName(event.target.value)}
                      className="w-full rounded-2xl border border-[#d8cdbb] bg-[#fffaf2] px-4 py-4 text-base font-medium text-[#172033] outline-none transition focus:border-[#9b2f23] focus:bg-white focus:ring-4 focus:ring-[#9b2f23]/10"
                      placeholder="z. B. 1a"
                    />
                  </div>
                </div>
              </section>

              <section className="mt-8">
                <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#9b2f23]">
                  Ãœbergabe
                </p>

                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setFulfillmentMethod("pickup")}
                    className={
                      fulfillmentMethod === "pickup"
                        ? "rounded-[2rem] border-2 border-[#9b2f23] bg-[#fff7ed] p-5 text-left shadow-sm"
                        : "rounded-[2rem] border border-[#eadfce] bg-[#f7f1e8] p-5 text-left transition hover:bg-white"
                    }
                  >
                    <p className="text-lg font-black text-[#172033]">
                      Abholung im Laden
                    </p>
                    <p className="mt-2 text-sm font-semibold leading-6 text-[#5b667a]">
                      Keine Versandkosten. Du holst Deine Bestellung bei uns ab.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFulfillmentMethod("shipping")}
                    className={
                      fulfillmentMethod === "shipping"
                        ? "rounded-[2rem] border-2 border-[#9b2f23] bg-[#fff7ed] p-5 text-left shadow-sm"
                        : "rounded-[2rem] border border-[#eadfce] bg-[#f7f1e8] p-5 text-left transition hover:bg-white"
                    }
                  >
                    <p className="text-lg font-black text-[#172033]">
                      Versand
                    </p>
                    <p className="mt-2 text-sm font-semibold leading-6 text-[#5b667a]">
                      Versandkosten pauschal {formatShopPrice(SHIPPING_AMOUNT)}.
                    </p>
                  </button>
                </div>
              </section>

              <section className="mt-8">
                <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#9b2f23]">
                  Zahlungsart
                </p>

                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("paypal")}
                    className={
                      paymentMethod === "paypal"
                        ? "rounded-[2rem] border-2 border-[#2F7D50] bg-[#F0FFF6] p-5 text-left shadow-sm"
                        : "rounded-[2rem] border border-[#eadfce] bg-[#f7f1e8] p-5 text-left transition hover:bg-white"
                    }
                  >
                    <p className="text-lg font-black text-[#172033]">PayPal</p>
                    <p className="mt-2 text-sm font-semibold leading-6 text-[#5b667a]">
                      Empfohlen. Nach der Bestellung kannst Du direkt Ã¼ber
                      PayPal bezahlen.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod("bank_transfer")}
                    className={
                      paymentMethod === "bank_transfer"
                        ? "rounded-[2rem] border-2 border-[#2F7D50] bg-[#F0FFF6] p-5 text-left shadow-sm"
                        : "rounded-[2rem] border border-[#eadfce] bg-[#f7f1e8] p-5 text-left transition hover:bg-white"
                    }
                  >
                    <p className="text-lg font-black text-[#172033]">
                      Ãœberweisung
                    </p>
                    <p className="mt-2 text-sm font-semibold leading-6 text-[#5b667a]">
                      Du erhÃ¤ltst die Bankdaten nach dem verbindlichen Absenden.
                    </p>
                  </button>
                </div>
              </section>

              <section className="mt-8">
                <label className="mb-2 block text-sm font-bold text-[#172033]">
                  Hinweis zur Bestellung
                </label>
                <textarea
                  value={customerMessage}
                  onChange={(event) => setCustomerMessage(event.target.value)}
                  rows={4}
                  className="w-full rounded-2xl border border-[#d8cdbb] bg-[#fffaf2] px-4 py-4 text-base font-medium text-[#172033] outline-none transition focus:border-[#9b2f23] focus:bg-white focus:ring-4 focus:ring-[#9b2f23]/10"
                  placeholder="Optional, z. B. besondere Hinweise zur Abholung oder Lieferung."
                />
              </section>

              {isReviewing ? (
                <section
                  id="shop-checkout-review"
                  className="mt-8 rounded-[2rem] border border-[#BFE3CD] bg-[#F0FFF6] p-5"
                >
                  <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#2F7D50]">
                    Bitte prÃ¼fen
                  </p>

                  <h2 className="mt-2 text-2xl font-black text-[#172033]">
                    Deine Bestellung
                  </h2>

                  <div className="mt-5 grid gap-4 text-sm font-semibold leading-6 text-[#52616F] md:grid-cols-2">
                    <div>
                      <p className="font-black text-[#172033]">
                        Rechnungsadresse
                      </p>
                      <p>{customerName}</p>
                      <p>{billingStreet}</p>
                      <p>
                        {billingPostalCode} {billingCity}
                      </p>
                      <p>{email}</p>
                    </div>

                    <div>
                      <p className="font-black text-[#172033]">
                        Lieferadresse
                      </p>
                      <p>{effectiveShippingName}</p>
                      <p>{effectiveShippingStreet}</p>
                      <p>
                        {effectiveShippingPostalCode} {effectiveShippingCity}
                      </p>
                    </div>

                    <div>
                      <p className="font-black text-[#172033]">Ãœbergabe</p>
                      <p>
                        {fulfillmentMethod === "shipping"
                          ? "Versand"
                          : "Abholung im Laden"}
                      </p>
                    </div>

                    <div>
                      <p className="font-black text-[#172033]">Zahlungsart</p>
                      <p>
                        {paymentMethod === "paypal" ? "PayPal" : "Ãœberweisung"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 rounded-2xl bg-white p-4">
                    <div className="flex items-center justify-between gap-4 text-sm font-bold text-[#52616F]">
                      <span>Warenwert</span>
                      <span>{formatShopPrice(subtotal)}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-4 text-sm font-bold text-[#52616F]">
                      <span>Versand</span>
                      <span>{formatShopPrice(shippingAmount)}</span>
                    </div>
                    <div className="mt-4 border-t border-[#E8DED2] pt-4">
                      <div className="flex items-center justify-between gap-4 text-lg font-black text-[#172033]">
                        <span>Gesamt</span>
                        <span>{formatShopPrice(totalAmount)}</span>
                      </div>
                    </div>
                  </div>
                </section>
              ) : null}

              <button
                type="submit"
                disabled={isSubmitting}
                className="mt-8 w-full rounded-2xl bg-[#172033] px-6 py-5 text-sm font-black text-white shadow-sm transition hover:bg-[#9b2f23] disabled:cursor-not-allowed disabled:bg-[#9aa3b3]"
              >
                {isSubmitting
                  ? "Bestellung wird erstellt ..."
                  : isReviewing
                  ? "Verbindlich bestellen"
                  : "Bestellung prÃ¼fen"}
              </button>

              <p className="mt-4 text-center text-xs font-semibold leading-5 text-[#5b667a]">
                Nach dem verbindlichen Absenden erhÃ¤ltst Du die Rechnung und
                kannst je nach Zahlungsart direkt bezahlen oder Ã¼berweisen.
              </p>
            </>
          )}
        </form>

        <aside className="h-fit rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-[#eadfce] lg:sticky lg:top-6">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#9b2f23]">
            Dein Warenkorb
          </p>

          {cartItems.length === 0 ? (
            <p className="mt-4 text-sm font-semibold leading-6 text-[#5b667a]">
              Der Warenkorb ist leer.
            </p>
          ) : (
            <div className="mt-5 space-y-3">
              {cartItems.map((item) => (
                <div
                  key={item.productId}
                  className="rounded-2xl bg-[#f7f1e8] p-4"
                >
                  <p className="font-black leading-5 text-[#172033]">
                    {item.name}
                  </p>

                  <p className="mt-1 text-xs font-semibold text-[#5b667a]">
                    Menge: {item.quantity}
                    {item.sku ? " Â· Art.-Nr.: " + item.sku : ""}
                  </p>

                  {item.sourceType === "reorder_from_school_list" ? (
                    <span className="mt-2 inline-flex rounded-full bg-[#e7f7ec] px-3 py-1 text-xs font-bold text-[#246b3a]">
                      Nachkauf aus Liste
                    </span>
                  ) : null}

                  <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                    <span className="font-semibold text-[#5b667a]">
                      {formatShopPrice(item.price)}
                    </span>
                    <span className="font-black text-[#172033]">
                      {formatShopPrice(item.price * item.quantity)}
                    </span>
                  </div>
                </div>
              ))}

              <div className="rounded-2xl bg-[#172033] p-4 text-white">
                <div className="flex items-center justify-between gap-3 text-sm font-bold text-white/80">
                  <span>Warenwert</span>
                  <span>{formatShopPrice(subtotal)}</span>
                </div>

                <div className="mt-2 flex items-center justify-between gap-3 text-sm font-bold text-white/80">
                  <span>Versand</span>
                  <span>{formatShopPrice(shippingAmount)}</span>
                </div>

                <div className="mt-4 border-t border-white/20 pt-4">
                  <div className="flex items-center justify-between gap-3 text-lg font-black">
                    <span>Gesamt</span>
                    <span>{formatShopPrice(totalAmount)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}

