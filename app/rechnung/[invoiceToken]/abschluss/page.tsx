import { createClient } from "@supabase/supabase-js";
import QRCode from "qrcode";
import {
  Banknote,
  CheckCircle2,
  CreditCard,
  FileText,
  Landmark,
  ShieldCheck,
} from "lucide-react";
import CopyPaymentValueButton from "@/components/CopyPaymentValueButton";
import {
  formatIban,
  PAYMENT_COPY,
  resolveBankTransferDetails,
  type BankTransferDetails,
} from "@/app/lib/paymentSettings";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    invoiceToken: string;
  }>;
  searchParams?: Promise<{
    method?: string | string[];
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
  bank_account_holder_snapshot: string | null;
  bank_name_snapshot: string | null;
  bank_iban_snapshot: string | null;
  bank_bic_snapshot: string | null;
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
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function normalizePaymentMethod(value: string | string[] | undefined) {
  const method = Array.isArray(value) ? value[0] : value;

  if (
    method === "bank_transfer" ||
    method === "cash_on_pickup" ||
    method === "paypal"
  ) {
    return method;
  }

  return "bank_transfer";
}

function getPurpose(invoice: InvoiceRow) {
  return invoice.invoice_number || `Rechnung ${invoice.id}`;
}

function sanitizeEpcText(value: string, maxLength: number) {
  return value
    .replace(/\r?\n|\r/g, " ")
    .replace(/[^\p{L}\p{N}\s.,:;+\-_/()&]/gu, "")
    .trim()
    .slice(0, maxLength);
}

function createEpcQrPayload(invoice: InvoiceRow, bankDetails: BankTransferDetails) {
  const amount = toNumber(invoice.total_amount, 0).toFixed(2);
  const purpose = getPurpose(invoice);

  return [
    "BCD",
    "002",
    "1",
    "SCT",
    sanitizeEpcText(bankDetails.bic, 11),
    sanitizeEpcText(bankDetails.accountHolder, 70),
    bankDetails.iban,
    `EUR${amount}`,
    "",
    "",
    sanitizeEpcText(purpose, 140),
    "",
  ].join("\n");
}

async function createQrCodeDataUrl(invoice: InvoiceRow, bankDetails: BankTransferDetails) {
  const payload = createEpcQrPayload(invoice, bankDetails);

  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 420,
  });
}

function NotFoundCard() {
  return (
    <main className="min-h-screen bg-[#FBF7F0] px-4 py-10 text-[#102A43]">
      <section className="mx-auto max-w-2xl rounded-[32px] border border-[#E8DED2] bg-white p-6 text-center shadow-sm">
        <FileText className="mx-auto h-10 w-10 text-[#B5282D]" />
        <h1 className="mt-4 text-2xl font-black">Rechnung nicht gefunden</h1>
        <p className="mt-2 text-sm font-semibold leading-6 text-[#52616F]">
          Der Zahlungslink ist ungültig oder die Rechnung wurde nicht gefunden.
        </p>
      </section>
    </main>
  );
}

