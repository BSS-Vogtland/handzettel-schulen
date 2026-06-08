import Image from "next/image";
import Link from "next/link";
import { ShieldCheck, Sparkles } from "lucide-react";
import AdminLoginForm from "@/components/AdminLoginForm";

export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams?: Promise<{
    next?: string | string[];
  }>;
};

function getNextPath(rawNext: string | string[] | undefined) {
  const value = Array.isArray(rawNext) ? rawNext[0] : rawNext;

  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/admin";
  }

  if (value === "/admin/login" || value.startsWith("/api/")) {
    return "/admin";
  }

  return value;
}

export default async function AdminLoginPage({ searchParams }: LoginPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const nextPath = getNextPath(resolvedSearchParams.next);

  return (
    <main className="min-h-screen bg-[#FBF7F0] text-[#102A43]">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl items-center px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid w-full overflow-hidden rounded-[36px] border border-[#E8DED2] bg-white shadow-[0_24px_70px_rgba(16,42,67,0.16)] lg:grid-cols-[1fr_440px]">
          <div className="relative hidden min-h-[620px] overflow-hidden bg-[#102A43] p-8 text-white lg:block">
            <div className="absolute inset-0 opacity-20">
              <div className="absolute -left-20 top-20 h-72 w-72 rounded-full bg-[#B5282D] blur-3xl" />
              <div className="absolute bottom-16 right-0 h-80 w-80 rounded-full bg-[#A75B28] blur-3xl" />
            </div>

            <div className="relative z-10 flex h-full flex-col justify-between">
              <div>
                <div className="inline-flex items-center gap-3 rounded-3xl bg-white px-4 py-3 text-[#102A43] shadow-sm">
                  <Image
                    src="/handzettel-logo.png"
                    alt="Handzettel-Schulen.de"
                    width={44}
                    height={44}
                    className="rounded-xl object-contain"
                    priority
                  />
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
                      Admin
                    </p>
                    <p className="text-base font-black">Handzettel-Schulen.de</p>
                  </div>
                </div>

                <h1 className="mt-10 max-w-xl text-5xl font-black leading-[1.02] tracking-tight">
                  Geschützter Zugriff für Deinen Schulmaterial-Workflow.
                </h1>

                <p className="mt-5 max-w-xl text-base font-semibold leading-8 text-[#E8DED2]">
                  Anfragen, Rückfragen, Produktvorschläge, Rechnungen, Zahlung und Abwicklung bleiben hinter einem eigenen Admin-Zugang.
                </p>
              </div>

              <div className="grid gap-3">
                <div className="rounded-[26px] border border-white/20 bg-white/10 p-5 backdrop-blur">
                  <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[#B5282D]">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-[#F7EFE6]">
                    Admin-Sitzung
                  </p>
                  <p className="mt-2 text-sm font-semibold leading-6 text-[#E8DED2]">
                    Nach erfolgreicher Anmeldung wird eine geschützte Sitzung gesetzt. Ohne Sitzung werden Admin-Seiten und Admin-APIs blockiert.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="p-5 sm:p-8 lg:p-10">
            <div className="mb-8 flex items-center justify-between gap-4">
              <Link href="/" className="inline-flex items-center gap-3">
                <Image
                  src="/handzettel-logo.png"
                  alt="Handzettel-Schulen.de"
                  width={52}
                  height={52}
                  className="rounded-2xl object-contain"
                  priority
                />
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
                    Handzettel-Schulen.de
                  </p>
                  <p className="text-lg font-black text-[#102A43]">Admin-Login</p>
                </div>
              </Link>
            </div>

            <div className="mb-7 rounded-[28px] border border-[#E8DED2] bg-[#FBF7F0] p-5">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[#A75B28]">
                <Sparkles className="h-5 w-5" />
              </div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
                Sicher anmelden
              </p>
              <h2 className="mt-2 text-3xl font-black tracking-tight text-[#102A43]">
                Willkommen zurück.
              </h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-[#52616F]">
                Melde Dich mit Deinem Admin-Zugang an. Danach landest Du automatisch im geschützten Arbeitsbereich.
              </p>
            </div>

            <AdminLoginForm nextPath={nextPath} />

            <p className="mt-6 text-xs font-semibold leading-5 text-[#52616F]">
              Hinweis: Nach längerer Inaktivität läuft die Sitzung automatisch ab und Du musst Dich erneut anmelden.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
