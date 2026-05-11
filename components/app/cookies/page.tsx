import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Cookie, ShieldCheck } from "lucide-react";

const siteUrl = "https://www.handzettel-schulen.de";

export const metadata: Metadata = {
  title: "Cookie-Hinweise | Handzettel-Schulen.de",
  description:
    "Cookie-Hinweise und Datenschutzeinstellungen für Handzettel-Schulen.de.",
  alternates: {
    canonical: `${siteUrl}/cookies`,
  },
  robots: {
    index: false,
    follow: true,
  },
};

export default function CookiesPage() {
  return (
    <main className="min-h-screen bg-[#FBF7F0] text-[#102A43]">
      <section className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-black text-[#12395F] transition hover:text-[#B5282D]"
        >
          <ArrowLeft className="h-4 w-4" />
          Zurück zur Startseite
        </Link>

        <header className="rounded-[34px] border border-[#E8DED2] bg-white p-6 shadow-sm sm:p-8">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FBF7F0] text-[#A75B28]">
            <Cookie className="h-6 w-6" />
          </div>

          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#A75B28]">
            Handzettel-Schulen.de
          </p>

          <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
            Cookie-Hinweise
          </h1>

          <p className="mt-3 text-sm font-semibold leading-6 text-[#52616F] sm:text-base">
            Wir setzen Cookies und vergleichbare Speichertechnologien sparsam
            ein. Aktuell ist die Consent-Struktur vorbereitet, ohne dass
            Analyse- oder Marketing-Skripte automatisch geladen werden.
          </p>
        </header>

        <section className="rounded-[32px] border border-[#BFE3CD] bg-[#F0FFF6] p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-[#2F7D50]">
              <ShieldCheck className="h-5 w-5" />
            </div>

            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#2F7D50]">
                Aktueller Stand
              </p>

              <h2 className="mt-1 text-xl font-black text-[#102A43]">
                Keine Analyse- oder Marketing-Cookies ohne Zustimmung
              </h2>

              <p className="mt-2 text-sm font-semibold leading-6 text-[#52616F]">
                Der Cookie-Banner speichert Deine Auswahl lokal im Browser.
                Analyse-, Marketing- und externe Medien-Dienste sind vorbereitet,
                werden aber erst relevant, wenn solche Dienste später eingebaut
                und entsprechend Deiner Auswahl geladen werden.
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-4">
          <article className="rounded-[28px] border border-[#E8DED2] bg-white p-5">
            <h2 className="text-lg font-black text-[#102A43]">
              Notwendige Speicherung
            </h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-[#52616F]">
              Diese Kategorie ist erforderlich, damit Grundfunktionen,
              Sicherheit und Deine Cookie-Auswahl funktionieren. Sie kann nicht
              deaktiviert werden.
            </p>
          </article>

          <article className="rounded-[28px] border border-[#E8DED2] bg-white p-5">
            <h2 className="text-lg font-black text-[#102A43]">Analyse</h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-[#52616F]">
              Diese Kategorie ist für spätere Besucheranalyse vorbereitet. Solche
              Dienste werden aktuell nicht automatisch geladen.
            </p>
          </article>

          <article className="rounded-[28px] border border-[#E8DED2] bg-white p-5">
            <h2 className="text-lg font-black text-[#102A43]">Marketing</h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-[#52616F]">
              Diese Kategorie ist für spätere Werbe- oder Conversion-Messung
              vorbereitet. Solche Dienste werden aktuell nicht automatisch
              geladen.
            </p>
          </article>

          <article className="rounded-[28px] border border-[#E8DED2] bg-white p-5">
            <h2 className="text-lg font-black text-[#102A43]">
              Externe Medien
            </h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-[#52616F]">
              Diese Kategorie ist für spätere eingebettete Inhalte vorbereitet,
              zum Beispiel Karten, Videos oder externe Medien.
            </p>
          </article>
        </section>

        <section className="rounded-[32px] border border-[#F1D1A8] bg-[#FFF8EE] p-5 text-sm font-bold leading-6 text-[#A75B28] sm:p-6">
          Du kannst Deine Auswahl jederzeit über den kleinen Button „Cookies“
          unten links auf der Website ändern.
        </section>
      </section>
    </main>
  );
}