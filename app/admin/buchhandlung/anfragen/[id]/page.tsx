import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  Mail,
  PackageCheck,
} from "lucide-react";
import { supabaseServer } from "@/lib/supabase/server";
import AdminBookSupplierInquiryActions from "@/components/AdminBookSupplierInquiryActions";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

function formatDate(value: string | null) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
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

function getSiteUrl() {
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "";

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

  const { data: inquiry, error: inquiryError } = await supabaseServer
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

  const supplierPortalUrl = `${getSiteUrl()}/lieferantenportal/buchanfrage/${inquiry.response_token}`;

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

        <header className="grid gap-5 rounded-[34px] border border-[#E8DED2] bg-white p-6 shadow-sm lg:grid-cols-[1fr_320px]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-[#FBF7F0] px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
              <Mail className="h-3.5 w-3.5" />
              {partner.name}
            </div>

            <h1 className="mt-3 text-3xl font-black">
              {inquiry.inquiry_number}
            </h1>

            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full bg-[#EEF4FA] px-3 py-1 text-xs font-black text-[#12395F]">
                {getStatusLabel(inquiry.status)}
              </span>

              <span className="rounded-full bg-[#FBF7F0] px-3 py-1 text-xs font-black text-[#52616F]">
                Erstellt {formatDate(inquiry.created_at)}
              </span>

              {inquiry.sent_at ? (
                <span className="rounded-full bg-[#F0FFF6] px-3 py-1 text-xs font-black text-[#2F7D50]">
                  Gesendet {formatDate(inquiry.sent_at)}
                </span>
              ) : null}
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
            <p className="font-black">Versand an</p>
            <p className="mt-1 text-sm font-semibold text-[#52616F]">
              {partner.email || "Noch keine E-Mail hinterlegt"}
            </p>

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

            <p className="text-sm font-black text-[#102A43]">
              Nach manueller Zahlungsprüfung
            </p>
            <p className="mt-1 text-xs font-semibold leading-5 text-[#52616F]">
              Bücher und Mengen werden im nächsten Schritt
              bewusst ausgewählt und verbindlich gesendet.
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
              <h2 className="text-xl font-black text-[#102A43]">
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
                    {order.status === "draft"
                      ? "Entwurf"
                      : order.status === "sent"
                        ? "Gesendet"
                        : order.status === "accepted"
                          ? "Angenommen"
                          : order.status === "partially_accepted"
                            ? "Teilweise angenommen"
                            : order.status === "unavailable"
                              ? "Nicht lieferbar"
                              : order.status === "ready"
                                ? "Zur Abholung bereit"
                                : order.status}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <section className="grid gap-4">
          {(items || []).map((item, index) => (
            <article
              key={item.id}
              className="grid gap-5 rounded-[30px] border border-[#E8DED2] bg-white p-5 shadow-sm md:grid-cols-[90px_1fr_auto]"
            >
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

              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[#A75B28]">
                  Position {index + 1}
                </p>
                <h2 className="mt-1 text-xl font-black">{item.title}</h2>

                {item.subtitle ? (
                  <p className="mt-1 font-semibold text-[#52616F]">
                    {item.subtitle}
                  </p>
                ) : null}

                <p className="mt-2 text-sm font-bold text-[#52616F]">
                  ISBN {item.isbn} · Angefragt: {item.requested_quantity}
                </p>

                {item.supplier_note ? (
                  <p className="mt-3 rounded-2xl bg-[#FBF7F0] p-3 text-sm font-semibold leading-6">
                    {item.supplier_note}
                  </p>
                ) : null}
              </div>

              <div className="min-w-52 rounded-2xl border border-[#C8D8E8] bg-[#F5FAFD] p-4">
                <p className="text-xs font-black uppercase text-[#12395F]">
                  Verfügbarkeit
                </p>
                <p className="mt-1 font-black">
                  {getAvailabilityLabel(item.availability_status)}
                </p>

                <div className="mt-3 grid gap-1 text-sm font-semibold text-[#52616F]">
                  {item.available_quantity !== null ? (
                    <p>Menge: {item.available_quantity}</p>
                  ) : null}

                  {item.lead_time_days !== null ? (
                    <p>Lieferzeit: {item.lead_time_days} Tage</p>
                  ) : null}

                  {item.available_from ? (
                    <p>Verfügbar ab: {item.available_from}</p>
                  ) : null}

                  {item.reservation_until ? (
                    <p>Reserviert bis: {item.reservation_until}</p>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </section>

        <section className="rounded-[30px] border border-[#E8DED2] bg-white p-5 shadow-sm">
          <h2 className="text-xl font-black">Verlauf</h2>

          <div className="mt-4 grid gap-3">
            {(events || []).map((event) => (
              <div
                key={event.id}
                className="rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-black">{event.title}</p>
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
        </section>
      </section>
    </main>
  );
}
