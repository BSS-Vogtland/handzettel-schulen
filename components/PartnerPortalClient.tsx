"use client";

import {
  AlertCircle,
  BadgeCheck,
  Ban,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  Euro,
  ExternalLink,
  Loader2,
  RefreshCw,
  Save,
  ShoppingCart,
  XCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useMemo,
  useState,
} from "react";
import type {
  PartnerPortalReferral,
  PartnerPortalReferralList,
  PartnerReferralFeedbackStatus,
} from "@/app/lib/recommendations/partnerPortalService";

type PartnerPortalClientProps = {
  token: string;
  initialData: PartnerPortalReferralList;
};

type ReferralFormState = {
  status: PartnerReferralFeedbackStatus;
  orderDate: string;
  grossRevenue: string;
  externalOrderReference: string;
  partnerNote: string;
};

type SaveState = {
  loading: boolean;
  success: string | null;
  error: string | null;
};

const STATUS_OPTIONS: Array<{
  value: PartnerReferralFeedbackStatus;
  label: string;
}> = [
  {
    value: "open",
    label: "Noch offen",
  },
  {
    value: "ordered",
    label: "Bestellung erfolgt",
  },
  {
    value: "not_ordered",
    label: "Keine Bestellung",
  },
  {
    value: "cancelled",
    label: "Bestellung storniert",
  },
];

function createFormState(
  referral: PartnerPortalReferral,
): ReferralFormState {
  return {
    status: referral.status,
    orderDate: referral.orderDate ?? "",
    grossRevenue:
      referral.grossRevenue === null
        ? ""
        : referral.grossRevenue.toFixed(2).replace(".", ","),
    externalOrderReference:
      referral.externalOrderReference ?? "",
    partnerNote: referral.partnerNote ?? "",
  };
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unbekannt";
  }

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatDate(value: string | null) {
  if (!value) {
    return "Nicht angegeben";
  }

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
  }).format(date);
}

function formatMoney(
  value: number,
  currency = "EUR",
) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency,
  }).format(value);
}

function statusLabel(
  status: PartnerReferralFeedbackStatus,
) {
  return (
    STATUS_OPTIONS.find(
      (option) => option.value === status,
    )?.label ?? status
  );
}

function statusClasses(
  status: PartnerReferralFeedbackStatus,
) {
  if (status === "ordered") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  if (status === "not_ordered") {
    return "border-slate-200 bg-slate-100 text-slate-700";
  }

  if (status === "cancelled") {
    return "border-red-200 bg-red-50 text-red-800";
  }

  return "border-amber-200 bg-amber-50 text-amber-800";
}

function statusIcon(
  status: PartnerReferralFeedbackStatus,
) {
  if (status === "ordered") {
    return <CheckCircle2 className="h-4 w-4" />;
  }

  if (status === "not_ordered") {
    return <Ban className="h-4 w-4" />;
  }

  if (status === "cancelled") {
    return <XCircle className="h-4 w-4" />;
  }

  return <CircleDashed className="h-4 w-4" />;
}

