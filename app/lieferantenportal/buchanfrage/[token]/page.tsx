import { notFound } from "next/navigation";
import { BookOpen, ShieldCheck } from "lucide-react";
import { supabaseServer } from "@/lib/supabase/server";
import BookSupplierResponseForm from "@/components/BookSupplierResponseForm";

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

export default async function BookSupplierPortalPage({ params }: Params) {
  const { token } = await params;

  const { data: inquiry, error: inquiryError } = await supabaseServer
    .from("book_supplier_inquiries")
    .select("*")
    .eq("response_token", token)
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
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
        <header className="rounded-[34px] border border-[#E8DED2] bg-white p-6 shadow-sm sm:p-8">
          <div className="inline-flex items-center gap-2 rounded-full bg-[#F0FFF6] px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-[#2F7D50]">
            <ShieldCheck className="h-3.5 w-3.5" />
            Sicherer Antwortbereich
          </div>

          <h1 className="mt-4 text-3xl font-black sm:text-4xl">
            Verfügbarkeitsanfrage {inquiry.inquiry_number}
          </h1>

          <p className="mt-3 max-w-3xl font-semibold leading-7 text-[#52616F]">
            Bitte tragen Sie für jede ISBN ein, ob der Titel im Laden verfügbar
            oder bestellbar ist. Die Rückmeldung kann zwischengespeichert und
            später ergänzt werden.
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-[#FBF7F0] p-4">
              <p className="text-xs font-black uppercase text-[#A75B28]">
                Partner
              </p>
              <p className="mt-1 font-black">{partner.name}</p>
            </div>

            <div className="rounded-2xl bg-[#FBF7F0] p-4">
              <p className="text-xs font-black uppercase text-[#A75B28]">
                Anfrage vom
              </p>
              <p className="mt-1 font-black">
                {formatDate(inquiry.created_at)}
              </p>
            </div>

            <div className="rounded-2xl bg-[#FBF7F0] p-4">
              <p className="text-xs font-black uppercase text-[#A75B28]">
                Positionen
              </p>
              <p className="mt-1 font-black">{(items || []).length}</p>
            </div>
          </div>

          {inquiry.admin_note ? (
            <div className="mt-5 rounded-2xl border border-[#F1D1A8] bg-[#FFF8EE] p-4">
              <p className="text-xs font-black uppercase text-[#A75B28]">
                Hinweis von Handzettel-Schulen.de
              </p>
              <p className="mt-2 whitespace-pre-wrap font-semibold leading-6">
                {inquiry.admin_note}
              </p>
            </div>
          ) : null}
        </header>

        {(items || []).length > 0 ? (
          <BookSupplierResponseForm
            token={token}
            inquiryNumber={inquiry.inquiry_number}
            initialSupplierNote={inquiry.supplier_note}
            initialItems={items}
          />
        ) : (
          <div className="rounded-[30px] border border-dashed border-[#C8D8E8] bg-white p-10 text-center">
            <BookOpen className="mx-auto h-8 w-8 text-[#12395F]" />
            <p className="mt-3 font-black">
              Diese Anfrage enthält keine Buchpositionen.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
