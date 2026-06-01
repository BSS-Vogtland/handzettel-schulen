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

const DEFAULT_TIMEZONE = "Europe/Berlin";

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

  if (!nowParam) return new Date();

  const parsed = new Date(nowParam);

  if (Number.isNaN(parsed.getTime())) return new Date();

  return parsed;
}

function shouldTriggerReminderNow({
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

  return reminderTimes.some((time) => {
    const [hour, minute] = time.split(":").map(Number);
    const reminderTotal = hour * 60 + minute;

    return (
      currentTotal >= reminderTotal &&
      currentTotal <= reminderTotal + toleranceMinutes
    );
  });
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

export async function GET(request: Request) {
  try {
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

    const now = parseNowFromRequest(request);
    const timezone = settings.timezone || DEFAULT_TIMEZONE;
    const localNow = getLocalParts(now, timezone);
    const todayLocalDateKey = localNow.dateKey;
    const currentLocalTimeKey = localNow.timeKey;

    const reminderTimes = cleanReminderTimes(settings.reminder_times);
    const toleranceMinutes = 10;

    const baseUrl = getBaseUrl(request);
    const candidatePosts = await loadCandidatePosts(project.id);

    const previewPosts: PreviewPost[] = candidatePosts
      .map((post) => {
        const publishLocal = getLocalParts(new Date(post.scheduled_at!), timezone);
        const publishDateKey = publishLocal.dateKey;

        const reminderDateKey = calculateReminderDateKey({
          publishDateKey,
          settings,
        });

        const isReviewApproved = post.review_status === "approved";
        const isPublished = post.status === "published";

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

    const openReviewPosts = previewPosts.filter((post) => post.needs_review);
    const approvedPosts = previewPosts.filter(
      (post) => post.is_review_approved && !post.is_published
    );
    const publishedPosts = previewPosts.filter((post) => post.is_published);

    const isReminderTimeNow = shouldTriggerReminderNow({
      localTimeKey: currentLocalTimeKey,
      reminderTimes,
      toleranceMinutes,
    });

    return NextResponse.json({
      ok: true,
      mode: "preview_only",
      message:
        "Preview berechnet. Es wurden keine E-Mails versendet und keine Inhalte erzeugt.",
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
      },
      now: {
        server_iso: now.toISOString(),
        local_date: todayLocalDateKey,
        local_time: currentLocalTimeKey,
        local_weekday: localNow.weekday,
        is_reminder_time_now: isReminderTimeNow,
        reminder_tolerance_minutes: toleranceMinutes,
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
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unbekannter Fehler bei der Reminder-Preview.";

    return NextResponse.json(
      {
        ok: false,
        message,
      },
      { status: 500 }
    );
  }
}