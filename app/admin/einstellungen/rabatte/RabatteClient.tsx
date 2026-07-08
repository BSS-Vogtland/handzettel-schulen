"use client";
import Link from "next/link";
import { ArrowLeft, CalendarDays, Euro, Percent, Plus, Save, Trash2 } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

type DiscountType = "percent" | "fixed_amount";
type AppliesTo = "all" | "shop" | "school_package";

type DiscountCampaign = {
  id: string;
  name: string;
  description: string | null;
  discount_type: DiscountType;
  discount_value: number | string;
  starts_at: string | null;
  ends_at: string | null;
  applies_to: AppliesTo;
  is_active: boolean;
  minimum_order_amount: number | string | null;
  max_discount_amount: number | string | null;
  created_at: string;
  updated_at: string;
};

type CampaignFormState = {
  name: string;
  description: string;
  discountType: DiscountType;
  discountValue: string;
  startsAt: string;
  endsAt: string;
  appliesTo: AppliesTo;
  isActive: boolean;
  minimumOrderAmount: string;
  maxDiscountAmount: string;
};

const emptyForm: CampaignFormState = {
  name: "",
  description: "",
  discountType: "percent",
  discountValue: "",
  startsAt: "",
  endsAt: "",
  appliesTo: "all",
  isActive: true,
  minimumOrderAmount: "",
  maxDiscountAmount: "",
};

function formatMoney(value: number | string | null | undefined) {
  const numericValue = Number(value ?? 0);

  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(Number.isFinite(numericValue) ? numericValue : 0);
}

function formatDateTime(value: string | null) {
  if (!value) return "ohne Begrenzung";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "ungÃ¼ltiges Datum";
  }

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function toDateTimeLocalValue(value: string | null) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  const localDate = new Date(date.getTime() - offsetMs);

  return localDate.toISOString().slice(0, 16);
}

function getAppliesToLabel(value: AppliesTo) {
  if (value === "shop") return "nur Shop";
  if (value === "school_package") return "nur Schulmaterial-Pakete";

  return "Shop + Schulmaterial-Pakete";
}

function getDiscountLabel(campaign: DiscountCampaign) {
  const value = Number(campaign.discount_value ?? 0);

  if (campaign.discount_type === "percent") {
    return `${value.toLocaleString("de-DE", {
      maximumFractionDigits: 2,
    })} %`;
  }

  return formatMoney(value);
}

function isCampaignCurrentlyValid(campaign: DiscountCampaign) {
  if (!campaign.is_active) return false;

  const now = Date.now();
  const startsAt = campaign.starts_at ? new Date(campaign.starts_at).getTime() : null;
  const endsAt = campaign.ends_at ? new Date(campaign.ends_at).getTime() : null;

  if (startsAt !== null && Number.isFinite(startsAt) && startsAt > now) return false;
  if (endsAt !== null && Number.isFinite(endsAt) && endsAt < now) return false;

  return true;
}

function buildPayload(form: CampaignFormState) {
  return {
    name: form.name,
    description: form.description,
    discountType: form.discountType,
    discountValue: form.discountValue,
    startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
    endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
    appliesTo: form.appliesTo,
    isActive: form.isActive,
    minimumOrderAmount: form.minimumOrderAmount || null,
    maxDiscountAmount: form.maxDiscountAmount || null,
  };
}

function buildEditForm(campaign: DiscountCampaign): CampaignFormState {
  return {
    name: campaign.name ?? "",
    description: campaign.description ?? "",
    discountType: campaign.discount_type,
    discountValue: String(campaign.discount_value ?? ""),
    startsAt: toDateTimeLocalValue(campaign.starts_at),
    endsAt: toDateTimeLocalValue(campaign.ends_at),
    appliesTo: campaign.applies_to,
    isActive: campaign.is_active,
    minimumOrderAmount:
      campaign.minimum_order_amount === null || campaign.minimum_order_amount === undefined
        ? ""
        : String(campaign.minimum_order_amount),
    maxDiscountAmount:
      campaign.max_discount_amount === null || campaign.max_discount_amount === undefined
        ? ""
        : String(campaign.max_discount_amount),
  };
}

