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
  timezone: string | null;
  reminder_times: string[] | null;
  preparation_mode: string | null;
  prep_lead_business_days: number | null;
  move_monday_to_friday: boolean | null;
  move_weekend_to_friday: boolean | null;
  post_only_after_review: boolean | null;
  ads_only_after_review: boolean | null;
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

type SocialAssetRow = {
  post_id: string;
};

type PublishingReminderPost = {
  id: string;
  topic: string;
  status: string;
  review_status: string | null;
  scheduled_at: string;
  publish_date_local: string;
  publish_weekday_local: string;
  publish_time_local: string;
  reminder_date_local: string;
  reminder_weekday_local: string;
  is_overdue: boolean;
  is_due_today: boolean;
  has_image: boolean;
  is_review_approved: boolean;
  is_publishable: boolean;
  blocked_reason: string | null;
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
const REMINDER_TYPE = "publishing_reminder";
const REMINDER_TOLERANCE_MINUTES = 10;

function assertCronAccess(request: Request) {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return;
  }

  const url = new URL(request.url);
  const secretFromQuery = url.searchParams.get("secret");
  const authHeader = request.headers.get("authorization");
  const expectedAuthHeader = `Bearer ${cronSecret}`;

  if (secretFromQuery === cronSecret || authHeader === expectedAuthHeader) {
    return;
  }

  throw new Error("Nicht autorisiert. CRON_SECRET fehlt oder ist falsch.");
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
    .neq("status", "published")
    .is("published_at", null)
    .or(`project_id.eq.${projectId},project_id.is.null`)
    .order("scheduled_at", { ascending: true })
    .limit(200);

  if (error) throw new Error(error.message);

  return (data || []) as SocialPostRow[];
}

