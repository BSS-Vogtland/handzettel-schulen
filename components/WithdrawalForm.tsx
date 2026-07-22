"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";

type FormState = {
  customerName: string;
  contractReference: string;
  customerEmail: string;
  withdrawalScope: string;
  customerMessage: string;
  website: string;
};

type ApiResponse = {
  ok?: boolean;
  received?: boolean;
  referenceNumber?: string;
  submittedAt?: string;
  confirmationSent?: boolean;
  message?: string;
};

const initialState: FormState = {
  customerName: "",
  contractReference: "",
  customerEmail: "",
  withdrawalScope: "",
  customerMessage: "",
  website: "",
};

export default function WithdrawalForm() {
  const [form, setForm] = useState<FormState>(initialState);
  const [isReviewing, setIsReviewing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canReview = useMemo(() => {
    return (
      form.customerName.trim().length >= 2 &&
      form.contractReference.trim().length >= 2 &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.customerEmail.trim())
    );
  }, [form]);

  function updateField(
    key: keyof FormState,
    value: string,
  ) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
    setError(null);
  }

  function startReview() {
    if (!canReview) {
      setError(
        "Bitte gib Deinen Namen, eine Bestell- oder Vertragskennung und eine gültige E-Mail-Adresse an.",
      );
      return;
    }

    setIsReviewing(true);
    setError(null);
  }

  async function confirmWithdrawal() {
    if (!canReview || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/widerruf", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const data = (await response.json()) as ApiResponse;

      if (!data.received) {
        throw new Error(
          data.message ||
            "Der Widerruf konnte nicht übermittelt werden.",
        );
      }

      setResult(data);
      setForm(initialState);
      setIsReviewing(false);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Der Widerruf konnte nicht übermittelt werden.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (result?.received) {
    return (
      <section className="rounded-[30px] border border-[#BFE3CD] bg-[#F0FFF6] p-6 shadow-sm sm:p-8">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-[#2F7D50] shadow-sm">
            <CheckCircle2 className="h-6 w-6" />
          </div>

          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#2F7D50]">
              Widerruf eingegangen
            </p>
            <h2 className="mt-2 text-2xl font-black text-[#102A43]">
              Deine Erklärung wurde übermittelt.
            </h2>
            <p className="mt-3 text-sm font-semibold leading-6 text-[#2F7D50]">
              Referenz:{" "}
              <span className="font-black">
                {result.referenceNumber || "wird per E-Mail bestätigt"}
              </span>
            </p>
            {result.submittedAt ? (
              <p className="mt-1 text-sm font-semibold leading-6 text-[#2F7D50]">
                Eingang: {result.submittedAt}
              </p>
            ) : null}
            <p className="mt-3 text-sm font-semibold leading-6 text-[#52616F]">
              {result.confirmationSent === false
                ? "Die Erklärung wurde gespeichert, die E-Mail-Bestätigung konnte jedoch nicht versendet werden. Bitte notiere die Referenz und kontaktiere uns zusätzlich per E-Mail."
                : "Eine Eingangsbestätigung wurde an Deine angegebene E-Mail-Adresse versendet. Bewahre sie bitte auf."}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setResult(null)}
          className="mt-6 inline-flex min-h-12 items-center justify-center rounded-2xl bg-[#102A43] px-5 py-3 text-sm font-black text-white transition hover:bg-[#B5282D]"
        >
          Weiteren Vertrag widerrufen
        </button>
      </section>
    );
  }

  return (
    <section className="rounded-[30px] border border-[#E8DED2] bg-white p-5 shadow-sm sm:p-7">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#FBF7F0] text-[#A75B28]">
          <ShieldCheck className="h-6 w-6" />
        </div>

        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
            Elektronische Widerrufsfunktion
          </p>
          <h2 className="mt-2 text-2xl font-black text-[#102A43]">
            Vertrag widerrufen
          </h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-[#52616F]">
            Gib die erforderlichen Angaben ein. Vor dem endgültigen Absenden
            erhältst Du noch eine Zusammenfassung.
          </p>
        </div>
      </div>

      {!isReviewing ? (
        <div className="mt-6 grid gap-5">
          <Field
            label="Name"
            required
            value={form.customerName}
            onChange={(value) => updateField("customerName", value)}
            autoComplete="name"
          />

          <Field
            label="Bestell-, Rechnungs- oder Vertragsnummer"
            required
            value={form.contractReference}
            onChange={(value) =>
              updateField("contractReference", value)
            }
            placeholder="z. B. Rechnungsnummer, Bestellnummer oder Anfrage-ID"
          />

          <Field
            label="E-Mail für die Eingangsbestätigung"
            required
            type="email"
            value={form.customerEmail}
            onChange={(value) => updateField("customerEmail", value)}
            autoComplete="email"
          />

          <Field
            label="Welche Artikel oder welcher Vertrag sollen widerrufen werden?"
            value={form.withdrawalScope}
            onChange={(value) =>
              updateField("withdrawalScope", value)
            }
            placeholder="Optional, bei vollständigem Widerruf leer lassen"
            multiline
          />

          <Field
            label="Weitere Nachricht"
            value={form.customerMessage}
            onChange={(value) =>
              updateField("customerMessage", value)
            }
            placeholder="Optional"
            multiline
          />

          <div
            aria-hidden="true"
            className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden"
          >
            <label>
              Website
              <input
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={form.website}
                onChange={(event) =>
                  updateField("website", event.target.value)
                }
              />
            </label>
          </div>

          {error ? <ErrorMessage message={error} /> : null}

          <button
            type="button"
            onClick={startReview}
            className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-[#102A43] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-[#B5282D] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canReview}
          >
            Angaben prüfen
          </button>
        </div>
      ) : (
        <div className="mt-6">
          <div className="rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] p-5">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[#A75B28]">
              Zusammenfassung
            </p>

            <dl className="mt-4 grid gap-4 text-sm">
              <ReviewRow label="Name" value={form.customerName} />
              <ReviewRow
                label="Vertragskennung"
                value={form.contractReference}
              />
              <ReviewRow
                label="Bestätigungs-E-Mail"
                value={form.customerEmail}
              />
              <ReviewRow
                label="Umfang"
                value={
                  form.withdrawalScope ||
                  "Vollständiger Widerruf des angegebenen Vertrags"
                }
              />
              {form.customerMessage ? (
                <ReviewRow
                  label="Nachricht"
                  value={form.customerMessage}
                />
              ) : null}
            </dl>
          </div>

          <p className="mt-4 rounded-2xl border border-[#F1D1A8] bg-[#FFF8EE] p-4 text-sm font-semibold leading-6 text-[#8A5A2B]">
            Mit der folgenden Schaltfläche übermittelst Du eine verbindliche
            Widerrufserklärung.
          </p>

          {error ? <ErrorMessage message={error} /> : null}

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setIsReviewing(false)}
              disabled={isSubmitting}
              className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-[#E8DED2] bg-white px-5 py-3 text-sm font-black text-[#102A43] transition hover:bg-[#FBF7F0] disabled:opacity-50"
            >
              Angaben ändern
            </button>

            <button
              type="button"
              onClick={confirmWithdrawal}
              disabled={isSubmitting}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#B5282D] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-[#102A43] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Wird übermittelt …
                </>
              ) : (
                "Widerruf bestätigen"
              )}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  required = false,
  type = "text",
  placeholder,
  autoComplete,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  multiline?: boolean;
}) {
  const className =
    "mt-2 w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 py-3 text-sm font-semibold text-[#102A43] outline-none transition placeholder:text-[#8A98A8] focus:border-[#12395F] focus:ring-2 focus:ring-[#12395F]/10";

  return (
    <label className="block">
      <span className="text-sm font-black text-[#102A43]">
        {label}
        {required ? " *" : ""}
      </span>

      {multiline ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          rows={4}
          maxLength={2000}
          className={className}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required={required}
          maxLength={200}
          className={className}
        />
      )}
    </label>
  );
}

function ReviewRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <dt className="text-xs font-black uppercase tracking-[0.12em] text-[#A75B28]">
        {label}
      </dt>
      <dd className="mt-1 whitespace-pre-wrap break-words font-bold leading-6 text-[#102A43]">
        {value}
      </dd>
    </div>
  );
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <p className="mt-4 rounded-2xl border border-[#F4B8B8] bg-[#FFF1F1] p-4 text-sm font-bold leading-6 text-[#A61B1B]">
      {message}
    </p>
  );
}
