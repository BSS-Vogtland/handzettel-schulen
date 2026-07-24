import { createClient } from "@supabase/supabase-js";
import {
  CheckCircle2,
  CreditCard,
  FileText,
  Percent,
  School,
  ShieldCheck,
  Truck,
} from "lucide-react";
import CustomerPaymentMethodButton from "@/components/CustomerPaymentMethodButton";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    invoiceToken: string;
  }>;
};

type InvoiceRow = {
  id: string;
  request_id: string;
  invoice_number: string | null;
  invoice_token: string;

  invoice_status: string | null;
  payment_status: string | null;
  selected_payment_method: string | null;

  subtotal_amount: number | string | null;
  shipping_amount: number | string | null;

  contains_books: boolean | null;
  book_shipping_amount: number | string | null;
  book_cover_amount: number | string | null;

  discount_campaign_id: string | null;
  discount_name: string | null;
  discount_type: string | null;
  discount_value: number | string | null;
  discount_amount: number | string | null;

  total_amount: number | string | null;
  currency: string | null;

  customer_name_snapshot: string | null;
  customer_email_snapshot: string | null;

  customer_phone_snapshot: string | null;

  billing_name_snapshot: string | null;
  billing_email_snapshot: string | null;
  billing_phone_snapshot: string | null;
  billing_street_snapshot: string | null;
  billing_postal_code_snapshot: string | null;
  billing_city_snapshot: string | null;

  shipping_address_differs_snapshot: boolean | null;
  shipping_name_snapshot: string | null;
  shipping_street_snapshot: string | null;
  shipping_postal_code_snapshot: string | null;
  shipping_city_snapshot: string | null;
  child_name_snapshot: string | null;
  school_name_snapshot: string | null;
  class_name_snapshot: string | null;

  fulfillment_method_snapshot: string | null;
  pickup_location_label_snapshot: string | null;
  pickup_address_snapshot: string | null;

  payment_due_at: string | null;
  cash_pickup_due_at: string | null;

  created_at: string | null;
  sent_at: string | null;
  paid_at: string | null;
};

type RequestRow = {
  id: string;
  fulfillment_method: string | null;
  cash_on_pickup_allowed: boolean | null;
};

type InvoiceItemRow = {
  id: string;
  invoice_id: string;
  request_id: string;
  product_name: string;
  product_sku: string | null;
  quantity: number | string | null;
  unit: string | null;
  unit_price: number | string | null;
  total_price: number | string | null;

  is_book_snapshot: boolean | null;
  book_isbn13_snapshot: string | null;

  book_cover_selected: boolean | null;
  book_cover_name_snapshot: string | null;
  book_cover_quantity: number | string | null;
  book_cover_unit_price: number | string | null;
  book_cover_total_price: number | string | null;
};

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase Umgebungsvariablen fehlen. Prüfe NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
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