async function loadImagePostIds(postIds: string[]) {
  if (postIds.length === 0) return new Set<string>();

  const { data, error } = await supabaseServer
    .from("social_assets")
    .select("post_id")
    .in("post_id", postIds)
    .eq("asset_type", "image")
    .neq("status", "archived")
    .not("public_url", "is", null)
    .limit(1000);

  if (error) throw new Error(error.message);

  return new Set(((data || []) as SocialAssetRow[]).map((row) => row.post_id));
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

function buildPublishingPosts({
  posts,
  timezone,
  baseUrl,
  todayLocalDateKey,
  imagePostIds,
}: {
  posts: SocialPostRow[];
  timezone: string;
  baseUrl: string;
  todayLocalDateKey: string;
  imagePostIds: Set<string>;
}) {
  const publishingPosts: PublishingReminderPost[] = posts
    .map((post) => {
      const publishLocal = getLocalParts(new Date(post.scheduled_at!), timezone);
      const publishDateKey = publishLocal.dateKey;
      const publishTimeKey = publishLocal.timeKey;
      const isDueOrOverdue = publishDateKey <= todayLocalDateKey;
      const isOverdue = publishDateKey < todayLocalDateKey;
      const isDueToday = publishDateKey === todayLocalDateKey;
      const hasImage = imagePostIds.has(post.id);
      const isReviewApproved = post.review_status === "approved";
      const isPublishable = isReviewApproved && hasImage;

      let blockedReason: string | null = null;

      if (!isReviewApproved) {
        blockedReason =
          "Content-Review ist noch nicht freigegeben. Bitte zuerst Review öffnen und den Beitrag freigeben.";
      } else if (!hasImage) {
        blockedReason =
          "Es ist noch kein veröffentlichbares Social-Bild vorhanden. Bitte zuerst ein Bild erzeugen.";
      }

      return {
        id: post.id,
        topic: post.topic,
        status: post.status,
        review_status: post.review_status,
        scheduled_at: post.scheduled_at!,
        publish_date_local: publishDateKey,
        publish_weekday_local: publishLocal.weekday,
        publish_time_local: publishTimeKey,
        reminder_date_local: todayLocalDateKey,
        reminder_weekday_local: formatWeekdayFromDateKey(todayLocalDateKey),
        is_overdue: isOverdue,
        is_due_today: isDueToday,
        has_image: hasImage,
        is_review_approved: isReviewApproved,
        is_publishable: isPublishable,
        blocked_reason: blockedReason,
        review_url: `${baseUrl}/admin/social/${post.id}/review`,
        posting_url: `${baseUrl}/admin/social/${post.id}/posting`,
      };
    })
    .filter((post) => post.publish_date_local <= todayLocalDateKey);

  return publishingPosts;
}

export async function GET(request: Request) {
  try {
    assertCronAccess(request);

    const { now, invalidNowParam } = parseNowFromRequest(request);

    if (!now) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Ungültiger now-Parameter. Bitte ISO-Zeit verwenden, z. B. 2026-06-16T08:00:00.000Z.",
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
        mode: "publishing_log_only",
        action: "not_logged",
        message:
          "Aktuell liegt keine Reminder-Zeit im gültigen Zeitfenster. Es wurde kein Publishing-Event angelegt.",
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
        mode: "publishing_log_only",
        action: "already_logged",
        message:
          "Für dieses Projekt, Datum und Publishing-Reminder-Zeitfenster existiert bereits ein Event. Es wurde nichts doppelt angelegt.",
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

    if (!settings.automation_enabled || !settings.email_notifications_enabled) {
      const event = await insertReminderEvent({
        projectId: project.id,
        reminderDateLocal: todayLocalDateKey,
        reminderTimeLocal: matchedReminderTime,
        timezone,
        status: "skipped",
        recipientEmail: settings.recipient_email,
        recipientName: settings.recipient_name,
        postIds: [],
        openReviewCount: 0,
        approvedCount: 0,
        publishedCount: 0,
        payload: {
          project,
          now: {
            server_iso: now.toISOString(),
            local_date: todayLocalDateKey,
            local_time: currentLocalTimeKey,
            local_weekday: localNow.weekday,
            matched_reminder_time: matchedReminderTime,
            reminder_tolerance_minutes: REMINDER_TOLERANCE_MINUTES,
          },
          settings,
          summary: {
            posts_due_today: 0,
            open_reviews: 0,
            approved_waiting_for_posting: 0,
            already_published: 0,
          },
          ready_to_publish_posts: [],
          blocked_publish_posts: [],
          overdue_posts: [],
          due_today_posts: [],
        },
        errorMessage:
          "Automation oder E-Mail-Benachrichtigungen sind deaktiviert.",
      });

      return NextResponse.json({
        ok: true,
        mode: "publishing_log_only",
        action: "logged_skipped",
        message:
          "Publishing-Reminder wurde übersprungen, weil Automation oder E-Mail-Benachrichtigungen deaktiviert sind.",
        event,
      });
    }

    const candidatePosts = await loadCandidatePosts(project.id);
    const imagePostIds = await loadImagePostIds(
      candidatePosts.map((post) => post.id)
    );
    const baseUrl = getBaseUrl(request);

    const publishingPosts = buildPublishingPosts({
      posts: candidatePosts,
      timezone,
      baseUrl,
      todayLocalDateKey,
      imagePostIds,
    });

    const readyToPublishPosts = publishingPosts.filter(
      (post) => post.is_publishable
    );
    const blockedPublishPosts = publishingPosts.filter(
      (post) => !post.is_publishable
    );
    const overduePosts = publishingPosts.filter((post) => post.is_overdue);
    const dueTodayPosts = publishingPosts.filter((post) => post.is_due_today);
    const postIds = publishingPosts.map((post) => post.id);

    const eventStatus: "pending" | "skipped" =
      publishingPosts.length > 0 && settings.recipient_email
        ? "pending"
        : "skipped";

    const errorMessage =
      publishingPosts.length === 0
        ? "Es gibt aktuell keine heute fälligen oder überfälligen Veröffentlichungen."
        : !settings.recipient_email
          ? "Es ist keine Empfänger-E-Mail für Publishing-Reminder hinterlegt."
          : null;

    const event = await insertReminderEvent({
      projectId: project.id,
      reminderDateLocal: todayLocalDateKey,
      reminderTimeLocal: matchedReminderTime,
      timezone,
      status: eventStatus,
      recipientEmail: settings.recipient_email,
      recipientName: settings.recipient_name,
      postIds,
      openReviewCount: blockedPublishPosts.length,
      approvedCount: readyToPublishPosts.length,
      publishedCount: 0,
      payload: {
        project,
        now: {
          server_iso: now.toISOString(),
          local_date: todayLocalDateKey,
          local_time: currentLocalTimeKey,
          local_weekday: localNow.weekday,
          matched_reminder_time: matchedReminderTime,
          reminder_tolerance_minutes: REMINDER_TOLERANCE_MINUTES,
        },
        settings,
        summary: {
          posts_due_today: publishingPosts.length,
          open_reviews: blockedPublishPosts.length,
          approved_waiting_for_posting: readyToPublishPosts.length,
          already_published: 0,
        },
        publishing_posts: publishingPosts,
        ready_to_publish_posts: readyToPublishPosts,
        blocked_publish_posts: blockedPublishPosts,
        overdue_posts: overduePosts,
        due_today_posts: dueTodayPosts,
      },
      errorMessage,
    });

    return NextResponse.json({
      ok: true,
      mode: "publishing_log_only",
      action: eventStatus === "pending" ? "logged" : "logged_skipped",
      message:
        eventStatus === "pending"
          ? "Publishing-Reminder-Event wurde als pending protokolliert. Es wurde noch keine E-Mail versendet."
          : "Publishing-Reminder-Event wurde als skipped protokolliert.",
      project,
      now: {
        server_iso: now.toISOString(),
        local_date: todayLocalDateKey,
        local_time: currentLocalTimeKey,
        local_weekday: localNow.weekday,
        matched_reminder_time: matchedReminderTime,
        reminder_tolerance_minutes: REMINDER_TOLERANCE_MINUTES,
      },
      summary: {
        posts_due_today: publishingPosts.length,
        ready_to_publish: readyToPublishPosts.length,
        blocked_publish: blockedPublishPosts.length,
        overdue: overduePosts.length,
        due_today: dueTodayPosts.length,
      },
      event,
      publishing_posts: publishingPosts,
      ready_to_publish_posts: readyToPublishPosts,
      blocked_publish_posts: blockedPublishPosts,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unbekannter Fehler beim Protokollieren der Publishing-Reminder.";

    return NextResponse.json(
      {
        ok: false,
        mode: "publishing_log_only",
        message,
      },
      { status: 500 }
    );
  }
}
