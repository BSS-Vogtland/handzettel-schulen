import "server-only";

import {
  createPartnerPortalAccess,
  deactivatePartnerPortalAccess,
} from "@/app/lib/recommendations/partnerPortalService";
import {
  DEFAULT_RECOMMENDATION_PROJECT_KEY,
  getRecommendationAdminClient,
  isRecommendationUuid,
  recommendationProjectKey,
} from "@/app/lib/recommendations/serviceSupport";
import { sendMailReliable } from "@/lib/mail/sendMailReliable";

const REPORT_ACCESS_VALID_DAYS = 180;

type UnknownRecord = Record<string, unknown>;

type RequestedBy = "admin" | "cron" | "system";

type FeedbackStatus =
  | "open"
  | "ordered"
  | "not_ordered"
  | "cancelled";

type ReportPartner = {
  id: string;
  projectKey: string;
  name: string;
  partnerCode: string;
  contactName: string | null;
  contactEmail: string;
  currency: string;
};

type Period = {
  key: string;
  startDate: string;
  endDate: string;
  nextStartIso: string;
  startIso: string;
  label: string;
};

type PartnerReportSummary = {
  referralCount: number;
  openCount: number;
  orderedCount: number;
  notOrderedCount: number;
  cancelledCount: number;
  identityAuthorizedCount: number;
  identityIncludedCount: number;
  grossRevenue: number;
  currency: string;
};

export type PartnerMonthlyReportMode =
  | "dry_run"
  | "send";

export type PartnerMonthlyReportResult = {
  partnerId: string;
  partnerName: string;
  recipientEmail: string | null;
  period: string;
  status:
    | "dry_run"
    | "sent"
    | "failed"
    | "skipped_no_referrals"
    | "skipped_duplicate";
  reportId: string | null;
  message: string;
  summary: PartnerReportSummary;
};

export type ProcessPartnerMonthlyReportsInput = {
  mode: PartnerMonthlyReportMode;
  requestedBy: RequestedBy;
  projectKey?: string;
  partnerId?: string | null;
  period?: string | null;
  now?: Date;
  force?: boolean;
};

export type ProcessPartnerMonthlyReportsResult = {
  ok: boolean;
  mode: PartnerMonthlyReportMode;
  projectKey: string;
  period: Period;
  results: PartnerMonthlyReportResult[];
  summary: {
    partnersChecked: number;
    dryRun: number;
    sent: number;
    failed: number;
    skippedNoReferrals: number;
    skippedDuplicate: number;
  };
};

function record(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object"
    ? (value as UnknownRecord)
    : {};
}

function nullableText(value: unknown) {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : null;
}

function requiredText(
  value: unknown,
  label: string,
) {
  const text = nullableText(value);

  if (!text) {
    throw new Error(`${label} fehlt.`);
  }

  return text;
}

function numericValue(
  value: unknown,
  fallback = 0,
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return fallback;
  }

  const parsed =
    typeof value === "number"
      ? value
      : Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

