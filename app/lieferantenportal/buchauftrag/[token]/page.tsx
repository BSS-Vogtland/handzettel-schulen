import { notFound } from "next/navigation";
import {
  BookOpen,
  PackageCheck,
  ShieldCheck,
} from "lucide-react";
import { supabaseServer } from "@/lib/supabase/server";
import BookSupplierOrderResponseForm from "@/components/BookSupplierOrderResponseForm";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    token: string;
  }>;
};

function formatDate(value: string | null) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function getFulfillmentLabel(method: string) {
  return method === "delivery"
    ? "Lieferung an Handzettel-Schulen.de"
    : "Abholung bei der Buchhandlung";
}

export default async function BookSupplierOrderPortalPage({
  params,
}: Params) {
  const { token } = await params;

  const { data: order, error: orderError } =
    await supabaseServer
      .from("book_supplier_orders")
      .select("*")
      .eq("response_token", token)
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
    { data: partner, error: partnerError },
    { data: inquiry, error: inquiryError },
    { data: items, error: itemsError },
  ] = await Promise.all([
    supabaseServer
      .from("book_supplier_partners")
      .select("*")
      .eq("id", order.supplier_id)
      .maybeSingle(),
    supabaseServer
      .from("book_supplier_inquiries")
      .select("*")
      .eq("id", order.source_inquiry_id)
      .maybeSingle(),
    supabaseServer
      .from("book_supplier_order_items")
      .select("*")
      .eq("order_id", order.id)
      .order("sort_order", {
        ascending: true,
      }),
  ]);

  if (partnerError || !partner) {
    throw new Error(
      `Buchhandlung konnte nicht geladen werden: ${
        partnerError?.message || "Partner fehlt"
      }`,
    );
  }

  if (inquiryError || !inquiry) {
    throw new Error(
      `Verfügbarkeitsanfrage konnte nicht geladen werden: ${
        inquiryError?.message || "Anfrage fehlt"
      }`,
    );
  }

  if (itemsError) {
    throw new Error(
      `Auftragspositionen konnten nicht geladen werden: ${itemsError.message}`,
    );
  }

  return (
    <main className="min-h-screen bg-[#FBF7F0] text-[#102A43]">
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
        <header className="rounded-[34px] border border-[#E8DED2] bg-white p-6 shadow-sm sm:p-8">
          <div className="inline-flex items-center gap-2 rounded-full bg-[#F0FFF6] px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-[#2F7D50]">
            <ShieldCheck className="h-3.5 w-3.5" />
            Sicherer Auftragsbereich
          </div>

          <h1 className="mt-4 text-3xl font-black sm:text-4xl">
            Verbindlicher Buchauftrag {order.order_number}
          </h1>

          <p className="mt-3 max-w-3xl font-semibold leading-7 text-[#52616F]">
            Bitte bestätigen Sie für jede Position, welche
            Menge angenommen werden kann. Später kann der Status
            auf „Zur Abholung bereit“ aktualisiert werden.
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-4">
            <div className="rounded-2xl bg-[#FBF7F0] p-4">
              <p className="text-xs font-black uppercase text-[#A75B28]">
                Partner
              </p>
              <p className="mt-1 font-black">{partner.name}</p>
            </div>

            <div className="rounded-2xl bg-[#FBF7F0] p-4">
              <p className="text-xs font-black uppercase text-[#A75B28]">
                Auftrag vom
              </p>
              <p className="mt-1 font-black">
                {formatDate(order.created_at)}
              </p>
            </div>

            <div className="rounded-2xl bg-[#FBF7F0] p-4">
              <p className="text-xs font-black uppercase text-[#A75B28]">
                Anfrage
              </p>
              <p className="mt-1 font-black">
                {inquiry.inquiry_number}
              </p>
            </div>

            <div className="rounded-2xl bg-[#FBF7F0] p-4">
              <p className="text-xs font-black uppercase text-[#A75B28]">
                Abwicklung
              </p>
              <p className="mt-1 font-black">
                {getFulfillmentLabel(order.fulfillment_method)}
              </p>
            </div>
          </div>

          {order.customer_reference ? (
            <div className="mt-4 rounded-2xl border border-[#C8D8E8] bg-[#EEF4FA] p-4">
              <p className="text-xs font-black uppercase text-[#12395F]">
                Interne Referenz
              </p>
              <p className="mt-2 font-black">
                {order.customer_reference}
              </p>
            </div>
          ) : null}

          {order.admin_note ? (
            <div className="mt-4 rounded-2xl border border-[#F1D1A8] bg-[#FFF8EE] p-4">
              <p className="text-xs font-black uppercase text-[#A75B28]">
                Hinweis von Handzettel-Schulen.de
              </p>
              <p className="mt-2 whitespace-pre-wrap font-semibold leading-6">
                {order.admin_note}
              </p>
            </div>
          ) : null}

          <div className="mt-5 flex items-start gap-3 rounded-2xl border border-[#BFE3CD] bg-[#F0FFF6] p-4 text-[#2F7D50]">
            <PackageCheck className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="font-bold leading-6">
              Dieser Auftrag wurde von Handzettel-Schulen.de
              manuell nach Prüfung des Zahlungseingangs
              verbindlich ausgelöst.
            </p>
          </div>
        </header>

        {(items || []).length > 0 ? (
          <BookSupplierOrderResponseForm
            token={token}
            orderNumber={order.order_number}
            initialSupplierNote={order.supplier_note}
            initialItems={items}
          />
        ) : (
          <div className="rounded-[30px] border border-dashed border-[#C8D8E8] bg-white p-10 text-center">
            <BookOpen className="mx-auto h-8 w-8 text-[#12395F]" />
            <p className="mt-3 font-black">
              Dieser Auftrag enthält keine Buchpositionen.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
