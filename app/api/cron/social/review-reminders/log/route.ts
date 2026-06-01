import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SocialProjectRow = {
  id: string;
  name: string;
};

type AutomationSettingsRow = {
  id: string;
  project_id: string | null;

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
};

type SocialPostRow = {
  id: string;
  project_id: string | null;
  created_at: string;
  updated_at: string;
  status: string;
  review_status: string | null;
  topic: string;
  hook: string | null;
  scheduled_at: string | null;
  published_at: string | null;
};

type PreviewPost = {
  id: string;
  topic: string;
  status: string;
  review_status: string | null;
  scheduled_at: string;
  publish_date_local: string;
  publish_weekday_local: string;
  reminder_date_local: string;
  reminder_weekday_local: string;
  needs_review: boolean;
  is_review_approved: boolean;
  is_published: boolean;
  review_url: string;
  posting_url: string;
};

type ExistingReminderEventRow = {
  id: string;
  project_id: string | null;
  reminder_type: string;
  reminder_date_local: string;
  reminder_time_local: string;
  timezone: string;
  status: string;
  recipient_email: string | null;
  recipient_name: string | null;
  post_ids: string[];
  open_review_count: number;
  approved_count: number;
  published_count: number;
  payload: unknown;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

const DEFAULT_TIMEZONE = "Europe/Berlin";
const REMINDER_TYPE = "review_reminder";
const REMINDER_TOLERANCE_MINUTES = 10;

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function isValidReminderTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function cleanReminderTimes(value: unknown) {
  if (!Array.isArray(value)) return ["08:00", "18:00"];

  const cleaned = value
    .filter((item) => typeof item === "string")
    .map((item) => item.trim())
    .filter(isValidReminderTime);

  const unique = Array.from(new Set(cleaned)).sort();

  return unique.length > 0 ? unique : ["08:00", "18:00"];
}

function getBaseUrl(request: Request) {
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL ||
    "";

  if (configured) {
    if (configured.startsWith("http://") || configured.startsWith("https://")) {
      return configured.replace(/\/$/, "");
    }

    return `https://${configured.replace(/\/$/, "")}`;
  }

  return new URL(request.url).origin;
}

function getLocalParts(date: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat("de-DE", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const lookup = new Map(parts.map((part) => [part.type, part.value]));

  const year = lookup.get("year") || "1970";
  const month = lookup.get("month") || "01";
  const day = lookup.get("day") || "01";
  const hour = lookup.get("hour") || "00";
  const minute = lookup.get("minute") || "00";
  const weekday = lookup.get("weekday") || "";

  return {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
    weekday,
    dateKey: `${year}-${month}-${day}`,
    timeKey: `${hour}:${minute}`,
  };
}

function localDateFromKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function addDaysLocal(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function toDateKeyLocal(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}`;
}

function getWeekdayIndexLocal(date: Date) {
  return date.getDay();
}

function isWeekendLocal(date: Date) {
  const day = getWeekdayIndexLocal(date);
  return day === 0 || day === 6;
}

function previousBusinessDayLocal(date: Date, leadBusinessDays: number) {
  let current = addDaysLocal(date, -1);
  let remaining = Math.max(1, Math.min(10, leadBusinessDays));

  while (remaining > 0) {
    if (!isWeekendLocal(current)) {
      remaining -= 1;

      if (remaining === 0) break;
    }

    current = addDaysLocal(current, -1);
  }

  return current;
}

function calculateReminderDateKey({
  publishDateKey,
  settings,
}: {
  publishDateKey: string;
  settings: AutomationSettingsRow;
}) {
  const publishDate = localDateFromKey(publishDateKey);
  const publishWeekday = getWeekdayIndexLocal(publishDate);

  if (settings.preparation_mode === "previous_calendar_day") {
    return toDateKeyLocal(addDaysLocal(publishDate, -1));
  }

  if (settings.move_monday_to_friday && publishWeekday === 1) {
    return toDateKeyLocal(addDaysLocal(publishDate, -3));
  }

  if (settings.move_weekend_to_friday && publishWeekday === 6) {
    return toDateKeyLocal(addDaysLocal(publishDate, -1));
  }

  if (settings.move_weekend_to_friday && publishWeekday === 0) {
    return toDateKeyLocal(addDaysLocal(publishDate, -2));
  }

  return toDateKeyLocal(
    previousBusinessDayLocal(publishDate, settings.prep_lead_business_days || 1)
  );
}

function formatWeekdayFromDateKey(dateKey: string) {
  const date = localDateFromKey(dateKey);

  return new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
  }).format(date);
}

function parseNowFromRequest(request: Request) {
  const url = new URL(request.url);
  const nowParam = url.searchParams.get("now");

  if (!nowParam) {
    return {
      now: new Date(),
      invalidNowParam: null as string | null,
    };
  }

  const parsed = new Date(nowParam);

  if (Number.isNaN(parsed.getTime())) {
    return {
      now: null,
      invalidNowParam: nowParam,
    };
  }

  return {
    now: parsed,
    invalidNowParam: null as string | null,
  };
}

function findMatchedReminderTime({
  localTimeKey,
  reminderTimes,
  toleranceMinutes,
}: {
  localTimeKey: string;
  reminderTimes: string[];
  toleranceMinutes: number;
}) {
  const [currentHour, currentMinute] = localTimeKey.split(":").map(Number);
  const currentTotal = currentHour * 60 + currentMinute;

  for (const time of reminderTimes) {
    const [hour, minute] = time.split(":").map(Number);
    const reminderTotal = hour * 60 + minute;

    if (
      currentTotal >= reminderTotal &&
      currentTotal <= reminderTotal + toleranceMinutes
    ) {
      return time;
    }
  }

  return null;
}

async function loadActiveProject() {
  const { data, error } = await supabaseServer
    .from("social_projects")
    .select("id, name")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return (data || null) as SocialProjectRow | null;
}

async function loadAutomationSettings(projectId: string) {
  const { data, error } = await supabaseServer
    .from("social_automation_settings")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return (data || null) as AutomationSettingsRow | null;
}

async function loadCandidatePosts(projectId: string) {
  const { data, error } = await supabaseServer
    .from("social_posts")
    .select(
      "id, project_id, created_at, updated_at, status, review_status, topic, hook, scheduled_at, published_at"
    )
    .not("scheduled_at", "is", null)
    .neq("status", "archived")
    .or(`project_id.eq.${projectId},project_id.is.null`)
    .order("scheduled_at", { ascending: true })
    .limit(200);

  if (error) throw new Error(error.message);

  return (data || []) as SocialPostRow[];
}

async function loadExistingReminderEvent({
  projectId,
  reminderDateLocal,
  reminderTimeLocal,
}: {
  projectId: string;
  reminderDateLocal: string;
  reminderTimeLocal: string;
}) {
  const { data, error } = await supabaseServer
    .from("social_reminder_events")
    .select("*")
    .eq("project_id", projectId)
    .eq("reminder_type", REMINDER_TYPE)
    .eq("reminder_date_local", reminderDateLocal)
    .eq("reminder_time_local", reminderTimeLocal)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return (data || null) as ExistingReminderEventRow | null;
}

async function insertReminderEvent({
  projectId,
  reminderDateLocal,
  reminderTimeLocal,
  timezone,
  status,
  recipientEmail,
  recipientName,
  postIds,
  openReviewCount,
  approvedCount,
  publishedCount,
  payload,
  errorMessage,
}: {
  projectId: string;
  reminderDateLocal: string;
  reminderTimeLocal: string;
  timezone: string;
  status: "pending" | "skipped" | "failed";
  recipientEmail: string | null;
  recipientName: string | null;
  postIds: string[];
  openReviewCount: number;
  approvedCount: number;
  publishedCount: number;
  payload: Record<string, unknown>;
  errorMessage: string | null;
}) {
  const { data, error } = await supabaseServer
    .from("social_reminder_events")
    .insert({
      project_id: projectId,
      reminder_type: REMINDER_TYPE,
      reminder_date_local: reminderDateLocal,
      reminder_time_local: reminderTimeLocal,
      timezone,
      status,
      recipient_email: recipientEmail,
      recipient_name: recipientName,
      post_ids: postIds,
      open_review_count: openReviewCount,
      approved_count: approvedCount,
      published_count: publishedCount,
      payload,
      error_message: errorMessage,
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);

  return data as ExistingReminderEventRow;
}

function buildPreviewPosts({
  posts,
  timezone,
  settings,
  baseUrl,
  todayLocalDateKey,
}: {
  posts: SocialPostRow[];
  timezone: string;
  settings: AutomationSettingsRow;
  baseUrl: string;
  todayLocalDateKey: string;
}) {
  const previewPosts: PreviewPost[] = posts
    .map((post) => {
      const publishLocal = getLocalParts(new Date(post.scheduled_at!), timezone);
      const publishDateKey = publishLocal.dateKey;

      const reminderDateKey = calculateReminderDateKey({
        publishDateKey,
        settings,
      });

      const isReviewApproved = post.review_status === "approved";
      const isPublished =
        post.status === "published" || Boolean(post.published_at);

      return {
        id: post.id,
        topic: post.topic,
        status: post.status,
        review_status: post.review_status,
        scheduled_at: post.scheduled_at!,
        publish_date_local: publishDateKey,
        publish_weekday_local: publishLocal.weekday,
        reminder_date_local: reminderDateKey,
        reminder_weekday_local: formatWeekdayFromDateKey(reminderDateKey),
        needs_review: !isReviewApproved && !isPublished,
        is_review_approved: isReviewApproved,
        is_published: isPublished,
        review_url: `${baseUrl}/admin/social/${post.id}/review`,
        posting_url: `${baseUrl}/admin/social/${post.id}/posting`,
      };
    })
    .filter((post) => post.reminder_date_local === todayLocalDateKey);

  return previewPosts;
}

export async function GET(request: Request) {
  try {
    const { now, invalidNowParam } = parseNowFromRequest(request);

    if (!now) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Ungültiger now-Parameter. Bitte ISO-Zeit verwenden, z. B. 2026-06-05T06:00:00.000Z.",
          invalid_now: invalidNowParam,
        },
        { status: 400 }
      );
    }

    const project = await loadActiveProject();

    if (!project) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Kein aktives Social-Projekt gefunden. Bitte zuerst das Projektprofil einrichten.",
        },
        { status: 404 }
      );
    }

    const settings = await loadAutomationSettings(project.id);

    if (!settings) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Keine Automation-Einstellungen gefunden. Bitte zuerst /admin/social/automation öffnen und speichern.",
        },
        { status: 404 }
      );
    }

    const timezone = settings.timezone || DEFAULT_TIMEZONE;
    const localNow = getLocalParts(now, timezone);
    const todayLocalDateKey = localNow.dateKey;
    const currentLocalTimeKey = localNow.timeKey;

    const reminderTimes = cleanReminderTimes(settings.reminder_times);
    const matchedReminderTime = findMatchedReminderTime({
      localTimeKey: currentLocalTimeKey,
      reminderTimes,
      toleranceMinutes: REMINDER_TOLERANCE_MINUTES,
    });

    if (!matchedReminderTime) {
      return NextResponse.json({
        ok: true,
        mode: "log_only",
        action: "not_logged",
        message:
          "Aktuell liegt keine Reminder-Zeit im gültigen Zeitfenster. Es wurde kein Event angelegt.",
        project: {
          id: project.id,
          name: project.name,
        },
        now: {
          server_iso: now.toISOString(),
          local_date: todayLocalDateKey,
          local_time: currentLocalTimeKey,
          local_weekday: localNow.weekday,
          reminder_times: reminderTimes,
          reminder_tolerance_minutes: REMINDER_TOLERANCE_MINUTES,
        },
      });
    }

    const existingEvent = await loadExistingReminderEvent({
      projectId: project.id,
      reminderDateLocal: todayLocalDateKey,
      reminderTimeLocal: matchedReminderTime,
    });

    if (existingEvent) {
      return NextResponse.json({
        ok: true,
        mode: "log_only",
        action: "already_logged",
        message:
          "Für dieses Projekt, Datum und Reminder-Zeitfenster existiert bereits ein Reminder-Event. Es wurde nichts doppelt angelegt.",
        project: {
          id: project.id,
          name: project.name,
        },
        now: {
          server_iso: now.toISOString(),
          local_date: todayLocalDateKey,
          local_time: currentLocalTimeKey,
          local_weekday: localNow.weekday,
          matched_reminder_time: matchedReminderTime,
          reminder_tolerance_minutes: REMINDER_TOLERANCE_MINUTES,
        },
        event: existingEvent,
      });
    }

    const baseUrl = getBaseUrl(request);
    const candidatePosts = await loadCandidatePosts(project.id);

    const previewPosts = buildPreviewPosts({
      posts: candidatePosts,
      timezone,
      settings,
      baseUrl,
      todayLocalDateKey,
    });

    const openReviewPosts = previewPosts.filter((post) => post.needs_review);
    const approvedPosts = previewPosts.filter(
      (post) => post.is_review_approved && !post.is_published
    );
    const publishedPosts = previewPosts.filter((post) => post.is_published);

    let eventStatus: "pending" | "skipped" = "pending";
    let eventErrorMessage: string | null = null;

    if (!settings.automation_enabled) {
      eventStatus = "skipped";
      eventErrorMessage = "Automation ist deaktiviert.";
    } else if (!settings.email_notifications_enabled) {
      eventStatus = "skipped";
      eventErrorMessage = "E-Mail-Erinnerungen sind deaktiviert.";
    } else if (!settings.recipient_email) {
      eventStatus = "skipped";
      eventErrorMessage = "Keine Empfänger-E-Mail für Reminder hinterlegt.";
    } else if (openReviewPosts.length === 0) {
      eventStatus = "skipped";
      eventErrorMessage =
        "Keine offenen Reviews für dieses Reminder-Zeitfenster gefunden.";
    }

    const event = await insertReminderEvent({
      projectId: project.id,
      reminderDateLocal: todayLocalDateKey,
      reminderTimeLocal: matchedReminderTime,
      timezone,
      status: eventStatus,
      recipientEmail: settings.recipient_email,
      recipientName: settings.recipient_name,
      postIds: previewPosts.map((post) => post.id),
      openReviewCount: openReviewPosts.length,
      approvedCount: approvedPosts.length,
      publishedCount: publishedPosts.length,
      payload: {
        project: {
          id: project.id,
          name: project.name,
        },
        settings: {
          automation_enabled: settings.automation_enabled,
          auto_prepare_content: settings.auto_prepare_content,
          email_notifications_enabled: settings.email_notifications_enabled,
          recipient_email: settings.recipient_email,
          recipient_name: settings.recipient_name,
          timezone,
          reminder_times: reminderTimes,
          preparation_mode: settings.preparation_mode,
          prep_lead_business_days: settings.prep_lead_business_days,
          move_monday_to_friday: settings.move_monday_to_friday,
          move_weekend_to_friday: settings.move_weekend_to_friday,
          post_only_after_review: settings.post_only_after_review,
          ads_only_after_review: settings.ads_only_after_review,
        },
        now: {
          server_iso: now.toISOString(),
          local_date: todayLocalDateKey,
          local_time: currentLocalTimeKey,
          local_weekday: localNow.weekday,
          matched_reminder_time: matchedReminderTime,
          reminder_tolerance_minutes: REMINDER_TOLERANCE_MINUTES,
        },
        summary: {
          posts_due_today: previewPosts.length,
          open_reviews: openReviewPosts.length,
          approved_waiting_for_posting: approvedPosts.length,
          already_published: publishedPosts.length,
        },
        posts_due_today: previewPosts,
        open_review_posts: openReviewPosts,
        approved_posts: approvedPosts,
        published_posts: publishedPosts,
      },
      errorMessage: eventErrorMessage,
    });

    return NextResponse.json({
      ok: true,
      mode: "log_only",
      action: "logged",
      message:
        eventStatus === "pending"
          ? "Reminder-Event wurde als pending protokolliert. Es wurde noch keine E-Mail versendet."
          : "Reminder-Event wurde als skipped protokolliert. Es wurde keine E-Mail versendet.",
      project: {
        id: project.id,
        name: project.name,
      },
      now: {
        server_iso: now.toISOString(),
        local_date: todayLocalDateKey,
        local_time: currentLocalTimeKey,
        local_weekday: localNow.weekday,
        matched_reminder_time: matchedReminderTime,
        reminder_tolerance_minutes: REMINDER_TOLERANCE_MINUTES,
      },
      summary: {
        posts_due_today: previewPosts.length,
        open_reviews: openReviewPosts.length,
        approved_waiting_for_posting: approvedPosts.length,
        already_published: publishedPosts.length,
      },
      event,
      posts_due_today: previewPosts,
      open_review_posts: openReviewPosts,
      approved_posts: approvedPosts,
      published_posts: publishedPosts,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unbekannter Fehler beim Protokollieren des Review-Reminder-Events.";

    return NextResponse.json(
      {
        ok: false,
        mode: "log_only",
        message,
      },
      { status: 500 }
    );
  }
}