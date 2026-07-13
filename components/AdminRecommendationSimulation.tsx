"use client";

import type {
  RecommendationMatchField,
  RecommendationSimulationEvaluatedRule,
  RecommendationSimulationFields,
  RecommendationSimulationResult,
  RecommendationSimulationRuleStatus,
} from "@/app/lib/recommendations/types";
import { AlertCircle, Beaker, CheckCircle2, Loader2, Trophy } from "lucide-react";
import { FormEvent, useState } from "react";

type Props = { initialProjectKey: string };
type Feedback = { type: "error" | "success"; message: string } | null;

const FIELD_LABELS: Record<RecommendationMatchField, string> = {
  raw_text: "Rohtext",
  normalized_name: "Normalisierter Name",
  category: "Kategorie",
  product_type: "Produkttyp",
  notes: "Notizen",
};

const STATUS_LABELS: Record<RecommendationSimulationRuleStatus, string> = {
  matched: "Getroffen",
  excluded: "Ausgeschlossen",
  not_matched: "Nicht getroffen",
  disabled: "Deaktiviert",
  category_disabled: "Kategorie deaktiviert",
};

const emptyFields: RecommendationSimulationFields = {
  raw_text: "",
  normalized_name: "",
  category: "",
  product_type: "",
  notes: "",
};

const fieldClass =
  "w-full rounded-2xl border border-[#D8C8B8] bg-[#FFFCF8] px-4 py-3 text-sm font-bold text-[#102A43] outline-none focus:border-[#A75B28] focus:ring-4 focus:ring-[#A75B28]/10";

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

function statusClass(status: RecommendationSimulationRuleStatus) {
  if (status === "matched") return "bg-[#EAF8E8] text-[#2E7D32]";
  if (status === "excluded") return "bg-[#FFF0DD] text-[#9A4E12]";
  if (status === "disabled" || status === "category_disabled") {
    return "bg-[#F1F3F5] text-[#697985]";
  }
  return "bg-[#FFF1F1] text-[#9F1D1D]";
}

