import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import {
  calculateBookCommerceSummary,
  calculateBookCommerceTotal,
  getBookCommerceLineSnapshot,
  roundBookCommerceMoney,
  toBookCommerceNumber,
} from "@/lib/bookCommerce";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import {
  createBankTransferSnapshot,
  getBankTransferSnapshotState,
} from "@/app/lib/paymentSettings";
import {
  createSellerSnapshot,
  getSellerSnapshotState,
} from "@/app/lib/sellerSettings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type RequestRow = {
  id: string;
  request_number: string | null;
  status: string | null;
  offer_status: string | null;

  customer_name: string | null;
  email: string | null;
  phone: string | null;

  child_name: string | null;
  school_name: string | null;
  class_name: string | null;

  fulfillment_method: string | null;
  pickup_location_label: string | null;
  pickup_address_snapshot: string | null;
};

type OfferItemRow = {
  id: string;
  request_id: string;
  request_item_id: string | null;
  match_id: string | null;

  product_id: string | null;
  product_name: string;
  product_sku: string | null;
  product_price: number | string | null;

  quantity: number | string | null;
  unit: string | null;

  source: string | null;
  notes: string | null;

  is_book_snapshot: boolean | null;
  book_isbn13_snapshot: string | null;

  book_cover_selected: boolean | null;
  book_cover_unit_price: number | string | null;
};

type ProductBookRow = {
  id: string;
  is_book: boolean | null;
  book_isbn13: string | null;
  ean: string | null;
};

type InvoiceRow = {
  id: string;
  invoice_number: string | null;
  invoice_status: string | null;
  payment_status: string | null;
  bank_account_holder_snapshot: string | null;
  bank_name_snapshot: string | null;
  bank_iban_snapshot: string | null;
  bank_bic_snapshot: string | null;
  seller_snapshot_version: string | null;
  seller_legal_name_snapshot: string | null;
  seller_trade_name_snapshot: string | null;
  seller_owner_name_snapshot: string | null;
  seller_street_snapshot: string | null;
  seller_postal_code_snapshot: string | null;
  seller_city_snapshot: string | null;
  seller_country_snapshot: string | null;
  seller_tax_number_snapshot: string | null;
  seller_vat_id_snapshot: string | null;
  seller_email_snapshot: string | null;
  seller_phone_snapshot: string | null;
  seller_website_snapshot: string | null;
};

type RequestBody = {
  shippingAmount?: number | string | null;
  adminNote?: string | null;
};

function getSupabaseAdmin() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase-Umgebungsvariablen fehlen. Prüfe NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return createClient(
    supabaseUrl,
    serviceRoleKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}

function toNumber(
  value: unknown,
  fallback = 0,
) {
  return toBookCommerceNumber(
    value,
    fallback,
  );
}

function roundMoney(value: number) {
  return roundBookCommerceMoney(value);
}

async function readBodySafely(
  request: NextRequest,
): Promise<RequestBody> {
  try {
    const text = await request.text();

    if (!text.trim()) {
      return {};
    }

    return JSON.parse(text) as RequestBody;
  } catch {
    return {};
  }
}

