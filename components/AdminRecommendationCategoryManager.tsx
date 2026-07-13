"use client";

import { normalizeRecommendationSlug } from "@/app/lib/recommendations/slug";
import type { RecommendationCategoryAdminRow } from "@/app/lib/recommendations/categoryService";
import { Loader2, Pencil, Plus, Power, Save, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

type Props = {
  initialCategories: RecommendationCategoryAdminRow[];
  initialError?: string | null;
  projectKey: string;
};

type FormState = {
  name: string;
  slug: string;
  description: string;
  sortOrder: string;
  active: boolean;
};

type Feedback = { type: "success" | "error"; message: string } | null;

const emptyForm: FormState = {
  name: "",
  slug: "",
  description: "",
  sortOrder: "0",
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

export default function AdminRecommendationCategoryManager({
  initialCategories,
  initialError,
  projectKey,
}: Props) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editing, setEditing] = useState<RecommendationCategoryAdminRow | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(
    initialError ? { type: "error", message: initialError } : null,
  );

  function update<Key extends keyof FormState>(key: Key, value: FormState[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
    setFeedback(null);
  }

  function updateName(name: string) {
    setForm((current) => {
      const slug = normalizeRecommendationSlug(name);
      return {
        ...current,
        name,
        slug: editing ? current.slug : slug.ok ? slug.slug : "",
      };
    });
  }

  function startEdit(category: RecommendationCategoryAdminRow) {
    setEditing(category);
    setForm({
      name: category.name,
      slug: category.slug,
      description: category.description ?? "",
      sortOrder: String(category.sort_order),
      active: category.active,
    });
    setFeedback(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetForm() {
    setEditing(null);
    setForm(emptyForm);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendingId) return;
    if (!form.name.trim()) {
      setFeedback({ type: "error", message: "Bitte einen Kategorienamen eingeben." });
      return;
    }
    const slug = normalizeRecommendationSlug(form.slug || form.name);
    if (!slug.ok) {
      setFeedback({ type: "error", message: slug.message });
      return;
    }

    setPendingId(editing?.id ?? "create");
    setFeedback(null);
    try {
      const response = await fetch(
        editing
          ? `/api/admin/recommendation-categories/${encodeURIComponent(editing.id)}`
          : "/api/admin/recommendation-categories",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({
            currentProjectKey: editing?.project_key,
            projectKey,
            name: form.name,
            slug: slug.slug,
            description: form.description || null,
            sortOrder: form.sortOrder,
            active: form.active,
          }),
        },
      );
      const payload = await readPayload(response);
      if (!response.ok || payload?.ok !== true) {
        throw new Error(
          typeof payload?.message === "string"
            ? payload.message
            : "Die Kategorie konnte nicht gespeichert werden.",
        );
      }
      setFeedback({
        type: "success",
        message: editing ? "Die Kategorie wurde gespeichert." : "Die Kategorie wurde angelegt.",
      });
      resetForm();
      router.refresh();
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Die Kategorie konnte nicht gespeichert werden.",
      });
    } finally {
      setPendingId(null);
    }
  }

  async function toggle(category: RecommendationCategoryAdminRow) {
    if (pendingId) return;
    setPendingId(category.id);
    setFeedback(null);
    try {
      const response = await fetch(
        `/api/admin/recommendation-categories/${encodeURIComponent(category.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({
            currentProjectKey: category.project_key,
            active: !category.active,
          }),
        },
      );
      const payload = await readPayload(response);
      if (!response.ok || payload?.ok !== true) {
        throw new Error(
          typeof payload?.message === "string" ? payload.message : "Der Status konnte nicht geändert werden.",
        );
      }
      setFeedback({
        type: "success",
        message: category.active ? "Die Kategorie wurde deaktiviert." : "Die Kategorie wurde aktiviert.",
      });
      router.refresh();
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Der Status konnte nicht geändert werden." });
    } finally {
      setPendingId(null);
    }
  }

  async function remove(category: RecommendationCategoryAdminRow) {
    if (pendingId) return;
    if (!window.confirm(`Kategorie „${category.name}“ wirklich löschen?`)) return;
    setPendingId(category.id);
    setFeedback(null);
    try {
      const query = new URLSearchParams({ project_key: category.project_key });
      const response = await fetch(
        `/api/admin/recommendation-categories/${encodeURIComponent(category.id)}?${query}`,
        { method: "DELETE", cache: "no-store" },
      );
      const payload = await readPayload(response);
      if (!response.ok || payload?.ok !== true) {
        throw new Error(
          typeof payload?.message === "string" ? payload.message : "Die Kategorie konnte nicht gelöscht werden.",
        );
      }
      if (editing?.id === category.id) resetForm();
      setFeedback({ type: "success", message: "Die Kategorie wurde gelöscht." });
      router.refresh();
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Die Kategorie konnte nicht gelöscht werden." });
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

      <form onSubmit={submit} className="rounded-[28px] border border-[#E8DED2] bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black">{editing ? "Kategorie bearbeiten" : "Neue Kategorie"}</h2>
            <p className="mt-1 text-sm font-semibold text-[#52616F]">Projekt: {projectKey}</p>
          </div>
          {editing ? (
            <button type="button" onClick={resetForm} className="inline-flex items-center gap-2 rounded-xl border border-[#D8C8B8] px-3 py-2 text-xs font-black">
              <X className="h-4 w-4" /> Abbrechen
            </button>
          ) : null}
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="grid gap-2"><span className="text-sm font-black">Name *</span><input value={form.name} onChange={(event) => updateName(event.target.value)} className={fieldClass} required /></label>
          <label className="grid gap-2"><span className="text-sm font-black">Slug *</span><input value={form.slug} onChange={(event) => update("slug", event.target.value)} className={fieldClass} required /></label>
          <label className="grid gap-2"><span className="text-sm font-black">Sortierung</span><input inputMode="numeric" value={form.sortOrder} onChange={(event) => update("sortOrder", event.target.value)} className={fieldClass} /></label>
          <label className="flex items-center gap-3 self-end rounded-2xl border border-[#D8C8B8] bg-[#FFFCF8] px-4 py-3"><input type="checkbox" checked={form.active} onChange={(event) => update("active", event.target.checked)} className="h-5 w-5" /><span className="text-sm font-black">Kategorie aktiv</span></label>
          <label className="grid gap-2 md:col-span-2"><span className="text-sm font-black">Beschreibung</span><textarea rows={3} value={form.description} onChange={(event) => update("description", event.target.value)} className={`${fieldClass} py-3`} /></label>
        </div>
        <button type="submit" disabled={Boolean(pendingId)} className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#12395F] px-5 text-sm font-black text-white disabled:opacity-60">
          {pendingId === (editing?.id ?? "create") ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {editing ? "Änderungen speichern" : "Kategorie anlegen"}
        </button>
      </form>

      {initialCategories.length === 0 && !initialError ? (
        <div className="rounded-[28px] border border-dashed border-[#D8C8B8] bg-white p-8 text-center text-sm font-bold text-[#52616F]">Keine Kategorien gefunden.</div>
      ) : (
        <div className="grid gap-4">
          {initialCategories.map((category) => (
            <article key={category.id} className="rounded-[28px] border border-[#E8DED2] bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-black">{category.name}</h3><span className={`rounded-full px-3 py-1 text-xs font-black ${category.active ? "bg-[#EAF8E8] text-[#2E7D32]" : "bg-[#F1F3F5] text-[#697985]"}`}>{category.active ? "Aktiv" : "Inaktiv"}</span></div>
                  <p className="mt-1 text-sm font-bold text-[#A75B28]">/{category.slug} · Sortierung {category.sort_order}</p>
                  {category.description ? <p className="mt-2 text-sm font-semibold text-[#52616F]">{category.description}</p> : null}
                  <div className="mt-3 flex flex-wrap gap-2 text-xs font-black"><span className="rounded-full bg-[#EEF4FA] px-3 py-1">{category.partner_count} Partner</span><span className="rounded-full bg-[#FFF4D8] px-3 py-1">{category.rule_count} Regeln</span><span className="rounded-full bg-[#FBF7F0] px-3 py-1">{category.project_key}</span></div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => startEdit(category)} disabled={Boolean(pendingId)} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#12395F] px-4 text-xs font-black text-white"><Pencil className="h-4 w-4" /> Bearbeiten</button>
                  <button type="button" onClick={() => void toggle(category)} disabled={Boolean(pendingId)} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#D8C8B8] px-4 text-xs font-black"><Power className="h-4 w-4" /> {category.active ? "Deaktivieren" : "Aktivieren"}</button>
                  <button type="button" onClick={() => void remove(category)} disabled={Boolean(pendingId)} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#F1B5B5] bg-[#FFF5F5] px-4 text-xs font-black text-[#9F1D1D]"><Trash2 className="h-4 w-4" /> Löschen</button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
