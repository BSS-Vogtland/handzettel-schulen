import Link from "next/link";
import { ArrowLeft, ShoppingCart } from "lucide-react";
import AdminPreparedCartsClient from "@/components/AdminPreparedCartsClient";

export const dynamic = "force-dynamic";

export default function AdminPreparedCartsPage() {
  return (
    <main className="min-h-screen bg-[#FBF7F0] text-[#102A43]">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="rounded-[34px] border border-[#E8DED2] bg-white p-5 shadow-[0_18px_45px_rgba(16,42,67,0.10)] sm:p-7">
          <Link
            href="/admin"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-[#D6E7EF] bg-white px-4 py-3 text-sm font-black text-[#12395F] shadow-sm transition hover:bg-[#F5FAFD]"
          >
            <ArrowLeft className="h-4 w-4" />
            Zurück zum Admin
          </Link>

          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_300px] lg:items-start">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-[#FBF7F0] px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-[#A75B28]">
                <ShoppingCart className="h-3.5 w-3.5" />
                Bestandskunden
              </div>

              <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
                Warenkörbe für Kunden vorbereiten
              </h1>

              <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-[#52616F] sm:text-base">
                Stelle Produkte für einen bestehenden Kunden zusammen. Der
                Kunde erhält anschließend einen sicheren Link, kann den
                Warenkorb prüfen und nutzt danach den normalen Shop-Checkout.
              </p>
            </div>

            <div className="rounded-[28px] border border-[#D6E7EF] bg-[#F5FAFD] p-4">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#12395F]">
                Technischer Ablauf
              </p>

              <p className="mt-2 text-sm font-semibold leading-6 text-[#52616F]">
                Die vorbereiteten Positionen werden separat gespeichert. Beim
                Öffnen des Kundenlinks werden sie später in den bestehenden
                Shop-Warenkorb übernommen. Preise werden im Checkout erneut aus
                dem Produktkatalog geprüft.
              </p>
            </div>
          </div>
        </header>

        <AdminPreparedCartsClient />
      </section>
    </main>
  );
}