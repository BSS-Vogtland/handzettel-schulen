import Link from "next/link";
import { ArrowLeft, BookOpen, Mail, Plus } from "lucide-react";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

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

export default async function AdminBookSupplierInquiriesPage() {
  const { data: inquiries, error } = await supabaseServer
    .from("book_supplier_inquiries")
    .select("*")
    .order("created_at", {
      ascending: false,
    })
    .limit(250);

  if (error) {
    throw new Error(
      `Buchhandlungsanfragen konnten nicht geladen werden: ${error.message}`,
    );
  }

  const inquiryIds = (inquiries || []).map((inquiry) => inquiry.id);

  const { data: items } = inquiryIds.length
    ? await supabaseServer
        .from("book_supplier_inquiry_items")
        .select("id,inquiry_id,availability_status,requested_quantity")
        .in("inquiry_id", inquiryIds)
    : {
        data: [],
      };

  const itemsByInquiry = new Map<
    string,
    Array<{
      id: string;
      availability_status: string;
      requested_quantity: number;
    }>
  >();

  for (const item of items || []) {
    const current = itemsByInquiry.get(item.inquiry_id) || [];
    current.push(item);
    itemsByInquiry.set(item.inquiry_id, current);
  }

  return (
    <main className="min-h-screen bg-[#FBF7F0] text-[#102A43]">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/admin/produkte/isbn"
            className="inline-flex items-center gap-2 text-sm font-black text-[#12395F]"
          >
            <ArrowLeft className="h-4 w-4" />
            Zurück zum ISBN-Bereich
          </Link>

          <Link
            href="/admin/produkte/isbn"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#B5282D] px-4 py-3 text-sm font-black text-white"
          >
            <Plus className="h-4 w-4" />
            Neue Sammelanfrage
          </Link>
        </div>

        <header className="rounded-[34px] border border-[#E8DED2] bg-white p-6 shadow-sm">
          <div className="inline-flex items-center gap-2 rounded-full bg-[#FBF7F0] px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
            <Mail className="h-3.5 w-3.5" />
            Vogtländische Buchhandlung
          </div>

          <h1 className="mt-3 text-3xl font-black">Buchhandlungsanfragen</h1>

          <p className="mt-2 max-w-3xl font-semibold leading-6 text-[#52616F]">
            Hier siehst Du alle Sammelanfragen, Versandstände und Rückmeldungen
            der Buchhandlung.
          </p>
        </header>

        {(inquiries || []).length > 0 ? (
          <div className="grid gap-4">
            {(inquiries || []).map((inquiry) => {
              const inquiryItems = itemsByInquiry.get(inquiry.id) || [];
              const answered = inquiryItems.filter(
                (item) => item.availability_status !== "pending",
              ).length;
              const totalQuantity = inquiryItems.reduce(
                (sum, item) => sum + Number(item.requested_quantity || 0),
                0,
              );

              return (
                <Link
                  key={inquiry.id}
                  href={`/admin/buchhandlung/anfragen/${inquiry.id}`}
                  className="grid gap-4 rounded-[28px] border border-[#E8DED2] bg-white p-5 shadow-sm transition hover:border-[#A75B28] md:grid-cols-[1fr_auto]"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-black">
                        {inquiry.inquiry_number}
                      </h2>

                      <span className="rounded-full bg-[#EEF4FA] px-3 py-1 text-xs font-black text-[#12395F]">
                        {getStatusLabel(inquiry.status)}
                      </span>
                    </div>

                    <p className="mt-2 text-sm font-semibold text-[#52616F]">
                      Erstellt: {formatDate(inquiry.created_at)}
                      {inquiry.sent_at
                        ? ` · Gesendet: ${formatDate(inquiry.sent_at)}`
                        : ""}
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="rounded-2xl bg-[#FBF7F0] px-4 py-3">
                      <p className="text-xs font-black uppercase text-[#A75B28]">
                        ISBNs
                      </p>
                      <p className="mt-1 text-xl font-black">
                        {inquiryItems.length}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-[#FBF7F0] px-4 py-3">
                      <p className="text-xs font-black uppercase text-[#A75B28]">
                        Menge
                      </p>
                      <p className="mt-1 text-xl font-black">{totalQuantity}</p>
                    </div>

                    <div className="rounded-2xl bg-[#F0FFF6] px-4 py-3 text-[#2F7D50]">
                      <p className="text-xs font-black uppercase">Antwort</p>
                      <p className="mt-1 text-xl font-black">
                        {answered}/{inquiryItems.length}
                      </p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="rounded-[30px] border border-dashed border-[#C8D8E8] bg-white p-10 text-center">
            <BookOpen className="mx-auto h-8 w-8 text-[#12395F]" />
            <p className="mt-3 text-lg font-black">
              Noch keine Buchhandlungsanfrage
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
