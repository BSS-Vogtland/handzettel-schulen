"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  BellRing,
  CalendarClock,
  Loader2,
  Plus,
  Save,
  Trash2,
} from "lucide-react";

type AutomationSettingsRow = {
  id: string;
  automation_enabled: boolean;
  auto_prepare_content: boolean;
  email_notifications_enabled: boolean;

  recipient_email: string | null;
  recipient_name: string | null;

  timezone: string;
  reminder_times: string[];

  preparation_mode: string;
  prep_lead_business_days: number;

  move_monday_to_friday: boolean;
  move_weekend_to_friday: boolean;

  post_only_after_review: boolean;
  ads_only_after_review: boolean;

  notes: string | null;
};

type FormState = {
  automation_enabled: boolean;
  auto_prepare_content: boolean;
  email_notifications_enabled: boolean;

  recipient_email: string;
  recipient_name: string;

  timezone: string;
  reminder_times: string[];

  preparation_mode: string;
  prep_lead_business_days: string;

  move_monday_to_friday: boolean;
  move_weekend_to_friday: boolean;

  post_only_after_review: boolean;
  ads_only_after_review: boolean;

  notes: string;
};

type ApiResponse = {
  ok?: boolean;
  message?: string;
};

const WEEKDAY_LABELS = [
  "Sonntag",
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
  "Samstag",
];

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function toIsoDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}`;
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    dateStyle: "medium",
  }).format(date);
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function isWeekend(date: Date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function previousBusinessDay(date: Date, leadBusinessDays: number) {
  let current = addDays(date, -1);
  let remaining = Math.max(1, leadBusinessDays);

  while (remaining > 0) {
    if (!isWeekend(current)) {
      remaining -= 1;
      if (remaining === 0) break;
    }

    current = addDays(current, -1);
  }

  return current;
}

function calculateReminderDate(
  publishDate: Date,
  form: FormState
) {
  const day = publishDate.getDay();

  if (form.preparation_mode === "previous_calendar_day") {
    return addDays(publishDate, -1);
  }

  if (form.move_monday_to_friday && day === 1) {
    return addDays(publishDate, -3);
  }

  if (form.move_weekend_to_friday && (day === 0 || day === 6)) {
    const distanceToFriday = day === 6 ? 1 : 2;
    return addDays(publishDate, -distanceToFriday);
  }

  return previousBusinessDay(
    publishDate,
    Number(form.prep_lead_business_days || 1)
  );
}

function buildPreview(form: FormState) {
  const base = new Date();
  base.setHours(12, 0, 0, 0);

  const dates: Date[] = [];

  for (let index = 1; index <= 14; index += 1) {
    dates.push(addDays(base, index));
  }

  return dates.map((publishDate) => {
    const reminderDate = calculateReminderDate(publishDate, form);

    return {
      publishDate,
      reminderDate,
      publishLabel: formatDate(publishDate),
      reminderLabel: formatDate(reminderDate),
      isSpecial:
        publishDate.getDay() === 1 ||
        publishDate.getDay() === 0 ||
        publishDate.getDay() === 6,
    };
  });
}

function ToggleRow({
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

export default function AdminSocialAutomationSettingsForm({
  initialSettings,
}: {
  initialSettings: AutomationSettingsRow | null;
}) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [newReminderTime, setNewReminderTime] = useState("12:00");

  const [form, setForm] = useState<FormState>(() => ({
    automation_enabled: initialSettings?.automation_enabled ?? true,
    auto_prepare_content: initialSettings?.auto_prepare_content ?? true,
    email_notifications_enabled:
      initialSettings?.email_notifications_enabled ?? true,

    recipient_email: initialSettings?.recipient_email || "",
    recipient_name: initialSettings?.recipient_name || "",

    timezone: initialSettings?.timezone || "Europe/Berlin",
    reminder_times:
      initialSettings?.reminder_times && initialSettings.reminder_times.length > 0
        ? initialSettings.reminder_times
        : ["08:00", "18:00"],

    preparation_mode:
      initialSettings?.preparation_mode || "previous_business_day",
    prep_lead_business_days: String(
      initialSettings?.prep_lead_business_days || 1
    ),

    move_monday_to_friday: initialSettings?.move_monday_to_friday ?? true,
    move_weekend_to_friday: initialSettings?.move_weekend_to_friday ?? true,

    post_only_after_review: initialSettings?.post_only_after_review ?? true,
    ads_only_after_review: initialSettings?.ads_only_after_review ?? true,

    notes: initialSettings?.notes || "",
  }));

  const preview = useMemo(() => buildPreview(form), [form]);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function addReminderTime() {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(newReminderTime)) {
      window.alert("Bitte gib eine gültige Uhrzeit im Format HH:MM ein.");
      return;
    }

    setForm((current) => {
      const nextTimes = Array.from(
        new Set([...current.reminder_times, newReminderTime])
      ).sort();

      return {
        ...current,
        reminder_times: nextTimes,
      };
    });
  }

  function removeReminderTime(time: string) {
    setForm((current) => {
      const nextTimes = current.reminder_times.filter((item) => item !== time);

      return {
        ...current,
        reminder_times: nextTimes.length > 0 ? nextTimes : ["08:00"],
      };
    });
  }

  async function handleSave() {
    if (isSaving) return;

    if (form.email_notifications_enabled && !form.recipient_email.trim()) {
      window.alert(
        "Bitte hinterlege eine Empfänger-E-Mail oder deaktiviere E-Mail-Benachrichtigungen."
      );
      return;
    }

    if (form.reminder_times.length === 0) {
      window.alert("Bitte hinterlege mindestens eine Erinnerungszeit.");
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch("/api/admin/social/automation", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          automation_enabled: form.automation_enabled,
          auto_prepare_content: form.auto_prepare_content,
          email_notifications_enabled: form.email_notifications_enabled,

          recipient_email: form.recipient_email,
          recipient_name: form.recipient_name,

          timezone: form.timezone,
          reminder_times: form.reminder_times,

          preparation_mode: form.preparation_mode,
          prep_lead_business_days: form.prep_lead_business_days,

          move_monday_to_friday: form.move_monday_to_friday,
          move_weekend_to_friday: form.move_weekend_to_friday,

          post_only_after_review: form.post_only_after_review,
          ads_only_after_review: form.ads_only_after_review,

          notes: form.notes,
        }),
      });

      const json = (await response.json()) as ApiResponse;

      if (!response.ok || !json.ok) {
        window.alert(
          json.message || "Automation-Einstellungen konnten nicht gespeichert werden."
        );
        return;
      }

      window.alert(json.message || "Automation-Einstellungen wurden gespeichert.");
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unbekannter Fehler beim Speichern der Automation-Einstellungen.";

      window.alert(message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="space-y-6">
      <section className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm sm:p-7">
        <div className="mb-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#E7D8C3] bg-[#FFFCF7] px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-[#8A5A35]">
            <BellRing className="h-4 w-4" />
            Automation
          </div>

          <h2 className="mt-4 text-2xl font-black text-[#102A43]">
            Vorab-Generierung und Erinnerungen
          </h2>

          <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#52616F]">
            Hier legst Du fest, wann Content vorbereitet und wann der Kunde zur
            Review-Freigabe erinnert wird. Montag-, Samstag- und Sonntag-Content
            wird standardmäßig am Freitag vorbereitet bzw. erinnert.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <ToggleRow
            label="Automation aktiv"
            description="Aktiviert den späteren Cron-/Automationsworkflow für Vorbereitung und Erinnerungen."
            checked={form.automation_enabled}
            onChange={(checked) => updateField("automation_enabled", checked)}
          />

          <ToggleRow
            label="Content automatisch vorbereiten"
            description="Der spätere Cron-Job darf Content und Bilder automatisch vor dem Veröffentlichungstag erzeugen."
            checked={form.auto_prepare_content}
            onChange={(checked) => updateField("auto_prepare_content", checked)}
          />

          <ToggleRow
            label="E-Mail-Erinnerungen aktiv"
            description="Der Kunde oder Mitarbeiter erhält Erinnerungen, sobald Content zur Prüfung bereitsteht."
            checked={form.email_notifications_enabled}
            onChange={(checked) =>
              updateField("email_notifications_enabled", checked)
            }
          />

          <ToggleRow
            label="Posting nur nach Review"
            description="Inhalte dürfen nur nach freigegebenem Content-Review veröffentlicht werden."
            checked={form.post_only_after_review}
            onChange={(checked) => updateField("post_only_after_review", checked)}
          />

          <ToggleRow
            label="Ads nur nach Review"
            description="Beiträge dürfen nur nach freigegebenem Review als Ads-Kampagne vorbereitet werden."
            checked={form.ads_only_after_review}
            onChange={(checked) => updateField("ads_only_after_review", checked)}
          />

          <ToggleRow
            label="Montag auf Freitag vorziehen"
            description="Content für Montag wird bereits am vorherigen Freitag vorbereitet und erinnert."
            checked={form.move_monday_to_friday}
            onChange={(checked) => updateField("move_monday_to_friday", checked)}
          />

          <ToggleRow
            label="Wochenende auf Freitag vorziehen"
            description="Content für Samstag und Sonntag wird ebenfalls am Freitag vorbereitet und erinnert."
            checked={form.move_weekend_to_friday}
            onChange={(checked) => updateField("move_weekend_to_friday", checked)}
          />
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_420px]">
        <section className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm sm:p-7">
          <h2 className="text-2xl font-black text-[#102A43]">
            Benachrichtigung
          </h2>

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-black text-[#102A43]">
                Empfängername optional
              </label>
              <input
                value={form.recipient_name}
                onChange={(event) =>
                  updateField("recipient_name", event.target.value)
                }
                className="w-full rounded-2xl border border-[#E7D8C3] bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
                placeholder="z. B. Max Mustermann"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-black text-[#102A43]">
                Empfänger-E-Mail
              </label>
              <input
                value={form.recipient_email}
                onChange={(event) =>
                  updateField("recipient_email", event.target.value)
                }
                className="w-full rounded-2xl border border-[#E7D8C3] bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
                placeholder="kunde@firma.de"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-black text-[#102A43]">
                Zeitzone
              </label>
              <input
                value={form.timezone}
                onChange={(event) => updateField("timezone", event.target.value)}
                className="w-full rounded-2xl border border-[#E7D8C3] bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
                placeholder="Europe/Berlin"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-black text-[#102A43]">
                Vorlauf
              </label>
              <select
                value={form.preparation_mode}
                onChange={(event) =>
                  updateField("preparation_mode", event.target.value)
                }
                className="w-full rounded-2xl border border-[#E7D8C3] bg-white px-4 py-3 text-sm font-black outline-none focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
              >
                <option value="previous_business_day">
                  1 Arbeitstag vorher
                </option>
                <option value="previous_calendar_day">
                  1 Kalendertag vorher
                </option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-black text-[#102A43]">
                Arbeitstage Vorlauf
              </label>
              <input
                type="number"
                min={1}
                max={10}
                value={form.prep_lead_business_days}
                onChange={(event) =>
                  updateField("prep_lead_business_days", event.target.value)
                }
                className="w-full rounded-2xl border border-[#E7D8C3] bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-black text-[#102A43]">
                Neue Erinnerungszeit
              </label>

              <div className="flex gap-2">
                <input
                  type="time"
                  value={newReminderTime}
                  onChange={(event) => setNewReminderTime(event.target.value)}
                  className="w-full rounded-2xl border border-[#E7D8C3] bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
                />

                <button
                  type="button"
                  onClick={addReminderTime}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-[#B5282D] px-4 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="mt-5">
            <p className="mb-2 text-sm font-black text-[#102A43]">
              Erinnerungszeiten
            </p>

            <div className="flex flex-wrap gap-2">
              {form.reminder_times.map((time) => (
                <span
                  key={time}
                  className="inline-flex items-center gap-2 rounded-full border border-[#E7D8C3] bg-[#FFFCF7] px-3 py-2 text-sm font-black text-[#102A43]"
                >
                  <CalendarClock className="h-4 w-4 text-[#B5282D]" />
                  {time}

                  <button
                    type="button"
                    onClick={() => removeReminderTime(time)}
                    className="rounded-full p-1 text-red-700 transition hover:bg-red-50"
                    aria-label={`Erinnerungszeit ${time} entfernen`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
            </div>
          </div>

          <div className="mt-5">
            <label className="mb-2 block text-sm font-black text-[#102A43]">
              Interne Notiz
            </label>

            <textarea
              value={form.notes}
              onChange={(event) => updateField("notes", event.target.value)}
              rows={5}
              className="w-full rounded-2xl border border-[#E7D8C3] bg-white px-4 py-3 text-sm font-semibold leading-6 outline-none focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
              placeholder="z. B. Kunde möchte morgens und abends erinnert werden ..."
            />
          </div>

          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold leading-6 text-amber-900">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <p>
                Diese Seite speichert V1 nur die Einstellungen. Der echte
                Vercel-Cron für Content-Erzeugung und Erinnerungsmails wird im
                nächsten Schritt angebunden.
              </p>
            </div>
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
            {isSaving ? "Speichern ..." : "Automation speichern"}
          </button>
        </section>

        <aside className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm sm:p-7">
          <h2 className="text-2xl font-black text-[#102A43]">
            Vorschau der Arbeitstage-Logik
          </h2>

          <p className="mt-2 text-sm font-semibold leading-6 text-[#52616F]">
            Die Vorschau zeigt, wann für geplante Veröffentlichungstage erinnert
            würde. Montag und Wochenende werden standardmäßig auf Freitag
            vorgezogen.
          </p>

          <div className="mt-5 space-y-3">
            {preview.slice(0, 10).map((item) => (
              <article
                key={`${toIsoDate(item.publishDate)}-${toIsoDate(
                  item.reminderDate
                )}`}
                className={`rounded-2xl border p-4 ${
                  item.isSpecial
                    ? "border-amber-200 bg-amber-50"
                    : "border-[#E7D8C3] bg-[#FFFCF7]"
                }`}
              >
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8A5A35]">
                  Veröffentlichung
                </p>
                <p className="mt-1 text-sm font-black text-[#102A43]">
                  {item.publishLabel}
                </p>

                <p className="mt-3 text-xs font-black uppercase tracking-[0.16em] text-[#8A5A35]">
                  Erinnerung / Vorbereitung
                </p>
                <p className="mt-1 text-sm font-black text-[#102A43]">
                  {item.reminderLabel}
                </p>

                {item.isSpecial ? (
                  <p className="mt-2 text-xs font-bold leading-5 text-amber-900">
                    Wochenend-/Montag-Regel aktiv.
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        </aside>
      </section>
    </section>
  );
}