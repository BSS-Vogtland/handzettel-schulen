import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIVE_THRESHOLD_SECONDS = 90;

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase Umgebungsvariablen fehlen. Prüfe NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function secondsBetweenNow(value: string | null) {
  if (!value) return null;

  const timestamp = new Date(value).getTime();

  if (!Number.isFinite(timestamp)) return null;

  return Math.max(0, Math.round((Date.now() - timestamp) / 1000));
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const supabase = getSupabaseAdmin();

    const { data: presence, error: presenceError } = await supabase
      .from("school_offer_presence")
      .select("request_id, last_seen_at, context, updated_at")
      .eq("request_id", id)
      .maybeSingle();

    if (presenceError) {
      return NextResponse.json(
        {
          ok: false,
          isActive: false,
          lastSeenAt: null,
          secondsAgo: null,
          context: null,
          error: presenceError.message,
        },
        { status: 200 }
      );
    }

    const lastSeenAt = presence?.last_seen_at || null;
    const secondsAgo = secondsBetweenNow(lastSeenAt);
    const isActive =
      secondsAgo !== null && secondsAgo <= ACTIVE_THRESHOLD_SECONDS;

    return NextResponse.json({
      ok: true,
      isActive,
      lastSeenAt,
      secondsAgo,
      context: presence?.context || null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        isActive: false,
        lastSeenAt: null,
        secondsAgo: null,
        context: null,
        error:
          error instanceof Error
            ? error.message
            : "Kundenaktivität konnte nicht geladen werden.",
      },
      { status: 200 }
    );
  }
}
