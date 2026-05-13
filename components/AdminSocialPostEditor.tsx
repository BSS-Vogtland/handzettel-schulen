"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  CheckCircle2,
  FileText,
  Hash,
  ImageIcon,
  Loader2,
  Megaphone,
  Save,
  Video,
} from "lucide-react";

type SocialPostRow = {
  id: string;
  created_at: string;
  updated_at: string;
  brand_project: string;
  status: string;
  topic: string;
  content_angle: string | null;
  hook: string;
  caption: string;
  cta: string | null;
  hashtags: string[] | null;
  keywords: string[] | null;
  tiktok_hook: string | null;
  tiktok_caption: string | null;
  instagram_hook: string | null;
  instagram_caption: string | null;
  facebook_hook: string | null;
  facebook_caption: string | null;
  image_prompt: string | null;
  video_prompt: string | null;
  scheduled_at: string | null;
  published_at: string | null;
  platform_targets: string[] | null;
};

type ApiResponse = {
  ok?: boolean;
  message?: string;
};

type FormState = {
  status: string;
  topic: string;
  content_angle: string;
  hook: string;
  caption: string;
  cta: string;
  hashtagsText: string;
  keywordsText: string;
  tiktok_hook: string;
  tiktok_caption: string;
  instagram_hook: string;
  instagram_caption: string;
  facebook_hook: string;
  facebook_caption: string;
  image_prompt: string;
  video_prompt: string;
  scheduled_at: string;
};

function toLocalDateTimeInput(value: string | null) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  const pad = (number: number) => String(number).padStart(2, "0");

  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function splitList(value: string) {
  return value
    .split(/[\n,]+/g)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 30);
}

