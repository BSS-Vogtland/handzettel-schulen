import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { sendBookSupplierInquiryMail } from "@/lib/bookSupplierMail";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(_request: Request, context: Params) {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;

  try {
    const { id } = await context.params;

    const { data: inquiry, error: inquiryError } = await supabaseServer
      .from("book_supplier_inquiries")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (inquiryError) {
      throw new Error(
        `Anfrage konnte nicht geladen werden: ${inquiryError.message}`,
      );
    }

    if (!inquiry) {
      return NextResponse.json(
        {
          ok: false,
          message: "Die Sammelanfrage wurde nicht gefunden.",
        },
        { status: 404 },
      );
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

    if (itemsError || !items?.length) {
      throw new Error(
        `Buchpositionen konnten nicht geladen werden: ${
          itemsError?.message || "keine Positionen vorhanden"
        }`,
      );
    }

    await sendBookSupplierInquiryMail({
      partner,
      inquiry,
      items,
    });

    const now = new Date().toISOString();

    const { error: updateError } = await supabaseServer
      .from("book_supplier_inquiries")
      .update({
        status:
          inquiry.status === "answered" ||
          inquiry.status === "partially_answered"
            ? inquiry.status
            : "sent",
        sent_at: now,
        sent_to_email: partner.email,
        updated_at: now,
      })
      .eq("id", inquiry.id);

    if (updateError) {
      throw new Error(
        `Versandstatus konnte nicht gespeichert werden: ${updateError.message}`,
      );
    }

    await supabaseServer.from("book_supplier_events").insert({
      inquiry_id: inquiry.id,
      event_type: inquiry.sent_at ? "inquiry_resent" : "inquiry_sent",
      title: inquiry.sent_at
        ? "Verfügbarkeitsanfrage erneut gesendet"
        : "Verfügbarkeitsanfrage gesendet",
      description: `Die Anfrage wurde an ${partner.email} gesendet.`,
      metadata: {
        recipient: partner.email,
      },
    });

    return NextResponse.json({
      ok: true,
      message: `Die Anfrage ${inquiry.inquiry_number} wurde an ${partner.email} gesendet.`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Die Anfrage konnte nicht versendet werden.",
      },
      { status: 500 },
    );
  }
}
