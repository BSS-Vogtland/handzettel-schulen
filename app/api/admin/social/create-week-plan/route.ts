import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

const TIME_ZONE = "Europe/Berlin";
const MAX_POSTS_PER_PLAN = 7;

const WEEK_SLOTS = [
  { dayOffset: 0, hour: 19, minute: 0 },
  { dayOffset: 1, hour: 8, minute: 15 },
  { dayOffset: 2, hour: 19, minute: 30 },
  { dayOffset: 3, hour: 18, minute: 45 },
  { dayOffset: 4, hour: 8, minute: 30 },
  { dayOffset: 5, hour: 10, minute: 30 },
  { dayOffset: 6, hour: 19, minute: 15 },
];

type SocialProjectRow = {
  id: string;
  name: string;
};

type SocialPostRow = {
  id: string;
  created_at: string;
  status: string;
  review_status: string | null;
  topic: string;
  scheduled_at: string | null;
};

function getZonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const getPart = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value || 0);

  return {
    year: getPart("year"),
    month: getPart("month"),
    day: getPart("day"),
    hour: getPart("hour"),
    minute: getPart("minute"),
    second: getPart("second"),
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = getZonedParts(date, timeZone);

  const zonedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );

  return zonedAsUtc - date.getTime();
}

function createZonedDateTime(
  year: number,
  monthIndex: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
) {
  const utcGuess = new Date(Date.UTC(year, monthIndex, day, hour, minute, 0));
  const offsetMs = getTimeZoneOffsetMs(utcGuess, timeZone);

  return new Date(utcGuess.getTime() - offsetMs);
}

function getNextMondayDateParts() {
  const now = new Date();
  const berlinNow = getZonedParts(now, TIME_ZONE);

  const berlinTodayAsUtcNoon = new Date(
    Date.UTC(berlinNow.year, berlinNow.month - 1, berlinNow.day, 12, 0, 0)
  );

  const weekday = berlinTodayAsUtcNoon.getUTCDay();
  let daysUntilNextMonday = (8 - weekday) % 7;

  if (daysUntilNextMonday === 0) {
    daysUntilNextMonday = 7;
  }

  const nextMonday = new Date(
    Date.UTC(
      berlinNow.year,
      berlinNow.month - 1,
      berlinNow.day + daysUntilNextMonday,
      12,
      0,
      0
    )
  );

  return {
    year: nextMonday.getUTCFullYear(),
    monthIndex: nextMonday.getUTCMonth(),
    day: nextMonday.getUTCDate(),
  };
}

function createScheduleDate(slotIndex: number) {
  const start = getNextMondayDateParts();
  const slot = WEEK_SLOTS[slotIndex % WEEK_SLOTS.length];

  return createZonedDateTime(
    start.year,
    start.monthIndex,
    start.day + slot.dayOffset,
    slot.hour,
    slot.minute,
    TIME_ZONE
  );
}

async function loadActiveProject() {
  const { data, error } = await supabaseServer
    .from("social_projects")
    .select("id, name")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as SocialProjectRow | null;
}

export async function POST() {
  try {
    const project = await loadActiveProject();

    if (!project?.id) {
      return NextResponse.json(
        {
          ok: false,
          message: "Kein aktives Social-Projekt gefunden.",
        },
        { status: 404 }
      );
    }

    const { count: activeScheduledCount, error: scheduledCountError } =
      await supabaseServer
        .from("social_posts")
        .select("id", { count: "exact", head: true })
        .eq("project_id", project.id)
        .eq("status", "scheduled")
        .not("scheduled_at", "is", null);

    if (scheduledCountError) {
      return NextResponse.json(
        {
          ok: false,
          message: scheduledCountError.message,
        },
        { status: 500 }
      );
    }

    if ((activeScheduledCount || 0) > 0) {
      return NextResponse.json({
        ok: true,
        action: "already_has_week_plan",
        message: `Es sind bereits ${activeScheduledCount} Beitrag${
          activeScheduledCount === 1 ? "" : "e"
        } geplant. Der Wochenplan wurde deshalb nicht erneut erstellt.`,
        project,
        plannedPosts: [],
      });
    }

    const { data: postsData, error: postsError } = await supabaseServer
      .from("social_posts")
      .select("id, created_at, status, review_status, topic, scheduled_at")
      .eq("project_id", project.id)
      .eq("status", "approved")
      .eq("review_status", "approved")
      .is("scheduled_at", null)
      .order("created_at", { ascending: true })
      .limit(MAX_POSTS_PER_PLAN);

    if (postsError) {
      return NextResponse.json(
        {
          ok: false,
          message: postsError.message,
        },
        { status: 500 }
      );
    }

    const posts = (postsData || []) as SocialPostRow[];

    if (posts.length === 0) {
      return NextResponse.json({
        ok: true,
        action: "nothing_to_plan",
        message:
          "Es wurden keine freigegebenen, ungeplanten Beiträge gefunden. Gib zuerst Beiträge im Review frei oder entferne bestehende Termine.",
        project,
        plannedPosts: [],
      });
    }

    const plannedPosts = [];

    for (let index = 0; index < posts.length; index += 1) {
      const post = posts[index];
      const scheduledAt = createScheduleDate(index).toISOString();

      const { data: updatedPost, error: updateError } = await supabaseServer
        .from("social_posts")
        .update({
          status: "scheduled",
          scheduled_at: scheduledAt,
        })
        .eq("id", post.id)
        .eq("project_id", project.id)
        .eq("status", "approved")
        .eq("review_status", "approved")
        .is("scheduled_at", null)
        .select("id, topic, status, review_status, scheduled_at")
        .single();

      if (updateError) {
        return NextResponse.json(
          {
            ok: false,
            message: updateError.message,
          },
          { status: 500 }
        );
      }

      plannedPosts.push(updatedPost);
    }

    return NextResponse.json({
      ok: true,
      action: "created",
      message: `${plannedPosts.length} freigegebene Beitrag${
        plannedPosts.length === 1 ? "" : "e"
      } wurden automatisch für die nächste Woche geplant. Maximal ${MAX_POSTS_PER_PLAN} Beiträge werden pro Wochenplan eingeplant.`,
      project,
      plannedPosts,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unbekannter Fehler beim Erstellen des Wochenplans.";

    return NextResponse.json(
      {
        ok: false,
        message,
      },
      { status: 500 }
    );
  }
}