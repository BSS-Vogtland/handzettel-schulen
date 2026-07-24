
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { sendRequestInvoiceMail } from "@/app/lib/requestInvoiceMailService";
import {
  calculateBookCommerceSummary,
  calculateBookCommerceTotal,
  getBookCommerceLineSnapshot,
} from "@/lib/bookCommerce";
import { getRequestBlockingState } from "@/lib/requestWorkflowBlocking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    token: string;
  }>;
};

type FulfillmentMethod = "pickup" | "shipping";
type PaymentMethod = "paypal" | "bank_transfer";

type CheckoutBody = {
  customerName?: string | null;
  email?: string | null;
  phone?: string | null;

  billingName?: string | null;
  billingEmail?: string | null;
  billingPhone?: string | null;
  billingStreet?: string | null;
  billingPostalCode?: string | null;
  billingCity?: string | null;

  shippingAddressDiffers?: boolean | null;
  shippingName?: string | null;
  shippingStreet?: string | null;
  shippingPostalCode?: string | null;
  shippingCity?: string | null;

  fulfillmentMethod?: FulfillmentMethod | null;
  paymentMethod?: PaymentMethod | null;
  customerMessage?: string | null;
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
  checkout_override_enabled: boolean | null;
  checkout_override_at: string | null;
  checkout_override_note: string | null;
  checkout_override_by: string | null;
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

type RequestItemRow = {
  id: string;
  status: string | null;
  admin_resolution_status: string | null;
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
  invoice_token: string | null;
  invoice_status: string | null;
  payment_status: string | null;
};

const SHIPPING_AMOUNT = 5.95;

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase Umgebungsvariablen fehlen. Prüfe NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function readBodySafely(request: Request): Promise<CheckoutBody> {
  try {
    const rawText = await request.text();

    if (!rawText.trim()) {
      return {};
    }

    return JSON.parse(rawText) as CheckoutBody;
  } catch {
    return {};
  }
}

function cleanString(value: unknown, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value).trim();
  return text.length > 0 ? text : fallback;
}

function cleanNullableString(value: unknown) {
  const text = cleanString(value);
  return text.length > 0 ? text : null;
}

