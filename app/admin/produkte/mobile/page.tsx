import Link from "next/link";
import { ArrowLeft, Camera, PackagePlus, Smartphone } from "lucide-react";
import AdminMobileProductCapture from "@/components/AdminMobileProductCapture";

export const dynamic = "force-dynamic";

export default function AdminMobileProductCapturePage() {
  return (
    <main className="min-h-screen bg-[#FBF7F0] text-[#102A43]">
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-5 sm:px-6 sm:py-8">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/admin/produkte"
            className="inline-flex items-center gap-2 rounded-2xl border border-[#E8DED2] bg-white px-4 py-3 text-sm font-black text-[#12395F] shadow-sm transition hover:bg-[#EEF4FA]"
          >
            <ArrowLeft className="h-4 w-4" />
            Zurück
          </Link>

          <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-[#A75B28] shadow-sm">
            <Smartphone className="h-4 w-4" />
            Mobile Erfassung
          </div>
        </div>

        <header className="rounded-[32px] border border-[#E8DED2] bg-white p-5 shadow-[0_18px_45px_rgba(16,42,67,0.10)] sm:p-7">
          <div className="flex items-start gap-4">
            <div className="flex h-13 w-13 shrink-0 items-center justify-center rounded-3xl bg-[#FFF8EE] text-[#A75B28]">
              <Camera className="h-7 w-7" />
            </div>

            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#A75B28]">
                Handzettel-Schulen.de
              </p>

              <h1 className="mt-1 text-2xl font-black tracking-tight text-[#102A43] sm:text-3xl">
                Produkte schnell per Handy erfassen
              </h1>

              <p className="mt-3 text-sm font-semibold leading-6 text-[#52616F]">
                Fotografiere das Produkt direkt mit der Handykamera, trage die
                wichtigsten Daten ein und speichere es sofort im Produktkatalog.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-[#BFE3CD] bg-[#F0FFF6] p-3 text-[#2F7D50]">
              <PackagePlus className="mb-2 h-5 w-5" />
              <p className="text-sm font-black">Schnell anlegen</p>
              <p className="mt-1 text-xs font-semibold leading-5">
                Nur Name, Preis und Foto reichen für den Start.
              </p>
            </div>

            <div className="rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] p-3 text-[#52616F]">
              <Camera className="mb-2 h-5 w-5 text-[#A75B28]" />
              <p className="text-sm font-black text-[#102A43]">
                Kamera direkt öffnen
              </p>
              <p className="mt-1 text-xs font-semibold leading-5">
                Auf dem Handy startet direkt die Kamera.
              </p>
            </div>

            <div className="rounded-2xl border border-[#F1D1A8] bg-[#FFF8EE] p-3 text-[#A75B28]">
              <Smartphone className="mb-2 h-5 w-5" />
              <p className="text-sm font-black">Nächstes Produkt</p>
              <p className="mt-1 text-xs font-semibold leading-5">
                Nach dem Speichern wird das Formular geleert.
              </p>
            </div>
          </div>
        </header>

        <AdminMobileProductCapture />
      </section>
    </main>
  );
}