function ReferralCard({
  token,
  referral,
}: {
  token: string;
  referral: PartnerPortalReferral;
}) {
  const router = useRouter();

  const [open, setOpen] = useState(
    referral.status === "open",
  );

  const [form, setForm] =
    useState<ReferralFormState>(
      createFormState(referral),
    );

  const [saveState, setSaveState] =
    useState<SaveState>({
      loading: false,
      success: null,
      error: null,
    });

  const ordered = form.status === "ordered";

  async function saveFeedback() {
    if (
      ordered &&
      (!form.orderDate.trim() ||
        !form.grossRevenue.trim())
    ) {
      setSaveState({
        loading: false,
        success: null,
        error:
          "Bei einer Bestellung sind Bestelldatum und Bruttoumsatz erforderlich.",
      });

      return;
    }

    setSaveState({
      loading: true,
      success: null,
      error: null,
    });

    try {
      const response = await fetch(
        `/api/partnerportal/${encodeURIComponent(
          token,
        )}/feedback/${encodeURIComponent(
          referral.feedbackId,
        )}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          cache: "no-store",
          body: JSON.stringify({
            status: form.status,
            orderDate: ordered
              ? form.orderDate
              : null,
            grossRevenue: ordered
              ? form.grossRevenue
              : null,
            externalOrderReference:
              form.externalOrderReference,
            partnerNote: form.partnerNote,
            currency: referral.currency,
          }),
        },
      );

      const result = (await response.json().catch(
        () => null,
      )) as
        | {
            ok?: boolean;
            message?: string;
          }
        | null;

      if (!response.ok || result?.ok !== true) {
        throw new Error(
          result?.message ||
            "Die Rückmeldung konnte nicht gespeichert werden.",
        );
      }

      setSaveState({
        loading: false,
        success:
          "Rückmeldung wurde gespeichert.",
        error: null,
      });

      router.refresh();
    } catch (error) {
      setSaveState({
        loading: false,
        success: null,
        error:
          error instanceof Error
            ? error.message
            : "Die Rückmeldung konnte nicht gespeichert werden.",
      });
    }
  }

  return (
    <article className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-start justify-between gap-5 px-5 py-5 text-left sm:px-7"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${statusClasses(
                referral.status,
              )}`}
            >
              {statusIcon(referral.status)}
              {statusLabel(referral.status)}
            </span>

            <span className="rounded-full bg-[#102a43] px-3 py-1 font-mono text-xs font-bold tracking-wide text-white">
              {referral.referralCode}
            </span>
          </div>

          <h2 className="mt-3 text-lg font-bold text-[#102a43]">
            {referral.categoryName}
          </h2>

          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-500">
            <span>
              Vermittelt am{" "}
              {formatDateTime(referral.clickedAt)}
            </span>

            {referral.matchedTerm ? (
              <span>
                Bezug: {referral.matchedTerm}
              </span>
            ) : null}
          </div>
        </div>

        <ChevronDown
          className={`mt-1 h-5 w-5 shrink-0 text-slate-400 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open ? (
        <div className="border-t border-slate-100 px-5 pb-6 pt-5 sm:px-7">
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
            Bitte prüfe in Deinem Bestellsystem, ob der
            Vermittlungscode{" "}
            <strong>{referral.referralCode}</strong>{" "}
            einer Bestellung zugeordnet werden kann.
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">
                Status
              </span>

              <select
                value={form.status}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    status: event.target
                      .value as PartnerReferralFeedbackStatus,
                  }))
                }
                className="h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm outline-none transition focus:border-[#102a43] focus:ring-2 focus:ring-[#102a43]/10"
              >
                {STATUS_OPTIONS.map((option) => (
                  <option
                    key={option.value}
                    value={option.value}
                  >
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">
                Interne Bestellnummer
              </span>

              <input
                type="text"
                value={
                  form.externalOrderReference
                }
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    externalOrderReference:
                      event.target.value,
                  }))
                }
                maxLength={250}
                placeholder="z. B. 2026-4711"
                className="h-12 w-full rounded-xl border border-slate-300 px-4 text-sm outline-none transition focus:border-[#102a43] focus:ring-2 focus:ring-[#102a43]/10"
              />
            </label>

            {ordered ? (
              <>
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-700">
                    Bestelldatum*
                  </span>

                  <input
                    type="date"
                    value={form.orderDate}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        orderDate:
                          event.target.value,
                      }))
                    }
                    className="h-12 w-full rounded-xl border border-slate-300 px-4 text-sm outline-none transition focus:border-[#102a43] focus:ring-2 focus:ring-[#102a43]/10"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-700">
                    Bruttoumsatz*
                  </span>

                  <div className="relative">
                    <Euro className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                    <input
                      type="text"
                      inputMode="decimal"
                      value={form.grossRevenue}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          grossRevenue:
                            event.target.value,
                        }))
                      }
                      placeholder="0,00"
                      className="h-12 w-full rounded-xl border border-slate-300 pl-11 pr-4 text-sm outline-none transition focus:border-[#102a43] focus:ring-2 focus:ring-[#102a43]/10"
                    />
                  </div>
                </label>
              </>
            ) : null}
          </div>

          <label className="mt-5 block">
            <span className="mb-2 block text-sm font-semibold text-slate-700">
              Notiz
            </span>

            <textarea
              value={form.partnerNote}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  partnerNote:
                    event.target.value,
                }))
              }
              maxLength={2000}
              rows={4}
              placeholder="Optionaler Hinweis zur Bestellung oder Zuordnung"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-[#102a43] focus:ring-2 focus:ring-[#102a43]/10"
            />
          </label>

          {referral.status === "ordered" ? (
            <div className="mt-5 grid gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-900 sm:grid-cols-2">
              <div>
                <span className="block text-xs font-semibold uppercase tracking-wide text-emerald-700">
                  Gemeldetes Bestelldatum
                </span>

                <span className="mt-1 block font-semibold">
                  {formatDate(referral.orderDate)}
                </span>
              </div>

              <div>
                <span className="block text-xs font-semibold uppercase tracking-wide text-emerald-700">
                  Gemeldeter Umsatz
                </span>

                <span className="mt-1 block font-semibold">
                  {formatMoney(
                    referral.grossRevenue ?? 0,
                    referral.currency,
                  )}
                </span>
              </div>
            </div>
          ) : null}

          {saveState.error ? (
            <div className="mt-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{saveState.error}</span>
            </div>
          ) : null}

          {saveState.success ? (
            <div className="mt-5 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{saveState.success}</span>
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500">
              Letzte Änderung:{" "}
              {formatDateTime(referral.updatedAt)}
            </p>

            <button
              type="button"
              onClick={saveFeedback}
              disabled={saveState.loading}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#102a43] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#173b5e] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saveState.loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}

              Rückmeldung speichern
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}

export default function PartnerPortalClient({
  token,
  initialData,
}: PartnerPortalClientProps) {
  const router = useRouter();

  const openReferrals = useMemo(
    () =>
      initialData.referrals.filter(
        (referral) =>
          referral.status === "open",
      ),
    [initialData.referrals],
  );

  const completedReferrals = useMemo(
    () =>
      initialData.referrals.filter(
        (referral) =>
          referral.status !== "open",
      ),
    [initialData.referrals],
  );

  return (
    <main className="min-h-screen bg-[#f6f8fb] text-[#102a43]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            {initialData.partner.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={initialData.partner.logoUrl}
                alt=""
                className="h-14 w-14 rounded-2xl border border-slate-200 bg-white object-contain p-2"
              />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#102a43] text-lg font-bold text-white">
                {initialData.partner.name
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
            )}

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Handzettel-Schulen.de
              </p>

              <h1 className="mt-1 text-xl font-bold sm:text-2xl">
                Partnerbereich –{" "}
                {initialData.partner.name}
              </h1>

              <p className="mt-1 text-sm text-slate-500">
                Partnerkennung:{" "}
                {initialData.partner.partnerCode}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => router.refresh()}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <RefreshCw className="h-4 w-4" />
              Aktualisieren
            </button>

            <a
              href="https://www.handzettel-schulen.de"
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#102a43] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#173b5e]"
            >
              Handzettel-Schulen.de
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl px-4 py-7 sm:px-6 sm:py-10">
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-slate-500">
              <ShoppingCart className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-wide">
                Vermittlungen
              </span>
            </div>

            <p className="mt-3 text-3xl font-bold">
              {initialData.summary.total}
            </p>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-amber-700">
              <CircleDashed className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-wide">
                Offen
              </span>
            </div>

            <p className="mt-3 text-3xl font-bold">
              {initialData.summary.open}
            </p>
          </div>

          <div className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-wide">
                Bestellt
              </span>
            </div>

            <p className="mt-3 text-3xl font-bold">
              {initialData.summary.ordered}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-slate-500">
              <XCircle className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-wide">
                Ohne Bestellung
              </span>
            </div>

            <p className="mt-3 text-3xl font-bold">
              {initialData.summary.notOrdered +
                initialData.summary.cancelled}
            </p>
          </div>

          <div className="rounded-2xl border border-blue-200 bg-white p-5 shadow-sm sm:col-span-2 xl:col-span-1">
            <div className="flex items-center gap-2 text-blue-700">
              <Euro className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-wide">
                Gemeldeter Umsatz
              </span>
            </div>

            <p className="mt-3 text-2xl font-bold">
              {formatMoney(
                initialData.summary.grossRevenue,
                initialData.partner.currency,
              )}
            </p>
          </div>
        </section>

        <section className="mt-8">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.14em] text-amber-700">
                Bearbeitung erforderlich
              </p>

              <h2 className="mt-1 text-2xl font-bold">
                Offene Vermittlungen
              </h2>
            </div>

            <p className="text-sm text-slate-500">
              {openReferrals.length} offen
            </p>
          </div>

          {openReferrals.length > 0 ? (
            <div className="mt-5 space-y-4">
              {openReferrals.map((referral) => (
                <ReferralCard
                  key={referral.feedbackId}
                  token={token}
                  referral={referral}
                />
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-3xl border border-emerald-200 bg-emerald-50 p-7 text-center">
              <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-700" />

              <h3 className="mt-3 text-lg font-bold text-emerald-900">
                Keine offenen Vermittlungen
              </h3>

              <p className="mt-2 text-sm text-emerald-800">
                Alle derzeit vorhandenen Vermittlungen wurden bearbeitet.
              </p>
            </div>
          )}
        </section>

        {completedReferrals.length > 0 ? (
          <section className="mt-10">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Bereits bearbeitet
                </p>

                <h2 className="mt-1 text-2xl font-bold">
                  Abgeschlossene Rückmeldungen
                </h2>
              </div>

              <p className="text-sm text-slate-500">
                {completedReferrals.length} bearbeitet
              </p>
            </div>

            <div className="mt-5 space-y-4">
              {completedReferrals.map(
                (referral) => (
                  <ReferralCard
                    key={referral.feedbackId}
                    token={token}
                    referral={referral}
                  />
                ),
              )}
            </div>
          </section>
        ) : null}

        <footer className="mt-10 rounded-2xl border border-slate-200 bg-white p-5 text-sm leading-6 text-slate-500">
          <div className="flex items-start gap-3">
            <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />

            <p>
              Bitte gib ausschließlich Rückmeldungen zu Bestellungen ab,
              die anhand des jeweiligen Vermittlungscodes eindeutig
              zugeordnet werden können. Es werden in diesem Bereich keine
              Kundennamen oder Kontaktdaten angezeigt.
            </p>
          </div>
        </footer>
      </div>
    </main>
  );
}