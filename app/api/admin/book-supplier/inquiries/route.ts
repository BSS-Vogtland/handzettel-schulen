import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import { sendBookSupplierInquiryMail } from "@/lib/bookSupplierMail";
import { supabaseServer } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

function toPositivePrice(value: unknown) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const parsed = Number(
    String(value).replace(",", "."),
  );

  if (
    !Number.isFinite(parsed) ||
    parsed <= 0 ||
    parsed > 5000
  ) {
    return null;
  }

  return Math.round(parsed * 100) / 100;
}

function toTaxRate(value: unknown): 7 | 19 {
  return Number(value) === 19 ? 19 : 7;
}

async function loadPartner(
  requestedPartnerId: string,
) {
  if (requestedPartnerId) {
    const { data, error } = await supabaseServer
      .from("book_supplier_partners")
      .select("*")
      .eq("id", requestedPartnerId)
      .eq("is_active", true)
      .maybeSingle();

    if (error) {
      throw new Error(
        `Buchhandelspartner konnte nicht geladen werden: ${error.message}`,
      );
    }

    if (!data) {
      throw new Error(
        "Der ausgewÃ¤hlte Buchhandelspartner wurde nicht gefunden oder ist deaktiviert.",
      );
    }

    return data;
  }

  /*
   * RÃ¼ckwÃ¤rtskompatibilitÃ¤t:
   * Existiert genau ein aktiver Partner, darf eine Ã¤ltere
   * OberflÃ¤che noch ohne partnerId arbeiten.
   */
  const { data, error } = await supabaseServer
    .from("book_supplier_partners")
    .select("*")
    .eq("is_active", true)
    .order("name", {
      ascending: true,
    })
    .limit(2);

  if (error) {
    throw new Error(
      `Buchhandelspartner konnten nicht geladen werden: ${error.message}`,
    );
  }

  if (!data || data.length === 0) {
    throw new Error(
      "Es ist noch kein aktiver Buchhandelspartner angelegt.",
    );
  }

  if (data.length > 1) {
    throw new Error(
      "WÃ¤hle den Buchhandelspartner fÃ¼r diese Sammelanfrage aus.",
    );
  }

  return data[0];
}

async function nextInquiryNumber() {
  const { data, error } = await supabaseServer.rpc(
    "next_book_supplier_inquiry_number",
  );

  if (
    !error &&
    typeof data === "string" &&
    data.trim()
  ) {
    return data.trim();
  }

  return `VB-${new Date().getFullYear()}-${Date.now()
    .toString()
    .slice(-8)}`;
}

async function findBookProduct(isbn: string) {
  const { data, error } = await supabaseServer
    .from("school_products")
    .select(
      "id,ean,price,tax_rate,is_book,book_isbn10,book_isbn13,book_price_source,book_price_confirmation_status",
    )
    .or(
      `ean.eq.${isbn},book_isbn10.eq.${isbn},book_isbn13.eq.${isbn}`,
    )
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(
      `ProduktverknÃ¼pfung fÃ¼r ISBN ${isbn} fehlgeschlagen: ${error.message}`,
    );
  }

  return data || null;
}

export async function GET() {
  const unauthorized =
    await requireAdminApiSession();

  if (unauthorized) {
    return unauthorized;
  }

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
      {
        status: 500,
      },
    );
  }
}

