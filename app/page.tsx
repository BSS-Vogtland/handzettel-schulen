import Image from "next/image";
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
    question: "Was ist Handzettel-Schulen.de?",
    answer:
      "Handzettel-Schulen.de ist ein Service für Eltern, die ihre Schulmaterialliste oder den Handzettel der Schule online hochladen möchten. Aus der Liste wird ein persönlicher Schulmaterial-Paketwunsch vorbereitet.",
  },
  {
    question: "Welche Dateien kann ich hochladen?",
    answer:
      "Du kannst Deine Schulmaterialliste als Foto, Screenshot oder PDF hochladen. Auch ein fotografierter Handzettel der Schule ist möglich.",
  },
  {
    question:
      "Kann ich auch eine Liste aus LernSax oder dem Thüringer Schulportal nutzen?",
    answer:
      "Ja. Du kannst Deine Liste aus LernSax oder dem Thüringer Schulportal speichern und anschließend bei Handzettel-Schulen.de hochladen.",
  },
  {
    question: "Wird mein Paket automatisch bestellt?",
    answer:
      "Nein. Du sendest zuerst Deinen Paketwunsch ab. Danach wird Deine Auswahl durch Handzettel-Schulen.de persönlich geprüft und bei Bedarf sauber ergänzt oder korrigiert.",
  },
  {
    question: "Für wen ist der Service gedacht?",
    answer:
      "Der Service ist besonders hilfreich für Eltern, Schulanfänger, Familien mit mehreren Kindern und alle, die Schulmaterial stressfreier vorbereiten möchten.",
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
                Du bestellst zu Hause. Wir packen Deine Schultasche.
              </div>
            </div>
          </div>

          <nav className="hidden items-center gap-8 text-sm font-semibold text-[#102A43] lg:flex">
            <a href="#ablauf" className="transition hover:text-[#B5282D]">
              So funktioniert’s
            </a>
            <a href="#videos" className="transition hover:text-[#B5282D]">
              Hilfe & Videos
            </a>
            <a href="#zielgruppen" className="transition hover:text-[#B5282D]">
              Für wen?
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
            Für Eltern, Lehrer & Schüler
          </div>

          <h1 className="max-w-3xl font-serif text-4xl font-black leading-[1.05] tracking-tight text-[#102A43] sm:text-5xl lg:text-6xl">
            Handzettel der Schule hochladen.
            <span className="block text-[#B5282D]">
              Schultasche stressfrei packen lassen.
            </span>
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-8 text-[#40566D]">
            Lade Deine Schulmaterialliste als Foto, Screenshot oder PDF hoch.
            Handzettel-Schulen.de erkennt die benötigten Schulsachen, bereitet
            Deinen persönlichen Schulmaterial-Paketwunsch vor und hilft Dir,
            den Schulstart entspannter zu organisieren.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a
              href="#upload"
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#12395F] px-6 py-4 text-base font-bold text-white shadow-lg shadow-[#12395F]/15 transition hover:-translate-y-0.5 hover:bg-[#0D2D4C]"
            >
              <UploadCloud className="h-5 w-5" />
              Schulmaterialliste hochladen
            </a>

            <a
              href="https://wa.me/49376516175?text=Hallo%2C%20ich%20m%C3%B6chte%20meine%20Schulmaterialliste%20einreichen."
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#D8C8B8] bg-white px-6 py-4 text-base font-bold text-[#102A43] shadow-sm transition hover:-translate-y-0.5 hover:border-[#1FA855]"
            >
              <span className="text-[#1FA855]">●</span>
              Per WhatsApp senden
            </a>
          </div>

          <div className="mt-8 grid gap-3 text-sm font-semibold text-[#40566D] sm:grid-cols-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-[#12395F]" />
              Sicher & vertraulich
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-[#2F7D50]" />
              Schnell & einfach
            </div>
            <div className="flex items-center gap-2">
              <Heart className="h-5 w-5 text-[#B5282D]" />
              Persönlicher Service
            </div>
          </div>

          <div className="mt-10 hidden max-w-xl rounded-[2rem] bg-white/70 p-5 ring-1 ring-[#E8DED2] lg:block">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#FFF2E6] text-[#A75B28]">
                <PackageCheck className="h-6 w-6" />
              </div>
              <div>
                <h2 className="font-black text-[#102A43]">
                  Aus Deiner Materialliste wird ein vorbereitetes Schulpaket.
                </h2>
                <p className="mt-1 text-sm leading-6 text-[#40566D]">
                  Website-Upload, WhatsApp-Upload und die persönliche
                  Produktprüfung laufen in einem System zusammen.
                </p>
              </div>
            </div>
          </div>
        </div>

        <UploadForm />
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
            title="Persönlich vorbereitet"
            text="Handzettel-Schulen.de prüft Deine Auswahl und ergänzt passende Produkte sauber für Deinen Paketwunsch."
          />
          <TrustCard
            icon={<School className="h-6 w-6" />}
            title="Für den Schulstart"
            text="Ideal für Schulanfang, neue Klassen, Materiallisten aus LernSax oder dem Thüringer Schulportal."
          />
        </div>
      </section>

      <section
        id="zielgruppen"
        className="border-b border-[#E8DED2] bg-white/70 px-5 py-12 lg:px-8"
      >
        <div className="mx-auto max-w-7xl">
          <h2 className="text-center text-sm font-black uppercase tracking-[0.22em] text-[#A75B28]">
            Für Eltern, Lehrer & Schüler
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
                Für Lehrer
              </h3>
              <p className="mt-2 text-sm leading-6 text-[#40566D]">
                Materiallisten einfach weitergeben und Eltern im Schulalltag
                entlasten — besonders vor dem neuen Schuljahr.
              </p>
            </div>

            <div className="rounded-3xl bg-[#EAF7EE] p-6 ring-1 ring-[#CDE8D4]">
              <PackageCheck className="h-9 w-9 text-[#2F7D50]" />
              <h3 className="mt-5 text-xl font-black text-[#102A43]">
                Für Schüler
              </h3>
              <p className="mt-2 text-sm leading-6 text-[#40566D]">
                Gut ausgestattet starten — mit passenden Heften, Umschlägen,
                Blöcken und Schulmaterialien für den Schulbeginn.
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
              So bekommst Du Deine Schulmaterialliste zu uns.
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
        id="ablauf"
        className="border-t border-[#E8DED2] bg-white px-5 py-14 lg:px-8"
      >
        <div className="mx-auto max-w-7xl">
          <p className="text-center text-sm font-black uppercase tracking-[0.22em] text-[#A75B28]">
            So funktioniert’s
          </p>

          <h2 className="mx-auto mt-3 max-w-2xl text-center font-serif text-3xl font-black text-[#102A43]">
            Aus Deinem Handzettel wird ein persönlicher Schulpaket-Wunsch.
          </h2>

          <div className="mt-10 grid gap-5 md:grid-cols-3">
            <Step
              number="1"
              title="Liste hochladen"
              text="Du lädst die Schulmaterialliste als PDF, Foto oder Screenshot hoch — auch ein fotografierter Handzettel funktioniert."
            />
            <Step
              number="2"
              title="Produkte vorbereiten"
              text="Die Liste wird ausgewertet. Passende Produkte werden vorgeschlagen oder persönlich durch Handzettel-Schulen.de geprüft."
            />
            <Step
              number="3"
              title="Paketwunsch absenden"
              text="Du prüfst die Auswahl und sendest Deinen Paketwunsch verbindlich an Handzettel-Schulen.de ab."
            />
          </div>
        </div>
      </section>

      <section className="bg-[#FBF7F0] px-5 py-14 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-8 rounded-[36px] border border-[#E8DED2] bg-white p-6 shadow-sm md:grid-cols-[0.9fr_1.1fr] md:p-8">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.22em] text-[#A75B28]">
              Schulmaterial stressfrei
            </p>
            <h2 className="mt-3 font-serif text-3xl font-black text-[#102A43]">
              Warum Handzettel-Schulen.de?
            </h2>
            <p className="mt-4 text-sm leading-7 text-[#40566D]">
              Viele Materiallisten enthalten spezielle Lineaturen, Formate,
              Farben und Artikelbezeichnungen. Handzettel-Schulen.de hilft Dir,
              daraus einen sauberen Paketwunsch zu machen — ohne Rätselraten im
              Laden und ohne unnötigen Einkaufsstress.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Benefit
              title="Für Fotos & PDFs"
              text="Du kannst Deinen Handzettel fotografieren oder eine digitale Liste hochladen."
            />
            <Benefit
              title="Persönliche Prüfung"
              text="Unsichere Positionen werden nicht einfach falsch gefüllt, sondern persönlich geprüft."
            />
            <Benefit
              title="Passende Produkte"
              text="Produkte werden mit Format, Farbe, Lineatur und Suchbegriffen vorbereitet."
            />
            <Benefit
              title="Einfacher Paketwunsch"
              text="Du wählst passende Produkte aus und sendest Deinen Wunsch online ab."
            />
          </div>
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
            Auch auf Social Media
          </p>

          <h2 className="mx-auto mt-3 max-w-2xl font-serif text-3xl font-black text-[#102A43]">
            Tipps rund um Schulmaterial, Handzettel und entspannteren Schulstart.
          </h2>

          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-[#40566D]">
            Handzettel-Schulen.de findest Du auch mit Elterntipps, kurzen Videos
            und einfachen Erklärungen rund um Schulmateriallisten.
          </p>

          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <a
              href="https://www.instagram.com/bssvogtland/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#D8C8B8] bg-white px-5 py-3 text-sm font-black text-[#102A43] transition hover:border-[#B5282D]"
            >
              Instagram ansehen
              <ArrowRight className="h-4 w-4" />
            </a>

            <a
              href="https://www.youtube.com/results?search_query=Handzettel-Schulen"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#12395F] px-5 py-3 text-sm font-black text-white transition hover:bg-[#0D2D4C]"
            >
              YouTube ansehen
              <ArrowRight className="h-4 w-4" />
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
  icon: React.ReactNode;
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