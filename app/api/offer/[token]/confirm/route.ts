import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    token: string;
  }>;
};

type FulfillmentMethod = "pickup" | "shipping";

type ConfirmBody = {
  fulfillmentMethod?: FulfillmentMethod | null;
  pickupLocationLabel?: string | null;
  pickupAddressSnapshot?: string | null;
  pickupMapsUrlSnapshot?: string | null;
};

type RequestRow = {
  id: string;
  request_number: string | null;
  status: string | null;
  offer_status: string | null;
  updated_at?: string | null;
};

type EventRow = {
  id: string;
  request_id: string;
  event_type?: string | null;
  type?: string | null;
  message?: string | null;
  title?: string | null;
  description?: string | null;
  created_at: string | null;
};

type RequestItemRow = {
  id: string;
};

type OfferItemRow = {
  id: string;
  request_item_id: string | null;
};

function cleanString(value: unknown) {
  if (value === null || value === undefined) return null;

  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

async function readBodySafely(request: Request): Promise<ConfirmBody> {
  try {
    const rawText = await request.text();

    if (!rawText.trim()) {
      return {};
    }

    const parsed = JSON.parse(rawText) as ConfirmBody;
    return parsed || {};
  } catch {
    return {};
  }
}

function getEventType(event: EventRow) {
  return String(event.event_type || event.type || "").toLowerCase();
}

function getEventText(event: EventRow) {
  return [event.message || "", event.title || "", event.description || ""]
    .join(" ")
    .toLowerCase();
}

function isUpdateMailEvent(event: EventRow) {
  const type = getEventType(event);
  const text = getEventText(event);

  return (
    type.includes("offer_update_mail_sent") ||
    type.includes("update_mail") ||
    text.includes("aktualisierungsmail") ||
    text.includes("pdf-angebot") ||
    text.includes("aktualisiertes angebot")
  );
}

function isConfirmationEvent(event: EventRow) {
  const type = getEventType(event);
  const text = getEventText(event);

  return (
    type.includes("offer_confirmed") ||
    type.includes("offer_update_confirmed") ||
    type.includes("customer_confirmed") ||
    text.includes("angebot bestätigt") ||
    text.includes("angebot offiziell angenommen") ||
    text.includes("aktualisiertes angebot bestätigt") ||
    text.includes("aktualisiertes angebot offiziell angenommen")
  );
}

function getTime(value: string | null | undefined) {
  if (!value) return 0;

  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function findLatestEvent(
  events: EventRow[],
  matcher: (event: EventRow) => boolean
) {
  return events.find(matcher) || null;
}

function getFulfillmentStatus(method: FulfillmentMethod) {
  if (method === "pickup") return "pickup_requested";
  return "shipping_requested";
}

function getShippingCostStatus(method: FulfillmentMethod) {
  if (method === "shipping") return "pending_calculation";
  return "not_required";
}

function getFulfillmentLabel(method: FulfillmentMethod) {
  if (method === "pickup") return "Abholung im Laden";
  return "Versand gewünscht";
}

function getFulfillmentMessage(method: FulfillmentMethod) {
  if (method === "pickup") {
    return "Der Kunde möchte das Schulpaket im Laden abholen.";
  }

  return "Der Kunde möchte das Schulpaket zugesendet bekommen. Die Versandkosten werden im Nachgang berechnet.";
}

async function insertRequestEvent(params: {
  requestId: string;
  eventType: string;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}) {
  const { requestId, eventType, title, message, metadata } = params;

  const createdAt = new Date().toISOString();

  const firstAttempt = await supabaseServer.from("school_request_events").insert({
    request_id: requestId,
    event_type: eventType,
    title,
    message,
    description: message,
    metadata: metadata || null,
    created_at: createdAt,
  });

  if (!firstAttempt.error) return;

  const secondAttempt = await supabaseServer.from("school_request_events").insert({
    request_id: requestId,
    event_type: eventType,
    message,
    created_at: createdAt,
  });

  if (!secondAttempt.error) return;

  const thirdAttempt = await supabaseServer.from("school_request_events").insert({
    request_id: requestId,
    event_type: eventType,
    title,
    description: message,
    created_at: createdAt,
  });

  if (thirdAttempt.error) {
    console.error("Event konnte nicht gespeichert werden:", {
      firstError: firstAttempt.error,
      secondError: secondAttempt.error,
      thirdError: thirdAttempt.error,
    });
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { token } = await context.params;
    const body = await readBodySafely(request);

    if (!token) {
      return NextResponse.json(
        { ok: false, message: "Kein Angebotstoken übergeben." },
        { status: 400 }
      );
    }

    const fulfillmentMethod = body.fulfillmentMethod || null;

    if (
      fulfillmentMethod !== "pickup" &&
      fulfillmentMethod !== "shipping"
    ) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Bitte wähle aus, ob Du Dein Paket im Laden abholen möchtest oder ob es zugesendet werden soll.",
        },
        { status: 400 }
      );
    }

    const pickupLocationLabel = cleanString(body.pickupLocationLabel);
    const pickupAddressSnapshot = cleanString(body.pickupAddressSnapshot);
    const pickupMapsUrlSnapshot = cleanString(body.pickupMapsUrlSnapshot);

    const { data: requestData, error: requestError } = await supabaseServer
      .from("school_requests")
      .select("id, request_number, status, offer_status, updated_at")
      .eq("offer_token", token)
      .single();

    if (requestError || !requestData) {
      return NextResponse.json(
        {
          ok: false,
          message:
            requestError?.message || "Das Angebot wurde nicht gefunden.",
        },
        { status: 404 }
      );
    }

    const requestRow = requestData as RequestRow;

    const { data: eventsData, error: eventsError } = await supabaseServer
      .from("school_request_events")
      .select("*")
      .eq("request_id", requestRow.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (eventsError) {
      console.error("Events konnten nicht geladen werden:", eventsError);
    }

    const events = (eventsData || []) as EventRow[];

    const latestUpdateMailEvent = findLatestEvent(events, isUpdateMailEvent);
    const latestConfirmationEvent = findLatestEvent(events, isConfirmationEvent);

    const latestUpdateMailTime = getTime(latestUpdateMailEvent?.created_at);
    const latestConfirmationTime = getTime(latestConfirmationEvent?.created_at);

    const hasPendingUpdatedOffer =
      Boolean(latestUpdateMailEvent) &&
      latestUpdateMailTime > latestConfirmationTime;

    if (requestRow.status === "confirmed" && !hasPendingUpdatedOffer) {
      return NextResponse.json({
        ok: true,
        mode: "already_confirmed",
        message: "Dieses Angebot wurde bereits bestätigt.",
      });
    }

    const { data: offerItemsData, error: offerItemsError } = await supabaseServer
      .from("school_offer_items")
      .select("id, request_item_id")
      .eq("request_id", requestRow.id);

    if (offerItemsError) {
      return NextResponse.json(
        {
          ok: false,
          message: `Die Angebotspositionen konnten nicht geprüft werden: ${offerItemsError.message}`,
        },
        { status: 500 }
      );
    }

    const offerItems = (offerItemsData || []) as OfferItemRow[];

    if (offerItems.length <= 0) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Dieses Angebot enthält noch keine Produkte und kann daher nicht bestätigt werden.",
        },
        { status: 400 }
      );
    }

    const { data: requestItemsData, error: requestItemsError } =
      await supabaseServer
        .from("school_request_items")
        .select("id")
        .eq("request_id", requestRow.id);

    if (requestItemsError) {
      return NextResponse.json(
        {
          ok: false,
          message: `Die erkannten Listenpositionen konnten nicht geprüft werden: ${requestItemsError.message}`,
        },
        { status: 500 }
      );
    }

    const requestItems = (requestItemsData || []) as RequestItemRow[];

    const coveredRequestItemIds = new Set(
      offerItems
        .map((item) => item.request_item_id)
        .filter((value): value is string => Boolean(value))
    );

    const openRequestItems = requestItems.filter(
      (item) => !coveredRequestItemIds.has(item.id)
    );

    const hasOpenManualReviewItems =
      requestItems.length > 0 && openRequestItems.length > 0;

    const fulfillmentUpdate = {
      fulfillment_method: fulfillmentMethod,
      fulfillment_status: getFulfillmentStatus(fulfillmentMethod),
      shipping_cost_status: getShippingCostStatus(fulfillmentMethod),
      pickup_location_label:
        fulfillmentMethod === "pickup" ? pickupLocationLabel : null,
      pickup_address_snapshot:
        fulfillmentMethod === "pickup" ? pickupAddressSnapshot : null,
      pickup_maps_url_snapshot:
        fulfillmentMethod === "pickup" ? pickupMapsUrlSnapshot : null,
      confirmed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (hasPendingUpdatedOffer) {
      const { error: updateError } = await supabaseServer
        .from("school_requests")
        .update({
          status: "confirmed",
          offer_status: "confirmed",
          ...fulfillmentUpdate,
        })
        .eq("id", requestRow.id);

      if (updateError) {
        return NextResponse.json(
          {
            ok: false,
            message: `Das aktualisierte Angebot konnte nicht bestätigt werden: ${updateError.message}`,
          },
          { status: 500 }
        );
      }

      await insertRequestEvent({
        requestId: requestRow.id,
        eventType: "offer_update_confirmed",
        title: "Aktualisiertes Angebot bestätigt",
        message:
          "Der Kunde hat das manuell aktualisierte Schulpaket-Angebot offiziell angenommen.",
        metadata: {
          fulfillment_method: fulfillmentMethod,
          fulfillment_label: getFulfillmentLabel(fulfillmentMethod),
          fulfillment_message: getFulfillmentMessage(fulfillmentMethod),
          pickup_location_label: fulfillmentUpdate.pickup_location_label,
          pickup_address_snapshot: fulfillmentUpdate.pickup_address_snapshot,
          pickup_maps_url_snapshot: fulfillmentUpdate.pickup_maps_url_snapshot,
          shipping_cost_status: fulfillmentUpdate.shipping_cost_status,
          open_request_items_count: openRequestItems.length,
          offer_items_count: offerItems.length,
          request_items_count: requestItems.length,
        },
      });

      await insertRequestEvent({
        requestId: requestRow.id,
        eventType:
          fulfillmentMethod === "pickup"
            ? "customer_pickup_requested"
            : "customer_shipping_requested",
        title: getFulfillmentLabel(fulfillmentMethod),
        message: getFulfillmentMessage(fulfillmentMethod),
        metadata: {
          fulfillment_method: fulfillmentMethod,
          pickup_location_label: fulfillmentUpdate.pickup_location_label,
          pickup_address_snapshot: fulfillmentUpdate.pickup_address_snapshot,
          pickup_maps_url_snapshot: fulfillmentUpdate.pickup_maps_url_snapshot,
          shipping_cost_status: fulfillmentUpdate.shipping_cost_status,
        },
      });

      return NextResponse.json({
        ok: true,
        mode: "updated_offer_confirmed",
        fulfillmentMethod,
        message: "Das aktualisierte Angebot wurde offiziell bestätigt.",
      });
    }

    if (hasOpenManualReviewItems) {
      const { error: updateError } = await supabaseServer
        .from("school_requests")
        .update({
          status: "manual_review",
          offer_status: "customer_selection",
          ...fulfillmentUpdate,
        })
        .eq("id", requestRow.id);

      if (updateError) {
        return NextResponse.json(
          {
            ok: false,
            message: `Der Paketwunsch konnte nicht gespeichert werden: ${updateError.message}`,
          },
          { status: 500 }
        );
      }

      await insertRequestEvent({
        requestId: requestRow.id,
        eventType: "customer_package_submitted_manual_review",
        title: "Paketwunsch abgesendet",
        message:
          "Der Kunde hat seinen Paketwunsch abgesendet. Es gibt noch offene Positionen, die manuell geprüft oder ergänzt werden müssen.",
        metadata: {
          fulfillment_method: fulfillmentMethod,
          fulfillment_label: getFulfillmentLabel(fulfillmentMethod),
          fulfillment_message: getFulfillmentMessage(fulfillmentMethod),
          pickup_location_label: fulfillmentUpdate.pickup_location_label,
          pickup_address_snapshot: fulfillmentUpdate.pickup_address_snapshot,
          pickup_maps_url_snapshot: fulfillmentUpdate.pickup_maps_url_snapshot,
          shipping_cost_status: fulfillmentUpdate.shipping_cost_status,
          open_request_items_count: openRequestItems.length,
          offer_items_count: offerItems.length,
          request_items_count: requestItems.length,
        },
      });

      await insertRequestEvent({
        requestId: requestRow.id,
        eventType:
          fulfillmentMethod === "pickup"
            ? "customer_pickup_requested"
            : "customer_shipping_requested",
        title: getFulfillmentLabel(fulfillmentMethod),
        message: getFulfillmentMessage(fulfillmentMethod),
        metadata: {
          fulfillment_method: fulfillmentMethod,
          pickup_location_label: fulfillmentUpdate.pickup_location_label,
          pickup_address_snapshot: fulfillmentUpdate.pickup_address_snapshot,
          pickup_maps_url_snapshot: fulfillmentUpdate.pickup_maps_url_snapshot,
          shipping_cost_status: fulfillmentUpdate.shipping_cost_status,
        },
      });

      return NextResponse.json({
        ok: true,
        mode: "manual_review_required",
        fulfillmentMethod,
        message:
          fulfillmentMethod === "pickup"
            ? "Dein Paketwunsch wurde abgesendet. Einzelne Positionen werden noch persönlich geprüft. Du hast Abholung im Laden ausgewählt."
            : "Dein Paketwunsch wurde abgesendet. Einzelne Positionen werden noch persönlich geprüft. Du hast Versand ausgewählt; die Versandkosten werden im Nachgang berechnet.",
      });
    }

    const { error: updateError } = await supabaseServer
      .from("school_requests")
      .update({
        status: "confirmed",
        offer_status: "confirmed",
        ...fulfillmentUpdate,
      })
      .eq("id", requestRow.id);

    if (updateError) {
      return NextResponse.json(
        {
          ok: false,
          message: `Das Angebot konnte nicht bestätigt werden: ${updateError.message}`,
        },
        { status: 500 }
      );
    }

    await insertRequestEvent({
      requestId: requestRow.id,
      eventType: "offer_confirmed_complete_customer_selection",
      title: "Angebot bestätigt",
      message:
        "Der Kunde hat alle erkannten Positionen selbst ausgewählt und das Schulpaket-Angebot offiziell bestätigt.",
      metadata: {
        fulfillment_method: fulfillmentMethod,
        fulfillment_label: getFulfillmentLabel(fulfillmentMethod),
        fulfillment_message: getFulfillmentMessage(fulfillmentMethod),
        pickup_location_label: fulfillmentUpdate.pickup_location_label,
        pickup_address_snapshot: fulfillmentUpdate.pickup_address_snapshot,
        pickup_maps_url_snapshot: fulfillmentUpdate.pickup_maps_url_snapshot,
        shipping_cost_status: fulfillmentUpdate.shipping_cost_status,
        open_request_items_count: openRequestItems.length,
        offer_items_count: offerItems.length,
        request_items_count: requestItems.length,
      },
    });

    await insertRequestEvent({
      requestId: requestRow.id,
      eventType:
        fulfillmentMethod === "pickup"
          ? "customer_pickup_requested"
          : "customer_shipping_requested",
      title: getFulfillmentLabel(fulfillmentMethod),
      message: getFulfillmentMessage(fulfillmentMethod),
      metadata: {
        fulfillment_method: fulfillmentMethod,
        pickup_location_label: fulfillmentUpdate.pickup_location_label,
        pickup_address_snapshot: fulfillmentUpdate.pickup_address_snapshot,
        pickup_maps_url_snapshot: fulfillmentUpdate.pickup_maps_url_snapshot,
        shipping_cost_status: fulfillmentUpdate.shipping_cost_status,
      },
    });

    return NextResponse.json({
      ok: true,
      mode: "offer_confirmed",
      fulfillmentMethod,
      message:
        fulfillmentMethod === "pickup"
          ? "Das Angebot wurde bestätigt. Du hast Abholung im Laden ausgewählt."
          : "Das Angebot wurde bestätigt. Du hast Versand ausgewählt; die Versandkosten werden im Nachgang berechnet.",
    });
  } catch (error) {
    console.error("Fehler beim Bestätigen des Angebots:", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Beim Bestätigen ist ein unerwarteter Fehler aufgetreten.",
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    {
      ok: false,
      message:
        "Diese Route kann nur per POST genutzt werden. Bitte den Button auf der Angebotsseite verwenden.",
    },
    { status: 405 }
  );
}