function formatNegativeMoney(value: unknown) {
  return `-${formatMoney(Math.abs(toNumber(value, 0)))}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function getPaymentStatusLabel(status: string | null) {
  switch (status) {
    case "not_selected":
      return "Zahlungsart noch nicht gewählt";
    case "waiting_for_payment":
      return "Wartet auf Zahlung";
    case "payment_received":
      return "Bezahlt";
    case "cash_on_pickup":
      return "Barzahlung bei Abholung";
    case "cash_paid":
      return "Bar bezahlt";
    case "overdue":
      return "Überfällig";
    case "cancelled":
      return "Zahlung abgebrochen";
    default:
      return status || "Zahlung offen";
  }
}

function getPaymentMethodLabel(method: string | null) {
  switch (method) {
    case "paypal":
      return "PayPal";
    case "bank_transfer":
      return "Überweisung Vorkasse";
    case "cash_on_pickup":
      return "Barzahlung bei Abholung";
    default:
      return "Noch nicht gewählt";
  }
}

function getFulfillmentLabel(method: string | null) {
  if (method === "pickup") return "Abholung im Laden";
  if (method === "shipping") return "Versand";
  return "Noch nicht gewählt";
}

function getDiscountDescription(invoice: InvoiceRow) {
  const discountName = invoice.discount_name?.trim();
  const discountType = invoice.discount_type;
  const discountValue = toNumber(invoice.discount_value, 0);

  if (!discountName) {
    return "Rabattaktion";
  }

  if (discountType === "percent" && discountValue > 0) {
    return `Rabattaktion: ${discountName} (${discountValue.toLocaleString(
      "de-DE",
      {
        maximumFractionDigits: 2,
      }
    )} %)`;
  }

  if (discountType === "fixed_amount" && discountValue > 0) {
    return `Rabattaktion: ${discountName} (${formatMoney(discountValue)})`;
  }

  return `Rabattaktion: ${discountName}`;
}

function getNextStepText(params: {
  isPaid: boolean;
  paymentStatus: string | null;
  selectedPaymentMethod: string | null;
  canUseCashOnPickup: boolean;
}) {
  const { isPaid, paymentStatus, selectedPaymentMethod, canUseCashOnPickup } =
    params;

  if (isPaid) {
    return "Die Zahlung ist bereits verbucht. Dein Schulpaket kann nun weiter vorbereitet werden.";
  }

  if (paymentStatus === "waiting_for_payment") {
    if (selectedPaymentMethod === "bank_transfer") {
      return "Du hast Überweisung gewählt. Bitte überweise den Gesamtbetrag. Nach Zahlungseingang wird Dein Paket weiter bearbeitet.";
    }

    if (selectedPaymentMethod === "paypal") {
      return "Du hast PayPal gewählt. Falls die Zahlung noch nicht abgeschlossen wurde, starte die Zahlung bitte erneut über den PayPal-Button.";
    }

    return "Die Zahlungsart wurde gewählt. Nach Zahlungseingang wird Dein Paket weiter bearbeitet.";
  }

  if (paymentStatus === "cash_on_pickup" && canUseCashOnPickup) {
    return "Du zahlst direkt bei Abholung im Laden. Dein Paket wird vorbereitet und zur Abholung bereitgestellt.";
  }

  return "Wähle jetzt Deine Zahlungsart. PayPal ist der schnellste Weg, Überweisung ist ebenfalls möglich.";
}

export default async function InvoicePaymentPage({ params }: Params) {
  const { invoiceToken } = await params;
  const token = decodeURIComponent(invoiceToken || "").trim();

  const supabase = getSupabaseAdmin();

  const { data: invoiceData, error: invoiceError } = await supabase
    .from("school_request_invoices")
    .select("*")
    .eq("invoice_token", token)
    .maybeSingle();

  if (invoiceError || !invoiceData) {
    return (
      <main className="min-h-screen bg-[#FBF7F0] px-4 py-10 text-[#102A43]">
        <section className="mx-auto max-w-2xl rounded-[32px] border border-[#E8DED2] bg-white p-6 text-center shadow-sm">
          <FileText className="mx-auto h-10 w-10 text-[#B5282D]" />
          <h1 className="mt-4 text-2xl font-black">
            Rechnung nicht gefunden
          </h1>
          <p className="mt-2 text-sm font-semibold leading-6 text-[#52616F]">
            Der Zahlungslink ist ungültig oder die Rechnung wurde nicht gefunden.
          </p>
        </section>
      </main>
    );
  }

  const invoice = invoiceData as InvoiceRow;

  const [{ data: itemsData }, { data: requestData }] = await Promise.all([
    supabase
      .from("school_request_invoice_items")
      .select("*")
      .eq("invoice_id", invoice.id)
      .order("created_at", { ascending: true }),

    supabase
      .from("school_requests")
      .select("id, fulfillment_method, cash_on_pickup_allowed")
      .eq("id", invoice.request_id)
      .maybeSingle(),
  ]);

  const invoiceItems = (itemsData || []) as InvoiceItemRow[];
  const requestRow = (requestData || null) as RequestRow | null;

  const isPickup = invoice.fulfillment_method_snapshot === "pickup";
  const isShipping = invoice.fulfillment_method_snapshot === "shipping";

  const canUseCashOnPickup =
    isPickup && Boolean(requestRow?.cash_on_pickup_allowed);

  const isPaid =
    invoice.payment_status === "payment_received" ||
    invoice.payment_status === "cash_paid";

  const discountAmount = toNumber(invoice.discount_amount, 0);
  const hasDiscount = discountAmount > 0;

  const bookShippingAmount = toNumber(
    invoice.book_shipping_amount,
    0
  );

  const bookCoverAmount = toNumber(
    invoice.book_cover_amount,
    0
  );

  const containsBooks =
    invoice.contains_books === true ||
    invoiceItems.some(
      (item) => item.is_book_snapshot === true
    );

  const hasBookShipping = bookShippingAmount > 0;
  const hasBookCovers = bookCoverAmount > 0;

  const billingName =
    invoice.billing_name_snapshot?.trim() ||
    invoice.customer_name_snapshot?.trim() ||
    "Kunde";
  const billingEmail =
    invoice.billing_email_snapshot?.trim() ||
    invoice.customer_email_snapshot?.trim() ||
    null;
  const billingPhone =
    invoice.billing_phone_snapshot?.trim() ||
    invoice.customer_phone_snapshot?.trim() ||
    null;
  const billingStreet = invoice.billing_street_snapshot?.trim() || null;
  const billingPostalCode =
    invoice.billing_postal_code_snapshot?.trim() || null;
  const billingCity = invoice.billing_city_snapshot?.trim() || null;
  const billingPostalLine = [billingPostalCode, billingCity]
    .filter(Boolean)
    .join(" ");

  const showShippingAddress =
    Boolean(invoice.shipping_address_differs_snapshot) &&
    Boolean(
      invoice.shipping_name_snapshot ||
        invoice.shipping_street_snapshot ||
        invoice.shipping_postal_code_snapshot ||
        invoice.shipping_city_snapshot
    );

  const shippingName = invoice.shipping_name_snapshot?.trim() || billingName;
  const shippingStreet =
    invoice.shipping_street_snapshot?.trim() || billingStreet;
  const shippingPostalCode =
    invoice.shipping_postal_code_snapshot?.trim() || billingPostalCode;
  const shippingCity = invoice.shipping_city_snapshot?.trim() || billingCity;
  const shippingPostalLine = [shippingPostalCode, shippingCity]
    .filter(Boolean)
    .join(" ");

  const nextStepText = getNextStepText({
    isPaid,
    paymentStatus: invoice.payment_status,
    selectedPaymentMethod: invoice.selected_payment_method,
    canUseCashOnPickup,
  });

  return (
    <main className="min-h-screen bg-[#FBF7F0] text-[#102A43]">
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="rounded-[34px] border border-[#E8DED2] bg-white p-5 shadow-[0_18px_45px_rgba(16,42,67,0.10)] sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[#FBF7F0] px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-[#A75B28]">
                <ShieldCheck className="h-3.5 w-3.5" />
                Handzettel-Schulen.de
              </div>

              <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
                Rechnung & Zahlung
              </h1>

              <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-[#52616F] sm:text-base">
                Hier siehst Du Deine Rechnung für das vorbereitete Schulpaket
                und kannst Deine gewählte Zahlung fortsetzen. Sobald die Zahlung
                eingegangen ist, kann Dein Paket weiter vorbereitet werden.
              </p>

              <div className="mt-5 rounded-[24px] border border-[#BFE3CD] bg-[#F0FFF6] p-4 text-[#2F7D50]">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                  <div>
                    <p className="font-black">Nächster Schritt</p>
                    <p className="mt-1 text-sm font-semibold leading-6">
                      {nextStepText}
                    </p>
                  </div>
                </div>
              </div>

              {hasDiscount ? (
                <div className="mt-4 rounded-[24px] border border-[#F1D1A8] bg-[#FFF8EE] p-4 text-[#A75B28]">
                  <div className="flex items-start gap-3">
                    <Percent className="mt-0.5 h-5 w-5 shrink-0" />
                    <div>
                      <p className="font-black">Rabatt wurde angewendet</p>
                      <p className="mt-1 text-sm font-semibold leading-6">
                        {getDiscountDescription(invoice)} · Du sparst{" "}
                        {formatMoney(discountAmount)}.
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="rounded-[28px] border border-[#BFE3CD] bg-[#F0FFF6] p-4">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#2F7D50]">
                Zu zahlen
              </p>
              <p className="mt-2 text-3xl font-black text-[#102A43]">
                {formatMoney(invoice.total_amount)}
              </p>
              <p className="mt-1 text-sm font-semibold leading-6 text-[#52616F]">
                Gesamtbetrag inklusive ausgewählter Buchhüllen,
                Versandkosten und einmaligem Buchversand, soweit
                diese Positionen für Deine Bestellung gelten.
              </p>

              {hasDiscount ? (
                <p className="mt-3 rounded-2xl bg-white px-3 py-2 text-sm font-black text-[#2F7D50]">
                  Rabatt berücksichtigt: {formatNegativeMoney(discountAmount)}
                </p>
              ) : null}
            </div>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-[28px] border border-[#E8DED2] bg-white p-5 shadow-sm">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FBF7F0] text-[#A75B28]">
              <FileText className="h-5 w-5" />
            </div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
              Rechnung
            </p>
            <p className="mt-2 font-black text-[#102A43]">
              {invoice.invoice_number || "Rechnung"}
            </p>
            <p className="mt-1 text-xs font-semibold text-[#52616F]">
              Erstellt: {formatDate(invoice.created_at)}
            </p>
          </div>

          <div className="rounded-[28px] border border-[#E8DED2] bg-white p-5 shadow-sm">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FBF7F0] text-[#12395F]">
              <Truck className="h-5 w-5" />
            </div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#12395F]">
              Übergabe
            </p>
            <p className="mt-2 font-black text-[#102A43]">
              {getFulfillmentLabel(invoice.fulfillment_method_snapshot)}
            </p>
            <p className="mt-1 text-xs font-semibold text-[#52616F]">
              {isShipping
                ? hasBookShipping
                  ? `Die Versandpauschale und ${formatMoney(
                      bookShippingAmount
                    )} einmaliger Buchversand sind im Gesamtbetrag enthalten.`
                  : "Die Versandkosten sind im Gesamtbetrag enthalten."
                : isPickup
                  ? containsBooks
                    ? "Du holst Dein Paket im Laden ab. Für Bücher fällt bei Abholung kein Buchversand an."
                    : "Du holst Dein Paket im Laden ab."
                  : "Die Übergabeart ist noch nicht festgelegt."}
            </p>
          </div>

          <div className="rounded-[28px] border border-[#E8DED2] bg-white p-5 shadow-sm">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FBF7F0] text-[#2F7D50]">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#2F7D50]">
              Zahlung
            </p>
            <p className="mt-2 font-black text-[#102A43]">
              {getPaymentStatusLabel(invoice.payment_status)}
            </p>
            <p className="mt-1 text-xs font-semibold text-[#52616F]">
              Zahlungsart:{" "}
              {getPaymentMethodLabel(invoice.selected_payment_method)}
            </p>
          </div>
        </section>

        <section className="rounded-[32px] border border-[#E8DED2] bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#FBF7F0] text-[#12395F]">
              <FileText className="h-5 w-5" />
            </div>

            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#12395F]">
                Adresse
              </p>
              <h2 className="text-xl font-black text-[#102A43]">
                Rechnungs- und Lieferdaten
              </h2>
              <p className="mt-1 text-sm font-semibold leading-6 text-[#52616F]">
                Diese Daten werden für Rechnung, Versand und Rückfragen genutzt.
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-[24px] border border-[#E8DED2] bg-[#FBF7F0] p-4">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[#A75B28]">
                Rechnungsadresse
              </p>
              <div className="mt-3 text-sm font-semibold leading-6 text-[#102A43]">
                <p className="font-black">{billingName}</p>
                {billingStreet ? <p>{billingStreet}</p> : null}
                {billingPostalLine ? <p>{billingPostalLine}</p> : null}
                {billingEmail ? <p>{billingEmail}</p> : null}
                {billingPhone ? <p>{billingPhone}</p> : null}
              </div>
            </div>

            <div className="rounded-[24px] border border-[#E8DED2] bg-[#FBF7F0] p-4">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[#A75B28]">
                Lieferadresse
              </p>
              {showShippingAddress ? (
                <div className="mt-3 text-sm font-semibold leading-6 text-[#102A43]">
                  <p className="font-black">{shippingName}</p>
                  {shippingStreet ? <p>{shippingStreet}</p> : null}
                  {shippingPostalLine ? <p>{shippingPostalLine}</p> : null}
                </div>
              ) : (
                <p className="mt-3 text-sm font-semibold leading-6 text-[#52616F]">
                  Entspricht der Rechnungsadresse.
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-[32px] border border-[#E8DED2] bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#FBF7F0] text-[#A75B28]">
              <School className="h-5 w-5" />
            </div>

            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
                Dein Schulpaket
              </p>
              <h2 className="text-xl font-black text-[#102A43]">
                {invoice.child_name_snapshot || "Kind nicht angegeben"}
              </h2>
              <p className="mt-1 text-sm font-semibold text-[#52616F]">
                {invoice.school_name_snapshot || "Schule nicht angegeben"}
                {invoice.class_name_snapshot
                  ? ` · Klasse ${invoice.class_name_snapshot}`
                  : ""}
              </p>
            </div>
          </div>

          {invoiceItems.length > 0 ? (
            <div className="overflow-hidden rounded-2xl border border-[#E8DED2]">
              <div className="grid grid-cols-[72px_1fr_110px] bg-[#102A43] px-4 py-3 text-xs font-black uppercase tracking-[0.12em] text-white md:grid-cols-[80px_1fr_120px_120px]">
                <div>Menge</div>
                <div>Artikel</div>
                <div className="hidden md:block">Einzel</div>
                <div className="text-right">Gesamt</div>
              </div>

              {invoiceItems.map((item, index) => (
                <div
                  key={item.id}
                  className={`grid grid-cols-[72px_1fr_110px] gap-3 px-4 py-4 text-sm md:grid-cols-[80px_1fr_120px_120px] ${
                    index % 2 === 0 ? "bg-[#FBF7F0]" : "bg-white"
                  }`}
                >
                  <div className="font-black text-[#102A43]">
                    {toNumber(item.quantity, 1)}
                    {item.unit ? ` ${item.unit}` : ""}
                  </div>

                  <div>
                    <p className="font-black text-[#102A43]">
                      {item.product_name}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-[#52616F]">
                      {item.product_sku || "Ohne Art.-Nr."}
                    </p>

                    {item.is_book_snapshot === true &&
                    item.book_isbn13_snapshot ? (
                      <p className="mt-1 text-xs font-semibold text-[#52616F]">
                        ISBN-13: {item.book_isbn13_snapshot}
                      </p>
                    ) : null}

                    {item.book_cover_selected === true ? (
                      <div className="mt-3 rounded-2xl border border-[#BFE3CD] bg-[#F0FFF6] px-3 py-2 text-xs font-semibold leading-5 text-[#2F7D50]">
                        <p className="font-black">
                          {item.book_cover_name_snapshot ||
                            "Passende Buchhülle"}
                        </p>

                        <p className="mt-1">
                          {toNumber(item.book_cover_quantity, 0)} ×{" "}
                          {formatMoney(item.book_cover_unit_price)} ={" "}
                          {formatMoney(item.book_cover_total_price)}
                        </p>
                      </div>
                    ) : null}
                  </div>

                  <div className="hidden font-semibold text-[#52616F] md:block">
                    {formatMoney(item.unit_price)}
                  </div>

                  <div className="text-right font-black text-[#102A43]">
                    {formatMoney(item.total_price)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-[#D8C8B8] bg-[#FBF7F0] p-5 text-sm font-semibold text-[#52616F]">
              Keine Rechnungspositionen vorhanden.
            </div>
          )}

          <div className="mt-5 rounded-[28px] border border-[#E8DED2] bg-[#FBF7F0] p-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-2xl border border-[#E8DED2] bg-white p-3">
                <p className="text-xs font-bold text-[#52616F]">
                  Produkt-Zwischensumme
                </p>
                <p className="mt-1 text-xl font-black text-[#102A43]">
                  {formatMoney(invoice.subtotal_amount)}
                </p>
              </div>

              <div className="rounded-2xl border border-[#E8DED2] bg-white p-3">
                <p className="text-xs font-bold text-[#52616F]">
                  Ausgewählte Buchhüllen
                </p>
                <p
                  className={`mt-1 text-xl font-black ${
                    hasBookCovers
                      ? "text-[#2F7D50]"
                      : "text-[#52616F]"
                  }`}
                >
                  {formatMoney(bookCoverAmount)}
                </p>
              </div>

              <div className="rounded-2xl border border-[#E8DED2] bg-white p-3">
                <p className="text-xs font-bold text-[#52616F]">
                  {hasDiscount
                    ? getDiscountDescription(invoice)
                    : "Rabatt"}
                </p>
                <p
                  className={`mt-1 text-xl font-black ${
                    hasDiscount
                      ? "text-[#2F7D50]"
                      : "text-[#52616F]"
                  }`}
                >
                  {hasDiscount
                    ? formatNegativeMoney(discountAmount)
                    : "—"}
                </p>
              </div>

              <div className="rounded-2xl border border-[#E8DED2] bg-white p-3">
                <p className="text-xs font-bold text-[#52616F]">
                  Versandpauschale
                </p>
                <p className="mt-1 text-xl font-black text-[#102A43]">
                  {formatMoney(invoice.shipping_amount)}
                </p>
              </div>

              <div className="rounded-2xl border border-[#E8DED2] bg-white p-3">
                <p className="text-xs font-bold text-[#52616F]">
                  Buchversand
                </p>
                <p
                  className={`mt-1 text-xl font-black ${
                    hasBookShipping
                      ? "text-[#102A43]"
                      : "text-[#52616F]"
                  }`}
                >
                  {formatMoney(bookShippingAmount)}
                </p>
              </div>

              <div className="rounded-2xl border border-[#F0C7C7] bg-[#FFF5F5] p-3">
                <p className="text-xs font-bold text-[#52616F]">
                  Gesamtbetrag
                </p>
                <p className="mt-1 text-2xl font-black text-[#B5282D]">
                  {formatMoney(invoice.total_amount)}
                </p>
              </div>
            </div>

            {containsBooks ? (
              <div className="mt-4 rounded-2xl border border-[#D6E7EF] bg-[#F5FAFD] px-4 py-3 text-sm font-semibold leading-6 text-[#12395F]">
                Diese Rechnung enthält mindestens ein Buch.
                Buchhüllen werden nur berechnet, wenn sie ausdrücklich
                ausgewählt wurden. Der Buchversand wird bei Lieferung
                einmalig und bei Abholung nicht berechnet.
              </div>
            ) : null}
          </div>
        </section>

        <section className="rounded-[32px] border border-[#E8DED2] bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#F0FFF6] text-[#2F7D50]">
              <CreditCard className="h-7 w-7" />
            </div>

            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#2F7D50]">
                Zahlungsart
              </p>

              <h2 className="mt-1 text-2xl font-black tracking-tight text-[#102A43]">
                {invoice.selected_payment_method
                  ? "Zahlung fortsetzen"
                  : "Zahlungsart auswählen"}
              </h2>

              <p className="mt-2 text-sm font-bold leading-6 text-[#52616F]">
                {invoice.selected_payment_method
                  ? `Im Checkout ausgewählt: ${getPaymentMethodLabel(invoice.selected_payment_method)}.`
                  : "Wähle eine Zahlungsart aus. Dieser Auswahlblock erscheint nur bei älteren Rechnungen ohne Checkout-Zahlungsart."}
              </p>
            </div>
          </div>

          {isPaid ? (
            <div className="mt-6 rounded-[26px] border border-[#BFE3CD] bg-[#F0FFF6] p-5">
              <p className="text-lg font-black text-[#102A43]">
                Diese Rechnung ist bereits bezahlt.
              </p>
              <p className="mt-2 text-sm font-bold leading-6 text-[#52616F]">
                Dein Zahlungseingang ist verbucht. Dein Paket kann weiter bearbeitet werden.
              </p>
            </div>
          ) : invoice.selected_payment_method === "paypal" ? (
            <div className="mt-6 rounded-[26px] border border-[#BFE3CD] bg-[#F0FFF6] p-5">
              <CustomerPaymentMethodButton
                invoiceToken={invoice.invoice_token}
                paymentMethod="paypal"
                label="PayPal"
                description="Du hast PayPal im Checkout ausgewählt. Starte hier die PayPal-Zahlung mit dem Gesamtbetrag."
              />
            </div>
          ) : invoice.selected_payment_method === "bank_transfer" ? (
            <div className="mt-6 rounded-[26px] border border-[#E8DED2] bg-[#FBF7F0] p-5">
              <p className="text-lg font-black text-[#102A43]">
                Überweisung Vorkasse
              </p>
              <p className="mt-2 text-sm font-bold leading-6 text-[#52616F]">
                Du hast Überweisung im Checkout ausgewählt. Öffne die Bankdaten und überweise den Gesamtbetrag mit dem angegebenen Verwendungszweck.
              </p>
              <a
                href={"/rechnung/" + encodeURIComponent(invoice.invoice_token) + "/abschluss?method=bank_transfer"}
                className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#102A43] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110"
              >
                Bankdaten anzeigen
              </a>
            </div>
          ) : invoice.selected_payment_method === "cash_on_pickup" && canUseCashOnPickup ? (
            <div className="mt-6 rounded-[26px] border border-[#E8DED2] bg-[#FBF7F0] p-5">
              <p className="text-lg font-black text-[#102A43]">
                Barzahlung bei Abholung
              </p>
              <p className="mt-2 text-sm font-bold leading-6 text-[#52616F]">
                Barzahlung wurde für diesen Vorgang freigegeben. Du zahlst direkt bei Abholung im Laden.
              </p>
              <a
                href={"/rechnung/" + encodeURIComponent(invoice.invoice_token) + "/abschluss?method=cash_on_pickup"}
                className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#102A43] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110"
              >
                Abholhinweise anzeigen
              </a>
            </div>
          ) : (
            <div className="mt-6 grid gap-5">
              <CustomerPaymentMethodButton
                invoiceToken={invoice.invoice_token}
                paymentMethod="paypal"
                label="PayPal"
                description="Empfohlen und am schnellsten. Du wirst direkt zur PayPal-Zahlung mit dem Gesamtbetrag weitergeleitet."
              />

              <CustomerPaymentMethodButton
                invoiceToken={invoice.invoice_token}
                paymentMethod="bank_transfer"
                label="Überweisung Vorkasse"
                description="Du überweist den Gesamtbetrag vorab. Die Bearbeitung startet nach Zahlungseingang."
              />

              {canUseCashOnPickup ? (
                <CustomerPaymentMethodButton
                  invoiceToken={invoice.invoice_token}
                  paymentMethod="cash_on_pickup"
                  label="Barzahlung bei Abholung"
                  description="Du zahlst den Gesamtbetrag direkt bei Abholung im Laden. Dein Paket wird für die angegebene Frist reserviert."
                />
              ) : null}
            </div>
          )}

          <div className="mt-5 rounded-[26px] border border-[#F1D1A8] bg-[#FFF8EE] p-4 text-sm font-bold leading-6 text-[#A75B28]">
            {invoice.selected_payment_method
              ? "Wichtig: Dein Paket wird nach Zahlungseingang weiter bearbeitet."
              : canUseCashOnPickup
              ? "Wichtig: Bei PayPal oder Überweisung wird Dein Paket nach Zahlungseingang weiter bearbeitet. Bei Barzahlung zahlst Du direkt bei Abholung im Laden."
              : "Wichtig: Bei PayPal oder Überweisung wird Dein Paket nach Zahlungseingang weiter bearbeitet."}
          </div>
        </section>

        <footer className="pb-8 text-center text-xs font-semibold leading-5 text-[#52616F]">
          Handzettel-Schulen.de · Dein Schulpaket-Service
        </footer>
      </section>
    </main>
  );
}
