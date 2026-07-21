import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { sendBookSupplierOrderMail } from "@/lib/bookSupplierMail";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function toQuantity(value: unknown) {
  const parsed = Math.trunc(Number(value));

  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.max(0, Math.min(999, parsed));
}

async function nextOrderNumber() {
  const { data, error } = await supabaseServer.rpc(
    "next_book_supplier_order_number",
  );

  if (!error && typeof data === "string" && data.trim()) {
    return data.trim();
  }

  return `VB-A-${new Date().getFullYear()}-${Date.now()
    .toString()
    .slice(-8)}`;
}

async function loadExistingOrder(requestKey: string) {
  const { data, error } = await supabaseServer
    .from("book_supplier_orders")
    .select("id,order_number,sent_at")
    .eq("request_key", requestKey)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Vorhandener Auftrag konnte nicht geprüft werden: ${error.message}`,
    );
  }

  return data;
}

export async function POST(request: Request) {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;

  let createdOrderId: string | null = null;

  try {
    const body = (await request.json()) as {
      requestKey?: unknown;
      inquiryId?: unknown;
      customerReference?: unknown;
      fulfillmentMethod?: unknown;
      adminNote?: unknown;
      paymentConfirmed?: unknown;
      sendNow?: unknown;
      items?: Array<{
        inquiryItemId?: unknown;
        quantity?: unknown;
      }>;
    };

    const requestKey = clean(body.requestKey);
    const inquiryId = clean(body.inquiryId);
    const customerReference = clean(body.customerReference);
    const adminNote = clean(body.adminNote);
    const fulfillmentMethod =
      clean(body.fulfillmentMethod) === "delivery"
        ? "delivery"
        : "pickup";
    const paymentConfirmed = body.paymentConfirmed === true;
    const sendNow = body.sendNow === true;

    if (!isUuid(requestKey)) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Der sichere Auftragsvorgang ist ungültig. Lade die Seite neu.",
        },
        { status: 400 },
      );
    }

    if (!isUuid(inquiryId)) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Die Verfügbarkeitsanfrage ist ungültig.",
        },
        { status: 400 },
      );
    }

    const existingOrder = await loadExistingOrder(requestKey);

    if (existingOrder) {
      return NextResponse.json({
        ok: true,
        sent: Boolean(existingOrder.sent_at),
        message: `Der Auftrag ${existingOrder.order_number} wurde bereits erstellt.`,
        order: {
          id: existingOrder.id,
          orderNumber: existingOrder.order_number,
        },
      });
    }

    const rawItems = Array.isArray(body.items) ? body.items : [];

    if (rawItems.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Wähle mindestens eine Buchposition für den Auftrag aus.",
        },
        { status: 400 },
      );
    }

    if (rawItems.length > 100) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Ein Buchauftrag darf höchstens 100 Positionen enthalten.",
        },
        { status: 400 },
      );
    }

    if (sendNow && !paymentConfirmed) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Bestätige vor dem Versand, dass Du den Zahlungseingang geprüft hast.",
        },
        { status: 400 },
      );
    }

    const selectedById = new Map<string, number>();

    for (const rawItem of rawItems) {
      const inquiryItemId = clean(rawItem.inquiryItemId);
      const quantity = toQuantity(rawItem.quantity);

      if (!isUuid(inquiryItemId) || quantity < 1) {
        return NextResponse.json(
          {
            ok: false,
            message:
              "Mindestens eine Auftragsposition enthält eine ungültige Auswahl oder Menge.",
          },
          { status: 400 },
        );
      }

      selectedById.set(inquiryItemId, quantity);
    }

    const { data: inquiry, error: inquiryError } =
      await supabaseServer
        .from("book_supplier_inquiries")
        .select("*")
        .eq("id", inquiryId)
        .maybeSingle();

    if (inquiryError) {
      throw new Error(
        `Verfügbarkeitsanfrage konnte nicht geladen werden: ${inquiryError.message}`,
      );
    }

    if (!inquiry) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Die Verfügbarkeitsanfrage wurde nicht gefunden.",
        },
        { status: 404 },
      );
    }

    const [
      { data: partner, error: partnerError },
      { data: inquiryItems, error: itemsError },
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
        .in("id", Array.from(selectedById.keys())),
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

    if (
      !inquiryItems ||
      inquiryItems.length !== selectedById.size
    ) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Mindestens eine ausgewählte Buchposition gehört nicht zu dieser Anfrage.",
        },
        { status: 400 },
      );
    }

    if (sendNow && !clean(partner.email)) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Bei der Vogtländischen Buchhandlung ist noch keine E-Mail-Adresse hinterlegt.",
        },
        { status: 400 },
      );
    }

    const orderNumber = await nextOrderNumber();
    const now = new Date().toISOString();

    const { data: order, error: orderError } =
      await supabaseServer
        .from("book_supplier_orders")
        .insert({
          order_number: orderNumber,
          request_key: requestKey,
          supplier_id: partner.id,
          source_inquiry_id: inquiry.id,
          status: "draft",
          customer_reference: customerReference || null,
          fulfillment_method: fulfillmentMethod,
          admin_note: adminNote || null,
          payment_confirmed_by_admin: paymentConfirmed,
          payment_confirmed_at: paymentConfirmed ? now : null,
        })
        .select("*")
        .single();

    if (orderError || !order) {
      if (orderError?.code === "23505") {
        const duplicate = await loadExistingOrder(requestKey);

        if (duplicate) {
          return NextResponse.json({
            ok: true,
            sent: Boolean(duplicate.sent_at),
            message: `Der Auftrag ${duplicate.order_number} wurde bereits erstellt.`,
            order: {
              id: duplicate.id,
              orderNumber: duplicate.order_number,
            },
          });
        }
      }

      throw new Error(
        `Buchauftrag konnte nicht angelegt werden: ${
          orderError?.message || "unbekannter Fehler"
        }`,
      );
    }

    createdOrderId = order.id;

    const sortedItems = [...inquiryItems].sort(
      (left, right) =>
        Number(left.sort_order || 0) -
        Number(right.sort_order || 0),
    );

    const orderItems = sortedItems.map((item, index) => ({
      order_id: order.id,
      inquiry_item_id: item.id,
      sort_order: index + 1,
      isbn: item.isbn,
      title: item.title,
      subtitle: item.subtitle,
      authors: Array.isArray(item.authors) ? item.authors : [],
      publisher: item.publisher,
      cover_url: item.cover_url,
      quantity: selectedById.get(item.id) || 1,
      supplier_status: "pending",
    }));

    const { error: orderItemsError } = await supabaseServer
      .from("book_supplier_order_items")
      .insert(orderItems);

    if (orderItemsError) {
      throw new Error(
        `Auftragspositionen konnten nicht gespeichert werden: ${orderItemsError.message}`,
      );
    }

    await supabaseServer
      .from("book_supplier_order_events")
      .insert({
        order_id: order.id,
        event_type: "order_created",
        title: "Verbindlicher Buchauftrag erstellt",
        description: `${orderItems.length} Positionen mit insgesamt ${orderItems.reduce(
          (sum, item) => sum + item.quantity,
          0,
        )} Exemplaren wurden erfasst.`,
        metadata: {
          source_inquiry_id: inquiry.id,
          source_inquiry_number: inquiry.inquiry_number,
          payment_confirmed: paymentConfirmed,
          item_count: orderItems.length,
        },
      });

    let sent = false;
    let warning: string | null = null;

    if (sendNow) {
      try {
        await sendBookSupplierOrderMail({
          partner,
          order,
          sourceInquiryNumber: inquiry.inquiry_number,
          items: orderItems,
        });

        const sentAt = new Date().toISOString();

        const { error: sentStatusError } =
          await supabaseServer
            .from("book_supplier_orders")
            .update({
              status: "sent",
              sent_at: sentAt,
              sent_to_email: partner.email,
              updated_at: sentAt,
            })
            .eq("id", order.id);

        if (sentStatusError) {
          warning =
            "Die E-Mail wurde versendet, aber der Versandstatus konnte nicht gespeichert werden. Öffne den Auftrag und prüfe den Status.";
        } else {
          await supabaseServer
            .from("book_supplier_order_events")
            .insert({
              order_id: order.id,
              event_type: "order_sent",
              title: "Verbindlicher Buchauftrag gesendet",
              description: `Der Auftrag wurde an ${partner.email} gesendet.`,
              metadata: {
                recipient: partner.email,
              },
            });
        }

        sent = true;
      } catch (mailError) {
        warning =
          mailError instanceof Error
            ? `Der Auftrag wurde gespeichert, aber nicht versendet: ${mailError.message}`
            : "Der Auftrag wurde gespeichert, aber nicht versendet.";
      }
    }

    return NextResponse.json({
      ok: true,
      sent,
      warning,
      message: sent
        ? `Der Auftrag ${orderNumber} wurde verbindlich versendet.`
        : `Der Auftrag ${orderNumber} wurde als Entwurf gespeichert.`,
      order: {
        id: order.id,
        orderNumber,
      },
    });
  } catch (error) {
    if (createdOrderId) {
      await supabaseServer
        .from("book_supplier_orders")
        .delete()
        .eq("id", createdOrderId);
    }

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Der Buchauftrag konnte nicht erstellt werden.",
      },
      { status: 500 },
    );
  }
}
