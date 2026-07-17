"use client";

import {
  AlertCircle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Loader2,
  Mail,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

export type PartnerMonthlyReportPartner = {
  id: string;
  name: string;
  partnerCode: string;
  contactEmail: string | null;
  active: boolean;
  partnerPortalEnabled: boolean;
  reportFrequency: string | null;
};

export type PartnerMonthlyReportHistoryRow = {
  id: string;
  partnerId: string;
  partnerName: string;
  periodStart: string;
  periodEnd: string;
  recipientEmail: string;
  status: string;
  referralCount: number;
  openCount: number;
  orderedCount: number;
  notOrderedCount: number;
  cancelledCount: number;
  identityAuthorizedCount: number;
  identityIncludedCount: number;
  grossRevenue: number;
  currency: string;
  requestedBy: string;
  requestedAt: string | null;
  sentAt: string | null;
  failedAt: string | null;
  errorMessage: string | null;
};

type ReportSummary = {
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

type ProcessResult = {
  partnerId: string;
  partnerName: string;
  recipientEmail: string | null;
  period: string;
  summary: ReportSummary;
  status:
    | "dry_run"
    | "sent"
    | "failed"
    | "skipped_no_referrals"
    | "skipped_duplicate";
  reportId: string | null;
  message: string;
};

type ApiResult = {
  ok?: boolean;
  message?: string;
  mode?: "dry_run" | "send";
  results?: ProcessResult[];
  summary?: {
    partnersChecked: number;
    dryRun: number;
    sent: number;
    failed: number;
    skippedNoReferrals: number;
    skippedDuplicate: number;
  };
};

type Props = {
  initialPartners: PartnerMonthlyReportPartner[];
  initialHistory: PartnerMonthlyReportHistoryRow[];
  initialError?: string | null;
};

type Feedback = {
  type: "success" | "error" | "info";
  message: string;
} | null;

const fieldClass =
  "min-h-12 w-full rounded-2xl border border-[#D8C8B8] bg-[#FFFCF8] px-4 text-sm font-bold text-[#102A43] outline-none transition focus:border-[#12395F] focus:bg-white focus:ring-4 focus:ring-[#12395F]/10";

function previousMonthKey() {
  const now = new Date();
  const date = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth() - 1,
      1,
    ),
  );

  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
  ].join("-");
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "–";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "–";
  }

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  }).format(date);
}

function formatPeriod(
  startValue: string,
  endValue: string,
) {
  const start = new Date(`${startValue}T00:00:00Z`);
  const end = new Date(`${endValue}T00:00:00Z`);

  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime())
  ) {
    return `${startValue} bis ${endValue}`;
  }

  const monthLabel = new Intl.DateTimeFormat(
    "de-DE",
    {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    },
  ).format(start);

  return monthLabel;
}

function formatMoney(
  value: number,
  currency: string,
) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: currency || "EUR",
  }).format(value);
}

function statusLabel(status: string) {
  switch (status) {
    case "sent":
      return "Versendet";
    case "sending":
      return "Wird versendet";
    case "pending":
      return "Vorbereitet";
    case "failed":
      return "Fehlgeschlagen";
    case "dry_run":
      return "Dry-Run";
    case "skipped_no_referrals":
      return "Keine Vermittlungen";
    case "skipped_duplicate":
      return "Bereits versendet";
    default:
      return status || "Unbekannt";
  }
}

function statusClass(status: string) {
  switch (status) {
    case "sent":
      return "bg-[#EAF8E8] text-[#2E7D32]";
    case "failed":
      return "bg-[#FFF1F1] text-[#9F1D1D]";
    case "sending":
    case "pending":
      return "bg-[#FFF8E8] text-[#8B651D]";
    default:
      return "bg-[#EEF4FA] text-[#12395F]";
  }
}

async function readJson(
  response: Response,
): Promise<ApiResult | null> {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as ApiResult;
  } catch {
    return null;
  }
}

