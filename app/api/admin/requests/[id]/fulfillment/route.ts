import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type FulfillmentAction =
  | "start_picking"
  | "mark_picked"
  | "mark_packed"
  | "ready_for_pickup"
  | "mark_picked_up"
  | "ready_for_shipping"
  | "mark_shipped";

type RequestRow = {
  id: string;
  status: string | null;
  offer_status: string | null;
  fulfillment_method: string | null;
  fulfillment_status: string | null;
  picking_status: string | null;
};

type UpdatePayload = {
  picking_status?: string;
  fulfillment_status?: string;
  picking_started_at?: string | null;
  picked_at?: string | null;
  packed_at?: string | null;
  shipped_at?: string | null;
  picked_up_at?: string | null;
  updated_at: string;
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

async function readBodySafely(request: NextRequest) {
  try {
    const text = await request.text();

    if (!text.trim()) {
      return {};
    }

    return JSON.parse(text) as {
      action?: FulfillmentAction;
    };
  } catch {
    return {};
  }
}

function getActionLabel(action: FulfillmentAction) {
  switch (action) {
    case "start_picking":
      return "Picking gestartet";
    case "mark_picked":
      return "Artikel gepickt";
    case "mark_packed":
      return "Paket gepackt";
    case "ready_for_pickup":
      return "Paket abholbereit";
    case "mark_picked_up":
      return "Paket abgeholt";
    case "ready_for_shipping":
      return "Paket versandbereit";
    case "mark_shipped":
      return "Paket versendet";
    default:
      return "Status aktualisiert";
  }
}

function getActionMessage(action: FulfillmentAction, requestRow: RequestRow) {
  switch (action) {
    case "start_picking":
      return "Die Kommissionierung / Pickingliste wurde gestartet.";
    case "mark_picked":
      return "Alle benötigten Artikel wurden als gepickt markiert.";
    case "mark_packed":
      return "Das Schulpaket wurde als gepackt markiert.";
    case "ready_for_pickup":
      return "Das Schulpaket wurde als abholbereit markiert.";
    case "mark_picked_up":
      return "Das Schulpaket wurde als abgeholt markiert.";
    case "ready_for_shipping":
      return "Das Schulpaket wurde als versandbereit markiert.";
    case "mark_shipped":
      return "Das Schulpaket wurde als versendet markiert.";
    default:
      return `Fulfillment-Status wurde aktualisiert. Aktuelle Methode: ${
        requestRow.fulfillment_method || "unbekannt"
      }`;
  }
}

function getUpdatePayload(action: FulfillmentAction, now: string): UpdatePayload {
  switch (action) {
    case "start_picking":
      return {
        picking_status: "picking",
        picking_started_at: now,
        updated_at: now,
      };

    case "mark_picked":
      return {
        picking_status: "picked",
        picked_at: now,
        updated_at: now,
      };

    case "mark_packed":
      return {
        picking_status: "packed",
        packed_at: now,
        updated_at: now,
      };

    case "ready_for_pickup":
      return {
        picking_status: "packed",
        fulfillment_status: "ready_for_pickup",
        packed_at: now,
        updated_at: now,
      };

    case "mark_picked_up":
      return {
        picking_status: "packed",
        fulfillment_status: "picked_up",
        picked_up_at: now,
        updated_at: now,
      };

    case "ready_for_shipping":
      return {
        picking_status: "packed",
        fulfillment_status: "shipping_ready",
        packed_at: now,
        updated_at: now,
      };

    case "mark_shipped":
      return {
        picking_status: "packed",
        fulfillment_status: "shipped",
        shipped_at: now,
        updated_at: now,
      };

    default:
      return {
        updated_at: now,
      };
  }
}

function isValidAction(value: unknown): value is FulfillmentAction {
  return (
    value === "start_picking" ||
    value === "mark_picked" ||
    value === "mark_packed" ||
    value === "ready_for_pickup" ||
    value === "mark_picked_up" ||
    value === "ready_for_shipping" ||
    value === "mark_shipped"
  );
}

async function insertEvent(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  requestId: string;
  action: FulfillmentAction;
  requestRow: RequestRow;
}) {
  const { supabase, requestId, action, requestRow } = params;
  const now = new Date().toISOString();

  const eventType = `fulfillment_${action}`;
  const title = getActionLabel(action);
  const message = getActionMessage(action, requestRow);

  const payloads = [
    {
      request_id: requestId,
      event_type: eventType,
      title,
      message,
      description: message,
      metadata: {
        action,
        fulfillment_method: requestRow.fulfillment_method,
        previous_fulfillment_status: requestRow.fulfillment_status,
        previous_picking_status: requestRow.picking_status,
      },
      created_at: now,
    },
    {
      request_id: requestId,
      event_type: eventType,
      message,
      created_at: now,
    },
    {
      request_id: requestId,
      type: eventType,
      message,
      created_at: now,
    },
  ];

  for (const payload of payloads) {
    const { error } = await supabase.from("school_request_events").insert(payload);

    if (!error) return;
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
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

    if (!isValidAction(action)) {
      return NextResponse.json(
        {
          ok: false,
          message: "Ungültige Fulfillment-Aktion.",
        },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: requestData, error: requestError } = await supabase
      .from("school_requests")
      .select(
        "id, status, offer_status, fulfillment_method, fulfillment_status, picking_status"
      )
      .eq("id", requestId)
      .maybeSingle();

    if (requestError || !requestData) {
      return NextResponse.json(
        {
          ok: false,
          message:
            requestError?.message || "Die Anfrage wurde nicht gefunden.",
        },
        { status: 404 }
      );
    }

    const requestRow = requestData as RequestRow;

    const isConfirmed =
      requestRow.status === "confirmed" ||
      requestRow.offer_status === "confirmed";

    if (!isConfirmed) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Der Fulfillment-Workflow kann erst gestartet werden, wenn das Angebot bestätigt wurde.",
        },
        { status: 409 }
      );
    }

    if (
      action === "ready_for_pickup" ||
      action === "mark_picked_up"
    ) {
      if (requestRow.fulfillment_method !== "pickup") {
        return NextResponse.json(
          {
            ok: false,
            message:
              "Diese Aktion ist nur möglich, wenn der Kunde Abholung gewählt hat.",
          },
          { status: 409 }
        );
      }
    }

    if (
      action === "ready_for_shipping" ||
      action === "mark_shipped"
    ) {
      if (requestRow.fulfillment_method !== "shipping") {
        return NextResponse.json(
          {
            ok: false,
            message:
              "Diese Aktion ist nur möglich, wenn der Kunde Versand gewählt hat.",
          },
          { status: 409 }
        );
      }
    }

    const now = new Date().toISOString();
    const updatePayload = getUpdatePayload(action, now);

    const { error: updateError } = await supabase
      .from("school_requests")
      .update(updatePayload)
      .eq("id", requestId);

    if (updateError) {
      return NextResponse.json(
        {
          ok: false,
          message: `Status konnte nicht gespeichert werden: ${updateError.message}`,
        },
        { status: 500 }
      );
    }

    await insertEvent({
      supabase,
      requestId,
      action,
      requestRow,
    });

    return NextResponse.json({
      ok: true,
      action,
      message: `${getActionLabel(action)} wurde gespeichert.`,
    });
  } catch (error) {
    console.error("Fulfillment update error:", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Fulfillment-Status konnte nicht gespeichert werden.",
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    {
      ok: false,
      message: "Diese Route kann nur per POST genutzt werden.",
    },
    { status: 405 }
  );
}