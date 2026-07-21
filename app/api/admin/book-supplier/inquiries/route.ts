import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { sendBookSupplierInquiryMail } from "@/lib/bookSupplierMail";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PARTNER_SLUG = "vogtlaendische-buchhandlung";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeIsbn(value: unknown) {
  return clean(value)
    .toUpperCase()
    .replace(/[^0-9X]/g, "")
    .slice(0, 13);
}

function toQuantity(value: unknown) {
  const parsed = Math.trunc(Number(value));

  if (!Number.isFinite(parsed)) {
    return 1;
  }

  return Math.max(1, Math.min(999, parsed));
}

async function loadPartner() {
  const { data, error } = await supabaseServer
    .from("book_supplier_partners")
    .select("*")
    .eq("slug", PARTNER_SLUG)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Partnerdaten konnten nicht geladen werden: ${error.message}`,
    );
  }

  if (!data) {
    throw new Error(
      "Die Vogtländische Buchhandlung ist noch nicht als aktiver Partner angelegt.",
    );
  }

  return data;
}

async function nextInquiryNumber() {
  const { data, error } = await supabaseServer.rpc(
    "next_book_supplier_inquiry_number",
  );

  if (!error && typeof data === "string" && data.trim()) {
    return data.trim();
  }

  return `VB-${new Date().getFullYear()}-${Date.now().toString().slice(-8)}`;
}

export async function GET() {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;

  try {
    const { data, error } = await supabaseServer
      .from("book_supplier_inquiries")
      .select("*")
      .order("created_at", {
        ascending: false,
      })
      .limit(250);

    if (error) {
      throw new Error(
        `Anfragen konnten nicht geladen werden: ${error.message}`,
      );
    }

    return NextResponse.json({
      ok: true,
      inquiries: data || [],
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Die Anfragen konnten nicht geladen werden.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;

  let createdInquiryId: string | null = null;

  try {
    const body = (await request.json()) as {
      adminNote?: unknown;
      sendNow?: unknown;
      items?: Array<{
        isbn?: unknown;
        title?: unknown;
        subtitle?: unknown;
        authors?: unknown;
        publisher?: unknown;
        publishedDate?: unknown;
        coverUrl?: unknown;
        quantity?: unknown;
      }>;
    };

    const rawItems = Array.isArray(body.items) ? body.items : [];

    if (rawItems.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          message: "Füge zuerst mindestens ein Buch zur Sammelanfrage hinzu.",
        },
        { status: 400 },
      );
    }

    if (rawItems.length > 100) {
      return NextResponse.json(
        {
          ok: false,
          message: "Eine Sammelanfrage darf höchstens 100 ISBNs enthalten.",
        },
        { status: 400 },
      );
    }

    const partner = await loadPartner();

    const byIsbn = new Map<
      string,
      {
        isbn: string;
        title: string;
        subtitle: string | null;
        authors: string[];
        publisher: string | null;
        published_date: string | null;
        cover_url: string | null;
        requested_quantity: number;
      }
    >();

    for (const rawItem of rawItems) {
      const isbn = normalizeIsbn(rawItem.isbn);
      const title = clean(rawItem.title);

      if ((isbn.length !== 10 && isbn.length !== 13) || !title) {
        return NextResponse.json(
          {
            ok: false,
            message:
              "Mindestens eine Buchposition enthält keine gültige ISBN oder keinen Titel.",
          },
          { status: 400 },
        );
      }

      const quantity = toQuantity(rawItem.quantity);
      const existing = byIsbn.get(isbn);

      if (existing) {
        existing.requested_quantity = Math.min(
          999,
          existing.requested_quantity + quantity,
        );
        continue;
      }

      byIsbn.set(isbn, {
        isbn,
        title,
        subtitle: clean(rawItem.subtitle) || null,
        authors: Array.isArray(rawItem.authors)
          ? rawItem.authors.map(clean).filter(Boolean)
          : [],
        publisher: clean(rawItem.publisher) || null,
        published_date: clean(rawItem.publishedDate) || null,
        cover_url: clean(rawItem.coverUrl) || null,
        requested_quantity: quantity,
      });
    }

    const inquiryNumber = await nextInquiryNumber();
    const adminNote = clean(body.adminNote);
    const sendNow = body.sendNow === true;

    const { data: inquiry, error: inquiryError } = await supabaseServer
      .from("book_supplier_inquiries")
      .insert({
        inquiry_number: inquiryNumber,
        supplier_id: partner.id,
        status: "draft",
        admin_note: adminNote || null,
      })
      .select("*")
      .single();

    if (inquiryError || !inquiry) {
      throw new Error(
        `Sammelanfrage konnte nicht angelegt werden: ${
          inquiryError?.message || "unbekannter Fehler"
        }`,
      );
    }

    createdInquiryId = inquiry.id;

    const rows = Array.from(byIsbn.values()).map((item, index) => ({
      inquiry_id: inquiry.id,
      sort_order: index + 1,
      ...item,
    }));

    const { error: itemsError } = await supabaseServer
      .from("book_supplier_inquiry_items")
      .insert(rows);

    if (itemsError) {
      throw new Error(
        `Buchpositionen konnten nicht gespeichert werden: ${itemsError.message}`,
      );
    }

    await supabaseServer.from("book_supplier_events").insert({
      inquiry_id: inquiry.id,
      event_type: "inquiry_created",
      title: "Sammelanfrage erstellt",
      description: `${rows.length} ISBN-Positionen wurden erfasst.`,
      metadata: {
        item_count: rows.length,
        total_quantity: rows.reduce(
          (sum, item) => sum + item.requested_quantity,
          0,
        ),
      },
    });

    let sent = false;
    let warning: string | null = null;

    if (sendNow) {
      try {
        await sendBookSupplierInquiryMail({
          partner,
          inquiry,
          items: rows,
        });

        const now = new Date().toISOString();

        await supabaseServer
          .from("book_supplier_inquiries")
          .update({
            status: "sent",
            sent_at: now,
            sent_to_email: partner.email,
            updated_at: now,
          })
          .eq("id", inquiry.id);

        await supabaseServer.from("book_supplier_events").insert({
          inquiry_id: inquiry.id,
          event_type: "inquiry_sent",
          title: "Verfügbarkeitsanfrage gesendet",
          description: `Die Anfrage wurde an ${partner.email} gesendet.`,
          metadata: {
            recipient: partner.email,
          },
        });

        sent = true;
      } catch (mailError) {
        warning =
          mailError instanceof Error
            ? `Die Anfrage wurde gespeichert, aber nicht versendet: ${mailError.message}`
            : "Die Anfrage wurde gespeichert, aber nicht versendet.";
      }
    }

    return NextResponse.json({
      ok: true,
      sent,
      warning,
      message: sent
        ? `Die Anfrage ${inquiryNumber} wurde erstellt und versendet.`
        : `Die Anfrage ${inquiryNumber} wurde gespeichert.`,
      inquiry: {
        id: inquiry.id,
        inquiryNumber,
      },
    });
  } catch (error) {
    if (createdInquiryId) {
      await supabaseServer
        .from("book_supplier_inquiries")
        .delete()
        .eq("id", createdInquiryId);
    }

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Die Sammelanfrage konnte nicht erstellt werden.",
      },
      { status: 500 },
    );
  }
}
