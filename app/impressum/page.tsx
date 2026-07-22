import Link from "next/link";
import LegalFooter from "@/components/LegalFooter";
import { ArrowLeft, Building2, Mail, Phone, ShieldCheck } from "lucide-react";
import {
  getGeneralEmail,
  getLegalAddress,
  getLegalDisplayName,
  getLegalSettings,
} from "@/lib/legal-settings";

export const dynamic = "force-dynamic";

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  if (!value) return null;

  return (
    <div className="rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] p-4">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-[#A75B28]">
        {label}
      </p>
      <p className="mt-2 break-words text-sm font-bold leading-6 text-[#102A43]">
        {value}
      </p>
    </div>
  );
}

export default async function ImpressumPage() {
  const settings = await getLegalSettings();
  const address = getLegalAddress(settings);
  const displayName = getLegalDisplayName(settings);
  const email = getGeneralEmail(settings);

  return (
    <>
      <main className="min-h-screen bg-[#FBF7F0] text-[#102A43]">
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="inline-flex w-fit items-center gap-2 text-sm font-black text-[#12395F] transition hover:text-[#B5282D]"
        >
          <ArrowLeft className="h-4 w-4" />
          Zurück zur Startseite
        </Link>

        <header className="rounded-[34px] border border-[#E8DED2] bg-white p-5 shadow-[0_18px_45px_rgba(16,42,67,0.10)] sm:p-7">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#FBF7F0] text-[#A75B28]">
              <ShieldCheck className="h-6 w-6" />
            </div>

            <div>
              <p className="mb-3 inline-flex rounded-full bg-[#FBF7F0] px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-[#A75B28]">
                Rechtliches
              </p>

              <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
                Impressum
              </h1>

              <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-[#52616F] sm:text-base">
                Angaben gemäß den gesetzlichen Informationspflichten für{" "}
                {settings.brand_name}.
              </p>
            </div>
          </div>
        </header>

        <section className="rounded-[32px] border border-[#E8DED2] bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FBF7F0] text-[#A75B28]">
              <Building2 className="h-5 w-5" />
            </div>

            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
                Anbieter
              </p>
              <h2 className="text-xl font-black text-[#102A43]">
                Verantwortlich für diese Website
              </h2>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] p-4">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[#A75B28]">
                Betreiber
              </p>
              <p className="mt-2 text-lg font-black text-[#102A43]">
                {displayName}
              </p>

              {settings.legal_form ? (
                <p className="mt-1 text-sm font-semibold text-[#52616F]">
                  Rechtsform: {settings.legal_form}
                </p>
              ) : null}
            </div>

            {address.length > 0 ? (
              <div className="rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] p-4">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[#A75B28]">
                  Anschrift
                </p>
                <div className="mt-2 space-y-1 text-sm font-bold leading-6 text-[#102A43]">
                  {address.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <section className="rounded-[32px] border border-[#E8DED2] bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FBF7F0] text-[#A75B28]">
              <Phone className="h-5 w-5" />
            </div>

            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
                Kontakt
              </p>
              <h2 className="text-xl font-black text-[#102A43]">
                Kontaktangaben
              </h2>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <InfoRow label="Telefon" value={settings.phone_primary} />
            <InfoRow label="Telefon 2" value={settings.phone_secondary} />
            <InfoRow label="Fax" value={settings.fax} />
            <InfoRow label="E-Mail" value={email} />
          </div>

          {email ? (
            <a
              href={`mailto:${email}`}
              className="mt-5 inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#12395F] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110"
            >
              <Mail className="h-4 w-4" />
              E-Mail schreiben
            </a>
          ) : null}
        </section>

        <section className="rounded-[32px] border border-[#E8DED2] bg-white p-5 shadow-sm sm:p-7">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
            Weitere Angaben
          </p>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <InfoRow label="Umsatzsteuer-ID" value={settings.vat_id} />
            <InfoRow label="Registergericht" value={settings.register_court} />
            <InfoRow label="Registernummer" value={settings.register_number} />
            <InfoRow
              label="Aufsichtsbehörde"
              value={settings.supervisory_authority}
            />
            <InfoRow
              label="Verantwortliche Person"
              value={settings.responsible_person}
            />
          </div>

          {settings.dispute_resolution_text ? (
            <div className="mt-5 rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] p-4">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[#A75B28]">
                Verbraucherstreitbeilegung
              </p>
              <p className="mt-2 text-sm font-semibold leading-6 text-[#52616F]">
                {settings.dispute_resolution_text}
              </p>
            </div>
          ) : null}
        </section>

        <section className="rounded-[28px] border border-[#F1D1A8] bg-[#FFF8EE] p-5 text-sm font-semibold leading-6 text-[#A75B28]">
          <p>
            Hinweis: Die Inhalte dieser Seite werden zentral aus den
            Admin-Einstellungen geladen. Bitte prüfe die rechtlichen Angaben
            regelmäßig auf Aktualität.
          </p>
        </section>
      </section>
      </main>

      <LegalFooter />
    </>
  );
}