function roundMoney(value: number) {
  return (
    Math.round(
      (value + Number.EPSILON) * 100,
    ) / 100
  );
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function dateKey(
  year: number,
  month: number,
  day: number,
) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function resolvePeriod(
  periodValue: string | null | undefined,
  now: Date,
): Period {
  let year: number;
  let month: number;

  if (periodValue) {
    const match =
      /^(\d{4})-(0[1-9]|1[0-2])$/.exec(
        periodValue.trim(),
      );

    if (!match) {
      throw new Error(
        "Der Berichtszeitraum muss das Format JJJJ-MM haben.",
      );
    }

    year = Number(match[1]);
    month = Number(match[2]);
  } else {
    const currentYear = now.getUTCFullYear();
    const currentMonth = now.getUTCMonth() + 1;

    if (currentMonth === 1) {
      year = currentYear - 1;
      month = 12;
    } else {
      year = currentYear;
      month = currentMonth - 1;
    }
  }

  const nextYear =
    month === 12 ? year + 1 : year;

  const nextMonth =
    month === 12 ? 1 : month + 1;

  const startDate = dateKey(
    year,
    month,
    1,
  );

  const nextStartDate = dateKey(
    nextYear,
    nextMonth,
    1,
  );

  const periodEndDate = new Date(
    Date.UTC(nextYear, nextMonth - 1, 0),
  );

  const endDate = dateKey(
    periodEndDate.getUTCFullYear(),
    periodEndDate.getUTCMonth() + 1,
    periodEndDate.getUTCDate(),
  );

  const label = new Intl.DateTimeFormat(
    "de-DE",
    {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    },
  ).format(
    new Date(Date.UTC(year, month - 1, 1)),
  );

  return {
    key: `${year}-${pad(month)}`,
    startDate,
    endDate,
    startIso: `${startDate}T00:00:00.000Z`,
    nextStartIso:
      `${nextStartDate}T00:00:00.000Z`,
    label,
  };
}

function normalizePartner(
  value: unknown,
): ReportPartner {
  const row = record(value);

  const contactEmail = requiredText(
    row.contact_email,
    "Kontakt-E-Mail des Partners",
  ).toLowerCase();

  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      contactEmail,
    )
  ) {
    throw new Error(
      `Für ${requiredText(
        row.name,
        "Partnername",
      )} ist keine gültige Kontakt-E-Mail hinterlegt.`,
    );
  }

  return {
    id: requiredText(row.id, "Partner-ID"),
    projectKey: requiredText(
      row.project_key,
      "Projekt",
    ),
    name: requiredText(
      row.name,
      "Partnername",
    ),
    partnerCode: requiredText(
      row.partner_code,
      "Partnerkennung",
    ),
    contactName: nullableText(
      row.contact_name,
    ),
    contactEmail,
    currency:
      requiredText(
        row.currency ?? "EUR",
        "Währung",
      ).toUpperCase(),
  };
}

async function loadReportPartners(input: {
  projectKey: string;
  partnerId?: string | null;
}) {
  const supabase =
    getRecommendationAdminClient();

  let query = supabase
    .from("recommendation_partners")
    .select(
      [
        "id",
        "project_key",
        "partner_code",
        "name",
        "contact_name",
        "contact_email",
        "currency",
        "active",
        "partner_portal_enabled",
        "report_frequency",
      ].join(","),
    )
    .eq("project_key", input.projectKey)
    .eq("active", true)
    .eq("partner_portal_enabled", true)
    .eq("report_frequency", "monthly")
    .not("contact_email", "is", null)
    .order("name", {
      ascending: true,
    });

  if (input.partnerId) {
    if (
      !isRecommendationUuid(
        input.partnerId,
      )
    ) {
      throw new Error(
        "Die Partner-ID ist ungültig.",
      );
    }

    query = query.eq(
      "id",
      input.partnerId,
    );
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(
      `Empfehlungspartner konnten nicht geladen werden: ${error.message}`,
    );
  }

  return (data ?? []).map(
    normalizePartner,
  );
}

