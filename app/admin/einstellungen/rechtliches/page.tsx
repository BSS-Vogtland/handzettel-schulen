import Link from "next/link";
import { ArrowLeft, ExternalLink, ShieldCheck } from "lucide-react";
import AdminLegalSettingsForm from "@/components/AdminLegalSettingsForm";
import { getLegalSettings } from "@/lib/legal-settings";

export const dynamic = "force-dynamic";

export default async function AdminLegalSettingsPage() {
  const settings = await getLegalSettings();

  return (
    <main className="min-h-screen bg-[#FBF7F0] text-[#102A43]">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/admin/anfragen"
            className="inline-flex items-center gap-2 text-sm font-black text-[#12395F] transition hover:text-[#B5282D]"
          >
            <ArrowLeft className="h-4 w-4" />
            Zurück zu den Anfragen
          </Link>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/impressum"
              target="_blank"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#12395F] px-4 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110"
            >
              Impressum ansehen
              <ExternalLink className="h-4 w-4" />
            </Link>

            <Link
              href="/datenschutz"
              target="_blank"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#102A43] px-4 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110"
            >
              Datenschutz ansehen
              <ExternalLink className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <header className="rounded-[34px] border border-[#E8DED2] bg-white p-5 shadow-[0_18px_45px_rgba(16,42,67,0.10)] sm:p-7">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#FBF7F0] text-[#A75B28]">
              <ShieldCheck className="h-6 w-6" />
            </div>

            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[#FBF7F0] px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-[#A75B28]">
                Admin-Einstellungen
              </div>

              <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
                Rechtliche Daten
              </h1>

              <p className="mt-3 max-w-3xl text-sm leading-6 text-[#52616F] sm:text-base">
                Hier kannst Du die Daten für Impressum und Datenschutzerklärung
                zentral ändern. Die öffentlichen Seiten ziehen diese Angaben
                automatisch aus der Datenbank.
              </p>

              <p className="mt-3 rounded-2xl border border-[#F1D1A8] bg-[#FFF8EE] px-4 py-3 text-sm font-semibold leading-6 text-[#A75B28]">
                Hinweis: Diese Eingabemaske ersetzt keine rechtliche Prüfung.
                Prüfe Impressum und Datenschutzerklärung später idealerweise
                nochmal fachlich.
              </p>
            </div>
          </div>
        </header>

        <AdminLegalSettingsForm initialSettings={settings} />
      </section>
    </main>
  );
}