import Link from "next/link";
import AdminLogoutButton from "@/components/AdminLogoutButton";
import {
  ArrowRight,
  ClipboardList,
  Megaphone,
  MessageCircle,
  PackagePlus,
  Percent,
  School,
  ShoppingBasket,
  Smartphone,
  Sparkles,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default function AdminHomePage() {
  return (
    <main className="min-h-screen bg-[#FBF7F0] text-[#102A43]">
        <section className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="inline-flex rounded-full border border-[#E7D8C3] bg-[#FFFCF7] px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-[#8A5A35]">
                SocialPilot-Zugang
              </div>

              <h2 className="mt-3 text-2xl font-black text-[#102A43]">
                SocialPilot
              </h2>

              <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#52616F]">
                Content planen, Beiträge prüfen, Bilder erzeugen, Meta-Veröffentlichungen auslösen
                und Publishing-Protokolle kontrollieren.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[420px]">
              <a
                href="/admin/social"
                className="inline-flex items-center justify-center rounded-2xl bg-[#B5282D] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110"
              >
                SocialPilot öffnen
              </a>

              <a
                href="/admin/social/automation/events"
                className="inline-flex items-center justify-center rounded-2xl border border-[#E7D8C3] bg-[#FFFCF7] px-5 py-3 text-sm font-black text-[#A23A2E] transition hover:bg-[#F5E8D8]"
              >
                Publishing-Protokoll
              </a>
            </div>
          </div>
        </section>

      <section className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="rounded-[34px] border border-[#E8DED2] bg-white p-5 shadow-[0_18px_45px_rgba(16,42,67,0.10)] sm:p-7">
          <div className="mb-4 flex justify-end">
            <AdminLogoutButton />
          </div>

          <div className="grid gap-6 lg:grid-cols-[1fr_280px] lg:items-start">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[#FBF7F0] px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-[#A75B28]">
                <School className="h-3.5 w-3.5" />
                Handzettel-Schulen.de
              </div>

              <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
                Admin-Bereich
              </h1>

              <p className="mt-3 max-w-3xl text-sm leading-6 text-[#52616F] sm:text-base">
                Hier steuerst Du Deine Schulmaterial-Anfragen, Ã¼bernimmst
                WhatsApp-Listen ins System, bearbeitest PaketwÃ¼nsche, erfasst
                Produkte und erzeugst Social-Media-EntwÃ¼rfe fÃ¼r Deine
                Sichtbarkeit.
              </p>
            </div>

            <div className="rounded-[28px] border border-[#E8DED2] bg-[#FBF7F0] p-4">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[#A75B28]">
                <Sparkles className="h-5 w-5" />
              </div>

              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
                Schnellzugriff
              </p>

              <p className="mt-2 text-sm font-semibold leading-6 text-[#52616F]">
                WÃ¤hle aus, ob Du Anfragen bearbeiten, WhatsApp-Listen
                Ã¼bernehmen, Produkte erfassen oder Social-BeitrÃ¤ge vorbereiten
                mÃ¶chtest.
              </p>
            </div>
          </div>
        </header>

        <section className="grid gap-5 md:grid-cols-2">
          <Link
            href="/admin/anfragen"
            className="group rounded-[32px] border border-[#E8DED2] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-[0_18px_45px_rgba(16,42,67,0.10)] sm:p-7"
          >
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-3xl bg-[#FBF7F0] text-[#A75B28]">
              <ClipboardList className="h-6 w-6" />
            </div>

            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
              Kundenanfragen
            </p>

            <h2 className="mt-2 text-2xl font-black text-[#102A43]">
              Anfragen bearbeiten
            </h2>

            <p className="mt-3 text-sm font-semibold leading-6 text-[#52616F]">
              Ã–ffne eingegangene Schulmateriallisten, prÃ¼fe erkannte Positionen,
              bearbeite PaketwÃ¼nsche, Rechnungen, Zahlung, Picking und
              Kunden-Auswahlen.
            </p>

            <div className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-[#B5282D] px-4 py-3 text-sm font-black text-white shadow-sm transition group-hover:brightness-110">
              Zu den Anfragen
              <ArrowRight className="h-4 w-4" />
            </div>
          </Link>

          <Link
            href="/admin/whatsapp-import"
            className="group rounded-[32px] border border-[#BFE3CD] bg-[#F0FFF6] p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-[0_18px_45px_rgba(16,42,67,0.10)] sm:p-7"
          >
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-3xl bg-white text-[#1FA855]">
              <MessageCircle className="h-6 w-6" />
            </div>

            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#2F7D50]">
              WhatsApp-Import
            </p>

            <h2 className="mt-2 text-2xl font-black text-[#102A43]">
              WhatsApp-Liste Ã¼bernehmen
            </h2>

            <p className="mt-3 text-sm font-semibold leading-6 text-[#2F7D50]">
              Wenn ein Kunde seine Liste per WhatsApp geschickt hat, kannst Du
              hier Text, Foto, Screenshot oder PDF Ã¼bernehmen und daraus eine
              normale Anfrage im System anlegen.
            </p>

            <div className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-[#1FA855] px-4 py-3 text-sm font-black text-white shadow-sm transition group-hover:brightness-110">
              WhatsApp importieren
              <ArrowRight className="h-4 w-4" />
            </div>
          </Link>

          <Link
            href="/admin/social"
            className="group rounded-[32px] border border-[#F0D4C8] bg-[#FFF7F2] p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-[0_18px_45px_rgba(16,42,67,0.10)] sm:p-7"
          >
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-3xl bg-white text-[#B5282D]">
              <Megaphone className="h-6 w-6" />
            </div>

            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#B5282D]">
              SocialPilot
            </p>

            <h2 className="mt-2 text-2xl font-black text-[#102A43]">
              Social-BeitrÃ¤ge erzeugen
            </h2>

            <p className="mt-3 text-sm font-semibold leading-6 text-[#8A4A38]">
              Erzeuge automatisch Social-Media-EntwÃ¼rfe fÃ¼r TikTok, Instagram
              und Facebook inklusive Hook, Caption, Hashtags, Keywords,
              Bild-Prompt und Video-Prompt.
            </p>

            <div className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-[#B5282D] px-4 py-3 text-sm font-black text-white shadow-sm transition group-hover:brightness-110">
              SocialPilot Ã¶ffnen
              <ArrowRight className="h-4 w-4" />
            </div>
          </Link>

          <Link
            href="/admin/produkte"
            className="group rounded-[32px] border border-[#E8DED2] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-[0_18px_45px_rgba(16,42,67,0.10)] sm:p-7"
          >
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-3xl bg-[#FBF7F0] text-[#A75B28]">
              <PackagePlus className="h-6 w-6" />
            </div>

            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
              Produktverwaltung
            </p>

            <h2 className="mt-2 text-2xl font-black text-[#102A43]">
              Produkte schnell erfassen
            </h2>

            <p className="mt-3 text-sm font-semibold leading-6 text-[#52616F]">
              Lege neue Produkte, Artikelnummern, Preise, Formate, Farben,
              Lineaturen und Suchbegriffe an. Diese Produkte stehen danach fÃ¼r
              manuelle Auswahl und automatische VorschlÃ¤ge bereit.
            </p>

            <div className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-[#12395F] px-4 py-3 text-sm font-black text-white shadow-sm transition group-hover:brightness-110">
              Zu den Produkten
              <ArrowRight className="h-4 w-4" />
            </div>
          </Link>

          <Link
            href="/admin/produkte/mobile"
            className="group rounded-[32px] border border-[#C8D8E8] bg-[#EEF4FA] p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-[0_18px_45px_rgba(16,42,67,0.10)] sm:p-7"
          >
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-3xl bg-white text-[#12395F]">
              <Smartphone className="h-6 w-6" />
            </div>

            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#12395F]">
              Mobile Produkterfassung
            </p>

            <h2 className="mt-2 text-2xl font-black text-[#102A43]">
              Produkte mit Handyfoto erfassen
            </h2>

            <p className="mt-3 text-sm font-semibold leading-6 text-[#12395F]">
              Ã–ffne die mobile Erfassung auf dem Smartphone, fotografiere
              Produkte direkt mit der Handykamera und speichere sie schnell fÃ¼r
              den Produktkatalog.
            </p>

            <div className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-[#12395F] px-4 py-3 text-sm font-black text-white shadow-sm transition group-hover:brightness-110">
              Mobile Erfassung Ã¶ffnen
              <ArrowRight className="h-4 w-4" />
            </div>
          </Link>

          <Link
            href="/admin/einstellungen/rabatte"
            className="group rounded-[32px] border border-[#E8D5F0] bg-[#FCF6FF] p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-[0_18px_45px_rgba(16,42,67,0.10)] sm:p-7"
          >
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-3xl bg-white text-[#8A3FB0]">
              <Percent className="h-6 w-6" />
            </div>

            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8A3FB0]">
              Rabattaktionen
            </p>

            <h2 className="mt-2 text-2xl font-black text-[#102A43]">
              Rabatte verwalten
            </h2>

            <p className="mt-3 text-sm font-semibold leading-6 text-[#6F4A7D]">
              Erstelle und bearbeite zeitlich begrenzte Rabattaktionen fÃ¼r den
              Shop. Lege Namen, Zeitraum, Rabattart, Wert und Mindestbestellwert
              fest.
            </p>

            <div className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-[#8A3FB0] px-4 py-3 text-sm font-black text-white shadow-sm transition group-hover:brightness-110">
              Zu den Rabatten
              <ArrowRight className="h-4 w-4" />
            </div>
          </Link>
        </section>

        <section className="rounded-[32px] border border-[#E8DED2] bg-white p-5 shadow-sm sm:p-7">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-3xl bg-[#FBF7F0] text-[#A75B28]">
              <ShoppingBasket className="h-5 w-5" />
            </div>

            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
                Aktueller Workflow
              </p>

              <h2 className="mt-1 text-xl font-black text-[#102A43]">
                Upload, WhatsApp, Produkte, Anfragen und Sichtbarkeit greifen
                zusammen
              </h2>

              <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#52616F]">
                Kunden kÃ¶nnen Listen Ã¼ber die Website hochladen oder per
                WhatsApp schicken. WhatsApp-Listen Ã¼bernimmst Du Ã¼ber den
                WhatsApp-Import ins System. Produkte, die Du erfasst, kÃ¶nnen
                spÃ¤ter direkt in Anfragen gefunden, manuell Ã¼bernommen und durch
                Aliase fÃ¼r zukÃ¼nftige Listen gemerkt werden. Ãœber den
                SocialPilot erzeugst Du zusÃ¤tzlich passende Social-Media-EntwÃ¼rfe
                fÃ¼r mehr Reichweite und neue Anfragen.
              </p>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
