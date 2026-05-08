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
  picking_started_at: string | null;
  picked_at: string | null;
  packed_at: string | null;
  shipped_at: string | null;
  picked_up_at: string | null;
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

function getEventType(action: FulfillmentAction) {
  switch (action) {
    case "start_picking":
      return "fulfillment_start_picking";
    case "mark_picked":
      return "fulfillment_mark_picked";
    case "mark_packed":
      return "fulfillment_mark_packed";
    case "ready_for_pickup":
      return "fulfillment_ready_for_pickup";
    case "mark_picked_up":
      return "fulfillment_mark_picked_up";
    case "ready_for_shipping":
      return "fulfillment_ready_for_shipping";
    case "mark_shipped":
      return "fulfillment_mark_shipped";
    default:
      return `fulfillment_${action}`;
  }
}

function getUpdatePayload(
  action: FulfillmentAction,
  requestRow: RequestRow,
  now: string
): UpdatePayload {
  const payload: UpdatePayload = {
    updated_at: now,
  };

  switch (action) {
    case "start_picking":
      payload.picking_status = "picking";
      payload.picking_started_at = requestRow.picking_started_at || now;
      return payload;

    case "mark_picked":
      payload.picking_status = "picked";
      payload.picking_started_at = requestRow.picking_started_at || now;
      payload.picked_at = requestRow.picked_at || now;
      return payload;

    case "mark_packed":
      payload.picking_status = "packed";
      payload.picking_started_at = requestRow.picking_started_at || now;
      payload.picked_at = requestRow.picked_at || now;
      payload.packed_at = requestRow.packed_at || now;
      return payload;

    case "ready_for_pickup":
      payload.picking_status = "packed";
      payload.fulfillment_status = "ready_for_pickup";
      payload.picking_started_at = requestRow.picking_started_at || now;
      payload.picked_at = requestRow.picked_at || now;
      payload.packed_at = requestRow.packed_at || now;
      return payload;

    case "mark_picked_up":
      payload.picking_status = "packed";
      payload.fulfillment_status = "picked_up";
      payload.picking_started_at = requestRow.picking_started_at || now;
      payload.picked_at = requestRow.picked_at || now;
      payload.packed_at = requestRow.packed_at || now;
      payload.picked_up_at = requestRow.picked_up_at || now;
      return payload;

    case "ready_for_shipping":
      payload.picking_status = "packed";
      payload.fulfillment_status = "shipping_ready";
      payload.picking_started_at = requestRow.picking_started_at || now;
      payload.picked_at = requestRow.picked_at || now;
      payload.packed_at = requestRow.packed_at || now;
      return payload;

    case "mark_shipped":
      payload.picking_status = "packed";
      payload.fulfillment_status = "shipped";
      payload.picking_started_at = requestRow.picking_started_at || now;
      payload.picked_at = requestRow.picked_at || now;
      payload.packed_at = requestRow.packed_at || now;
      payload.shipped_at = requestRow.shipped_at || now;
      return payload;

    default:
      return payload;
  }
}

function getMethodGuardError(action: FulfillmentAction, requestRow: RequestRow) {
  const pickupActions: FulfillmentAction[] = [
    "ready_for_pickup",
    "mark_picked_up",
  ];

  const shippingActions: FulfillmentAction[] = [
    "ready_for_shipping",
    "mark_shipped",
  ];

  if (
    pickupActions.includes(action) &&
    requestRow.fulfillment_method !== "pickup"
  ) {
    return "Diese Aktion ist nur möglich, wenn der Kunde Abholung gewählt hat.";
  }

  if (
    shippingActions.includes(action) &&
    requestRow.fulfillment_method !== "shipping"
  ) {
    return "Diese Aktion ist nur möglich, wenn der Kunde Versand gewählt hat.";
  }

  return null;
}

async function insertEvent(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  requestId: string;
  action: FulfillmentAction;
  requestRow: RequestRow;
  nextPayload: UpdatePayload;
}) {
  const { supabase, requestId, action, requestRow, nextPayload } = params;
  const now = new Date().toISOString();

  const eventType = getEventType(action);
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
        next_fulfillment_status:
          nextPayload.fulfillment_status || requestRow.fulfillment_status,
        next_picking_status:
          nextPayload.picking_status || requestRow.picking_status,
      },
      created_at: now,
    },
    {
      request_id: requestId,
      event_type: eventType,
      message,
      metadata: {
        action,
        fulfillment_method: requestRow.fulfillment_method,
        previous_fulfillment_status: requestRow.fulfillment_status,
        previous_picking_status: requestRow.picking_status,
        next_fulfillment_status:
          nextPayload.fulfillment_status || requestRow.fulfillment_status,
        next_picking_status:
          nextPayload.picking_status || requestRow.picking_status,
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
        [
          "id",
          "status",
          "offer_status",
          "fulfillment_method",
          "fulfillment_status",
          "picking_status",
          "picking_started_at",
          "picked_at",
          "packed_at",
          "shipped_at",
          "picked_up_at",
        ].join(", ")
      )
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

    const requestRow = requestData as unknown as RequestRow;

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

    const methodGuardError = getMethodGuardError(action, requestRow);

    if (methodGuardError) {
      return NextResponse.json(
        {
          ok: false,
          message: methodGuardError,
        },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();
    const updatePayload = getUpdatePayload(action, requestRow, now);

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
      nextPayload: updatePayload,
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