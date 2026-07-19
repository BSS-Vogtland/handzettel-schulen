import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getRequestBlockingState } from "@/lib/requestWorkflowBlocking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type CheckoutOverrideAction = "enable" | "disable";

type RequestRow = {
  id: string;
  request_number: string | null;
  checkout_override_enabled: boolean | null;
};

type RequestItemRow = {
  id: string;
  status: string | null;
  admin_resolution_status: string | null;
};

type OfferItemRow = {
  request_item_id: string | null;
};

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase Umgebungsvariablen fehlen. Prüfe NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY.",
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
  return String(value || "").trim();
}

async function readBodySafely(request: NextRequest) {
  try {
    return (await request.json()) as {
      action?: CheckoutOverrideAction | null;
      note?: string | null;
    };
  } catch {
    return {};
  }
}

function isValidAction(value: unknown): value is CheckoutOverrideAction {
  return value === "enable" || value === "disable";
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
    const { error } = await supabase
      .from("school_request_events")
      .insert(payload);

    if (!error) return;
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;

  try {
    const { id } = await context.params;
    const requestId = cleanString(id);

    if (!requestId) {
      return NextResponse.json(
        {
          ok: false,
          message: "Ungültige Anfrage-ID.",
        },
        { status: 400 },
      );
    }

    const body = await readBodySafely(request);
    const action = body.action;
    const note = cleanString(body.note).slice(0, 500);

    if (!isValidAction(action)) {
      return NextResponse.json(
        {
          ok: false,
          message: "Ungültige Freigabeaktion.",
        },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();

    const [
      { data: requestData, error: requestError },
      { data: requestItemsData, error: requestItemsError },
      { data: offerItemsData, error: offerItemsError },
    ] = await Promise.all([
      supabase
        .from("school_requests")
        .select("id, request_number, checkout_override_enabled")
        .eq("id", requestId)
        .maybeSingle(),
      supabase
        .from("school_request_items")
        .select("id, status, admin_resolution_status")
        .eq("request_id", requestId),
      supabase
        .from("school_offer_items")
        .select("request_item_id")
        .eq("request_id", requestId),
    ]);

    if (requestError || !requestData) {
      return NextResponse.json(
        {
          ok: false,
          message: requestError?.message || "Die Anfrage wurde nicht gefunden.",
        },
        { status: 404 },
      );
    }

    if (requestItemsError) {
      return NextResponse.json(
        {
          ok: false,
          message: `Listenpositionen konnten nicht geprüft werden: ${requestItemsError.message}`,
        },
        { status: 500 },
      );
    }

    if (offerItemsError) {
      return NextResponse.json(
        {
          ok: false,
          message: `Paketpositionen konnten nicht geprüft werden: ${offerItemsError.message}`,
        },
        { status: 500 },
      );
    }

    const requestRow = requestData as RequestRow;
    const requestItems = (requestItemsData ||
      []) as unknown as RequestItemRow[];
    const offerItems = (offerItemsData || []) as unknown as OfferItemRow[];

    const enabling = action === "enable";

    if (enabling && offerItems.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Der Kundenabschluss kann nicht freigegeben werden, weil der Paketwunsch noch keine Paketposition enthält.",
        },
        { status: 409 },
      );
    }

    const blockingState = getRequestBlockingState(
      requestItems,
      offerItems,
      false,
    );
    const now = new Date().toISOString();

    const { error: updateError } = await supabase
      .from("school_requests")
      .update({
        checkout_override_enabled: enabling,
        checkout_override_at: enabling ? now : null,
        checkout_override_note: enabling ? note || null : null,
        checkout_override_by: enabling ? "admin" : null,
        updated_at: now,
      })
      .eq("id", requestId);

    if (updateError) {
      return NextResponse.json(
        {
          ok: false,
          message: `Kundenabschluss-Freigabe konnte nicht gespeichert werden: ${updateError.message}`,
        },
        { status: 500 },
      );
    }

    await insertRequestEvent({
      supabase,
      requestId,
      eventType: enabling
        ? "checkout_override_enabled"
        : "checkout_override_disabled",
      title: enabling
        ? "Kundenabschluss manuell freigegeben"
        : "Manuelle Kundenabschluss-Freigabe zurückgenommen",
      message: enabling
        ? "Der Admin hat den Kundenabschluss ausdrücklich freigegeben. Technisch offene Listenpositionen blockieren den Checkout nicht mehr."
        : "Der Admin hat die manuelle Kundenabschluss-Freigabe zurückgenommen.",
      metadata: {
        request_number: requestRow.request_number,
        previous_checkout_override_enabled:
          requestRow.checkout_override_enabled === true,
        checkout_override_enabled: enabling,
        raw_blocking_count: blockingState.rawBlockingCount,
        offer_items_count: offerItems.length,
        note: enabling ? note || null : null,
      },
    });

    return NextResponse.json({
      ok: true,
      checkoutOverrideEnabled: enabling,
      rawBlockingCount: blockingState.rawBlockingCount,
      message: enabling
        ? "Der Kundenabschluss wurde manuell freigegeben."
        : "Die manuelle Kundenabschluss-Freigabe wurde zurückgenommen.",
    });
  } catch (error) {
    console.error("Checkout override update error:", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Die Kundenabschluss-Freigabe konnte nicht aktualisiert werden.",
      },
      { status: 500 },
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
    { status: 405 },
  );
}
