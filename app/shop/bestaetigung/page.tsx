import Link from "next/link";
import { CheckCircle2, ShoppingBag } from "lucide-react";
import LegalFooter from "@/components/LegalFooter";

export default function ShopOrderConfirmationPage() {
  return (
    <>
      <main className="min-h-screen bg-[#f7f1e8] px-5 py-16 text-[#172033]">
        <section className="mx-auto max-w-3xl rounded-[2rem] bg-white p-8 text-center shadow-xl ring-1 ring-[#eadfce] md:p-12">
          <CheckCircle2 className="mx-auto h-16 w-16 text-[#2F7D50]" />

          <p className="mt-6 text-sm font-black uppercase tracking-[0.16em] text-[#2F7D50]">
            Vielen Dank für Deine Bestellung
          </p>

          <h1 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">
            Bestellung eingegangen
          </h1>

          <p className="mt-5 text-lg font-semibold leading-8 text-[#4c5870]">
            Deine Bestellung wurde erfolgreich übermittelt.
          </p>

          <div className="mt-7 rounded-[1.5rem] border border-[#eadfce] bg-[#fffaf2] p-5 text-sm font-semibold leading-7 text-[#4c5870]">
            Die Rechnung wird separat erstellt und Dir anschließend bereitgestellt.
          </div>

          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              href="/shop"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#172033] px-6 py-3 text-sm font-black text-white transition hover:brightness-110"
            >
              <ShoppingBag className="h-4 w-4" />
              Zurück zum Shop
            </Link>

            <Link
              href="/"
              className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-[#eadfce] bg-white px-6 py-3 text-sm font-black text-[#172033] transition hover:bg-[#fffaf2]"
            >
              Zur Startseite
            </Link>
          </div>
        </section>
      </main>

      <LegalFooter />
    </>
  );
}
