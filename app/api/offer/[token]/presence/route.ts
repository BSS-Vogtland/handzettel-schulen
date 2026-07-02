import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    token: string;
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

function cleanText(value: unknown, maxLength: number) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLength);
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { token } = await context.params;
    const cleanToken = cleanText(token, 160);

    if (!cleanToken) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const clientId = cleanText((body as { clientId?: unknown }).clientId, 120);
    const presenceContext =
      cleanText((body as { context?: unknown }).context, 80) || "offer_page";

    const supabase = getSupabaseAdmin();

    const { data: schoolRequest, error: requestError } = await supabase
      .from("school_requests")
      .select("id, offer_token")
      .eq("offer_token", cleanToken)
      .maybeSingle();

    if (requestError) {
      return NextResponse.json(
        { ok: false, error: requestError.message },
        { status: 500 }
      );
    }

    if (!schoolRequest) {
      return NextResponse.json({ ok: false }, { status: 404 });
    }

    const now = new Date().toISOString();

    const { error: upsertError } = await supabase
      .from("school_offer_presence")
      .upsert(
        {
          request_id: schoolRequest.id,
          offer_token: cleanToken,
          client_id: clientId || null,
          context: presenceContext,
          user_agent: cleanText(request.headers.get("user-agent"), 300) || null,
          last_seen_at: now,
          updated_at: now,
        },
        { onConflict: "request_id" }
      );

    if (upsertError) {
      return NextResponse.json(
        { ok: false, error: upsertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, lastSeenAt: now });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Kundenaktivität konnte nicht gespeichert werden.",
      },
      { status: 500 }
    );
  }
}
