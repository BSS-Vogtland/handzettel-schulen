import { supabaseServer } from "@/lib/supabase/server";
import {
  ArrowLeft,
  BookOpen,
  Building2,
  Mail,
  Plus,
  UsersRound,
} from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

type InquiryItemRow = {
  id: string;
  inquiry_id: string;
  availability_status: string;
  price_confirmation_status: string;
  requested_quantity: number;
};

type PartnerRow = {
  id: string;
  name: string;
  email: string | null;
  is_active: boolean;
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

export default async function AdminBookSupplierInquiriesPage() {
  const { data: inquiries, error: inquiriesError } =
    await supabaseServer
      .from("book_supplier_inquiries")
      .select("*")
      .order("created_at", {
        ascending: false,
      })
      .limit(250);

  if (inquiriesError) {
    throw new Error(
      `Buchhandlungsanfragen konnten nicht geladen werden: ${inquiriesError.message}`,
    );
  }

  const inquiryRows = inquiries || [];

  const inquiryIds = inquiryRows.map(
    (inquiry) => inquiry.id,
  );

  const partnerIds = Array.from(
    new Set(
      inquiryRows
        .map((inquiry) =>
          String(inquiry.supplier_id || ""),
        )
        .filter(Boolean),
    ),
  );

  let items: InquiryItemRow[] = [];

  if (inquiryIds.length > 0) {
    const { data, error } = await supabaseServer
      .from("book_supplier_inquiry_items")
      .select(
        "id,inquiry_id,availability_status,price_confirmation_status,requested_quantity",
      )
      .in("inquiry_id", inquiryIds);

    if (error) {
      throw new Error(
        `Buchpositionen konnten nicht geladen werden: ${error.message}`,
      );
    }

    items = (data || []) as InquiryItemRow[];
  }

  let partners: PartnerRow[] = [];

  if (partnerIds.length > 0) {
    const { data, error } = await supabaseServer
      .from("book_supplier_partners")
      .select("id,name,email,is_active")
      .in("id", partnerIds);

    if (error) {
      throw new Error(
        `Buchhandelspartner konnten nicht geladen werden: ${error.message}`,
      );
    }

    partners = (data || []) as PartnerRow[];
  }

  const partnerById = new Map(
    partners.map((partner) => [
      partner.id,
      partner,
    ]),
  );

  const itemsByInquiry = new Map<
    string,
    InquiryItemRow[]
  >();

  for (const item of items) {
    const current =
      itemsByInquiry.get(item.inquiry_id) || [];

    current.push(item);

    itemsByInquiry.set(
      item.inquiry_id,
      current,
    );
  }

  return (
    <main className="min-h-screen bg-[#FBF7F0] text-[#102A43]">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/admin/buchhandlung"
            className="inline-flex items-center gap-2 text-sm font-black text-[#12395F]"
          >
            <ArrowLeft className="h-4 w-4" />
            Zurück zum Buchhandlungsbereich
          </Link>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/buchhandlung/partner"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-black text-[#12395F] shadow-sm ring-1 ring-[#C8D8E8] transition hover:bg-[#F5FAFD]"
            >
              <UsersRound className="h-4 w-4" />
              Partner verwalten
            </Link>

            <Link
              href="/admin/produkte/isbn"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#B5282D] px-4 py-3 text-sm font-black text-white transition hover:brightness-110"
            >
              <Plus className="h-4 w-4" />
              Neue Sammelanfrage
            </Link>
          </div>
        </div>

        <header className="rounded-[34px] border border-[#E8DED2] bg-white p-6 shadow-sm">
          <div className="inline-flex items-center gap-2 rounded-full bg-[#FBF7F0] px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
            <Mail className="h-3.5 w-3.5" />
            Alle Buchhandelspartner
          </div>

          <h1 className="mt-3 text-3xl font-black">
            Buchhandlungsanfragen
          </h1>

          <p className="mt-2 max-w-3xl font-semibold leading-6 text-[#52616F]">
            Jede Anfrage ist eindeutig einer
            Buchhandlung zugeordnet. Eine Position
            gilt erst als vollständig beantwortet,
            wenn Verfügbarkeit, Preis und
            Umsatzsteuer geprüft wurden.
          </p>
        </header>

        {inquiryRows.length > 0 ? (
          <div className="grid gap-4">
            {inquiryRows.map((inquiry) => {
              const inquiryItems =
                itemsByInquiry.get(inquiry.id) || [];

              const partner = partnerById.get(
                String(inquiry.supplier_id),
              );

              const availabilityAnswered =
                inquiryItems.filter(
                  (item) =>
                    item.availability_status !==
                    "pending",
                ).length;

              const priceAnswered =
                inquiryItems.filter(
                  (item) =>
                    item.price_confirmation_status !==
                    "pending",
                ).length;

              const fullyAnswered =
                inquiryItems.filter(
                  (item) =>
                    item.availability_status !==
                      "pending" &&
                    item.price_confirmation_status !==
                      "pending",
                ).length;

              const totalQuantity =
                inquiryItems.reduce(
                  (sum, item) =>
                    sum +
                    Number(
                      item.requested_quantity || 0,
                    ),
                  0,
                );

              return (
                <Link
                  key={inquiry.id}
                  href={`/admin/buchhandlung/anfragen/${inquiry.id}`}
                  className="grid gap-5 rounded-[28px] border border-[#E8DED2] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#A75B28] lg:grid-cols-[minmax(0,1fr)_auto]"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-black">
                        {inquiry.inquiry_number}
                      </h2>

                      <span
                        className={`rounded-full px-3 py-1 text-xs font-black ${getStatusClasses(
                          inquiry.status,
                        )}`}
                      >
                        {getStatusLabel(
                          inquiry.status,
                        )}
                      </span>
                    </div>

                    <div className="mt-3 flex items-start gap-3 rounded-2xl border border-[#D6E7EF] bg-[#F5FAFD] px-4 py-3">
                      <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-[#12395F]" />

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-black text-[#102A43]">
                            {partner?.name ||
                              "Buchhandelspartner nicht gefunden"}
                          </p>

                          {partner ? (
                            <span
                              className={`rounded-full px-2.5 py-1 text-[11px] font-black ${
                                partner.is_active
                                  ? "bg-[#E7F8EE] text-[#2F7D50]"
                                  : "bg-[#E5E7EA] text-[#52616F]"
                              }`}
                            >
                              {partner.is_active
                                ? "Aktiv"
                                : "Deaktiviert"}
                            </span>
                          ) : null}
                        </div>

                        <p className="mt-1 break-all text-xs font-semibold text-[#52616F]">
                          {partner?.email ||
                            inquiry.sent_to_email ||
                            "Keine E-Mail-Adresse hinterlegt"}
                        </p>
                      </div>
                    </div>

                    <p className="mt-3 text-sm font-semibold text-[#52616F]">
                      Erstellt:{" "}
                      {formatDate(
                        inquiry.created_at,
                      )}

                      {inquiry.sent_at
                        ? ` · Gesendet: ${formatDate(
                            inquiry.sent_at,
                          )}`
                        : ""}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 lg:min-w-[570px]">
                    <div className="rounded-2xl bg-[#FBF7F0] px-4 py-3 text-center">
                      <p className="text-xs font-black uppercase tracking-[0.08em] text-[#A75B28]">
                        ISBNs
                      </p>

                      <p className="mt-1 text-xl font-black">
                        {inquiryItems.length}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-[#FBF7F0] px-4 py-3 text-center">
                      <p className="text-xs font-black uppercase tracking-[0.08em] text-[#A75B28]">
                        Menge
                      </p>

                      <p className="mt-1 text-xl font-black">
                        {totalQuantity}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-[#EEF4FA] px-4 py-3 text-center text-[#12395F]">
                      <p className="text-xs font-black uppercase tracking-[0.08em]">
                        Verfügbarkeit
                      </p>

                      <p className="mt-1 text-xl font-black">
                        {availabilityAnswered}/
                        {inquiryItems.length}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-[#FFF8EE] px-4 py-3 text-center text-[#8A4A1F]">
                      <p className="text-xs font-black uppercase tracking-[0.08em]">
                        Preis/USt.
                      </p>

                      <p className="mt-1 text-xl font-black">
                        {priceAnswered}/
                        {inquiryItems.length}
                      </p>
                    </div>

                    <div className="col-span-2 rounded-2xl bg-[#F0FFF6] px-4 py-3 text-center text-[#2F7D50] sm:col-span-1">
                      <p className="text-xs font-black uppercase tracking-[0.08em]">
                        Komplett
                      </p>

                      <p className="mt-1 text-xl font-black">
                        {fullyAnswered}/
                        {inquiryItems.length}
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

            <p className="mt-2 text-sm font-semibold text-[#52616F]">
              Lege im ISBN-Bereich die erste
              Sammelanfrage für einen ausgewählten
              Partner an.
            </p>

            <Link
              href="/admin/produkte/isbn"
              className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#B5282D] px-4 py-3 text-sm font-black text-white"
            >
              <Plus className="h-4 w-4" />
              Neue Sammelanfrage
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}