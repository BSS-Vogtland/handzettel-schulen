import AdminBookSupplierInquiryActions from "@/components/AdminBookSupplierInquiryActions";
import { supabaseServer } from "@/lib/supabase/server";
import {
  ArrowLeft,
  BookOpen,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Mail,
  PackageCheck,
  Phone,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

type InquiryItemRow = {
  id: string;
  isbn: string;
  title: string;
  subtitle: string | null;
  publisher: string | null;
  cover_url: string | null;
  requested_quantity: number;
  availability_status: string;
  available_quantity: number | null;
  lead_time_days: number | null;
  available_from: string | null;
  reservation_until: string | null;
  supplier_note: string | null;
  linked_product_id: string | null;
  proposed_price_gross: number | null;
  proposed_tax_rate: number | null;
  price_source: string | null;
  price_confirmation_status: string;
  confirmed_price_gross: number | null;
  confirmed_tax_rate: number | null;
  price_confirmed_at: string | null;
  price_applied_to_product_at: string | null;
};

function formatDate(value: string | null) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDateOnly(value: string | null) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    dateStyle: "medium",
  }).format(new Date(value));
}

function formatPrice(value: number | null) {
  if (value === null || !Number.isFinite(Number(value))) {
    return "—";
  }

  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(Number(value));
}

function getStatusLabel(status: string) {
  switch (status) {
    case "draft":
      return "Entwurf";

    case "sent":
      return "Gesendet";

    case "partially_answered":
      return "Teilweise beantwortet";

    case "answered":
      return "Beantwortet";

    case "closed":
      return "Abgeschlossen";

    default:
      return status;
  }
}

function getStatusClasses(status: string) {
  switch (status) {
    case "draft":
      return "bg-[#F3F4F5] text-[#52616F]";

    case "sent":
      return "bg-[#EEF4FA] text-[#12395F]";

    case "partially_answered":
      return "bg-[#FFF8EE] text-[#8A4A1F]";

    case "answered":
      return "bg-[#F0FFF6] text-[#2F7D50]";

    case "closed":
      return "bg-[#E7F8EE] text-[#2F7D50]";

    default:
      return "bg-[#F3F4F5] text-[#52616F]";
  }
}

function getAvailabilityLabel(status: string) {
  switch (status) {
    case "in_store":
      return "Im Laden verfügbar";

    case "orderable":
      return "Bestellbar";

    case "partially_available":
      return "Teilweise verfügbar";

    case "unavailable":
      return "Nicht verfügbar";

    case "checking":
      return "Noch zu prüfen";

    default:
      return "Noch offen";
  }
}

function getAvailabilityClasses(status: string) {
  switch (status) {
    case "in_store":
    case "orderable":
      return "border-[#BFE3CD] bg-[#F0FFF6] text-[#2F7D50]";

    case "partially_available":
    case "checking":
      return "border-[#F1D1A8] bg-[#FFF8EE] text-[#8A4A1F]";

    case "unavailable":
      return "border-[#F0B7BA] bg-[#FFF1F1] text-[#9F1D24]";

    default:
      return "border-[#C8D8E8] bg-[#F5FAFD] text-[#12395F]";
  }
}

function getPriceStatusLabel(status: string) {
  switch (status) {
    case "confirmed":
      return "Preis und USt. bestätigt";

    case "changed":
      return "Preis oder USt. geändert";

    default:
      return "Preisprüfung offen";
  }
}

function getPriceStatusClasses(status: string) {
  switch (status) {
    case "confirmed":
      return "border-[#BFE3CD] bg-[#F0FFF6] text-[#2F7D50]";

    case "changed":
      return "border-[#F1D1A8] bg-[#FFF8EE] text-[#8A4A1F]";

    default:
      return "border-[#C8D8E8] bg-[#F5FAFD] text-[#12395F]";
  }
}

function getOrderStatusLabel(status: string) {
  switch (status) {
    case "draft":
      return "Entwurf";

    case "sent":
      return "Gesendet";

    case "accepted":
      return "Angenommen";

    case "partially_accepted":
      return "Teilweise angenommen";

    case "unavailable":
      return "Nicht lieferbar";

    case "ready":
      return "Zur Abholung bereit";

    default:
      return status;
  }
}

function getSiteUrl() {
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    "";

  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }

  return "https://www.handzettel-schulen.de";
}

