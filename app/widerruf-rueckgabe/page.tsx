import type { Metadata } from "next";
import Link from "next/link";
import LegalFooter from "@/components/LegalFooter";
import {
  getGeneralEmail,
  getLegalAddress,
  getLegalDisplayName,
  getLegalSettings,
} from "@/lib/legal-settings";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Widerruf & Rückgabe | Handzettel-Schulen.de",
  description:
    "Widerrufsbelehrung, elektronische Widerrufsfunktion, Musterformular, Rückgabe und Reklamation bei Handzettel-Schulen.de.",
  alternates: {
    canonical:
      "https://www.handzettel-schulen.de/widerruf-rueckgabe",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default async function WiderrufRueckgabePage() {
  const settings = await getLegalSettings();
  const displayName = getLegalDisplayName(settings);
  const address = getLegalAddress(settings);
  const email = getGeneralEmail(settings);
  const phone = settings.phone_primary;

  return (
    <>
      <main className="min-h-screen bg-[#FBF7F0] text-[#102A43]">
        <section className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
          <nav className="flex flex-wrap items-center gap-3 text-sm font-semibold text-[#486581]">
            <Link href="/" className="hover:text-[#D97706]">
              Startseite
            </Link>
            <span>/</span>
            <Link href="/shop" className="hover:text-[#D97706]">
              Shop
            </Link>
            <span>/</span>
            <span className="font-black text-[#102A43]">
              Widerruf & Rückgabe
            </span>
          </nav>

          <header className="rounded-[28px] border border-[#E6D7BF] bg-white p-6 shadow-sm sm:p-8">
            <p className="mb-3 text-sm font-black uppercase tracking-[0.18em] text-[#D97706]">
              Kundeninformation
            </p>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
              Widerruf & Rückgabe
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-[#486581]">
              Hier findest Du die Widerrufsbelehrung, das
              Muster-Widerrufsformular und Informationen zu Rücksendung,
              Rücksendekosten und Reklamationen.
            </p>

            <Link
              href="/widerruf"
              className="mt-6 inline-flex min-h-12 items-center justify-center rounded-2xl bg-[#B5282D] px-6 py-3 text-sm font-black text-white shadow-sm transition hover:bg-[#102A43]"
            >
              Vertrag widerrufen
            </Link>
          </header>

          <section className="rounded-[28px] border border-[#E6D7BF] bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-2xl font-black">
              Widerrufsbelehrung
            </h2>

            <div className="mt-6 space-y-6 text-sm leading-7 text-[#243B53] sm:text-base">
              <div>
                <h3 className="font-black">Widerrufsrecht</h3>
                <p className="mt-2">
                  Verbraucher haben das Recht, binnen 14 Tagen ohne
                  Angabe von Gründen diesen Vertrag zu widerrufen.
                </p>
                <p className="mt-2">
                  Bei einem Kaufvertrag beginnt die Frist grundsätzlich
                  an dem Tag, an dem Du oder ein von Dir benannter
                  Dritter, der nicht Beförderer ist, die Ware erhalten
                  hat. Bei mehreren getrennt gelieferten Waren beginnt
                  die Frist mit Erhalt der letzten Ware.
                </p>
              </div>

              <div>
                <h3 className="font-black">
                  Ausübung des Widerrufs
                </h3>
                <p className="mt-2">
                  Um Dein Widerrufsrecht auszuüben, musst Du uns mittels
                  einer eindeutigen Erklärung, beispielsweise per Brief,
                  E-Mail oder über unsere elektronische
                  Widerrufsfunktion, über Deinen Entschluss informieren.
                </p>

                <ContactBlock
                  displayName={displayName}
                  address={address}
                  email={email}
                  phone={phone}
                />

                <p className="mt-4">
                  Zur Wahrung der Widerrufsfrist reicht es aus, dass Du
                  die Mitteilung über die Ausübung des Widerrufsrechts
                  vor Ablauf der Frist absendest.
                </p>

                <p className="mt-2">
                  Die elektronische Widerrufsfunktion ist unter{" "}
                  <Link
                    href="/widerruf"
                    className="font-black text-[#B45309] underline underline-offset-4"
                  >
                    Vertrag widerrufen
                  </Link>{" "}
                  verfügbar. Bei Nutzung erhältst Du unverzüglich eine
                  Eingangsbestätigung per E-Mail mit Inhalt, Datum und
                  Uhrzeit.
                </p>
              </div>

              <div>
                <h3 className="font-black">
                  Folgen des Widerrufs
                </h3>
                <p className="mt-2">
                  Wenn Du diesen Vertrag widerrufst, erstatten wir alle
                  erhaltenen Zahlungen einschließlich der Kosten der
                  günstigsten angebotenen Standardlieferung. Zusätzliche
                  Kosten einer von Dir gewählten teureren Lieferart
                  werden nicht erstattet.
                </p>
                <p className="mt-2">
                  Die Rückzahlung erfolgt unverzüglich und spätestens
                  binnen 14 Tagen ab Eingang Deiner Widerrufserklärung.
                  Wir verwenden grundsätzlich dasselbe Zahlungsmittel
                  wie bei der ursprünglichen Transaktion, sofern nichts
                  anderes vereinbart wurde.
                </p>
                <p className="mt-2">
                  Bei Kaufverträgen können wir die Rückzahlung
                  verweigern, bis die Waren zurückerhalten wurden oder Du
                  den Nachweis der Rücksendung erbracht hast.
                </p>
              </div>

              <div>
                <h3 className="font-black">
                  Rücksendung der Ware
                </h3>
                <p className="mt-2">
                  Du hast die Waren unverzüglich und spätestens binnen
                  14 Tagen ab dem Tag, an dem Du uns über den Widerruf
                  informierst, zurückzusenden oder zu übergeben. Die
                  Frist ist gewahrt, wenn Du die Ware vor Ablauf der
                  14 Tage absendest.
                </p>
                <p className="mt-2">
                  Du trägst die unmittelbaren Kosten der Rücksendung,
                  sofern die Ware nicht mangelhaft ist oder wir die
                  Übernahme der Kosten ausdrücklich zugesagt haben.
                </p>
              </div>

              <div>
                <h3 className="font-black">
                  Wertersatz
                </h3>
                <p className="mt-2">
                  Für einen Wertverlust musst Du nur aufkommen, wenn
                  dieser auf einen Umgang zurückzuführen ist, der zur
                  Prüfung von Beschaffenheit, Eigenschaften und
                  Funktionsweise der Ware nicht notwendig war.
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-[28px] border border-[#E6D7BF] bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-2xl font-black">
              Muster-Widerrufsformular
            </h2>
            <p className="mt-3 text-sm leading-7 text-[#486581]">
              Dieses Formular ist nicht vorgeschrieben. Du kannst auch
              jede andere eindeutige Erklärung verwenden.
            </p>

            <div className="mt-5 whitespace-pre-wrap rounded-2xl border border-dashed border-[#D8C8B8] bg-[#FBF7F0] p-5 font-mono text-sm leading-7 text-[#243B53]">
{`An:
${displayName}
${address.join("\n")}
${email ? `E-Mail: ${email}` : ""}

Hiermit widerrufe ich den von mir abgeschlossenen Vertrag
über den Kauf der folgenden Waren:

________________________________________

Bestellt am / erhalten am:

________________________________________

Name des Verbrauchers:

________________________________________

Anschrift des Verbrauchers:

________________________________________

Datum:

________________________________________

Unterschrift (nur bei Mitteilung auf Papier):

________________________________________`}
            </div>
          </section>

          <section className="rounded-[28px] border border-[#E6D7BF] bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-2xl font-black">
              Rückgabe und Reklamation
            </h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <InfoCard
                title="Einwandfreie Ware"
                text="Einwandfreie Produkte können im Rahmen des gesetzlichen Widerrufsrechts innerhalb der Widerrufsfrist zurückgegeben werden."
              />
              <InfoCard
                title="Mangelhafte oder falsche Ware"
                text="Bei beschädigten, mangelhaften oder falsch gelieferten Artikeln kontaktiere uns bitte mit Bestellinformationen und möglichst einem Foto."
              />
              <InfoCard
                title="Rücksendekosten"
                text="Bei einem Widerruf einwandfreier Ware trägst Du grundsätzlich die unmittelbaren Rücksendekosten."
              />
              <InfoCard
                title="Erstattung"
                text="Die Erstattung erfolgt nach den gesetzlichen Vorgaben grundsätzlich über das ursprünglich verwendete Zahlungsmittel."
              />
            </div>
          </section>

          <section className="rounded-[28px] border border-[#E6D7BF] bg-[#102A43] p-6 text-white shadow-sm sm:p-8">
            <h2 className="text-2xl font-black">
              Kontakt zur Rückgabe
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-[#D9E2EC] sm:text-base">
              Bitte sende Rückgabe- oder Reklamationsanfragen mit
              Bestellnummer, Name und kurzer Beschreibung an:
            </p>
            {email ? (
              <a
                href={`mailto:${email}`}
                className="mt-5 inline-flex rounded-full bg-[#D97706] px-5 py-3 text-sm font-black text-white shadow-sm hover:bg-[#B45309]"
              >
                {email}
              </a>
            ) : null}
          </section>

          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E6D7BF] pt-6 text-sm text-[#486581]">
            <p>Stand: 22. Juli 2026</p>
            <div className="flex flex-wrap gap-4">
              <Link href="/versand-zahlung" className="hover:text-[#D97706]">
                Versand & Zahlung
              </Link>
              <Link href="/impressum" className="hover:text-[#D97706]">
                Impressum
              </Link>
              <Link href="/datenschutz" className="hover:text-[#D97706]">
                Datenschutz
              </Link>
            </div>
          </footer>
        </section>
      </main>

      <LegalFooter />
    </>
  );
}

function ContactBlock({
  displayName,
  address,
  email,
  phone,
}: {
  displayName: string;
  address: string[];
  email: string;
  phone: string | null;
}) {
  return (
    <div className="mt-4 rounded-2xl border border-[#E6D7BF] bg-[#FBF7F0] p-4">
      <p className="font-black">{displayName}</p>
      {address.map((line) => (
        <p key={line}>{line}</p>
      ))}
      {email ? <p className="mt-2">E-Mail: {email}</p> : null}
      {phone ? <p>Telefon: {phone}</p> : null}
    </div>
  );
}

function InfoCard({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <article className="rounded-2xl border border-[#E6D7BF] bg-[#FBF7F0] p-5">
      <h3 className="font-black">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-[#486581]">
        {text}
      </p>
    </article>
  );
}
