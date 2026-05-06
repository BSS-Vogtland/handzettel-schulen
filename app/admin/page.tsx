import Link from "next/link";
import {
  ArrowRight,
  ClipboardList,
  PackagePlus,
  School,
  ShoppingBasket,
  Sparkles,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default function AdminHomePage() {
  return (
    <main className="min-h-screen bg-[#FBF7F0] text-[#102A43]">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="rounded-[34px] border border-[#E8DED2] bg-white p-5 shadow-[0_18px_45px_rgba(16,42,67,0.10)] sm:p-7">
          <div className="grid gap-6 lg:grid-cols-[1fr_280px] lg:items-start">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[#FBF7F0] px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-[#A75B28]">
                <School className="h-3.5 w-3.5" />
                Handzettel-Schulen.de
              </div>

              <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
                Admin-Bereich
              </h1>

              <p className="mt-3 max-w-3xl text-sm leading-6 text-[#52616F] sm:text-base">
                Hier steuerst Du Deine Schulmaterial-Anfragen, bearbeitest
                Paketwünsche und erfasst Produkte für zukünftige automatische
                Vorschläge.
              </p>
            </div>

            <div className="rounded-[28px] border border-[#E8DED2] bg-[#FBF7F0] p-4">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[#A75B28]">
                <Sparkles className="h-5 w-5" />
              </div>

              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
                Schnellzugriff
              </p>

              <p className="mt-2 text-sm font-semibold leading-6 text-[#52616F]">
                Wähle aus, ob Du Anfragen bearbeiten oder Produkte erfassen
                möchtest.
              </p>
            </div>
          </div>
        </header>

        <section className="grid gap-5 md:grid-cols-2">
          <Link
            href="/admin/anfragen"
            className="group rounded-[32px] border border-[#E8DED2] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-[0_18px_45px_rgba(16,42,67,0.10)] sm:p-7"
          >
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-3xl bg-[#FBF7F0] text-[#A75B28]">
              <ClipboardList className="h-6 w-6" />
            </div>

            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
              Kundenanfragen
            </p>

            <h2 className="mt-2 text-2xl font-black text-[#102A43]">
              Anfragen bearbeiten
            </h2>

            <p className="mt-3 text-sm font-semibold leading-6 text-[#52616F]">
              Öffne eingegangene Schulmateriallisten, prüfe erkannte Positionen,
              bearbeite Paketwünsche und korrigiere Kunden-Auswahlen.
            </p>

            <div className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-[#B5282D] px-4 py-3 text-sm font-black text-white shadow-sm transition group-hover:brightness-110">
              Zu den Anfragen
              <ArrowRight className="h-4 w-4" />
            </div>
          </Link>

          <Link
            href="/admin/produkte"
            className="group rounded-[32px] border border-[#E8DED2] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-[0_18px_45px_rgba(16,42,67,0.10)] sm:p-7"
          >
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-3xl bg-[#FBF7F0] text-[#A75B28]">
              <PackagePlus className="h-6 w-6" />
            </div>

            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
              Produktverwaltung
            </p>

            <h2 className="mt-2 text-2xl font-black text-[#102A43]">
              Produkte schnell erfassen
            </h2>

            <p className="mt-3 text-sm font-semibold leading-6 text-[#52616F]">
              Lege neue Produkte, Artikelnummern, Preise, Formate, Farben,
              Lineaturen und Suchbegriffe an. Diese Produkte stehen danach für
              manuelle Auswahl und spätere automatische Vorschläge bereit.
            </p>

            <div className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-[#12395F] px-4 py-3 text-sm font-black text-white shadow-sm transition group-hover:brightness-110">
              Zu den Produkten
              <ArrowRight className="h-4 w-4" />
            </div>
          </Link>
        </section>

        <section className="rounded-[32px] border border-[#E8DED2] bg-white p-5 shadow-sm sm:p-7">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-3xl bg-[#FBF7F0] text-[#A75B28]">
              <ShoppingBasket className="h-5 w-5" />
            </div>

            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
                Aktueller Workflow
              </p>

              <h2 className="mt-1 text-xl font-black text-[#102A43]">
                Produkte und Anfragen greifen zusammen
              </h2>

              <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#52616F]">
                Produkte, die Du unter „Produkte schnell erfassen“ anlegst,
                können später direkt in Anfragen gefunden, manuell übernommen
                und durch Aliase für zukünftige Listen gemerkt werden.
              </p>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}