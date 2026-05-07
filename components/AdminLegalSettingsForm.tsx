"use client";

import { FormEvent, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Save,
  ShieldCheck,
} from "lucide-react";
import type { LegalSettings } from "@/lib/legal-settings";

type AdminLegalSettingsFormProps = {
  initialSettings: LegalSettings;
};

type Feedback =
  | {
      type: "success" | "error";
      message: string;
    }
  | null;

type FormState = Omit<LegalSettings, "id" | "created_at" | "updated_at">;

function toFormState(settings: LegalSettings): FormState {
  return {
    site_name: settings.site_name || "",
    brand_name: settings.brand_name || "",

    company_name: settings.company_name || "",
    owner_name: settings.owner_name || "",
    legal_form: settings.legal_form || "",

    street: settings.street || "",
    postal_code: settings.postal_code || "",
    city: settings.city || "",
    country: settings.country || "",

    phone_primary: settings.phone_primary || "",
    phone_secondary: settings.phone_secondary || "",
    fax: settings.fax || "",

    email_general: settings.email_general || "",
    email_privacy: settings.email_privacy || "",

    vat_id: settings.vat_id || "",

    register_court: settings.register_court || "",
    register_number: settings.register_number || "",
    supervisory_authority: settings.supervisory_authority || "",

    responsible_person: settings.responsible_person || "",
    privacy_contact: settings.privacy_contact || "",

    dispute_resolution_text: settings.dispute_resolution_text || "",

    hosting_provider: settings.hosting_provider || "",
    database_provider: settings.database_provider || "",
    ai_provider: settings.ai_provider || "",
    email_provider: settings.email_provider || "",
  };
}