async function loadPartnerSummary(input: {
  partner: ReportPartner;
  period: Period;
}): Promise<PartnerReportSummary> {
  const supabase =
    getRecommendationAdminClient();

  const { data: clickData, error: clickError } =
    await supabase
      .from("recommendation_clicks")
      .select(
        [
          "id",
          "partner_id",
          "clicked_at",
          "is_probable_bot",
        ].join(","),
      )
      .eq(
        "partner_id",
        input.partner.id,
      )
      .eq("is_probable_bot", false)
      .gte(
        "clicked_at",
        input.period.startIso,
      )
      .lt(
        "clicked_at",
        input.period.nextStartIso,
      )
      .order("clicked_at", {
        ascending: true,
      })
      .limit(5000);

  if (clickError) {
    throw new Error(
      `Vermittlungsklicks konnten nicht geladen werden: ${clickError.message}`,
    );
  }

  const clickIds = (
    clickData ?? []
  ).flatMap((value) => {
    const id = nullableText(
      record(value).id,
    );

    return id &&
      isRecommendationUuid(id)
      ? [id]
      : [];
  });

  const emptySummary: PartnerReportSummary = {
    referralCount: 0,
    openCount: 0,
    orderedCount: 0,
    notOrderedCount: 0,
    cancelledCount: 0,
    identityAuthorizedCount: 0,
    identityIncludedCount: 0,
    grossRevenue: 0,
    currency: input.partner.currency,
  };

  if (clickIds.length === 0) {
    return emptySummary;
  }

  const {
    data: feedbackData,
    error: feedbackError,
  } = await supabase
    .from("recommendation_referral_feedback")
    .select(
      [
        "click_id",
        "partner_id",
        "status",
        "gross_revenue",
        "currency",
      ].join(","),
    )
    .eq(
      "partner_id",
      input.partner.id,
    )
    .in("click_id", clickIds);

  if (feedbackError) {
    throw new Error(
      `Partner-Rückmeldungen konnten nicht geladen werden: ${feedbackError.message}`,
    );
  }

  const feedbackMap = new Map<
    string,
    UnknownRecord
  >();

  for (const value of feedbackData ?? []) {
    const row = record(value);
    const clickId = nullableText(
      row.click_id,
    );

    if (clickId) {
      feedbackMap.set(clickId, row);
    }
  }

  const {
    data: identityData,
    error: identityError,
  } = await supabase
    .from(
      "recommendation_identity_consents",
    )
    .select(
      [
        "id",
        "click_id",
        "partner_id",
        "status",
        "revoked_at",
      ].join(","),
    )
    .eq(
      "partner_id",
      input.partner.id,
    )
    .eq("status", "granted")
    .is("revoked_at", null)
    .in("click_id", clickIds);

  if (identityError) {
    throw new Error(
      `Identitätsfreigaben konnten nicht geladen werden: ${identityError.message}`,
    );
  }

  const authorizedClickIds = new Set(
    (identityData ?? []).flatMap(
      (value) => {
        const clickId = nullableText(
          record(value).click_id,
        );

        return clickId ? [clickId] : [];
      },
    ),
  );

  const summary: PartnerReportSummary = {
    ...emptySummary,
    referralCount: clickIds.length,
    identityAuthorizedCount:
      authorizedClickIds.size,
  };

  for (const clickId of clickIds) {
    const feedback =
      feedbackMap.get(clickId);

    const status =
      feedback &&
      typeof feedback.status === "string"
        ? (feedback.status as FeedbackStatus)
        : "open";

    if (status === "ordered") {
      summary.orderedCount += 1;
      summary.grossRevenue +=
        numericValue(
          feedback?.gross_revenue,
          0,
        );
    } else if (
      status === "not_ordered"
    ) {
      summary.notOrderedCount += 1;
    } else if (
      status === "cancelled"
    ) {
      summary.cancelledCount += 1;
    } else {
      summary.openCount += 1;
    }
  }

  summary.grossRevenue = roundMoney(
    summary.grossRevenue,
  );

  return summary;
}

function getSiteUrl() {
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env
      .VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL ||
    "https://www.handzettel-schulen.de";

  if (
    configured.startsWith("http://") ||
    configured.startsWith("https://")
  ) {
    return configured.replace(/\/$/, "");
  }

  return `https://${configured.replace(
    /\/$/,
    "",
  )}`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatMoney(
  value: number,
  currency: string,
) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency,
  }).format(value);
}

function buildSubject(input: {
  partner: ReportPartner;
  period: Period;
}) {
  return (
    `Handzettel-Schulen.de: ` +
    `Vermittlungsbericht ${input.period.label}`
  );
}

