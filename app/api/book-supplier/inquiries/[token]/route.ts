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

const ALLOWED_PRICE_STATUSES = new Set([
  "pending",
  "confirmed",
  "changed",
]);

type Params = {
  params: Promise<{
    token: string;
  }>;
};

type RawItemUpdate = {
  id?: unknown;
  availabilityStatus?: unknown;
  availableQuantity?: unknown;
  leadTimeDays?: unknown;
  availableFrom?: unknown;
  reservationUntil?: unknown;
  supplierNote?: unknown;
  priceConfirmationStatus?: unknown;
  confirmedPriceGross?: unknown;
  confirmedTaxRate?: unknown;
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

function nullablePrice(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(String(value).replace(",", "."));

  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 5000) {
    return null;
  }

  return Math.round(parsed * 100) / 100;
}

function nullableTaxRate(value: unknown): 7 | 19 | null {
  if (Number(value) === 7) return 7;
  if (Number(value) === 19) return 19;
  return null;
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

function resolvePriceDecision(
  item: Record<string, unknown>,
  rawUpdate: RawItemUpdate,
) {
  const status = clean(rawUpdate.priceConfirmationStatus);

  if (!ALLOWED_PRICE_STATUSES.has(status)) {
    throw new Error(
      `Für „${clean(item.title)}“ wurde kein gültiger Preisprüfstatus übermittelt.`,
    );
  }

  if (status === "pending") {
    return {
      status: "pending" as const,
      confirmedPrice: null,
      confirmedTaxRate: null,
    };
  }

  const proposedPrice = nullablePrice(item.proposed_price_gross);
  const proposedTaxRate = nullableTaxRate(item.proposed_tax_rate);

  if (status === "confirmed") {
    if (proposedPrice === null || proposedTaxRate === null) {
      throw new Error(
        `Der Preisvorschlag für „${clean(item.title)}“ ist unvollständig. Bitte wählen Sie „Preis/USt. ändern“.`,
      );
    }

    return {
      status: "confirmed" as const,
      confirmedPrice: proposedPrice,
      confirmedTaxRate: proposedTaxRate,
    };
  }

  const confirmedPrice = nullablePrice(rawUpdate.confirmedPriceGross);
  const confirmedTaxRate = nullableTaxRate(rawUpdate.confirmedTaxRate);

  if (confirmedPrice === null || confirmedTaxRate === null) {
    throw new Error(
      `Bitte tragen Sie für „${clean(item.title)}“ einen gültigen Bruttopreis und Umsatzsteuersatz ein.`,
    );
  }

  return {
    status: "changed" as const,
    confirmedPrice,
    confirmedTaxRate,
  };
}

async function applyPriceToLinkedProduct(params: {
  item: Record<string, unknown>;
  price: number;
  taxRate: 7 | 19;
  status: "confirmed" | "changed";
  supplierId: string;
  now: string;
}) {
  const linkedProductId = clean(params.item.linked_product_id);

  if (!linkedProductId) {
    return null;
  }

  const { error } = await supabaseServer
    .from("school_products")
    .update({
      price: params.price,
      tax_rate: params.taxRate,
      book_price_confirmation_status: params.status,
      book_price_confirmed_at: params.now,
      book_price_confirmed_by_supplier_id: params.supplierId,
      book_price_last_checked_at: params.now,
      updated_at: params.now,
    })
    .eq("id", linkedProductId);

  if (error) {
    throw new Error(
      `Preis für das verknüpfte Produkt „${clean(params.item.title)}“ konnte nicht aktualisiert werden: ${error.message}`,
    );
  }

  return params.now;
}

export async function GET(_request: Request, context: Params) {
  try {
    const { token } = await context.params;
    const result = await loadInquiry(token);

    if (!result) {
      return NextResponse.json(
        {
          ok: false,
          message: "Die Buchanfrage wurde nicht gefunden.",
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
            : "Die Buchanfrage konnte nicht geladen werden.",
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
          message: "Die Buchanfrage wurde nicht gefunden.",
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
      complete?: unknown;
      items?: RawItemUpdate[];
    };

    const updates = Array.isArray(body.items) ? body.items : [];
    const completeRequested = body.complete === true;
    const validItems = new Map(
      result.items.map((item) => [item.id, item as Record<string, unknown>]),
    );
    const rawUpdatesById = new Map<string, RawItemUpdate>();

    for (const rawUpdate of updates) {
      const itemId = clean(rawUpdate.id);
      const availabilityStatus = clean(rawUpdate.availabilityStatus);

      if (
        !itemId ||
        !validItems.has(itemId) ||
        !ALLOWED_STATUSES.has(availabilityStatus)
      ) {
        return NextResponse.json(
          {
            ok: false,
            message:
              "Mindestens eine Rückmeldung enthält eine ungültige Position oder einen ungültigen Verfügbarkeitsstatus.",
          },
          { status: 400 },
        );
      }

      rawUpdatesById.set(itemId, rawUpdate);
    }

    if (completeRequested && rawUpdatesById.size !== result.items.length) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Zum vollständigen Abschluss müssen alle Buchpositionen übermittelt werden.",
        },
        { status: 400 },
      );
    }

    const preparedUpdates = updates.map((rawUpdate) => {
      const itemId = clean(rawUpdate.id);
      const item = validItems.get(itemId);

      if (!item) {
        throw new Error("Eine Buchposition konnte nicht zugeordnet werden.");
      }

      const availabilityStatus = clean(rawUpdate.availabilityStatus);
      const priceDecision = resolvePriceDecision(item, rawUpdate);

      if (completeRequested && availabilityStatus === "pending") {
        throw new Error(
          `Bitte beantworten Sie die Verfügbarkeit für „${clean(item.title)}“.`,
        );
      }

      if (completeRequested && priceDecision.status === "pending") {
        throw new Error(
          `Bitte bestätigen oder ändern Sie Preis und Umsatzsteuer für „${clean(item.title)}“.`,
        );
      }

      return {
        itemId,
        item,
        rawUpdate,
        availabilityStatus,
        priceDecision,
      };
    });

    const now = new Date().toISOString();

    for (const prepared of preparedUpdates) {
      let appliedAt: string | null = null;

      if (
        prepared.priceDecision.status === "confirmed" ||
        prepared.priceDecision.status === "changed"
      ) {
        appliedAt = await applyPriceToLinkedProduct({
          item: prepared.item,
          price: prepared.priceDecision.confirmedPrice,
          taxRate: prepared.priceDecision.confirmedTaxRate,
          status: prepared.priceDecision.status,
          supplierId: result.partner.id,
          now,
        });
      }

      const { error: updateError } = await supabaseServer
        .from("book_supplier_inquiry_items")
        .update({
          availability_status: prepared.availabilityStatus,
          available_quantity: nullableNumber(
            prepared.rawUpdate.availableQuantity,
          ),
          lead_time_days: nullableNumber(prepared.rawUpdate.leadTimeDays),
          available_from: nullableDate(prepared.rawUpdate.availableFrom),
          reservation_until: nullableDate(
            prepared.rawUpdate.reservationUntil,
          ),
          supplier_note: clean(prepared.rawUpdate.supplierNote) || null,
          price_confirmation_status: prepared.priceDecision.status,
          confirmed_price_gross: prepared.priceDecision.confirmedPrice,
          confirmed_tax_rate: prepared.priceDecision.confirmedTaxRate,
          price_confirmed_at:
            prepared.priceDecision.status === "pending" ? null : now,
          price_applied_to_product_at: appliedAt,
          updated_at: now,
        })
        .eq("id", prepared.itemId)
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

    const finalItems = refreshedItems || [];
    const availabilityAnsweredCount = finalItems.filter(
      (item) => item.availability_status !== "pending",
    ).length;
    const priceAnsweredCount = finalItems.filter(
      (item) =>
        item.price_confirmation_status === "confirmed" ||
        item.price_confirmation_status === "changed",
    ).length;

    const allCompleted =
      finalItems.length > 0 &&
      availabilityAnsweredCount === finalItems.length &&
      priceAnsweredCount === finalItems.length;

    if (completeRequested && !allCompleted) {
      throw new Error(
        "Die Anfrage konnte nicht abgeschlossen werden, weil mindestens eine Verfügbarkeits- oder Preisprüfung offen ist.",
      );
    }

    const hasProgress =
      availabilityAnsweredCount > 0 || priceAnsweredCount > 0;

    const nextStatus = allCompleted
      ? "answered"
      : hasProgress
        ? "partially_answered"
        : result.inquiry.sent_at
          ? "sent"
          : "draft";

    const { error: inquiryUpdateError } = await supabaseServer
      .from("book_supplier_inquiries")
      .update({
        status: nextStatus,
        supplier_note: clean(body.supplierNote) || null,
        first_answered_at:
          result.inquiry.first_answered_at || (hasProgress ? now : null),
        answered_at: allCompleted ? now : null,
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
      title: allCompleted
        ? "Buchanfrage vollständig beantwortet"
        : "Zwischenstand gespeichert",
      description: `${availabilityAnsweredCount} von ${finalItems.length} Verfügbarkeiten und ${priceAnsweredCount} von ${finalItems.length} Preis-/USt.-Prüfungen wurden beantwortet.`,
      metadata: {
        availability_answered_count: availabilityAnsweredCount,
        price_answered_count: priceAnsweredCount,
        item_count: finalItems.length,
        status: nextStatus,
        complete: allCompleted,
      },
    });

    try {
      await sendBookSupplierResponseNotification({
        partner: result.partner,
        inquiry: result.inquiry,
        items: finalItems,
      });
    } catch (mailError) {
      console.error("Book supplier response notification failed:", mailError);
    }

    return NextResponse.json({
      ok: true,
      message: allCompleted
        ? "Vielen Dank. Verfügbarkeit, Preis und Umsatzsteuer wurden vollständig gespeichert."
        : "Der Zwischenstand wurde gespeichert. Offene Positionen können später ergänzt werden.",
      status: nextStatus,
      complete: allCompleted,
      items: finalItems,
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
