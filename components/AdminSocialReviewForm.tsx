"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Loader2, Save } from "lucide-react";

type ReviewFormState = {
  reviewer_name: string;
  reviewer_email: string;
  decision: string;

  hook_ok: boolean;
  caption_ok: boolean;
  image_ok: boolean;
  cta_ok: boolean;
  platform_fit_ok: boolean;
  no_false_claims_ok: boolean;
  ads_ready_ok: boolean;

  notes: string;
  required_changes: string;
};

type ApiResponse = {
  ok?: boolean;
  message?: string;
};

function CheckboxRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer gap-3 rounded-2xl border border-[#E7D8C3] bg-[#FFFCF7] p-4 transition hover:bg-[#F5E8D8]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-5 w-5 rounded border-[#E7D8C3]"
      />

      <span>
        <span className="block text-sm font-black text-[#102A43]">{label}</span>
        <span className="mt-1 block text-sm font-semibold leading-6 text-[#52616F]">
          {description}
        </span>
      </span>
    </label>
  );
}

export default function AdminSocialReviewForm({
  postId,
  hasImage,
}: {
  postId: string;
  hasImage: boolean;
}) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);

  const [form, setForm] = useState<ReviewFormState>({
    reviewer_name: "",
    reviewer_email: "",
    decision: "needs_changes",

    hook_ok: false,
    caption_ok: false,
    image_ok: hasImage,
    cta_ok: false,
    platform_fit_ok: false,
    no_false_claims_ok: false,
    ads_ready_ok: false,

    notes: "",
    required_changes: "",
  });

  const allCoreChecksOk = useMemo(() => {
    return (
      form.hook_ok &&
      form.caption_ok &&
      form.image_ok &&
      form.cta_ok &&
      form.platform_fit_ok &&
      form.no_false_claims_ok
    );
  }, [
    form.hook_ok,
    form.caption_ok,
    form.image_ok,
    form.cta_ok,
    form.platform_fit_ok,
    form.no_false_claims_ok,
  ]);

  const looksLikeAccidentalNeedsChanges =
    allCoreChecksOk &&
    form.decision === "needs_changes" &&
    !form.required_changes.trim();

  function updateField<K extends keyof ReviewFormState>(
    key: K,
    value: ReviewFormState[K]
  ) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function handleSave() {
    if (isSaving) return;

    if (!form.reviewer_name.trim()) {
      window.alert("Bitte gib den Namen der prüfenden Person ein.");
      return;
    }

    if (form.decision === "approved" && !allCoreChecksOk) {
      window.alert(
        "Für eine Freigabe müssen Hook, Caption, Bildbezug, CTA, Plattform-Fit und Faktenprüfung bestätigt sein."
      );
      return;
    }

    if (looksLikeAccidentalNeedsChanges) {
      window.alert(
        "Alle Pflichtchecks sind erfüllt, aber die Entscheidung steht noch auf „Überarbeitung nötig“.\n\nBitte wähle entweder „Freigeben“ oder trage konkrete Änderungswünsche ein."
      );
      return;
    }

    if (form.decision === "needs_changes" && !form.required_changes.trim()) {
      const confirmed = window.confirm(
        "Du hast keine konkreten Änderungswünsche eingetragen. Trotzdem als Überarbeitung markieren?"
      );

      if (!confirmed) return;
    }

    setIsSaving(true);

    try {
      const response = await fetch(`/api/admin/social/${postId}/review`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const json = (await response.json()) as ApiResponse;

      if (!response.ok || !json.ok) {
        window.alert(json.message || "Review konnte nicht gespeichert werden.");
        return;
      }

      window.alert(json.message || "Review wurde gespeichert.");
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unbekannter Fehler beim Speichern des Reviews.";

      window.alert(message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm sm:p-7">
      <div className="mb-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-[#E7D8C3] bg-[#FFFCF7] px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-[#8A5A35]">
          <CheckCircle2 className="h-4 w-4" />
          Review-Entscheidung
        </div>

        <h2 className="mt-4 text-2xl font-black text-[#102A43]">
          Beitrag prüfen und freigeben
        </h2>

        <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#52616F]">
          Dieser Schritt ist wichtig, bevor Beiträge veröffentlicht oder als Ads
          verwendet werden. Besonders bei bezahlter Werbung müssen Hook,
          Bildbezug, CTA und Aussagen sauber geprüft sein.
        </p>
      </div>

      {looksLikeAccidentalNeedsChanges ? (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold leading-6 text-amber-900">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <p>
              Alle Pflichtchecks sind erfüllt. Die Entscheidung steht aber noch
              auf „Überarbeitung nötig“. Wähle „Freigeben“, wenn der Beitrag
              wirklich freigegeben werden soll.
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-black text-[#102A43]">
            Prüfer / Freigabe durch
          </label>
          <input
            value={form.reviewer_name}
            onChange={(event) =>
              updateField("reviewer_name", event.target.value)
            }
            className="w-full rounded-2xl border border-[#E7D8C3] bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
            placeholder="Vorname Nachname"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-black text-[#102A43]">
            E-Mail optional
          </label>
          <input
            value={form.reviewer_email}
            onChange={(event) =>
              updateField("reviewer_email", event.target.value)
            }
            className="w-full rounded-2xl border border-[#E7D8C3] bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
            placeholder="name@firma.de"
          />
        </div>

        <div className="lg:col-span-2">
          <label className="mb-2 block text-sm font-black text-[#102A43]">
            Entscheidung
          </label>
          <select
            value={form.decision}
            onChange={(event) => updateField("decision", event.target.value)}
            className="w-full rounded-2xl border border-[#E7D8C3] bg-white px-4 py-3 text-sm font-black outline-none focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
          >
            <option value="needs_changes">Überarbeitung nötig</option>
            <option value="approved">Freigeben</option>
            <option value="rejected">Ablehnen</option>
          </select>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <CheckboxRow
          label="Hook geprüft"
          description="Der Einstieg ist verständlich, aufmerksamkeitsstark und nicht irreführend."
          checked={form.hook_ok}
          onChange={(checked) => updateField("hook_ok", checked)}
        />

        <CheckboxRow
          label="Caption geprüft"
          description="Der Text erklärt den Nutzen klar und passt zur Zielgruppe."
          checked={form.caption_ok}
          onChange={(checked) => updateField("caption_ok", checked)}
        />

        <CheckboxRow
          label="Bildbezug geprüft"
          description="Das Bild unterstützt die Aussage des Beitrags und wirkt nicht generisch."
          checked={form.image_ok}
          onChange={(checked) => updateField("image_ok", checked)}
        />

        <CheckboxRow
          label="CTA geprüft"
          description="Die Handlungsaufforderung ist klar und passt zum Angebot."
          checked={form.cta_ok}
          onChange={(checked) => updateField("cta_ok", checked)}
        />

        <CheckboxRow
          label="Plattform-Fit geprüft"
          description="Der Beitrag funktioniert für TikTok, Instagram und Facebook oder wurde passend angepasst."
          checked={form.platform_fit_ok}
          onChange={(checked) => updateField("platform_fit_ok", checked)}
        />

        <CheckboxRow
          label="Keine falschen Versprechen"
          description="Keine Garantien, keine irreführenden Aussagen, keine zu aggressiven Claims."
          checked={form.no_false_claims_ok}
          onChange={(checked) => updateField("no_false_claims_ok", checked)}
        />

        <div className="lg:col-span-2">
          <CheckboxRow
            label="Für Ads geeignet"
            description="Der Beitrag kann grundsätzlich als Anzeigenbasis verwendet werden. Budgetfreigabe erfolgt trotzdem separat."
            checked={form.ads_ready_ok}
            onChange={(checked) => updateField("ads_ready_ok", checked)}
          />
        </div>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-black text-[#102A43]">
            Notiz
          </label>
          <textarea
            value={form.notes}
            onChange={(event) => updateField("notes", event.target.value)}
            rows={5}
            className="w-full rounded-2xl border border-[#E7D8C3] bg-white px-4 py-3 text-sm font-semibold leading-6 outline-none focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
            placeholder="Allgemeine Review-Notizen ..."
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-black text-[#102A43]">
            Änderungswünsche
          </label>
          <textarea
            value={form.required_changes}
            onChange={(event) =>
              updateField("required_changes", event.target.value)
            }
            rows={5}
            className="w-full rounded-2xl border border-[#E7D8C3] bg-white px-4 py-3 text-sm font-semibold leading-6 outline-none focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
            placeholder="Was muss geändert werden?"
          />
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold leading-6 text-amber-900">
        Eine Beitragsfreigabe ersetzt keine Budgetfreigabe. Bezahlte Werbung
        muss weiterhin im Ads-Modul separat mit Budget bestätigt werden.
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={isSaving}
        className="mt-6 inline-flex items-center justify-center gap-2 rounded-2xl bg-[#B5282D] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isSaving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Save className="h-4 w-4" />
        )}
        {isSaving ? "Review wird gespeichert ..." : "Review speichern"}
      </button>
    </section>
  );
}