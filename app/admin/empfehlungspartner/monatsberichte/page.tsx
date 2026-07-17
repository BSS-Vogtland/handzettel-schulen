import AdminPartnerMonthlyReports, {
  type PartnerMonthlyReportHistoryRow,
  type PartnerMonthlyReportPartner,
} from "@/components/AdminPartnerMonthlyReports";
import { supabaseServer } from "@/lib/supabase/server";
import {
  ArrowLeft,
  BarChart3,
  CalendarClock,
  Handshake,
} from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object"
    ? (value as UnknownRecord)
    : {};
}

function textValue(
  value: unknown,
  fallback = "",
) {
  return typeof value === "string"
    ? value
    : fallback;
}

function nullableText(value: unknown) {
  const text = textValue(value).trim();
  return text || null;
}

function numberValue(
  value: unknown,
  fallback = 0,
) {
  const parsed =
    typeof value === "number"
      ? value
      : Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

function booleanValue(value: unknown) {
  return value === true;
}

async function loadPageData() {
  const [
    partnerResponse,
    historyResponse,
  ] = await Promise.all([
    supabaseServer
      .from("recommendation_partners")
      .select(
        [
          "id",
          "name",
          "partner_code",
          "contact_email",
          "active",
          "partner_portal_enabled",
          "report_frequency",
        ].join(","),
      )
      .eq(
        "project_key",
        "handzettel-schulen",
      )
      .order("name", {
        ascending: true,
      }),

    supabaseServer
      .from("recommendation_partner_reports")
      .select(
        [
          "id",
          "partner_id",
          "period_start",
          "period_end",
          "recipient_email",
          "status",
          "referral_count",
          "open_count",
          "ordered_count",
          "not_ordered_count",
          "cancelled_count",
          "identity_authorized_count",
          "identity_included_count",
          "gross_revenue",
          "currency",
          "requested_by",
          "requested_at",
          "sent_at",
          "failed_at",
          "error_message",
          "created_at",
        ].join(","),
      )
      .eq(
        "project_key",
        "handzettel-schulen",
      )
      .order("created_at", {
        ascending: false,
      })
      .limit(100),
  ]);

  const errors: string[] = [];

  if (partnerResponse.error) {
    errors.push(
      `Empfehlungspartner konnten nicht geladen werden: ${partnerResponse.error.message}`,
    );
  }

  if (historyResponse.error) {
    errors.push(
      `Berichtshistorie konnte nicht geladen werden: ${historyResponse.error.message}`,
    );
  }

  const partners: PartnerMonthlyReportPartner[] =
    (partnerResponse.data ?? []).flatMap(
      (value) => {
        const row = record(value);
        const id = nullableText(row.id);
        const name = nullableText(row.name);

        if (!id || !name) {
          return [];
        }

        return [
          {
            id,
            name,
            partnerCode:
              nullableText(row.partner_code) ??
              "–",
            contactEmail:
              nullableText(row.contact_email),
            active:
              booleanValue(row.active),
            partnerPortalEnabled:
              booleanValue(
                row.partner_portal_enabled,
              ),
            reportFrequency:
              nullableText(
                row.report_frequency,
              ),
          },
        ];
      },
    );

  const partnerNames = new Map(
    partners.map((partner) => [
      partner.id,
      partner.name,
    ]),
  );

  const history: PartnerMonthlyReportHistoryRow[] =
    (historyResponse.data ?? []).flatMap(
      (value) => {
        const row = record(value);

        const id = nullableText(row.id);
        const partnerId =
          nullableText(row.partner_id);
        const periodStart =
          nullableText(row.period_start);
        const periodEnd =
          nullableText(row.period_end);
        const recipientEmail =
          nullableText(row.recipient_email);

        if (
          !id ||
          !partnerId ||
          !periodStart ||
          !periodEnd ||
          !recipientEmail
        ) {
          return [];
        }

        return [
          {
            id,
            partnerId,
            partnerName:
              partnerNames.get(partnerId) ??
              "Unbekannter Partner",
            periodStart,
            periodEnd,
            recipientEmail,
            status:
              nullableText(row.status) ??
              "unknown",
            referralCount:
              numberValue(row.referral_count),
            openCount:
              numberValue(row.open_count),
            orderedCount:
              numberValue(row.ordered_count),
            notOrderedCount:
              numberValue(
                row.not_ordered_count,
              ),
            cancelledCount:
              numberValue(row.cancelled_count),
            identityAuthorizedCount:
              numberValue(
                row.identity_authorized_count,
              ),
            identityIncludedCount:
              numberValue(
                row.identity_included_count,
              ),
            grossRevenue:
              numberValue(row.gross_revenue),
            currency:
              nullableText(row.currency) ??
              "EUR",
            requestedBy:
              nullableText(row.requested_by) ??
              "unknown",
            requestedAt:
              nullableText(row.requested_at),
            sentAt:
              nullableText(row.sent_at),
            failedAt:
              nullableText(row.failed_at),
            errorMessage:
              nullableText(row.error_message),
          },
        ];
      },
    );

  return {
    partners,
    history,
    error:
      errors.length > 0
        ? errors.join(" ")
        : null,
  };
}

export default async function PartnerMonthlyReportsPage() {
  const data = await loadPageData();

  const eligiblePartnerCount =
    data.partners.filter(
      (partner) =>
        partner.active &&
        partner.partnerPortalEnabled &&
        partner.reportFrequency === "monthly" &&
        Boolean(partner.contactEmail),
    ).length;

  const sentCount = data.history.filter(
    (report) => report.status === "sent",
  ).length;

  const failedCount = data.history.filter(
    (report) => report.status === "failed",
  ).length;

  return (
    <main className="min-h-screen bg-[#FBF7F0] text-[#102A43]">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="rounded-[34px] border border-[#E8DED2] bg-white p-5 shadow-[0_18px_45px_rgba(16,42,67,0.10)] sm:p-7">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <Link
                href="/admin/empfehlungspartner"
                className="inline-flex items-center gap-2 rounded-2xl border border-[#D8C8B8] bg-[#FBF7F0] px-4 py-2.5 text-sm font-black text-[#52616F] transition hover:bg-white"
              >
                <ArrowLeft className="h-4 w-4" />
                Zu den Empfehlungspartnern
              </Link>

              <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#EEF4FA] px-3 py-1 text-xs font-black uppercase tracking-[0.17em] text-[#12395F]">
                <Handshake className="h-3.5 w-3.5" />
                Partnerempfehlungen
              </div>

              <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
                Partner-Monatsberichte
              </h1>

              <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-[#52616F] sm:text-base">
                Berechne Vermittlungskennzahlen vorab, versende
                Monatsberichte gezielt an einzelne Partner und prüfe
                das vollständige Versandprotokoll.
              </p>
            </div>

            <div className="grid min-w-full gap-3 sm:grid-cols-3 xl:min-w-[520px]">
              <div className="rounded-2xl border border-[#D6E7EF] bg-[#F5FAFD] p-4">
                <div className="flex items-center gap-2 text-[#12395F]">
                  <Handshake className="h-4 w-4" />
                  <p className="text-xs font-black uppercase tracking-[0.12em]">
                    Berichtsfähig
                  </p>
                </div>
                <p className="mt-2 text-3xl font-black">
                  {eligiblePartnerCount}
                </p>
              </div>

              <div className="rounded-2xl border border-[#BCE4CB] bg-[#EFFBF4] p-4">
                <div className="flex items-center gap-2 text-[#2F7D50]">
                  <BarChart3 className="h-4 w-4" />
                  <p className="text-xs font-black uppercase tracking-[0.12em]">
                    Versendet
                  </p>
                </div>
                <p className="mt-2 text-3xl font-black">
                  {sentCount}
                </p>
              </div>

              <div className="rounded-2xl border border-[#F3B3B3] bg-[#FFF1F1] p-4">
                <div className="flex items-center gap-2 text-[#9F1D1D]">
                  <CalendarClock className="h-4 w-4" />
                  <p className="text-xs font-black uppercase tracking-[0.12em]">
                    Fehler
                  </p>
                </div>
                <p className="mt-2 text-3xl font-black">
                  {failedCount}
                </p>
              </div>
            </div>
          </div>
        </header>

        <AdminPartnerMonthlyReports
          initialPartners={data.partners}
          initialHistory={data.history}
          initialError={data.error}
        />
      </section>
    </main>
  );
}