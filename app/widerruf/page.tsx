import type { Metadata } from "next";
import Link from "next/link";
import WithdrawalForm from "@/components/WithdrawalForm";
import LegalFooter from "@/components/LegalFooter";
import {
  getGeneralEmail,
  getLegalAddress,
  getLegalDisplayName,
  getLegalSettings,
} from "@/lib/legal-settings";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Vertrag widerrufen | Handzettel-Schulen.de",
  description:
    "Elektronische Widerrufsfunktion für online geschlossene Verträge bei Handzettel-Schulen.de.",
  alternates: {
    canonical: "https://www.handzettel-schulen.de/widerruf",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default async function WithdrawalPage() {
  const settings = await getLegalSettings();
  const displayName = getLegalDisplayName(settings);
  const address = getLegalAddress(settings);
  const email = getGeneralEmail(settings);

  return (
    <>
      <main className="min-h-screen bg-[#FBF7F0] text-[#102A43]">
        <section className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
          <nav className="flex flex-wrap items-center gap-3 text-sm font-semibold text-[#486581]">
            <Link href="/" className="hover:text-[#B5282D]">
              Startseite
            </Link>
            <span>/</span>
            <Link
              href="/widerruf-rueckgabe"
              className="hover:text-[#B5282D]"
            >
              Widerruf & Rückgabe
            </Link>
            <span>/</span>
            <span className="font-black text-[#102A43]">
              Vertrag widerrufen
            </span>
          </nav>

          <header className="rounded-[32px] border border-[#E8DED2] bg-white p-6 shadow-sm sm:p-8">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#B5282D]">
              Ständig verfügbare Online-Funktion
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
              Vertrag widerrufen
            </h1>
            <p className="mt-4 max-w-3xl text-sm font-semibold leading-7 text-[#52616F] sm:text-base">
              Über diese Seite kannst Du eine eindeutige
              Widerrufserklärung zu einem online geschlossenen Vertrag
              übermitteln. Nach dem Absenden erhältst Du eine
              Eingangsbestätigung per E-Mail mit Inhalt, Datum und Uhrzeit.
            </p>
          </header>

          <WithdrawalForm />

          <section className="rounded-[28px] border border-[#E8DED2] bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-xl font-black text-[#102A43]">
              Alternativer Kontakt
            </h2>
            <p className="mt-3 text-sm font-semibold leading-6 text-[#52616F]">
              Du kannst Deinen Widerruf weiterhin auch durch eine
              eindeutige Erklärung per E-Mail oder Brief ausüben.
            </p>

            <div className="mt-4 rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] p-4 text-sm font-semibold leading-6 text-[#102A43]">
              <p className="font-black">{displayName}</p>
              {address.map((line) => (
                <p key={line}>{line}</p>
              ))}
              {email ? (
                <p className="mt-2">
                  E-Mail:{" "}
                  <a
                    href={`mailto:${email}`}
                    className="font-black text-[#12395F] underline underline-offset-4"
                  >
                    {email}
                  </a>
                </p>
              ) : null}
            </div>

            <Link
              href="/widerruf-rueckgabe"
              className="mt-4 inline-flex font-black text-[#12395F] underline decoration-[#A75B28]/40 underline-offset-4"
            >
              Widerrufsbelehrung und Musterformular ansehen
            </Link>
          </section>
        </section>
      </main>

      <LegalFooter />
    </>
  );
}
