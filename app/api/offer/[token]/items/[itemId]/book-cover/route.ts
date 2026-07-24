import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import {
  BOOK_COVER_NAME,
  BOOK_COVER_UNIT_PRICE,
  normalizeBookCommerceQuantity,
  normalizeBookIsbn13,
  roundBookCommerceMoney,
} from "@/lib/bookCommerce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    token: string;
    itemId: string;
  }>;
};

type RequestBody = {
  selected?: boolean | null;
};

type SchoolRequestRow = {
  id: string;
  request_number: string | null;
  status: string | null;
  offer_status: string | null;
};

type OfferItemRow = {
  id: string;
  request_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number | string | null;

  is_book_snapshot: boolean | null;
  book_isbn13_snapshot: string | null;

  book_cover_selected: boolean | null;
  book_cover_unit_price: number | string | null;
};

type ProductRow = {
  id: string;
  is_book: boolean | null;
  book_isbn13: string | null;
  ean: string | null;
};

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase-Umgebungsvariablen fehlen. Prüfe NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function cleanString(value: unknown) {
  return String(value ?? "").trim();
}

async function readBodySafely(
  request: NextRequest,
): Promise<RequestBody> {
  try {
    const rawText = await request.text();

    if (!rawText.trim()) {
      return {};
    }

    return JSON.parse(rawText) as RequestBody;
  } catch {
    return {};
  }
}

function isRequestConfirmed(requestRow: SchoolRequestRow) {
  return (
    requestRow.status === "confirmed" ||
    requestRow.offer_status === "confirmed"
  );
}

function isProductBook(product: ProductRow | null) {
  if (!product) {
    return false;
  }

  if (product.is_book === true) {
    return true;
  }

  return Boolean(
    normalizeBookIsbn13(product.book_isbn13) ||
      normalizeBookIsbn13(product.ean),
  );
}

function getProductIsbn13(product: ProductRow | null) {
  if (!product) {
    return null;
  }

  return (
    normalizeBookIsbn13(product.book_isbn13) ||
    normalizeBookIsbn13(product.ean) ||
    null
  );
}