async function insertRequestEvent(params: {
  supabase: ReturnType<
    typeof getSupabaseAdmin
  >;

  requestId: string;
  message: string;

  invoiceId?: string | null;
  invoiceNumber?: string | null;

  subtotalAmount?: number;
  shippingAmount?: number;

  containsBooks?: boolean;
  bookShippingAmount?: number;
  bookCoverAmount?: number;

  totalAmount?: number;
}) {
  const {
    supabase,
    requestId,
    message,

    invoiceId,
    invoiceNumber,

    subtotalAmount,
    shippingAmount,

    containsBooks,
    bookShippingAmount,
    bookCoverAmount,

    totalAmount,
  } = params;

  const now = new Date().toISOString();

  const metadata = {
    invoice_id: invoiceId,
    invoice_number: invoiceNumber,

    subtotal_amount: subtotalAmount,
    shipping_amount: shippingAmount,

    contains_books:
      containsBooks === true,

    book_shipping_amount:
      bookShippingAmount || 0,

    book_cover_amount:
      bookCoverAmount || 0,

    total_amount: totalAmount,
  };

  const payloads = [
    {
      request_id: requestId,
      event_type:
        "invoice_draft_created",

      title: "Rechnung vorbereitet",
      message,
      description: message,

      metadata,
      created_at: now,
    },
    {
      request_id: requestId,
      event_type:
        "invoice_draft_created",

      message,
      metadata,
      created_at: now,
    },
    {
      request_id: requestId,
      event_type:
        "invoice_draft_created",

      message,
      created_at: now,
    },
    {
      request_id: requestId,
      type: "invoice_draft_created",
      message,
      created_at: now,
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

async function getInvoiceNumber(
  supabase: ReturnType<
    typeof getSupabaseAdmin
  >,
): Promise<string> {
  const { data, error } =
    await supabase.rpc(
      "generate_school_invoice_number",
    );

  if (
    !error &&
    typeof data === "string" &&
    data.trim().length > 0
  ) {
    return data;
  }

  const year =
    new Date().getFullYear();

  const random = Math.floor(
    Math.random() * 99999,
  )
    .toString()
    .padStart(5, "0");

  return `HSR-${year}-${random}`;
}

export async function POST(
  request: NextRequest,
  context: RouteContext,
) {
  const unauthorized =
    await requireAdminApiSession();

  if (unauthorized) {
    return unauthorized;
  }

  try {
    const { id } = await context.params;

    const requestId = String(
      id || "",
    ).trim();

    if (!requestId) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Ungültige Anfrage-ID.",
        },
        { status: 400 },
      );
    }

    const body =
      await readBodySafely(request);

    const shippingAmount =
      roundMoney(
        toNumber(
          body.shippingAmount,
          0,
        ),
      );

    const adminNote =
      String(
        body.adminNote || "",
      ).trim() || null;

    if (shippingAmount < 0) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Versandkosten dürfen nicht negativ sein.",
        },
        { status: 400 },
      );
    }

    const supabase =
      getSupabaseAdmin();

    const {
      data: requestData,
      error: requestError,
    } = await supabase
      .from("school_requests")
      .select(
        [
          "id",
          "request_number",
          "status",
          "offer_status",

          "customer_name",
          "email",
          "phone",

          "child_name",
          "school_name",
          "class_name",

          "fulfillment_method",
          "pickup_location_label",
          "pickup_address_snapshot",
        ].join(", "),
      )
      .eq("id", requestId)
      .maybeSingle();

    if (
      requestError ||
      !requestData
    ) {
      return NextResponse.json(
        {
          ok: false,
          message:
            requestError?.message ||
            "Die Anfrage wurde nicht gefunden.",
        },
        {
          status: requestError
            ? 500
            : 404,
        },
      );
    }

    const requestRow =
      requestData as unknown as RequestRow;

    const isConfirmed =
      requestRow.status === "confirmed" ||
      requestRow.offer_status ===
        "confirmed";

    if (!isConfirmed) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Eine Rechnung kann erst vorbereitet werden, wenn das Angebot bestätigt wurde.",
        },
        { status: 409 },
      );
    }

    const {
      data: offerItemsData,
      error: offerItemsError,
    } = await supabase
      .from("school_offer_items")
      .select(
        [
          "id",
          "request_id",
          "request_item_id",
          "match_id",

          "product_id",
          "product_name",
          "product_sku",
          "product_price",

          "quantity",
          "unit",

          "source",
          "notes",

          "is_book_snapshot",
          "book_isbn13_snapshot",

          "book_cover_selected",
          "book_cover_unit_price",
        ].join(", "),
      )
      .eq("request_id", requestId)
      .order(
        "created_at",
        { ascending: true },
      );

    if (offerItemsError) {
      return NextResponse.json(
        {
          ok: false,
          message:
            `Paketpositionen konnten nicht geladen werden: ${offerItemsError.message}`,
        },
        { status: 500 },
      );
    }

    const offerItems =
      (offerItemsData ||
        []) as unknown as OfferItemRow[];

    if (offerItems.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Es gibt noch keine Paketpositionen. Eine Rechnung kann erst mit Positionen vorbereitet werden.",
        },
        { status: 409 },
      );
    }

    const productIds =
      Array.from(
        new Set(
          offerItems
            .map(
              (item) =>
                item.product_id,
            )
            .filter(
              (
                productId,
              ): productId is string =>
                Boolean(productId),
            ),
        ),
      );

    const productBookById =
      new Map<
        string,
        ProductBookRow
      >();

    if (productIds.length > 0) {
      const {
        data: productData,
        error: productError,
      } = await supabase
        .from("school_products")
        .select(
          "id, is_book, book_isbn13, ean",
        )
        .in("id", productIds);

      if (productError) {
        return NextResponse.json(
          {
            ok: false,
            message:
              `Buchinformationen konnten nicht geladen werden: ${productError.message}`,
          },
          { status: 500 },
        );
      }

      for (
        const product of
          (productData ||
            []) as unknown as ProductBookRow[]
      ) {
        productBookById.set(
          product.id,
          product,
        );
      }
    }

    const bookCommerceLineByOfferItemId =
      new Map(
        offerItems.map((item) => {
          const product =
            item.product_id
              ? productBookById.get(
                  item.product_id,
                ) || null
              : null;

          return [
            item.id,
            {
              quantity: item.quantity,

              is_book_snapshot:
                item.is_book_snapshot,

              book_isbn13_snapshot:
                item.book_isbn13_snapshot,

              is_book:
                product?.is_book ??
                null,

              book_isbn13:
                product?.book_isbn13 ||
                product?.ean ||
                null,

              book_cover_selected:
                item.book_cover_selected,

              book_cover_unit_price:
                item.book_cover_unit_price,
            },
          ] as const;
        }),
      );

    const subtotalAmount =
      roundMoney(
        offerItems.reduce(
          (sum, item) => {
            return (
              sum +
              toNumber(
                item.quantity,
                1,
              ) *
                toNumber(
                  item.product_price,
                  0,
                )
            );
          },
          0,
        ),
      );

    const bookSummary =
      calculateBookCommerceSummary(
        Array.from(
          bookCommerceLineByOfferItemId.values(),
        ),
        requestRow.fulfillment_method,
      );

    const totalAmount =
      calculateBookCommerceTotal({
        subtotalAmount,

        regularShippingAmount:
          shippingAmount,

        bookSummary,
      });

    const {
      data: latestDraftData,
      error: latestActiveInvoiceError,
    } = await supabase
      .from("school_request_invoices")
      .select(
        [
          "id",
          "invoice_number",
          "invoice_status",
          "payment_status",
          "bank_account_holder_snapshot",
          "bank_name_snapshot",
          "bank_iban_snapshot",
          "bank_bic_snapshot",
          "seller_snapshot_version",
          "seller_legal_name_snapshot",
          "seller_trade_name_snapshot",
          "seller_owner_name_snapshot",
          "seller_street_snapshot",
          "seller_postal_code_snapshot",
          "seller_city_snapshot",
          "seller_country_snapshot",
          "seller_tax_number_snapshot",
          "seller_vat_id_snapshot",
          "seller_email_snapshot",
          "seller_phone_snapshot",
          "seller_website_snapshot",
        ].join(", "),
      )
      .eq("request_id", requestId)
      .in(
        "invoice_status",
        ["draft", "sent"],
      )
      .order(
        "created_at",
        { ascending: false },
      )
      .limit(1)
      .maybeSingle();

    if (latestActiveInvoiceError) {
      return NextResponse.json(
        {
          ok: false,
          code:
            "ACTIVE_INVOICE_LOOKUP_FAILED",
          message:
            "Bestehende Rechnung konnte nicht geprüft werden: " +
              latestActiveInvoiceError.message,
        },
        { status: 500 },
      );
    }

    const latestDraft =
      latestDraftData as unknown as
        | InvoiceRow
        | null;

    let invoiceId: string;
    let invoiceNumber:
      | string
      | null;

    const invoiceSnapshot = {
      subtotal_amount:
        subtotalAmount,

      shipping_amount:
        shippingAmount,

      contains_books:
        bookSummary.containsBooks,

      book_shipping_amount:
        bookSummary.bookShippingAmount,

      book_cover_amount:
        bookSummary.bookCoverAmount,

      total_amount: totalAmount,
      currency: "EUR",

      selected_payment_method:
        "paypal",

      payment_status:
        "not_selected",

      payment_provider:
        "paypal",

      customer_name_snapshot:
        requestRow.customer_name,

      customer_email_snapshot:
        requestRow.email,

      customer_phone_snapshot:
        requestRow.phone,

      child_name_snapshot:
        requestRow.child_name,

      school_name_snapshot:
        requestRow.school_name,

      class_name_snapshot:
        requestRow.class_name,

      fulfillment_method_snapshot:
        requestRow.fulfillment_method,

      pickup_location_label_snapshot:
        requestRow.pickup_location_label,

      pickup_address_snapshot:
        requestRow.pickup_address_snapshot,

      admin_note: adminNote,
    };

    /*
     * ADMIN_INVOICE_DUPLICATE_GUARD_V3
     *
     * Nur ein echter, noch nicht verwendeter Entwurf darf
     * aktualisiert werden. Versandte Rechnungen und Rechnungen
     * mit begonnenem oder abgeschlossenem Zahlungsvorgang sind
     * unveränderlich.
     */
    const existingInvoicePaymentStatus =
      String(
        latestDraft?.payment_status || "",
      ).trim();

    const existingInvoiceCanBeUpdated =
      latestDraft?.invoice_status ===
        "draft" &&
      (
        existingInvoicePaymentStatus ===
          "" ||
        existingInvoicePaymentStatus ===
          "not_selected"
      );

    if (
      latestDraft?.id &&
      !existingInvoiceCanBeUpdated
    ) {
      return NextResponse.json(
        {
          ok: false,
          code:
            "ACTIVE_INVOICE_ALREADY_EXISTS",
          message:
            "Für diese Anfrage existiert bereits eine aktive, versandte oder im Zahlungsvorgang befindliche Rechnung. Sie darf nicht durch einen neuen Rechnungsentwurf ersetzt werden.",
          invoice: {
            id: latestDraft.id,
            invoiceNumber:
              latestDraft.invoice_number,
            invoiceStatus:
              latestDraft.invoice_status,
            paymentStatus:
              latestDraft.payment_status,
          },
        },
        { status: 409 },
      );
    }

    if (latestDraft?.id) {
      const bankSnapshotState = getBankTransferSnapshotState(latestDraft);
      if (bankSnapshotState !== "complete") {
        return NextResponse.json(
          {
            ok: false,
            code: bankSnapshotState === "incomplete"
              ? "BANK_TRANSFER_SNAPSHOT_INCOMPLETE"
              : "BANK_TRANSFER_SNAPSHOT_MISSING",
            message: "Der bestehende Rechnungsentwurf besitzt keinen vollständigen Bankverbindungs-Snapshot und wird nicht automatisch nachgerüstet.",
          },
          { status: 409 },
        );
      }
      const sellerSnapshotState = getSellerSnapshotState(latestDraft);
      if (sellerSnapshotState !== "complete") {
        return NextResponse.json(
          {
            ok: false,
            code: sellerSnapshotState === "incomplete"
              ? "SELLER_SNAPSHOT_INCOMPLETE"
              : "SELLER_SNAPSHOT_MISSING",
            message: "Der bestehende Rechnungsentwurf besitzt keinen vollständigen Verkäufer-Snapshot und wird nicht automatisch nachgerüstet.",
          },
          { status: 409 },
        );
      }
      invoiceId =
        latestDraft.id;

      invoiceNumber =
        latestDraft.invoice_number;

      const {
        error: updateInvoiceError,
      } = await supabase
        .from(
          "school_request_invoices",
        )
        .update({
          ...invoiceSnapshot,
          updated_at:
            new Date().toISOString(),
        })
        .eq("id", invoiceId);

      if (updateInvoiceError) {
        return NextResponse.json(
          {
            ok: false,
            message:
              `Rechnung konnte nicht aktualisiert werden: ${updateInvoiceError.message}`,
          },
          { status: 500 },
        );
      }

      const {
        error: deleteItemsError,
      } = await supabase
        .from(
          "school_request_invoice_items",
        )
        .delete()
        .eq(
          "invoice_id",
          invoiceId,
        );

      if (deleteItemsError) {
        return NextResponse.json(
          {
            ok: false,
            message:
              `Alte Rechnungspositionen konnten nicht ersetzt werden: ${deleteItemsError.message}`,
          },
          { status: 500 },
        );
      }
    } else {
      invoiceNumber =
        await getInvoiceNumber(
          supabase,
        );

      const {
        data: invoiceData,
        error: invoiceError,
      } = await supabase
        .from(
          "school_request_invoices",
        )
        .insert({
          request_id: requestId,
          invoice_number:
            invoiceNumber,

          invoice_status:
            "draft",

          ...invoiceSnapshot,
          ...createBankTransferSnapshot(),
          ...createSellerSnapshot(),
          bank_payment_purpose_snapshot:
            invoiceNumber,
        })
        .select(
          [
            "id",
            "invoice_number",
            "invoice_status",
            "payment_status",
          ].join(", "),
        )
        .single();

      /*
       * ADMIN_INVOICE_UNIQUE_CONFLICT_GUARD_V3
       *
       * Der partielle Unique-Index verhindert parallele aktive
       * Rechnungen. Eine Kollision wird als kontrollierter
       * Konflikt statt als allgemeiner Serverfehler beantwortet.
       */
      if (invoiceError?.code === "23505") {
        return NextResponse.json(
          {
            ok: false,
            code: "INVOICE_CONFLICT",
            message:
              "Für diese Anfrage existiert bereits eine aktive Rechnung oder die Rechnungsnummer wurde zwischenzeitlich vergeben. Bitte lade die Anfrage neu.",
          },
          { status: 409 },
        );
      }

      if (
        invoiceError ||
        !invoiceData
      ) {
        return NextResponse.json(
          {
            ok: false,
            message:
              invoiceError?.message ||
              "Die Rechnung konnte nicht vorbereitet werden.",
          },
          { status: 500 },
        );
      }

      const createdInvoice =
        invoiceData as unknown as InvoiceRow;

      invoiceId =
        createdInvoice.id;

      invoiceNumber =
        createdInvoice.invoice_number;
    }

    const invoiceItems =
      offerItems.map((item) => {
        const quantity =
          toNumber(
            item.quantity,
            1,
          );

        const unitPrice =
          toNumber(
            item.product_price,
            0,
          );

        const totalPrice =
          roundMoney(
            quantity * unitPrice,
          );

        const bookSnapshot =
          getBookCommerceLineSnapshot(
            bookCommerceLineByOfferItemId.get(
              item.id,
            ) || {
              quantity:
                item.quantity,
            },
          );

        return {
          invoice_id: invoiceId,
          request_id: requestId,

          offer_item_id:
            item.id,

          product_id:
            item.product_id,

          product_name:
            item.product_name,

          product_sku:
            item.product_sku,

          quantity,
          unit: item.unit,

          unit_price:
            unitPrice,

          total_price:
            totalPrice,

          is_book_snapshot:
            bookSnapshot.isBookSnapshot,

          book_isbn13_snapshot:
            bookSnapshot.bookIsbn13Snapshot,

          book_cover_selected:
            bookSnapshot.bookCoverSelected,

          book_cover_name_snapshot:
            bookSnapshot.bookCoverNameSnapshot,

          book_cover_quantity:
            bookSnapshot.bookCoverQuantity,

          book_cover_unit_price:
            bookSnapshot.bookCoverUnitPrice,

          book_cover_total_price:
            bookSnapshot.bookCoverTotalPrice,

          source: item.source,
          notes: item.notes,
        };
      });

    const {
      error: insertItemsError,
    } = await supabase
      .from(
        "school_request_invoice_items",
      )
      .insert(invoiceItems);

    if (insertItemsError) {
      return NextResponse.json(
        {
          ok: false,
          message:
            `Rechnungspositionen konnten nicht gespeichert werden: ${insertItemsError.message}`,
        },
        { status: 500 },
      );
    }

    const now =
      new Date().toISOString();

    const {
      error: updateRequestError,
    } = await supabase
      .from("school_requests")
      .update({
        invoice_status: "draft",

        payment_status:
          "not_selected",

        selected_payment_method:
          "paypal",

        latest_invoice_id:
          invoiceId,

        shipping_amount:
          shippingAmount,

        contains_books:
          bookSummary.containsBooks,

        book_shipping_amount:
          bookSummary.bookShippingAmount,

        book_cover_amount:
          bookSummary.bookCoverAmount,

        invoice_total_amount:
          totalAmount,

        updated_at: now,
      })
      .eq("id", requestId);

    if (updateRequestError) {
      return NextResponse.json(
        {
          ok: false,
          message:
            `Anfrage konnte nicht mit Rechnungsstatus aktualisiert werden: ${updateRequestError.message}`,
        },
        { status: 500 },
      );
    }

    await insertRequestEvent({
      supabase,
      requestId,

      invoiceId,
      invoiceNumber,

      subtotalAmount,
      shippingAmount,

      containsBooks:
        bookSummary.containsBooks,

      bookShippingAmount:
        bookSummary.bookShippingAmount,

      bookCoverAmount:
        bookSummary.bookCoverAmount,

      totalAmount,

      message:
        `Rechnung ${
          invoiceNumber || ""
        } wurde vorbereitet. Gesamtbetrag: ${totalAmount.toFixed(
          2,
        )} EUR.`,
    });

    return NextResponse.json({
      ok: true,

      invoiceId,
      invoiceNumber,

      invoiceStatus: "draft",
      paymentStatus:
        "not_selected",

      pricing: {
        subtotalAmount,
        shippingAmount,

        containsBooks:
          bookSummary.containsBooks,

        bookShippingAmount:
          bookSummary.bookShippingAmount,

        bookCoverAmount:
          bookSummary.bookCoverAmount,

        totalAmount,
      },

      totalAmount,

      message:
        `Rechnung ${
          invoiceNumber || ""
        } wurde vorbereitet. Gesamtbetrag: ${totalAmount
          .toFixed(2)
          .replace(".", ",")} €.`,
    });
  } catch (error) {
    console.error(
      "Invoice create error:",
      error,
    );

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Die Rechnung konnte nicht vorbereitet werden.",
      },
      { status: 500 },
    );
  }
}

export async function GET() {
  const unauthorized =
    await requireAdminApiSession();

  if (unauthorized) {
    return unauthorized;
  }

  return NextResponse.json(
    {
      ok: false,
      message:
        "Diese Route kann nur per POST genutzt werden.",
    },
    { status: 405 },
  );
}