export default function AdminDiscountCampaignsPage() {
  const [campaigns, setCampaigns] = useState<DiscountCampaign[]>([]);
  const [form, setForm] = useState<CampaignFormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const activeCampaigns = useMemo(
    () => campaigns.filter((campaign) => isCampaignCurrentlyValid(campaign)),
    [campaigns]
  );

  async function loadCampaigns() {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/admin/discount-campaigns", {
        method: "GET",
        cache: "no-store",
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.error ?? "Rabattaktionen konnten nicht geladen werden.");
      }

      setCampaigns(result.campaigns ?? []);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Rabattaktionen konnten nicht geladen werden."
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadCampaigns();
  }, []);

  function updateForm<Key extends keyof CampaignFormState>(
    key: Key,
    value: CampaignFormState[Key]
  ) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
    setMessage(null);
    setErrorMessage(null);
  }

  function validateForm() {
    const numericDiscountValue = Number(form.discountValue.replace(",", "."));

    if (!form.name.trim()) {
      return "Bitte gib einen Namen fÃ¼r die Rabattaktion ein.";
    }

    if (!Number.isFinite(numericDiscountValue) || numericDiscountValue <= 0) {
      return "Bitte gib einen Rabattwert grÃ¶ÃŸer als 0 ein.";
    }

    if (form.discountType === "percent" && numericDiscountValue > 100) {
      return "Ein prozentualer Rabatt darf maximal 100 % betragen.";
    }

    if (form.startsAt && form.endsAt) {
      const startsAt = new Date(form.startsAt).getTime();
      const endsAt = new Date(form.endsAt).getTime();

      if (startsAt > endsAt) {
        return "Das Startdatum darf nicht nach dem Enddatum liegen.";
      }
    }

    if (form.minimumOrderAmount.trim()) {
      const minimumOrderAmount = Number(form.minimumOrderAmount.replace(",", "."));

      if (!Number.isFinite(minimumOrderAmount) || minimumOrderAmount < 0) {
        return "Der Mindestbestellwert muss 0 oder grÃ¶ÃŸer sein.";
      }
    }

    if (form.maxDiscountAmount.trim()) {
      const maxDiscountAmount = Number(form.maxDiscountAmount.replace(",", "."));

      if (!Number.isFinite(maxDiscountAmount) || maxDiscountAmount <= 0) {
        return "Der maximale Rabattbetrag muss grÃ¶ÃŸer als 0 sein.";
      }
    }

    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setMessage(null);
    setErrorMessage(null);

    const validationError = validateForm();

    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setIsSaving(true);

    try {
      const endpoint = editingId
        ? `/api/admin/discount-campaigns/${editingId}`
        : "/api/admin/discount-campaigns";

      const response = await fetch(endpoint, {
        method: editingId ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildPayload(form)),
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.error ?? "Rabattaktion konnte nicht gespeichert werden.");
      }

      setMessage(
        editingId
          ? "Rabattaktion wurde aktualisiert."
          : "Rabattaktion wurde erstellt."
      );

      setForm(emptyForm);
      setEditingId(null);
      await loadCampaigns();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Rabattaktion konnte nicht gespeichert werden."
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(campaign: DiscountCampaign) {
    const confirmed = window.confirm(
      `Rabattaktion "${campaign.name}" wirklich lÃ¶schen?`
    );

    if (!confirmed) return;

    setMessage(null);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/admin/discount-campaigns/${campaign.id}`, {
        method: "DELETE",
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.error ?? "Rabattaktion konnte nicht gelÃ¶scht werden.");
      }

      if (editingId === campaign.id) {
        resetForm();
      }

      setMessage("Rabattaktion wurde gelÃ¶scht.");
      await loadCampaigns();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Rabattaktion konnte nicht gelÃ¶scht werden."
      );
    }
  }

  function startEditing(campaign: DiscountCampaign) {
    setEditingId(campaign.id);
    setForm(buildEditForm(campaign));
    setMessage(null);
    setErrorMessage(null);

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  return (
    <main className="min-h-screen bg-[#FBF7F0] text-[#102A43]">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 rounded-[2rem] border border-[#E7D8BD] bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="flex flex-col gap-3">
              <Link
                href="/admin"
                className="inline-flex w-fit items-center gap-2 rounded-full border border-[#D8C7A8] bg-[#FFF8EA] px-4 py-2 text-sm font-semibold text-[#8A5A00] transition hover:bg-[#FFEFC7]"
              >
                <ArrowLeft className="h-4 w-4" />
                ZurÃ¼ck zum Admin
              </Link>

              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#C98200]">
                  Einstellungen
                </p>
                <h1 className="mt-2 text-3xl font-black tracking-tight text-[#102A43] sm:text-4xl">
                  Rabattaktionen
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-[#52616B] sm:text-base">
                  Hier legst Du zentrale Rabattaktionen an. In V1 funktionieren
                  diese ohne Rabattcode. Die Anwendung im Shop, in der Rechnung
                  und in PayPal folgt im nÃ¤chsten Schritt.
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-[#D8E6D1] bg-[#F3FAEF] p-4 text-sm text-[#31572C]">
              <p className="font-black">
                Aktuell wirksam: {activeCampaigns.length}
              </p>
              <p className="mt-1 max-w-xs leading-5">
                V1-Regel spÃ¤ter im Checkout: neueste passende aktive Kampagne
                wird angewendet.
              </p>
            </div>
          </div>
        </div>

        {(message || errorMessage) && (
          <div
            className={[
              "rounded-2xl border px-4 py-3 text-sm font-semibold",
              errorMessage
                ? "border-[#F3B3B3] bg-[#FFF1F1] text-[#9F1D1D]"
                : "border-[#B8DEC1] bg-[#F2FFF4] text-[#1E6B32]",
            ].join(" ")}
          >
            {errorMessage ?? message}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.35fr)]">
          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-5 rounded-[2rem] border border-[#E7D8BD] bg-white p-5 shadow-sm sm:p-6"
          >
            <div>
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#FFF4D8] text-[#B36B00]">
                  {editingId ? <Save className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
                </div>
                <div>
                  <h2 className="text-xl font-black">
                    {editingId ? "Rabattaktion bearbeiten" : "Neue Rabattaktion"}
                  </h2>
                  <p className="text-sm text-[#697985]">
                    Name, Zeitraum und Rabattwert festlegen.
                  </p>
                </div>
              </div>
            </div>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-bold">Name der Rabattaktion</span>
              <input
                value={form.name}
                onChange={(event) => updateForm("name", event.target.value)}
                placeholder="z. B. Schulstart 2026"
                className="rounded-2xl border border-[#D8C7A8] bg-[#FFFCF6] px-4 py-3 text-sm outline-none transition focus:border-[#C98200] focus:bg-white"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-bold">Beschreibung optional</span>
              <textarea
                value={form.description}
                onChange={(event) => updateForm("description", event.target.value)}
                placeholder="Interne Notiz zur Aktion"
                rows={3}
                className="rounded-2xl border border-[#D8C7A8] bg-[#FFFCF6] px-4 py-3 text-sm outline-none transition focus:border-[#C98200] focus:bg-white"
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-2">
                <span className="text-sm font-bold">Rabattart</span>
                <select
                  value={form.discountType}
                  onChange={(event) =>
                    updateForm("discountType", event.target.value as DiscountType)
                  }
                  className="rounded-2xl border border-[#D8C7A8] bg-[#FFFCF6] px-4 py-3 text-sm outline-none transition focus:border-[#C98200] focus:bg-white"
                >
                  <option value="percent">Prozent</option>
                  <option value="fixed_amount">Festbetrag</option>
                </select>
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-sm font-bold">
                  Rabattwert {form.discountType === "percent" ? "in %" : "in â‚¬"}
                </span>
                <input
                  value={form.discountValue}
                  onChange={(event) => updateForm("discountValue", event.target.value)}
                  placeholder={form.discountType === "percent" ? "10" : "5,00"}
                  inputMode="decimal"
                  className="rounded-2xl border border-[#D8C7A8] bg-[#FFFCF6] px-4 py-3 text-sm outline-none transition focus:border-[#C98200] focus:bg-white"
                />
              </label>
            </div>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-bold">Geltungsbereich</span>
              <select
                value={form.appliesTo}
                onChange={(event) =>
                  updateForm("appliesTo", event.target.value as AppliesTo)
                }
                className="rounded-2xl border border-[#D8C7A8] bg-[#FFFCF6] px-4 py-3 text-sm outline-none transition focus:border-[#C98200] focus:bg-white"
              >
                <option value="all">Shop + Schulmaterial-Pakete</option>
                <option value="shop">nur Shop</option>
                <option value="school_package">nur Schulmaterial-Pakete</option>
              </select>
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-2">
                <span className="text-sm font-bold">Start optional</span>
                <input
                  value={form.startsAt}
                  onChange={(event) => updateForm("startsAt", event.target.value)}
                  type="datetime-local"
                  className="rounded-2xl border border-[#D8C7A8] bg-[#FFFCF6] px-4 py-3 text-sm outline-none transition focus:border-[#C98200] focus:bg-white"
                />
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-sm font-bold">Ende optional</span>
                <input
                  value={form.endsAt}
                  onChange={(event) => updateForm("endsAt", event.target.value)}
                  type="datetime-local"
                  className="rounded-2xl border border-[#D8C7A8] bg-[#FFFCF6] px-4 py-3 text-sm outline-none transition focus:border-[#C98200] focus:bg-white"
                />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-2">
                <span className="text-sm font-bold">Mindestbestellwert optional</span>
                <input
                  value={form.minimumOrderAmount}
                  onChange={(event) =>
                    updateForm("minimumOrderAmount", event.target.value)
                  }
                  placeholder="z. B. 25,00"
                  inputMode="decimal"
                  className="rounded-2xl border border-[#D8C7A8] bg-[#FFFCF6] px-4 py-3 text-sm outline-none transition focus:border-[#C98200] focus:bg-white"
                />
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-sm font-bold">Max. Rabattbetrag optional</span>
                <input
                  value={form.maxDiscountAmount}
                  onChange={(event) =>
                    updateForm("maxDiscountAmount", event.target.value)
                  }
                  placeholder="z. B. 10,00"
                  inputMode="decimal"
                  className="rounded-2xl border border-[#D8C7A8] bg-[#FFFCF6] px-4 py-3 text-sm outline-none transition focus:border-[#C98200] focus:bg-white"
                />
              </label>
            </div>

            <label className="flex items-center gap-3 rounded-2xl border border-[#D8C7A8] bg-[#FFFCF6] px-4 py-3">
              <input
                checked={form.isActive}
                onChange={(event) => updateForm("isActive", event.target.checked)}
                type="checkbox"
                className="h-4 w-4"
              />
              <span className="text-sm font-bold">Rabattaktion aktiv</span>
            </label>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#102A43] px-5 py-3 text-sm font-black text-white transition hover:bg-[#1B3F63] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                {isSaving
                  ? "Speichert..."
                  : editingId
                    ? "Ã„nderungen speichern"
                    : "Rabattaktion erstellen"}
              </button>

              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-2xl border border-[#D8C7A8] bg-white px-5 py-3 text-sm font-black text-[#8A5A00] transition hover:bg-[#FFF8EA]"
                >
                  Abbrechen
                </button>
              )}
            </div>
          </form>

          <section className="flex flex-col gap-4 rounded-[2rem] border border-[#E7D8BD] bg-white p-5 shadow-sm sm:p-6">
            <div>
              <h2 className="text-xl font-black">Vorhandene Rabattaktionen</h2>
              <p className="mt-1 text-sm text-[#697985]">
                Die eigentliche Anwendung im Checkout folgt im nÃ¤chsten Schritt.
              </p>
            </div>

            {isLoading ? (
              <div className="rounded-2xl border border-[#E7D8BD] bg-[#FFFCF6] p-5 text-sm font-semibold text-[#697985]">
                Rabattaktionen werden geladen...
              </div>
            ) : campaigns.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#D8C7A8] bg-[#FFFCF6] p-5 text-sm font-semibold text-[#697985]">
                Noch keine Rabattaktionen angelegt.
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {campaigns.map((campaign) => {
                  const currentlyValid = isCampaignCurrentlyValid(campaign);

                  return (
                    <article
                      key={campaign.id}
                      className="rounded-3xl border border-[#E7D8BD] bg-[#FFFCF6] p-4"
                    >
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-lg font-black text-[#102A43]">
                              {campaign.name}
                            </h3>

                            <span
                              className={[
                                "rounded-full px-3 py-1 text-xs font-black",
                                currentlyValid
                                  ? "bg-[#EAF8E8] text-[#2E7D32]"
                                  : campaign.is_active
                                    ? "bg-[#FFF4D8] text-[#9A6200]"
                                    : "bg-[#F1F3F5] text-[#697985]",
                              ].join(" ")}
                            >
                              {currentlyValid
                                ? "wirksam"
                                : campaign.is_active
                                  ? "aktiv, aber auÃŸerhalb Zeitraum"
                                  : "inaktiv"}
                            </span>

                            <span className="rounded-full bg-[#EAF2F8] px-3 py-1 text-xs font-black text-[#1B4F72]">
                              {getAppliesToLabel(campaign.applies_to)}
                            </span>
                          </div>

                          {campaign.description && (
                            <p className="mt-2 text-sm leading-6 text-[#52616B]">
                              {campaign.description}
                            </p>
                          )}

                          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-3">
                            <div className="rounded-2xl bg-white p-3">
                              <div className="flex items-center gap-2 font-black">
                                {campaign.discount_type === "percent" ? (
                                  <Percent className="h-4 w-4 text-[#C98200]" />
                                ) : (
                                  <Euro className="h-4 w-4 text-[#C98200]" />
                                )}
                                Rabatt
                              </div>
                              <p className="mt-1 text-[#52616B]">
                                {getDiscountLabel(campaign)}
                              </p>
                            </div>

                            <div className="rounded-2xl bg-white p-3">
                              <div className="flex items-center gap-2 font-black">
                                <CalendarDays className="h-4 w-4 text-[#C98200]" />
                                Start
                              </div>
                              <p className="mt-1 text-[#52616B]">
                                {formatDateTime(campaign.starts_at)}
                              </p>
                            </div>

                            <div className="rounded-2xl bg-white p-3">
                              <div className="flex items-center gap-2 font-black">
                                <CalendarDays className="h-4 w-4 text-[#C98200]" />
                                Ende
                              </div>
                              <p className="mt-1 text-[#52616B]">
                                {formatDateTime(campaign.ends_at)}
                              </p>
                            </div>

                            <div className="rounded-2xl bg-white p-3">
                              <p className="font-black">Mindestbestellwert</p>
                              <p className="mt-1 text-[#52616B]">
                                {campaign.minimum_order_amount === null ||
                                campaign.minimum_order_amount === undefined
                                  ? "nicht gesetzt"
                                  : formatMoney(campaign.minimum_order_amount)}
                              </p>
                            </div>

                            <div className="rounded-2xl bg-white p-3">
                              <p className="font-black">Max. Rabattbetrag</p>
                              <p className="mt-1 text-[#52616B]">
                                {campaign.max_discount_amount === null ||
                                campaign.max_discount_amount === undefined
                                  ? "nicht gesetzt"
                                  : formatMoney(campaign.max_discount_amount)}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-col gap-2 sm:flex-row xl:flex-col">
                          <button
                            type="button"
                            onClick={() => startEditing(campaign)}
                            className="rounded-2xl border border-[#D8C7A8] bg-white px-4 py-2 text-sm font-black text-[#8A5A00] transition hover:bg-[#FFF8EA]"
                          >
                            Bearbeiten
                          </button>

                          <button
                            type="button"
                            onClick={() => void handleDelete(campaign)}
                            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#F1B5B5] bg-[#FFF5F5] px-4 py-2 text-sm font-black text-[#9F1D1D] transition hover:bg-[#FFE8E8]"
                          >
                            <Trash2 className="h-4 w-4" />
                            LÃ¶schen
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}


