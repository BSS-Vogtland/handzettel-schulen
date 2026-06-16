import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Mail,
  RefreshCw,
  Send,
  SkipForward,
  XCircle,
} from "lucide-react";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReminderEventRow = {
  id: string;
  project_id: string | null;
  reminder_type: string;
  reminder_date_local: string;
  reminder_time_local: string;
  timezone: string;
  status: string;
  recipient_email: string | null;
  recipient_name: string | null;
  post_ids: string[] | null;
  open_review_count: number | null;
  approved_count: number | null;
  published_count: number | null;
  payload: ReminderPayload | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

type ReminderPayload = {
  project?: {
    id?: string;
    name?: string;
  };
  now?: {
    local_date?: string;
    local_time?: string;
    local_weekday?: string;
    server_iso?: string;
    matched_reminder_time?: string;
    reminder_tolerance_minutes?: number;
  };
  summary?: {
    posts_due_today?: number;
    open_reviews?: number;
    approved_waiting_for_posting?: number;
    already_published?: number;
  };
  posts_due_today?: ReminderPost[];
  open_review_posts?: ReminderPost[];
  approved_posts?: ReminderPost[];
  published_posts?: ReminderPost[];
  publishing_posts?: ReminderPost[];
  ready_to_publish_posts?: ReminderPost[];
  blocked_publish_posts?: ReminderPost[];
  overdue_posts?: ReminderPost[];
  due_today_posts?: ReminderPost[];
};

type ReminderPost = {
  id: string;
  topic?: string | null;
  status?: string | null;
  review_status?: string | null;
  scheduled_at?: string | null;
  publish_date_local?: string | null;
  publish_weekday_local?: string | null;
  publish_time_local?: string | null;
  reminder_date_local?: string | null;
  reminder_weekday_local?: string | null;
  needs_review?: boolean;
  is_review_approved?: boolean;
  is_published?: boolean;
  is_overdue?: boolean;
  is_due_today?: boolean;
  has_image?: boolean;
  is_publishable?: boolean;
  blocked_reason?: string | null;
  review_url?: string | null;
  posting_url?: string | null;
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getStatusConfig(status: string) {
  switch (status) {
    case "pending":
      return {
        label: "Pending",
        description: "Wartet auf Versand",
        className: "border-amber-200 bg-amber-50 text-amber-800",
        icon: Clock,
      };

    case "sent":
      return {
        label: "Gesendet",
        description: "Mail wurde versendet",
        className: "border-emerald-200 bg-emerald-50 text-emerald-800",
        icon: CheckCircle2,
      };

    case "skipped":
      return {
        label: "Übersprungen",
        description: "Bewusst nicht versendet",
        className: "border-slate-200 bg-slate-50 text-slate-700",
        icon: SkipForward,
      };

    case "failed":
      return {
        label: "Fehler",
        description: "Versand oder Verarbeitung fehlgeschlagen",
        className: "border-red-200 bg-red-50 text-red-800",
        icon: XCircle,
      };

    case "preview":
      return {
        label: "Preview",
        description: "Nur Vorschau",
        className: "border-blue-200 bg-blue-50 text-blue-800",
        icon: RefreshCw,
      };

    default:
      return {
        label: status || "Unbekannt",
        description: "Unbekannter Status",
        className: "border-zinc-200 bg-zinc-50 text-zinc-700",
        icon: AlertTriangle,
      };
  }
}

function getTypeConfig(type: string) {
  switch (type) {
    case "publishing_reminder":
      return {
        label: "Publishing-Reminder",
        description:
          "Erinnert am Veröffentlichungstag oder bei überfälligen Beiträgen.",
        className: "border-blue-200 bg-blue-50 text-blue-800",
      };

    case "review_reminder":
      return {
        label: "Review-Reminder",
        description:
          "Erinnert vorab an noch nicht freigegebene geplante Beiträge.",
        className: "border-purple-200 bg-purple-50 text-purple-800",
      };

    default:
      return {
        label: type || "Reminder",
        description: "Allgemeines Reminder-Event.",
        className: "border-slate-200 bg-slate-50 text-slate-700",
      };
  }
}

function safeNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function getProjectName(event: ReminderEventRow) {
  return event.payload?.project?.name || "SocialPilot";
}

function asPostList(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value.filter((post) => post && typeof post === "object" && "id" in post) as ReminderPost[];
}

function getPrimaryPosts(event: ReminderEventRow) {
  if (event.reminder_type === "publishing_reminder") {
    return asPostList(event.payload?.publishing_posts);
  }

  return asPostList(event.payload?.open_review_posts);
}

function getSecondaryPosts(event: ReminderEventRow) {
  if (event.reminder_type === "publishing_reminder") {
    return asPostList(event.payload?.blocked_publish_posts);
  }

  return asPostList(event.payload?.posts_due_today);
}

function getSummaryLabels(event: ReminderEventRow) {
  if (event.reminder_type === "publishing_reminder") {
    return {
      first: "Veröffentlichbar",
      second: "Blockiert",
      third: "Veröffentlicht",
      firstValue: safeNumber(event.approved_count),
      secondValue: safeNumber(event.open_review_count),
      thirdValue: safeNumber(event.published_count),
    };
  }

  return {
    first: "Offene Reviews",
    second: "Freigegeben",
    third: "Veröffentlicht",
    firstValue: safeNumber(event.open_review_count),
    secondValue: safeNumber(event.approved_count),
    thirdValue: safeNumber(event.published_count),
  };
}

async function loadReminderEvents() {
  const { data, error } = await supabaseServer
    .from("social_reminder_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(80);

  if (error) {
    throw new Error(error.message);
  }

  return (data || []) as ReminderEventRow[];
}

export default async function AdminSocialAutomationEventsPage() {
  let events: ReminderEventRow[] = [];
  let loadError: string | null = null;

  try {
    events = await loadReminderEvents();
  } catch (error) {
    loadError =
      error instanceof Error
        ? error.message
        : "Reminder-Protokoll konnte nicht geladen werden.";
  }

  const reviewEvents = events.filter(
    (event) => event.reminder_type === "review_reminder"
  );
  const publishingEvents = events.filter(
    (event) => event.reminder_type === "publishing_reminder"
  );

  const pendingCount = events.filter((event) => event.status === "pending").length;
  const sentCount = events.filter((event) => event.status === "sent").length;
  const skippedCount = events.filter((event) => event.status === "skipped").length;
  const failedCount = events.filter((event) => event.status === "failed").length;
  const actionRequiredCount = pendingCount + failedCount;
  const latestSentEvent = events.find((event) => event.status === "sent") || null;

  return (
    <main className="min-h-screen bg-[#FBF7F0] text-[#102A43]">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 rounded-3xl border border-[#E7D8C5] bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex flex-col gap-3">
              <Link
                href="/admin/social/automation"
                className="inline-flex w-fit items-center gap-2 rounded-full border border-[#D7C3AA] bg-[#FFF8EE] px-4 py-2 text-sm font-semibold text-[#7A4E1D] transition hover:bg-[#F4E6D2]"
              >
                <ArrowLeft className="h-4 w-4" />
                Zur Automation
              </Link>

              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#C27A2C]">
                  SocialPilot Automation
                </p>
                <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#102A43] sm:text-3xl">
                  Reminder-Protokoll
                </h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-[#486581] sm:text-base">
                  Hier siehst Du Review-Reminder und Publishing-Reminder. Failed
                  oder dauerhaft pending Events sind operative Prüfpunkte.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/admin/social"
                className="inline-flex items-center justify-center rounded-full border border-[#D7C3AA] bg-white px-4 py-2 text-sm font-semibold text-[#334E68] transition hover:bg-[#F8EFE4]"
              >
                SocialPilot öffnen
              </Link>
              <Link
                href="/admin/social/kalender"
                className="inline-flex items-center justify-center rounded-full bg-[#102A43] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#243B53]"
              >
                Kalender öffnen
              </Link>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <div className="rounded-2xl border border-purple-200 bg-purple-50 p-4 text-purple-900">
              <p className="text-sm font-bold">Review</p>
              <p className="mt-2 text-3xl font-black">{reviewEvents.length}</p>
              <p className="mt-1 text-xs">Review-Reminder</p>
            </div>

            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-blue-900">
              <p className="text-sm font-bold">Publishing</p>
              <p className="mt-2 text-3xl font-black">{publishingEvents.length}</p>
              <p className="mt-1 text-xs">Publishing-Reminder</p>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
              <p className="text-sm font-bold">Pending</p>
              <p className="mt-2 text-3xl font-black">{pendingCount}</p>
              <p className="mt-1 text-xs">Wartet auf Versand</p>
            </div>

            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
              <p className="text-sm font-bold">Gesendet</p>
              <p className="mt-2 text-3xl font-black">{sentCount}</p>
              <p className="mt-1 text-xs">Erfolgreich versendet</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-slate-800">
              <p className="text-sm font-bold">Skipped</p>
              <p className="mt-2 text-3xl font-black">{skippedCount}</p>
              <p className="mt-1 text-xs">Bewusst übersprungen</p>
            </div>

            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-900">
              <p className="text-sm font-bold">Fehler</p>
              <p className="mt-2 text-3xl font-black">{failedCount}</p>
              <p className="mt-1 text-xs">Muss geprüft werden</p>
            </div>
          </div>

          <div
            className={`rounded-2xl border p-4 text-sm font-bold leading-6 ${
              actionRequiredCount > 0
                ? "border-amber-200 bg-amber-50 text-amber-900"
                : "border-emerald-200 bg-emerald-50 text-emerald-900"
            }`}
          >
            {actionRequiredCount > 0 ? (
              <p>
                Es gibt Reminder-Events mit Aktionsbedarf. Prüfe vor allem
                Fehler und Events, die länger als erwartet auf pending stehen.
              </p>
            ) : (
              <p>
                Reminder-Protokoll sauber. Keine failed Events und keine pending
                Events. Letzter erfolgreicher Versand:{" "}
                {latestSentEvent ? formatDateTime(latestSentEvent.updated_at) : "—"}.
              </p>
            )}
          </div>
        </div>

        {loadError ? (
          <div className="rounded-3xl border border-red-200 bg-red-50 p-5 text-red-900">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <h2 className="font-bold">Protokoll konnte nicht geladen werden</h2>
                <p className="mt-1 text-sm">{loadError}</p>
              </div>
            </div>
          </div>
        ) : null}

        {!loadError && events.length === 0 ? (
          <div className="rounded-3xl border border-[#E7D8C5] bg-white p-8 text-center shadow-sm">
            <Mail className="mx-auto h-10 w-10 text-[#9FB3C8]" />
            <h2 className="mt-4 text-xl font-bold text-[#102A43]">
              Noch keine Reminder-Events vorhanden
            </h2>
            <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-[#486581]">
              Sobald der Cron-Workflow läuft, erscheinen hier Review- und
              Publishing-Events.
            </p>
          </div>
        ) : null}

        {!loadError && events.length > 0 ? (
          <div className="flex flex-col gap-4">
            {events.map((event) => {
              const statusConfig = getStatusConfig(event.status);
              const typeConfig = getTypeConfig(event.reminder_type);
              const StatusIcon = statusConfig.icon;
              const primaryPosts = getPrimaryPosts(event);
              const secondaryPosts = getSecondaryPosts(event);
              const labels = getSummaryLabels(event);

              return (
                <article
                  key={event.id}
                  className="overflow-hidden rounded-3xl border border-[#E7D8C5] bg-white shadow-sm"
                >
                  <div className="flex flex-col gap-4 border-b border-[#E7D8C5] bg-[#FFF8EE] p-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold ${statusConfig.className}`}
                        >
                          <StatusIcon className="h-3.5 w-3.5" />
                          {statusConfig.label}
                        </span>

                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-semibold ${typeConfig.className}`}
                        >
                          {typeConfig.label}
                        </span>

                        <span className="rounded-full border border-[#D7C3AA] bg-white px-3 py-1 text-xs font-semibold text-[#486581]">
                          {event.timezone}
                        </span>
                      </div>

                      <h2 className="mt-3 truncate text-lg font-black text-[#102A43]">
                        {getProjectName(event)}
                      </h2>

                      <p className="mt-1 text-sm text-[#486581]">
                        {typeConfig.description}
                      </p>

                      <p className="mt-1 text-sm text-[#486581]">
                        Reminder am{" "}
                        <strong>{event.reminder_date_local}</strong> um{" "}
                        <strong>{event.reminder_time_local}</strong>
                      </p>

                      <p className="mt-1 text-xs text-[#829AB1]">
                        Angelegt: {formatDateTime(event.created_at)} ·
                        Aktualisiert: {formatDateTime(event.updated_at)}
                      </p>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[360px]">
                      <div className="rounded-2xl border border-[#E7D8C5] bg-white p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-[#829AB1]">
                          {labels.first}
                        </p>
                        <p className="mt-1 text-2xl font-black text-[#102A43]">
                          {labels.firstValue}
                        </p>
                      </div>

                      <div className="rounded-2xl border border-[#E7D8C5] bg-white p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-[#829AB1]">
                          {labels.second}
                        </p>
                        <p className="mt-1 text-2xl font-black text-[#102A43]">
                          {labels.secondValue}
                        </p>
                      </div>

                      <div className="rounded-2xl border border-[#E7D8C5] bg-white p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-[#829AB1]">
                          {labels.third}
                        </p>
                        <p className="mt-1 text-2xl font-black text-[#102A43]">
                          {labels.thirdValue}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 p-5 lg:grid-cols-[1.15fr_0.85fr]">
                    <div className="flex flex-col gap-4">
                      <div className="rounded-2xl border border-[#E7D8C5] bg-white p-4">
                        <h3 className="text-sm font-black uppercase tracking-wide text-[#102A43]">
                          Versanddaten
                        </h3>

                        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                          <div>
                            <dt className="font-semibold text-[#829AB1]">
                              Empfänger
                            </dt>
                            <dd className="mt-1 break-all text-[#243B53]">
                              {event.recipient_email || "—"}
                            </dd>
                          </div>

                          <div>
                            <dt className="font-semibold text-[#829AB1]">
                              Name
                            </dt>
                            <dd className="mt-1 text-[#243B53]">
                              {event.recipient_name || "—"}
                            </dd>
                          </div>

                          <div>
                            <dt className="font-semibold text-[#829AB1]">
                              Event-ID
                            </dt>
                            <dd className="mt-1 break-all font-mono text-xs text-[#243B53]">
                              {event.id}
                            </dd>
                          </div>

                          <div>
                            <dt className="font-semibold text-[#829AB1]">
                              Projekt-ID
                            </dt>
                            <dd className="mt-1 break-all font-mono text-xs text-[#243B53]">
                              {event.project_id || "—"}
                            </dd>
                          </div>
                        </dl>

                        {event.error_message ? (
                          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                            <div className="flex items-start gap-2">
                              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                              <div>
                                <p className="font-bold">Hinweis / Fehler</p>
                                <p className="mt-1">{event.error_message}</p>
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </div>

                      <div className="rounded-2xl border border-[#E7D8C5] bg-white p-4">
                        <h3 className="text-sm font-black uppercase tracking-wide text-[#102A43]">
                          {event.reminder_type === "publishing_reminder"
                            ? "Publishing-Beiträge"
                            : "Offene Review-Beiträge"}
                        </h3>

                        {primaryPosts.length === 0 ? (
                          <p className="mt-3 text-sm text-[#829AB1]">
                            Keine Beiträge in diesem Event.
                          </p>
                        ) : (
                          <div className="mt-3 flex flex-col gap-3">
                            {primaryPosts.map((post) => (
                              <div
                                key={post.id}
                                className="rounded-2xl border border-[#E7D8C5] bg-[#FBF7F0] p-4"
                              >
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                  <div className="min-w-0">
                                    <p className="font-bold text-[#102A43]">
                                      {post.topic || "Ohne Titel"}
                                    </p>
                                    <p className="mt-1 text-xs text-[#829AB1]">
                                      Veröffentlichung:{" "}
                                      {post.publish_weekday_local || "—"}{" "}
                                      {post.publish_date_local || "—"}{" "}
                                      {post.publish_time_local
                                        ? `um ${post.publish_time_local}`
                                        : ""}
                                    </p>
                                    <p className="mt-1 text-xs text-[#829AB1]">
                                      Review: {post.review_status || "—"} ·
                                      Status: {post.status || "—"}
                                    </p>
                                    {post.blocked_reason ? (
                                      <p className="mt-2 text-xs font-bold leading-5 text-amber-800">
                                        Blockiert: {post.blocked_reason}
                                      </p>
                                    ) : null}
                                  </div>

                                  <div className="flex shrink-0 flex-wrap gap-2">
                                    {post.review_url ? (
                                      <Link
                                        href={post.review_url}
                                        className="inline-flex items-center justify-center rounded-full border border-[#D7C3AA] bg-white px-4 py-2 text-xs font-bold text-[#334E68] transition hover:bg-[#F8EFE4]"
                                      >
                                        Review öffnen
                                      </Link>
                                    ) : null}

                                    {post.posting_url ? (
                                      <Link
                                        href={post.posting_url}
                                        className="inline-flex items-center justify-center rounded-full bg-[#102A43] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#243B53]"
                                      >
                                        Posting ansehen
                                      </Link>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {event.reminder_type === "publishing_reminder" &&
                      secondaryPosts.length > 0 ? (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                          <h3 className="text-sm font-black uppercase tracking-wide text-amber-950">
                            Blockierte Publishing-Beiträge
                          </h3>
                          <div className="mt-3 flex flex-col gap-3">
                            {secondaryPosts.map((post) => (
                              <div
                                key={post.id}
                                className="rounded-2xl border border-amber-200 bg-white p-4"
                              >
                                <p className="font-bold text-[#102A43]">
                                  {post.topic || "Ohne Titel"}
                                </p>
                                <p className="mt-1 text-xs font-bold leading-5 text-amber-800">
                                  {post.blocked_reason || "Blockiert"}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <div className="flex flex-col gap-4">
                      <div className="rounded-2xl border border-[#E7D8C5] bg-white p-4">
                        <h3 className="text-sm font-black uppercase tracking-wide text-[#102A43]">
                          Zusammenfassung
                        </h3>

                        <dl className="mt-3 grid gap-3 text-sm">
                          <div className="flex items-center justify-between gap-3 rounded-xl bg-[#FBF7F0] px-3 py-2">
                            <dt className="text-[#486581]">Fällige Beiträge</dt>
                            <dd className="font-black text-[#102A43]">
                              {event.payload?.summary?.posts_due_today ??
                                primaryPosts.length}
                            </dd>
                          </div>

                          <div className="flex items-center justify-between gap-3 rounded-xl bg-[#FBF7F0] px-3 py-2">
                            <dt className="text-[#486581]">
                              {event.reminder_type === "publishing_reminder"
                                ? "Blockiert"
                                : "Offene Reviews"}
                            </dt>
                            <dd className="font-black text-[#102A43]">
                              {event.payload?.summary?.open_reviews ??
                                safeNumber(event.open_review_count)}
                            </dd>
                          </div>

                          <div className="flex items-center justify-between gap-3 rounded-xl bg-[#FBF7F0] px-3 py-2">
                            <dt className="text-[#486581]">
                              {event.reminder_type === "publishing_reminder"
                                ? "Veröffentlichbar"
                                : "Wartet auf Posting"}
                            </dt>
                            <dd className="font-black text-[#102A43]">
                              {event.payload?.summary
                                ?.approved_waiting_for_posting ??
                                safeNumber(event.approved_count)}
                            </dd>
                          </div>

                          <div className="flex items-center justify-between gap-3 rounded-xl bg-[#FBF7F0] px-3 py-2">
                            <dt className="text-[#486581]">Veröffentlicht</dt>
                            <dd className="font-black text-[#102A43]">
                              {event.payload?.summary?.already_published ??
                                safeNumber(event.published_count)}
                            </dd>
                          </div>
                        </dl>
                      </div>

                      <div className="rounded-2xl border border-[#E7D8C5] bg-white p-4">
                        <h3 className="text-sm font-black uppercase tracking-wide text-[#102A43]">
                          Cron-Zeitpunkt
                        </h3>

                        <dl className="mt-3 grid gap-3 text-sm">
                          <div>
                            <dt className="font-semibold text-[#829AB1]">
                              Lokales Datum
                            </dt>
                            <dd className="mt-1 text-[#243B53]">
                              {event.payload?.now?.local_weekday || "—"},{" "}
                              {event.payload?.now?.local_date || "—"}
                            </dd>
                          </div>

                          <div>
                            <dt className="font-semibold text-[#829AB1]">
                              Lokale Uhrzeit
                            </dt>
                            <dd className="mt-1 text-[#243B53]">
                              {event.payload?.now?.local_time || "—"}
                            </dd>
                          </div>

                          <div>
                            <dt className="font-semibold text-[#829AB1]">
                              Gematchte Reminder-Zeit
                            </dt>
                            <dd className="mt-1 text-[#243B53]">
                              {event.payload?.now?.matched_reminder_time || "—"}
                            </dd>
                          </div>

                          <div>
                            <dt className="font-semibold text-[#829AB1]">
                              Server-Zeit
                            </dt>
                            <dd className="mt-1 break-all font-mono text-xs text-[#243B53]">
                              {event.payload?.now?.server_iso || "—"}
                            </dd>
                          </div>
                        </dl>
                      </div>

                      <div className="rounded-2xl border border-[#E7D8C5] bg-[#FBF7F0] p-4">
                        <div className="flex items-start gap-2">
                          <Send className="mt-0.5 h-4 w-4 shrink-0 text-[#C27A2C]" />
                          <div>
                            <h3 className="text-sm font-black text-[#102A43]">
                              Praktische Bewertung
                            </h3>
                            <p className="mt-1 text-sm leading-6 text-[#486581]">
                              <strong>Review-Reminder</strong> lösen vorab aus.
                              <br />
                              <strong>Publishing-Reminder</strong> lösen am
                              Veröffentlichungstag oder bei überfälligen
                              Beiträgen aus.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}
      </section>
    </main>
  );
}
