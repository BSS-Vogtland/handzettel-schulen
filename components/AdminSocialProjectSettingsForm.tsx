"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Briefcase,
  CheckCircle2,
  Globe,
  ImageIcon,
  Loader2,
  Megaphone,
  Save,
  Target,
  Users,
} from "lucide-react";

type SocialProjectRow = {
  id: string;
  name: string;
  website_url: string | null;
  industry: string | null;
  target_audience: string | null;
  offer_summary: string | null;
  brand_voice: string | null;
  image_style: string | null;
  additional_notes: string | null;
  content_pillars: string[] | null;
  content_goals: string[] | null;
  taboo_topics: string[] | null;
  cta_examples: string[] | null;
  platform_targets: string[] | null;
};

type ApiResponse = {
  ok?: boolean;
  message?: string;
};

type FormState = {
  name: string;
  website_url: string;
  industry: string;
  target_audience: string;
  offer_summary: string;
  brand_voice: string;
  image_style: string;
  additional_notes: string;
  content_pillars_text: string;
  content_goals_text: string;
  taboo_topics_text: string;
  cta_examples_text: string;
  platform_targets_text: string;
};

function joinList(value: string[] | null) {
  return (value || []).join("\n");
}

function splitList(value: string) {
  return value
    .split(/[\n,]+/g)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 40);
}

function FieldLabel({
  title,
  description,
  icon,
}: {
  title: string;
  description?: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="mb-2">
      <label className="flex items-center gap-2 text-sm font-black text-[#102A43]">
        {icon}
        {title}
      </label>
      {description ? (
        <p className="mt-1 text-xs font-semibold leading-5 text-[#627D98]">
          {description}
        </p>
      ) : null}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="w-full rounded-2xl border border-[#E7D8C3] bg-white px-4 py-3 text-sm font-semibold text-[#102A43] outline-none transition placeholder:text-[#9FB3C8] focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
    />
  );
}

function TextArea({
  value,
  onChange,
  rows = 5,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <textarea
      value={value}
      rows={rows}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="w-full resize-y rounded-2xl border border-[#E7D8C3] bg-white px-4 py-3 text-sm font-semibold leading-6 text-[#102A43] outline-none transition placeholder:text-[#9FB3C8] focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
    />
  );
}

