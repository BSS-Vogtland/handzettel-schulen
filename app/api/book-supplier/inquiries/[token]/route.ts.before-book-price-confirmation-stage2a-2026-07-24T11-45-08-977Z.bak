import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { sendBookSupplierResponseNotification } from "@/lib/bookSupplierMail";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOWED_STATUSES = new Set([
  "pending",
  "in_store",
  "orderable",
  "partially_available",
  "unavailable",
  "checking",
]);

type Params = {
  params: Promise<{
    token: string;
  }>;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Math.trunc(Number(value));

  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

function nullableDate(value: unknown) {
  const text = clean(value);

  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

async function loadInquiry(token: string) {
  const { data: inquiry, error: inquiryError } = await supabaseServer
    .from("book_supplier_inquiries")
    .select("*")
    .eq("response_token", token)
    .maybeSingle();

  if (inquiryError) {
    throw new Error(
      `Anfrage konnte nicht geladen werden: ${inquiryError.message}`,
    );
  }

  if (!inquiry) {
    return null;
  }

  const [
    { data: partner, error: partnerError },
    { data: items, error: itemsError },
  ] = await Promise.all([
    supabaseServer
      .from("book_supplier_partners")
      .select("*")
      .eq("id", inquiry.supplier_id)
      .maybeSingle(),
    supabaseServer
      .from("book_supplier_inquiry_items")
      .select("*")
      .eq("inquiry_id", inquiry.id)
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

  if (itemsError) {
    throw new Error(
      `Buchpositionen konnten nicht geladen werden: ${itemsError.message}`,
    );
  }

  return {
    inquiry,
    partner,
    items: items || [],
  };
}

export async function GET(_request: Request, context: Params) {
  try {
    const { token } = await context.params;
    const result = await loadInquiry(token);

    if (!result) {
      return NextResponse.json(
        {
          ok: false,
          message: "Die Verfügbarkeitsanfrage wurde nicht gefunden.",
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
            : "Die Verfügbarkeitsanfrage konnte nicht geladen werden.",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, context: Params) {
  try {
    const { token } = await context.params;
    const result = await loadInquiry(token);

    if (!result) {
      return NextResponse.json(
        {
          ok: false,
          message: "Die Verfügbarkeitsanfrage wurde nicht gefunden.",
        },
        { status: 404 },
      );
    }

    if (result.inquiry.status === "closed") {
      return NextResponse.json(
        {
          ok: false,
          message: "Diese Anfrage wurde bereits geschlossen.",
        },
        { status: 409 },
      );
    }

    const body = (await request.json()) as {
      supplierNote?: unknown;
      items?: Array<{
        id?: unknown;
        availabilityStatus?: unknown;
        availableQuantity?: unknown;
        leadTimeDays?: unknown;
        availableFrom?: unknown;
        reservationUntil?: unknown;
        supplierNote?: unknown;
      }>;
    };

    const updates = Array.isArray(body.items) ? body.items : [];

    const validItemIds = new Set(result.items.map((item) => item.id));

    for (const rawUpdate of updates) {
      const itemId = clean(rawUpdate.id);
      const availabilityStatus = clean(rawUpdate.availabilityStatus);

      if (
        !itemId ||
        !validItemIds.has(itemId) ||
        !ALLOWED_STATUSES.has(availabilityStatus)
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

      const { error: updateError } = await supabaseServer
        .from("book_supplier_inquiry_items")
        .update({
          availability_status: availabilityStatus,
          available_quantity: nullableNumber(rawUpdate.availableQuantity),
          lead_time_days: nullableNumber(rawUpdate.leadTimeDays),
          available_from: nullableDate(rawUpdate.availableFrom),
          reservation_until: nullableDate(rawUpdate.reservationUntil),
          supplier_note: clean(rawUpdate.supplierNote) || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", itemId)
        .eq("inquiry_id", result.inquiry.id);

      if (updateError) {
        throw new Error(
          `Rückmeldung konnte nicht gespeichert werden: ${updateError.message}`,
        );
      }
    }

    const { data: refreshedItems, error: refreshError } = await supabaseServer
      .from("book_supplier_inquiry_items")
      .select("*")
      .eq("inquiry_id", result.inquiry.id)
      .order("sort_order", {
        ascending: true,
      });

    if (refreshError) {
      throw new Error(
        `Gespeicherte Rückmeldung konnte nicht erneut geladen werden: ${refreshError.message}`,
      );
    }

    const answeredCount = (refreshedItems || []).filter(
      (item) => item.availability_status !== "pending",
    ).length;

    const allAnswered =
      (refreshedItems || []).length > 0 &&
      answeredCount === (refreshedItems || []).length;

    const nextStatus =
      answeredCount === 0
        ? result.inquiry.sent_at
          ? "sent"
          : "draft"
        : allAnswered
          ? "answered"
          : "partially_answered";

    const now = new Date().toISOString();

    const { error: inquiryUpdateError } = await supabaseServer
      .from("book_supplier_inquiries")
      .update({
        status: nextStatus,
        supplier_note: clean(body.supplierNote) || null,
        first_answered_at:
          result.inquiry.first_answered_at || (answeredCount > 0 ? now : null),
        answered_at: allAnswered ? now : null,
        updated_at: now,
      })
      .eq("id", result.inquiry.id);

    if (inquiryUpdateError) {
      throw new Error(
        `Anfragestatus konnte nicht gespeichert werden: ${inquiryUpdateError.message}`,
      );
    }

    await supabaseServer.from("book_supplier_events").insert({
      inquiry_id: result.inquiry.id,
      event_type: "supplier_response_saved",
      title: "Verfügbarkeit aktualisiert",
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
      await sendBookSupplierResponseNotification({
        partner: result.partner,
        inquiry: result.inquiry,
        items: refreshedItems || [],
      });
    } catch (mailError) {
      console.error("Book supplier response notification failed:", mailError);
    }

    return NextResponse.json({
      ok: true,
      message: allAnswered
        ? "Vielen Dank. Die Verfügbarkeit wurde vollständig gespeichert."
        : "Die Rückmeldung wurde gespeichert. Offene Positionen können später ergänzt werden.",
      status: nextStatus,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Die Rückmeldung konnte nicht gespeichert werden.",
      },
      { status: 500 },
    );
  }
}