function buildTextMail(input: {
  partner: ReportPartner;
  period: Period;
  summary: PartnerReportSummary;
  portalUrl: string;
}) {
  const greeting =
    input.partner.contactName
      ? `Hallo ${input.partner.contactName},`
      : `Hallo,`;

  return [
    greeting,
    "",
    `hier ist die Zusammenfassung der Vermittlungen von Handzettel-Schulen.de für ${input.period.label}.`,
    "",
    `Vermittlungen: ${input.summary.referralCount}`,
    `Noch offen: ${input.summary.openCount}`,
    `Als bestellt gemeldet: ${input.summary.orderedCount}`,
    `Keine Bestellung: ${input.summary.notOrderedCount}`,
    `Storniert: ${input.summary.cancelledCount}`,
    `Gemeldeter Bruttoumsatz: ${formatMoney(
      input.summary.grossRevenue,
      input.summary.currency,
    )}`,
    "",
    `Bei ${input.summary.identityAuthorizedCount} Vermittlung(en) liegt eine ausdrückliche Freigabe für Name und E-Mail-Adresse vor.`,
    "Personenbezogene Kundendaten werden aus Datenschutzgründen nicht in dieser E-Mail aufgeführt.",
    "",
    "Bitte öffne den geschützten Partnerbereich, prüfe die Vermittlungen und ergänze den jeweiligen Bestellstatus:",
    input.portalUrl,
    "",
    "Der Link ist ausschließlich für Deinen Betrieb bestimmt und darf nicht weitergegeben werden.",
    "",
    "Viele Grüße",
    "Dein Team von Handzettel-Schulen.de",
  ].join("\n");
}

