import Link from "next/link";
import { ArrowLeft, BookOpen, Mail, PackagePlus } from "lucide-react";
import AdminIsbnImportTool from "@/components/AdminIsbnImportTool";
import AdminBookSupplierInquiryComposer from "@/components/AdminBookSupplierInquiryComposer";

export const dynamic = "force-dynamic";

export default function AdminIsbnImportPage() {
  return (
    <main className="min-h-screen bg-[#FBF7F0] text-[#102A43]">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/admin/produkte"
            className="inline-flex items-center gap-2 text-sm font-black text-[#12395F] transition hover:text-[#B5282D]"
          >
            <ArrowLeft className="h-4 w-4" />
            Zurück zur Produktverwaltung
          </Link>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/admin/buchhandlung/anfragen"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#102A43] px-4 py-3 text-sm font-black text-white shadow-sm transition hover:bg-[#12395F]"
            >
              <Mail className="h-4 w-4" />
              Buchhandlungsanfragen
            </Link>

            <Link
              href="/admin/produkte"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-black text-[#12395F] shadow-sm ring-1 ring-[#E8DED2] transition hover:bg-[#EEF4FA]"
            >
              <PackagePlus className="h-4 w-4" />
              Produktbestand öffnen
            </Link>
          </div>
        </div>

        <header className="rounded-[34px] border border-[#E8DED2] bg-white p-5 shadow-[0_18px_45px_rgba(16,42,67,0.10)] sm:p-7">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[#FBF7F0] px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-[#A75B28]">
            <BookOpen className="h-3.5 w-3.5" />
            Buchimport
          </div>

          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
            Bücher per ISBN erfassen
          </h1>

          <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-[#52616F] sm:text-base">
            Finde Buchdaten, Cover, Verlag und weitere Metadaten anhand einer
            ISBN. Du kannst das Buch als Produkt anlegen oder mehrere Titel in
            einer Sammelanfrage für die Vogtländische Buchhandlung bündeln.
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-4">
            {[
              ["1. Suchen", "ISBN eingeben oder scannen"],
              ["2. Prüfen", "Metadaten und Cover kontrollieren"],
              ["3. Übernehmen", "Als Produkt speichern"],
              ["4. Anfragen", "Verfügbarkeit gesammelt prüfen lassen"],
            ].map(([title, text]) => (
              <div
                key={title}
                className="rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] px-4 py-3"
              >
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[#A75B28]">
                  {title}
                </p>
                <p className="mt-1 text-sm font-bold text-[#102A43]">{text}</p>
              </div>
            ))}
          </div>
        </header>

        <AdminIsbnImportTool />

        <AdminBookSupplierInquiryComposer />
      </section>
    </main>
  );
}
