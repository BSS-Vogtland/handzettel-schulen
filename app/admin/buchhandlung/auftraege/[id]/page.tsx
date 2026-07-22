import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  CreditCard,
  Mail,
} from "lucide-react";
import { supabaseServer } from "@/lib/supabase/server";
import AdminBookSupplierOrderActions from "@/components/AdminBookSupplierOrderActions";

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
    case "accepted":
      return "Angenommen";
    case "partially_accepted":
      return "Teilweise angenommen";
    case "unavailable":
      return "Nicht lieferbar";
    case "ready":
      return "Zur Abholung bereit";
    case "completed":
      return "Abgeschlossen";
    case "cancelled":
      return "Abgebrochen";
    default:
      return status;
  }
}

function getItemStatusLabel(status: string) {
  switch (status) {
    case "accepted":
      return "Angenommen";
    case "partially_accepted":
      return "Teilweise angenommen";
    case "unavailable":
      return "Nicht lieferbar";
    case "ready":
      return "Zur Abholung bereit";
    default:
      return "Noch offen";
  }
}

function getFulfillmentLabel(method: string) {
  return method === "delivery"
    ? "Lieferung an Handzettel-Schulen.de"
    : "Abholung bei der Buchhandlung";
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

export default async function AdminBookSupplierOrderDetailPage({
  params,
}: Params) {
  const { id } = await params;

  const { data: order, error: orderError } =
    await supabaseServer
      .from("book_supplier_orders")
      .select("*")
      .eq("id", id)
      .maybeSingle();

  if (orderError) {
    throw new Error(
      `Buchauftrag konnte nicht geladen werden: ${orderError.message}`,
    );
  }

  if (!order) {
    notFound();
  }

  const [
    { data: inquiry, error: inquiryError },
    { data: partner, error: partnerError },
    { data: items, error: itemsError },
    { data: events, error: eventsError },
  ] = await Promise.all([
    supabaseServer
      .from("book_supplier_inquiries")
      .select("*")
      .eq("id", order.source_inquiry_id)
      .maybeSingle(),
    supabaseServer
      .from("book_supplier_partners")
      .select("*")
      .eq("id", order.supplier_id)
      .maybeSingle(),
    supabaseServer
      .from("book_supplier_order_items")
      .select("*")
      .eq("order_id", order.id)
      .order("sort_order", {
        ascending: true,
      }),
    supabaseServer
      .from("book_supplier_order_events")
      .select("*")
      .eq("order_id", order.id)
      .order("created_at", {
        ascending: false,
      }),
  ]);

  if (inquiryError || !inquiry) {
    throw new Error(
      `Verfügbarkeitsanfrage konnte nicht geladen werden: ${
        inquiryError?.message || "Anfrage fehlt"
      }`,
    );
  }

  if (partnerError || !partner) {
    throw new Error(
      `Buchhandlung konnte nicht geladen werden: ${
        partnerError?.message || "Partner fehlt"
      }`,
    );
  }

  if (itemsError) {
    throw new Error(
      `Auftragspositionen konnten nicht geladen werden: ${itemsError.message}`,
    );
  }

  if (eventsError) {
    throw new Error(
      `Auftragsverlauf konnte nicht geladen werden: ${eventsError.message}`,
    );
  }

  const supplierPortalUrl = `${getSiteUrl()}/lieferantenportal/buchauftrag/${order.response_token}`;

  return (
    <main className="min-h-screen bg-[#FBF7F0] text-[#102A43]">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <Link
          href={`/admin/buchhandlung/anfragen/${inquiry.id}`}
          className="inline-flex items-center gap-2 text-sm font-black text-[#12395F]"
        >
          <ArrowLeft className="h-4 w-4" />
          Zurück zur Verfügbarkeitsanfrage
        </Link>

        <header className="grid gap-5 rounded-[34px] border border-[#E8DED2] bg-white p-6 shadow-sm lg:grid-cols-[1fr_330px]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-[#FBF7F0] px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
              <Mail className="h-3.5 w-3.5" />
              {partner.name}
            </div>

            <h1 className="mt-3 text-3xl font-black">
              {order.order_number}
            </h1>

            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full bg-[#EEF4FA] px-3 py-1 text-xs font-black text-[#12395F]">
                {getStatusLabel(order.status)}
              </span>

              <span className="rounded-full bg-[#FBF7F0] px-3 py-1 text-xs font-black text-[#52616F]">
                Erstellt {formatDate(order.created_at)}
              </span>

              <Link
                href={`/admin/buchhandlung/anfragen/${inquiry.id}`}
                className="rounded-full bg-[#FBF7F0] px-3 py-1 text-xs font-black text-[#A75B28]"
              >
                Anfrage {inquiry.inquiry_number}
              </Link>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-[#BFE3CD] bg-[#F0FFF6] p-4">
                <div className="flex items-center gap-2 text-[#2F7D50]">
                  <CheckCircle2 className="h-4 w-4" />
                  <p className="text-xs font-black uppercase">
                    Zahlungsprüfung
                  </p>
                </div>
                <p className="mt-2 font-black text-[#2F7D50]">
                  {order.payment_confirmed_by_admin
                    ? "Manuell bestätigt"
                    : "Nicht bestätigt"}
                </p>
              </div>

              <div className="rounded-2xl bg-[#FBF7F0] p-4">
                <p className="text-xs font-black uppercase text-[#A75B28]">
                  Abwicklung
                </p>
                <p className="mt-2 font-black">
                  {getFulfillmentLabel(
                    order.fulfillment_method,
                  )}
                </p>
              </div>

              <div className="rounded-2xl bg-[#FBF7F0] p-4">
                <p className="text-xs font-black uppercase text-[#A75B28]">
                  Referenz
                </p>
                <p className="mt-2 font-black">
                  {order.customer_reference || "—"}
                </p>
              </div>
            </div>

            {order.admin_note ? (
              <div className="mt-5 rounded-2xl border border-[#F1D1A8] bg-[#FFF8EE] p-4">
                <p className="text-xs font-black uppercase text-[#A75B28]">
                  Hinweis an die Buchhandlung
                </p>
                <p className="mt-2 whitespace-pre-wrap font-semibold leading-6">
                  {order.admin_note}
                </p>
              </div>
            ) : null}

            {order.supplier_note ? (
              <div className="mt-4 rounded-2xl border border-[#BFE3CD] bg-[#F0FFF6] p-4">
                <p className="text-xs font-black uppercase text-[#2F7D50]">
                  Rückmeldung der Buchhandlung
                </p>
                <p className="mt-2 whitespace-pre-wrap font-semibold leading-6">
                  {order.supplier_note}
                </p>
              </div>
            ) : null}
          </div>

          <aside className="rounded-[26px] border border-[#C8D8E8] bg-[#EEF4FA] p-4">
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-[#12395F]" />
              <p className="font-black">Verbindlicher Auftrag</p>
            </div>

            <p className="mt-2 text-sm font-semibold leading-6 text-[#52616F]">
              Versand an{" "}
              {partner.email || "keine E-Mail hinterlegt"}
            </p>

            <div className="mt-4">
              <AdminBookSupplierOrderActions
                orderId={order.id}
                orderNumber={order.order_number}
                supplierPortalUrl={supplierPortalUrl}
                canSend={Boolean(partner.email)}
                wasSent={Boolean(order.sent_at)}
                paymentConfirmed={Boolean(
                  order.payment_confirmed_by_admin,
                )}
              />
            </div>
          </aside>
        </header>

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
                <h2 className="mt-1 text-xl font-black">
                  {item.title}
                </h2>
                <p className="mt-2 text-sm font-bold text-[#52616F]">
                  ISBN {item.isbn} · Bestellt: {item.quantity}
                </p>

                {item.supplier_note ? (
                  <p className="mt-3 rounded-2xl bg-[#FBF7F0] p-3 text-sm font-semibold leading-6">
                    {item.supplier_note}
                  </p>
                ) : null}
              </div>

              <div className="min-w-52 rounded-2xl border border-[#C8D8E8] bg-[#F5FAFD] p-4">
                <p className="text-xs font-black uppercase text-[#12395F]">
                  Rückmeldung
                </p>
                <p className="mt-1 font-black">
                  {getItemStatusLabel(item.supplier_status)}
                </p>

                {item.accepted_quantity !== null ? (
                  <p className="mt-2 text-sm font-semibold text-[#52616F]">
                    Bestätigte Menge: {item.accepted_quantity}
                  </p>
                ) : null}
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
