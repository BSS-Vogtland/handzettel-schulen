import type { Metadata } from "next";
import Link from "next/link";
import {
  Banknote,
  Clock3,
  CreditCard,
  MapPin,
  PackageCheck,
  Truck,
} from "lucide-react";
import LegalFooter from "@/components/LegalFooter";
import {
  getGeneralEmail,
  getLegalAddress,
  getLegalDisplayName,
  getLegalSettings,
} from "@/lib/legal-settings";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Versand & Zahlung | Handzettel-Schulen.de",
  description:
    "Informationen zu Versandkosten, Abholung, Lieferzeit und Zahlungsarten bei Handzettel-Schulen.de.",
  alternates: {
    canonical:
      "https://www.handzettel-schulen.de/versand-zahlung",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default async function VersandZahlungPage() {
  const settings = await getLegalSettings();
  const displayName = getLegalDisplayName(settings);
  const address = getLegalAddress(settings);
  const email = getGeneralEmail(settings);

  return (
    <>
      <main className="min-h-screen bg-[#FBF7F0] text-[#102A43]">
        <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
          <nav className="flex flex-wrap items-center gap-3 text-sm font-semibold text-[#486581]">
            <Link href="/" className="hover:text-[#B5282D]">
              Startseite
            </Link>
            <span>/</span>
            <Link href="/shop" className="hover:text-[#B5282D]">
              Shop
            </Link>
            <span>/</span>
            <span className="font-black text-[#102A43]">
              Versand & Zahlung
            </span>
          </nav>

          <header className="rounded-[32px] border border-[#E8DED2] bg-white p-6 shadow-sm sm:p-8">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#A75B28]">
              Bestellinformationen
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
              Versand, Abholung und Zahlung
            </h1>
            <p className="mt-4 max-w-3xl text-sm font-semibold leading-7 text-[#52616F] sm:text-base">
              Vor dem verbindlichen Bestellabschluss werden Dir
              Produktpreise, mögliche Rabatte, Versandkosten und
              Gesamtbetrag vollständig angezeigt.
            </p>
          </header>

          <section className="grid gap-5 md:grid-cols-2">
            <InfoBox
              icon={<Truck className="h-6 w-6" />}
              title="Versand innerhalb Deutschlands"
            >
              <p>
                Für den Standardversand berechnen wir pauschal{" "}
                <strong>5,95 €</strong> pro Bestellung.
              </p>
              <p>
                Eine abweichende Lieferanschrift kannst Du im Checkout
                angeben. Der Versand erfolgt an die dort bestätigte
                Adresse.
              </p>
            </InfoBox>

            <InfoBox
              icon={<MapPin className="h-6 w-6" />}
              title="Abholung vor Ort"
            >
              <p>
                Die Abholung ist <strong>kostenlos</strong>. Hole die
                Bestellung erst ab, nachdem Du eine entsprechende
                Bestätigung erhalten hast.
              </p>
              <div className="rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] p-4">
                <p className="font-black">{displayName}</p>
                {address.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            </InfoBox>

            <InfoBox
              icon={<CreditCard className="h-6 w-6" />}
              title="PayPal"
            >
              <p>
                Bei Auswahl von PayPal erhältst Du den vorgesehenen
                Zahlungsweg im weiteren Bestell- oder
                Rechnungsprozess.
              </p>
              <p>
                Die Bearbeitung erfolgt grundsätzlich nach
                bestätigtem Zahlungseingang.
              </p>
            </InfoBox>

            <InfoBox
              icon={<Banknote className="h-6 w-6" />}
              title="Überweisung"
            >
              <p>
                Bei Überweisung erhältst Du die Bankverbindung und den
                Verwendungszweck mit den Zahlungsinformationen.
              </p>
              <p>
                Die Bestellung wird nach Zuordnung des
                Zahlungseingangs weiterbearbeitet.
              </p>
            </InfoBox>
          </section>

          <section className="rounded-[32px] border border-[#E8DED2] bg-white p-6 shadow-sm sm:p-8">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#F0FFF6] text-[#2F7D50]">
                <Clock3 className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-2xl font-black">
                  Bearbeitung und Lieferzeit
                </h2>
                <p className="mt-3 text-sm font-semibold leading-7 text-[#52616F]">
                  Bei als „Online bestellbar“ gekennzeichneten Artikeln
                  beträgt die interne Bearbeitung nach Zahlungseingang
                  gewöhnlich 1 bis 2 Werktage. Für den Pakettransport
                  innerhalb Deutschlands werden gewöhnlich weitere 1
                  bis 3 Werktage benötigt.
                </p>
                <p className="mt-3 text-sm font-semibold leading-7 text-[#52616F]">
                  Bei Rückfragen, nicht eindeutig verfügbarer Ware,
                  Ferienzeiten oder außergewöhnlich hohem
                  Bestellaufkommen kann sich die Bearbeitung verlängern.
                  In diesem Fall informieren wir Dich.
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-[32px] border border-[#BFE3CD] bg-[#F0FFF6] p-6 shadow-sm sm:p-8">
            <div className="flex items-start gap-4">
              <PackageCheck className="mt-1 h-6 w-6 shrink-0 text-[#2F7D50]" />
              <div>
                <h2 className="text-xl font-black">
                  Gesamtkosten vor Abschluss
                </h2>
                <p className="mt-2 text-sm font-semibold leading-7 text-[#2F7D50]">
                  Im Checkout werden Zwischensumme, Rabatt,
                  Versandkosten und Gesamtbetrag vor der verbindlichen
                  Bestellung dargestellt. Bei Abholung fallen keine
                  Versandkosten an.
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-[28px] border border-[#E8DED2] bg-white p-5 shadow-sm">
            <h2 className="text-xl font-black">Fragen zur Bestellung</h2>
            <p className="mt-3 text-sm font-semibold leading-6 text-[#52616F]">
              Bei Fragen zu Versand, Abholung oder Zahlung erreichst Du
              uns unter{" "}
              {email ? (
                <a
                  href={`mailto:${email}`}
                  className="font-black text-[#12395F] underline underline-offset-4"
                >
                  {email}
                </a>
              ) : (
                "den Angaben im Impressum"
              )}
              .
            </p>

            <div className="mt-4 flex flex-wrap gap-4 text-sm font-black">
              <Link
                href="/widerruf-rueckgabe"
                className="text-[#12395F] underline underline-offset-4"
              >
                Widerruf & Rückgabe
              </Link>
              <Link
                href="/impressum"
                className="text-[#12395F] underline underline-offset-4"
              >
                Impressum
              </Link>
              <Link
                href="/datenschutz"
                className="text-[#12395F] underline underline-offset-4"
              >
                Datenschutz
              </Link>
            </div>
          </section>
        </section>
      </main>

      <LegalFooter />
    </>
  );
}

function InfoBox({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <article className="rounded-[30px] border border-[#E8DED2] bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FBF7F0] text-[#A75B28]">
          {icon}
        </div>
        <h2 className="text-xl font-black">{title}</h2>
      </div>
      <div className="mt-4 space-y-3 text-sm font-semibold leading-7 text-[#52616F]">
        {children}
      </div>
    </article>
  );
}
