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

type SocialPostRow = {
  id: string;
  created_at: string;
  status: string;
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

export async function POST() {
  try {
    const { data: postsData, error: postsError } = await supabaseServer
      .from("social_posts")
      .select("id, created_at, status, topic, scheduled_at")
      .in("status", ["draft", "approved"])
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
        message:
          "Es wurden keine offenen, ungeplanten Entwürfe gefunden. Erzeuge zuerst neue Beiträge oder entferne bestehende Termine.",
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
        .select("id, topic, status, scheduled_at")
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
      message: `${plannedPosts.length} Beitrag${
        plannedPosts.length === 1 ? "" : "e"
      } wurden automatisch für die nächste Woche geplant.`,
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