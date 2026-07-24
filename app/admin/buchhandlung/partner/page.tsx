import AdminBookSupplierPartnerManager from "@/components/AdminBookSupplierPartnerManager";
import {
  ArrowLeft,
  Building2,
  Mail,
} from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default function AdminBookSupplierPartnersPage() {
  return (
    <main className="min-h-screen bg-[#FBF7F0] text-[#102A43]">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/admin/buchhandlung"
            className="inline-flex items-center gap-2 text-sm font-black text-[#12395F]"
          >
            <ArrowLeft className="h-4 w-4" />
            Zurück zum Buchhandlungsbereich
          </Link>

          <Link
            href="/admin/buchhandlung/anfragen"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-black text-[#12395F] shadow-sm ring-1 ring-[#C8D8E8] transition hover:bg-[#F5FAFD]"
          >
            <Mail className="h-4 w-4" />
            Anfragen öffnen
          </Link>
        </div>

        <header className="rounded-[34px] border border-[#E8DED2] bg-white p-6 shadow-sm">
          <div className="inline-flex items-center gap-2 rounded-full bg-[#FBF7F0] px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
            <Building2 className="h-3.5 w-3.5" />
            Partnerverwaltung
          </div>

          <h1 className="mt-3 text-3xl font-black">
            Buchhandelspartner
          </h1>

          <p className="mt-2 max-w-3xl font-semibold leading-6 text-[#52616F]">
            Lege mehrere Buchhandlungen an, pflege die
            Kontaktdaten und entscheide bei jeder neuen
            Sammelanfrage, welcher aktive Partner
            Verfügbarkeit, Preis und Umsatzsteuer prüfen soll.
          </p>
        </header>

        <AdminBookSupplierPartnerManager />
      </section>
    </main>
  );
}