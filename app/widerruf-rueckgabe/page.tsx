import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Widerruf & Rückgabe | Handzettel-Schulen.de",
  description:
    "Informationen zu Widerruf, Rückgabe, Rücksendekosten und Reklamationen bei Handzettel-Schulen.de.",
  alternates: {
    canonical: "https://www.handzettel-schulen.de/widerruf-rueckgabe",
  },
  robots: {
    index: true,
    follow: true,
  },
};

const companyName = "Handzettel-Schulen.de / Bürotechnik Schwalm";
const contactEmail = "kontakt@handzettel-schulen.de";
const siteUrl = "https://www.handzettel-schulen.de";

export default function WiderrufRueckgabePage() {
  return (
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
          <span className="text-[#102A43]">Widerruf & Rückgabe</span>
        </nav>

        <header className="rounded-[28px] border border-[#E6D7BF] bg-white p-6 shadow-sm sm:p-8">
          <p className="mb-3 text-sm font-black uppercase tracking-[0.18em] text-[#D97706]">
            Kundeninformation
          </p>
          <h1 className="text-3xl font-black tracking-tight text-[#102A43] sm:text-4xl">
            Widerruf & Rückgabe
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-[#486581]">
            Auf dieser Seite findest Du Informationen zum Widerrufsrecht, zur
            Rückgabe von Artikeln, zu Rücksendekosten und zur Reklamation
            mangelhafter Produkte.
          </p>
        </header>

        <section className="rounded-[28px] border border-[#E6D7BF] bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-2xl font-black text-[#102A43]">
            Widerrufsbelehrung
          </h2>

          <div className="mt-6 space-y-6 text-sm leading-7 text-[#243B53] sm:text-base">
            <div>
              <h3 className="font-black text-[#102A43]">Widerrufsrecht</h3>
              <p className="mt-2">
                Verbraucher haben das Recht, binnen 14 Tagen ohne Angabe von
                Gründen diesen Vertrag zu widerrufen.
              </p>
              <p className="mt-2">
                Die Widerrufsfrist beträgt 14 Tage ab dem Tag, an dem Du oder
                ein von Dir benannter Dritter, der nicht Beförderer ist, die Ware
                in Besitz genommen hast bzw. hat.
              </p>
            </div>

            <div>
              <h3 className="font-black text-[#102A43]">
                Ausübung des Widerrufs
              </h3>
              <p className="mt-2">
                Um Dein Widerrufsrecht auszuüben, musst Du uns mittels einer
                eindeutigen Erklärung, zum Beispiel per E-Mail oder Brief, über
                Deinen Entschluss informieren, diesen Vertrag zu widerrufen.
              </p>

              <div className="mt-4 rounded-2xl border border-[#E6D7BF] bg-[#FBF7F0] p-4">
                <p className="font-black text-[#102A43]">{companyName}</p>
                <p className="mt-1">
                  E-Mail:{" "}
                  <a
                    href={`mailto:${contactEmail}`}
                    className="font-bold text-[#B45309] underline underline-offset-4"
                  >
                    {contactEmail}
                  </a>
                </p>
                <p className="mt-1">
                  Weitere Anbieter- und Kontaktdaten findest Du im{" "}
                  <Link
                    href="/impressum"
                    className="font-bold text-[#B45309] underline underline-offset-4"
                  >
                    Impressum
                  </Link>
                  .
                </p>
              </div>

              <p className="mt-4">
                Zur Wahrung der Widerrufsfrist reicht es aus, dass Du die
                Mitteilung über die Ausübung des Widerrufsrechts vor Ablauf der
                Widerrufsfrist absendest.
              </p>
            </div>

            <div>
              <h3 className="font-black text-[#102A43]">
                Folgen des Widerrufs
              </h3>
              <p className="mt-2">
                Wenn Du diesen Vertrag widerrufst, erstatten wir Dir alle
                Zahlungen, die wir von Dir erhalten haben, einschließlich der
                Lieferkosten. Ausgenommen sind zusätzliche Kosten, die daraus
                entstehen, dass Du eine andere Art der Lieferung als die von uns
                angebotene günstigste Standardlieferung gewählt hast.
              </p>
              <p className="mt-2">
                Die Rückzahlung erfolgt spätestens binnen 14 Tagen ab dem Tag,
                an dem die Mitteilung über Deinen Widerruf bei uns eingegangen
                ist. Für die Rückzahlung verwenden wir grundsätzlich dasselbe
                Zahlungsmittel, das Du bei der ursprünglichen Transaktion
                eingesetzt hast, es sei denn, mit Dir wurde ausdrücklich etwas
                anderes vereinbart.
              </p>
              <p className="mt-2">
                Wir können die Rückzahlung verweigern, bis wir die Waren wieder
                zurückerhalten haben oder bis Du den Nachweis erbracht hast, dass
                Du die Waren zurückgesandt hast, je nachdem, welches der frühere
                Zeitpunkt ist.
              </p>
            </div>

            <div>
              <h3 className="font-black text-[#102A43]">Rücksendung der Ware</h3>
              <p className="mt-2">
                Du hast die Waren unverzüglich und spätestens binnen 14 Tagen ab
                dem Tag, an dem Du uns über den Widerruf dieses Vertrags
                unterrichtest, an uns zurückzusenden oder zu übergeben. Die Frist
                ist gewahrt, wenn Du die Waren vor Ablauf der Frist von 14 Tagen
                absendest.
              </p>
              <p className="mt-2">
                Du trägst die unmittelbaren Kosten der Rücksendung der Waren,
                sofern nicht ausdrücklich etwas anderes vereinbart wurde oder die
                Ware mangelhaft ist.
              </p>
            </div>

            <div>
              <h3 className="font-black text-[#102A43]">
                Wertersatz bei Gebrauchsspuren
              </h3>
              <p className="mt-2">
                Du musst für einen etwaigen Wertverlust der Waren nur aufkommen,
                wenn dieser Wertverlust auf einen zur Prüfung der Beschaffenheit,
                Eigenschaften und Funktionsweise der Waren nicht notwendigen
                Umgang mit ihnen zurückzuführen ist.
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-[#E6D7BF] bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-2xl font-black text-[#102A43]">
            Rückgabe und Reklamation
          </h2>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <article className="rounded-2xl border border-[#E6D7BF] bg-[#FBF7F0] p-5">
              <h3 className="font-black text-[#102A43]">
                Rückgabe einwandfreier Produkte
              </h3>
              <p className="mt-2 text-sm leading-6 text-[#486581]">
                Einwandfreie Produkte können im Rahmen des gesetzlichen
                Widerrufsrechts innerhalb der Widerrufsfrist zurückgegeben
                werden.
              </p>
            </article>

            <article className="rounded-2xl border border-[#E6D7BF] bg-[#FBF7F0] p-5">
              <h3 className="font-black text-[#102A43]">
                Mangelhafte oder falsche Produkte
              </h3>
              <p className="mt-2 text-sm leading-6 text-[#486581]">
                Sollte ein Artikel beschädigt, mangelhaft oder falsch geliefert
                worden sein, kontaktiere uns bitte möglichst zeitnah mit
                Bestellinformationen und, wenn möglich, einem Foto.
              </p>
            </article>

            <article className="rounded-2xl border border-[#E6D7BF] bg-[#FBF7F0] p-5">
              <h3 className="font-black text-[#102A43]">Rücksendekosten</h3>
              <p className="mt-2 text-sm leading-6 text-[#486581]">
                Bei Widerruf einwandfreier Ware trägt der Kunde die unmittelbaren
                Kosten der Rücksendung. Bei berechtigten Reklamationen wegen
                mangelhafter oder falsch gelieferter Ware klären wir die weitere
                Abwicklung individuell.
              </p>
            </article>

            <article className="rounded-2xl border border-[#E6D7BF] bg-[#FBF7F0] p-5">
              <h3 className="font-black text-[#102A43]">Umtausch</h3>
              <p className="mt-2 text-sm leading-6 text-[#486581]">
                Einen automatischen Umtausch bieten wir derzeit nicht als
                separaten Service an. Du kannst einen Artikel im Rahmen der
                geltenden Bedingungen zurückgeben und bei Bedarf neu bestellen.
              </p>
            </article>
          </div>
        </section>

        <section className="rounded-[28px] border border-[#E6D7BF] bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-2xl font-black text-[#102A43]">
            Muster-Widerrufsformular
          </h2>

          <p className="mt-4 text-sm leading-7 text-[#486581] sm:text-base">
            Wenn Du den Vertrag widerrufen möchtest, kannst Du dieses Formular
            verwenden. Die Verwendung ist nicht vorgeschrieben.
          </p>

          <div className="mt-6 rounded-2xl border border-dashed border-[#C7BBA7] bg-[#FBF7F0] p-5 text-sm leading-7 text-[#243B53]">
            <p>An:</p>
            <p className="font-bold">{companyName}</p>
            <p>
              E-Mail:{" "}
              <a
                href={`mailto:${contactEmail}`}
                className="font-bold text-[#B45309] underline underline-offset-4"
              >
                {contactEmail}
              </a>
            </p>

            <p className="mt-5">
              Hiermit widerrufe ich den von mir abgeschlossenen Vertrag über den
              Kauf der folgenden Waren:
            </p>

            <div className="mt-4 space-y-3">
              <p>Ware(n): __________________________________________</p>
              <p>Bestellt am: ______________________________________</p>
              <p>Erhalten am: ______________________________________</p>
              <p>Name des Kunden: _________________________________</p>
              <p>Anschrift des Kunden: _____________________________</p>
              <p>Datum: ___________________________________________</p>
              <p>
                Unterschrift des Kunden: ___________________________
                <br />
                <span className="text-xs text-[#627D98]">
                  nur bei Mitteilung auf Papier
                </span>
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-[#E6D7BF] bg-[#102A43] p-6 text-white shadow-sm sm:p-8">
          <h2 className="text-2xl font-black">Kontakt zur Rückgabe</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-[#D9E2EC] sm:text-base">
            Bitte sende Rückgabe- oder Reklamationsanfragen mit Bestellnummer,
            Name und kurzer Beschreibung an:
          </p>
          <a
            href={`mailto:${contactEmail}`}
            className="mt-5 inline-flex rounded-full bg-[#D97706] px-5 py-3 text-sm font-black text-white shadow-sm hover:bg-[#B45309]"
          >
            {contactEmail}
          </a>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E6D7BF] pt-6 text-sm text-[#486581]">
          <p>Stand: Juni 2026</p>
          <div className="flex flex-wrap gap-4">
            <Link href="/impressum" className="hover:text-[#D97706]">
              Impressum
            </Link>
            <Link href="/datenschutz" className="hover:text-[#D97706]">
              Datenschutz
            </Link>
            <Link href="/shop" className="hover:text-[#D97706]">
              Zurück zum Shop
            </Link>
          </div>
        </footer>
      </section>
    </main>
  );
}