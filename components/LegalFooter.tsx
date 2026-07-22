import Image from "next/image";
import Link from "next/link";
import {
  CreditCard,
  Mail,
  MapPin,
  Phone,
  RotateCcw,
  ShieldCheck,
  Truck,
} from "lucide-react";
import {
  getGeneralEmail,
  getLegalAddress,
  getLegalDisplayName,
  getLegalSettings,
} from "@/lib/legal-settings";

export default async function LegalFooter() {
  const settings = await getLegalSettings();
  const email = getGeneralEmail(settings);
  const address = getLegalAddress(settings);
  const displayName = getLegalDisplayName(settings);
  const phone = settings.phone_primary;

  return (
    <footer className="border-t border-[#E8DED2] bg-[#FBF7F0] px-4 py-10 text-[#52616F] sm:px-6 lg:px-8">
      <div className="mx-auto grid w-full max-w-7xl gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-[30px] border border-[#E8DED2] bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#F0FFF6] text-[#2F7D50]">
              <ShieldCheck className="h-6 w-6" />
            </div>

            <div>
              <p className="text-sm font-black uppercase tracking-[0.14em] text-[#A75B28]">
                Anbieter und Kontakt
              </p>
              <p className="mt-2 text-lg font-black text-[#102A43]">
                {settings.brand_name}
              </p>
              <p className="mt-1 text-sm font-bold leading-6 text-[#52616F]">
                Betrieben durch {displayName}
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {address.length > 0 ? (
              <div className="flex items-start gap-3 rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] p-4">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#A75B28]" />
                <div className="text-sm font-semibold leading-6">
                  {address.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="grid gap-3">
              {email ? (
                <a
                  href={`mailto:${email}`}
                  className="flex items-center gap-3 rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] p-4 text-sm font-black text-[#12395F] transition hover:bg-white"
                >
                  <Mail className="h-4 w-4 shrink-0 text-[#A75B28]" />
                  <span className="break-all">{email}</span>
                </a>
              ) : null}

              {phone ? (
                <a
                  href={`tel:${phone.replace(/[^\d+]/g, "")}`}
                  className="flex items-center gap-3 rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] p-4 text-sm font-black text-[#12395F] transition hover:bg-white"
                >
                  <Phone className="h-4 w-4 shrink-0 text-[#A75B28]" />
                  {phone}
                </a>
              ) : null}
            </div>
          </div>
        </section>

        <section className="rounded-[30px] border border-[#E8DED2] bg-white p-5 shadow-sm sm:p-6">
          <p className="text-sm font-black uppercase tracking-[0.14em] text-[#A75B28]">
            Bestellung auf einen Blick
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <FooterFact
              icon={<Truck className="h-4 w-4" />}
              title="Versand"
              text="Deutschlandweit pauschal 5,95 €"
            />
            <FooterFact
              icon={<MapPin className="h-4 w-4" />}
              title="Abholung"
              text="Kostenlos nach Bestätigung"
            />
            <FooterFact
              icon={<CreditCard className="h-4 w-4" />}
              title="Zahlung"
              text="PayPal oder Überweisung"
            />
            <FooterFact
              icon={<RotateCcw className="h-4 w-4" />}
              title="Rückgabe"
              text="14 Tage Widerrufsrecht für Verbraucher"
            />
          </div>

          <Link
            href="/widerruf"
            className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-[#B5282D] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-[#102A43]"
          >
            Vertrag widerrufen
          </Link>

          <nav
            aria-label="Rechtliche Informationen"
            className="mt-5 flex flex-wrap gap-2 text-xs font-black uppercase tracking-[0.10em]"
          >
            <FooterLink href="/versand-zahlung">Versand & Zahlung</FooterLink>
            <FooterLink href="/widerruf-rueckgabe">
              Widerruf & Rückgabe
            </FooterLink>
            <FooterLink href="/impressum">Impressum</FooterLink>
            <FooterLink href="/datenschutz">Datenschutz</FooterLink>
            <FooterLink href="/cookies">Cookies</FooterLink>
          </nav>
        </section>
      </div>

      <div className="mx-auto mt-8 w-full max-w-7xl border-t border-[#E8DED2] pt-6">
        <div className="relative h-[86px] w-full max-w-[720px]">
          <Image
            src="/foerderung/efre-esf-sachsen.png"
            alt="Kofinanziert von der Europäischen Union und mitfinanziert durch den Freistaat Sachsen"
            fill
            sizes="(max-width: 768px) 100vw, 720px"
            className="object-contain object-left"
          />
        </div>
      </div>
    </footer>
  );
}

function FooterFact({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] p-4">
      <div className="flex items-center gap-2 font-black text-[#102A43]">
        <span className="text-[#A75B28]">{icon}</span>
        {title}
      </div>
      <p className="mt-2 text-xs font-semibold leading-5 text-[#52616F]">
        {text}
      </p>
    </div>
  );
}

function FooterLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="rounded-full bg-[#FBF7F0] px-4 py-2 text-[#12395F] ring-1 ring-[#E8DED2] transition hover:bg-[#102A43] hover:text-white"
    >
      {children}
    </Link>
  );
}
