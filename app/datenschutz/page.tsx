import Link from "next/link";
import { ArrowLeft, Database, Mail, Server, ShieldCheck } from "lucide-react";
import {
  getGeneralEmail,
  getLegalAddress,
  getLegalDisplayName,
  getLegalSettings,
  getPrivacyEmail,
} from "@/lib/legal-settings";

export const dynamic = "force-dynamic";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[32px] border border-[#E8DED2] bg-white p-5 shadow-sm sm:p-7">
      <h2 className="text-2xl font-black tracking-tight text-[#102A43]">
        {title}
      </h2>
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
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#A75B28]" />
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
    <main className="min-h-screen bg-[#FBF7F0] text-[#102A43]">
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="inline-flex w-fit items-center gap-2 text-sm font-black text-[#12395F] transition hover:text-[#B5282D]"
        >
          <ArrowLeft className="h-4 w-4" />
          ZurÃ¼ck zur Startseite
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
                DatenschutzerklÃ¤rung
              </h1>

              <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-[#52616F] sm:text-base">
                Hier informieren wir Dich darÃ¼ber, welche personenbezogenen Daten
                bei der Nutzung von {settings.brand_name} verarbeitet werden.
              </p>
            </div>
          </div>
        </header>

        <Section title="1. Verantwortlicher">
          <p>Verantwortlich fÃ¼r die Datenverarbeitung auf dieser Website ist:</p>

          <div className="rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] p-4 text-[#102A43]">
            <p className="font-black">{displayName}</p>

            {address.length > 0 ? (
              <div className="mt-2 space-y-1">
                {address.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            ) : null}

            {generalEmail ? <p className="mt-2">E-Mail: {generalEmail}</p> : null}
            {settings.phone_primary ? (
              <p>Telefon: {settings.phone_primary}</p>
            ) : null}
          </div>

          {privacyEmail ? (
            <p>
              FÃ¼r Datenschutzanfragen erreichst Du uns unter:{" "}
              <a
                href={`mailto:${privacyEmail}`}
                className="font-black text-[#12395F] underline decoration-[#A75B28]/40 underline-offset-4"
              >
                {privacyEmail}
              </a>
            </p>
          ) : null}
        </Section>

        <Section title="2. Welche Daten wir verarbeiten">
          <p>
            Wenn Du Ã¼ber {settings.brand_name} eine Schulmaterialliste hochlÃ¤dst
            oder eine Anfrage absendest, kÃ¶nnen insbesondere folgende Daten
            verarbeitet werden:
          </p>

          <BulletList
            items={[
              "Name und Kontaktdaten, insbesondere E-Mail-Adresse und Telefonnummer",
              "Angaben zum Kind, zur Schule und zur Klasse, soweit Du sie freiwillig eingibst",
              "hochgeladene Schulmateriallisten als Foto, Screenshot oder PDF",
              "erkannte Listenpositionen, ProduktvorschlÃ¤ge und ausgewÃ¤hlte Paketpositionen",
              "technische Daten wie Zeitpunkt der Anfrage, Status der Bearbeitung und Systemereignisse",
            ]}
          />
        </Section>

        <Section title="3. Zwecke der Verarbeitung">
          <p>Wir verarbeiten die Daten, um:</p>

          <BulletList
            items={[
              "Deine hochgeladene Schulmaterialliste auszuwerten",
              "passende Schulmaterial-Produkte vorzubereiten oder vorzuschlagen",
              "Deinen persÃ¶nlichen Schulmaterial-Paketwunsch zu erstellen",
              "RÃ¼ckfragen zu Deiner Anfrage zu ermÃ¶glichen",
              "Dir Angebotslinks, Aktualisierungen oder BestÃ¤tigungen per E-Mail zu senden",
              "die Anfrage intern im Adminbereich nachvollziehbar zu bearbeiten",
            ]}
          />
        </Section>

        <Section title="4. Rechtsgrundlagen">
          <p>
            Die Verarbeitung erfolgt je nach Situation auf Grundlage vorvertraglicher
            MaÃŸnahmen bzw. Vertragsabwicklung, berechtigter Interessen an einer
            effizienten Bearbeitung Deiner Anfrage sowie Deiner freiwilligen
            Eingaben und Uploads.
          </p>

          <p>
            Soweit Du uns freiwillig zusÃ¤tzliche Angaben machst, nutzen wir diese
            nur zur Bearbeitung Deiner Schulmaterial-Anfrage.
          </p>
        </Section>

        <Section title="5. Uploads und Schulmateriallisten">
          <p>
            Hochgeladene Dateien kÃ¶nnen personenbezogene Informationen enthalten,
            etwa Namen, Schule, Klasse oder handschriftliche Notizen. Bitte lade
            nur Dateien hoch, die zur Bearbeitung Deiner Anfrage erforderlich sind.
          </p>

          <p>
            Die Dateien werden genutzt, um daraus erkennbare Materialpositionen
            und passende ProduktvorschlÃ¤ge abzuleiten. Eine darÃ¼ber hinausgehende
            Nutzung zu Werbezwecken erfolgt nicht.
          </p>
        </Section>

        <Section title="6. Eingesetzte Dienstleister">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] p-4">
              <div className="mb-2 flex items-center gap-2 font-black text-[#102A43]">
                <Server className="h-4 w-4 text-[#A75B28]" />
                Hosting
              </div>
              <p>{settings.hosting_provider || "Hosting-Anbieter"}</p>
            </div>

            <div className="rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] p-4">
              <div className="mb-2 flex items-center gap-2 font-black text-[#102A43]">
                <Database className="h-4 w-4 text-[#A75B28]" />
                Datenbank und Storage
              </div>
              <p>{settings.database_provider || "Datenbank-/Storage-Anbieter"}</p>
            </div>

            <div className="rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] p-4">
              <div className="mb-2 flex items-center gap-2 font-black text-[#102A43]">
                <ShieldCheck className="h-4 w-4 text-[#A75B28]" />
                KI-Auswertung
              </div>
              <p>{settings.ai_provider || "KI-Anbieter"}</p>
            </div>

            <div className="rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] p-4">
              <div className="mb-2 flex items-center gap-2 font-black text-[#102A43]">
                <Mail className="h-4 w-4 text-[#A75B28]" />
                E-Mail-Versand
              </div>
              <p>{settings.email_provider || "E-Mail-Anbieter"}</p>
            </div>
          </div>

          <p>
            Diese Dienstleister werden eingesetzt, um die Website bereitzustellen,
            Dateien zu speichern, Anfragen zu bearbeiten, KI-gestÃ¼tzte
            Auswertungen vorzunehmen und E-Mails zu versenden.
          </p>
        </Section>

        <Section title="7. KI-gestÃ¼tzte Auswertung">
          <p>
            FÃ¼r die automatische Analyse der hochgeladenen Schulmateriallisten
            kann ein KI-Dienst eingesetzt werden. Dabei werden die Inhalte der
            hochgeladenen Liste verarbeitet, um Materialpositionen wie Hefte,
            UmschlÃ¤ge, Stifte oder Ã¤hnliche Schulartikel zu erkennen.
          </p>

          <p>
            Die KI-Auswertung dient ausschlieÃŸlich der Vorbereitung Deines
            Paketwunsches. Unsichere oder nicht eindeutig erkannte Positionen
            werden durch unser Team manuell geprÃ¼ft.
          </p>
        </Section>

        <Section title="8. Speicherdauer">
          <p>
            Wir speichern personenbezogene Daten und hochgeladene Dateien nur so
            lange, wie sie fÃ¼r die Bearbeitung Deiner Anfrage, gesetzliche
            Pflichten oder interne Nachvollziehbarkeit erforderlich sind.
          </p>

          <p>
            Test- oder nicht mehr benÃ¶tigte Daten kÃ¶nnen im Adminbereich gelÃ¶scht
            werden. Eine automatische LÃ¶schfrist kann spÃ¤ter technisch ergÃ¤nzt
            werden.
          </p>
        </Section>

        <Section title="9. Keine Marketing-Cookies und kein Tracking">
          <p>
            Nach aktuellem Stand verwendet {settings.brand_name} keine
            Marketing-Cookies und kein Google Analytics. Die Google Search
            Console kann zur technischen Verifizierung und Auffindbarkeit der
            Website genutzt werden, setzt aber auf dieser Website keine
            Marketing-Cookies fÃ¼r Besucher.
          </p>
        </Section>

        <Section title="10. Deine Rechte">
          <p>Du hast im Rahmen der gesetzlichen Vorgaben insbesondere das Recht auf:</p>

          <BulletList
            items={[
              "Auskunft Ã¼ber die zu Deiner Person gespeicherten Daten",
              "Berichtigung unrichtiger Daten",
              "LÃ¶schung von Daten, sofern keine gesetzlichen Aufbewahrungspflichten entgegenstehen",
              "EinschrÃ¤nkung der Verarbeitung",
              "Widerspruch gegen bestimmte Verarbeitungen",
              "DatenÃ¼bertragbarkeit, soweit anwendbar",
              "Beschwerde bei einer zustÃ¤ndigen DatenschutzaufsichtsbehÃ¶rde",
            ]}
          />

          {privacyEmail ? (
            <p>
              Zur AusÃ¼bung Deiner Rechte kannst Du uns unter{" "}
              <a
                href={`mailto:${privacyEmail}`}
                className="font-black text-[#12395F] underline decoration-[#A75B28]/40 underline-offset-4"
              >
                {privacyEmail}
              </a>{" "}
              kontaktieren.
            </p>
          ) : null}
        </Section>

        <Section title="11. Ã„nderungen dieser DatenschutzerklÃ¤rung">
          <p>
            Wir kÃ¶nnen diese DatenschutzerklÃ¤rung anpassen, wenn sich die
            Website, eingesetzte Dienste oder rechtliche Anforderungen Ã¤ndern.
            Es gilt die jeweils auf dieser Seite verÃ¶ffentlichte Fassung.
          </p>
        </Section>

        <section className="rounded-[28px] border border-[#F1D1A8] bg-[#FFF8EE] p-5 text-sm font-semibold leading-6 text-[#A75B28]">
          <p>
            Hinweis: Diese DatenschutzerklÃ¤rung ist eine technische und
            inhaltliche Vorlage auf Basis der aktuellen Projektfunktionen. Sie
            ersetzt keine individuelle rechtliche PrÃ¼fung.
          </p>
        </section>
      </section>
    </main>
  );
}