function buildHtmlMail(input: {
  partner: ReportPartner;
  period: Period;
  summary: PartnerReportSummary;
  portalUrl: string;
}) {
  const greeting =
    input.partner.contactName
      ? `Hallo ${escapeHtml(
          input.partner.contactName,
        )},`
      : "Hallo,";

  const money = escapeHtml(
    formatMoney(
      input.summary.grossRevenue,
      input.summary.currency,
    ),
  );

  return `
<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <title>Vermittlungsbericht ${escapeHtml(
      input.period.label,
    )}</title>
  </head>
  <body style="margin:0;padding:0;background:#f6f8fb;font-family:Arial,Helvetica,sans-serif;color:#102a43;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:28px 12px;background:#f6f8fb;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#ffffff;border:1px solid #dfe7ef;border-radius:24px;overflow:hidden;">
            <tr>
              <td style="padding:26px 30px;background:#102a43;color:#ffffff;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td width="74" style="padding-right:16px;">
                      <img
                        src="${escapeHtml(
                          getSiteUrl(),
                        )}/handzettel-logo.png"
                        alt="Handzettel-Schulen.de"
                        width="62"
                        style="display:block;width:62px;height:auto;background:#ffffff;border-radius:14px;padding:6px;"
                      />
                    </td>
                    <td>
                      <div style="font-size:22px;font-weight:800;">Handzettel-Schulen.de</div>
                      <div style="margin-top:6px;font-size:14px;color:#dce8f2;">
                        Vermittlungsbericht ${escapeHtml(
                          input.period.label,
                        )}
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:30px;">
                <p style="margin:0 0 16px;font-size:16px;line-height:1.6;">
                  ${greeting}
                </p>

                <p style="margin:0 0 22px;font-size:16px;line-height:1.6;">
                  hier ist die Zusammenfassung der Vermittlungen für
                  <strong>${escapeHtml(
                    input.period.label,
                  )}</strong>.
                </p>

                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:8px;">
                  <tr>
                    <td style="padding:16px;background:#f6f8fb;border:1px solid #dfe7ef;border-radius:14px;">
                      <div style="font-size:12px;color:#667788;text-transform:uppercase;font-weight:700;">Vermittlungen</div>
                      <div style="margin-top:7px;font-size:26px;font-weight:800;">${input.summary.referralCount}</div>
                    </td>

                    <td style="padding:16px;background:#fff8e8;border:1px solid #f0d79a;border-radius:14px;">
                      <div style="font-size:12px;color:#8b651d;text-transform:uppercase;font-weight:700;">Noch offen</div>
                      <div style="margin-top:7px;font-size:26px;font-weight:800;">${input.summary.openCount}</div>
                    </td>
                  </tr>

                  <tr>
                    <td style="padding:16px;background:#effbf4;border:1px solid #bce4cb;border-radius:14px;">
                      <div style="font-size:12px;color:#2f7d50;text-transform:uppercase;font-weight:700;">Bestellt</div>
                      <div style="margin-top:7px;font-size:26px;font-weight:800;">${input.summary.orderedCount}</div>
                    </td>

                    <td style="padding:16px;background:#eef6ff;border:1px solid #bfd8f2;border-radius:14px;">
                      <div style="font-size:12px;color:#285f91;text-transform:uppercase;font-weight:700;">Bruttoumsatz</div>
                      <div style="margin-top:7px;font-size:22px;font-weight:800;">${money}</div>
                    </td>
                  </tr>
                </table>

                <div style="margin:22px 0;padding:17px;background:#eef6ff;border:1px solid #bfd8f2;border-radius:16px;color:#184f7d;">
                  <strong>${input.summary.identityAuthorizedCount}</strong>
                  Vermittlung(en) enthalten eine ausdrückliche Kundenfreigabe
                  für Name und E-Mail-Adresse. Diese Daten werden nicht in der
                  E-Mail angezeigt, sondern ausschließlich im geschützten
                  Partnerbereich.
                </div>

                <table role="presentation" cellspacing="0" cellpadding="0" style="margin:26px 0;">
                  <tr>
                    <td style="border-radius:15px;background:#102a43;">
                      <a
                        href="${escapeHtml(
                          input.portalUrl,
                        )}"
                        style="display:inline-block;padding:16px 24px;color:#ffffff;text-decoration:none;font-size:16px;font-weight:800;border-radius:15px;"
                      >
                        Vermittlungen im Partnerbereich prüfen
                      </a>
                    </td>
                  </tr>
                </table>

                <p style="margin:0;font-size:14px;line-height:1.6;color:#667788;">
                  Der geschützte Link ist ausschließlich für Deinen Betrieb
                  bestimmt und darf nicht weitergegeben werden.
                </p>

                <p style="margin:24px 0 0;font-size:16px;line-height:1.6;">
                  Viele Grüße<br />
                  Dein Team von Handzettel-Schulen.de
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding:18px 30px;background:#f6f8fb;font-size:12px;line-height:1.5;color:#667788;">
                Personenbezogene Kundendaten werden nicht im E-Mail-Text
                übermittelt. Freigegebene Daten sind ausschließlich im
                geschützten Partnerbereich sichtbar.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

async function hasExistingCronReport(input: {
  partnerId: string;
  projectKey: string;
  period: Period;
}) {
  const supabase =
    getRecommendationAdminClient();

  const { data, error } = await supabase
    .from("recommendation_partner_reports")
    .select("id")
    .eq("partner_id", input.partnerId)
    .eq("project_key", input.projectKey)
    .eq(
      "period_start",
      input.period.startDate,
    )
    .eq(
      "period_end",
      input.period.endDate,
    )
    .eq("requested_by", "cron")
    .eq("status", "sent")
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Vorhandene Berichte konnten nicht geprüft werden: ${error.message}`,
    );
  }

  return Boolean(data);
}

