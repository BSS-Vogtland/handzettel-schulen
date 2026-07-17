import Link from "next/link";
import { ArrowLeft, BookOpen, PackagePlus } from "lucide-react";
import AdminIsbnImportTool from "@/components/AdminIsbnImportTool";

export const dynamic = "force-dynamic";

export default function AdminIsbnImportPage() {
  return (
    <main className="min-h-screen bg-[#FBF7F0] text-[#102A43]">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/admin/produkte"
            className="inline-flex items-center gap-2 text-sm font-black text-[#12395F] transition hover:text-[#B5282D]"
          >
            <ArrowLeft className="h-4 w-4" />
            Zurück zur Produktverwaltung
          </Link>

          <Link
            href="/admin/produkte"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-black text-[#12395F] shadow-sm ring-1 ring-[#E8DED2] transition hover:bg-[#EEF4FA]"
          >
            <PackagePlus className="h-4 w-4" />
            Produktbestand öffnen
          </Link>
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
            ISBN. Vor der späteren Übernahme wird automatisch geprüft, ob das
            Buch bereits im Produktkatalog vorhanden ist.
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] px-4 py-3">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[#A75B28]">
                1. Suchen
              </p>
              <p className="mt-1 text-sm font-bold text-[#102A43]">
                ISBN eingeben oder scannen
              </p>
            </div>

            <div className="rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] px-4 py-3">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[#A75B28]">
                2. Prüfen
              </p>
              <p className="mt-1 text-sm font-bold text-[#102A43]">
                Metadaten und Cover kontrollieren
              </p>
            </div>

            <div className="rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] px-4 py-3">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[#A75B28]">
                3. Übernehmen
              </p>
              <p className="mt-1 text-sm font-bold text-[#102A43]">
                Danach als Produkt speichern
              </p>
            </div>
          </div>
        </header>

        <AdminIsbnImportTool />
      </section>
    </main>
  );
}