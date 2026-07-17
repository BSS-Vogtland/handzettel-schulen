import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PartnerPortalClient from "@/components/PartnerPortalClient";
import {
  listPartnerPortalReferrals,
  PartnerPortalServiceError,
} from "@/app/lib/recommendations/partnerPortalService";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Partnerbereich | Handzettel-Schulen.de",
  description:
    "Geschützter Partnerbereich zur Rückmeldung von vermittelten Bestellungen.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

type PartnerPortalPageProps = {
  params: Promise<{
    token: string;
  }>;
};

export default async function PartnerPortalPage({
  params,
}: PartnerPortalPageProps) {
  const { token } = await params;

  if (!token || token.length > 200) {
    notFound();
  }

  try {
    const portal = await listPartnerPortalReferrals(token);

    return (
      <PartnerPortalClient
        token={token}
        initialData={portal}
      />
    );
  } catch (error) {
    if (
      error instanceof PartnerPortalServiceError &&
      (
        error.code === "UNAUTHORIZED" ||
        error.code === "NOT_FOUND" ||
        error.code === "VALIDATION"
      )
    ) {
      return (
        <main className="min-h-screen bg-[#f6f8fb] px-4 py-12 text-[#102a43]">
          <section className="mx-auto w-full max-w-xl rounded-3xl border border-red-200 bg-white p-7 shadow-sm sm:p-10">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-2xl">
              !
            </div>

            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-red-700">
              Partnerbereich
            </p>

            <h1 className="mt-2 text-2xl font-bold sm:text-3xl">
              Zugang nicht verfügbar
            </h1>

            <p className="mt-4 leading-7 text-slate-600">
              Dieser Zugangslink ist ungültig, abgelaufen oder wurde
              deaktiviert. Bitte verwende den zuletzt erhaltenen Link oder
              wende Dich an Handzettel-Schulen.de.
            </p>
          </section>
        </main>
      );
    }

    console.error(
      "[Partner portal page] Partnerbereich konnte nicht geladen werden",
      {
        errorName:
          error instanceof Error
            ? error.name
            : "UnknownError",
        errorMessage:
          error instanceof Error
            ? error.message
            : "Unbekannter Fehler",
      },
    );

    return (
      <main className="min-h-screen bg-[#f6f8fb] px-4 py-12 text-[#102a43]">
        <section className="mx-auto w-full max-w-xl rounded-3xl border border-amber-200 bg-white p-7 shadow-sm sm:p-10">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-2xl">
            !
          </div>

          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-amber-700">
            Partnerbereich
          </p>

          <h1 className="mt-2 text-2xl font-bold sm:text-3xl">
            Bereich vorübergehend nicht erreichbar
          </h1>

          <p className="mt-4 leading-7 text-slate-600">
            Die Vermittlungsdaten konnten gerade nicht geladen werden. Bitte
            versuche es später erneut.
          </p>
        </section>
      </main>
    );
  }
}