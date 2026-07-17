"use client";

import type {
  PartnerPortalAdminState,
  PartnerPortalReportFrequency,
} from "@/app/lib/recommendations/partnerPortalAdminService";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clipboard,
  KeyRound,
  Loader2,
  LockKeyhole,
  Mail,
  Plus,
  Power,
  RefreshCw,
  UserRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  initialState: PartnerPortalAdminState;
};

type Feedback = {
  type: "success" | "error";
  message: string;
} | null;

type CreatedAccess = {
  accessId: string;
  partnerId: string;
  partnerName: string;
  token: string;
  path: string;
  expiresAt: string | null;
};

type SettingsForm = {
  contactName: string;
  contactEmail: string;
  partnerPortalEnabled: boolean;
  reportFrequency: PartnerPortalReportFrequency;
};

const fieldClass =
  "min-h-12 w-full rounded-2xl border border-[#D8C8B8] bg-[#FFFCF8] px-4 text-sm font-bold text-[#102A43] outline-none transition focus:border-[#A75B28] focus:bg-white focus:ring-4 focus:ring-[#A75B28]/10";

function formatDateTime(value: string | null) {
  if (!value) {
    return "Noch nie verwendet";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unbekannt";
  }

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  }).format(date);
}

async function readJson(
  response: Response,
): Promise<Record<string, unknown> | null> {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    const value: unknown = JSON.parse(text);

    return value !== null && typeof value === "object"
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function responseMessage(
  payload: Record<string, unknown> | null,
  fallback: string,
) {
  return typeof payload?.message === "string"
    ? payload.message
    : fallback;
}

export default function AdminPartnerPortalManager({
  initialState,
}: Props) {
  const router = useRouter();

  const [settings, setSettings] =
    useState<SettingsForm>({
      contactName:
        initialState.settings.contactName ?? "",
      contactEmail:
        initialState.settings.contactEmail ?? "",
      partnerPortalEnabled:
        initialState.settings.partnerPortalEnabled,
      reportFrequency:
        initialState.settings.reportFrequency,
    });

  const [label, setLabel] = useState(
    "Standardzugang",
  );

  const [expiresAt, setExpiresAt] = useState("");
  const [deactivateExisting, setDeactivateExisting] =
    useState(true);

  const [feedback, setFeedback] =
    useState<Feedback>(null);

  const [createdAccess, setCreatedAccess] =
    useState<CreatedAccess | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [isCreating, setIsCreating] =
    useState(false);

  const [deactivatingId, setDeactivatingId] =
    useState<string | null>(null);

  const [copied, setCopied] = useState(false);

  const baseUrl =
    typeof window !== "undefined"
      ? window.location.origin
      : "";

  const createdUrl =
    createdAccess && baseUrl
      ? `${baseUrl}${createdAccess.path}`
      : createdAccess?.path ?? "";

  async function saveSettings() {
    if (isSaving) {
      return;
    }

    setIsSaving(true);
    setFeedback(null);

    try {
      const response = await fetch(
        `/api/admin/recommendation-partners/${encodeURIComponent(
          initialState.settings.partnerId,
        )}/portal`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          cache: "no-store",
          body: JSON.stringify({
            projectKey:
              initialState.settings.projectKey,
            contactName:
              settings.contactName || null,
            contactEmail:
              settings.contactEmail || null,
            partnerPortalEnabled:
              settings.partnerPortalEnabled,
            reportFrequency:
              settings.reportFrequency,
          }),
        },
      );

      const payload = await readJson(response);

      if (!response.ok || payload?.ok !== true) {
        throw new Error(
          responseMessage(
            payload,
            "Die Partnerportal-Einstellungen konnten nicht gespeichert werden.",
          ),
        );
      }

      setFeedback({
        type: "success",
        message:
          "Die Partnerportal-Einstellungen wurden gespeichert.",
      });

      router.refresh();
    } catch (error) {
      setFeedback({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Die Partnerportal-Einstellungen konnten nicht gespeichert werden.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function createAccess() {
    if (isCreating) {
      return;
    }

    setIsCreating(true);
    setFeedback(null);
    setCreatedAccess(null);
    setCopied(false);

    try {
      const normalizedExpiry = expiresAt
        ? new Date(expiresAt).toISOString()
        : null;

      const response = await fetch(
        `/api/admin/recommendation-partners/${encodeURIComponent(
          initialState.settings.partnerId,
        )}/portal`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          cache: "no-store",
          body: JSON.stringify({
            projectKey:
              initialState.settings.projectKey,
            label: label || null,
            expiresAt: normalizedExpiry,
            deactivateExisting,
          }),
        },
      );

      const payload = await readJson(response);

      if (!response.ok || payload?.ok !== true) {
        throw new Error(
          responseMessage(
            payload,
            "Der Partnerzugang konnte nicht erstellt werden.",
          ),
        );
      }

      const access =
        payload.access &&
        typeof payload.access === "object"
          ? (payload.access as Record<
              string,
              unknown
            >)
          : null;

      if (
        !access ||
        typeof access.accessId !== "string" ||
        typeof access.partnerId !== "string" ||
        typeof access.partnerName !== "string" ||
        typeof access.token !== "string" ||
        typeof access.path !== "string"
      ) {
        throw new Error(
          "Der Zugang wurde erstellt, aber der Link konnte nicht vollständig gelesen werden.",
        );
      }

      setCreatedAccess({
        accessId: access.accessId,
        partnerId: access.partnerId,
        partnerName: access.partnerName,
        token: access.token,
        path: access.path,
        expiresAt:
          typeof access.expiresAt === "string"
            ? access.expiresAt
            : null,
      });

      setSettings((current) => ({
        ...current,
        partnerPortalEnabled: true,
      }));

      setFeedback({
        type: "success",
        message:
          "Der Partnerzugang wurde erstellt. Kopiere den Link jetzt – später wird der Klartext-Token nicht erneut angezeigt.",
      });

      router.refresh();
    } catch (error) {
      setFeedback({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Der Partnerzugang konnte nicht erstellt werden.",
      });
    } finally {
      setIsCreating(false);
    }
  }

  async function copyCreatedUrl() {
    if (!createdUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        createdUrl,
      );

      setCopied(true);

      window.setTimeout(() => {
        setCopied(false);
      }, 2500);
    } catch {
      setFeedback({
        type: "error",
        message:
          "Der Link konnte nicht automatisch kopiert werden. Bitte markiere ihn manuell.",
      });
    }
  }

  async function deactivateAccess(
    accessId: string,
  ) {
    if (deactivatingId) {
      return;
    }

    const confirmed = window.confirm(
      "Diesen Partnerzugang wirklich deaktivieren? Der dazugehörige Link ist danach nicht mehr verwendbar.",
    );

    if (!confirmed) {
      return;
    }

    setDeactivatingId(accessId);
    setFeedback(null);

    try {
      const query = new URLSearchParams({
        project_key:
          initialState.settings.projectKey,
      });

      const response = await fetch(
        `/api/admin/recommendation-partners/${encodeURIComponent(
          initialState.settings.partnerId,
        )}/portal/access/${encodeURIComponent(
          accessId,
        )}?${query.toString()}`,
        {
          method: "DELETE",
          cache: "no-store",
        },
      );

      const payload = await readJson(response);

      if (!response.ok || payload?.ok !== true) {
        throw new Error(
          responseMessage(
            payload,
            "Der Partnerzugang konnte nicht deaktiviert werden.",
          ),
        );
      }

      setFeedback({
        type: "success",
        message:
          "Der Partnerzugang wurde deaktiviert.",
      });

      router.refresh();
    } catch (error) {
      setFeedback({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Der Partnerzugang konnte nicht deaktiviert werden.",
      });
    } finally {
      setDeactivatingId(null);
    }
  }

  return (
    <section className="grid gap-6 rounded-[32px] border border-[#C8D8E8] bg-[#F5FAFD] p-5 shadow-sm sm:p-7">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-[#12395F]">
            <KeyRound className="h-3.5 w-3.5" />
            Partnerportal
          </div>

          <h2 className="mt-3 text-2xl font-black text-[#102A43]">
            Zugang und Rückmeldungen
          </h2>

          <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#52616F]">
            Der Partner kann vermittelte
            Bestellungen anhand des
            Vermittlungscodes prüfen und
            Bestellstatus, Datum und Umsatz
            zurückmelden.
          </p>
        </div>

        <span
          className={
            "inline-flex w-fit items-center gap-2 rounded-full px-3 py-2 text-xs font-black " +
            (settings.partnerPortalEnabled
              ? "bg-[#EAF8EE] text-[#23763A]"
              : "bg-[#F1F3F5] text-[#52616F]")
          }
        >
          <Power className="h-4 w-4" />
          {settings.partnerPortalEnabled
            ? "Portal aktiviert"
            : "Portal deaktiviert"}
        </span>
      </header>

      {feedback ? (
        <div
          role="status"
          className={
            "flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm font-bold leading-6 " +
            (feedback.type === "error"
              ? "border-[#F3B3B3] bg-[#FFF1F1] text-[#9F1D1D]"
              : "border-[#B8DEC1] bg-[#F2FFF4] text-[#1E6B32]")
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

      <section className="rounded-[26px] border border-[#D6E7EF] bg-white p-5">
        <h3 className="text-lg font-black text-[#102A43]">
          Partnerkontakt
        </h3>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="grid gap-2">
            <span className="flex items-center gap-2 text-sm font-black">
              <UserRound className="h-4 w-4 text-[#12395F]" />
              Kontaktname
            </span>

            <input
              value={settings.contactName}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  contactName:
                    event.target.value,
                }))
              }
              maxLength={250}
              placeholder="z. B. Max Mustermann"
              className={fieldClass}
            />
          </label>

          <label className="grid gap-2">
            <span className="flex items-center gap-2 text-sm font-black">
              <Mail className="h-4 w-4 text-[#12395F]" />
              Kontakt-E-Mail
            </span>

            <input
              type="email"
              value={settings.contactEmail}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  contactEmail:
                    event.target.value,
                }))
              }
              maxLength={320}
              placeholder="partner@beispiel.de"
              className={fieldClass}
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-black">
              Berichtsintervall
            </span>

            <select
              value={settings.reportFrequency}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  reportFrequency:
                    event.target
                      .value as PartnerPortalReportFrequency,
                }))
              }
              className={fieldClass}
            >
              <option value="disabled">
                Keine Erinnerungen
              </option>

              <option value="weekly">
                Wöchentlich
              </option>

              <option value="monthly">
                Monatlich
              </option>
            </select>
          </label>

          <label className="flex min-h-12 items-center gap-3 rounded-2xl border border-[#D8C8B8] bg-[#FFFCF8] px-4">
            <input
              type="checkbox"
              checked={
                settings.partnerPortalEnabled
              }
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  partnerPortalEnabled:
                    event.target.checked,
                }))
              }
              className="h-5 w-5"
            />

            <span className="text-sm font-black">
              Partnerportal aktiviert
            </span>
          </label>
        </div>

        <button
          type="button"
          onClick={() => void saveSettings()}
          disabled={isSaving}
          className="mt-5 inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#12395F] px-5 text-sm font-black text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}

          {isSaving
            ? "Wird gespeichert …"
            : "Portal-Einstellungen speichern"}
        </button>
      </section>

      <section className="rounded-[26px] border border-[#D6E7EF] bg-white p-5">
        <h3 className="text-lg font-black text-[#102A43]">
          Neuen Zugangslink erzeugen
        </h3>

        <p className="mt-2 text-sm font-semibold leading-6 text-[#52616F]">
          Der Klartext-Link wird aus
          Sicherheitsgründen nur unmittelbar
          nach dem Erstellen angezeigt.
        </p>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="grid gap-2">
            <span className="text-sm font-black">
              Bezeichnung
            </span>

            <input
              value={label}
              onChange={(event) =>
                setLabel(event.target.value)
              }
              maxLength={250}
              placeholder="z. B. Standardzugang"
              className={fieldClass}
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-black">
              Gültig bis
            </span>

            <input
              type="datetime-local"
              value={expiresAt}
              onChange={(event) =>
                setExpiresAt(event.target.value)
              }
              className={fieldClass}
            />

            <span className="text-xs font-semibold text-[#697985]">
              Leer lassen für unbegrenzte
              Gültigkeit.
            </span>
          </label>
        </div>

        <label className="mt-4 flex items-start gap-3 rounded-2xl border border-[#D8C8B8] bg-[#FFFCF8] px-4 py-3">
          <input
            type="checkbox"
            checked={deactivateExisting}
            onChange={(event) =>
              setDeactivateExisting(
                event.target.checked,
              )
            }
            className="mt-0.5 h-5 w-5"
          />

          <span>
            <span className="block text-sm font-black">
              Bestehende aktive Zugänge
              deaktivieren
            </span>

            <span className="mt-1 block text-xs font-semibold leading-5 text-[#697985]">
              Empfohlen, wenn der bisherige Link
              ersetzt werden soll.
            </span>
          </span>
        </label>

        <button
          type="button"
          onClick={() => void createAccess()}
          disabled={isCreating}
          className="mt-5 inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#B5282D] px-5 text-sm font-black text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isCreating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}

          {isCreating
            ? "Zugang wird erzeugt …"
            : "Sicheren Zugangslink erzeugen"}
        </button>
      </section>

      {createdAccess ? (
        <section className="rounded-[26px] border-2 border-[#B8DEC1] bg-[#F2FFF4] p-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-1 h-6 w-6 shrink-0 text-[#23763A]" />

            <div className="min-w-0 flex-1">
              <h3 className="text-lg font-black text-[#1E6B32]">
                Neuer Partnerlink
              </h3>

              <p className="mt-2 text-sm font-semibold leading-6 text-[#316B40]">
                Kopiere und versende diesen Link
                jetzt. Nach einem Neuladen wird
                der Klartext-Link nicht erneut
                angezeigt.
              </p>

              <div className="mt-4 break-all rounded-2xl border border-[#B8DEC1] bg-white p-4 font-mono text-sm font-bold text-[#102A43]">
                {createdUrl}
              </div>

              <button
                type="button"
                onClick={() =>
                  void copyCreatedUrl()
                }
                className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#23763A] px-5 text-sm font-black text-white transition hover:brightness-110"
              >
                {copied ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Clipboard className="h-4 w-4" />
                )}

                {copied
                  ? "Link kopiert"
                  : "Partnerlink kopieren"}
              </button>
            </div>
          </div>
        </section>
      ) : null}

      <section className="rounded-[26px] border border-[#D6E7EF] bg-white p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-black text-[#102A43]">
              Vorhandene Zugänge
            </h3>

            <p className="mt-1 text-sm font-semibold text-[#52616F]">
              Klartext-Tokens können hier nicht
              erneut angezeigt werden.
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.refresh()}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#D8C8B8] bg-white px-4 text-sm font-black"
          >
            <RefreshCw className="h-4 w-4" />
            Aktualisieren
          </button>
        </div>

        {initialState.accesses.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-[#C8D8E8] bg-[#F8FBFD] p-5 text-sm font-semibold text-[#52616F]">
            Es wurde noch kein Partnerzugang
            erzeugt.
          </div>
        ) : (
          <div className="mt-4 grid gap-3">
            {initialState.accesses.map(
              (access) => (
                <article
                  key={access.id}
                  className="rounded-2xl border border-[#D8C8B8] bg-[#FFFCF8] p-4"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={
                            "rounded-full px-3 py-1 text-xs font-black " +
                            (access.active
                              ? "bg-[#EAF8EE] text-[#23763A]"
                              : "bg-[#F1F3F5] text-[#52616F]")
                          }
                        >
                          {access.active
                            ? "Aktiv"
                            : "Deaktiviert"}
                        </span>

                        <span className="font-black text-[#102A43]">
                          {access.label ||
                            "Partnerzugang"}
                        </span>
                      </div>

                      <div className="mt-3 grid gap-1 text-xs font-semibold text-[#52616F]">
                        <span>
                          Erstellt:{" "}
                          {formatDateTime(
                            access.createdAt,
                          )}
                        </span>

                        <span>
                          Letzte Verwendung:{" "}
                          {formatDateTime(
                            access.lastUsedAt,
                          )}
                        </span>

                        <span>
                          Ablauf:{" "}
                          {access.expiresAt
                            ? formatDateTime(
                                access.expiresAt,
                              )
                            : "Unbegrenzt"}
                        </span>
                      </div>
                    </div>

                    {access.active ? (
                      <button
                        type="button"
                        onClick={() =>
                          void deactivateAccess(
                            access.id,
                          )
                        }
                        disabled={
                          deactivatingId !== null
                        }
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#B5282D] px-4 text-sm font-black text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {deactivatingId ===
                        access.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <LockKeyhole className="h-4 w-4" />
                        )}

                        Zugang sperren
                      </button>
                    ) : null}
                  </div>
                </article>
              ),
            )}
          </div>
        )}
      </section>
    </section>
  );
}