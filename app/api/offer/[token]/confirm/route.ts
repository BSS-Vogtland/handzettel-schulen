import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    token: string;
  }>;
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
    text.includes("aktualisiertes angebot") ||
    text.includes("aktualisierungsmail mit pdf")
  );
}

function isUpdateConfirmationEvent(event: EventRow) {
  const type = getEventType(event);
  const text = getEventText(event);

  return (
    type.includes("offer_update_confirmed") ||
    text.includes("aktualisiertes angebot bestätigt") ||
    text.includes("aktualisiertes angebot offiziell angenommen") ||
    text.includes("manuell aktualisierte") ||
    text.includes("aktualisierte fassung angenommen")
  );
}

function isAnyConfirmationEvent(event: EventRow) {
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

  if (!thirdAttempt.error) return;

  console.error("Event konnte nicht gespeichert werden:", {
    firstError: firstAttempt.error,
    secondError: secondAttempt.error,
    thirdError: thirdAttempt.error,
  });
}

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { token } = await context.params;

    if (!token) {
      return NextResponse.json(
        { ok: false, message: "Kein Angebotstoken übergeben." },
        { status: 400 }
      );
    }

    const { data: requestData, error: requestError } = await supabaseServer
      .from("school_requests")
      .select("id, request_number, status, offer_status, updated_at")
      .eq("offer_token", token)
      .single();

    if (requestError || !requestData) {
      return NextResponse.json(
        {
          ok: false,
          message: requestError?.message || "Das Angebot wurde nicht gefunden.",
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
      .limit(100);

    if (eventsError) {
      console.error("Events konnten nicht geladen werden:", eventsError);
    }

    const events = (eventsData || []) as EventRow[];

    const latestUpdateMailEvent = findLatestEvent(events, isUpdateMailEvent);
    const latestUpdateConfirmationEvent = findLatestEvent(
      events,
      isUpdateConfirmationEvent
    );
    const latestAnyConfirmationEvent = findLatestEvent(
      events,
      isAnyConfirmationEvent
    );

    const latestUpdateMailTime = getTime(latestUpdateMailEvent?.created_at);
    const latestUpdateConfirmationTime = getTime(
      latestUpdateConfirmationEvent?.created_at
    );
    const latestAnyConfirmationTime = getTime(
      latestAnyConfirmationEvent?.created_at
    );

    /*
      WICHTIG:
      offer_status === "offer_sent" ist der harte Marker:
      Das manuell geänderte Angebot wurde versendet und wartet auf Annahme.
      Wenn der Kunde jetzt klickt, muss es als aktualisiertes Angebot bestätigt werden,
      auch wenn das Event "offer_update_mail_sent" nicht zuverlässig gefunden wurde.
    */
    const hasOfferSentStatus = requestRow.offer_status === "offer_sent";

    const hasPendingUpdatedOfferByEvent =
      Boolean(latestUpdateMailEvent) &&
      latestUpdateMailTime > latestUpdateConfirmationTime &&
      latestUpdateMailTime >= latestAnyConfirmationTime;

    const hasPendingUpdatedOffer =
      hasOfferSentStatus || hasPendingUpdatedOfferByEvent;

    if (
      requestRow.status === "confirmed" &&
      requestRow.offer_status === "confirmed" &&
      !hasPendingUpdatedOffer
    ) {
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

    /*
      FALL 1:
      Kunde bestätigt ein aktualisiertes Angebot aus der Aktualisierungsmail.
      Das hat Vorrang vor offenen Positionen, weil diese in diesem Ablauf bereits
      durch den Admin manuell geprüft/ergänzt wurden.
    */
    if (hasPendingUpdatedOffer) {
      const now = new Date().toISOString();

      const { error: updateError } = await supabaseServer
        .from("school_requests")
        .update({
          status: "confirmed",
          offer_status: "confirmed",
          updated_at: now,
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
          confirmed_from: "updated_offer",
          previous_status: requestRow.status,
          previous_offer_status: requestRow.offer_status,
          open_request_items_count: openRequestItems.length,
          offer_items_count: offerItems.length,
          request_items_count: requestItems.length,
          had_offer_sent_status: hasOfferSentStatus,
          had_update_mail_event: Boolean(latestUpdateMailEvent),
        },
      });

      return NextResponse.json({
        ok: true,
        mode: "updated_offer_confirmed",
        message: "Das aktualisierte Angebot wurde offiziell bestätigt.",
      });
    }

    /*
      FALL 2:
      Normaler Paketwunsch vom Kunden, aber es gibt noch offene Positionen.
      Das ist KEINE finale Bestätigung.
    */
    if (hasOpenManualReviewItems) {
      const { error: updateError } = await supabaseServer
        .from("school_requests")
        .update({
          status: "manual_review",
          offer_status: "customer_selection",
          updated_at: new Date().toISOString(),
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
          confirmed_from: "customer_package_submission",
          open_request_items_count: openRequestItems.length,
          offer_items_count: offerItems.length,
          request_items_count: requestItems.length,
        },
      });

      return NextResponse.json({
        ok: true,
        mode: "manual_review_required",
        message:
          "Dein Paketwunsch wurde abgesendet. Einzelne Positionen werden noch persönlich geprüft.",
      });
    }

    /*
      FALL 3:
      Kunde hat alle erkannten Positionen selbst vollständig ausgewählt.
      Erst dann ist die normale Kundenauswahl wirklich bestätigt.
    */
    const { error: updateError } = await supabaseServer
      .from("school_requests")
      .update({
        status: "confirmed",
        offer_status: "confirmed",
        updated_at: new Date().toISOString(),
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
        confirmed_from: "complete_customer_selection",
        open_request_items_count: openRequestItems.length,
        offer_items_count: offerItems.length,
        request_items_count: requestItems.length,
      },
    });

    return NextResponse.json({
      ok: true,
      mode: "offer_confirmed",
      message: "Das Angebot wurde bestätigt.",
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