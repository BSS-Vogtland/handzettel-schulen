import type { Metadata } from "next";
import Link from "next/link";
import { Cookie, Database, ShieldCheck, SlidersHorizontal } from "lucide-react";
import LegalFooter from "@/components/LegalFooter";

export const metadata: Metadata = {
  title: "Cookie-Hinweise | Handzettel-Schulen.de",
  description:
    "Informationen zu technisch notwendiger Speicherung, Warenkorb und Cookie-Einstellungen bei Handzettel-Schulen.de.",
  alternates: {
    canonical: "https://www.handzettel-schulen.de/cookies",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function CookiesPage() {
  return (
    <>
      <main className="min-h-screen bg-[#FBF7F0] text-[#102A43]">
        <section className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
          <Link
            href="/"
            className="inline-flex w-fit text-sm font-black text-[#12395F] transition hover:text-[#B5282D]"
          >
            ← Zurück zur Startseite
          </Link>

          <header className="rounded-[32px] border border-[#E8DED2] bg-white p-6 shadow-sm sm:p-8">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#FBF7F0] text-[#A75B28]">
                <Cookie className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#A75B28]">
                  Datenschutz
                </p>
                <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
                  Cookie-Hinweise
                </h1>
                <p className="mt-4 text-sm font-semibold leading-7 text-[#52616F] sm:text-base">
                  Wir verwenden Cookies und lokale Browser-Speicherung bewusst
                  sparsam. Technisch notwendige Funktionen sichern den Betrieb,
                  die Cookie-Auswahl und den Warenkorb.
                </p>
                <p className="mt-3 text-xs font-bold uppercase tracking-[0.12em] text-[#8A5A2B]">
                  Stand: 22. Juli 2026
                </p>
              </div>
            </div>
          </header>

          <InfoSection
            icon={<ShieldCheck className="h-5 w-5" />}
            title="Technisch notwendige Speicherung"
          >
            <p>
              Notwendige Speicherung wird eingesetzt, damit Grundfunktionen,
              Sicherheit und Deine Cookie-Auswahl zuverlässig funktionieren.
              Diese Funktionen können nicht vollständig deaktiviert werden,
              ohne die Website einzuschränken.
            </p>
          </InfoSection>

          <InfoSection
            icon={<Database className="h-5 w-5" />}
            title="Warenkorb im Browser"
          >
            <p>
              Ausgewählte Shopartikel werden lokal im Browser gespeichert,
              damit Dein Warenkorb beim Seitenwechsel erhalten bleibt. Die
              Inhalte werden erst beim Checkout zusammen mit Deinen
              Bestelldaten an unseren Server übermittelt.
            </p>
          </InfoSection>

          <InfoSection
            icon={<SlidersHorizontal className="h-5 w-5" />}
            title="Analyse, Marketing und externe Medien"
          >
            <p>
              Solche Dienste werden nur aktiviert, wenn sie tatsächlich
              eingebunden sind und Du – soweit erforderlich – zugestimmt hast.
              Eine erteilte Auswahl kannst Du jederzeit über den dauerhaft
              sichtbaren Button „Cookies“ am unteren Bildschirmrand ändern.
            </p>
          </InfoSection>

          <section className="rounded-[28px] border border-[#E8DED2] bg-white p-5 shadow-sm">
            <h2 className="text-xl font-black">
              Weitere Informationen
            </h2>
            <div className="mt-4 flex flex-wrap gap-4 text-sm font-black">
              <Link
                href="/datenschutz"
                className="text-[#12395F] underline underline-offset-4"
              >
                Datenschutzerklärung
              </Link>
              <Link
                href="/impressum"
                className="text-[#12395F] underline underline-offset-4"
              >
                Impressum
              </Link>
            </div>
          </section>
        </section>
      </main>

      <LegalFooter />
    </>
  );
}

function InfoSection({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-[#E8DED2] bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#FBF7F0] text-[#A75B28]">
          {icon}
        </div>
        <h2 className="text-xl font-black">{title}</h2>
      </div>
      <div className="mt-4 text-sm font-semibold leading-7 text-[#52616F]">
        {children}
      </div>
    </section>
  );
}
