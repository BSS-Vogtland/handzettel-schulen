import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { sendBookSupplierOrderResponseNotification } from "@/lib/bookSupplierMail";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOWED_STATUSES = new Set([
  "pending",
  "accepted",
  "partially_accepted",
  "unavailable",
  "ready",
]);

type Params = {
  params: Promise<{
    token: string;
  }>;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function nullableNumber(
  value: unknown,
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const parsed = Math.trunc(Number(value));

  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

async function loadOrder(token: string) {
  const { data: order, error: orderError } =
    await supabaseServer
      .from("book_supplier_orders")
      .select("*")
      .eq("response_token", token)
      .maybeSingle();

  if (orderError) {
    throw new Error(
      `Buchauftrag konnte nicht geladen werden: ${orderError.message}`,
    );
  }

  if (!order) {
    return null;
  }

  const [
    { data: partner, error: partnerError },
    { data: inquiry, error: inquiryError },
    { data: items, error: itemsError },
  ] = await Promise.all([
    supabaseServer
      .from("book_supplier_partners")
      .select("*")
      .eq("id", order.supplier_id)
      .maybeSingle(),
    supabaseServer
      .from("book_supplier_inquiries")
      .select("*")
      .eq("id", order.source_inquiry_id)
      .maybeSingle(),
    supabaseServer
      .from("book_supplier_order_items")
      .select("*")
      .eq("order_id", order.id)
      .order("sort_order", {
        ascending: true,
      }),
  ]);

  if (partnerError || !partner) {
    throw new Error(
      `Buchhandlung konnte nicht geladen werden: ${
        partnerError?.message || "Partner fehlt"
      }`,
    );
  }

  if (inquiryError || !inquiry) {
    throw new Error(
      `Verfügbarkeitsanfrage konnte nicht geladen werden: ${
        inquiryError?.message || "Anfrage fehlt"
      }`,
    );
  }

  if (itemsError) {
    throw new Error(
      `Auftragspositionen konnten nicht geladen werden: ${itemsError.message}`,
    );
  }

  return {
    order,
    partner,
    inquiry,
    items: items || [],
  };
}

export async function GET(
  _request: Request,
  context: Params,
) {
  try {
    const { token } = await context.params;
    const result = await loadOrder(token);

    if (!result) {
      return NextResponse.json(
        {
          ok: false,
          message: "Der Buchauftrag wurde nicht gefunden.",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Der Buchauftrag konnte nicht geladen werden.",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  context: Params,
) {
  try {
    const { token } = await context.params;
    const result = await loadOrder(token);

    if (!result) {
      return NextResponse.json(
        {
          ok: false,
          message: "Der Buchauftrag wurde nicht gefunden.",
        },
        { status: 404 },
      );
    }

    if (["completed", "cancelled"].includes(result.order.status)) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Dieser Auftrag wurde bereits abgeschlossen oder abgebrochen.",
        },
        { status: 409 },
      );
    }

    const body = (await request.json()) as {
      supplierNote?: unknown;
      items?: Array<{
        id?: unknown;
        supplierStatus?: unknown;
        acceptedQuantity?: unknown;
        supplierNote?: unknown;
      }>;
    };

    const updates = Array.isArray(body.items)
      ? body.items
      : [];

    const itemById = new Map(
      result.items.map((item) => [item.id, item]),
    );

    for (const rawUpdate of updates) {
      const itemId = clean(rawUpdate.id);
      const supplierStatus = clean(
        rawUpdate.supplierStatus,
      );
      const sourceItem = itemById.get(itemId);

      if (
        !sourceItem ||
        !ALLOWED_STATUSES.has(supplierStatus)
      ) {
        return NextResponse.json(
          {
            ok: false,
            message:
              "Mindestens eine Rückmeldung enthält eine ungültige Position oder einen ungültigen Status.",
          },
          { status: 400 },
        );
      }

      let acceptedQuantity = nullableNumber(
        rawUpdate.acceptedQuantity,
      );

      if (["accepted", "ready"].includes(supplierStatus)) {
        acceptedQuantity = sourceItem.quantity;
      }

      if (supplierStatus === "unavailable") {
        acceptedQuantity = 0;
      }

      if (supplierStatus === "pending") {
        acceptedQuantity = null;
      }

      if (
        acceptedQuantity !== null &&
        acceptedQuantity > sourceItem.quantity
      ) {
        return NextResponse.json(
          {
            ok: false,
            message:
              "Die bestätigte Menge darf die bestellte Menge nicht überschreiten.",
          },
          { status: 400 },
        );
      }

      if (
        supplierStatus === "partially_accepted" &&
        (acceptedQuantity === null ||
          acceptedQuantity < 1 ||
          acceptedQuantity >= sourceItem.quantity)
      ) {
        return NextResponse.json(
          {
            ok: false,
            message:
              "Bei einer teilweise angenommenen Position muss die bestätigte Menge größer als 0 und kleiner als die bestellte Menge sein.",
          },
          { status: 400 },
        );
      }

      const { error: updateError } = await supabaseServer
        .from("book_supplier_order_items")
        .update({
          supplier_status: supplierStatus,
          accepted_quantity: acceptedQuantity,
          supplier_note:
            clean(rawUpdate.supplierNote) || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", itemId)
        .eq("order_id", result.order.id);

      if (updateError) {
        throw new Error(
          `Auftragsrückmeldung konnte nicht gespeichert werden: ${updateError.message}`,
        );
      }
    }

    const { data: refreshedItems, error: refreshError } =
      await supabaseServer
        .from("book_supplier_order_items")
        .select("*")
        .eq("order_id", result.order.id)
        .order("sort_order", {
          ascending: true,
        });

    if (refreshError) {
      throw new Error(
        `Gespeicherte Auftragsrückmeldung konnte nicht erneut geladen werden: ${refreshError.message}`,
      );
    }

    const statuses = (refreshedItems || []).map(
      (item) => item.supplier_status,
    );
    const answeredCount = statuses.filter(
      (status) => status !== "pending",
    ).length;
    const allAnswered =
      statuses.length > 0 &&
      answeredCount === statuses.length;
    const allReady =
      statuses.length > 0 &&
      statuses.every((status) => status === "ready");
    const allUnavailable =
      statuses.length > 0 &&
      statuses.every(
        (status) => status === "unavailable",
      );
    const allAcceptedOrReady =
      statuses.length > 0 &&
      statuses.every((status) =>
        ["accepted", "ready"].includes(status),
      );

    let nextStatus = result.order.sent_at
      ? "sent"
      : "draft";

    if (allReady) {
      nextStatus = "ready";
    } else if (allUnavailable) {
      nextStatus = "unavailable";
    } else if (allAcceptedOrReady) {
      nextStatus = "accepted";
    } else if (answeredCount > 0) {
      nextStatus = "partially_accepted";
    }

    const now = new Date().toISOString();

    const { error: orderUpdateError } =
      await supabaseServer
        .from("book_supplier_orders")
        .update({
          status: nextStatus,
          supplier_note:
            clean(body.supplierNote) || null,
          first_answered_at:
            result.order.first_answered_at ||
            (answeredCount > 0 ? now : null),
          answered_at: allAnswered ? now : null,
          ready_at: allReady
            ? result.order.ready_at || now
            : result.order.ready_at,
          updated_at: now,
        })
        .eq("id", result.order.id);

    if (orderUpdateError) {
      throw new Error(
        `Auftragsstatus konnte nicht gespeichert werden: ${orderUpdateError.message}`,
      );
    }

    await supabaseServer
      .from("book_supplier_order_events")
      .insert({
        order_id: result.order.id,
        event_type: "supplier_order_response_saved",
        title: "Auftragsrückmeldung aktualisiert",
        description: `${answeredCount} von ${
          (refreshedItems || []).length
        } Positionen wurden beantwortet.`,
        metadata: {
          answered_count: answeredCount,
          item_count: (refreshedItems || []).length,
          status: nextStatus,
        },
      });

    try {
      await sendBookSupplierOrderResponseNotification({
        partner: result.partner,
        order: result.order,
        items: refreshedItems || [],
      });
    } catch (mailError) {
      console.error(
        "Book supplier order response notification failed:",
        mailError,
      );
    }

    return NextResponse.json({
      ok: true,
      message: allAnswered
        ? "Vielen Dank. Die Auftragsrückmeldung wurde vollständig gespeichert."
        : "Die Auftragsrückmeldung wurde gespeichert. Offene Positionen können später ergänzt werden.",
      status: nextStatus,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Die Auftragsrückmeldung konnte nicht gespeichert werden.",
      },
      { status: 500 },
    );
  }
}