function Field({
  label,
  name,
  value,
  onChange,
  placeholder,
  required,
  type = "text",
}: {
  label: string;
  name: keyof FormState;
  value: string | null;
  onChange: (name: keyof FormState, value: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-black uppercase tracking-[0.14em] text-[#A75B28]">
        {label}
        {required ? <span className="text-[#B5282D]"> *</span> : null}
      </span>

      <input
        type={type}
        value={String(value || "")}
        onChange={(event) => onChange(name, event.target.value)}
        placeholder={placeholder}
        className="min-h-12 w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 text-sm font-semibold text-[#102A43] outline-none transition placeholder:text-[#9AA7B2] focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
      />
    </label>
  );
}

function TextareaField({
  label,
  name,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  name: keyof FormState;
  value: string | null;
  onChange: (name: keyof FormState, value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-black uppercase tracking-[0.14em] text-[#A75B28]">
        {label}
      </span>

      <textarea
        value={String(value || "")}
        onChange={(event) => onChange(name, event.target.value)}
        placeholder={placeholder}
        rows={5}
        className="w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 py-3 text-sm font-semibold leading-6 text-[#102A43] outline-none transition placeholder:text-[#9AA7B2] focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
      />
    </label>
  );
}

export default function AdminLegalSettingsForm({
  initialSettings,
}: AdminLegalSettingsFormProps) {
  const [form, setForm] = useState<FormState>(() => toFormState(initialSettings));
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  function updateField(name: keyof FormState, value: string) {
    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setIsSaving(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/admin/legal-settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.ok) {
        throw new Error(
          payload?.message ||
            "Rechtliche Einstellungen konnten nicht gespeichert werden."
        );
      }

      setFeedback({
        type: "success",
        message:
          payload.message ||
          "Rechtliche Einstellungen wurden erfolgreich gespeichert.",
      });
    } catch (error) {
      setFeedback({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Rechtliche Einstellungen konnten nicht gespeichert werden.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {feedback ? (
        <div
          className={`rounded-3xl border px-4 py-4 shadow-sm ${
            feedback.type === "success"
              ? "border-[#BFE3CD] bg-[#F0FFF6] text-[#2F7D50]"
              : "border-[#F1D1A8] bg-[#FFF8EE] text-[#A75B28]"
          }`}
        >
          <div className="flex items-start gap-3">
            {feedback.type === "success" ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
            ) : (
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            )}

            <div>
              <p className="font-black">
                {feedback.type === "success" ? "Gespeichert" : "Fehler"}
              </p>
              <p className="mt-1 text-sm leading-6">{feedback.message}</p>
            </div>
          </div>
        </div>
      ) : null}

      <section className="rounded-[32px] border border-[#E8DED2] bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-5 flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#FBF7F0] text-[#A75B28]">
            <ShieldCheck className="h-5 w-5" />
          </div>

          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
              Basisdaten
            </p>
            <h2 className="text-xl font-black text-[#102A43]">
              Marke und Betreiber
            </h2>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label="Seitenname"
            name="site_name"
            value={form.site_name}
            onChange={updateField}
            required
          />

          <Field
            label="Markenname"
            name="brand_name"
            value={form.brand_name}
            onChange={updateField}
            required
          />

          <Field
            label="Firma / Betreiber"
            name="company_name"
            value={form.company_name}
            onChange={updateField}
            required
          />

          <Field
            label="Inhaber / Vertretung"
            name="owner_name"
            value={form.owner_name}
            onChange={updateField}
          />

          <Field
            label="Rechtsform"
            name="legal_form"
            value={form.legal_form}
            onChange={updateField}
          />

          <Field
            label="Verantwortliche Person"
            name="responsible_person"
            value={form.responsible_person}
            onChange={updateField}
          />
        </div>
      </section>

      <section className="rounded-[32px] border border-[#E8DED2] bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-5">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
            Anschrift und Kontakt
          </p>
          <h2 className="mt-1 text-xl font-black text-[#102A43]">
            Impressumsangaben
          </h2>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label="Straße + Hausnummer"
            name="street"
            value={form.street}
            onChange={updateField}
          />

          <Field
            label="PLZ"
            name="postal_code"
            value={form.postal_code}
            onChange={updateField}
          />

          <Field
            label="Ort"
            name="city"
            value={form.city}
            onChange={updateField}
          />

          <Field
            label="Land"
            name="country"
            value={form.country}
            onChange={updateField}
          />

          <Field
            label="Telefon 1"
            name="phone_primary"
            value={form.phone_primary}
            onChange={updateField}
          />

          <Field
            label="Telefon 2"
            name="phone_secondary"
            value={form.phone_secondary}
            onChange={updateField}
          />

          <Field label="Fax" name="fax" value={form.fax} onChange={updateField} />

          <Field
            label="Allgemeine E-Mail"
            name="email_general"
            value={form.email_general}
            onChange={updateField}
            type="email"
          />
        </div>
      </section>

      <section className="rounded-[32px] border border-[#E8DED2] bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-5">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
            Rechtliche Zusatzdaten
          </p>
          <h2 className="mt-1 text-xl font-black text-[#102A43]">
            Steuer, Register, Datenschutz
          </h2>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label="USt-IdNr."
            name="vat_id"
            value={form.vat_id}
            onChange={updateField}
          />

          <Field
            label="Registergericht"
            name="register_court"
            value={form.register_court}
            onChange={updateField}
          />

          <Field
            label="Registernummer"
            name="register_number"
            value={form.register_number}
            onChange={updateField}
          />

          <Field
            label="Aufsichtsbehörde"
            name="supervisory_authority"
            value={form.supervisory_authority}
            onChange={updateField}
          />

          <Field
            label="Datenschutz-E-Mail"
            name="email_privacy"
            value={form.email_privacy}
            onChange={updateField}
            type="email"
          />

          <Field
            label="Datenschutz-Kontakt"
            name="privacy_contact"
            value={form.privacy_contact}
            onChange={updateField}
          />
        </div>

        <div className="mt-4">
          <TextareaField
            label="Streitbeilegung / Verbraucherhinweis"
            name="dispute_resolution_text"
            value={form.dispute_resolution_text}
            onChange={updateField}
          />
        </div>
      </section>

      <section className="rounded-[32px] border border-[#E8DED2] bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-5">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
            Dienstleister
          </p>
          <h2 className="mt-1 text-xl font-black text-[#102A43]">
            Für die Datenschutzerklärung
          </h2>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label="Hosting-Anbieter"
            name="hosting_provider"
            value={form.hosting_provider}
            onChange={updateField}
          />

          <Field
            label="Datenbank / Storage"
            name="database_provider"
            value={form.database_provider}
            onChange={updateField}
          />

          <Field
            label="KI-Anbieter"
            name="ai_provider"
            value={form.ai_provider}
            onChange={updateField}
          />

          <Field
            label="E-Mail-Anbieter"
            name="email_provider"
            value={form.email_provider}
            onChange={updateField}
          />
        </div>
      </section>

      <div className="sticky bottom-4 z-20 rounded-[28px] border border-[#E8DED2] bg-white/95 p-3 shadow-[0_18px_45px_rgba(16,42,67,0.14)] backdrop-blur">
        <button
          type="submit"
          disabled={isSaving}
          className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#B5282D] px-5 py-4 text-sm font-black text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Wird gespeichert...
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Rechtliche Daten speichern
            </>
          )}
        </button>
      </div>
    </form>
  );
}