"use client";

import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Loader2,
  Mail,
  Pencil,
  Phone,
  Plus,
  Power,
  Save,
  UserRound,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

type SupplierPartner = {
  id: string;
  slug: string;
  name: string;
  email: string | null;
  contact_person: string | null;
  phone: string | null;
  is_active: boolean;
  created_at?: string | null;
  updated_at?: string | null;
};

type PartnerForm = {
  name: string;
  email: string;
  contactPerson: string;
  phone: string;
  isActive: boolean;
};

type PartnersResponse = {
  ok?: boolean;
  message?: string;
  partners?: SupplierPartner[];
  partner?: SupplierPartner;
};

const EMPTY_FORM: PartnerForm = {
  name: "",
  email: "",
  contactPerson: "",
  phone: "",
  isActive: true,
};

function partnerToForm(partner: SupplierPartner): PartnerForm {
  return {
    name: partner.name,
    email: partner.email || "",
    contactPerson: partner.contact_person || "",
    phone: partner.phone || "",
    isActive: partner.is_active,
  };
}

export default function AdminBookSupplierPartnerManager() {
  const [partners, setPartners] = useState<SupplierPartner[]>([]);

  const [createForm, setCreateForm] =
    useState<PartnerForm>(EMPTY_FORM);

  const [editForm, setEditForm] =
    useState<PartnerForm>(EMPTY_FORM);

  const [editingPartnerId, setEditingPartnerId] =
    useState<string | null>(null);

  const [busyPartnerId, setBusyPartnerId] =
    useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  const [errorMessage, setErrorMessage] =
    useState<string | null>(null);

  const [successMessage, setSuccessMessage] =
    useState<string | null>(null);

  const activePartnerCount = useMemo(
    () => partners.filter((partner) => partner.is_active).length,
    [partners],
  );

  async function loadPartners() {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch(
        "/api/admin/book-supplier/partners",
        {
          method: "GET",
          cache: "no-store",
        },
      );

      const payload =
        (await response.json()) as PartnersResponse;

      if (
        !response.ok ||
        !payload.ok ||
        !Array.isArray(payload.partners)
      ) {
        throw new Error(
          payload.message ||
            "Die Buchhandelspartner konnten nicht geladen werden.",
        );
      }

      setPartners(payload.partners);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Die Buchhandelspartner konnten nicht geladen werden.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadPartners();
  }, []);

  async function createPartner(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (isCreating) {
      return;
    }

    setErrorMessage(null);
    setSuccessMessage(null);
    setIsCreating(true);

    try {
      const response = await fetch(
        "/api/admin/book-supplier/partners",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: createForm.name,
            email: createForm.email,
            contactPerson: createForm.contactPerson,
            phone: createForm.phone,
          }),
        },
      );

      const payload =
        (await response.json()) as PartnersResponse;

      if (!response.ok || !payload.ok || !payload.partner) {
        throw new Error(
          payload.message ||
            "Der Buchhandelspartner konnte nicht angelegt werden.",
        );
      }

      setPartners((current) =>
        [...current, payload.partner as SupplierPartner].sort(
          (left, right) => {
            if (left.is_active !== right.is_active) {
              return left.is_active ? -1 : 1;
            }

            return left.name.localeCompare(
              right.name,
              "de-DE",
            );
          },
        ),
      );

      setCreateForm(EMPTY_FORM);

      setSuccessMessage(
        payload.message ||
          "Der Buchhandelspartner wurde angelegt.",
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Der Buchhandelspartner konnte nicht angelegt werden.",
      );
    } finally {
      setIsCreating(false);
    }
  }

  function beginEditing(partner: SupplierPartner) {
    setEditingPartnerId(partner.id);
    setEditForm(partnerToForm(partner));
    setErrorMessage(null);
    setSuccessMessage(null);
  }

  function cancelEditing() {
    setEditingPartnerId(null);
    setEditForm(EMPTY_FORM);
  }

  async function updatePartner(input: {
    partner: SupplierPartner;
    form: PartnerForm;
    successMessage?: string;
  }) {
    if (busyPartnerId) {
      return;
    }

    setBusyPartnerId(input.partner.id);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await fetch(
        "/api/admin/book-supplier/partners",
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: input.partner.id,
            name: input.form.name,
            email: input.form.email,
            contactPerson: input.form.contactPerson,
            phone: input.form.phone,
            isActive: input.form.isActive,
          }),
        },
      );

      const payload =
        (await response.json()) as PartnersResponse;

      if (!response.ok || !payload.ok || !payload.partner) {
        throw new Error(
          payload.message ||
            "Die Partnerdaten konnten nicht gespeichert werden.",
        );
      }

      setPartners((current) =>
        current
          .map((partner) =>
            partner.id === input.partner.id
              ? (payload.partner as SupplierPartner)
              : partner,
          )
          .sort((left, right) => {
            if (left.is_active !== right.is_active) {
              return left.is_active ? -1 : 1;
            }

            return left.name.localeCompare(
              right.name,
              "de-DE",
            );
          }),
      );

      setEditingPartnerId(null);
      setEditForm(EMPTY_FORM);

      setSuccessMessage(
        input.successMessage ||
          payload.message ||
          "Die Partnerdaten wurden gespeichert.",
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Die Partnerdaten konnten nicht gespeichert werden.",
      );
    } finally {
      setBusyPartnerId(null);
    }
  }

  async function togglePartner(
    partner: SupplierPartner,
  ) {
    await updatePartner({
      partner,
      form: {
        ...partnerToForm(partner),
        isActive: !partner.is_active,
      },
      successMessage: partner.is_active
        ? `${partner.name} wurde deaktiviert.`
        : `${partner.name} wurde aktiviert.`,
    });
  }

  return (
    <div className="grid gap-6">
      {errorMessage ? (
        <div className="flex items-start gap-3 rounded-2xl border border-[#F0B7BA] bg-[#FFF1F1] p-4 text-[#9F1D24]">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />

          <p className="text-sm font-bold leading-6">
            {errorMessage}
          </p>
        </div>
      ) : null}

      {successMessage ? (
        <div className="flex items-start gap-3 rounded-2xl border border-[#BFE3CD] bg-[#F0FFF6] p-4 text-[#2F7D50]">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />

          <p className="text-sm font-bold leading-6">
            {successMessage}
          </p>
        </div>
      ) : null}

      <section className="rounded-[30px] border border-[#E8DED2] bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-[#FBF7F0] px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
              <Plus className="h-3.5 w-3.5" />
              Neuer Partner
            </div>

            <h2 className="mt-3 text-2xl font-black text-[#102A43]">
              Buchhandlung anlegen
            </h2>

            <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#52616F]">
              Die E-Mail-Adresse kann zunächst leer bleiben.
              Zum direkten Versand einer Sammelanfrage muss
              später eine Adresse hinterlegt sein.
            </p>
          </div>

          <div className="rounded-2xl bg-[#F5FAFD] px-5 py-3 text-center">
            <p className="text-xs font-black uppercase tracking-[0.1em] text-[#12395F]">
              Aktive Partner
            </p>

            <p className="mt-1 text-2xl font-black text-[#102A43]">
              {activePartnerCount}
            </p>
          </div>
        </div>

        <form
          onSubmit={createPartner}
          className="mt-5 grid gap-4 md:grid-cols-2"
        >
          <PartnerFields
            value={createForm}
            onChange={setCreateForm}
            disabled={isCreating}
            showActiveField={false}
          />

          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={isCreating}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#B5282D] px-5 py-3 text-sm font-black text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isCreating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}

              Partner anlegen
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-[30px] border border-[#E8DED2] bg-white p-5 shadow-sm sm:p-6">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-[#EEF4FA] px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-[#12395F]">
            <Building2 className="h-3.5 w-3.5" />
            Partnerbestand
          </div>

          <h2 className="mt-3 text-2xl font-black text-[#102A43]">
            Buchhandelspartner verwalten
          </h2>

          <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#52616F]">
            Deaktivierte Partner bleiben mit älteren Anfragen
            verknüpft, können aber für neue Sammelanfragen nicht
            mehr ausgewählt werden.
          </p>
        </div>

        {isLoading ? (
          <div className="mt-6 flex min-h-40 items-center justify-center rounded-2xl border border-dashed border-[#C8D8E8] bg-[#F5FAFD]">
            <Loader2 className="h-6 w-6 animate-spin text-[#12395F]" />
          </div>
        ) : partners.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-[#C8D8E8] bg-[#F5FAFD] p-8 text-center">
            <Building2 className="mx-auto h-7 w-7 text-[#12395F]" />

            <p className="mt-2 font-black text-[#102A43]">
              Noch kein Buchhandelspartner
            </p>

            <p className="mt-1 text-sm font-semibold text-[#52616F]">
              Lege oben die erste Buchhandlung an.
            </p>
          </div>
        ) : (
          <div className="mt-6 grid gap-4">
            {partners.map((partner) => {
              const isEditing =
                editingPartnerId === partner.id;

              const isBusy =
                busyPartnerId === partner.id;

              return (
                <article
                  key={partner.id}
                  className={`rounded-[26px] border p-4 sm:p-5 ${
                    partner.is_active
                      ? "border-[#BFE3CD] bg-[#F7FFFA]"
                      : "border-[#E8DED2] bg-[#F5F5F5]"
                  }`}
                >
                  {isEditing ? (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();

                        void updatePartner({
                          partner,
                          form: editForm,
                        });
                      }}
                      className="grid gap-4 md:grid-cols-2"
                    >
                      <PartnerFields
                        value={editForm}
                        onChange={setEditForm}
                        disabled={isBusy}
                        showActiveField
                      />

                      <div className="flex flex-wrap gap-2 md:col-span-2">
                        <button
                          type="submit"
                          disabled={isBusy}
                          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#102A43] px-4 py-2 text-sm font-black text-white disabled:opacity-60"
                        >
                          {isBusy ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Save className="h-4 w-4" />
                          )}

                          Speichern
                        </button>

                        <button
                          type="button"
                          onClick={cancelEditing}
                          disabled={isBusy}
                          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-[#D8C8B8] bg-white px-4 py-2 text-sm font-black text-[#52616F]"
                        >
                          <X className="h-4 w-4" />
                          Abbrechen
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-xl font-black text-[#102A43]">
                            {partner.name}
                          </h3>

                          <span
                            className={`rounded-full px-3 py-1 text-xs font-black ${
                              partner.is_active
                                ? "bg-[#E7F8EE] text-[#2F7D50]"
                                : "bg-[#E5E7EA] text-[#52616F]"
                            }`}
                          >
                            {partner.is_active
                              ? "Aktiv"
                              : "Deaktiviert"}
                          </span>
                        </div>

                        <div className="mt-3 grid gap-2 text-sm font-semibold text-[#52616F] sm:grid-cols-2">
                          <p className="flex items-center gap-2">
                            <Mail className="h-4 w-4 shrink-0 text-[#12395F]" />

                            {partner.email ||
                              "Keine E-Mail-Adresse"}
                          </p>

                          <p className="flex items-center gap-2">
                            <UserRound className="h-4 w-4 shrink-0 text-[#12395F]" />

                            {partner.contact_person ||
                              "Kein Ansprechpartner"}
                          </p>

                          <p className="flex items-center gap-2">
                            <Phone className="h-4 w-4 shrink-0 text-[#12395F]" />

                            {partner.phone ||
                              "Keine Telefonnummer"}
                          </p>

                          <p className="text-xs font-semibold text-[#7B8792]">
                            Kennung: {partner.slug}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            beginEditing(partner)
                          }
                          disabled={isBusy}
                          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-black text-[#12395F] ring-1 ring-[#C8D8E8] disabled:opacity-60"
                        >
                          <Pencil className="h-4 w-4" />
                          Bearbeiten
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            void togglePartner(partner)
                          }
                          disabled={isBusy}
                          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-black text-[#8A4A1F] ring-1 ring-[#F1D1A8] disabled:opacity-60"
                        >
                          {isBusy ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Power className="h-4 w-4" />
                          )}

                          {partner.is_active
                            ? "Deaktivieren"
                            : "Aktivieren"}
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function PartnerFields({
  value,
  onChange,
  disabled,
  showActiveField,
}: {
  value: PartnerForm;
  onChange: (value: PartnerForm) => void;
  disabled: boolean;
  showActiveField: boolean;
}) {
  return (
    <>
      <label className="block">
        <span className="mb-2 block text-sm font-black text-[#102A43]">
          Buchhandlung*
        </span>

        <input
          value={value.name}
          onChange={(event) =>
            onChange({
              ...value,
              name: event.target.value,
            })
          }
          disabled={disabled}
          placeholder="Name der Buchhandlung"
          className="min-h-12 w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 font-semibold text-[#102A43] outline-none transition focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10 disabled:bg-[#F3F4F5]"
        />
      </label>

      <label className="block">
        <span className="mb-2 block text-sm font-black text-[#102A43]">
          E-Mail-Adresse
        </span>

        <input
          type="email"
          value={value.email}
          onChange={(event) =>
            onChange({
              ...value,
              email: event.target.value,
            })
          }
          disabled={disabled}
          placeholder="bestellung@buchhandlung.de"
          className="min-h-12 w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 font-semibold text-[#102A43] outline-none transition focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10 disabled:bg-[#F3F4F5]"
        />
      </label>

      <label className="block">
        <span className="mb-2 block text-sm font-black text-[#102A43]">
          Ansprechpartner
        </span>

        <input
          value={value.contactPerson}
          onChange={(event) =>
            onChange({
              ...value,
              contactPerson: event.target.value,
            })
          }
          disabled={disabled}
          placeholder="Optional"
          className="min-h-12 w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 font-semibold text-[#102A43] outline-none transition focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10 disabled:bg-[#F3F4F5]"
        />
      </label>

      <label className="block">
        <span className="mb-2 block text-sm font-black text-[#102A43]">
          Telefon
        </span>

        <input
          value={value.phone}
          onChange={(event) =>
            onChange({
              ...value,
              phone: event.target.value,
            })
          }
          disabled={disabled}
          placeholder="Optional"
          className="min-h-12 w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 font-semibold text-[#102A43] outline-none transition focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10 disabled:bg-[#F3F4F5]"
        />
      </label>

      {showActiveField ? (
        <label className="flex items-center gap-3 rounded-2xl border border-[#D6E7EF] bg-[#F5FAFD] px-4 py-3 md:col-span-2">
          <input
            type="checkbox"
            checked={value.isActive}
            onChange={(event) =>
              onChange({
                ...value,
                isActive: event.target.checked,
              })
            }
            disabled={disabled}
            className="h-4 w-4 rounded border-[#B8C6D1] text-[#B5282D] focus:ring-[#B5282D]"
          />

          <span>
            <span className="block text-sm font-black text-[#102A43]">
              Partner ist aktiv
            </span>

            <span className="mt-1 block text-xs font-semibold leading-5 text-[#52616F]">
              Nur aktive Partner können für neue
              Sammelanfragen ausgewählt werden.
            </span>
          </span>
        </label>
      ) : null}
    </>
  );
}