export async function POST(request: Request) {
  const unauthorized =
    await requireAdminApiSession();

  if (unauthorized) {
    return unauthorized;
  }

  let createdInquiryId: string | null = null;

  try {
    const body = (await request.json()) as {
      partnerId?: unknown;
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
        proposedPriceGross?: unknown;
        proposedTaxRate?: unknown;
        priceSource?: unknown;
        linkedProductId?: unknown;
      }>;
    };

    const rawItems = Array.isArray(body.items)
      ? body.items
      : [];

    if (rawItems.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "FÃ¼ge zuerst mindestens ein Buch zur Sammelanfrage hinzu.",
        },
        {
          status: 400,
        },
      );
    }

    if (rawItems.length > 100) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Eine Sammelanfrage darf hÃ¶chstens 100 ISBNs enthalten.",
        },
        {
          status: 400,
        },
      );
    }

    const partner = await loadPartner(
      clean(body.partnerId),
    );

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
        linked_product_id: string | null;
        proposed_price_gross: number | null;
        proposed_tax_rate: 7 | 19;
        price_source: string | null;
        price_confirmation_status: "pending";
        confirmed_price_gross: null;
        confirmed_tax_rate: null;
        price_confirmed_at: null;
        price_applied_to_product_at: null;
      }
    >();

    for (const rawItem of rawItems) {
      const isbn = normalizeIsbn(rawItem.isbn);
      const title = clean(rawItem.title);

      if (
        (isbn.length !== 10 &&
          isbn.length !== 13) ||
        !title
      ) {
        return NextResponse.json(
          {
            ok: false,
            message:
              "Mindestens eine Buchposition enthÃ¤lt keine gÃ¼ltige ISBN oder keinen Titel.",
          },
          {
            status: 400,
          },
        );
      }

      const quantity = toQuantity(
        rawItem.quantity,
      );

      const existing = byIsbn.get(isbn);

      if (existing) {
        existing.requested_quantity = Math.min(
          999,
          existing.requested_quantity +
            quantity,
        );

        continue;
      }

      const product =
        await findBookProduct(isbn);

      const productPrice = toPositivePrice(
        product?.price,
      );

      const clientPrice = toPositivePrice(
        rawItem.proposedPriceGross,
      );

      const proposedPrice =
        productPrice ?? clientPrice;

      const proposedTaxRate = product
        ? toTaxRate(product.tax_rate)
        : toTaxRate(
            rawItem.proposedTaxRate,
          );

      byIsbn.set(isbn, {
        isbn,
        title,
        subtitle:
          clean(rawItem.subtitle) || null,
        authors: Array.isArray(
          rawItem.authors,
        )
          ? rawItem.authors
              .map(clean)
              .filter(Boolean)
          : [],
        publisher:
          clean(rawItem.publisher) || null,
        published_date:
          clean(rawItem.publishedDate) ||
          null,
        cover_url:
          clean(rawItem.coverUrl) || null,
        requested_quantity: quantity,
        linked_product_id:
          product?.id || null,
        proposed_price_gross:
          proposedPrice,
        proposed_tax_rate:
          proposedTaxRate,
        price_source:
          clean(
            product?.book_price_source,
          ) ||
          clean(rawItem.priceSource) ||
          (proposedPrice
            ? "Admin-Vorschlag"
            : null),
        price_confirmation_status:
          "pending",
        confirmed_price_gross: null,
        confirmed_tax_rate: null,
        price_confirmed_at: null,
        price_applied_to_product_at:
          null,
      });
    }

    const inquiryNumber =
      await nextInquiryNumber();

    const adminNote = clean(
      body.adminNote,
    );

    const sendNow =
      body.sendNow === true;

    if (
      sendNow &&
      !clean(partner.email)
    ) {
      return NextResponse.json(
        {
          ok: false,
          message: `FÃ¼r ${partner.name} ist noch keine E-Mail-Adresse hinterlegt.`,
        },
        {
          status: 400,
        },
      );
    }

    const {
      data: inquiry,
      error: inquiryError,
    } = await supabaseServer
      .from("book_supplier_inquiries")
      .insert({
        inquiry_number: inquiryNumber,
        supplier_id: partner.id,
        status: "draft",
        admin_note:
          adminNote || null,
      })
      .select("*")
      .single();

    if (inquiryError || !inquiry) {
      throw new Error(
        `Sammelanfrage konnte nicht angelegt werden: ${
          inquiryError?.message ||
          "unbekannter Fehler"
        }`,
      );
    }

    createdInquiryId = inquiry.id;

    const rows = Array.from(
      byIsbn.values(),
    ).map((item, index) => ({
      inquiry_id: inquiry.id,
      sort_order: index + 1,
      ...item,
    }));

    const { error: itemsError } =
      await supabaseServer
        .from(
          "book_supplier_inquiry_items",
        )
        .insert(rows);

    if (itemsError) {
      throw new Error(
        `Buchpositionen konnten nicht gespeichert werden: ${itemsError.message}`,
      );
    }

    await supabaseServer
      .from("book_supplier_events")
      .insert({
        inquiry_id: inquiry.id,
        event_type:
          "inquiry_created",
        title:
          "Sammelanfrage erstellt",
        description: `${rows.length} ISBN-Positionen fÃ¼r ${partner.name} wurden mit Preis- und SteuerprÃ¼fung erfasst.`,
        metadata: {
          supplier_id: partner.id,
          supplier_name: partner.name,
          item_count: rows.length,
          total_quantity: rows.reduce(
            (sum, item) =>
              sum +
              item.requested_quantity,
            0,
          ),
          linked_product_count:
            rows.filter(
              (item) =>
                item.linked_product_id,
            ).length,
          proposed_price_count:
            rows.filter(
              (item) =>
                item.proposed_price_gross !==
                null,
            ).length,
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

        const now =
          new Date().toISOString();

        const { error: updateError } =
          await supabaseServer
            .from(
              "book_supplier_inquiries",
            )
            .update({
              status: "sent",
              sent_at: now,
              sent_to_email:
                partner.email,
              updated_at: now,
            })
            .eq("id", inquiry.id);

        if (updateError) {
          throw new Error(
            `Versandstatus konnte nicht gespeichert werden: ${updateError.message}`,
          );
        }

        await supabaseServer
          .from("book_supplier_events")
          .insert({
            inquiry_id: inquiry.id,
            event_type:
              "inquiry_sent",
            title:
              "Buchanfrage gesendet",
            description: `Die Anfrage wurde an ${partner.name} (${partner.email}) gesendet.`,
            metadata: {
              supplier_id: partner.id,
              supplier_name:
                partner.name,
              recipient:
                partner.email,
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
        ? `Die Anfrage ${inquiryNumber} wurde fÃ¼r ${partner.name} erstellt und versendet.`
        : `Die Anfrage ${inquiryNumber} wurde fÃ¼r ${partner.name} gespeichert.`,
      inquiry: {
        id: inquiry.id,
        inquiryNumber,
        partnerId: partner.id,
        partnerName: partner.name,
      },
    });
  } catch (error) {
    if (createdInquiryId) {
      await supabaseServer
        .from(
          "book_supplier_inquiries",
        )
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
      {
        status: 500,
      },
    );
  }
}
