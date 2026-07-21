import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { sendBookSupplierOrderMail } from "@/lib/bookSupplierMail";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(
  _request: Request,
  context: Params,
) {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;

  try {
    const { id } = await context.params;

    const { data: order, error: orderError } =
      await supabaseServer
        .from("book_supplier_orders")
        .select("*")
        .eq("id", id)
        .maybeSingle();

    if (orderError) {
      throw new Error(
        `Buchauftrag konnte nicht geladen werden: ${orderError.message}`,
      );
    }

    if (!order) {
      return NextResponse.json(
        {
          ok: false,
          message: "Der Buchauftrag wurde nicht gefunden.",
        },
        { status: 404 },
      );
    }

    if (!order.payment_confirmed_by_admin) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Der Auftrag kann erst nach bestätigter manueller Zahlungsprüfung versendet werden.",
        },
        { status: 409 },
      );
    }

    if (["completed", "cancelled"].includes(order.status)) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Dieser Auftrag ist bereits abgeschlossen oder abgebrochen.",
        },
        { status: 409 },
      );
    }

    const [
      { data: inquiry, error: inquiryError },
      { data: partner, error: partnerError },
      { data: items, error: itemsError },
    ] = await Promise.all([
      supabaseServer
        .from("book_supplier_inquiries")
        .select("*")
        .eq("id", order.source_inquiry_id)
        .maybeSingle(),
      supabaseServer
        .from("book_supplier_partners")
        .select("*")
        .eq("id", order.supplier_id)
        .maybeSingle(),
      supabaseServer
        .from("book_supplier_order_items")
        .select("*")
        .eq("order_id", order.id)
        .order("sort_order", {
          ascending: true,
        }),
    ]);

    if (inquiryError || !inquiry) {
      throw new Error(
        `Verfügbarkeitsanfrage konnte nicht geladen werden: ${
          inquiryError?.message || "Anfrage fehlt"
        }`,
      );
    }

    if (partnerError || !partner) {
      throw new Error(
        `Buchhandlung konnte nicht geladen werden: ${
          partnerError?.message || "Partner fehlt"
        }`,
      );
    }

    if (itemsError || !items?.length) {
      throw new Error(
        `Auftragspositionen konnten nicht geladen werden: ${
          itemsError?.message || "keine Positionen vorhanden"
        }`,
      );
    }

    await sendBookSupplierOrderMail({
      partner,
      order,
      sourceInquiryNumber: inquiry.inquiry_number,
      items,
    });

    const now = new Date().toISOString();
    const preservedStatuses = new Set([
      "accepted",
      "partially_accepted",
      "unavailable",
      "ready",
    ]);

    const { error: updateError } = await supabaseServer
      .from("book_supplier_orders")
      .update({
        status: preservedStatuses.has(order.status)
          ? order.status
          : "sent",
        sent_at: now,
        sent_to_email: partner.email,
        updated_at: now,
      })
      .eq("id", order.id);

    if (updateError) {
      throw new Error(
        `Versandstatus konnte nicht gespeichert werden: ${updateError.message}`,
      );
    }

    await supabaseServer
      .from("book_supplier_order_events")
      .insert({
        order_id: order.id,
        event_type: order.sent_at
          ? "order_resent"
          : "order_sent",
        title: order.sent_at
          ? "Buchauftrag erneut gesendet"
          : "Buchauftrag gesendet",
        description: `Der Auftrag wurde an ${partner.email} gesendet.`,
        metadata: {
          recipient: partner.email,
        },
      });

    return NextResponse.json({
      ok: true,
      message: `Der Auftrag ${order.order_number} wurde an ${partner.email} gesendet.`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Der Buchauftrag konnte nicht versendet werden.",
      },
      { status: 500 },
    );
  }
}