async function createReportRow(input: {
  partner: ReportPartner;
  period: Period;
  summary: PartnerReportSummary;
  requestedBy: RequestedBy;
  subject: string;
}) {
  const supabase =
    getRecommendationAdminClient();

  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("recommendation_partner_reports")
    .insert({
      project_key:
        input.partner.projectKey,
      partner_id: input.partner.id,
      period_start:
        input.period.startDate,
      period_end:
        input.period.endDate,
      recipient_email:
        input.partner.contactEmail,
      status: "pending",
      referral_count:
        input.summary.referralCount,
      open_count:
        input.summary.openCount,
      ordered_count:
        input.summary.orderedCount,
      not_ordered_count:
        input.summary.notOrderedCount,
      cancelled_count:
        input.summary.cancelledCount,
      identity_authorized_count:
        input.summary
          .identityAuthorizedCount,
      identity_included_count: 0,
      gross_revenue:
        input.summary.grossRevenue,
      currency:
        input.summary.currency,
      portal_url: null,
      subject_snapshot: input.subject,
      requested_by:
        input.requestedBy,
      requested_at: now,
      created_at: now,
      updated_at: now,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(
      `Berichtsprotokoll konnte nicht angelegt werden: ${
        error?.message ??
        "Keine Daten zurückgegeben"
      }`,
    );
  }

  return requiredText(
    data.id,
    "Berichts-ID",
  );
}

async function markReportSending(
  reportId: string,
) {
  const supabase =
    getRecommendationAdminClient();

  const { error } = await supabase
    .from("recommendation_partner_reports")
    .update({
      status: "sending",
      updated_at:
        new Date().toISOString(),
    })
    .eq("id", reportId);

  if (error) {
    throw new Error(
      `Bericht konnte nicht als versendend markiert werden: ${error.message}`,
    );
  }
}

async function markReportSent(input: {
  reportId: string;
  messageId: string | null;
}) {
  const supabase =
    getRecommendationAdminClient();

  const now = new Date().toISOString();

  const { error } = await supabase
    .from("recommendation_partner_reports")
    .update({
      status: "sent",
      message_id: input.messageId,
      error_message: null,
      sent_at: now,
      failed_at: null,
      updated_at: now,
    })
    .eq("id", input.reportId);

  if (error) {
    throw new Error(
      `Versandstatus konnte nicht gespeichert werden: ${error.message}`,
    );
  }
}

async function markReportFailed(input: {
  reportId: string;
  message: string;
}) {
  const supabase =
    getRecommendationAdminClient();

  const now = new Date().toISOString();

  const { error } = await supabase
    .from("recommendation_partner_reports")
    .update({
      status: "failed",
      error_message:
        input.message.slice(0, 5000),
      sent_at: null,
      failed_at: now,
      updated_at: now,
    })
    .eq("id", input.reportId);

  if (error) {
    console.error(
      "[Partner monthly report] Fehlerstatus konnte nicht gespeichert werden",
      {
        reportId: input.reportId,
        errorMessage: error.message,
      },
    );
  }
}

async function processPartner(input: {
  partner: ReportPartner;
  period: Period;
  mode: PartnerMonthlyReportMode;
  requestedBy: RequestedBy;
  force: boolean;
}): Promise<PartnerMonthlyReportResult> {
  const summary = await loadPartnerSummary({
    partner: input.partner,
    period: input.period,
  });

  const baseResult = {
    partnerId: input.partner.id,
    partnerName: input.partner.name,
    recipientEmail:
      input.partner.contactEmail,
    period: input.period.key,
    summary,
  };

  if (summary.referralCount === 0) {
    return {
      ...baseResult,
      status: "skipped_no_referrals",
      reportId: null,
      message:
        "Im Berichtszeitraum wurden keine menschlichen Vermittlungsklicks gefunden.",
    };
  }

  if (
    input.mode === "dry_run"
  ) {
    return {
      ...baseResult,
      status: "dry_run",
      reportId: null,
      message:
        "Dry-Run erfolgreich. Es wurden keine E-Mail, kein Portalzugang und kein Berichtsdatensatz erzeugt.",
    };
  }

  if (
    input.requestedBy === "cron" &&
    !input.force
  ) {
    const duplicate =
      await hasExistingCronReport({
        partnerId: input.partner.id,
        projectKey:
          input.partner.projectKey,
        period: input.period,
      });

    if (duplicate) {
      return {
        ...baseResult,
        status: "skipped_duplicate",
        reportId: null,
        message:
          "Für diesen Partner und Zeitraum wurde bereits ein automatischer Bericht versendet.",
      };
    }
  }

  const subject = buildSubject({
    partner: input.partner,
    period: input.period,
  });

  const reportId = await createReportRow({
    partner: input.partner,
    period: input.period,
    summary,
    requestedBy:
      input.requestedBy,
    subject,
  });

  let accessId: string | null = null;

  try {
    await markReportSending(reportId);

    const expiresAt = new Date(
      Date.now() +
        REPORT_ACCESS_VALID_DAYS *
          24 *
          60 *
          60 *
          1000,
    ).toISOString();

    const access =
      await createPartnerPortalAccess({
        partnerId: input.partner.id,
        projectKey:
          input.partner.projectKey,
        label:
          `Monatsbericht ${input.period.label}`,
        expiresAt,
        deactivateExisting: false,
      });

    accessId = access.accessId;

    const portalUrl =
      `${getSiteUrl()}${access.path}`;

    const mailResult =
      await sendMailReliable({
        to: input.partner.contactEmail,
        subject,
        text: buildTextMail({
          partner: input.partner,
          period: input.period,
          summary,
          portalUrl,
        }),
        html: buildHtmlMail({
          partner: input.partner,
          period: input.period,
          summary,
          portalUrl,
        }),
      });

    await markReportSent({
      reportId,
      messageId:
        typeof mailResult.messageId ===
        "string"
          ? mailResult.messageId
          : null,
    });

    return {
      ...baseResult,
      status: "sent",
      reportId,
      message:
        "Der Monatsbericht wurde versendet.",
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unbekannter Fehler beim Monatsbericht.";

    await markReportFailed({
      reportId,
      message,
    });

    if (accessId) {
      try {
        await deactivatePartnerPortalAccess(
          accessId,
          input.partner.projectKey,
        );
      } catch (deactivateError) {
        console.error(
          "[Partner monthly report] Unbenutzter Portalzugang konnte nicht deaktiviert werden",
          {
            accessId,
            error:
              deactivateError instanceof Error
                ? deactivateError.message
                : "Unbekannter Fehler",
          },
        );
      }
    }

    return {
      ...baseResult,
      status: "failed",
      reportId,
      message,
    };
  }
}

export async function processPartnerMonthlyReports(
  input: ProcessPartnerMonthlyReportsInput,
): Promise<ProcessPartnerMonthlyReportsResult> {
  const projectKey =
    recommendationProjectKey(
      input.projectKey ??
        DEFAULT_RECOMMENDATION_PROJECT_KEY,
    );

  const now = input.now ?? new Date();

  if (
    Number.isNaN(now.getTime())
  ) {
    throw new Error(
      "Der Ausführungszeitpunkt ist ungültig.",
    );
  }

  const period = resolvePeriod(
    input.period,
    now,
  );

  const partners =
    await loadReportPartners({
      projectKey,
      partnerId:
        input.partnerId ?? null,
    });

  const results: PartnerMonthlyReportResult[] =
    [];

  for (const partner of partners) {
    try {
      results.push(
        await processPartner({
          partner,
          period,
          mode: input.mode,
          requestedBy:
            input.requestedBy,
          force: input.force === true,
        }),
      );
    } catch (error) {
      results.push({
        partnerId: partner.id,
        partnerName: partner.name,
        recipientEmail:
          partner.contactEmail,
        period: period.key,
        status: "failed",
        reportId: null,
        message:
          error instanceof Error
            ? error.message
            : "Der Partnerbericht konnte nicht verarbeitet werden.",
        summary: {
          referralCount: 0,
          openCount: 0,
          orderedCount: 0,
          notOrderedCount: 0,
          cancelledCount: 0,
          identityAuthorizedCount: 0,
          identityIncludedCount: 0,
          grossRevenue: 0,
          currency: partner.currency,
        },
      });
    }
  }

  const responseSummary = {
    partnersChecked: results.length,
    dryRun: results.filter(
      (result) =>
        result.status === "dry_run",
    ).length,
    sent: results.filter(
      (result) =>
        result.status === "sent",
    ).length,
    failed: results.filter(
      (result) =>
        result.status === "failed",
    ).length,
    skippedNoReferrals: results.filter(
      (result) =>
        result.status ===
        "skipped_no_referrals",
    ).length,
    skippedDuplicate: results.filter(
      (result) =>
        result.status ===
        "skipped_duplicate",
    ).length,
  };

  return {
    ok: responseSummary.failed === 0,
    mode: input.mode,
    projectKey,
    period,
    results,
    summary: responseSummary,
  };
}