function FieldLabel({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
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
  placeholder,
  rows = 5,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
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

export default function AdminSocialPostEditor({
  post,
}: {
  post: SocialPostRow;
}) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);

  const [form, setForm] = useState<FormState>(() => ({
    status: post.status || "draft",
    topic: post.topic || "",
    content_angle: post.content_angle || "",
    hook: post.hook || "",
    caption: post.caption || "",
    cta: post.cta || "",
    hashtagsText: (post.hashtags || []).join("\n"),
    keywordsText: (post.keywords || []).join("\n"),
    tiktok_hook: post.tiktok_hook || "",
    tiktok_caption: post.tiktok_caption || "",
    instagram_hook: post.instagram_hook || "",
    instagram_caption: post.instagram_caption || "",
    facebook_hook: post.facebook_hook || "",
    facebook_caption: post.facebook_caption || "",
    image_prompt: post.image_prompt || "",
    video_prompt: post.video_prompt || "",
    scheduled_at: toLocalDateTimeInput(post.scheduled_at),
  }));

  const hashtagsPreview = useMemo(
    () => splitList(form.hashtagsText),
    [form.hashtagsText]
  );

  const keywordsPreview = useMemo(
    () => splitList(form.keywordsText),
    [form.keywordsText]
  );

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function handleSave() {
    if (isSaving) return;

    if (!form.topic.trim()) {
      window.alert("Bitte gib ein Thema ein.");
      return;
    }

    if (!form.hook.trim()) {
      window.alert("Bitte gib einen Haupt-Hook ein.");
      return;
    }

    if (!form.caption.trim()) {
      window.alert("Bitte gib eine Caption ein.");
      return;
    }

    setIsSaving(true);

    try {
      const scheduledAt = form.scheduled_at
        ? new Date(form.scheduled_at).toISOString()
        : null;

      const response = await fetch(`/api/admin/social/${post.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: form.status,
          topic: form.topic,
          content_angle: form.content_angle,
          hook: form.hook,
          caption: form.caption,
          cta: form.cta,
          hashtags: splitList(form.hashtagsText),
          keywords: splitList(form.keywordsText),
          tiktok_hook: form.tiktok_hook,
          tiktok_caption: form.tiktok_caption,
          instagram_hook: form.instagram_hook,
          instagram_caption: form.instagram_caption,
          facebook_hook: form.facebook_hook,
          facebook_caption: form.facebook_caption,
          image_prompt: form.image_prompt,
          video_prompt: form.video_prompt,
          scheduled_at: scheduledAt,
        }),
      });

      const json = (await response.json()) as ApiResponse;

      if (!response.ok || !json.ok) {
        window.alert(json.message || "Der Social-Beitrag konnte nicht gespeichert werden.");
        return;
      }

      window.alert(json.message || "Social-Beitrag wurde gespeichert.");
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
        <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
          <div>
            <FieldLabel
              icon={<Megaphone className="h-4 w-4 text-[#B5282D]" />}
              title="Thema"
              description="Das Hauptthema dieses Social-Beitrags."
            />
            <TextInput
              value={form.topic}
              onChange={(value) => updateField("topic", value)}
              placeholder="z. B. Fehlkäufe bei Schulmaterial vermeiden"
            />
          </div>

          <div>
            <FieldLabel
              icon={<CheckCircle2 className="h-4 w-4 text-[#B5282D]" />}
              title="Status"
              description="Aktueller Bearbeitungsstand."
            />
            <select
              value={form.status}
              onChange={(event) => updateField("status", event.target.value)}
              className="w-full rounded-2xl border border-[#E7D8C3] bg-white px-4 py-3 text-sm font-black text-[#102A43] outline-none transition focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
            >
              <option value="draft">Entwurf</option>
              <option value="approved">Freigegeben</option>
              <option value="scheduled">Geplant</option>
              <option value="published">Veröffentlicht</option>
              <option value="failed">Fehler</option>
              <option value="archived">Archiviert</option>
            </select>
          </div>
        </div>

        <div className="mt-5">
          <FieldLabel
            icon={<FileText className="h-4 w-4 text-[#B5282D]" />}
            title="Inhaltlicher Winkel"
            description="Warum dieser Beitrag für Eltern relevant ist."
          />
          <TextArea
            value={form.content_angle}
            onChange={(value) => updateField("content_angle", value)}
            rows={3}
            placeholder="Kurz beschreiben, worum es bei diesem Beitrag geht."
          />
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm sm:p-7">
          <FieldLabel
            icon={<Megaphone className="h-4 w-4 text-[#B5282D]" />}
            title="Haupt-Hook"
            description="Der erste Satz muss Aufmerksamkeit erzeugen."
          />
          <TextArea
            value={form.hook}
            onChange={(value) => updateField("hook", value)}
            rows={3}
            placeholder="z. B. Viele Eltern kaufen Schulmaterial doppelt – wegen genau diesem Fehler."
          />
        </div>

        <div className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm sm:p-7">
          <FieldLabel
            icon={<CheckCircle2 className="h-4 w-4 text-[#B5282D]" />}
            title="Call-to-Action"
            description="Was soll der Nutzer nach dem Beitrag tun?"
          />
          <TextArea
            value={form.cta}
            onChange={(value) => updateField("cta", value)}
            rows={3}
            placeholder="z. B. Lade Deine Materialliste hoch und prüfe Deinen Paketwunsch."
          />
        </div>
      </section>

      <section className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm sm:p-7">
        <FieldLabel
          icon={<FileText className="h-4 w-4 text-[#B5282D]" />}
          title="Haupt-Caption"
          description="Die allgemeine Caption für den Beitrag."
        />
        <TextArea
          value={form.caption}
          onChange={(value) => updateField("caption", value)}
          rows={7}
          placeholder="Caption eingeben ..."
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm sm:p-7">
          <FieldLabel
            icon={<Hash className="h-4 w-4 text-[#B5282D]" />}
            title="Hashtags"
            description="Ein Hashtag pro Zeile oder durch Komma getrennt."
          />
          <TextArea
            value={form.hashtagsText}
            onChange={(value) => updateField("hashtagsText", value)}
            rows={7}
            placeholder="#schulstart&#10;#schulmaterial&#10;#eltern"
          />

          <div className="mt-4 flex flex-wrap gap-2">
            {hashtagsPreview.map((hashtag) => (
              <span
                key={hashtag}
                className="rounded-full bg-[#F5E8D8] px-3 py-1 text-xs font-black text-[#8A5A35]"
              >
                {hashtag.startsWith("#") ? hashtag : `#${hashtag}`}
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm sm:p-7">
          <FieldLabel
            icon={<Hash className="h-4 w-4 text-[#B5282D]" />}
            title="Keywords"
            description="Ein Keyword pro Zeile oder durch Komma getrennt."
          />
          <TextArea
            value={form.keywordsText}
            onChange={(value) => updateField("keywordsText", value)}
            rows={7}
            placeholder="Schulmaterial&#10;Materialliste&#10;Schulstart"
          />

          <div className="mt-4 flex flex-wrap gap-2">
            {keywordsPreview.map((keyword) => (
              <span
                key={keyword}
                className="rounded-full border border-[#E7D8C3] bg-white px-3 py-1 text-xs font-bold text-[#486581]"
              >
                {keyword}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm sm:p-7">
          <FieldLabel
            icon={<Video className="h-4 w-4 text-[#B5282D]" />}
            title="TikTok-Hook"
          />
          <TextArea
            value={form.tiktok_hook}
            onChange={(value) => updateField("tiktok_hook", value)}
            rows={3}
          />

          <div className="mt-4">
            <FieldLabel
              icon={<FileText className="h-4 w-4 text-[#B5282D]" />}
              title="TikTok-Caption"
            />
            <TextArea
              value={form.tiktok_caption}
              onChange={(value) => updateField("tiktok_caption", value)}
              rows={6}
            />
          </div>
        </div>

        <div className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm sm:p-7">
          <FieldLabel
            icon={<ImageIcon className="h-4 w-4 text-[#B5282D]" />}
            title="Instagram-Hook"
          />
          <TextArea
            value={form.instagram_hook}
            onChange={(value) => updateField("instagram_hook", value)}
            rows={3}
          />

          <div className="mt-4">
            <FieldLabel
              icon={<FileText className="h-4 w-4 text-[#B5282D]" />}
              title="Instagram-Caption"
            />
            <TextArea
              value={form.instagram_caption}
              onChange={(value) => updateField("instagram_caption", value)}
              rows={6}
            />
          </div>
        </div>

        <div className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm sm:p-7">
          <FieldLabel
            icon={<Megaphone className="h-4 w-4 text-[#B5282D]" />}
            title="Facebook-Hook"
          />
          <TextArea
            value={form.facebook_hook}
            onChange={(value) => updateField("facebook_hook", value)}
            rows={3}
          />

          <div className="mt-4">
            <FieldLabel
              icon={<FileText className="h-4 w-4 text-[#B5282D]" />}
              title="Facebook-Caption"
            />
            <TextArea
              value={form.facebook_caption}
              onChange={(value) => updateField("facebook_caption", value)}
              rows={6}
            />
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm sm:p-7">
          <FieldLabel
            icon={<ImageIcon className="h-4 w-4 text-[#B5282D]" />}
            title="Bild-Prompt"
            description="Englischer Prompt für spätere Bildgenerierung."
          />
          <TextArea
            value={form.image_prompt}
            onChange={(value) => updateField("image_prompt", value)}
            rows={9}
          />
        </div>

        <div className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm sm:p-7">
          <FieldLabel
            icon={<Video className="h-4 w-4 text-[#B5282D]" />}
            title="Video-Prompt"
            description="Englischer Prompt für spätere Kurzvideos."
          />
          <TextArea
            value={form.video_prompt}
            onChange={(value) => updateField("video_prompt", value)}
            rows={9}
          />
        </div>
      </section>

      <section className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm sm:p-7">
        <FieldLabel
          icon={<CalendarClock className="h-4 w-4 text-[#B5282D]" />}
          title="Geplante Veröffentlichung"
          description="Noch keine automatische Veröffentlichung. Das Datum dient erstmal als Planung."
        />

        <input
          type="datetime-local"
          value={form.scheduled_at}
          onChange={(event) => updateField("scheduled_at", event.target.value)}
          className="w-full rounded-2xl border border-[#E7D8C3] bg-white px-4 py-3 text-sm font-black text-[#102A43] outline-none transition focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10 sm:max-w-sm"
        />
      </section>

      <div className="sticky bottom-4 z-20 rounded-[2rem] border border-[#E7D8C3] bg-white/95 p-4 shadow-[0_18px_45px_rgba(16,42,67,0.18)] backdrop-blur">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold leading-6 text-[#52616F]">
            Speichere Änderungen, bevor Du später Bilder, Planung oder
            Veröffentlichungen daran anschließt.
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
            {isSaving ? "Speichern ..." : "Beitrag speichern"}
          </button>
        </div>
      </div>
    </div>
  );
}