function toNumber(value: unknown, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

async function getInvoiceNumber(
  supabase: ReturnType<typeof getSupabaseAdmin>
): Promise<string> {
  const { data, error } = await supabase.rpc("generate_school_invoice_number");

  if (!error && typeof data === "string" && data.trim().length > 0) {
    return data;
  }

  const year = new Date().getFullYear();
  const random = Math.floor(Math.random() * 99999)
    .toString()
    .padStart(5, "0");

  return `HSR-${year}-${random}`;
}

async function insertRequestEvent(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  requestId: string;
  eventType: string;
  title: string;
  description: string;
  metadata?: Record<string, unknown>;
}) {
  const { supabase, requestId, eventType, title, description, metadata } = params;
  const createdAt = new Date().toISOString();

  const payloads = [
    {
      request_id: requestId,
      event_type: eventType,
      title,
      message: description,
      description,
      metadata: metadata || null,
      created_at: createdAt,
    },
    {
      request_id: requestId,
      event_type: eventType,
      message: description,
      metadata: metadata || null,
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
    const { error } = await supabase.from("school_request_events").insert(payload);
    if (!error) return;
  }
}

async function sendCustomerInvoiceMailSafely(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  requestId: string;
  invoiceNumber: string | null;
}) {
  const { supabase, requestId, invoiceNumber } = params;

  try {
    const result = await sendRequestInvoiceMail({ requestId });

    if (!result.data.ok) {
      await insertRequestEvent({
        supabase,
        requestId,
        eventType: "customer_invoice_mail_failed",
        title: "Rechnungsmail an Kunde fehlgeschlagen",
        description:
          result.data.message ||
          "Die Rechnungsmail an den Kunden konnte nach dem Handzettel-Checkout nicht automatisch versendet werden.",
      });

      return;
    }

    await insertRequestEvent({
      supabase,
      requestId,
      eventType: "customer_invoice_mail_sent_after_handzettel_checkout",
      title: "Rechnungsmail an Kunde versendet",
      description: `Die Rechnung ${invoiceNumber || ""} wurde nach dem Handzettel-Checkout automatisch an den Kunden versendet.`,
    });
  } catch (error) {
    console.error("Kunden-Rechnungsmail nach Handzettel-Checkout fehlgeschlagen:", error);

    await insertRequestEvent({
      supabase,
      requestId,
      eventType: "customer_invoice_mail_failed",
      title: "Rechnungsmail an Kunde fehlgeschlagen",
      description:
        error instanceof Error
          ? error.message
          : "Die Rechnungsmail an den Kunden konnte nach dem Handzettel-Checkout nicht automatisch versendet werden.",
    });
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { token } = await context.params;
    const offerToken = String(token || "").trim();

    if (!offerToken) {
      return NextResponse.json(
        {
          ok: false,
          message: "Kein Paketwunsch-Token übergeben.",
        },
        { status: 400 }
      );
    }

    const body = await readBodySafely(request);

    const customerName = cleanString(body.customerName);
    const email = cleanString(body.email).toLowerCase();
    const phone = cleanNullableString(body.phone);

    const billingName = cleanString(body.billingName || customerName);
    const billingEmail = cleanString(body.billingEmail || email).toLowerCase();
    const billingPhone = cleanNullableString(body.billingPhone || phone);
    const billingStreet = cleanString(body.billingStreet);
    const billingPostalCode = cleanString(body.billingPostalCode);
    const billingCity = cleanString(body.billingCity);

    const shippingAddressDiffers = Boolean(body.shippingAddressDiffers);
    const shippingName = shippingAddressDiffers
      ? cleanString(body.shippingName)
      : null;
    const shippingStreet = shippingAddressDiffers
      ? cleanString(body.shippingStreet)
      : null;
    const shippingPostalCode = shippingAddressDiffers
      ? cleanString(body.shippingPostalCode)
      : null;
    const shippingCity = shippingAddressDiffers
      ? cleanString(body.shippingCity)
      : null;

    const fulfillmentMethod: FulfillmentMethod =
      body.fulfillmentMethod === "shipping" ? "shipping" : "pickup";

    const paymentMethod: PaymentMethod =
      body.paymentMethod === "bank_transfer" ? "bank_transfer" : "paypal";

    const paymentProvider =
      paymentMethod === "paypal" ? "paypal" : "bank_transfer";

    const customerMessage = cleanNullableString(body.customerMessage);

    if (!customerName) {
      return NextResponse.json(
        {
          ok: false,
          message: "Bitte gib Deinen Namen ein.",
        },
        { status: 400 }
      );
    }

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        {
          ok: false,
          message: "Bitte gib eine gültige E-Mail-Adresse ein.",
        },
        { status: 400 }
      );
    }

    if (!billingName || !billingEmail || !billingEmail.includes("@")) {
      return NextResponse.json(
        {
          ok: false,
          message: "Bitte gib gültige Rechnungsdaten ein.",
        },
        { status: 400 }
      );
    }

    if (!billingStreet || !billingPostalCode || !billingCity) {
      return NextResponse.json(
        {
          ok: false,
          message: "Bitte gib Deine vollständige Rechnungsadresse ein.",
        },
        { status: 400 }
      );
    }

    if (
      shippingAddressDiffers &&
      (!shippingName || !shippingStreet || !shippingPostalCode || !shippingCity)
    ) {
      return NextResponse.json(
        {
          ok: false,
          message: "Bitte gib die vollständige abweichende Lieferadresse ein.",
        },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();

    const { data: requestData, error: requestError } = await supabase
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
          "checkout_override_enabled",
          "checkout_override_at",
          "checkout_override_note",
          "checkout_override_by",
        ].join(", ")
      )
      .eq("offer_token", offerToken)
      .maybeSingle();

    if (requestError || !requestData) {
      return NextResponse.json(
        {
          ok: false,
          message: requestError?.message || "Der Paketwunsch wurde nicht gefunden.",
        },
        { status: 404 }
      );
    }

    const requestRow = requestData as unknown as RequestRow;
    const requestId = requestRow.id;

    const { data: offerItemsData, error: offerItemsError } = await supabase
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
        ].join(", ")
      )
      .eq("request_id", requestId)
      .order("created_at", { ascending: true });

    if (offerItemsError) {
      return NextResponse.json(
        {
          ok: false,
          message: `Paketpositionen konnten nicht geladen werden: ${offerItemsError.message}`,
        },
        { status: 500 }
      );
    }

    const offerItems = (offerItemsData || []) as unknown as OfferItemRow[];

    if (offerItems.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Dein Paketwunsch enthält noch keine Produkte und kann noch nicht bestellt werden.",
        },
        { status: 409 }
      );
    }

    const offerProductIds = Array.from(
      new Set(
        offerItems
          .map((item) => item.product_id)
          .filter((productId): productId is string => Boolean(productId))
      )
    );

    const productBookById = new Map<string, ProductBookRow>();

    if (offerProductIds.length > 0) {
      const { data: productBookData, error: productBookError } =
        await supabase
          .from("school_products")
          .select("id, is_book, book_isbn13, ean")
          .in("id", offerProductIds);

      if (productBookError) {
        return NextResponse.json(
          {
            ok: false,
            message: `Buchinformationen konnten nicht geladen werden: ${productBookError.message}`,
          },
          { status: 500 }
        );
      }

      for (const product of (productBookData || []) as unknown as ProductBookRow[]) {
        productBookById.set(product.id, product);
      }
    }

    const bookCommerceLineByOfferItemId = new Map(
      offerItems.map((item) => {
        const product = item.product_id
          ? productBookById.get(item.product_id) || null
          : null;

        return [
          item.id,
          {
            quantity: item.quantity,

            is_book_snapshot: item.is_book_snapshot,
            book_isbn13_snapshot: item.book_isbn13_snapshot,

            is_book: product?.is_book ?? null,
            book_isbn13:
              product?.book_isbn13 ||
              product?.ean ||
              null,

            book_cover_selected: item.book_cover_selected,
            book_cover_unit_price: item.book_cover_unit_price,
          },
        ] as const;
      })
    );

    const { data: requestItemsData, error: requestItemsError } = await supabase
      .from("school_request_items")
      .select(
        [
          "id",
          "status",
          "admin_resolution_status",
        ].join(", ")
      )
      .eq("request_id", requestId);

    if (requestItemsError) {
      return NextResponse.json(
        {
          ok: false,
          message: `Listenpositionen konnten nicht geprüft werden: ${requestItemsError.message}`,
        },
        { status: 500 }
      );
    }

    const requestItems = ((requestItemsData || []) as unknown) as RequestItemRow[];
    const blockingState = getRequestBlockingState(
      requestItems,
      offerItems,
      requestRow.checkout_override_enabled === true
    );
    const coveredRequestItemIds = blockingState.coveredRequestItemIds;
    const checkoutBlockingRequestItems = blockingState.effectiveBlockingItems;

    if (checkoutBlockingRequestItems.length > 0) {
      await supabase
        .from("school_requests")
        .update({
          status: "manual_review",
          offer_status: "customer_selection",
          updated_at: now,
        })
        .eq("id", requestId);

      await insertRequestEvent({
        supabase,
        requestId,
        eventType: "customer_package_submitted_manual_review",
        title: "Paketwunsch benötigt Prüfung",
        description:
          "Der Kunde wollte den Paketwunsch bestellen, aber es gibt noch offene Listenpositionen. Das Team muss den Paketwunsch prüfen.",
        metadata: {
          open_request_items_count: checkoutBlockingRequestItems.length,
          covered_request_item_ids: Array.from(coveredRequestItemIds),
          checkout_blocking_items: checkoutBlockingRequestItems.map((item) => ({
            id: item.id,
            status: item.status,
            admin_resolution_status: item.admin_resolution_status,
            is_covered_by_offer_item: coveredRequestItemIds.has(item.id),
            is_resolved_for_checkout: false,
          })),
          offer_items_count: offerItems.length,
          request_items_count: requestItems.length,
        },
      });

      return NextResponse.json(
        {
          ok: false,
          message:
            "In Deinem Paketwunsch sind noch offene Positionen. Das Team von Handzettel-Schulen.de prüft diese zuerst. Danach bekommst Du den fertigen Paketwunsch zur finalen Bestellung.",
        },
        { status: 409 }
      );
    }

    if (coveredRequestItemIds.size > 0) {
      const { error: syncSelectedRequestItemsError } = await supabase
        .from("school_request_items")
        .update({
          status: "selected",
          updated_at: now,
        })
        .eq("request_id", requestId)
        .in("id", Array.from(coveredRequestItemIds));

      if (syncSelectedRequestItemsError) {
        console.error(
          "Checkout request item selected sync failed:",
          syncSelectedRequestItemsError
        );
      }
    }

    const shippingAmount =
      fulfillmentMethod === "shipping" ? SHIPPING_AMOUNT : 0;

    const subtotalAmount = roundMoney(
      offerItems.reduce((sum, item) => {
        return (
          sum +
          toNumber(item.quantity, 1) * toNumber(item.product_price, 0)
        );
      }, 0)
    );

    const bookSummary = calculateBookCommerceSummary(
      Array.from(bookCommerceLineByOfferItemId.values()),
      fulfillmentMethod
    );

    const totalAmount = calculateBookCommerceTotal({
      subtotalAmount,
      regularShippingAmount: shippingAmount,
      bookSummary,
    });

    const invoiceNumber = await getInvoiceNumber(supabase);

    const { data: invoiceData, error: invoiceInsertError } = await supabase
      .from("school_request_invoices")
      .insert({
        request_id: requestId,
        invoice_number: invoiceNumber,

        invoice_status: "draft",
        payment_status: "waiting_for_payment",
        selected_payment_method: paymentMethod,
        payment_provider: paymentProvider,

        subtotal_amount: subtotalAmount,
        shipping_amount: shippingAmount,

        contains_books: bookSummary.containsBooks,
        book_shipping_amount: bookSummary.bookShippingAmount,
        book_cover_amount: bookSummary.bookCoverAmount,

        total_amount: totalAmount,
        currency: "EUR",

        customer_name_snapshot: customerName,
        customer_email_snapshot: email,
        customer_phone_snapshot: phone,

        billing_name_snapshot: billingName,
        billing_email_snapshot: billingEmail,
        billing_phone_snapshot: billingPhone,
        billing_street_snapshot: billingStreet,
        billing_postal_code_snapshot: billingPostalCode,
        billing_city_snapshot: billingCity,

        shipping_address_differs_snapshot: shippingAddressDiffers,
        shipping_name_snapshot: shippingAddressDiffers ? shippingName : null,
        shipping_street_snapshot: shippingAddressDiffers ? shippingStreet : null,
        shipping_postal_code_snapshot: shippingAddressDiffers
          ? shippingPostalCode
          : null,
        shipping_city_snapshot: shippingAddressDiffers ? shippingCity : null,

        child_name_snapshot: requestRow.child_name,
        school_name_snapshot: requestRow.school_name,
        class_name_snapshot: requestRow.class_name,

        fulfillment_method_snapshot: fulfillmentMethod,

        admin_note: customerMessage
          ? `Kundenhinweis aus Checkout: ${customerMessage}`
          : null,
      })
      .select("id, invoice_number, invoice_token, invoice_status, payment_status")
      .single();

    if (invoiceInsertError || !invoiceData) {
      return NextResponse.json(
        {
          ok: false,
          message:
            invoiceInsertError?.message ||
            "Die Rechnung konnte nicht erzeugt werden.",
        },
        { status: 500 }
      );
    }

    const invoice = invoiceData as unknown as InvoiceRow;

    if (!invoice.invoice_token) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Die Rechnung wurde erzeugt, aber es wurde kein Rechnungstoken zurückgegeben.",
        },
        { status: 500 }
      );
    }

    const invoiceItems = offerItems.map((item) => {
      const quantity = toNumber(item.quantity, 1);
      const unitPrice = toNumber(item.product_price, 0);
      const totalPrice = roundMoney(quantity * unitPrice);

      const bookSnapshot = getBookCommerceLineSnapshot(
        bookCommerceLineByOfferItemId.get(item.id) || {
          quantity: item.quantity,
        }
      );

      return {
        invoice_id: invoice.id,
        request_id: requestId,

        offer_item_id: item.id,
        product_id: item.product_id,

        product_name: item.product_name,
        product_sku: item.product_sku,

        quantity,
        unit: item.unit,

        unit_price: unitPrice,
        total_price: totalPrice,

        is_book_snapshot: bookSnapshot.isBookSnapshot,
        book_isbn13_snapshot: bookSnapshot.bookIsbn13Snapshot,

        book_cover_selected: bookSnapshot.bookCoverSelected,
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

    const { error: invoiceItemsError } = await supabase
      .from("school_request_invoice_items")
      .insert(invoiceItems);

    if (invoiceItemsError) {
      return NextResponse.json(
        {
          ok: false,
          message: `Rechnungspositionen konnten nicht gespeichert werden: ${invoiceItemsError.message}`,
        },
        { status: 500 }
      );
    }

    const { error: updateRequestError } = await supabase
      .from("school_requests")
      .update({
        status: "confirmed",
        offer_status: "confirmed",

        customer_name: customerName,
        email,
        phone,

        billing_name: billingName,
        billing_email: billingEmail,
        billing_phone: billingPhone,
        billing_street: billingStreet,
        billing_postal_code: billingPostalCode,
        billing_city: billingCity,

        shipping_address_differs: shippingAddressDiffers,
        shipping_name: shippingAddressDiffers ? shippingName : null,
        shipping_street: shippingAddressDiffers ? shippingStreet : null,
        shipping_postal_code: shippingAddressDiffers
          ? shippingPostalCode
          : null,
        shipping_city: shippingAddressDiffers ? shippingCity : null,

        fulfillment_method: fulfillmentMethod,
        fulfillment_status:
          fulfillmentMethod === "shipping"
            ? "shipping_requested"
            : "pickup_requested",
        shipping_cost_status:
          fulfillmentMethod === "shipping"
            ? "flat_rate_applied"
            : "not_required",
        shipping_amount: shippingAmount,

        contains_books: bookSummary.containsBooks,
        book_shipping_amount: bookSummary.bookShippingAmount,
        book_cover_amount: bookSummary.bookCoverAmount,

        cash_on_pickup_allowed: false,

        selected_payment_method: paymentMethod,
        payment_status: "waiting_for_payment",
        invoice_status: "draft",
        latest_invoice_id: invoice.id,
        invoice_total_amount: totalAmount,

        confirmed_at: now,
        updated_at: now,
      })
      .eq("id", requestId);

    if (updateRequestError) {
      return NextResponse.json(
        {
          ok: false,
          message: `Bestellung wurde erzeugt, aber die Anfrage konnte nicht aktualisiert werden: ${updateRequestError.message}`,
        },
        { status: 500 }
      );
    }

    await insertRequestEvent({
      supabase,
      requestId,
      eventType: "handzettel_checkout_ordered",
      title: "Paketwunsch verbindlich bestellt",
      description: `Der Paketwunsch wurde verbindlich bestellt. Rechnung ${invoice.invoice_number || ""}, Gesamtbetrag: ${totalAmount.toFixed(2)} EUR.`,
      metadata: {
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
        invoice_token: invoice.invoice_token,
        subtotal_amount: subtotalAmount,
        shipping_amount: shippingAmount,

        contains_books: bookSummary.containsBooks,
        book_position_count: bookSummary.bookPositionCount,
        book_quantity: bookSummary.bookQuantity,

        book_shipping_amount:
          bookSummary.bookShippingAmount,
        book_cover_position_count:
          bookSummary.bookCoverPositionCount,
        book_cover_quantity:
          bookSummary.bookCoverQuantity,
        book_cover_amount:
          bookSummary.bookCoverAmount,

        total_amount: totalAmount,
        fulfillment_method: fulfillmentMethod,
        payment_method: paymentMethod,
        checkout_override_used:
          requestRow.checkout_override_enabled === true &&
          blockingState.rawBlockingCount > 0,
        checkout_override_raw_blocking_count:
          blockingState.rawBlockingCount,
      },
    });

    await sendCustomerInvoiceMailSafely({
      supabase,
      requestId,
      invoiceNumber: invoice.invoice_number,
    });

    return NextResponse.json({
      ok: true,
      requestId,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number,
      invoiceToken: invoice.invoice_token,
      redirectUrl: `/rechnung/${encodeURIComponent(invoice.invoice_token)}`,

      pricing: {
        subtotalAmount,
        shippingAmount,
        containsBooks: bookSummary.containsBooks,
        bookShippingAmount: bookSummary.bookShippingAmount,
        bookCoverAmount: bookSummary.bookCoverAmount,
        totalAmount,
      },

      message: "Deine Bestellung wurde erstellt.",
    });
  } catch (error) {
    console.error("Handzettel checkout error:", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Die Bestellung konnte nicht abgeschlossen werden.",
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    {
      ok: false,
      message: "Diese Route kann nur per POST genutzt werden.",
    },
    { status: 405 }
  );
}


