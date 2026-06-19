import Image from "next/image";
import Link from "next/link";

export default function LegalFooter() {
  return (
    <footer className="border-t border-[#E8DED2] bg-[#FBF7F0] px-4 py-8 text-[#52616F] sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-black text-[#102A43]">
            Handzettel-Schulen.de
          </p>
          <p className="mt-1 text-xs font-semibold leading-5">
            Schulmaterialliste hochladen, Paketwunsch vorbereiten lassen und
            stressfreier in den Schulstart gehen.
          </p>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-end">
          <div className="relative h-[104px] w-[740px] max-w-full sm:h-[96px] sm:w-[700px]">
            <Image
              src="/foerderung/efre-esf-sachsen.png"
              alt="Kofinanziert von der Europäischen Union und mitfinanziert durch den Freistaat Sachsen"
              fill
              sizes="(max-width: 640px) 100vw, 700px"
              className="object-contain object-left"
            />
          </div>

          <nav className="flex flex-wrap gap-3 text-xs font-black uppercase tracking-[0.14em]">
            <Link
              href="/impressum"
              className="rounded-full bg-white px-4 py-2 text-[#12395F] shadow-sm transition hover:text-[#B5282D]"
            >
              Impressum
            </Link>

            <Link
              href="/datenschutz"
              className="rounded-full bg-white px-4 py-2 text-[#12395F] shadow-sm transition hover:text-[#B5282D]"
            >
              Datenschutz
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
