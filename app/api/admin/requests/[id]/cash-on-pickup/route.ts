import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type CashAction = "allow" | "disable";

type RequestRow = {
  id: string;
  request_number: string | null;
  cash_on_pickup_allowed: boolean | null;
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

function cleanString(value: unknown) {
  if (value === null || value === undefined) return null;

  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

async function readBodySafely(request: NextRequest) {
  try {
    const rawText = await request.text();

    if (!rawText.trim()) {
      return {};
    }

    return JSON.parse(rawText) as {
      action?: CashAction;
      note?: string | null;
    };
  } catch {
    return {};
  }
}

function isValidAction(value: unknown): value is CashAction {
  return value === "allow" || value === "disable";
}

async function insertRequestEvent(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  requestId: string;
  eventType: string;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}) {
  const { supabase, requestId, eventType, title, message, metadata } = params;
  const createdAt = new Date().toISOString();

  const payloads = [
    {
      request_id: requestId,
      event_type: eventType,
      title,
      message,
      description: message,
      metadata: metadata || null,
      created_at: createdAt,
    },
    {
      request_id: requestId,
      event_type: eventType,
      message,
      metadata: metadata || null,
      created_at: createdAt,
    },
    {
      request_id: requestId,
      type: eventType,
      message,
      created_at: createdAt,
    },
  ];

  for (const payload of payloads) {
    const { error } = await supabase.from("school_request_events").insert(payload);

    if (!error) return;
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;

  try {
    const { id } = await context.params;
    const requestId = String(id || "").trim();

    if (!requestId) {
      return NextResponse.json(
        {
          ok: false,
          message: "Ungültige Anfrage-ID.",
        },
        { status: 400 }
      );
    }

    const body = await readBodySafely(request);
    const action = body.action;
    const note = cleanString(body.note);

    if (!isValidAction(action)) {
      return NextResponse.json(
        {
          ok: false,
          message: "Ungültige Barzahlungs-Aktion.",
        },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: requestData, error: requestError } = await supabase
      .from("school_requests")
      .select("id, request_number, cash_on_pickup_allowed")
      .eq("id", requestId)
      .maybeSingle();

    if (requestError || !requestData) {
      return NextResponse.json(
        {
          ok: false,
          message: requestError?.message || "Die Anfrage wurde nicht gefunden.",
        },
        { status: 404 }
      );
    }

    const requestRow = requestData as RequestRow;
    const now = new Date().toISOString();

    const allowCash = action === "allow";

    const { error: updateError } = await supabase
      .from("school_requests")
      .update({
        cash_on_pickup_allowed: allowCash,
        cash_on_pickup_allowed_at: allowCash ? now : null,
        cash_on_pickup_allowed_note: allowCash ? note : null,
        cash_on_pickup_allowed_by: allowCash ? "admin" : null,
        updated_at: now,
      })
      .eq("id", requestId);

    if (updateError) {
      return NextResponse.json(
        {
          ok: false,
          message: `Barzahlung konnte nicht aktualisiert werden: ${updateError.message}`,
        },
        { status: 500 }
      );
    }

    await insertRequestEvent({
      supabase,
      requestId,
      eventType: allowCash
        ? "cash_on_pickup_allowed"
        : "cash_on_pickup_disabled",
      title: allowCash
        ? "Barzahlung bei Abholung freigegeben"
        : "Barzahlung bei Abholung gesperrt",
      message: allowCash
        ? "Admin hat Barzahlung bei Abholung für diese Anfrage freigegeben."
        : "Admin hat Barzahlung bei Abholung für diese Anfrage wieder gesperrt.",
      metadata: {
        request_number: requestRow.request_number,
        previous_cash_on_pickup_allowed: requestRow.cash_on_pickup_allowed,
        cash_on_pickup_allowed: allowCash,
        note,
      },
    });

    return NextResponse.json({
      ok: true,
      cashOnPickupAllowed: allowCash,
      message: allowCash
        ? "Barzahlung bei Abholung wurde für diese Anfrage freigegeben."
        : "Barzahlung bei Abholung wurde für diese Anfrage gesperrt.",
    });
  } catch (error) {
    console.error("Cash on pickup update error:", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Barzahlung konnte nicht aktualisiert werden.",
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;

  return NextResponse.json(
    {
      ok: false,
      message: "Diese Route kann nur per POST genutzt werden.",
    },
    { status: 405 }
  );
}