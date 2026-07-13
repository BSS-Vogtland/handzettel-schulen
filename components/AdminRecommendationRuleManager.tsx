"use client";

import type { RecommendationRuleAdminRow } from "@/app/lib/recommendations/ruleService";
import type {
  RecommendationMatchField,
  RecommendationPartnerCategory,
} from "@/app/lib/recommendations/types";
import { Loader2, Pencil, Plus, Power, Save, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

type Props = {
  initialRules: RecommendationRuleAdminRow[];
  categories: RecommendationPartnerCategory[];
  projectKey: string;
  initialError?: string | null;
};

type FormState = {
  name: string;
  categoryId: string;
  patternType: "term" | "phrase";
  terms: string;
  excludedTerms: string;
  matchFields: RecommendationMatchField[];
  priority: string;
  active: boolean;
};

type Feedback = { type: "success" | "error"; message: string } | null;

const MATCH_FIELDS: Array<{ value: RecommendationMatchField; label: string }> = [
  { value: "raw_text", label: "Originaltext" },
  { value: "normalized_name", label: "Normalisierter Name" },
  { value: "category", label: "Produktkategorie" },
  { value: "product_type", label: "Produkttyp" },
  { value: "notes", label: "Notizen" },
];

const emptyForm: FormState = {
  name: "",
  categoryId: "",
  patternType: "term",
  terms: "",
  excludedTerms: "",
  matchFields: MATCH_FIELDS.map((field) => field.value),
  priority: "0",
  active: true,
};

const fieldClass =
  "min-h-11 w-full rounded-2xl border border-[#D8C8B8] bg-[#FFFCF8] px-4 text-sm font-bold outline-none focus:border-[#A75B28]";

async function readPayload(response: Response) {
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

export default function AdminRecommendationRuleManager({
  initialRules,
  categories,
  projectKey,
  initialError,
}: Props) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editing, setEditing] = useState<RecommendationRuleAdminRow | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(
    initialError ? { type: "error", message: initialError } : null,
  );

  function update<Key extends keyof FormState>(key: Key, value: FormState[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
    setFeedback(null);
  }

  function toggleMatchField(field: RecommendationMatchField) {
    setForm((current) => ({
      ...current,
      matchFields: current.matchFields.includes(field)
        ? current.matchFields.filter((entry) => entry !== field)
        : [...current.matchFields, field],
    }));
  }

  function startEdit(rule: RecommendationRuleAdminRow) {
    setEditing(rule);
    setForm({
      name: rule.name,
      categoryId: rule.category_id,
      patternType: rule.pattern_type,
      terms: rule.terms.join("\n"),
      excludedTerms: rule.excluded_terms.join("\n"),
      matchFields: rule.match_fields,
      priority: String(rule.priority),
      active: rule.active,
    });
    setFeedback(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function reset() {
    setEditing(null);
    setForm(emptyForm);
  }

  async function request(url: string, init: RequestInit) {
    const response = await fetch(url, { ...init, cache: "no-store" });
    const payload = await readPayload(response);
    if (!response.ok || payload?.ok !== true) {
      throw new Error(
        typeof payload?.message === "string"
          ? payload.message
          : "Die Empfehlungsregel konnte nicht gespeichert werden.",
      );
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendingId) return;
    if (!form.name.trim() || !form.categoryId || !form.terms.trim()) {
      setFeedback({
        type: "error",
        message: "Name, Kategorie und mindestens ein Suchbegriff sind erforderlich.",
      });
      return;
    }
    if (form.matchFields.length === 0) {
      setFeedback({ type: "error", message: "Bitte mindestens ein Matchfeld auswählen." });
      return;
    }

    setPendingId(editing?.id ?? "create");
    setFeedback(null);
    try {
      await request(
        editing
          ? `/api/admin/recommendation-rules/${encodeURIComponent(editing.id)}`
          : "/api/admin/recommendation-rules",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            currentProjectKey: editing?.project_key,
            projectKey,
            name: form.name,
            categoryId: form.categoryId,
            patternType: form.patternType,
            terms: form.terms.split("\n"),
            excludedTerms: form.excludedTerms.split("\n"),
            matchFields: form.matchFields,
            priority: form.priority,
            active: form.active,
          }),
        },
      );
      setFeedback({
        type: "success",
        message: editing ? "Die Regel wurde gespeichert." : "Die Regel wurde angelegt.",
      });
      reset();
      router.refresh();
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Die Regel konnte nicht gespeichert werden.",
      });
    } finally {
      setPendingId(null);
    }
  }

  async function toggle(rule: RecommendationRuleAdminRow) {
    if (pendingId) return;
    setPendingId(rule.id);
    setFeedback(null);
    try {
      await request(`/api/admin/recommendation-rules/${encodeURIComponent(rule.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentProjectKey: rule.project_key, active: !rule.active }),
      });
      setFeedback({
        type: "success",
        message: rule.active ? "Die Regel wurde deaktiviert." : "Die Regel wurde aktiviert.",
      });
      router.refresh();
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Der Status konnte nicht geändert werden." });
    } finally {
      setPendingId(null);
    }
  }

  async function remove(rule: RecommendationRuleAdminRow) {
    if (pendingId || !window.confirm(`Regel „${rule.name}“ wirklich löschen?`)) return;
    setPendingId(rule.id);
    setFeedback(null);
    try {
      const query = new URLSearchParams({ project_key: rule.project_key });
      await request(
        `/api/admin/recommendation-rules/${encodeURIComponent(rule.id)}?${query}`,
        { method: "DELETE" },
      );
      if (editing?.id === rule.id) reset();
      setFeedback({ type: "success", message: "Die Regel wurde gelöscht." });
      router.refresh();
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Die Regel konnte nicht gelöscht werden." });
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="grid gap-6">
      {feedback ? (
        <div role="status" className={`rounded-2xl border px-4 py-3 text-sm font-bold ${feedback.type === "error" ? "border-[#F3B3B3] bg-[#FFF1F1] text-[#9F1D1D]" : "border-[#B8DEC1] bg-[#F2FFF4] text-[#1E6B32]"}`}>
          {feedback.message}
        </div>
      ) : null}

      <form onSubmit={submit} className="rounded-[28px] border border-[#E8DED2] bg-white p-5 shadow-sm sm:p-7">
        <div className="flex items-start justify-between gap-3">
          <div><h2 className="text-xl font-black">{editing ? "Regel bearbeiten" : "Neue Empfehlungsregel"}</h2><p className="mt-1 text-sm font-semibold text-[#52616F]">„term“ sucht einzelne Begriffe; „phrase“ ist für zusammenhängende Wortgruppen vorgesehen. Regex ist nicht erlaubt.</p></div>
          {editing ? <button type="button" onClick={reset} className="inline-flex items-center gap-2 rounded-xl border border-[#D8C8B8] px-3 py-2 text-xs font-black"><X className="h-4 w-4" /> Abbrechen</button> : null}
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="grid gap-2"><span className="text-sm font-black">Name *</span><input value={form.name} onChange={(event) => update("name", event.target.value)} className={fieldClass} required /></label>
          <label className="grid gap-2"><span className="text-sm font-black">Kategorie *</span><select value={form.categoryId} onChange={(event) => update("categoryId", event.target.value)} className={fieldClass} required><option value="">Kategorie auswählen</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}{category.active ? "" : " (inaktiv)"}</option>)}</select></label>
          <label className="grid gap-2"><span className="text-sm font-black">Regeltyp *</span><select value={form.patternType} onChange={(event) => update("patternType", event.target.value as FormState["patternType"])} className={fieldClass}><option value="term">term – einzelne Begriffe</option><option value="phrase">phrase – Wortgruppen</option></select></label>
          <label className="grid gap-2"><span className="text-sm font-black">Priorität</span><input value={form.priority} onChange={(event) => update("priority", event.target.value)} inputMode="numeric" className={fieldClass} /></label>
          <label className="grid gap-2"><span className="text-sm font-black">Suchbegriffe *</span><textarea rows={7} value={form.terms} onChange={(event) => update("terms", event.target.value)} placeholder={"Ein Begriff pro Zeile\nTurnschuhe\nHallenschuhe"} className={`${fieldClass} py-3`} required /><span className="text-xs font-semibold text-[#52616F]">Leerzeilen und doppelte Begriffe werden serverseitig entfernt.</span></label>
          <label className="grid gap-2"><span className="text-sm font-black">Ausschlussbegriffe</span><textarea rows={7} value={form.excludedTerms} onChange={(event) => update("excludedTerms", event.target.value)} placeholder={"Optional, ein Begriff pro Zeile\nSchuhbeutel"} className={`${fieldClass} py-3`} /></label>
        </div>

        <fieldset className="mt-5 rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] p-4">
          <legend className="px-2 text-sm font-black">Zu prüfende Felder *</legend>
          <div className="mt-2 flex flex-wrap gap-3">{MATCH_FIELDS.map((field) => <label key={field.value} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-bold"><input type="checkbox" checked={form.matchFields.includes(field.value)} onChange={() => toggleMatchField(field.value)} />{field.label}</label>)}</div>
        </fieldset>
        <label className="mt-4 flex items-center gap-3 rounded-2xl border border-[#D8C8B8] bg-[#FFFCF8] px-4 py-3"><input type="checkbox" checked={form.active} onChange={(event) => update("active", event.target.checked)} className="h-5 w-5" /><span className="text-sm font-black">Regel aktiv</span></label>
        <button type="submit" disabled={Boolean(pendingId) || categories.length === 0} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-2xl bg-[#12395F] px-5 text-sm font-black text-white disabled:opacity-60">{pendingId === (editing?.id ?? "create") ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{editing ? "Regel speichern" : "Regel anlegen"}</button>
      </form>

      {initialRules.length === 0 && !initialError ? <div className="rounded-[28px] border border-dashed border-[#D8C8B8] bg-white p-8 text-center text-sm font-bold text-[#52616F]">Keine Regeln gefunden.</div> : <div className="grid gap-4">{initialRules.map((rule) => <article key={rule.id} className="rounded-[28px] border border-[#E8DED2] bg-white p-5 shadow-sm"><div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-black">{rule.name}</h3><span className={`rounded-full px-3 py-1 text-xs font-black ${rule.active ? "bg-[#EAF8E8] text-[#2E7D32]" : "bg-[#F1F3F5] text-[#697985]"}`}>{rule.active ? "Aktiv" : "Inaktiv"}</span><span className="rounded-full bg-[#EEF4FA] px-3 py-1 text-xs font-black">{rule.pattern_type}</span><span className="rounded-full bg-[#FFF4D8] px-3 py-1 text-xs font-black">Priorität {rule.priority}</span></div><p className="mt-2 text-sm font-bold text-[#A75B28]">{rule.category_name}</p><p className="mt-3 text-sm font-semibold text-[#52616F]">Begriffe: {rule.terms.slice(0, 5).join(", ")}{rule.terms.length > 5 ? " …" : ""}</p><p className="mt-1 text-xs font-bold text-[#697985]">Felder: {rule.match_fields.join(", ")}</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => startEdit(rule)} disabled={Boolean(pendingId)} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#12395F] px-4 text-xs font-black text-white"><Pencil className="h-4 w-4" /> Bearbeiten</button><button type="button" onClick={() => void toggle(rule)} disabled={Boolean(pendingId)} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#D8C8B8] px-4 text-xs font-black"><Power className="h-4 w-4" /> {rule.active ? "Deaktivieren" : "Aktivieren"}</button><button type="button" onClick={() => void remove(rule)} disabled={Boolean(pendingId)} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#F1B5B5] bg-[#FFF5F5] px-4 text-xs font-black text-[#9F1D1D]"><Trash2 className="h-4 w-4" /> Löschen</button></div></div></article>)}</div>}
    </div>
  );
}
