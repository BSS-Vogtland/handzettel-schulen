"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useState } from "react";

type FulfillmentMethod = "pickup" | "shipping";
type PaymentMethod = "paypal" | "bank_transfer";

type CheckoutResponse = {
  ok?: boolean;
  message?: string;
  redirectUrl?: string;
};

const SHIPPING_AMOUNT = 5.95;

function formatMoney(value: number) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

export default function HandzettelCheckoutPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();

  const token = String(params?.token || "").trim();

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

  const [fulfillmentMethod, setFulfillmentMethod] =
    useState<FulfillmentMethod>("pickup");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("paypal");

  const [customerMessage, setCustomerMessage] = useState("");

  const [isReviewing, setIsReviewing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const shippingAmount = fulfillmentMethod === "shipping" ? SHIPPING_AMOUNT : 0;

  function validateCheckout() {
    if (!token) {
      setFormError("Der Paketwunsch-Link ist ungültig.");
      return false;
    }

    if (!customerName.trim()) {
      setFormError("Bitte gib Deinen Namen ein.");
      return false;
    }

    if (!email.trim() || !email.includes("@")) {
      setFormError("Bitte gib eine gültige E-Mail-Adresse ein.");
      return false;
    }

    if (!billingStreet.trim()) {
      setFormError("Bitte gib Straße und Hausnummer Deiner Rechnungsadresse ein.");
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
        setFormError("Bitte gib den Namen für die abweichende Lieferadresse ein.");
        return false;
      }

      if (!shippingStreet.trim()) {
        setFormError("Bitte gib Straße und Hausnummer der Lieferadresse ein.");
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

    if (!validateCheckout()) {
      return;
    }

    if (!isReviewing) {
      setIsReviewing(true);
      setFormMessage(
        "Bitte prüfe Deine Angaben unten. Danach kannst Du verbindlich bestellen."
      );

      requestAnimationFrame(() => {
        document
          .getElementById("handzettel-checkout-review")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      });

      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(
        `/api/offer/${encodeURIComponent(token)}/checkout`,
        {
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

            fulfillmentMethod,
            paymentMethod,
            customerMessage,
          }),
        }
      );

      const data = (await response.json()) as CheckoutResponse;

      if (!response.ok || !data.ok || !data.redirectUrl) {
        setFormError(
          data.message ||
            "Die Bestellung konnte nicht abgeschlossen werden."
        );
        setIsSubmitting(false);
        return;
      }

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

  return (
    <main className="min-h-screen bg-[#f7f1e8] text-[#172033]">
      <section className="border-b border-[#eadfce] bg-gradient-to-br from-[#fffaf2] via-[#f7f1e8] to-[#e8eef7]">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-5 py-10 md:px-8 lg:flex-row lg:items-center lg:justify-between lg:py-14">
          <div className="max-w-3xl">
            <Link
              href={token ? `/angebot/${encodeURIComponent(token)}` : "/"}
              className="mb-5 inline-flex rounded-full bg-white px-4 py-2 text-sm font-bold text-[#172033] shadow-sm ring-1 ring-[#eadfce] transition hover:bg-[#172033] hover:text-white"
            >
              ← Zurück zum Paketwunsch
            </Link>

            <p className="mb-3 inline-flex rounded-full bg-[#172033] px-4 py-2 text-sm font-semibold text-white shadow-sm">
              Handzettel-Schulen.de · Checkout
            </p>

            <h1 className="text-4xl font-black tracking-tight text-[#172033] md:text-5xl">
              Paketwunsch verbindlich bestellen.
            </h1>

            <p className="mt-5 max-w-2xl text-lg leading-8 text-[#4c5870]">
              Gib Deine Rechnungsdaten ein, wähle Versand oder Abholung und
              entscheide Dich für PayPal oder Überweisung. Erst danach wird die
              Rechnung erzeugt.
            </p>
          </div>

          <div className="rounded-[2rem] bg-white p-6 shadow-xl ring-1 ring-[#eadfce] lg:min-w-[360px]">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#9b2f23]">
              Abschluss
            </p>

            <div className="mt-5 rounded-2xl bg-[#e7f7ec] p-4 text-sm font-bold leading-6 text-[#246b3a] ring-1 ring-[#bfe7c9]">
              PayPal ist vorausgewählt. Alternativ kannst Du Überweisung wählen.
              Barzahlung ist online nicht verfügbar.
            </div>

            <div className="mt-5 flex items-center justify-between gap-4 text-sm font-bold text-[#4c5870]">
              <span>Versand</span>
              <span>{formatMoney(shippingAmount)}</span>
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
                  email *
                </label>
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  type="E-Mail"
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
                  Straße und Hausnummer *
                </label>
                <input
                  value={billingStreet}
                  onChange={(event) => setBillingStreet(event.target.value)}
                  className="w-full rounded-2xl border border-[#d8cdbb] bg-[#fffaf2] px-4 py-4 text-base font-medium text-[#172033] outline-none transition focus:border-[#9b2f23] focus:bg-white focus:ring-4 focus:ring-[#9b2f23]/10"
                  placeholder="z. B. Musterstraße 1"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold text-[#172033]">
                  PLZ *
                </label>
                <input
                  value={billingPostalCode}
                  onChange={(event) => setBillingPostalCode(event.target.value)}
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
                  Wenn Du hier nichts auswählst, verwenden wir die
                  Rechnungsadresse auch als Lieferadresse.
                </span>
              </span>
            </label>

            {shippingAddressDiffers ? (
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <input
                  value={shippingName}
                  onChange={(event) => setShippingName(event.target.value)}
                  className="w-full rounded-2xl border border-[#d8cdbb] bg-white px-4 py-4 text-base font-medium text-[#172033] outline-none transition focus:border-[#9b2f23] focus:ring-4 focus:ring-[#9b2f23]/10"
                  placeholder="Name Lieferadresse *"
                />
                <input
                  value={shippingStreet}
                  onChange={(event) => setShippingStreet(event.target.value)}
                  className="w-full rounded-2xl border border-[#d8cdbb] bg-white px-4 py-4 text-base font-medium text-[#172033] outline-none transition focus:border-[#9b2f23] focus:ring-4 focus:ring-[#9b2f23]/10"
                  placeholder="Straße und Hausnummer *"
                />
                <input
                  value={shippingPostalCode}
                  onChange={(event) =>
                    setShippingPostalCode(event.target.value)
                  }
                  className="w-full rounded-2xl border border-[#d8cdbb] bg-white px-4 py-4 text-base font-medium text-[#172033] outline-none transition focus:border-[#9b2f23] focus:ring-4 focus:ring-[#9b2f23]/10"
                  placeholder="PLZ *"
                />
                <input
                  value={shippingCity}
                  onChange={(event) => setShippingCity(event.target.value)}
                  className="w-full rounded-2xl border border-[#d8cdbb] bg-white px-4 py-4 text-base font-medium text-[#172033] outline-none transition focus:border-[#9b2f23] focus:ring-4 focus:ring-[#9b2f23]/10"
                  placeholder="Ort *"
                />
              </div>
            ) : null}
          </section>

          <section className="mt-8">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#9b2f23]">
              Übergabe
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
                  Keine Versandkosten. Du holst Dein Paket bei uns ab.
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
                <p className="text-lg font-black text-[#172033]">Versand</p>
                <p className="mt-2 text-sm font-semibold leading-6 text-[#5b667a]">
                  Versandkosten pauschal {formatMoney(SHIPPING_AMOUNT)}.
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
                  Empfohlen. Nach der Bestellung kannst Du direkt über PayPal
                  bezahlen.
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
                  Überweisung
                </p>
                <p className="mt-2 text-sm font-semibold leading-6 text-[#5b667a]">
                  Du erhältst die Bankdaten nach dem verbindlichen Absenden.
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
              id="handzettel-checkout-review"
              className="mt-8 rounded-[2rem] border border-[#BFE3CD] bg-[#F0FFF6] p-5"
            >
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#2F7D50]">
                Bitte prüfen
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
                  <p className="font-black text-[#172033]">Lieferadresse</p>
                  <p>{effectiveShippingName}</p>
                  <p>{effectiveShippingStreet}</p>
                  <p>
                    {effectiveShippingPostalCode} {effectiveShippingCity}
                  </p>
                </div>

                <div>
                  <p className="font-black text-[#172033]">Übergabe</p>
                  <p>
                    {fulfillmentMethod === "shipping"
                      ? "Versand"
                      : "Abholung im Laden"}
                  </p>
                </div>

                <div>
                  <p className="font-black text-[#172033]">Zahlungsart</p>
                  <p>{paymentMethod === "paypal" ? "PayPal" : "Überweisung"}</p>
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
              : "Bestellung prüfen"}
          </button>

          <p className="mt-4 text-center text-xs font-semibold leading-5 text-[#5b667a]">
            Nach dem verbindlichen Absenden erhältst Du Deine Rechnung und
            kannst je nach Zahlungsart direkt bezahlen oder überweisen.
          </p>
        </form>

        <aside className="h-fit rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-[#eadfce] lg:sticky lg:top-6">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#9b2f23]">
            Ablauf
          </p>

          <div className="mt-5 space-y-3 text-sm font-bold leading-6 text-[#52616F]">
            <p>1. Rechnungsdaten eingeben.</p>
            <p>2. Versand oder Abholung wählen.</p>
            <p>3. PayPal oder Überweisung wählen.</p>
            <p>4. Bestellung prüfen.</p>
            <p>5. Verbindlich bestellen.</p>
          </div>
        </aside>
      </section>
    </main>
  );
}
