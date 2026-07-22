import type { Metadata } from "next";
import Link from "next/link";
import {
  Cookie,
  Database,
  LockKeyhole,
  Mail,
  Server,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
} from "lucide-react";
import LegalFooter from "@/components/LegalFooter";
import {
  getGeneralEmail,
  getLegalAddress,
  getLegalDisplayName,
  getLegalSettings,
  getPrivacyEmail,
} from "@/lib/legal-settings";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Datenschutz | Handzettel-Schulen.de",
  description:
    "Informationen zur Verarbeitung personenbezogener Daten bei Handzettel-Schulen.de, im Schulmaterial-Service und im Onlineshop.",
  alternates: {
    canonical: "https://www.handzettel-schulen.de/datenschutz",
  },
  robots: {
    index: true,
    follow: true,
  },
};

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[32px] border border-[#E8DED2] bg-white p-5 shadow-sm sm:p-7">
      <div className="flex items-center gap-3">
        {icon ? (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#FBF7F0] text-[#A75B28]">
            {icon}
          </div>
        ) : null}
        <h2 className="text-2xl font-black tracking-tight text-[#102A43]">
          {title}
        </h2>
      </div>

      <div className="mt-4 space-y-4 text-sm font-semibold leading-7 text-[#52616F]">
        {children}
      </div>
    </section>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item} className="flex gap-2">
          <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#A75B28]" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function DatenschutzPage() {
  const settings = await getLegalSettings();
  const displayName = getLegalDisplayName(settings);
  const address = getLegalAddress(settings);
  const privacyEmail = getPrivacyEmail(settings);
  const generalEmail = getGeneralEmail(settings);

  return (
    <>
      <main className="min-h-screen bg-[#FBF7F0] text-[#102A43]">
        <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="inline-flex w-fit items-center gap-2 text-sm font-black text-[#12395F] transition hover:text-[#B5282D]"
          >
            ← Zurück zur Startseite
          </Link>

          <header className="rounded-[34px] border border-[#E8DED2] bg-white p-5 shadow-[0_18px_45px_rgba(16,42,67,0.10)] sm:p-7">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#FBF7F0] text-[#A75B28]">
                <ShieldCheck className="h-6 w-6" />
              </div>

              <div>
                <p className="mb-3 inline-flex rounded-full bg-[#FBF7F0] px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-[#A75B28]">
                  Datenschutz
                </p>

                <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
                  Datenschutzerklärung
                </h1>

                <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-[#52616F] sm:text-base">
                  Hier informieren wir Dich darüber, welche personenbezogenen
                  Daten bei der Nutzung von {settings.brand_name}, beim
                  Einreichen einer Schulmaterialliste und beim Einkauf im Shop
                  verarbeitet werden.
                </p>

                <p className="mt-3 text-xs font-bold uppercase tracking-[0.12em] text-[#8A5A2B]">
                  Stand: 22. Juli 2026
                </p>
              </div>
            </div>
          </header>

          <Section
            title="1. Verantwortlicher"
            icon={<LockKeyhole className="h-5 w-5" />}
          >
            <p>
              Verantwortlich für die Datenverarbeitung auf dieser Website ist:
            </p>

            <div className="rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] p-4 text-[#102A43]">
              <p className="font-black">{displayName}</p>

              {address.length > 0 ? (
                <div className="mt-2 space-y-1">
                  {address.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                </div>
              ) : null}

              {generalEmail ? (
                <p className="mt-2">E-Mail: {generalEmail}</p>
              ) : null}

              {settings.phone_primary ? (
                <p>Telefon: {settings.phone_primary}</p>
              ) : null}
            </div>

            {privacyEmail ? (
              <p>
                Datenschutzanfragen kannst Du an{" "}
                <a
                  href={`mailto:${privacyEmail}`}
                  className="font-black text-[#12395F] underline decoration-[#A75B28]/40 underline-offset-4"
                >
                  {privacyEmail}
                </a>{" "}
                richten.
              </p>
            ) : null}
          </Section>

          <Section
            title="2. Welche Daten wir verarbeiten"
            icon={<Database className="h-5 w-5" />}
          >
            <BulletList
              items={[
                "Stammdaten und Kontaktdaten, insbesondere Name, E-Mail-Adresse, Telefonnummer und Anschrift",
                "Angaben zum Kind, zur Schule und zur Klasse, soweit Du sie im Schulmaterial-Service eingibst",
                "hochgeladene Schulmateriallisten als Foto, Screenshot oder PDF",
                "erkannte Listenpositionen, Produktvorschläge, Paketpositionen und Bearbeitungsstatus",
                "Shop-, Warenkorb-, Bestell-, Rechnungs-, Zahlungs- und Versandinformationen",
                "Kommunikationsinhalte, Rückfragen und freiwillige Nachrichten",
                "technische Daten wie Zeitpunkt, aufgerufene Seite, Browserinformationen, Sicherheits- und Fehlerprotokolle",
              ]}
            />
          </Section>

          <Section
            title="3. Zwecke und Rechtsgrundlagen"
            icon={<ShieldCheck className="h-5 w-5" />}
          >
            <p>Wir verarbeiten Daten insbesondere, um:</p>

            <BulletList
              items={[
                "Schulmateriallisten auszuwerten und einen Paketwunsch vorzubereiten",
                "Produkte im Shop bereitzustellen und Warenkörbe zu verwalten",
                "Bestellungen, Rechnungen, Zahlungen, Abholung und Versand abzuwickeln",
                "Rückfragen, Reklamationen, Widerrufe und Kundenservice zu bearbeiten",
                "gesetzliche Aufbewahrungs- und Nachweispflichten zu erfüllen",
                "die Website sicher, stabil und nachvollziehbar zu betreiben",
              ]}
            />

            <p>
              Die Verarbeitung erfolgt je nach Vorgang insbesondere zur
              Durchführung vorvertraglicher Maßnahmen und Verträge, zur
              Erfüllung rechtlicher Verpflichtungen sowie auf Grundlage
              berechtigter Interessen an einem sicheren und effizienten Betrieb.
              Freiwillige Angaben verarbeiten wir nur für den erkennbaren Zweck.
            </p>
          </Section>

          <Section
            title="4. Schulmateriallisten und KI-gestützte Auswertung"
            icon={<Sparkles className="h-5 w-5" />}
          >
            <p>
              Hochgeladene Dateien können Namen, Schule, Klasse,
              handschriftliche Notizen oder andere personenbezogene Angaben
              enthalten. Lade deshalb nur Inhalte hoch, die für die Bearbeitung
              Deiner Anfrage erforderlich sind.
            </p>

            <p>
              Zur automatischen Erkennung von Materialpositionen kann der in den
              rechtlichen Einstellungen genannte KI-Dienst eingesetzt werden
              {settings.ai_provider ? ` (${settings.ai_provider})` : ""}. Die
              Auswertung dient ausschließlich der Vorbereitung des
              Paketwunsches. Unsichere Treffer können durch unser Team geprüft
              werden.
            </p>
          </Section>

          <Section
            title="5. Shop, Warenkorb und Bestellabwicklung"
            icon={<ShoppingCart className="h-5 w-5" />}
          >
            <p>
              Der Warenkorb wird lokal im Browser gespeichert, damit ausgewählte
              Artikel beim Seitenwechsel erhalten bleiben. Beim Checkout
              verarbeiten wir die von Dir eingegebenen Rechnungs-, Kontakt- und
              gegebenenfalls Lieferdaten.
            </p>

            <p>
              Vor dem verbindlichen Abschluss werden Artikel, Mengen,
              Preisnachlässe, Versandkosten und Gesamtbetrag angezeigt.
              Zahlungsbezogene Daten werden abhängig von der gewählten
              Zahlungsart verarbeitet. Bei PayPal erfolgt die weitere
              Zahlungsabwicklung über PayPal. Bei Überweisung verarbeiten die
              beteiligten Banken die Zahlungsdaten.
            </p>

            <p>
              Wir benötigen keine vollständigen Kreditkarten- oder
              Onlinebanking-Zugangsdaten und speichern solche Daten nicht in
              unserem Shop.
            </p>
          </Section>

          <Section
            title="6. Eingesetzte Dienstleister"
            icon={<Server className="h-5 w-5" />}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <ProviderCard
                title="Hosting"
                value={settings.hosting_provider || "Hosting-Anbieter"}
              />
              <ProviderCard
                title="Datenbank und Dateispeicher"
                value={
                  settings.database_provider ||
                  "Datenbank- und Storage-Anbieter"
                }
              />
              <ProviderCard
                title="KI-Auswertung"
                value={settings.ai_provider || "KI-Anbieter"}
              />
              <ProviderCard
                title="E-Mail-Versand"
                value={settings.email_provider || "E-Mail-Anbieter"}
              />
            </div>

            <p>
              Dienstleister erhalten nur die Daten, die für ihre jeweilige
              Aufgabe erforderlich sind. Soweit gesetzlich erforderlich,
              werden entsprechende Vereinbarungen zur Auftragsverarbeitung
              eingesetzt.
            </p>
          </Section>

          <Section
            title="7. Cookies und lokale Speicherung"
            icon={<Cookie className="h-5 w-5" />}
          >
            <p>
              Wir verwenden technisch notwendige Funktionen und lokale
              Browser-Speicherung, insbesondere für die Cookie-Auswahl und den
              Warenkorb. Ohne diese Speicherung würden zentrale
              Shop-Funktionen nicht zuverlässig arbeiten.
            </p>

            <p>
              Analyse-, Marketing- oder externe Mediendienste werden nur
              aktiviert, wenn sie tatsächlich eingebunden sind und eine
              erforderliche Einwilligung vorliegt. Die Auswahl kannst Du über
              den dauerhaft sichtbaren Button „Cookies“ ändern.
            </p>

            <Link
              href="/cookies"
              className="inline-flex font-black text-[#12395F] underline decoration-[#A75B28]/40 underline-offset-4"
            >
              Cookie-Hinweise öffnen
            </Link>
          </Section>

          <Section
            title="8. Speicherdauer"
            icon={<Database className="h-5 w-5" />}
          >
            <p>
              Wir speichern personenbezogene Daten nur so lange, wie sie für
              Anfrage, Bestellung, Vertrag, Kundenservice, Sicherheit und
              gesetzliche Aufbewahrungspflichten erforderlich sind.
            </p>

            <p>
              Rechnungs- und steuerlich relevante Daten können aufgrund
              gesetzlicher Pflichten länger aufbewahrt werden. Nicht mehr
              benötigte Test- oder Arbeitsdaten werden gelöscht oder
              anonymisiert, soweit keine Pflicht zur weiteren Speicherung
              besteht.
            </p>
          </Section>

          <Section title="9. Deine Rechte">
            <BulletList
              items={[
                "Auskunft über die zu Deiner Person gespeicherten Daten",
                "Berichtigung unrichtiger oder unvollständiger Daten",
                "Löschung, soweit keine gesetzlichen Pflichten entgegenstehen",
                "Einschränkung der Verarbeitung",
                "Widerspruch gegen bestimmte Verarbeitungen",
                "Datenübertragbarkeit, soweit anwendbar",
                "Widerruf erteilter Einwilligungen mit Wirkung für die Zukunft",
                "Beschwerde bei einer zuständigen Datenschutzaufsichtsbehörde",
              ]}
            />

            {privacyEmail ? (
              <p>
                Zur Ausübung Deiner Rechte erreichst Du uns unter{" "}
                <a
                  href={`mailto:${privacyEmail}`}
                  className="font-black text-[#12395F] underline decoration-[#A75B28]/40 underline-offset-4"
                >
                  {privacyEmail}
                </a>
                .
              </p>
            ) : null}
          </Section>

          <Section
            title="10. Änderungen dieser Datenschutzerklärung"
            icon={<Mail className="h-5 w-5" />}
          >
            <p>
              Wir passen diese Datenschutzerklärung an, wenn sich Funktionen,
              Dienstleister oder rechtliche Anforderungen ändern. Es gilt die
              jeweils auf dieser Seite veröffentlichte Fassung.
            </p>
          </Section>

          <section className="rounded-[28px] border border-[#F1D1A8] bg-[#FFF8EE] p-5 text-sm font-semibold leading-6 text-[#A75B28]">
            <p>
              Hinweis: Diese Seite bildet die aktuell bekannten technischen
              Abläufe ab und ersetzt keine individuelle rechtliche Beratung.
            </p>
          </section>
        </section>
      </main>

      <LegalFooter />
    </>
  );
}

function ProviderCard({
  title,
  value,
}: {
  title: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] p-4">
      <p className="font-black text-[#102A43]">{title}</p>
      <p className="mt-1">{value}</p>
    </div>
  );
}