export default async function AdminBookSupplierInquiryDetailPage({
  params,
}: Params) {
  const { id } = await params;

  const { data: inquiry, error: inquiryError } =
    await supabaseServer
      .from("book_supplier_inquiries")
      .select("*")
      .eq("id", id)
      .maybeSingle();

  if (inquiryError) {
    throw new Error(
      `Sammelanfrage konnte nicht geladen werden: ${inquiryError.message}`,
    );
  }

  if (!inquiry) {
    notFound();
  }

  const [
    { data: partner, error: partnerError },
    { data: items, error: itemsError },
    { data: events, error: eventsError },
    { data: orders, error: ordersError },
  ] = await Promise.all([
    supabaseServer
      .from("book_supplier_partners")
      .select("*")
      .eq("id", inquiry.supplier_id)
      .maybeSingle(),

    supabaseServer
      .from("book_supplier_inquiry_items")
      .select("*")
      .eq("inquiry_id", inquiry.id)
      .order("sort_order", {
        ascending: true,
      }),

    supabaseServer
      .from("book_supplier_events")
      .select("*")
      .eq("inquiry_id", inquiry.id)
      .order("created_at", {
        ascending: false,
      }),

    supabaseServer
      .from("book_supplier_orders")
      .select("*")
      .eq("source_inquiry_id", inquiry.id)
      .order("created_at", {
        ascending: false,
      }),
  ]);

  if (partnerError || !partner) {
    throw new Error(
      `Buchhandlung konnte nicht geladen werden: ${
        partnerError?.message || "Partner fehlt"
      }`,
    );
  }

  if (itemsError) {
    throw new Error(
      `Buchpositionen konnten nicht geladen werden: ${itemsError.message}`,
    );
  }

  if (eventsError) {
    throw new Error(
      `Ereignisse konnten nicht geladen werden: ${eventsError.message}`,
    );
  }

  if (ordersError) {
    throw new Error(
      `Buchaufträge konnten nicht geladen werden: ${ordersError.message}`,
    );
  }

  const inquiryItems = (items || []) as InquiryItemRow[];

  const availabilityAnsweredCount = inquiryItems.filter(
    (item) => item.availability_status !== "pending",
  ).length;

  const priceAnsweredCount = inquiryItems.filter(
    (item) =>
      item.price_confirmation_status === "confirmed" ||
      item.price_confirmation_status === "changed",
  ).length;

  const changedPriceCount = inquiryItems.filter(
    (item) => item.price_confirmation_status === "changed",
  ).length;

  const fullyAnsweredCount = inquiryItems.filter(
    (item) =>
      item.availability_status !== "pending" &&
      (item.price_confirmation_status === "confirmed" ||
        item.price_confirmation_status === "changed"),
  ).length;

  const supplierPortalUrl =
    `${getSiteUrl()}/lieferantenportal/buchanfrage/` +
    inquiry.response_token;

  return (
    <main className="min-h-screen bg-[#FBF7F0] text-[#102A43]">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <Link
          href="/admin/buchhandlung/anfragen"
          className="inline-flex items-center gap-2 text-sm font-black text-[#12395F]"
        >
          <ArrowLeft className="h-4 w-4" />
          Zurück zu den Buchhandlungsanfragen
        </Link>

        <header className="grid gap-5 rounded-[34px] border border-[#E8DED2] bg-white p-6 shadow-sm lg:grid-cols-[minmax(0,1fr)_340px]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-[#FBF7F0] px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
              <Mail className="h-3.5 w-3.5" />
              {partner.name}
            </div>

            <h1 className="mt-3 text-3xl font-black">
              {inquiry.inquiry_number}
            </h1>

            <div className="mt-3 flex flex-wrap gap-2">
              <span
                className={`rounded-full px-3 py-1 text-xs font-black ${getStatusClasses(
                  inquiry.status,
                )}`}
              >
                {getStatusLabel(inquiry.status)}
              </span>

              <span className="rounded-full bg-[#FBF7F0] px-3 py-1 text-xs font-black text-[#52616F]">
                Erstellt {formatDate(inquiry.created_at)}
              </span>

              {inquiry.sent_at ? (
                <span className="rounded-full bg-[#EEF4FA] px-3 py-1 text-xs font-black text-[#12395F]">
                  Gesendet {formatDate(inquiry.sent_at)}
                </span>
              ) : null}

              {inquiry.answered_at ? (
                <span className="rounded-full bg-[#F0FFF6] px-3 py-1 text-xs font-black text-[#2F7D50]">
                  Beantwortet {formatDate(inquiry.answered_at)}
                </span>
              ) : null}
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryCard
                label="Positionen"
                value={`${inquiryItems.length}`}
                detail="ISBN-Positionen"
              />

              <SummaryCard
                label="Verfügbarkeit"
                value={`${availabilityAnsweredCount}/${inquiryItems.length}`}
                detail="beantwortet"
              />

              <SummaryCard
                label="Preis und USt."
                value={`${priceAnsweredCount}/${inquiryItems.length}`}
                detail="geprüft"
              />

              <SummaryCard
                label="Vollständig"
                value={`${fullyAnsweredCount}/${inquiryItems.length}`}
                detail={
                  changedPriceCount > 0
                    ? `${changedPriceCount} Preisänderung(en)`
                    : "keine Preisänderung"
                }
              />
            </div>

            {inquiry.admin_note ? (
              <div className="mt-5 rounded-2xl border border-[#F1D1A8] bg-[#FFF8EE] p-4">
                <p className="text-xs font-black uppercase text-[#A75B28]">
                  Hinweis an die Buchhandlung
                </p>

                <p className="mt-2 whitespace-pre-wrap font-semibold leading-6">
                  {inquiry.admin_note}
                </p>
              </div>
            ) : null}

            {inquiry.supplier_note ? (
              <div className="mt-4 rounded-2xl border border-[#BFE3CD] bg-[#F0FFF6] p-4">
                <p className="text-xs font-black uppercase text-[#2F7D50]">
                  Allgemeine Rückmeldung
                </p>

                <p className="mt-2 whitespace-pre-wrap font-semibold leading-6">
                  {inquiry.supplier_note}
                </p>
              </div>
            ) : null}
          </div>

          <aside className="rounded-[26px] border border-[#C8D8E8] bg-[#EEF4FA] p-4">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-[#12395F]" />

              <p className="font-black">
                Buchhandelspartner
              </p>
            </div>

            <p className="mt-3 text-lg font-black">
              {partner.name}
            </p>

            <div className="mt-3 grid gap-2 text-sm font-semibold text-[#52616F]">
              <p className="flex items-start gap-2">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-[#12395F]" />

                <span className="break-all">
                  {partner.email || "Noch keine E-Mail hinterlegt"}
                </span>
              </p>

              <p className="flex items-start gap-2">
                <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-[#12395F]" />

                <span>
                  {partner.contact_person || "Kein Ansprechpartner"}
                </span>
              </p>

              <p className="flex items-start gap-2">
                <Phone className="mt-0.5 h-4 w-4 shrink-0 text-[#12395F]" />

                <span>
                  {partner.phone || "Keine Telefonnummer"}
                </span>
              </p>
            </div>

            <div className="mt-4">
              <AdminBookSupplierInquiryActions
                inquiryId={inquiry.id}
                inquiryNumber={inquiry.inquiry_number}
                supplierPortalUrl={supplierPortalUrl}
                canSend={Boolean(partner.email)}
                wasSent={Boolean(inquiry.sent_at)}
              />
            </div>

            <div className="my-5 h-px bg-[#C8D8E8]" />

            <p className="text-sm font-black">
              Nach manueller Zahlungsprüfung
            </p>

            <p className="mt-1 text-xs font-semibold leading-5 text-[#52616F]">
              Bücher und Mengen werden anschließend bewusst ausgewählt und
              verbindlich bestellt.
            </p>

            <Link
              href={`/admin/buchhandlung/anfragen/${inquiry.id}/auftrag-neu`}
              className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#2F7D50] px-4 py-3 text-sm font-black text-white"
            >
              <PackageCheck className="h-4 w-4" />
              Verbindlichen Auftrag erstellen
            </Link>
          </aside>
        </header>

        {(orders || []).length > 0 ? (
          <section className="rounded-[30px] border border-[#BFE3CD] bg-[#F0FFF6] p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <PackageCheck className="h-5 w-5 text-[#2F7D50]" />

              <h2 className="text-xl font-black">
                Verbindliche Buchaufträge
              </h2>
            </div>

            <div className="mt-4 grid gap-3">
              {(orders || []).map((order) => (
                <Link
                  key={order.id}
                  href={`/admin/buchhandlung/auftraege/${order.id}`}
                  className="flex flex-col gap-2 rounded-2xl border border-[#BFE3CD] bg-white p-4 transition hover:border-[#2F7D50] sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-black">
                      {order.order_number}
                    </p>

                    <p className="mt-1 text-sm font-semibold text-[#52616F]">
                      Erstellt {formatDate(order.created_at)}
                      {order.customer_reference
                        ? ` · ${order.customer_reference}`
                        : ""}
                    </p>
                  </div>

                  <span className="rounded-full bg-[#EEF4FA] px-3 py-1 text-xs font-black text-[#12395F]">
                    {getOrderStatusLabel(order.status)}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <section className="grid gap-4">
          {inquiryItems.map((item, index) => {
            const effectivePrice =
              item.price_confirmation_status === "confirmed" ||
              item.price_confirmation_status === "changed"
                ? item.confirmed_price_gross
                : null;

            const effectiveTaxRate =
              item.price_confirmation_status === "confirmed" ||
              item.price_confirmation_status === "changed"
                ? item.confirmed_tax_rate
                : null;

            const priceChanged =
              item.price_confirmation_status === "changed";

            return (
              <article
                key={item.id}
                className="rounded-[30px] border border-[#E8DED2] bg-white p-5 shadow-sm"
              >
                <div className="grid gap-5 lg:grid-cols-[90px_minmax(0,1fr)_300px]">
                  <div className="h-32 w-[90px] overflow-hidden rounded-xl border border-[#E8DED2] bg-[#FBF7F0]">
                    {item.cover_url ? (
                      <img
                        src={item.cover_url}
                        alt={item.title}
                        className="h-full w-full object-contain p-1"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-[#A75B28]">
                        <BookOpen className="h-6 w-6" />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0">
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-[#A75B28]">
                      Position {index + 1}
                    </p>

                    <h2 className="mt-1 text-xl font-black">
                      {item.title}
                    </h2>

                    {item.subtitle ? (
                      <p className="mt-1 font-semibold text-[#52616F]">
                        {item.subtitle}
                      </p>
                    ) : null}

                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm font-bold text-[#52616F]">
                      <span>ISBN {item.isbn}</span>
                      <span>Angefragt: {item.requested_quantity}</span>

                      {item.publisher ? (
                        <span>{item.publisher}</span>
                      ) : null}
                    </div>

                    {item.supplier_note ? (
                      <div className="mt-4 rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] p-3">
                        <p className="text-xs font-black uppercase text-[#A75B28]">
                          Partnerhinweis
                        </p>

                        <p className="mt-1 whitespace-pre-wrap text-sm font-semibold leading-6">
                          {item.supplier_note}
                        </p>
                      </div>
                    ) : null}
                  </div>

                  <div
                    className={`rounded-2xl border p-4 ${getAvailabilityClasses(
                      item.availability_status,
                    )}`}
                  >
                    <p className="text-xs font-black uppercase">
                      Verfügbarkeit
                    </p>

                    <p className="mt-1 font-black">
                      {getAvailabilityLabel(item.availability_status)}
                    </p>

                    <div className="mt-3 grid gap-1 text-sm font-semibold">
                      {item.available_quantity !== null ? (
                        <p>Menge: {item.available_quantity}</p>
                      ) : null}

                      {item.lead_time_days !== null ? (
                        <p>Lieferzeit: {item.lead_time_days} Tage</p>
                      ) : null}

                      {item.available_from ? (
                        <p>
                          Verfügbar ab: {formatDateOnly(item.available_from)}
                        </p>
                      ) : null}

                      {item.reservation_until ? (
                        <p>
                          Reserviert bis:{" "}
                          {formatDateOnly(item.reservation_until)}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="mt-5 rounded-[24px] border border-[#D6E7EF] bg-[#F5FAFD] p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2">
                      <CircleDollarSign className="h-5 w-5 text-[#12395F]" />

                      <div>
                        <p className="font-black">
                          Preis- und Umsatzsteuerprüfung
                        </p>

                        <p className="mt-1 text-xs font-semibold text-[#52616F]">
                          Quelle: {item.price_source || "Nicht angegeben"}
                        </p>
                      </div>
                    </div>

                    <span
                      className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${getPriceStatusClasses(
                        item.price_confirmation_status,
                      )}`}
                    >
                      {getPriceStatusLabel(
                        item.price_confirmation_status,
                      )}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <PriceCard
                      label="Vorgeschlagen"
                      price={item.proposed_price_gross}
                      taxRate={item.proposed_tax_rate}
                      detail="Wert bei Anfrageerstellung"
                    />

                    <PriceCard
                      label={
                        priceChanged
                          ? "Vom Partner geändert"
                          : "Vom Partner bestätigt"
                      }
                      price={effectivePrice}
                      taxRate={effectiveTaxRate}
                      detail={
                        item.price_confirmed_at
                          ? formatDate(item.price_confirmed_at)
                          : "Noch nicht geprüft"
                      }
                      highlighted={
                        item.price_confirmation_status === "confirmed" ||
                        item.price_confirmation_status === "changed"
                      }
                    />

                    <div className="rounded-2xl border border-[#D6E7EF] bg-white p-4">
                      <p className="text-xs font-black uppercase text-[#12395F]">
                        Produktübernahme
                      </p>

                      {item.linked_product_id ? (
                        <>
                          <p className="mt-2 flex items-center gap-2 font-black text-[#102A43]">
                            {item.price_applied_to_product_at ? (
                              <CheckCircle2 className="h-4 w-4 text-[#2F7D50]" />
                            ) : (
                              <Clock3 className="h-4 w-4 text-[#8A4A1F]" />
                            )}

                            {item.price_applied_to_product_at
                              ? "Im Produkt aktualisiert"
                              : "Produkt verknüpft"}
                          </p>

                          <p className="mt-2 text-xs font-semibold leading-5 text-[#52616F]">
                            {item.price_applied_to_product_at
                              ? `Übernommen am ${formatDate(
                                  item.price_applied_to_product_at,
                                )}`
                              : "Die Übernahme erfolgt nach bestätigter Preisprüfung."}
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="mt-2 font-black text-[#52616F]">
                            Kein Produkt verknüpft
                          </p>

                          <p className="mt-2 text-xs font-semibold leading-5 text-[#52616F]">
                            Die Händlerbestätigung bleibt nur an dieser Anfrage
                            gespeichert.
                          </p>
                        </>
                      )}
                    </div>
                  </div>

                  {priceChanged ? (
                    <div className="mt-4 rounded-2xl border border-[#F1D1A8] bg-[#FFF8EE] p-3 text-sm font-semibold text-[#8A4A1F]">
                      Der Partner hat den vorgeschlagenen Preis oder
                      Umsatzsteuersatz geändert. Der bestätigte Wert gilt für
                      zukünftige Verkäufe.
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </section>

        <section className="rounded-[30px] border border-[#E8DED2] bg-white p-5 shadow-sm">
          <h2 className="text-xl font-black">
            Verlauf
          </h2>

          {(events || []).length > 0 ? (
            <div className="mt-4 grid gap-3">
              {(events || []).map((event) => (
                <div
                  key={event.id}
                  className="rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-black">
                      {event.title}
                    </p>

                    <p className="text-xs font-bold text-[#52616F]">
                      {formatDate(event.created_at)}
                    </p>
                  </div>

                  {event.description ? (
                    <p className="mt-1 text-sm font-semibold text-[#52616F]">
                      {event.description}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm font-semibold text-[#52616F]">
              Noch keine Ereignisse vorhanden.
            </p>
          )}
        </section>
      </section>
    </main>
  );
}

function SummaryCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-[#D6E7EF] bg-[#F5FAFD] p-3">
      <p className="text-xs font-black uppercase text-[#12395F]">
        {label}
      </p>

      <p className="mt-1 text-xl font-black">
        {value}
      </p>

      <p className="mt-1 text-xs font-semibold text-[#52616F]">
        {detail}
      </p>
    </div>
  );
}

function PriceCard({
  label,
  price,
  taxRate,
  detail,
  highlighted = false,
}: {
  label: string;
  price: number | null;
  taxRate: number | null;
  detail: string;
  highlighted?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        highlighted
          ? "border-[#BFE3CD] bg-[#F0FFF6]"
          : "border-[#D6E7EF] bg-white"
      }`}
    >
      <p
        className={`text-xs font-black uppercase ${
          highlighted
            ? "text-[#2F7D50]"
            : "text-[#12395F]"
        }`}
      >
        {label}
      </p>

      <p className="mt-2 text-xl font-black">
        {formatPrice(price)}
      </p>

      <p className="mt-1 text-sm font-semibold text-[#52616F]">
        {taxRate === 7 || taxRate === 19
          ? `${taxRate} % USt.`
          : "USt. nicht angegeben"}
      </p>

      <p className="mt-2 text-xs font-semibold text-[#52616F]">
        {detail}
      </p>
    </div>
  );
}