export default async function InvoiceCompletionPage({
  params,
  searchParams,
}: Params) {
  const { invoiceToken } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const selectedMethod = normalizePaymentMethod(resolvedSearchParams.method);

  const token = decodeURIComponent(invoiceToken || "").trim();
  const supabase = getSupabaseAdmin();

  const { data: invoiceData, error: invoiceError } = await supabase
    .from("school_request_invoices")
    .select("*")
    .eq("invoice_token", token)
    .maybeSingle();

  if (invoiceError || !invoiceData) {
    return <NotFoundCard />;
  }

  const invoice = invoiceData as InvoiceRow;
  const amount = formatMoney(invoice.total_amount);
  const purpose = getPurpose(invoice);
  const bankDetails = resolveBankTransferDetails(invoice);
  const qrCodeDataUrl =
    selectedMethod === "bank_transfer"
      ? await createQrCodeDataUrl(invoice, bankDetails)
      : "";

  const isBankTransfer = selectedMethod === "bank_transfer";
  const isCashOnPickup = selectedMethod === "cash_on_pickup";
  const isPaypal = selectedMethod === "paypal";

  return (
    <main className="min-h-screen bg-[#FBF7F0] text-[#102A43]">
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="rounded-[34px] border border-[#E8DED2] bg-white p-5 shadow-[0_18px_45px_rgba(16,42,67,0.10)] sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[#F0FFF6] px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-[#2F7D50]">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Zahlungsart gespeichert
              </div>

              <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
                {isBankTransfer
                  ? PAYMENT_COPY.bankTransferTitle
                  : isCashOnPickup
                  ? PAYMENT_COPY.cashPickupTitle
                  : "Zahlung abgeschlossen"}
              </h1>

              <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-[#52616F] sm:text-base">
                {isBankTransfer
                  ? PAYMENT_COPY.bankTransferIntro
                  : isCashOnPickup
                  ? PAYMENT_COPY.cashPickupIntro
                  : "Vielen Dank. Deine Zahlung wurde verarbeitet oder befindet sich in Prüfung."}
              </p>
            </div>

            <div className="rounded-[28px] border border-[#BFE3CD] bg-[#F0FFF6] p-4">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#2F7D50]">
                Gesamtbetrag
              </p>
              <p className="mt-2 text-3xl font-black text-[#102A43]">
                {amount}
              </p>
              <p className="mt-1 text-sm font-semibold text-[#52616F]">
                Rechnung {invoice.invoice_number || "ohne Nummer"}
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
              {isBankTransfer ? (
                <Landmark className="h-5 w-5" />
              ) : isCashOnPickup ? (
                <Banknote className="h-5 w-5" />
              ) : (
                <CreditCard className="h-5 w-5" />
              )}
            </div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#12395F]">
              Zahlungsart
            </p>
            <p className="mt-2 font-black text-[#102A43]">
              {isBankTransfer
                ? "Überweisung Vorkasse"
                : isCashOnPickup
                ? "Barzahlung bei Abholung"
                : isPaypal
                ? "PayPal"
                : "Zahlung"}
            </p>
            <p className="mt-1 text-xs font-semibold text-[#52616F]">
              {isBankTransfer
                ? "Bitte Überweisung mit Verwendungszweck ausführen."
                : isCashOnPickup
                ? "Zahlung erfolgt bei Abholung."
                : "PayPal-Zahlung wird verarbeitet."}
            </p>
          </div>

          <div className="rounded-[28px] border border-[#E8DED2] bg-white p-5 shadow-sm">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#F0FFF6] text-[#2F7D50]">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#2F7D50]">
              Status
            </p>
            <p className="mt-2 font-black text-[#102A43]">
              {isBankTransfer
                ? "Wartet auf Zahlung"
                : isCashOnPickup
                ? "Für Abholung vorgemerkt"
                : "In Bearbeitung"}
            </p>
            <p className="mt-1 text-xs font-semibold text-[#52616F]">
              {invoice.payment_due_at
                ? `Zahlungsfrist: ${formatDate(invoice.payment_due_at)}`
                : invoice.cash_pickup_due_at
                ? `Abholfrist: ${formatDate(invoice.cash_pickup_due_at)}`
                : "Wir bearbeiten den Vorgang entsprechend weiter."}
            </p>
          </div>
        </section>

        {isBankTransfer ? (
          <section className="grid gap-6 lg:grid-cols-[380px_1fr]">
            <div className="rounded-[32px] border border-[#E8DED2] bg-white p-5 text-center shadow-sm sm:p-6">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
                Banking-QR-Code
              </p>

              <h2 className="mt-1 text-xl font-black text-[#102A43]">
                Mit Banking-App scannen
              </h2>

              <div className="mt-5 rounded-[28px] border border-[#E8DED2] bg-[#FBF7F0] p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrCodeDataUrl}
                  alt="GiroCode QR-Code für Überweisung"
                  className="mx-auto h-auto w-full max-w-[300px] rounded-2xl bg-white p-3"
                />
              </div>

              <p className="mt-4 text-sm font-semibold leading-6 text-[#52616F]">
                {PAYMENT_COPY.giroCodeHint}
              </p>
            </div>

            <div className="rounded-[32px] border border-[#E8DED2] bg-white p-5 shadow-sm sm:p-6">
              <div className="mb-5 flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#FBF7F0] text-[#A75B28]">
                  <Landmark className="h-5 w-5" />
                </div>

                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
                    Überweisungsdaten
                  </p>
                  <h2 className="text-xl font-black text-[#102A43]">
                    Bitte genau so übernehmen
                  </h2>
                </div>
              </div>

              <div className="grid gap-3">
                <div className="rounded-[24px] border border-[#E8DED2] bg-[#FBF7F0] p-4">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-[#A75B28]">
                    Empfänger
                  </p>
                  <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="font-black text-[#102A43]">
                      {bankDetails.accountHolder}
                    </p>
                    <CopyPaymentValueButton
                      value={bankDetails.accountHolder}
                    />
                  </div>
                </div>

                <div className="rounded-[24px] border border-[#E8DED2] bg-[#FBF7F0] p-4">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-[#A75B28]">
                    Bank
                  </p>
                  <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="font-black text-[#102A43]">
                      {bankDetails.bankName}
                    </p>
                    <CopyPaymentValueButton
                      value={bankDetails.bankName}
                    />
                  </div>
                </div>

                <div className="rounded-[24px] border border-[#E8DED2] bg-[#FBF7F0] p-4">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-[#A75B28]">
                    IBAN
                  </p>
                  <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="break-all font-black text-[#102A43]">
                      {formatIban(bankDetails.iban)}
                    </p>
                    <CopyPaymentValueButton
                      value={bankDetails.iban}
                    />
                  </div>
                </div>

                <div className="rounded-[24px] border border-[#E8DED2] bg-[#FBF7F0] p-4">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-[#A75B28]">
                    BIC
                  </p>
                  <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="font-black text-[#102A43]">
                      {bankDetails.bic}
                    </p>
                    <CopyPaymentValueButton value={bankDetails.bic} />
                  </div>
                </div>

                <div className="rounded-[24px] border border-[#BFE3CD] bg-[#F0FFF6] p-4">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-[#2F7D50]">
                    Betrag
                  </p>
                  <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-2xl font-black text-[#102A43]">
                      {amount}
                    </p>
                    <CopyPaymentValueButton
                      value={toNumber(invoice.total_amount, 0)
                        .toFixed(2)
                        .replace(".", ",")}
                    />
                  </div>
                </div>

                <div className="rounded-[24px] border border-[#F1D1A8] bg-[#FFF8EE] p-4">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-[#A75B28]">
                    Verwendungszweck
                  </p>
                  <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="break-all text-lg font-black text-[#102A43]">
                      {purpose}
                    </p>
                    <CopyPaymentValueButton value={purpose} />
                  </div>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {isCashOnPickup ? (
          <section className="rounded-[32px] border border-[#E8DED2] bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#F0FFF6] text-[#2F7D50]">
                <Banknote className="h-5 w-5" />
              </div>

              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#2F7D50]">
                  Vorgang abgeschlossen
                </p>
                <h2 className="mt-1 text-xl font-black text-[#102A43]">
                  Du zahlst bei Abholung
                </h2>
                <p className="mt-2 text-sm font-semibold leading-6 text-[#52616F]">
                  Bitte bringe den Betrag von{" "}
                  <strong className="text-[#102A43]">{amount}</strong> zur
                  Abholung mit. Dein Paket wird nun entsprechend vorbereitet.
                </p>

                {invoice.pickup_location_label_snapshot ||
                invoice.pickup_address_snapshot ? (
                  <div className="mt-4 rounded-[24px] border border-[#E8DED2] bg-[#FBF7F0] p-4">
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-[#A75B28]">
                      Abholort
                    </p>
                    <p className="mt-2 font-black text-[#102A43]">
                      {invoice.pickup_location_label_snapshot ||
                        "Abholung im Laden"}
                    </p>
                    {invoice.pickup_address_snapshot ? (
                      <p className="mt-1 text-sm font-semibold leading-6 text-[#52616F]">
                        {invoice.pickup_address_snapshot}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}

        <section className="rounded-[32px] border border-[#BFE3CD] bg-[#F0FFF6] p-5 shadow-sm sm:p-6">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-[#2F7D50]" />
            <div>
              <h2 className="text-xl font-black text-[#1F5D3A]">
                Dein Vorgang ist gespeichert.
              </h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-[#2F7D50]">
                {isBankTransfer
                  ? "Nach Zahlungseingang bereiten wir Dein Schulpaket weiter vor."
                  : isCashOnPickup
                  ? "Wir bereiten Dein Schulpaket für die Abholung vor."
                  : "Wir bearbeiten Deinen Vorgang weiter."}
              </p>
            </div>
          </div>
        </section>

        <footer className="pb-8 text-center text-xs font-semibold leading-5 text-[#52616F]">
          Handzettel-Schulen.de · Dein Schulpaket-Service
        </footer>
      </section>
    </main>
  );
}
