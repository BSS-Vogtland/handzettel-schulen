import { createClient } from "@supabase/supabase-js";
import {
  Banknote,
  CheckCircle2,
  CreditCard,
  FileText,
  PackageCheck,
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
  total_amount: number | string | null;
  currency: string | null;

  customer_name_snapshot: string | null;
  customer_email_snapshot: string | null;
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
      return "PayPal empfohlen";
  }
}

function getFulfillmentLabel(method: string | null) {
  if (method === "pickup") return "Abholung im Laden";
  if (method === "shipping") return "Versand";
  return "Noch nicht gewählt";
}

export default async function InvoicePaymentPage({ params }: Params) {
  const { invoiceToken } = await params;
  const supabase = getSupabaseAdmin();

  const { data: invoiceData, error: invoiceError } = await supabase
    .from("school_request_invoices")
    .select("*")
    .eq("invoice_token", invoiceToken)
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

  const { data: itemsData } = await supabase
    .from("school_request_invoice_items")
    .select("*")
    .eq("invoice_id", invoice.id)
    .order("created_at", { ascending: true });

  const invoiceItems = (itemsData || []) as InvoiceItemRow[];

  const isPickup = invoice.fulfillment_method_snapshot === "pickup";
  const isShipping = invoice.fulfillment_method_snapshot === "shipping";
  const isPaid =
    invoice.payment_status === "payment_received" ||
    invoice.payment_status === "cash_paid";

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
                Bitte wähle Deine Zahlungsart. PayPal ist der schnellste und
                bevorzugte Zahlungsweg. Bei PayPal oder Überweisung starten wir
                nach Zahlungseingang mit der weiteren Bearbeitung.
              </p>
            </div>

            <div className="rounded-[28px] border border-[#BFE3CD] bg-[#F0FFF6] p-4">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#2F7D50]">
                Gesamtbetrag
              </p>
              <p className="mt-2 text-3xl font-black text-[#102A43]">
                {formatMoney(invoice.total_amount)}
              </p>
              <p className="mt-1 text-sm font-semibold text-[#52616F]">
                inkl. Versandkosten, falls Versand gewählt wurde
              </p>
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
                ? "Versandpauschale ist im Gesamtbetrag enthalten."
                : isPickup
                ? "Abholung im Laden."
                : "Noch nicht gewählt."}
            </p>
          </div>

          <div className="rounded-[28px] border border-[#E8DED2] bg-white p-5 shadow-sm">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FBF7F0] text-[#2F7D50]">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#2F7D50]">
              Status
            </p>
            <p className="mt-2 font-black text-[#102A43]">
              {getPaymentStatusLabel(invoice.payment_status)}
            </p>
            <p className="mt-1 text-xs font-semibold text-[#52616F]">
              Zahlungsart: {getPaymentMethodLabel(invoice.selected_payment_method)}
            </p>
          </div>
        </section>

        <section className="rounded-[32px] border border-[#E8DED2] bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#FBF7F0] text-[#A75B28]">
              <School className="h-5 w-5" />
            </div>

            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
                Schulpaket
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
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <p className="text-xs font-bold text-[#52616F]">Paketbetrag</p>
                <p className="mt-1 text-xl font-black text-[#102A43]">
                  {formatMoney(invoice.subtotal_amount)}
                </p>
              </div>

              <div>
                <p className="text-xs font-bold text-[#52616F]">Versandkosten</p>
                <p className="mt-1 text-xl font-black text-[#102A43]">
                  {formatMoney(invoice.shipping_amount)}
                </p>
              </div>

              <div>
                <p className="text-xs font-bold text-[#52616F]">Gesamtbetrag</p>
                <p className="mt-1 text-2xl font-black text-[#B5282D]">
                  {formatMoney(invoice.total_amount)}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[32px] border border-[#E8DED2] bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#F0FFF6] text-[#2F7D50]">
              <CreditCard className="h-5 w-5" />
            </div>

            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#2F7D50]">
                Zahlungsart wählen
              </p>
              <h2 className="text-xl font-black text-[#102A43]">
                Wie möchtest Du bezahlen?
              </h2>
              <p className="mt-1 text-sm font-semibold leading-6 text-[#52616F]">
                PayPal ist der bevorzugte Zahlungsweg. Die direkte
                PayPal-Weiterleitung wird im nächsten Schritt aktiviert.
              </p>
            </div>
          </div>

          {isPaid ? (
            <div className="rounded-[26px] border border-[#BFE3CD] bg-[#F0FFF6] p-5">
              <p className="font-black text-[#2F7D50]">
                Diese Rechnung ist bereits als bezahlt markiert.
              </p>
            </div>
          ) : (
            <div className="grid gap-4">
              <CustomerPaymentMethodButton
                invoiceToken={invoice.invoice_token}
                paymentMethod="paypal"
                label="PayPal"
                description="Empfohlen und am schnellsten. Die direkte PayPal-Zahlung mit Gesamtbetrag wird im nächsten Schritt angebunden."
                recommended
              />

              <CustomerPaymentMethodButton
                invoiceToken={invoice.invoice_token}
                paymentMethod="bank_transfer"
                label="Überweisung Vorkasse"
                description="Du überweist den Gesamtbetrag vorab. Die Bearbeitung startet nach Zahlungseingang."
              />

              <CustomerPaymentMethodButton
                invoiceToken={invoice.invoice_token}
                paymentMethod="cash_on_pickup"
                label="Barzahlung bei Abholung"
                description="Nur bei Abholung möglich. Dein Paket wird für 14 Tage zur Abholung reserviert."
                disabled={!isPickup}
              />
            </div>
          )}

          <div className="mt-5 rounded-[26px] border border-[#F1D1A8] bg-[#FFF8EE] p-4 text-sm font-bold leading-6 text-[#A75B28]">
            Wichtig: Bei PayPal oder Überweisung wird Dein Paket nach
            Zahlungseingang weiter bearbeitet. Bei Barzahlung vor Ort ist die
            Zahlung nur bei Abholung möglich.
          </div>
        </section>

        <footer className="pb-8 text-center text-xs font-semibold leading-5 text-[#52616F]">
          Handzettel-Schulen.de · Dein Schulpaket-Service
        </footer>
      </section>
    </main>
  );
}