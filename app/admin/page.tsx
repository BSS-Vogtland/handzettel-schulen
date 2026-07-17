import Link from "next/link";
import AdminLogoutButton from "@/components/AdminLogoutButton";
import {
  ArrowRight,
  BarChart3,
  ClipboardList,
  Handshake,
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
                Hier steuerst Du Deine Schulmaterial-Anfragen, übernimmst
                WhatsApp-Listen ins System, bearbeitest Paketwünsche, erfasst
                Produkte und erzeugst Social-Media-Entwürfe für Deine
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
                Wähle aus, ob Du Anfragen bearbeiten, WhatsApp-Listen
                übernehmen, Produkte erfassen oder Social-Beiträge vorbereiten
                möchtest.
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
              Öffne eingegangene Schulmateriallisten, prüfe erkannte Positionen,
              bearbeite Paketwünsche, Rechnungen, Zahlung, Picking und
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
              WhatsApp-Liste übernehmen
            </h2>

            <p className="mt-3 text-sm font-semibold leading-6 text-[#2F7D50]">
              Wenn ein Kunde seine Liste per WhatsApp geschickt hat, kannst Du
              hier Text, Foto, Screenshot oder PDF übernehmen und daraus eine
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
              Social-Beiträge erzeugen
            </h2>

            <p className="mt-3 text-sm font-semibold leading-6 text-[#8A4A38]">
              Erzeuge automatisch Social-Media-Entwürfe für TikTok, Instagram
              und Facebook inklusive Hook, Caption, Hashtags, Keywords,
              Bild-Prompt und Video-Prompt.
            </p>

            <div className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-[#B5282D] px-4 py-3 text-sm font-black text-white shadow-sm transition group-hover:brightness-110">
              SocialPilot öffnen
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
              Lineaturen und Suchbegriffe an. Diese Produkte stehen danach für
              manuelle Auswahl und automatische Vorschläge bereit.
            </p>

            <div className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-[#12395F] px-4 py-3 text-sm font-black text-white shadow-sm transition group-hover:brightness-110">
              Zu den Produkten
              <ArrowRight className="h-4 w-4" />
            </div>
          </Link>

          <Link
            href="/admin/empfehlungspartner"
            className="group rounded-[32px] border border-[#D6E7EF] bg-[#F5FAFD] p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-[0_18px_45px_rgba(16,42,67,0.10)] sm:p-7"
          >
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-3xl bg-white text-[#12395F]">
              <Handshake className="h-6 w-6" />
            </div>

            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#12395F]">
              Partnerempfehlungen
            </p>

            <h2 className="mt-2 text-2xl font-black text-[#102A43]">
              Empfehlungspartner verwalten
            </h2>

            <p className="mt-3 text-sm font-semibold leading-6 text-[#52616F]">
              Pflege externe Partner, Zielseiten, Zuordnungszeiträume und
              Provisionskonditionen für spätere Materialempfehlungen.
            </p>

            <div className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-[#12395F] px-4 py-3 text-sm font-black text-white shadow-sm transition group-hover:brightness-110">
              Zu den Empfehlungspartnern
              <ArrowRight className="h-4 w-4" />
            </div>
          </Link>
          <Link
            href="/admin/empfehlungspartner/monatsberichte"
            className="group rounded-[32px] border border-[#C8D8E8] bg-[#EEF4FA] p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-[0_18px_45px_rgba(16,42,67,0.10)] sm:p-7"
          >
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-3xl bg-white text-[#12395F]">
              <BarChart3 className="h-6 w-6" />
            </div>

            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#12395F]">
              Partnerberichte
            </p>

            <h2 className="mt-2 text-2xl font-black text-[#102A43]">
              Monatsberichte verwalten
            </h2>

            <p className="mt-3 text-sm font-semibold leading-6 text-[#52616F]">
              Starte Dry-Runs, versende Vermittlungsberichte gezielt an
              Empfehlungspartner und prüfe Versandstatus, Kennzahlen,
              Umsatz und Fehlermeldungen.
            </p>

            <div className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-[#12395F] px-4 py-3 text-sm font-black text-white shadow-sm transition group-hover:brightness-110">
              Zu den Monatsberichten
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
              Öffne die mobile Erfassung auf dem Smartphone, fotografiere
              Produkte direkt mit der Handykamera und speichere sie schnell für
              den Produktkatalog.
            </p>

            <div className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-[#12395F] px-4 py-3 text-sm font-black text-white shadow-sm transition group-hover:brightness-110">
              Mobile Erfassung öffnen
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
              Erstelle und bearbeite zeitlich begrenzte Rabattaktionen für den
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
                Kunden können Listen über die Website hochladen oder per
                WhatsApp schicken. WhatsApp-Listen übernimmst Du über den
                WhatsApp-Import ins System. Produkte, die Du erfasst, können
                später direkt in Anfragen gefunden, manuell übernommen und durch
                Aliase für zukünftige Listen gemerkt werden. Über den
                SocialPilot erzeugst Du zusätzlich passende Social-Media-Entwürfe
                für mehr Reichweite und neue Anfragen.
              </p>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
