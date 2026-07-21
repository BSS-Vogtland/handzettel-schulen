import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CreditCard,
  PackageCheck,
} from "lucide-react";
import { supabaseServer } from "@/lib/supabase/server";
import AdminBookSupplierOrderComposer from "@/components/AdminBookSupplierOrderComposer";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export default async function AdminBookSupplierNewOrderPage({
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
      `Verfügbarkeitsanfrage konnte nicht geladen werden: ${inquiryError.message}`,
    );
  }

  if (!inquiry) {
    notFound();
  }

  const [
    { data: partner, error: partnerError },
    { data: items, error: itemsError },
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

  return (
    <main className="min-h-screen bg-[#FBF7F0] text-[#102A43]">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <Link
          href={`/admin/buchhandlung/anfragen/${inquiry.id}`}
          className="inline-flex items-center gap-2 text-sm font-black text-[#12395F]"
        >
          <ArrowLeft className="h-4 w-4" />
          Zurück zur Verfügbarkeitsanfrage
        </Link>

        <header className="rounded-[34px] border border-[#E8DED2] bg-white p-6 shadow-sm">
          <div className="inline-flex items-center gap-2 rounded-full bg-[#FFF8EE] px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
            <PackageCheck className="h-3.5 w-3.5" />
            Manueller verbindlicher Auftrag
          </div>

          <h1 className="mt-3 text-3xl font-black">
            Buchauftrag aus {inquiry.inquiry_number}
          </h1>

          <p className="mt-3 max-w-3xl font-semibold leading-7 text-[#52616F]">
            Wähle die benötigten Titel und Mengen aus. Erst
            nach Deiner ausdrücklichen Bestätigung der
            Zahlungsprüfung wird der Auftrag verbindlich an
            die Vogtländische Buchhandlung versendet.
          </p>

          <div className="mt-5 flex items-start gap-3 rounded-2xl border border-[#F1D1A8] bg-[#FFF8EE] p-4">
            <CreditCard className="mt-0.5 h-5 w-5 shrink-0 text-[#A75B28]" />
            <p className="font-bold leading-6 text-[#A75B28]">
              Es erfolgt keine automatische Zahlungsprüfung.
              Die Verantwortung für die Kontrolle und den
              Versand bleibt vollständig bei Dir.
            </p>
          </div>
        </header>

        {(items || []).length > 0 ? (
          <AdminBookSupplierOrderComposer
            inquiryId={inquiry.id}
            inquiryNumber={inquiry.inquiry_number}
            partnerEmail={partner.email}
            initialItems={items}
          />
        ) : (
          <div className="rounded-[30px] border border-dashed border-[#C8D8E8] bg-white p-10 text-center font-black">
            Diese Verfügbarkeitsanfrage enthält keine
            Buchpositionen.
          </div>
        )}
      </section>
    </main>
  );
}
