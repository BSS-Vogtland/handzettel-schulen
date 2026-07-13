"use client";

import type { RecommendationPartner } from "@/app/lib/recommendations/types";
import { normalizeRecommendationSlug } from "@/app/lib/recommendations/slug";
import { validateRecommendationTargetUrl } from "@/app/lib/recommendations/urls";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Save,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";

type Props = {
  mode: "create" | "edit";
  initialPartner?: RecommendationPartner;
  initialMessage?: string | null;
};

type FormState = {
  name: string;
  slug: string;
  projectKey: string;
  targetUrl: string;
  logoUrl: string;
  description: string;
  active: boolean;
  attributionDays: string;
  commissionType: "" | "percentage" | "fixed";
  commissionValue: string;
  currency: string;
  disclosureText: string;
  internalNote: string;
};

type Feedback = {
  type: "success" | "error";
  message: string;
} | null;

function buildInitialState(partner?: RecommendationPartner): FormState {
  return {
    name: partner?.name ?? "",
    slug: partner?.slug ?? "",
    projectKey: partner?.project_key ?? "handzettel-schulen",
    targetUrl: partner?.target_url ?? "",
    logoUrl: partner?.logo_url ?? "",
    description: partner?.description ?? "",
    active: partner?.active ?? true,
    attributionDays: String(partner?.attribution_days ?? 30),
    commissionType: partner?.commission_type ?? "",
    commissionValue:
      partner?.commission_value === null ||
      partner?.commission_value === undefined
        ? ""
        : String(partner.commission_value).replace(".", ","),
    currency: partner?.currency ?? "EUR",
    disclosureText: partner?.disclosure_text ?? "",
    internalNote: partner?.internal_note ?? "",
  };
}

