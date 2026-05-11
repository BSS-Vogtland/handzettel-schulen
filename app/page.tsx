import Image from "next/image";
import type { ReactNode } from "react";
import UploadForm from "@/components/UploadForm";
import LegalFooter from "@/components/LegalFooter";
import {
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  GraduationCap,
  Heart,
  HelpCircle,
  Menu,
  MessageCircle,
  PackageCheck,
  Play,
  School,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  UsersRound,
  Video,
} from "lucide-react";

const videos = [
  {
    title: "LernSax",
    text: "So lädst Du Deine Schulmaterialliste aus LernSax herunter und reichst sie bei Handzettel-Schulen.de ein.",
  },
  {
    title: "Thüringer Schulportal",
    text: "So speicherst Du Deine Materialliste aus dem Thüringer Schulportal und lädst sie bequem hoch.",
  },
  {
    title: "Liste fotografieren",
    text: "So fotografierst Du Deinen Handzettel oder Deine Papierliste sauber mit dem Smartphone.",
  },
];

const faqs = [
  {
    question: "Bestelle ich automatisch, wenn ich meine Liste hochlade?",
    answer:
      "Nein. Mit dem Upload bestellst Du noch nichts. Du erhältst zuerst einen vorbereiteten Paketwunsch, kannst alles prüfen und sendest ihn erst danach bewusst ab.",
  },
  {
    question: "Was passiert mit unklaren Artikeln?",
    answer:
      "Unklare Artikel werden nicht einfach geraten. Wenn kein sicherer Treffer vorhanden ist, prüft Handzettel-Schulen.de die Position persönlich.",
  },
  {
    question: "Welche Dateien kann ich hochladen?",
    answer:
      "Du kannst Deine Schulmaterialliste als Foto, Screenshot, WEBP oder PDF hochladen. Auch ein fotografierter Handzettel der Schule ist möglich.",
  },
  {
    question:
      "Kann ich auch eine Liste aus LernSax oder dem Thüringer Schulportal nutzen?",
    answer:
      "Ja. Du kannst Deine Liste aus LernSax oder dem Thüringer Schulportal speichern und anschließend bei Handzettel-Schulen.de hochladen.",
  },
  {
    question: "Wann wird mein Schulpaket vorbereitet?",
    answer:
      "Nachdem Du Deinen Paketwunsch geprüft und abgesendet hast, wird er final geprüft. Danach erhältst Du die weiteren Informationen zur Rechnung, Zahlung und Übergabe.",
  },
];

const structuredData = {
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  name: "Handzettel-Schulen.de",
  url: "https://www.handzettel-schulen.de",
  logo: "https://www.handzettel-schulen.de/handzettel-logo.png",
  description:
    "Schulmaterialliste oder Handzettel der Schule online hochladen und persönlichen Schulmaterial-Paketwunsch vorbereiten lassen.",
  brand: {
    "@type": "Brand",
    name: "Handzettel-Schulen.de",
  },
  areaServed: {
    "@type": "Country",
    name: "Deutschland",
  },
  makesOffer: {
    "@type": "Offer",
    name: "Schulmaterialliste hochladen und Schulpaket vorbereiten lassen",
    description:
      "Eltern laden ihre Schulmaterialliste als Foto, Screenshot oder PDF hoch. Handzettel-Schulen.de bereitet daraus einen persönlichen Paketwunsch vor.",
  },
};

