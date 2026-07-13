"use client";

import type { RecommendationCategoryPartnerLinkAdmin } from "@/app/lib/recommendations/categoryLinkService";
import type {
  RecommendationPartner,
  RecommendationPartnerCategory,
} from "@/app/lib/recommendations/types";
import { Link2, Loader2, Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

type Props = {
  partner: RecommendationPartner;
  categories: RecommendationPartnerCategory[];
  initialLinks: RecommendationCategoryPartnerLinkAdmin[];
  initialError?: string | null;
};

type Feedback = { type: "success" | "error"; message: string } | null;

async function payload(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    const value: unknown = JSON.parse(text);
    return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export default function AdminRecommendationCategoryLinks({
  partner,
  categories,
  initialLinks,
  initialError,
}: Props) {
  const router = useRouter();
  const [categoryId, setCategoryId] = useState("");
  const [priority, setPriority] = useState("0");
  const [active, setActive] = useState(true);
  const [draftPriorities, setDraftPriorities] = useState<Record<string, string>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(initialError ? { type: "error", message: initialError } : null);
  const assignedIds = new Set(initialLinks.map((link) => link.category_id));
  const available = categories.filter((category) => !assignedIds.has(category.id));

  async function request(url: string, init: RequestInit, success: string) {
    const response = await fetch(url, { ...init, cache: "no-store" });
    const result = await payload(response);
    if (!response.ok || result?.ok !== true) {
      throw new Error(typeof result?.message === "string" ? result.message : "Die Zuordnung konnte nicht gespeichert werden.");
    }
    setFeedback({ type: "success", message: success });
    router.refresh();
  }

  async function assign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!categoryId || pendingId) {
      if (!categoryId) setFeedback({ type: "error", message: "Bitte eine Kategorie auswählen." });
      return;
    }
    setPendingId("create");
    setFeedback(null);
    try {
      await request(
        "/api/admin/recommendation-category-links",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectKey: partner.project_key, partnerId: partner.id, categoryId, priority, active }),
        },
        "Die Kategorie wurde zugeordnet.",
      );
      setCategoryId("");
      setPriority("0");
      setActive(true);
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Die Kategorie konnte nicht zugeordnet werden." });
    } finally {
      setPendingId(null);
    }
  }

  async function save(link: RecommendationCategoryPartnerLinkAdmin, nextActive = link.active) {
    if (pendingId) return;
    setPendingId(link.id);
    setFeedback(null);
    try {
      await request(
        `/api/admin/recommendation-category-links/${encodeURIComponent(link.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ currentProjectKey: link.project_key, priority: draftPriorities[link.id] ?? link.priority, active: nextActive }),
        },
        "Die Zuordnung wurde gespeichert.",
      );
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Die Zuordnung konnte nicht gespeichert werden." });
    } finally {
      setPendingId(null);
    }
  }

  async function remove(link: RecommendationCategoryPartnerLinkAdmin) {
    if (pendingId || !window.confirm(`Zuordnung zu „${link.category_name}“ entfernen?`)) return;
    setPendingId(link.id);
    setFeedback(null);
    try {
      const query = new URLSearchParams({ project_key: link.project_key });
      await request(
        `/api/admin/recommendation-category-links/${encodeURIComponent(link.id)}?${query}`,
        { method: "DELETE" },
        "Die Zuordnung wurde entfernt.",
      );
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Die Zuordnung konnte nicht entfernt werden." });
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section className="rounded-[32px] border border-[#D6E7EF] bg-[#F5FAFD] p-5 sm:p-7">
      <div className="flex items-start gap-3"><div className="rounded-2xl bg-white p-3 text-[#12395F]"><Link2 className="h-5 w-5" /></div><div><h2 className="text-xl font-black">Zugeordnete Kategorien</h2><p className="mt-1 text-sm font-semibold text-[#52616F]">Höhere Priorität bedeutet spätere bevorzugte Auswahl. Die Zuordnung kann ohne Datenverlust deaktiviert werden.</p></div></div>
      {feedback ? <div role="status" className={`mt-4 rounded-2xl border px-4 py-3 text-sm font-bold ${feedback.type === "error" ? "border-[#F3B3B3] bg-[#FFF1F1] text-[#9F1D1D]" : "border-[#B8DEC1] bg-[#F2FFF4] text-[#1E6B32]"}`}>{feedback.message}</div> : null}

      <form onSubmit={assign} className="mt-5 grid gap-3 rounded-2xl bg-white p-4 md:grid-cols-[minmax(220px,1fr)_150px_auto_auto] md:items-end">
        <label className="grid gap-2"><span className="text-xs font-black uppercase tracking-[0.12em]">Kategorie</span><select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="min-h-11 rounded-xl border border-[#C8D8E8] px-3 text-sm font-bold"><option value="">Kategorie auswählen</option>{available.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        <label className="grid gap-2"><span className="text-xs font-black uppercase tracking-[0.12em]">Priorität</span><input value={priority} onChange={(event) => setPriority(event.target.value)} inputMode="numeric" className="min-h-11 rounded-xl border border-[#C8D8E8] px-3 text-sm font-bold" /></label>
        <label className="flex min-h-11 items-center gap-2 rounded-xl border border-[#C8D8E8] px-3"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /><span className="text-sm font-black">Aktiv</span></label>
        <button type="submit" disabled={Boolean(pendingId) || available.length === 0} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#12395F] px-4 text-sm font-black text-white disabled:opacity-60">{pendingId === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} Zuordnen</button>
      </form>

      <div className="mt-4 grid gap-3">
        {initialLinks.length === 0 && !initialError ? <div className="rounded-2xl border border-dashed border-[#C8D8E8] bg-white p-5 text-sm font-bold text-[#52616F]">Noch keine Kategorie zugeordnet.</div> : initialLinks.map((link) => (
          <article key={link.id} className="grid gap-3 rounded-2xl bg-white p-4 lg:grid-cols-[minmax(180px,1fr)_140px_auto_auto] lg:items-center">
            <div><p className="font-black">{link.category_name}</p><p className="mt-1 text-xs font-bold text-[#52616F]">{link.category_active ? "Kategorie aktiv" : "Kategorie inaktiv"}</p></div>
            <label className="grid gap-1"><span className="text-xs font-black">Priorität</span><input value={draftPriorities[link.id] ?? String(link.priority)} onChange={(event) => setDraftPriorities((current) => ({ ...current, [link.id]: event.target.value }))} inputMode="numeric" className="min-h-10 rounded-xl border border-[#C8D8E8] px-3 text-sm font-bold" /></label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={link.active} onChange={(event) => void save(link, event.target.checked)} disabled={Boolean(pendingId)} /><span className="text-sm font-black">{link.active ? "Aktiv" : "Inaktiv"}</span></label>
            <div className="flex gap-2"><button type="button" onClick={() => void save(link)} disabled={Boolean(pendingId)} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#12395F] px-3 text-xs font-black text-white">{pendingId === link.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Speichern</button><button type="button" onClick={() => void remove(link)} disabled={Boolean(pendingId)} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#F1B5B5] bg-[#FFF5F5] px-3 text-xs font-black text-[#9F1D1D]"><Trash2 className="h-4 w-4" /> Entfernen</button></div>
          </article>
        ))}
      </div>
    </section>
  );
}