async function readJson(response: Response): Promise<Record<string, unknown> | null> {
  const text = await response.text();
  if (!text) return null;

  try {
    const value: unknown = JSON.parse(text);
    return value !== null && typeof value === "object"
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function getMessage(payload: Record<string, unknown> | null, fallback: string) {
  return typeof payload?.message === "string" ? payload.message : fallback;
}

const fieldClass =
  "min-h-12 w-full rounded-2xl border border-[#D8C8B8] bg-[#FFFCF8] px-4 text-sm font-bold text-[#102A43] outline-none transition focus:border-[#A75B28] focus:bg-white focus:ring-4 focus:ring-[#A75B28]/10";
const textareaClass =
  "w-full rounded-2xl border border-[#D8C8B8] bg-[#FFFCF8] px-4 py-3 text-sm font-bold leading-6 text-[#102A43] outline-none transition focus:border-[#A75B28] focus:bg-white focus:ring-4 focus:ring-[#A75B28]/10";

export default function AdminRecommendationPartnerForm({
  mode,
  initialPartner,
  initialMessage,
}: Props) {
  const router = useRouter();
  const [form, setForm] = useState(() => buildInitialState(initialPartner));
  const [slugEdited, setSlugEdited] = useState(Boolean(initialPartner?.slug));
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(
    initialMessage ? { type: "success", message: initialMessage } : null,
  );

  const targetHost = useMemo(() => {
    const result = validateRecommendationTargetUrl(form.targetUrl);
    if (!result.ok) return null;
    return new URL(result.normalizedUrl).hostname;
  }, [form.targetUrl]);

  function update<Key extends keyof FormState>(key: Key, value: FormState[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
    setFeedback(null);
  }

  function updateName(value: string) {
    setForm((current) => {
      const next = { ...current, name: value };
      if (!slugEdited) {
        const slug = normalizeRecommendationSlug(value);
        next.slug = slug.ok ? slug.slug : "";
      }
      return next;
    });
    setFeedback(null);
  }

  function validateForm() {
    if (!form.name.trim()) return "Bitte einen Partnernamen eingeben.";
    if (!form.projectKey.trim()) return "Bitte ein Projekt angeben.";

    const slug = normalizeRecommendationSlug(form.slug || form.name);
    if (!slug.ok) return slug.message;

    const targetUrl = validateRecommendationTargetUrl(form.targetUrl);
    if (!targetUrl.ok) return targetUrl.message;

    if (form.logoUrl.trim()) {
      const logoUrl = validateRecommendationTargetUrl(form.logoUrl);
      if (!logoUrl.ok) return `Logo-URL: ${logoUrl.message}`;
    }

    const attributionDays = Number(form.attributionDays);
    if (
      !Number.isInteger(attributionDays) ||
      attributionDays < 1 ||
      attributionDays > 365
    ) {
      return "Die Zuordnungsdauer muss zwischen 1 und 365 Tagen liegen.";
    }

    const hasCommissionType = Boolean(form.commissionType);
    const hasCommissionValue = Boolean(form.commissionValue.trim());
    if (hasCommissionType !== hasCommissionValue) {
      return "Provisionstyp und Provisionswert müssen gemeinsam gesetzt oder gemeinsam leer sein.";
    }
    if (hasCommissionValue) {
      const value = Number(form.commissionValue.replace(",", "."));
      if (!Number.isFinite(value) || value < 0) {
        return "Der Provisionswert darf nicht negativ sein.";
      }
      if (form.commissionType === "percentage" && value > 100) {
        return "Eine prozentuale Provision darf maximal 100 % betragen.";
      }
    }

    if (!/^[A-Za-z]{3}$/.test(form.currency.trim())) {
      return "Die Währung muss aus genau drei Buchstaben bestehen.";
    }

    return null;
  }

  function buildPayload() {
    return {
      currentProjectKey: initialPartner?.project_key,
      projectKey: form.projectKey,
      name: form.name,
      slug: form.slug,
      targetUrl: form.targetUrl,
      logoUrl: form.logoUrl || null,
      description: form.description || null,
      active: form.active,
      attributionDays: form.attributionDays,
      commissionType: form.commissionType || null,
      commissionValue: form.commissionValue || null,
      currency: form.currency,
      disclosureText: form.disclosureText || null,
      internalNote: form.internalNote || null,
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving || isDeleting) return;

    const validationMessage = validateForm();
    if (validationMessage) {
      setFeedback({ type: "error", message: validationMessage });
      return;
    }

    setIsSaving(true);
    setFeedback(null);

    try {
      const endpoint =
        mode === "edit" && initialPartner
          ? `/api/admin/recommendation-partners/${encodeURIComponent(initialPartner.id)}`
          : "/api/admin/recommendation-partners";
      const response = await fetch(endpoint, {
        method: mode === "edit" ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify(buildPayload()),
      });
      const payload = await readJson(response);

      if (!response.ok || payload?.ok !== true) {
        throw new Error(
          getMessage(payload, "Der Empfehlungspartner konnte nicht gespeichert werden."),
        );
      }

      const partner = payload.partner;
      if (partner && typeof partner === "object") {
        const savedPartner = partner as Record<string, unknown>;
        const id = savedPartner.id;
        const savedProjectKey = savedPartner.project_key;

        if (
          mode === "edit" &&
          typeof id === "string" &&
          typeof savedProjectKey === "string" &&
          savedProjectKey !== initialPartner?.project_key
        ) {
          router.replace(
            `/admin/empfehlungspartner/${encodeURIComponent(id)}?project_key=${encodeURIComponent(savedProjectKey)}`,
          );
          return;
        }

        if (mode !== "create") {
          setFeedback({
            type: "success",
            message: "Der Empfehlungspartner wurde gespeichert.",
          });
          router.refresh();
          return;
        }

        if (typeof id === "string") {
          router.push(`/admin/empfehlungspartner/${encodeURIComponent(id)}?created=1`);
          return;
        }
      }

      setFeedback({
        type: "success",
        message: "Der Empfehlungspartner wurde gespeichert.",
      });
      router.refresh();
    } catch (error) {
      setFeedback({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Der Empfehlungspartner konnte nicht gespeichert werden.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!initialPartner || isDeleting || isSaving) return;
    const confirmed = window.confirm(
      `Empfehlungspartner „${initialPartner.name}“ wirklich löschen?\n\nBei vorhandenen Kategoriezuordnungen wird das Löschen verhindert. Deaktivieren ist dann die sichere Alternative.`,
    );
    if (!confirmed) return;

    setIsDeleting(true);
    setFeedback(null);

    try {
      const query = new URLSearchParams({
        project_key: initialPartner.project_key,
      });
      const response = await fetch(
        `/api/admin/recommendation-partners/${encodeURIComponent(initialPartner.id)}?${query}`,
        { method: "DELETE", cache: "no-store" },
      );
      const payload = await readJson(response);
      if (!response.ok || payload?.ok !== true) {
        throw new Error(
          getMessage(payload, "Der Empfehlungspartner konnte nicht gelöscht werden."),
        );
      }

      router.push("/admin/empfehlungspartner?deleted=1");
    } catch (error) {
      setFeedback({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Der Empfehlungspartner konnte nicht gelöscht werden.",
      });
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="grid gap-6">
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

      <form
        onSubmit={handleSubmit}
        className="grid gap-6 rounded-[32px] border border-[#E8DED2] bg-white p-5 shadow-sm sm:p-7"
      >
        <section>
          <h2 className="text-xl font-black text-[#102A43]">Partnerdaten</h2>
          <p className="mt-1 text-sm font-semibold text-[#52616F]">
            Pflichtfelder sind mit einem Stern gekennzeichnet.
          </p>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {initialPartner ? (
              <label className="grid gap-2 md:col-span-2">
                <span className="text-sm font-black">Interne Partnerkennung</span>
                <input value={initialPartner.partner_code} readOnly className={`${fieldClass} cursor-not-allowed bg-[#F1F3F5] text-[#52616F]`} />
                <span className="text-xs font-semibold text-[#697985]">Die Kennung wird automatisch vergeben und kann nicht geändert werden.</span>
              </label>
            ) : null}
            <label className="grid gap-2">
              <span className="text-sm font-black">Name *</span>
              <input
                value={form.name}
                onChange={(event) => updateName(event.target.value)}
                placeholder="z. B. Sport Müller"
                className={fieldClass}
                required
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-black">Slug *</span>
              <input
                value={form.slug}
                onChange={(event) => {
                  setSlugEdited(Boolean(event.target.value));
                  update("slug", event.target.value);
                }}
                onBlur={() => {
                  const result = normalizeRecommendationSlug(form.slug || form.name);
                  if (result.ok) update("slug", result.slug);
                }}
                placeholder="sport-mueller"
                className={fieldClass}
                required
              />
              <span className="text-xs font-semibold text-[#697985]">
                Wird beim Eingeben des Namens automatisch erzeugt.
              </span>
            </label>

            <label className="grid gap-2 md:col-span-2">
              <span className="text-sm font-black">Projekt *</span>
              <input
                value={form.projectKey}
                onChange={(event) => update("projectKey", event.target.value)}
                className={fieldClass}
                required
              />
              <span className="text-xs font-semibold text-[#697985]">
                Aktuell wird „handzettel-schulen“ verwendet; das Feld bleibt für weitere Projekte offen.
              </span>
            </label>
          </div>
        </section>

        <section className="border-t border-[#E8DED2] pt-6">
          <h2 className="text-xl font-black text-[#102A43]">Ziel und Darstellung</h2>
          <div className="mt-5 grid gap-4">
            <label className="grid gap-2">
              <span className="text-sm font-black">Ziel-URL *</span>
              <input
                type="url"
                value={form.targetUrl}
                onChange={(event) => update("targetUrl", event.target.value)}
                placeholder="https://www.partner.de/schule"
                className={fieldClass}
                required
              />
              <span className="text-xs font-semibold text-[#697985]">
                Nur HTTP/HTTPS ohne eingebettete Zugangsdaten. Die Adresse wird nicht serverseitig abgerufen.
              </span>
              {targetHost ? (
                <span className="inline-flex w-fit items-center gap-2 rounded-full bg-[#EEF4FA] px-3 py-1 text-xs font-black text-[#12395F]">
                  <ExternalLink className="h-3.5 w-3.5" />
                  Späteres Ziel: {targetHost}
                </span>
              ) : null}
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-black">Logo-URL</span>
              <input
                type="url"
                value={form.logoUrl}
                onChange={(event) => update("logoUrl", event.target.value)}
                placeholder="https://www.partner.de/logo.png"
                className={fieldClass}
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-black">Beschreibung</span>
              <textarea
                value={form.description}
                onChange={(event) => update("description", event.target.value)}
                rows={4}
                className={textareaClass}
                placeholder="Öffentliche Kurzbeschreibung des Partners"
              />
            </label>
          </div>
        </section>

        <section className="border-t border-[#E8DED2] pt-6">
          <h2 className="text-xl font-black text-[#102A43]">Provision und Zuordnung</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-sm font-black">Zuordnungsdauer in Tagen *</span>
              <input
                inputMode="numeric"
                value={form.attributionDays}
                onChange={(event) => update("attributionDays", event.target.value)}
                className={fieldClass}
                required
              />
              <span className="text-xs font-semibold text-[#697985]">Erlaubt sind 1 bis 365 Tage.</span>
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-black">Währung *</span>
              <input
                value={form.currency}
                onChange={(event) => update("currency", event.target.value.toUpperCase())}
                maxLength={3}
                className={fieldClass}
                required
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-black">Provisionstyp</span>
              <select
                value={form.commissionType}
                onChange={(event) =>
                  update(
                    "commissionType",
                    event.target.value as FormState["commissionType"],
                  )
                }
                className={fieldClass}
              >
                <option value="">Keine Provision hinterlegt</option>
                <option value="percentage">Prozent</option>
                <option value="fixed">Festbetrag</option>
              </select>
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-black">Provisionswert</span>
              <input
                inputMode="decimal"
                value={form.commissionValue}
                onChange={(event) => update("commissionValue", event.target.value)}
                placeholder={form.commissionType === "percentage" ? "z. B. 8,5" : "z. B. 5,00"}
                className={fieldClass}
              />
              <span className="text-xs font-semibold text-[#697985]">
                Bei Prozent sind maximal 100 erlaubt. Typ und Wert müssen gemeinsam gesetzt sein.
              </span>
            </label>
          </div>
        </section>

        <section className="border-t border-[#E8DED2] pt-6">
          <div className="grid gap-4">
            <label className="grid gap-2">
              <span className="text-sm font-black">Vergütungshinweis</span>
              <textarea
                value={form.disclosureText}
                onChange={(event) => update("disclosureText", event.target.value)}
                rows={4}
                className={textareaClass}
                placeholder="Hinweis für die spätere Kundenanzeige"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-black">Interne Notiz</span>
              <textarea
                value={form.internalNote}
                onChange={(event) => update("internalNote", event.target.value)}
                rows={4}
                className={textareaClass}
                placeholder="Nur im geschützten Adminbereich sichtbar"
              />
            </label>

            <label className="flex items-center gap-3 rounded-2xl border border-[#D8C8B8] bg-[#FFFCF8] px-4 py-3">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(event) => update("active", event.target.checked)}
                className="h-5 w-5"
              />
              <span className="text-sm font-black text-[#102A43]">Partner ist aktiv</span>
            </label>
          </div>
        </section>

        <div className="flex flex-col gap-3 border-t border-[#E8DED2] pt-6 sm:flex-row">
          <button
            type="submit"
            disabled={isSaving || isDeleting}
            className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-[#12395F] px-5 text-sm font-black text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isSaving ? "Wird gespeichert …" : "Speichern"}
          </button>
          <Link
            href="/admin/empfehlungspartner"
            className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-[#D8C8B8] bg-white px-5 text-sm font-black text-[#102A43] transition hover:bg-[#FBF7F0]"
          >
            Abbrechen
          </Link>
        </div>
      </form>

      {mode === "edit" && initialPartner ? (
        <section className="rounded-[32px] border border-[#F1B5B5] bg-[#FFF8F8] p-5 sm:p-7">
          <h2 className="text-xl font-black text-[#9F1D1D]">Partner löschen</h2>
          <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#7A3E3E]">
            Löschen ist nur ohne Kategoriezuordnungen möglich. Bei einem Konflikt bleibt der Partner erhalten und sollte stattdessen deaktiviert werden.
          </p>
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={isDeleting || isSaving}
            className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#B5282D] px-5 text-sm font-black text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            {isDeleting ? "Wird gelöscht …" : "Partner löschen"}
          </button>
        </section>
      ) : null}
    </div>
  );
}