function RuleDetails({ rule }: { rule: RecommendationSimulationEvaluatedRule }) {
  return (
    <article className="rounded-2xl border border-[#E8DED2] bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-black">{rule.name}</h3>
        <span className={`rounded-full px-3 py-1 text-xs font-black ${statusClass(rule.status)}`}>
          {STATUS_LABELS[rule.status]}
        </span>
        <span className="rounded-full bg-[#EEF4FA] px-3 py-1 text-xs font-black">
          {rule.patternType} · Priorität {rule.priority}
        </span>
      </div>
      <p className="mt-2 text-sm font-bold text-[#A75B28]">Kategorie: {rule.categoryName}</p>
      <p className="mt-2 text-sm font-semibold leading-6 text-[#52616F]">{rule.reason}</p>
      <p className="mt-3 text-xs font-black uppercase tracking-[0.1em] text-[#697985]">
        Geprüfte Felder
      </p>
      <p className="mt-1 text-sm font-semibold">
        {rule.checkedFields.map((field) => FIELD_LABELS[field]).join(", ")}
      </p>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl bg-[#FBF7F0] p-3">
          <p className="text-xs font-black uppercase tracking-[0.1em]">Regelbegriffe</p>
          <ul className="mt-2 grid gap-2 text-sm">
            {rule.termChecks.map((check) => (
              <li key={check.normalizedTerm}>
                <span className="font-black">{check.term}</span>
                <span className="text-[#697985]"> → {check.normalizedTerm}</span>
                <span className="block text-xs font-semibold text-[#52616F]">
                  {check.matches.length > 0
                    ? `Treffer in: ${check.matches.map((match) => FIELD_LABELS[match.field]).join(", ")}`
                    : "Kein Treffer"}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl bg-[#FFF8EC] p-3">
          <p className="text-xs font-black uppercase tracking-[0.1em]">Ausschlussbegriffe</p>
          {rule.exclusionChecks.length === 0 ? (
            <p className="mt-2 text-sm font-semibold text-[#697985]">Keine hinterlegt.</p>
          ) : (
            <ul className="mt-2 grid gap-2 text-sm">
              {rule.exclusionChecks.map((check) => (
                <li key={check.normalizedTerm}>
                  <span className="font-black">{check.term}</span>
                  <span className="text-[#697985]"> → {check.normalizedTerm}</span>
                  <span className="block text-xs font-semibold text-[#52616F]">
                    {check.matches.length > 0
                      ? `Ausschluss getroffen in: ${check.matches.map((match) => FIELD_LABELS[match.field]).join(", ")}`
                      : "Geprüft, nicht getroffen"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </article>
  );
}

export default function AdminRecommendationSimulation({ initialProjectKey }: Props) {
  const [projectKey, setProjectKey] = useState(initialProjectKey);
  const [fields, setFields] = useState<RecommendationSimulationFields>(emptyFields);
  const [debug, setDebug] = useState(false);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [result, setResult] = useState<RecommendationSimulationResult | null>(null);
  const totalLength = Object.values(fields).reduce((sum, value) => sum + value.length, 0);

  function updateField(field: RecommendationMatchField, value: string) {
    setFields((current) => ({ ...current, [field]: value }));
    setFeedback(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!fields.raw_text.trim()) {
      setFeedback({ type: "error", message: "Bitte einen Rohtext für die Simulation eingeben." });
      return;
    }
    if (totalLength > 10_000) {
      setFeedback({ type: "error", message: "Die simulierten Texte dürfen zusammen maximal 10.000 Zeichen enthalten." });
      return;
    }

    setPending(true);
    setFeedback(null);
    setResult(null);
    try {
      const response = await fetch("/api/admin/recommendation-simulation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ projectKey, fields, debug }),
      });
      const payload = await readPayload(response);
      if (!response.ok || payload?.ok !== true || !payload.simulation) {
        throw new Error(
          typeof payload?.message === "string"
            ? payload.message
            : "Die Simulation konnte nicht ausgeführt werden.",
        );
      }
      const simulation = payload.simulation as RecommendationSimulationResult;
      setResult(simulation);
      setFeedback({ type: "success", message: "Die Simulation wurde ohne Speicherung ausgeführt." });
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Die Simulation konnte nicht ausgeführt werden.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-6">
      <form onSubmit={submit} className="rounded-[30px] border border-[#E8DED2] bg-white p-5 shadow-sm sm:p-7">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-[#EEF4FA] p-3 text-[#12395F]"><Beaker className="h-5 w-5" /></div>
          <div>
            <h2 className="text-xl font-black">Simulierte Materialfelder</h2>
            <p className="mt-1 text-sm font-semibold leading-6 text-[#52616F]">
              Jedes Feld wird getrennt normalisiert und nur von Regeln geprüft, die dieses Matchfeld enthalten.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-4">
          <label className="grid gap-2">
            <span className="text-sm font-black">Rohtext *</span>
            <textarea rows={8} value={fields.raw_text} onChange={(event) => updateField("raw_text", event.target.value)} placeholder={"Turnschuhe mit heller Sohle\nDeutschheft Lineatur 1\noder eine vollständige Materialliste"} className={fieldClass} required />
          </label>
          <div className="grid gap-4 md:grid-cols-2">
            {(["normalized_name", "category", "product_type", "notes"] as RecommendationMatchField[]).map((field) => (
              <label key={field} className="grid gap-2">
                <span className="text-sm font-black">{FIELD_LABELS[field]}</span>
                <textarea rows={3} value={fields[field]} onChange={(event) => updateField(field, event.target.value)} className={fieldClass} placeholder={`Optionaler Wert für ${FIELD_LABELS[field]}`} />
              </label>
            ))}
          </div>
          <div className="grid gap-4 md:grid-cols-[minmax(220px,1fr)_auto] md:items-end">
            <label className="grid gap-2">
              <span className="text-sm font-black">Projekt</span>
              <input value={projectKey} onChange={(event) => setProjectKey(event.target.value)} className={fieldClass} required />
            </label>
            <label className="flex min-h-12 items-center gap-3 rounded-2xl border border-[#D8C8B8] bg-[#FFFCF8] px-4">
              <input type="checkbox" checked={debug} onChange={(event) => setDebug(event.target.checked)} className="h-5 w-5" />
              <span className="text-sm font-black">Debug-Modus: alle Regeln zeigen</span>
            </label>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className={`text-xs font-bold ${totalLength > 10_000 ? "text-[#9F1D1D]" : "text-[#697985]"}`}>{totalLength.toLocaleString("de-DE")} / 10.000 Zeichen</p>
          <button type="submit" disabled={pending} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#12395F] px-6 text-sm font-black text-white disabled:opacity-60">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Beaker className="h-4 w-4" />}
            {pending ? "Simulation läuft …" : "Simulation starten"}
          </button>
        </div>
      </form>

      {feedback ? (
        <div role="status" className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm font-bold ${feedback.type === "error" ? "border-[#F3B3B3] bg-[#FFF1F1] text-[#9F1D1D]" : "border-[#B8DEC1] bg-[#F2FFF4] text-[#1E6B32]"}`}>
          {feedback.type === "error" ? <AlertCircle className="h-5 w-5 shrink-0" /> : <CheckCircle2 className="h-5 w-5 shrink-0" />}
          {feedback.message}
        </div>
      ) : null}

      {result ? (
        <div className="grid gap-6">
          <section className="rounded-[28px] border border-[#E8DED2] bg-white p-5">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">Zusammenfassung</p>
            <h2 className="mt-2 text-xl font-black">{result.summary.message}</h2>
            <div className="mt-4 flex flex-wrap gap-2 text-xs font-black">
              <span className="rounded-full bg-[#EEF4FA] px-3 py-1">{result.summary.evaluatedRuleCount} Regeln geprüft</span>
              <span className="rounded-full bg-[#EAF8E8] px-3 py-1">{result.summary.matchedRuleCount} Treffer</span>
              <span className="rounded-full bg-[#FFF0DD] px-3 py-1">{result.summary.excludedRuleCount} ausgeschlossen</span>
              <span className="rounded-full bg-[#FBF7F0] px-3 py-1">{result.summary.matchedCategoryCount} Kategorien</span>
            </div>
          </section>

          <section className="rounded-[28px] border border-[#E8DED2] bg-white p-5">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">Schritt 1</p>
            <h2 className="mt-2 text-xl font-black">Normalisierte Felder</h2>
            <dl className="mt-4 grid gap-3 md:grid-cols-2">
              {(Object.entries(result.normalizedFields) as Array<[RecommendationMatchField, string]>).map(([field, value]) => (
                <div key={field} className="rounded-2xl bg-[#FBF7F0] p-4">
                  <dt className="text-xs font-black uppercase tracking-[0.1em] text-[#A75B28]">{FIELD_LABELS[field]}</dt>
                  <dd className="mt-2 whitespace-pre-wrap break-words text-sm font-bold">{value || "–"}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="rounded-[28px] border border-[#E8DED2] bg-[#FBF7F0] p-5">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">Schritt 2</p>
            <h2 className="mt-2 text-xl font-black">{result.summary.debug ? "Alle geprüften Regeln" : "Gefundene Regeln"}</h2>
            <div className="mt-4 grid gap-3">
              {result.evaluatedRules.length > 0
                ? result.evaluatedRules.map((rule) => <RuleDetails key={rule.id} rule={rule} />)
                : <p className="rounded-2xl bg-white p-4 text-sm font-bold text-[#52616F]">Keine passende Regel gefunden.</p>}
            </div>
          </section>

          {result.matchedCategories.length === 0 ? (
            <section className="rounded-[28px] border border-dashed border-[#D8C8B8] bg-white p-8 text-center">
              <p className="text-lg font-black">Keine passende Regel gefunden.</p>
              <p className="mt-2 font-bold text-[#52616F]">Keine Kategorie.</p>
              <p className="mt-1 font-bold text-[#52616F]">Keine Empfehlung.</p>
            </section>
          ) : result.matchedCategories.map((category) => (
            <section key={category.id} className="rounded-[30px] border border-[#C8D8E8] bg-white p-5 shadow-sm sm:p-7">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">Schritt 3 · Kategorie</p>
              <h2 className="mt-2 text-2xl font-black">{category.name}</h2>
              <p className="mt-2 text-sm font-semibold text-[#52616F]">Aktiviert durch {category.matchedRules.length} passende {category.matchedRules.length === 1 ? "Regel" : "Regeln"}.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {category.matchedRules.map((rule) => <span key={rule.id} className="rounded-full bg-[#EEF4FA] px-3 py-1 text-xs font-black">{rule.priority} · {rule.name}</span>)}
              </div>

              <div className="mt-6 border-t border-[#E8DED2] pt-5">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">Schritt 4 · Partner</p>
                {category.rankedPartners.length > 0 ? (
                  <ol className="mt-3 grid gap-2">
                    {category.rankedPartners.map((partner) => (
                      <li key={partner.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[#FBF7F0] px-4 py-3">
                        <span className="font-black">{partner.name} <span className="text-xs text-[#697985]">({partner.partnerCode})</span></span>
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-black">Priorität {partner.priority}</span>
                      </li>
                    ))}
                  </ol>
                ) : <p className="mt-3 text-sm font-bold text-[#52616F]">Keine aktiven Partner mit aktiver Zuordnung.</p>}
              </div>

              <div className="mt-6 rounded-[24px] border border-[#E3C763] bg-[#FFF8D8] p-5">
                <div className="flex items-start gap-3"><Trophy className="mt-0.5 h-6 w-6 shrink-0 text-[#9A6A00]" /><div><p className="text-xs font-black uppercase tracking-[0.16em] text-[#9A6A00]">Schritt 5 · Empfohlener Partner</p>{category.winner ? <><h3 className="mt-2 text-xl font-black">{category.winner.partner.name}</h3><p className="mt-2 text-sm font-bold text-[#52616F]">Grund: {category.winner.reason}</p></> : <><h3 className="mt-2 text-lg font-black">Keine Empfehlung</h3><p className="mt-2 text-sm font-bold text-[#52616F]">{category.winnerReason}</p></>}</div></div>
              </div>
            </section>
          ))}
        </div>
      ) : null}
    </div>
  );
}