export default function Home() {
  return (
    <main className="min-h-screen bg-[#FBF7F0] text-[#102A43]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData),
        }}
      />

      <header className="sticky top-0 z-40 border-b border-[#E8DED2] bg-[#FBF7F0]/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3 lg:px-8">
          <div className="flex items-center gap-4">
            <Image
              src="/handzettel-logo.png"
              alt="Handzettel-Schulen.de Logo"
              width={96}
              height={96}
              className="h-20 w-20 object-contain sm:h-24 sm:w-24"
              priority
            />

            <div>
              <div className="font-serif text-2xl font-black tracking-tight text-[#111827] sm:text-3xl">
                Handzettel-Schulen.de
              </div>
              <div className="hidden text-sm font-semibold text-[#A75B28] sm:block">
                Materialliste hochladen. Schulpaket vorbereiten lassen.
              </div>
            </div>
          </div>

          <nav className="hidden items-center gap-8 text-sm font-semibold text-[#102A43] lg:flex">
            <a href="#ablauf" className="transition hover:text-[#B5282D]">
              So funktioniert’s
            </a>
            <a href="#vertrauen" className="transition hover:text-[#B5282D]">
              Sicherheit
            </a>
            <a href="#videos" className="transition hover:text-[#B5282D]">
              Hilfe & Videos
            </a>
            <a href="#faq" className="transition hover:text-[#B5282D]">
              Fragen
            </a>
            <a href="#upload" className="transition hover:text-[#B5282D]">
              Upload
            </a>
          </nav>

          <div className="hidden items-center gap-3 lg:flex">
            <a
              href="#upload"
              className="rounded-xl bg-[#12395F] px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#0D2D4C]"
            >
              Liste hochladen
            </a>
          </div>

          <button
            type="button"
            aria-label="Menü öffnen"
            className="rounded-xl border border-[#D8C8B8] bg-white p-2 lg:hidden"
          >
            <Menu className="h-6 w-6" />
          </button>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl gap-10 px-5 pb-12 pt-10 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:pb-20 lg:pt-16">
        <div className="flex flex-col justify-center">
          <div className="mb-5 inline-flex w-fit items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[#A75B28] shadow-sm">
            <Heart className="h-4 w-4" />
            Für Eltern, die Schulmaterial stressfrei vorbereiten möchten
          </div>

          <h1 className="max-w-3xl font-serif text-4xl font-black leading-[1.05] tracking-tight text-[#102A43] sm:text-5xl lg:text-6xl">
            Schulmaterialliste hochladen.
            <span className="block text-[#B5282D]">
              Schulpaket vorbereiten lassen.
            </span>
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-8 text-[#40566D]">
            Du lädst den Handzettel oder die Materialliste der Schule hoch. Wir
            erkennen Hefte, Umschläge, Lineaturen, Farben und Formate und
            bereiten daraus Deinen persönlichen Paketwunsch vor.
          </p>

          <div className="mt-6 rounded-[28px] border border-[#F1D1A8] bg-[#FFF8EE] p-5 text-[#A75B28]">
            <p className="font-black text-[#102A43]">
              Wichtig: Mit dem Upload bestellst Du noch nichts.
            </p>
            <p className="mt-2 text-sm font-semibold leading-6">
              Du bekommst zuerst einen vorbereiteten Paketwunsch, kannst Artikel
              prüfen, entfernen oder ergänzen und sendest ihn erst danach bewusst
              ab.
            </p>
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a
              href="#upload"
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#12395F] px-6 py-4 text-base font-bold text-white shadow-lg shadow-[#12395F]/15 transition hover:-translate-y-0.5 hover:bg-[#0D2D4C]"
            >
              <UploadCloud className="h-5 w-5" />
              Liste jetzt hochladen
            </a>

            <a
              href="#ablauf"
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#D8C8B8] bg-white px-6 py-4 text-base font-bold text-[#102A43] shadow-sm transition hover:-translate-y-0.5 hover:border-[#B5282D]"
            >
              So funktioniert es
              <ArrowRight className="h-5 w-5" />
            </a>
          </div>

          <div className="mt-8 grid gap-3 text-sm font-semibold text-[#40566D] sm:grid-cols-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-[#12395F]" />
              Keine automatische Bestellung
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-[#2F7D50]" />
              Persönlich geprüft
            </div>
            <div className="flex items-center gap-2">
              <Heart className="h-5 w-5 text-[#B5282D]" />
              Für Eltern gemacht
            </div>
          </div>

          <div className="mt-10 hidden max-w-xl rounded-[2rem] bg-white/70 p-5 ring-1 ring-[#E8DED2] lg:block">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#FFF2E6] text-[#A75B28]">
                <PackageCheck className="h-6 w-6" />
              </div>
              <div>
                <h2 className="font-black text-[#102A43]">
                  Kein Rätselraten bei Lineatur, Farbe oder Format.
                </h2>
                <p className="mt-1 text-sm leading-6 text-[#40566D]">
                  Sichere Treffer werden vorbereitet. Unsichere Positionen
                  werden persönlich geprüft, statt einfach falsch vorgeschlagen.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div id="upload">
          <UploadForm />
        </div>
      </section>

      <section className="border-y border-[#E8DED2] bg-white/70 px-5 py-10 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-3">
          <TrustCard
            icon={<BookOpenCheck className="h-6 w-6" />}
            title="Handzettel einfach hochladen"
            text="Ob Schulhandzettel, Materialliste, Screenshot oder PDF — Du reichst Deine Liste bequem online ein."
          />
          <TrustCard
            icon={<Sparkles className="h-6 w-6" />}
            title="Passende Produkte vorbereiten"
            text="Sichere Treffer werden in Deinen Paketwunsch gelegt. Unklare Artikel werden nicht geraten, sondern geprüft."
          />
          <TrustCard
            icon={<School className="h-6 w-6" />}
            title="Erst prüfen, dann absenden"
            text="Du entscheidest selbst, wann Du Deinen Paketwunsch absendest. Vorher ist nichts automatisch bestellt."
          />
        </div>
      </section>

      <section className="bg-[#FBF7F0] px-5 py-14 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-8 rounded-[36px] border border-[#E8DED2] bg-white p-6 shadow-sm md:grid-cols-[0.9fr_1.1fr] md:p-8">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.22em] text-[#A75B28]">
              Kennst Du das?
            </p>
            <h2 className="mt-3 font-serif text-3xl font-black text-[#102A43]">
              A5, Lineatur 1, 8f, Umschlag blau, Umschlag rot …
            </h2>
            <p className="mt-4 text-sm leading-7 text-[#40566D]">
              Viele Materiallisten wirken auf den ersten Blick einfach. Im Laden
              wird es dann doch kompliziert: falsches Format, falsche Lineatur,
              falsche Farbe oder ein Artikel fehlt. Genau dafür gibt es
              Handzettel-Schulen.de.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Benefit
              title="Weniger Fehlkäufe"
              text="Produkte werden nach Format, Farbe, Lineatur und Bezeichnung geprüft."
            />
            <Benefit
              title="Weniger Einkaufsstress"
              text="Du musst nicht selbst jede einzelne Position im Laden suchen."
            />
            <Benefit
              title="Persönliche Prüfung"
              text="Was nicht sicher erkannt wird, landet nicht blind im Paket."
            />
            <Benefit
              title="Klarer Paketwunsch"
              text="Du prüfst online, was vorbereitet wurde, und sendest es bewusst ab."
            />
          </div>
        </div>
      </section>

      <section
        id="ablauf"
        className="border-t border-[#E8DED2] bg-white px-5 py-14 lg:px-8"
      >
        <div className="mx-auto max-w-7xl">
          <p className="text-center text-sm font-black uppercase tracking-[0.22em] text-[#A75B28]">
            So funktioniert’s
          </p>

          <h2 className="mx-auto mt-3 max-w-2xl text-center font-serif text-3xl font-black text-[#102A43]">
            Aus Deiner Materialliste wird ein vorbereiteter Paketwunsch.
          </h2>

          <div className="mt-10 grid gap-5 md:grid-cols-3">
            <Step
              number="1"
              title="Liste hochladen"
              text="Du lädst die Schulmaterialliste als PDF, Foto oder Screenshot hoch. Mit dem Upload bestellst Du noch nichts."
            />
            <Step
              number="2"
              title="Paketwunsch prüfen"
              text="Sichere Produkte werden vorbereitet. Offene oder unklare Positionen kannst Du ergänzen oder persönlich prüfen lassen."
            />
            <Step
              number="3"
              title="Bewusst absenden"
              text="Erst wenn Du Deinen Paketwunsch absendest, geht er zur finalen Prüfung und weiteren Bearbeitung an uns."
            />
          </div>
        </div>
      </section>

      <section
        id="vertrauen"
        className="border-t border-[#E8DED2] bg-[#FBF7F0] px-5 py-14 lg:px-8"
      >
        <div className="mx-auto max-w-7xl rounded-[36px] border border-[#BFE3CD] bg-[#F0FFF6] p-6 shadow-sm md:p-8">
          <div className="grid gap-8 md:grid-cols-[0.9fr_1.1fr] md:items-center">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.22em] text-[#2F7D50]">
                Vertrauen beim Upload
              </p>
              <h2 className="mt-3 font-serif text-3xl font-black text-[#102A43]">
                Du behältst die Kontrolle.
              </h2>
              <p className="mt-4 text-sm font-semibold leading-7 text-[#2F7D50]">
                Deine Liste wird genutzt, um Deinen Paketwunsch vorzubereiten.
                Es wird nichts automatisch gekauft oder bezahlt. Du prüfst den
                Vorschlag zuerst selbst.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <TrustPoint text="Keine automatische Bestellung durch Upload" />
              <TrustPoint text="Paketwunsch wird vor dem Absenden geprüft" />
              <TrustPoint text="Unsichere Artikel werden persönlich geprüft" />
              <TrustPoint text="Zahlung erfolgt erst nach Rechnung" />
            </div>
          </div>
        </div>
      </section>

      <section
        id="zielgruppen"
        className="border-b border-[#E8DED2] bg-white/70 px-5 py-12 lg:px-8"
      >
        <div className="mx-auto max-w-7xl">
          <h2 className="text-center text-sm font-black uppercase tracking-[0.22em] text-[#A75B28]">
            Für Familien rund um den Schulstart
          </h2>

          <p className="mx-auto mt-3 max-w-2xl text-center text-sm leading-6 text-[#40566D]">
            Handzettel-Schulen.de hilft überall dort, wo Schulmateriallisten
            sonst Zeit, Nerven und mehrere Einkäufe kosten.
          </p>

          <div className="mt-8 grid gap-5 md:grid-cols-3">
            <div className="rounded-3xl bg-[#FFF2E6] p-6 ring-1 ring-[#F0D7C2]">
              <UsersRound className="h-9 w-9 text-[#A75B28]" />
              <h3 className="mt-5 text-xl font-black text-[#102A43]">
                Für Eltern
              </h3>
              <p className="mt-2 text-sm leading-6 text-[#40566D]">
                Weniger Einkaufsstress, weniger Fehlkäufe und mehr Zeit für die
                Familie. Du lädst die Liste hoch und erhältst einen
                vorbereiteten Paketwunsch.
              </p>
            </div>

            <div className="rounded-3xl bg-[#EAF2FA] p-6 ring-1 ring-[#CCDDEA]">
              <GraduationCap className="h-9 w-9 text-[#12395F]" />
              <h3 className="mt-5 text-xl font-black text-[#102A43]">
                Für Schulanfänger
              </h3>
              <p className="mt-2 text-sm leading-6 text-[#40566D]">
                Besonders bei der Einschulung sind Materiallisten oft lang und
                detailreich. Der Service hilft, den Start besser vorzubereiten.
              </p>
            </div>

            <div className="rounded-3xl bg-[#EAF7EE] p-6 ring-1 ring-[#CDE8D4]">
              <PackageCheck className="h-9 w-9 text-[#2F7D50]" />
              <h3 className="mt-5 text-xl font-black text-[#102A43]">
                Für mehrere Kinder
              </h3>
              <p className="mt-2 text-sm leading-6 text-[#40566D]">
                Wenn mehrere Listen zusammenkommen, spart eine saubere
                Vorbereitung besonders viel Zeit und Nerven.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="videos" className="mx-auto max-w-7xl px-5 py-14 lg:px-8">
        <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.22em] text-[#A75B28]">
              Hilfe & Videos
            </p>
            <h2 className="mt-2 font-serif text-3xl font-black text-[#102A43]">
              Du weißt nicht, wie Du Deine Liste bekommst?
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#40566D]">
              Ob LernSax, Thüringer Schulportal oder Papierliste: Du kannst
              Deine Liste speichern, fotografieren oder als PDF hochladen.
            </p>
          </div>

          <a
            href="#upload"
            className="inline-flex items-center gap-2 text-sm font-black text-[#B5282D]"
          >
            Direkt Liste hochladen
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          {videos.map((video) => (
            <article
              key={video.title}
              className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-[#E8DED2]"
            >
              <div className="flex h-40 items-center justify-center bg-gradient-to-br from-[#EAF2FA] via-white to-[#FFF2E6]">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#12395F] text-white shadow-lg">
                  <Play className="ml-1 h-7 w-7 fill-white" />
                </div>
              </div>

              <div className="p-6">
                <div className="mb-3 flex items-center gap-2 text-sm font-black text-[#A75B28]">
                  <Video className="h-4 w-4" />
                  Anleitung
                </div>
                <h3 className="text-xl font-black text-[#102A43]">
                  {video.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-[#40566D]">
                  {video.text}
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section
        id="faq"
        className="border-t border-[#E8DED2] bg-white px-5 py-14 lg:px-8"
      >
        <div className="mx-auto max-w-4xl">
          <div className="text-center">
            <p className="text-sm font-black uppercase tracking-[0.22em] text-[#A75B28]">
              Fragen & Antworten
            </p>
            <h2 className="mt-3 font-serif text-3xl font-black text-[#102A43]">
              Häufige Fragen zur Schulmaterialliste
            </h2>
          </div>

          <div className="mt-8 space-y-4">
            {faqs.map((faq) => (
              <article
                key={faq.question}
                className="rounded-3xl border border-[#E8DED2] bg-[#FBF7F0] p-5"
              >
                <div className="flex items-start gap-3">
                  <HelpCircle className="mt-1 h-5 w-5 shrink-0 text-[#A75B28]" />
                  <div>
                    <h3 className="font-black text-[#102A43]">
                      {faq.question}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-[#40566D]">
                      {faq.answer}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#FBF7F0] px-5 py-14 lg:px-8">
        <div className="mx-auto max-w-7xl rounded-[36px] border border-[#E8DED2] bg-white p-6 text-center shadow-sm md:p-8">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-[#FFF2E6] text-[#A75B28]">
            <MessageCircle className="h-7 w-7" />
          </div>

          <p className="mt-5 text-sm font-black uppercase tracking-[0.22em] text-[#A75B28]">
            Bereit für weniger Schulstart-Stress?
          </p>

          <h2 className="mx-auto mt-3 max-w-2xl font-serif text-3xl font-black text-[#102A43]">
            Lade jetzt Deine Materialliste hoch.
          </h2>

          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-[#40566D]">
            Du bestellst noch nichts automatisch. Du bekommst zuerst Deinen
            vorbereiteten Paketwunsch und entscheidest danach bewusst weiter.
          </p>

          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <a
              href="#upload"
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#B5282D] px-6 py-4 text-base font-black text-white shadow-sm transition hover:bg-[#972126]"
            >
              Liste hochladen
              <ArrowRight className="h-5 w-5" />
            </a>

            <a
              href="https://wa.me/49376516175?text=Hallo%2C%20ich%20m%C3%B6chte%20meine%20Schulmaterialliste%20einreichen."
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#D8C8B8] bg-white px-6 py-4 text-base font-black text-[#102A43] transition hover:border-[#1FA855]"
            >
              <span className="text-[#1FA855]">●</span>
              Per WhatsApp senden
            </a>
          </div>
        </div>
      </section>

      <LegalFooter />

      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-[#E8DED2] bg-white p-3 lg:hidden">
        <a
          href="#upload"
          className="flex items-center justify-center gap-2 rounded-2xl bg-[#B5282D] px-5 py-4 text-base font-black text-white"
        >
          <UploadCloud className="h-5 w-5" />
          Materialliste hochladen
        </a>
      </div>
    </main>
  );
}

function TrustCard({
  icon,
  title,
  text,
}: {
  icon: ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-3xl border border-[#E8DED2] bg-white p-5 shadow-sm">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FBF7F0] text-[#A75B28]">
        {icon}
      </div>
      <h2 className="text-lg font-black text-[#102A43]">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-[#40566D]">{text}</p>
    </div>
  );
}

function Step({
  number,
  title,
  text,
}: {
  number: string;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-3xl bg-[#FBF7F0] p-6 ring-1 ring-[#E8DED2]">
      <div className="flex items-center gap-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#12395F] text-sm font-black text-white">
          {number}
        </div>
        <h3 className="text-xl font-black text-[#102A43]">{title}</h3>
      </div>
      <p className="mt-4 text-sm leading-6 text-[#40566D]">{text}</p>
    </div>
  );
}

function Benefit({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-3xl border border-[#E8DED2] bg-[#FBF7F0] p-5">
      <CheckCircle2 className="h-6 w-6 text-[#2F7D50]" />
      <h3 className="mt-4 font-black text-[#102A43]">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-[#40566D]">{text}</p>
    </div>
  );
}

function TrustPoint({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-white p-4 text-sm font-black text-[#102A43]">
      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#2F7D50]" />
      <span>{text}</span>
    </div>
  );
}