async function insertRequestEvent(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  requestId: string;
  eventType: string;
  title: string;
  description: string;
  metadata: Record<string, unknown>;
}) {
  const {
    supabase,
    requestId,
    eventType,
    title,
    description,
    metadata,
  } = params;

  const createdAt = new Date().toISOString();

  const payloads = [
    {
      request_id: requestId,
      event_type: eventType,
      title,
      message: description,
      description,
      metadata,
      created_at: createdAt,
    },
    {
      request_id: requestId,
      event_type: eventType,
      message: description,
      metadata,
      created_at: createdAt,
    },
    {
      request_id: requestId,
      type: eventType,
      message: description,
      created_at: createdAt,
    },
  ];

  for (const payload of payloads) {
    const { error } = await supabase
      .from("school_request_events")
      .insert(payload);

    if (!error) {
      return;
    }
  }
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext,
) {
  try {
    const { token, itemId } = await context.params;

    const offerToken = cleanString(token);
    const offerItemId = cleanString(itemId);

    if (!offerToken || !offerItemId) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Paketwunsch oder Paketposition wurde nicht vollständig übergeben.",
        },
        { status: 400 },
      );
    }

    const body = await readBodySafely(request);

    if (typeof body.selected !== "boolean") {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Bitte übermittle, ob die passende Buchhülle ausgewählt werden soll.",
        },
        { status: 400 },
      );
    }

    const selected = body.selected;
    const supabase = getSupabaseAdmin();

    const { data: requestData, error: requestError } =
      await supabase
        .from("school_requests")
        .select("id, request_number, status, offer_status")
        .eq("offer_token", offerToken)
        .maybeSingle();

    if (requestError) {
      return NextResponse.json(
        {
          ok: false,
          message: `Der Paketwunsch konnte nicht geladen werden: ${requestError.message}`,
        },
        { status: 500 },
      );
    }

    if (!requestData) {
      return NextResponse.json(
        {
          ok: false,
          message: "Der Paketwunsch wurde nicht gefunden.",
        },
        { status: 404 },
      );
    }

    const requestRow =
      requestData as unknown as SchoolRequestRow;

    if (isRequestConfirmed(requestRow)) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Die Bestellung wurde bereits verbindlich abgeschlossen. Die Buchhüllen-Auswahl kann danach nicht mehr geändert werden.",
        },
        { status: 409 },
      );
    }

    const { data: offerItemData, error: offerItemError } =
      await supabase
        .from("school_offer_items")
        .select(
          [
            "id",
            "request_id",
            "product_id",
            "product_name",
            "quantity",
            "is_book_snapshot",
            "book_isbn13_snapshot",
            "book_cover_selected",
            "book_cover_unit_price",
          ].join(", "),
        )
        .eq("id", offerItemId)
        .eq("request_id", requestRow.id)
        .maybeSingle();

    if (offerItemError) {
      return NextResponse.json(
        {
          ok: false,
          message: `Die Paketposition konnte nicht geladen werden: ${offerItemError.message}`,
        },
        { status: 500 },
      );
    }

    if (!offerItemData) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Diese Paketposition gehört nicht zu diesem Paketwunsch.",
        },
        { status: 404 },
      );
    }

    const offerItem =
      offerItemData as unknown as OfferItemRow;

    let product: ProductRow | null = null;

    if (offerItem.product_id) {
      const { data: productData, error: productError } =
        await supabase
          .from("school_products")
          .select("id, is_book, book_isbn13, ean")
          .eq("id", offerItem.product_id)
          .maybeSingle();

      if (productError) {
        return NextResponse.json(
          {
            ok: false,
            message: `Die Buchdaten konnten nicht geladen werden: ${productError.message}`,
          },
          { status: 500 },
        );
      }

      product = productData
        ? (productData as unknown as ProductRow)
        : null;
    }

    const snapshotIsbn13 = normalizeBookIsbn13(
      offerItem.book_isbn13_snapshot,
    );

    const productIsbn13 = getProductIsbn13(product);

    const isBook =
      offerItem.is_book_snapshot === true ||
      Boolean(snapshotIsbn13) ||
      isProductBook(product);

    if (!isBook) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Für diese Paketposition kann keine Buchhülle ausgewählt werden, weil sie nicht als Buch erkannt wurde.",
        },
        { status: 409 },
      );
    }

    const bookIsbn13 =
      snapshotIsbn13 || productIsbn13 || null;

    const quantity = normalizeBookCommerceQuantity(
      offerItem.quantity,
    );

    const bookCoverUnitPrice = selected
      ? BOOK_COVER_UNIT_PRICE
      : 0;

    const bookCoverTotalPrice = selected
      ? roundBookCommerceMoney(
          quantity * BOOK_COVER_UNIT_PRICE,
        )
      : 0;

    const now = new Date().toISOString();

    const { data: updatedItemData, error: updateError } =
      await supabase
        .from("school_offer_items")
        .update({
          is_book_snapshot: true,
          book_isbn13_snapshot: bookIsbn13,
          book_cover_selected: selected,
          book_cover_unit_price: bookCoverUnitPrice,
          updated_at: now,
        })
        .eq("id", offerItem.id)
        .eq("request_id", requestRow.id)
        .select(
          [
            "id",
            "product_name",
            "quantity",
            "is_book_snapshot",
            "book_isbn13_snapshot",
            "book_cover_selected",
            "book_cover_unit_price",
          ].join(", "),
        )
        .single();

    if (updateError || !updatedItemData) {
      return NextResponse.json(
        {
          ok: false,
          message:
            updateError?.message ||
            "Die Buchhüllen-Auswahl konnte nicht gespeichert werden.",
        },
        { status: 500 },
      );
    }

    const description = selected
      ? `${BOOK_COVER_NAME} wurde für ${quantity} Exemplar(e) von „${offerItem.product_name}“ ausgewählt.`
      : `${BOOK_COVER_NAME} wurde für „${offerItem.product_name}“ abgewählt.`;

    await insertRequestEvent({
      supabase,
      requestId: requestRow.id,
      eventType: selected
        ? "customer_book_cover_selected"
        : "customer_book_cover_removed",
      title: selected
        ? "Buchhülle ausgewählt"
        : "Buchhülle abgewählt",
      description,
      metadata: {
        request_number: requestRow.request_number,
        offer_item_id: offerItem.id,
        product_id: offerItem.product_id,
        product_name: offerItem.product_name,
        book_isbn13: bookIsbn13,
        quantity,
        book_cover_selected: selected,
        book_cover_unit_price: bookCoverUnitPrice,
        book_cover_total_price: bookCoverTotalPrice,
      },
    });

    return NextResponse.json({
      ok: true,
      item: updatedItemData,
      bookCover: {
        selected,
        name: BOOK_COVER_NAME,
        quantity: selected ? quantity : 0,
        unitPrice: bookCoverUnitPrice,
        totalPrice: bookCoverTotalPrice,
      },
      message: selected
        ? `${BOOK_COVER_NAME} wurde hinzugefügt.`
        : `${BOOK_COVER_NAME} wurde entfernt.`,
    });
  } catch (error) {
    console.error("Customer book cover selection error:", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Die Buchhüllen-Auswahl konnte nicht gespeichert werden.",
      },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json(
    {
      ok: false,
      message: "Diese Route kann nur per PATCH genutzt werden.",
    },
    { status: 405 },
  );
}