import Image from "next/image";
import UploadForm from "@/components/UploadForm";
import {
  ArrowRight,
  CheckCircle2,
  GraduationCap,
  Heart,
  Menu,
  PackageCheck,
  Play,
  ShieldCheck,
  UploadCloud,
  UsersRound,
  Video,
} from "lucide-react";

const videos = [
  {
    title: "LernSax",
    text: "So lädst Du Deine Materialliste aus LernSax herunter.",
  },
  {
    title: "Thüringer Schulportal",
    text: "So speicherst Du Deine Liste aus dem Thüringer Schulportal.",
  },
  {
    title: "Liste fotografieren",
    text: "So fotografierst Du Deine Papierliste sauber mit dem Smartphone.",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[#FBF7F0] text-[#102A43]">
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
            Materialliste hochladen.
            <span className="block text-[#B5282D]">
              Schultasche stressfrei packen lassen.
            </span>
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-8 text-[#40566D]">
            Lade Deine Schulmaterialliste als Foto, Screenshot oder PDF hoch.
            Wir erkennen die benötigten Artikel, stellen Dein Paket zusammen und
            bereiten Dein persönliches Angebot vor.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a
              href="#upload"
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#12395F] px-6 py-4 text-base font-bold text-white shadow-lg shadow-[#12395F]/15 transition hover:-translate-y-0.5 hover:bg-[#0D2D4C]"
            >
              <UploadCloud className="h-5 w-5" />
              Materialliste hochladen
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
                  Aus Deiner Liste wird ein vorbereitetes Schulpaket.
                </h2>
                <p className="mt-1 text-sm leading-6 text-[#40566D]">
                  Website-Upload, WhatsApp-Upload und später automatische
                  Artikelerkennung laufen in einem System zusammen.
                </p>
              </div>
            </div>
          </div>
        </div>

        <UploadForm />
      </section>

      <section
        id="zielgruppen"
        className="border-y border-[#E8DED2] bg-white/70 px-5 py-10 lg:px-8"
      >
        <div className="mx-auto max-w-7xl">
          <h2 className="text-center text-sm font-black uppercase tracking-[0.22em] text-[#A75B28]">
            Für Eltern, Lehrer & Schüler
          </h2>

          <div className="mt-8 grid gap-5 md:grid-cols-3">
            <div className="rounded-3xl bg-[#FFF2E6] p-6 ring-1 ring-[#F0D7C2]">
              <UsersRound className="h-9 w-9 text-[#A75B28]" />
              <h3 className="mt-5 text-xl font-black text-[#102A43]">
                Für Eltern
              </h3>
              <p className="mt-2 text-sm leading-6 text-[#40566D]">
                Weniger Einkaufsstress, weniger Fehlkäufe und mehr Zeit für die
                Familie.
              </p>
            </div>

            <div className="rounded-3xl bg-[#EAF2FA] p-6 ring-1 ring-[#CCDDEA]">
              <GraduationCap className="h-9 w-9 text-[#12395F]" />
              <h3 className="mt-5 text-xl font-black text-[#102A43]">
                Für Lehrer
              </h3>
              <p className="mt-2 text-sm leading-6 text-[#40566D]">
                Materiallisten einfach weitergeben und Eltern im Schulalltag
                entlasten.
              </p>
            </div>

            <div className="rounded-3xl bg-[#EAF7EE] p-6 ring-1 ring-[#CDE8D4]">
              <PackageCheck className="h-9 w-9 text-[#2F7D50]" />
              <h3 className="mt-5 text-xl font-black text-[#102A43]">
                Für Schüler
              </h3>
              <p className="mt-2 text-sm leading-6 text-[#40566D]">
                Gut ausgestattet starten — mit passenden Materialien für den
                Schulbeginn.
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
              So bekommst Du Deine Liste zu uns.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#40566D]">
              Die Erklärvideos bleiben fester Bestandteil der Seite — für
              LernSax, Thüringer Schulportal und das einfache Fotografieren mit
              dem Smartphone.
            </p>
          </div>

          <a
            href="#"
            className="inline-flex items-center gap-2 text-sm font-black text-[#B5282D]"
          >
            Alle Videos ansehen
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
            Aus einem Foto wird ein fertiges Schulpaket-Angebot.
          </h2>

          <div className="mt-10 grid gap-5 md:grid-cols-3">
            <Step
              number="1"
              title="Hochladen"
              text="Du lädst die Materialliste als PDF, Foto oder Screenshot hoch."
            />
            <Step
              number="2"
              title="Erkennen"
              text="Wir lesen die Liste aus und bereiten passende Artikelvorschläge vor."
            />
            <Step
              number="3"
              title="Paket erhalten"
              text="Du bekommst ein vorbereitetes Angebot für Dein Schulpaket."
            />
          </div>
        </div>
      </section>

      <footer className="pb-24 pt-8 text-center text-sm text-[#6B7280] lg:pb-8">
        <div className="mx-auto max-w-7xl px-5">
          <div className="font-serif text-lg font-black text-[#102A43]">
            Handzettel-Schulen.de
          </div>
          <p className="mt-2">
            © 2026 Handzettel-Schulen.de — Du bestellst zu Hause. Wir packen
            Deine Schultasche.
          </p>
        </div>
      </footer>

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