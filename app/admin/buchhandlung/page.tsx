import {
  ArrowLeft,
  BookOpen,
  Building2,
  Mail,
  PackagePlus,
} from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

const cards = [
  {
    href: "/admin/produkte/isbn",
    title: "Neue Sammelanfrage",
    description:
      "ISBNs suchen, Bücher sammeln und eine Anfrage an einen ausgewählten Buchhandelspartner senden.",
    icon: PackagePlus,
  },
  {
    href: "/admin/buchhandlung/anfragen",
    title: "Anfragen und Rückmeldungen",
    description:
      "Gesendete Anfragen, Preisbestätigungen und Verfügbarkeitsmeldungen prüfen.",
    icon: Mail,
  },
  {
    href: "/admin/buchhandlung/partner",
    title: "Buchhandelspartner",
    description:
      "Buchhandlungen anlegen, Kontaktdaten pflegen sowie Partner aktivieren oder deaktivieren.",
    icon: Building2,
  },
];

export default function AdminBookSupplierPage() {
  return (
    <main className="min-h-screen bg-[#FBF7F0] text-[#102A43]">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <Link
          href="/admin"
          className="inline-flex items-center gap-2 text-sm font-black text-[#12395F]"
        >
          <ArrowLeft className="h-4 w-4" />
          Zurück zum Adminbereich
        </Link>

        <header className="rounded-[34px] border border-[#E8DED2] bg-white p-6 shadow-sm">
          <div className="inline-flex items-center gap-2 rounded-full bg-[#FBF7F0] px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
            <BookOpen className="h-3.5 w-3.5" />
            Buchhandlungsworkflow
          </div>

          <h1 className="mt-3 text-3xl font-black">
            Buchhandelspartner und Anfragen
          </h1>

          <p className="mt-2 max-w-3xl font-semibold leading-6 text-[#52616F]">
            Zentrale Verwaltung für ISBN-Sammelanfragen,
            Lieferantenantworten sowie die Bestätigung von Preis
            und Umsatzsteuer.
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-3">
          {cards.map((card) => {
            const Icon = card.icon;

            return (
              <Link
                key={card.href}
                href={card.href}
                className="rounded-[28px] border border-[#E8DED2] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#A75B28]"
              >
                <div className="inline-flex rounded-2xl bg-[#EEF4FA] p-3 text-[#12395F]">
                  <Icon className="h-6 w-6" />
                </div>

                <h2 className="mt-4 text-xl font-black">
                  {card.title}
                </h2>

                <p className="mt-2 text-sm font-semibold leading-6 text-[#52616F]">
                  {card.description}
                </p>
              </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}