export default function AdminSocialProjectSettingsForm({
  project,
}: {
  project: SocialProjectRow;
}) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);

  const [form, setForm] = useState<FormState>(() => ({
    name: project.name || "",
    website_url: project.website_url || "",
    industry: project.industry || "",
    target_audience: project.target_audience || "",
    offer_summary: project.offer_summary || "",
    brand_voice: project.brand_voice || "",
    image_style: project.image_style || "",
    additional_notes: project.additional_notes || "",
    content_pillars_text: joinList(project.content_pillars),
    content_goals_text: joinList(project.content_goals),
    taboo_topics_text: joinList(project.taboo_topics),
    cta_examples_text: joinList(project.cta_examples),
    platform_targets_text: joinList(project.platform_targets),
  }));

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function handleSave() {
    if (isSaving) return;

    if (!form.name.trim()) {
      window.alert("Bitte gib einen Projektnamen ein.");
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch("/api/admin/social/project", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: form.name,
          website_url: form.website_url,
          industry: form.industry,
          target_audience: form.target_audience,
          offer_summary: form.offer_summary,
          brand_voice: form.brand_voice,
          image_style: form.image_style,
          additional_notes: form.additional_notes,
          content_pillars: splitList(form.content_pillars_text),
          content_goals: splitList(form.content_goals_text),
          taboo_topics: splitList(form.taboo_topics_text),
          cta_examples: splitList(form.cta_examples_text),
          platform_targets: splitList(form.platform_targets_text),
        }),
      });

      const json = (await response.json()) as ApiResponse;

      if (!response.ok || !json.ok) {
        window.alert(json.message || "Das Social-Projekt konnte nicht gespeichert werden.");
        return;
      }

      window.alert(json.message || "Social-Projekt wurde gespeichert.");
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unbekannter Fehler beim Speichern.";

      window.alert(message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm sm:p-7">
        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <FieldLabel
              title="Projektname / Markenname"
              description="So wird die Marke in den Prompts verwendet."
              icon={<Megaphone className="h-4 w-4 text-[#B5282D]" />}
            />
            <TextInput
              value={form.name}
              onChange={(value) => updateField("name", value)}
              placeholder="z. B. Handzettel-Schulen.de"
            />
          </div>

          <div>
            <FieldLabel
              title="Website"
              description="Zielseite für CTAs und Kontext."
              icon={<Globe className="h-4 w-4 text-[#B5282D]" />}
            />
            <TextInput
              value={form.website_url}
              onChange={(value) => updateField("website_url", value)}
              placeholder="https://www.beispiel.de"
            />
          </div>
        </div>

        <div className="mt-5">
          <FieldLabel
            title="Branche"
            description="Damit das Tool versteht, in welchem Markt der Kunde aktiv ist."
            icon={<Briefcase className="h-4 w-4 text-[#B5282D]" />}
          />
          <TextInput
            value={form.industry}
            onChange={(value) => updateField("industry", value)}
            placeholder="z. B. Fitnessstudio, Kanzlei, Handwerker, lokaler Händler"
          />
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm sm:p-7">
          <FieldLabel
            title="Zielgruppe"
            description="Wer soll angesprochen werden?"
            icon={<Users className="h-4 w-4 text-[#B5282D]" />}
          />
          <TextArea
            value={form.target_audience}
            onChange={(value) => updateField("target_audience", value)}
            rows={6}
            placeholder="z. B. Eltern von Schulkindern vor dem Schulstart ..."
          />
        </div>

        <div className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm sm:p-7">
          <FieldLabel
            title="Angebot / Nutzen"
            description="Was verkauft oder erklärt der Kunde?"
            icon={<Target className="h-4 w-4 text-[#B5282D]" />}
          />
          <TextArea
            value={form.offer_summary}
            onChange={(value) => updateField("offer_summary", value)}
            rows={6}
            placeholder="Kurz erklären, was das Angebot ist und welchen Nutzen es hat."
          />
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm sm:p-7">
          <FieldLabel
            title="Markenstimme / Tonfall"
            description="Wie sollen Texte klingen?"
            icon={<Megaphone className="h-4 w-4 text-[#B5282D]" />}
          />
          <TextArea
            value={form.brand_voice}
            onChange={(value) => updateField("brand_voice", value)}
            rows={7}
            placeholder="z. B. direkt, freundlich, modern, vertrauenswürdig, nicht aufdringlich ..."
          />
        </div>

        <div className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm sm:p-7">
          <FieldLabel
            title="Bildstil"
            description="Wie sollen Bilder wirken?"
            icon={<ImageIcon className="h-4 w-4 text-[#B5282D]" />}
          />
          <TextArea
            value={form.image_style}
            onChange={(value) => updateField("image_style", value)}
            rows={7}
            placeholder="z. B. warm, realistisch, familiennah, keine Business-Optik ..."
          />
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm sm:p-7">
          <FieldLabel
            title="Content-Säulen"
            description="Ein Thema pro Zeile. Daraus entstehen später viele Beiträge."
            icon={<CheckCircle2 className="h-4 w-4 text-[#B5282D]" />}
          />
          <TextArea
            value={form.content_pillars_text}
            onChange={(value) => updateField("content_pillars_text", value)}
            rows={8}
            placeholder={"Problem-Bewusstsein\nFehler vermeiden\nKundenfragen\nVertrauen\nAblauf erklären"}
          />
        </div>

        <div className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm sm:p-7">
          <FieldLabel
            title="Content-Ziele"
            description="Was sollen die Beiträge erreichen?"
            icon={<Target className="h-4 w-4 text-[#B5282D]" />}
          />
          <TextArea
            value={form.content_goals_text}
            onChange={(value) => updateField("content_goals_text", value)}
            rows={8}
            placeholder={"mehr Website-Besuche\nmehr Anfragen\nmehr Vertrauen\nmehr Sichtbarkeit"}
          />
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm sm:p-7">
          <FieldLabel
            title="Tabuthemen / Verbote"
            description="Was soll die KI vermeiden?"
            icon={<CheckCircle2 className="h-4 w-4 text-[#B5282D]" />}
          />
          <TextArea
            value={form.taboo_topics_text}
            onChange={(value) => updateField("taboo_topics_text", value)}
            rows={8}
            placeholder={"keine falschen Versprechen\nkeine Panikmache\nkeine aggressiven Verkaufsclaims"}
          />
        </div>

        <div className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm sm:p-7">
          <FieldLabel
            title="CTA-Beispiele"
            description="Welche Handlungsaufforderungen soll das Tool nutzen?"
            icon={<Megaphone className="h-4 w-4 text-[#B5282D]" />}
          />
          <TextArea
            value={form.cta_examples_text}
            onChange={(value) => updateField("cta_examples_text", value)}
            rows={8}
            placeholder={"Jetzt anfragen\nListe hochladen\nTermin sichern\nMehr erfahren"}
          />
        </div>
      </section>

      <section className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm sm:p-7">
        <FieldLabel
          title="Plattformen"
          description="Eine Plattform pro Zeile. Standard: TikTok, Instagram, Facebook."
          icon={<Globe className="h-4 w-4 text-[#B5282D]" />}
        />
        <TextArea
          value={form.platform_targets_text}
          onChange={(value) => updateField("platform_targets_text", value)}
          rows={4}
          placeholder={"tiktok\ninstagram\nfacebook"}
        />
      </section>

      <section className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm sm:p-7">
        <FieldLabel
          title="Zusätzliche Hinweise"
          description="Alles, was der Kunde dem Tool sonst noch mitgeben möchte."
          icon={<CheckCircle2 className="h-4 w-4 text-[#B5282D]" />}
        />
        <TextArea
          value={form.additional_notes}
          onChange={(value) => updateField("additional_notes", value)}
          rows={6}
          placeholder="Besondere Regeln, regionale Hinweise, Angebotsdetails, saisonale Besonderheiten ..."
        />
      </section>

      <div className="sticky bottom-4 z-20 rounded-[2rem] border border-[#E7D8C3] bg-white/95 p-4 shadow-[0_18px_45px_rgba(16,42,67,0.18)] backdrop-blur">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold leading-6 text-[#52616F]">
            Diese Einstellungen steuern künftig die KI-Generierung. Genau das
            wird später die Self-Service-Konfiguration für Kunden.
          </p>

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#B5282D] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {isSaving ? "Speichern ..." : "Projekt speichern"}
          </button>
        </div>
      </div>
    </div>
  );
}