function SummaryCards({
  summary,
}: {
  summary: ReportSummary;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-2xl border border-[#D6E7EF] bg-[#F5FAFD] p-4">
        <p className="text-xs font-black uppercase tracking-[0.13em] text-[#12395F]">
          Vermittlungen
        </p>
        <p className="mt-2 text-3xl font-black text-[#102A43]">
          {summary.referralCount}
        </p>
      </div>

      <div className="rounded-2xl border border-[#F0D79A] bg-[#FFF8E8] p-4">
        <p className="text-xs font-black uppercase tracking-[0.13em] text-[#8B651D]">
          Noch offen
        </p>
        <p className="mt-2 text-3xl font-black text-[#102A43]">
          {summary.openCount}
        </p>
      </div>

      <div className="rounded-2xl border border-[#BCE4CB] bg-[#EFFBF4] p-4">
        <p className="text-xs font-black uppercase tracking-[0.13em] text-[#2F7D50]">
          Bestellt
        </p>
        <p className="mt-2 text-3xl font-black text-[#102A43]">
          {summary.orderedCount}
        </p>
      </div>

      <div className="rounded-2xl border border-[#BFD8F2] bg-[#EEF6FF] p-4">
        <p className="text-xs font-black uppercase tracking-[0.13em] text-[#285F91]">
          Bruttoumsatz
        </p>
        <p className="mt-2 text-2xl font-black text-[#102A43]">
          {formatMoney(
            summary.grossRevenue,
            summary.currency,
          )}
        </p>
      </div>
    </div>
  );
}

export default function AdminPartnerMonthlyReports({
  initialPartners,
  initialHistory,
  initialError,
}: Props) {
  const router = useRouter();

  const eligiblePartners = useMemo(
    () =>
      initialPartners.filter(
        (partner) =>
          partner.active &&
          partner.partnerPortalEnabled &&
          partner.reportFrequency === "monthly" &&
          Boolean(partner.contactEmail),
      ),
    [initialPartners],
  );

  const [partnerId, setPartnerId] = useState(
    eligiblePartners[0]?.id ?? "",
  );

  const [period, setPeriod] = useState(
    previousMonthKey(),
  );

  const [pendingMode, setPendingMode] = useState<
    "dry_run" | "send" | null
  >(null);

  const [feedback, setFeedback] =
    useState<Feedback>(
      initialError
        ? {
            type: "error",
            message: initialError,
          }
        : null,
    );

  const [lastResults, setLastResults] =
    useState<ProcessResult[]>([]);

  const selectedPartner =
    eligiblePartners.find(
      (partner) => partner.id === partnerId,
    ) ?? null;

  async function execute(
    mode: "dry_run" | "send",
  ) {
    if (pendingMode) {
      return;
    }

    if (!partnerId) {
      setFeedback({
        type: "error",
        message:
          "Bitte wähle einen berichtsfähigen Empfehlungspartner aus.",
      });
      return;
    }

    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
      setFeedback({
        type: "error",
        message:
          "Bitte wähle einen gültigen Berichtsmonat aus.",
      });
      return;
    }

    if (mode === "send") {
      const confirmed = window.confirm(
        `Monatsbericht für „${
          selectedPartner?.name ?? "den ausgewählten Partner"
        }“ und den Zeitraum ${period} jetzt wirklich versenden?\n\nDabei wird ein neuer geschützter Partnerportal-Zugang erzeugt und eine E-Mail versendet.`,
      );

      if (!confirmed) {
        return;
      }
    }

    setPendingMode(mode);
    setFeedback(null);
    setLastResults([]);

    try {
      const response = await fetch(
        "/api/admin/recommendation-partner-reports",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          cache: "no-store",
          body: JSON.stringify({
            mode,
            period,
            partnerId,
          }),
        },
      );

      const payload = await readJson(response);
      const results = Array.isArray(payload?.results)
        ? payload.results
        : [];

      setLastResults(results);

      if (!response.ok || payload?.ok !== true) {
        const resultMessage =
          results.find(
            (result) => result.status === "failed",
          )?.message;

        throw new Error(
          resultMessage ||
            payload?.message ||
            "Der Monatsbericht konnte nicht verarbeitet werden.",
        );
      }

      setFeedback({
        type: "success",
        message:
          mode === "dry_run"
            ? "Dry-Run erfolgreich. Es wurden keine E-Mail, kein Portalzugang und kein Berichtsdatensatz erzeugt."
            : "Der Monatsbericht wurde erfolgreich versendet.",
      });

      if (mode === "send") {
        router.refresh();
      }
    } catch (error) {
      setFeedback({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Der Monatsbericht konnte nicht verarbeitet werden.",
      });
    } finally {
      setPendingMode(null);
    }
  }

  return (
    <div className="grid gap-6">
      {feedback ? (
        <div
          role="status"
          className={
            "flex items-start gap-3 rounded-2xl border px-4 py-4 text-sm font-bold leading-6 " +
            (feedback.type === "error"
              ? "border-[#F3B3B3] bg-[#FFF1F1] text-[#9F1D1D]"
              : feedback.type === "success"
                ? "border-[#B8DEC1] bg-[#F2FFF4] text-[#1E6B32]"
                : "border-[#BFD8F2] bg-[#EEF6FF] text-[#184F7D]")
          }
        >
          {feedback.type === "error" ? (
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          ) : (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          )}

          <span>{feedback.message}</span>
        </div>
      ) : null}

      <section className="rounded-[30px] border border-[#E8DED2] bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-[#EEF4FA] px-3 py-1 text-xs font-black uppercase tracking-[0.15em] text-[#12395F]">
              <CalendarDays className="h-3.5 w-3.5" />
              Berichtssteuerung
            </div>

            <h2 className="mt-3 text-2xl font-black text-[#102A43]">
              Monatsbericht vorbereiten
            </h2>

            <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#52616F]">
              Der Dry-Run berechnet ausschließlich die Kennzahlen.
              Beim Versand werden der Berichtsdatensatz, ein neuer
              geschützter Portalzugang und die Partner-E-Mail erzeugt.
            </p>
          </div>

          <div className="rounded-2xl border border-[#BFD8F2] bg-[#EEF6FF] p-4 text-sm font-bold leading-6 text-[#184F7D] xl:max-w-md">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
              <p>
                Kundennamen und E-Mail-Adressen werden nicht im
                E-Mail-Text versendet. Freigegebene Identitäten sind
                ausschließlich im geschützten Partnerportal sichtbar.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <label className="grid gap-2">
            <span className="text-xs font-black uppercase tracking-[0.13em] text-[#52616F]">
              Empfehlungspartner
            </span>

            <select
              value={partnerId}
              onChange={(event) =>
                setPartnerId(event.target.value)
              }
              className={fieldClass}
              disabled={
                Boolean(pendingMode) ||
                eligiblePartners.length === 0
              }
            >
              {eligiblePartners.length === 0 ? (
                <option value="">
                  Kein berichtsfähiger Partner vorhanden
                </option>
              ) : null}

              {eligiblePartners.map((partner) => (
                <option
                  key={partner.id}
                  value={partner.id}
                >
                  {partner.name} · {partner.contactEmail}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2">
            <span className="text-xs font-black uppercase tracking-[0.13em] text-[#52616F]">
              Berichtsmonat
            </span>

            <input
              type="month"
              value={period}
              onChange={(event) =>
                setPeriod(event.target.value)
              }
              className={fieldClass}
              disabled={Boolean(pendingMode)}
            />
          </label>
        </div>

        {selectedPartner ? (
          <div className="mt-4 grid gap-3 rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] p-4 sm:grid-cols-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.12em] text-[#A75B28]">
                Partner
              </p>
              <p className="mt-1 text-sm font-black text-[#102A43]">
                {selectedPartner.name}
              </p>
            </div>

            <div>
              <p className="text-xs font-black uppercase tracking-[0.12em] text-[#A75B28]">
                Partnerkennung
              </p>
              <p className="mt-1 text-sm font-black text-[#102A43]">
                {selectedPartner.partnerCode}
              </p>
            </div>

            <div>
              <p className="text-xs font-black uppercase tracking-[0.12em] text-[#A75B28]">
                Empfänger
              </p>
              <p className="mt-1 break-all text-sm font-black text-[#102A43]">
                {selectedPartner.contactEmail}
              </p>
            </div>
          </div>
        ) : null}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => execute("dry_run")}
            disabled={
              Boolean(pendingMode) ||
              !partnerId
            }
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-[#12395F] bg-white px-5 text-sm font-black text-[#12395F] transition hover:bg-[#EEF4FA] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pendingMode === "dry_run" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            Dry-Run starten
          </button>

          <button
            type="button"
            onClick={() => execute("send")}
            disabled={
              Boolean(pendingMode) ||
              !partnerId
            }
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#12395F] px-5 text-sm font-black text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pendingMode === "send" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Monatsbericht versenden
          </button>

          <button
            type="button"
            onClick={() => router.refresh()}
            disabled={Boolean(pendingMode)}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-[#D8C8B8] bg-[#FBF7F0] px-5 text-sm font-black text-[#52616F] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className="h-4 w-4" />
            Ansicht aktualisieren
          </button>
        </div>
      </section>

      {lastResults.length > 0 ? (
        <section className="rounded-[30px] border border-[#D6E7EF] bg-[#F5FAFD] p-5 shadow-sm sm:p-7">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[#12395F]">
              <BarChart3 className="h-5 w-5" />
            </div>

            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[#12395F]">
                Letztes Ergebnis
              </p>
              <h2 className="mt-1 text-xl font-black text-[#102A43]">
                Auswertung des Berichtslaufs
              </h2>
            </div>
          </div>

          <div className="mt-5 grid gap-5">
            {lastResults.map((result) => (
              <article
                key={`${result.partnerId}-${result.status}`}
                className="rounded-[24px] border border-[#D6E7EF] bg-white p-5"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-lg font-black text-[#102A43]">
                      {result.partnerName}
                    </h3>
                    <p className="mt-1 text-sm font-semibold text-[#52616F]">
                      Zeitraum {result.period} ·{" "}
                      {result.recipientEmail ?? "Kein Empfänger"}
                    </p>
                  </div>

                  <span
                    className={
                      "w-fit rounded-full px-3 py-1 text-xs font-black " +
                      statusClass(result.status)
                    }
                  >
                    {statusLabel(result.status)}
                  </span>
                </div>

                <div className="mt-5">
                  <SummaryCards summary={result.summary} />
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl bg-[#FBF7F0] p-3">
                    <p className="text-xs font-black uppercase tracking-[0.11em] text-[#A75B28]">
                      Keine Bestellung
                    </p>
                    <p className="mt-1 text-xl font-black text-[#102A43]">
                      {result.summary.notOrderedCount}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-[#FBF7F0] p-3">
                    <p className="text-xs font-black uppercase tracking-[0.11em] text-[#A75B28]">
                      Storniert
                    </p>
                    <p className="mt-1 text-xl font-black text-[#102A43]">
                      {result.summary.cancelledCount}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-[#FBF7F0] p-3">
                    <p className="text-xs font-black uppercase tracking-[0.11em] text-[#A75B28]">
                      Identitätsfreigaben
                    </p>
                    <p className="mt-1 text-xl font-black text-[#102A43]">
                      {result.summary.identityAuthorizedCount}
                    </p>
                  </div>
                </div>

                <p className="mt-4 text-sm font-bold leading-6 text-[#52616F]">
                  {result.message}
                </p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-[30px] border border-[#E8DED2] bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-[#FBF7F0] px-3 py-1 text-xs font-black uppercase tracking-[0.15em] text-[#A75B28]">
              <Mail className="h-3.5 w-3.5" />
              Versandprotokoll
            </div>

            <h2 className="mt-3 text-2xl font-black text-[#102A43]">
              Berichtshistorie
            </h2>

            <p className="mt-2 text-sm font-semibold leading-6 text-[#52616F]">
              Angezeigt werden die letzten 100 gespeicherten
              Versandversuche einschließlich Fehlerprotokoll.
            </p>
          </div>

          <div className="inline-flex items-center gap-2 rounded-2xl bg-[#EEF4FA] px-4 py-3 text-sm font-black text-[#12395F]">
            <UsersRound className="h-4 w-4" />
            {initialHistory.length} Einträge
          </div>
        </div>

        {initialHistory.length === 0 ? (
          <div className="mt-6 rounded-[24px] border border-dashed border-[#D8C8B8] bg-[#FBF7F0] p-8 text-center">
            <p className="text-lg font-black text-[#102A43]">
              Noch keine Berichte gespeichert
            </p>
            <p className="mt-2 text-sm font-semibold text-[#52616F]">
              Ein Dry-Run erzeugt keinen Historieneintrag. Erst ein
              echter Versandversuch wird protokolliert.
            </p>
          </div>
        ) : (
          <div className="mt-6 grid gap-4">
            {initialHistory.map((report) => (
              <article
                key={report.id}
                className="rounded-[24px] border border-[#E8DED2] bg-[#FFFCF8] p-4 sm:p-5"
              >
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-black text-[#102A43]">
                        {report.partnerName}
                      </h3>

                      <span
                        className={
                          "rounded-full px-3 py-1 text-xs font-black " +
                          statusClass(report.status)
                        }
                      >
                        {statusLabel(report.status)}
                      </span>

                      <span className="rounded-full bg-[#EEF4FA] px-3 py-1 text-xs font-black text-[#12395F]">
                        {formatPeriod(
                          report.periodStart,
                          report.periodEnd,
                        )}
                      </span>
                    </div>

                    <p className="mt-2 break-all text-sm font-semibold text-[#52616F]">
                      Empfänger: {report.recipientEmail}
                    </p>
                  </div>

                  <div className="text-sm font-bold text-[#52616F] xl:text-right">
                    <p>
                      Angefordert:{" "}
                      {formatDateTime(report.requestedAt)}
                    </p>
                    <p className="mt-1">
                      Versendet:{" "}
                      {formatDateTime(report.sentAt)}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
                  <div className="rounded-2xl bg-white p-3">
                    <p className="text-xs font-black text-[#52616F]">
                      Vermittlungen
                    </p>
                    <p className="mt-1 text-xl font-black text-[#102A43]">
                      {report.referralCount}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-white p-3">
                    <p className="text-xs font-black text-[#52616F]">
                      Offen
                    </p>
                    <p className="mt-1 text-xl font-black text-[#102A43]">
                      {report.openCount}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-white p-3">
                    <p className="text-xs font-black text-[#52616F]">
                      Bestellt
                    </p>
                    <p className="mt-1 text-xl font-black text-[#102A43]">
                      {report.orderedCount}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-white p-3">
                    <p className="text-xs font-black text-[#52616F]">
                      Nicht bestellt
                    </p>
                    <p className="mt-1 text-xl font-black text-[#102A43]">
                      {report.notOrderedCount}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-white p-3">
                    <p className="text-xs font-black text-[#52616F]">
                      Storniert
                    </p>
                    <p className="mt-1 text-xl font-black text-[#102A43]">
                      {report.cancelledCount}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-white p-3">
                    <p className="text-xs font-black text-[#52616F]">
                      Freigaben
                    </p>
                    <p className="mt-1 text-xl font-black text-[#102A43]">
                      {report.identityAuthorizedCount}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-white p-3">
                    <p className="text-xs font-black text-[#52616F]">
                      Umsatz
                    </p>
                    <p className="mt-1 text-lg font-black text-[#102A43]">
                      {formatMoney(
                        report.grossRevenue,
                        report.currency,
                      )}
                    </p>
                  </div>
                </div>

                {report.errorMessage ? (
                  <div className="mt-4 flex items-start gap-3 rounded-2xl border border-[#F3B3B3] bg-[#FFF1F1] p-4 text-sm font-bold leading-6 text-[#9F1D1D]">
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                    <span>{report.errorMessage}</span>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}