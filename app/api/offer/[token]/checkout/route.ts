import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { sendRequestInvoiceMail } from "@/app/lib/requestInvoiceMailService";
import {
  calculateBookCommerceSummary,
  calculateBookCommerceTotal,
  getBookCommerceLineSnapshot,
} from "@/lib/bookCommerce";
import {
  buildCheckoutInvoiceTaxSnapshot,
} from "@/lib/invoiceTaxCheckoutAdapter";
import {
  resolveInvoiceTaxCutover,
} from "@/lib/invoiceTaxCutover";
import {
  buildInvoiceTaxSnapshotV2,
  type InvoiceTaxSnapshotV2EntryInput,
} from "@/lib/tax-v2";
import {
  getCheckoutMaintenanceDecision,
  resolveCheckoutMaintenanceAccess,
} from "@/lib/checkoutMaintenance";
import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import { createBankTransferSnapshot } from "@/app/lib/paymentSettings";
import { createSellerSnapshot } from "@/app/lib/sellerSettings";
import {
  CHECKOUT_MAINTENANCE_TEST_CONFIRMATION,
  CHECKOUT_MAINTENANCE_TEST_HEADER,
  CHECKOUT_TEST_PERMIT_HEADER,
  consumeCheckoutTestPermit,
  isCheckoutTestRequestSameOrigin,
  readCheckoutMaintenanceTestInput,
} from "@/lib/checkoutTestPermits";
import { getRequestBlockingState } from "@/lib/requestWorkflowBlocking";
import { stageNativeLexwareCheckoutInvoice } from "@/app/lib/lexware/lexwareNativeCheckoutStaging";
import {
  isPayPalPaymentsEnabled,
  PAYPAL_DISABLED_CODE,
  PAYPAL_DISABLED_MESSAGE,
} from "@/app/lib/paypalPaymentsGate";

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
  tax_rate: number | string | null;
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

type InvoiceCutoverSettingsRow = {
  timezone_name: string;
  invoice_cutover_at: string;
  invoice_provider_before: string;
  invoice_provider_after: string;
  invoice_cutover_version: string;
};

const SHIPPING_AMOUNT = 5.95;

/*
 * Separat berechnete Buchhüllen sind keine Bücher.
 *
 * Bis eine eigene Katalog- oder Konfigurationsquelle besteht,
 * werden sie ausdrücklich mit dem deutschen Regelsteuersatz
 * behandelt.
 *
 * Diese Policy entspricht der bereits im Checkout-Preview
 * verwendeten und validierten Steuerregel.
 */
const BOOK_COVER_TAX_RATE = 19 as const;

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase Umgebungsvariablen fehlen. Prüfe NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY.",
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
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value).trim();

  return text.length > 0 ? text : fallback;
}

function cleanNullableString(value: unknown) {
  const text = cleanString(value);

  return text.length > 0 ? text : null;
}

function toNumber(value: unknown, fallback = 0) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return fallback;
  }

  if (typeof value === "number") {
    return Number.isFinite(value)
      ? value
      : fallback;
  }

  const parsed = Number(
    String(value).replace(",", "."),
  );

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

function roundMoney(value: number) {
  return (
    Math.round(
      (value + Number.EPSILON) * 100,
    ) / 100
  );
}

async function getInvoiceNumber(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  checkoutNowDate: Date,
): Promise<string> {
  const { data, error } = await supabase.rpc(
    "generate_school_invoice_number",
  );

  if (
    !error &&
    typeof data === "string" &&
    data.trim().length > 0
  ) {
    return data;
  }

  const year = checkoutNowDate.getFullYear();

  const random = Math.floor(
    Math.random() * 99999,
  )
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
  createdAt?: string;
}) {
  const {
    supabase,
    requestId,
    eventType,
    title,
    description,
    metadata,
    createdAt:
      providedCreatedAt,
  } = params;

  const createdAt =
    providedCreatedAt ||
    new Date().toISOString();

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
    const { error } = await supabase
      .from("school_request_events")
      .insert(payload);

    if (!error) {
      return;
    }
  }
}

async function sendCustomerInvoiceMailSafely(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  requestId: string;
  invoiceNumber: string | null;
  createdAt: string;
}) {
  const {
    supabase,
    requestId,
    invoiceNumber,
    createdAt,
  } = params;

  try {
    const result =
      await sendRequestInvoiceMail({
        requestId,
      });

    if (!result.data.ok) {
      await insertRequestEvent({
        supabase,
        requestId,
        eventType:
          "customer_invoice_mail_failed",
        title:
          "Rechnungsmail an Kunde fehlgeschlagen",
        description:
          result.data.message ||
          "Die Rechnungsmail an den Kunden konnte nach dem Handzettel-Checkout nicht automatisch versendet werden.",
        createdAt,
      });

      return;
    }

    await insertRequestEvent({
      supabase,
      requestId,
      eventType:
        "customer_invoice_mail_sent_after_handzettel_checkout",
      title:
        "Rechnungsmail an Kunde versendet",
      description:
        `Die Rechnung ${invoiceNumber || ""} wurde nach dem Handzettel-Checkout automatisch an den Kunden versendet.`,
      createdAt,
    });
  } catch (error) {
    console.error(
      "Kunden-Rechnungsmail nach Handzettel-Checkout fehlgeschlagen:",
      error,
    );

    await insertRequestEvent({
      supabase,
      requestId,
      eventType:
        "customer_invoice_mail_failed",
      title:
        "Rechnungsmail an Kunde fehlgeschlagen",
      description:
        error instanceof Error
          ? error.message
          : "Die Rechnungsmail an den Kunden konnte nach dem Handzettel-Checkout nicht automatisch versendet werden.",
      createdAt,
    });
  }
}

async function loadInvoiceCutoverSettings(
  supabase: ReturnType<typeof getSupabaseAdmin>,
) {
  const {
    data,
    error,
  } = await supabase
    .from(
      "business_runtime_settings",
    )
    .select(
      [
        "timezone_name",
        "invoice_cutover_at",
        "invoice_provider_before",
        "invoice_provider_after",
        "invoice_cutover_version",
      ].join(", "),
    )
    .eq(
      "id",
      "default",
    )
    .maybeSingle();

  if (error) {
    throw new Error(
      `Rechnungs-Cutover-Konfiguration konnte nicht geladen werden: ${error.message}`,
    );
  }

  if (!data) {
    throw new Error(
      "business_runtime_settings/default fehlt.",
    );
  }

  return data as unknown as
    InvoiceCutoverSettingsRow;
}

export async function POST(
  request: Request,
  context: RouteContext,
) {
  const checkoutMaintenance =
    getCheckoutMaintenanceDecision();

  const unauthorized = checkoutMaintenance.active
    ? await requireAdminApiSession()
    : null;
  const { token } = await context.params;
  const routeOfferToken = String(token || "");
  const offerToken = routeOfferToken.trim();
  const sameOrigin =
    checkoutMaintenance.active && isCheckoutTestRequestSameOrigin(request);
  const maintenanceTestHeader = checkoutMaintenance.active
    ? request.headers.get(CHECKOUT_MAINTENANCE_TEST_HEADER)
    : null;
  const permitToken = checkoutMaintenance.active
    ? request.headers.get(CHECKOUT_TEST_PERMIT_HEADER)
    : null;
  const shouldReadConfirmation =
    checkoutMaintenance.active &&
    unauthorized === null &&
    sameOrigin &&
    maintenanceTestHeader === "true" &&
    Boolean(permitToken);
  const testInput = shouldReadConfirmation
    ? await readCheckoutMaintenanceTestInput(request)
    : { confirmation: null };
  const maintenanceAccess = await resolveCheckoutMaintenanceAccess({
    adminAuthenticated: checkoutMaintenance.active && unauthorized === null,
    sameOrigin,
    maintenanceTestHeader,
    confirmation: testInput.confirmation,
    permitToken,
    expectedConfirmation: CHECKOUT_MAINTENANCE_TEST_CONFIRMATION,
    consumePermit: () =>
      consumeCheckoutTestPermit({
        permitToken: permitToken || "",
        checkoutType: "offer",
        targetReference: routeOfferToken,
      }),
    maintenanceActive: checkoutMaintenance.active,
  });

  if (checkoutMaintenance.active && !maintenanceAccess.bypassAllowed) {
    return NextResponse.json(
      {
        ok: false,
        code: checkoutMaintenance.code,
        maintenance: true,
        message: checkoutMaintenance.message,
      },
      {
        status: checkoutMaintenance.httpStatus,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  const checkoutNowDate = new Date();
  const now = checkoutNowDate.toISOString();
  const maintenanceTestEventMetadata = maintenanceAccess.isAdminTest
    ? {
        maintenance_test_bypass: true,
        maintenance_test_permit_id: maintenanceAccess.permitId,
        maintenance_test_actor: "admin",
        maintenance_test_at: now,
        maintenance_test_checkout_type: "offer",
      }
    : {};

  try {
    if (!offerToken) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Kein Paketwunsch-Token übergeben.",
        },
        {
          status: 400,
        },
      );
    }

    const body =
      await readBodySafely(request);

    const customerName =
      cleanString(body.customerName);

    const email =
      cleanString(body.email)
        .toLowerCase();

    const phone =
      cleanNullableString(body.phone);

    const billingName =
      cleanString(
        body.billingName ||
          customerName,
      );

    const billingEmail =
      cleanString(
        body.billingEmail ||
          email,
      ).toLowerCase();

    const billingPhone =
      cleanNullableString(
        body.billingPhone ||
          phone,
      );

    const billingStreet =
      cleanString(
        body.billingStreet,
      );

    const billingPostalCode =
      cleanString(
        body.billingPostalCode,
      );

    const billingCity =
      cleanString(
        body.billingCity,
      );

    const shippingAddressDiffers =
      Boolean(
        body.shippingAddressDiffers,
      );

    const shippingName =
      shippingAddressDiffers
        ? cleanString(
            body.shippingName,
          )
        : null;

    const shippingStreet =
      shippingAddressDiffers
        ? cleanString(
            body.shippingStreet,
          )
        : null;

    const shippingPostalCode =
      shippingAddressDiffers
        ? cleanString(
            body.shippingPostalCode,
          )
        : null;

    const shippingCity =
      shippingAddressDiffers
        ? cleanString(
            body.shippingCity,
          )
        : null;

    const fulfillmentMethod:
      FulfillmentMethod =
        body.fulfillmentMethod ===
        "shipping"
          ? "shipping"
          : "pickup";

    const paymentMethod:
      PaymentMethod =
        body.paymentMethod ===
        "bank_transfer"
          ? "bank_transfer"
          : "paypal";

    const paymentProvider =
      paymentMethod === "paypal"
        ? "paypal"
        : "bank_transfer";

    if (paymentMethod === "paypal" && !(await isPayPalPaymentsEnabled())) {
      return NextResponse.json(
        {
          ok: false,
          code: PAYPAL_DISABLED_CODE,
          message: PAYPAL_DISABLED_MESSAGE,
        },
        { status: 503 },
      );
    }

    const customerMessage =
      cleanNullableString(
        body.customerMessage,
      );

    if (!customerName) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Bitte gib Deinen Namen ein.",
        },
        {
          status: 400,
        },
      );
    }

    if (
      !email ||
      !email.includes("@")
    ) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Bitte gib eine gültige E-Mail-Adresse ein.",
        },
        {
          status: 400,
        },
      );
    }

    if (
      !billingName ||
      !billingEmail ||
      !billingEmail.includes("@")
    ) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Bitte gib gültige Rechnungsdaten ein.",
        },
        {
          status: 400,
        },
      );
    }

    if (
      !billingStreet ||
      !billingPostalCode ||
      !billingCity
    ) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Bitte gib Deine vollständige Rechnungsadresse ein.",
        },
        {
          status: 400,
        },
      );
    }

    if (
      shippingAddressDiffers &&
      (
        !shippingName ||
        !shippingStreet ||
        !shippingPostalCode ||
        !shippingCity
      )
    ) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Bitte gib die vollständige abweichende Lieferadresse ein.",
        },
        {
          status: 400,
        },
      );
    }

    const supabase =
      getSupabaseAdmin();

    const invoiceCutoverSettings =
      await loadInvoiceCutoverSettings(
        supabase,
      );

    const cutoverDecision =
      resolveInvoiceTaxCutover({
        now:
          checkoutNowDate,

        invoiceCutoverAt:
          invoiceCutoverSettings
            .invoice_cutover_at,

        timezoneName:
          invoiceCutoverSettings
            .timezone_name,

        invoiceProviderBefore:
          invoiceCutoverSettings
            .invoice_provider_before,

        invoiceProviderAfter:
          invoiceCutoverSettings
            .invoice_provider_after,

        invoiceCutoverVersion:
          invoiceCutoverSettings
            .invoice_cutover_version,
      });

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
          "checkout_override_enabled",
          "checkout_override_at",
          "checkout_override_note",
          "checkout_override_by",
        ].join(", "),
      )
      .eq(
        "offer_token",
        offerToken,
      )
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
            "Der Paketwunsch wurde nicht gefunden.",
        },
        {
          status: 404,
        },
      );
    }

    const requestRow =
      requestData as unknown as
        RequestRow;

    const requestId =
      requestRow.id;

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
      .eq(
        "request_id",
        requestId,
      )
      .order(
        "created_at",
        {
          ascending: true,
        },
      );

    if (offerItemsError) {
      return NextResponse.json(
        {
          ok: false,
          message:
            `Paketpositionen konnten nicht geladen werden: ${offerItemsError.message}`,
        },
        {
          status: 500,
        },
      );
    }

    const offerItems =
      (
        offerItemsData || []
      ) as unknown as
        OfferItemRow[];

    if (
      offerItems.length === 0
    ) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Dein Paketwunsch enthält noch keine Produkte und kann noch nicht bestellt werden.",
        },
        {
          status: 409,
        },
      );
    }

    const offerProductIds =
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

    if (
      offerProductIds.length > 0
    ) {
      const {
        data: productBookData,
        error: productBookError,
      } = await supabase
        .from("school_products")
        .select(
          [
            "id",
            "tax_rate",
            "is_book",
            "book_isbn13",
            "ean",
          ].join(", "),
        )
        .in(
          "id",
          offerProductIds,
        );

      if (productBookError) {
        return NextResponse.json(
          {
            ok: false,
            message:
              `Produkt- und Steuerinformationen konnten nicht geladen werden: ${productBookError.message}`,
          },
          {
            status: 500,
          },
        );
      }

      for (
        const product of
        (
          productBookData || []
        ) as unknown as
          ProductBookRow[]
      ) {
        productBookById.set(
          product.id,
          product,
        );
      }
    }

    const bookCommerceLineByOfferItemId =
      new Map(
        offerItems.map(
          (item) => {
            const product =
              item.product_id
                ? productBookById.get(
                    item.product_id,
                  ) || null
                : null;

            return [
              item.id,
              {
                quantity:
                  item.quantity,

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
          },
        ),
      );

    const {
      data: requestItemsData,
      error: requestItemsError,
    } = await supabase
      .from("school_request_items")
      .select(
        [
          "id",
          "status",
          "admin_resolution_status",
        ].join(", "),
      )
      .eq(
        "request_id",
        requestId,
      );

    if (requestItemsError) {
      return NextResponse.json(
        {
          ok: false,
          message:
            `Listenpositionen konnten nicht geprüft werden: ${requestItemsError.message}`,
        },
        {
          status: 500,
        },
      );
    }

    const requestItems =
      (
        (
          requestItemsData || []
        ) as unknown
      ) as RequestItemRow[];

    const blockingState =
      getRequestBlockingState(
        requestItems,
        offerItems,
        requestRow
          .checkout_override_enabled ===
          true,
      );

    const coveredRequestItemIds =
      blockingState
        .coveredRequestItemIds;

    const checkoutBlockingRequestItems =
      blockingState
        .effectiveBlockingItems;

    if (
      checkoutBlockingRequestItems.length >
      0
    ) {
      await supabase
        .from("school_requests")
        .update({
          status:
            "manual_review",

          offer_status:
            "customer_selection",

          updated_at:
            now,
        })
        .eq(
          "id",
          requestId,
        );

      await insertRequestEvent({
        supabase,
        requestId,
        eventType:
          "customer_package_submitted_manual_review",
        title:
          "Paketwunsch benötigt Prüfung",
        description:
          "Der Kunde wollte den Paketwunsch bestellen, aber es gibt noch offene Listenpositionen. Das Team muss den Paketwunsch prüfen.",
        metadata: {
          open_request_items_count:
            checkoutBlockingRequestItems.length,

          covered_request_item_ids:
            Array.from(
              coveredRequestItemIds,
            ),

          checkout_blocking_items:
            checkoutBlockingRequestItems.map(
              (item) => ({
                id:
                  item.id,

                status:
                  item.status,

                admin_resolution_status:
                  item.admin_resolution_status,

                is_covered_by_offer_item:
                  coveredRequestItemIds.has(
                    item.id,
                  ),

                is_resolved_for_checkout:
                  false,
              }),
            ),

          offer_items_count:
            offerItems.length,

          request_items_count:
            requestItems.length,

          ...maintenanceTestEventMetadata,
        },
        createdAt:
          now,
      });

      return NextResponse.json(
        {
          ok: false,
          message:
            "In Deinem Paketwunsch sind noch offene Positionen. Das Team von Handzettel-Schulen.de prüft diese zuerst. Danach bekommst Du den fertigen Paketwunsch zur finalen Bestellung.",
        },
        {
          status: 409,
        },
      );
    }

    if (
      coveredRequestItemIds.size >
      0
    ) {
      const {
        error:
          syncSelectedRequestItemsError,
      } = await supabase
        .from("school_request_items")
        .update({
          status:
            "selected",

          updated_at:
            now,
        })
        .eq(
          "request_id",
          requestId,
        )
        .in(
          "id",
          Array.from(
            coveredRequestItemIds,
          ),
        );

      if (
        syncSelectedRequestItemsError
      ) {
        console.error(
          "Checkout request item selected sync failed:",
          syncSelectedRequestItemsError,
        );
      }
    }

    const shippingAmount =
      fulfillmentMethod ===
      "shipping"
        ? SHIPPING_AMOUNT
        : 0;

    const subtotalAmount =
      roundMoney(
        offerItems.reduce(
          (
            sum,
            item,
          ) => {
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
          bookCommerceLineByOfferItemId
            .values(),
        ),
        fulfillmentMethod,
      );

    const totalAmount =
      calculateBookCommerceTotal({
        subtotalAmount,
        regularShippingAmount:
          shippingAmount,
        bookSummary,
      });

    /*
     * INVOICE_TAX_SNAPSHOT_CHECKOUT_PERSISTENCE_V1
     *
     * Der Steuer-Snapshot wird unmittelbar vor der verbindlichen
     * Rechnungserstellung aus den bestellten Positionen und den
     * zu diesem Zeitpunkt gültigen Katalog-Steuersätzen erzeugt.
     *
     * Die bisherige Bruttoberechnung bleibt unverändert führend.
     * Der neue Adapter muss sämtliche Bruttokomponenten centgenau
     * bestätigen. Bei einer Abweichung wird der Checkout vor dem
     * Rechnungsinsert abgebrochen.
     */
    const checkoutTaxSnapshot =
      buildCheckoutInvoiceTaxSnapshot({
        currency:
          "EUR",

        snapshotAt:
          now,

        lines:
          offerItems.map(
            (item) => ({
              key:
                item.id,

              productId:
                item.product_id,

              productName:
                item.product_name,

              quantity:
                item.quantity,

              unitPriceGross:
                item.product_price,

              isBookSnapshot:
                item.is_book_snapshot,

              bookCoverSelected:
                item.book_cover_selected,

              bookCoverUnitPriceGross:
                item.book_cover_unit_price,
            }),
          ),

        products:
          Array.from(
            productBookById.values(),
          ).map(
            (product) => ({
              id:
                product.id,

              taxRate:
                product.tax_rate,

              isBook:
                product.is_book ===
                true,

              /*
               * school_products besitzt derzeit keine einheitliche
               * is_active-Spalte. Erfolgreich geladene Produkte,
               * die bereits im Paketwunsch enthalten sind, werden
               * für den verbindlichen Snapshot als aktiv behandelt.
               */
              active:
                true,
            }),
          ),

        regularShippingGrossAmount:
          shippingAmount,

        bookShippingGrossAmount:
          bookSummary
            .bookShippingAmount,

        discountGrossAmount:
          0,

        bookCoverTaxRate:
          BOOK_COVER_TAX_RATE,

        bookShippingAllocationScope:
          "book_products_only",

        discountAllocationScope:
          "products_only",

        expectedGrossAmounts: {
          subtotal:
            subtotalAmount,

          regular_shipping:
            shippingAmount,

          book_shipping:
            bookSummary
              .bookShippingAmount,

          book_covers:
            bookSummary
              .bookCoverAmount,

          discount:
            0,

          total:
            totalAmount,
        },

        requireExpectedGrossAmountsMatch:
          true,
      });

    const v2Entries:
      InvoiceTaxSnapshotV2EntryInput[] =
        [];

    if (
      cutoverDecision
        .cutoverReached
    ) {
      for (const item of offerItems) {
        const product =
          item.product_id
            ? productBookById.get(
                item.product_id,
              )
            : null;

        if (!product) {
          throw new Error(
            `Für die Rechnungsposition ${item.product_name} fehlen die verbindlichen Produkt- und Steuerinformationen.`,
          );
        }

        const quantity =
          toNumber(
            item.quantity,
            1,
          );

        v2Entries.push({
          key:
            `product:${item.id}`,

          component:
            "product",

          itemKey:
            item.id,

          productId:
            product.id,

          productName:
            item.product_name,

          quantity,

          taxRatePercentage:
            toNumber(
              product.tax_rate,
            ) as 7 | 19,

          grossAmount:
            roundMoney(
              quantity *
                toNumber(
                  item.product_price,
                ),
            ),

          isBook:
            item.is_book_snapshot ??
            product.is_book ===
              true,
        });

        const bookLine =
          getBookCommerceLineSnapshot(
            bookCommerceLineByOfferItemId.get(
              item.id,
            ) || {
              quantity:
                item.quantity,
            },
          );

        if (
          bookLine
            .bookCoverTotalPrice >
          0
        ) {
          v2Entries.push({
            key:
              `book-cover:${item.id}`,

            component:
              "book_cover",

            itemKey:
              item.id,

            taxRatePercentage:
              BOOK_COVER_TAX_RATE,

            grossAmount:
              bookLine
                .bookCoverTotalPrice,
          });
        }
      }

      for (
        const rate of
        checkoutTaxSnapshot
          .taxSnapshot
          .breakdown
          .rates
      ) {
        if (
          rate
            .regular_shipping
            .gross >
          0
        ) {
          v2Entries.push({
            key:
              `regular-shipping:${rate.tax_rate}`,

            component:
              "regular_shipping",

            taxRatePercentage:
              rate.tax_rate,

            grossAmount:
              rate
                .regular_shipping
                .gross,
          });
        }

        if (
          rate
            .book_shipping
            .gross >
          0
        ) {
          v2Entries.push({
            key:
              `book-shipping:${rate.tax_rate}`,

            component:
              "book_shipping",

            taxRatePercentage:
              rate.tax_rate,

            grossAmount:
              rate
                .book_shipping
                .gross,
          });
        }

        if (
          rate
            .discount
            .gross >
          0
        ) {
          v2Entries.push({
            key:
              `discount:${rate.tax_rate}`,

            component:
              "discount",

            taxRatePercentage:
              rate.tax_rate,

            grossAmount:
              -rate
                .discount
                .gross,
          });
        }
      }
    }

    const v2TaxSnapshot =
      cutoverDecision
        .cutoverReached
        ? buildInvoiceTaxSnapshotV2({
            currency:
              "EUR",

            snapshotAt:
              now,

            entries:
              v2Entries,
          })
        : null;

    const selectedTaxSnapshot =
      v2TaxSnapshot ||
      checkoutTaxSnapshot
        .taxSnapshot;

    const invoiceTaxSnapshotPayload =
      selectedTaxSnapshot
        .invoiceSnapshotPayload;

    const selectedItemSnapshotByOfferItemId =
      new Map(
        selectedTaxSnapshot
          .items
          .map(
            (item) => [
              item.key,
              item.snapshotPayload,
            ] as const,
          ),
      );

    const expectedComponentGross = {
      total:
        totalAmount,

      subtotal:
        subtotalAmount,

      regularShipping:
        shippingAmount,

      bookShipping:
        bookSummary
          .bookShippingAmount,

      bookCovers:
        bookSummary
          .bookCoverAmount,

      discount:
        0,
    };

    const selectedComponentGross = {
      total:
        selectedTaxSnapshot
          .breakdown
          .totals
          .total
          .gross,

      subtotal:
        selectedTaxSnapshot
          .breakdown
          .totals
          .subtotal
          .gross,

      regularShipping:
        selectedTaxSnapshot
          .breakdown
          .totals
          .regular_shipping
          .gross,

      bookShipping:
        selectedTaxSnapshot
          .breakdown
          .totals
          .book_shipping
          .gross,

      bookCovers:
        selectedTaxSnapshot
          .breakdown
          .totals
          .book_covers
          .gross,

      discount:
        selectedTaxSnapshot
          .breakdown
          .totals
          .discount
          .gross,
    };

    const snapshotValidation = {
      totalGrossMatches:
        roundMoney(
          selectedComponentGross
            .total,
        ) ===
        roundMoney(
          expectedComponentGross
            .total,
        ),

      subtotalGrossMatches:
        roundMoney(
          selectedComponentGross
            .subtotal,
        ) ===
        roundMoney(
          expectedComponentGross
            .subtotal,
        ),

      regularShippingGrossMatches:
        roundMoney(
          selectedComponentGross
            .regularShipping,
        ) ===
        roundMoney(
          expectedComponentGross
            .regularShipping,
        ),

      bookShippingGrossMatches:
        roundMoney(
          selectedComponentGross
            .bookShipping,
        ) ===
        roundMoney(
          expectedComponentGross
            .bookShipping,
        ),

      bookCoverGrossMatches:
        roundMoney(
          selectedComponentGross
            .bookCovers,
        ) ===
        roundMoney(
          expectedComponentGross
            .bookCovers,
        ),

      discountGrossMatches:
        roundMoney(
          selectedComponentGross
            .discount,
        ) ===
        roundMoney(
          expectedComponentGross
            .discount,
        ),

      totalMoneyIdentityValid:
        Math.round(
          invoiceTaxSnapshotPayload
            .total_net_amount_snapshot *
            100,
        ) +
          Math.round(
            invoiceTaxSnapshotPayload
              .total_tax_amount_snapshot *
              100,
          ) ===
        Math.round(
          selectedComponentGross
            .total *
            100,
        ),

      allV2InvariantsPassed:
        v2TaxSnapshot
          ?.diagnostics
          .allInvariantsPassed ??
        true,

      productItemCountMatches:
        selectedTaxSnapshot
          .items
          .length ===
        offerItems.length,
    };

    const failedSnapshotValidations =
      Object.entries(
        snapshotValidation,
      )
        .filter(
          (
            [
              ,
              passed,
            ],
          ) =>
            passed !==
            true,
        )
        .map(
          (
            [
              name,
            ],
          ) =>
            name,
        );

    if (
      failedSnapshotValidations
        .length >
      0
    ) {
      console.error(
        "Handzettel checkout invoice tax snapshot validation failed:",
        {
          failedSnapshotValidations,
          expectedComponentGross,
          selectedComponentGross,
          snapshotValidation,
          cutoverDecision,
        },
      );

      throw new Error(
        `Der verbindliche Steuer-Snapshot ist inkonsistent (${failedSnapshotValidations.join(", ")}). Die Rechnung wurde nicht gespeichert.`,
      );
    }

    const invoiceNumber =
      await getInvoiceNumber(
        supabase,
        checkoutNowDate,
      );

    const invoiceId = crypto.randomUUID();
    const invoiceValues = {
        id: invoiceId,
        request_id:
          requestId,

        invoice_number:
          invoiceNumber,

        invoice_status:
          "draft",

        payment_status:
          "waiting_for_payment",

        selected_payment_method:
          paymentMethod,

        payment_provider:
          paymentProvider,

        subtotal_amount:
          subtotalAmount,

        shipping_amount:
          shippingAmount,

        contains_books:
          bookSummary
            .containsBooks,

        book_shipping_amount:
          bookSummary
            .bookShippingAmount,

        book_cover_amount:
          bookSummary
            .bookCoverAmount,

        discount_amount:
          0,

        total_amount:
          totalAmount,

        currency:
          "EUR",

        customer_note:
          customerMessage || null,

        created_at:
          now,

        ...createBankTransferSnapshot(),

        ...createSellerSnapshot(),

        bank_payment_purpose_snapshot:
          invoiceNumber,

        invoice_provider:
          cutoverDecision
            .selectedInvoiceProvider,

        invoice_provider_assigned_at:
          now,

        invoice_cutover_version:
          cutoverDecision
            .cutoverVersion,

        tax_snapshot_status:
          invoiceTaxSnapshotPayload
            .tax_snapshot_status,

        tax_snapshot_source:
          invoiceTaxSnapshotPayload
            .tax_snapshot_source,

        tax_snapshot_version:
          invoiceTaxSnapshotPayload
            .tax_snapshot_version,

        tax_snapshot_at:
          invoiceTaxSnapshotPayload
            .tax_snapshot_at,

        tax_breakdown_snapshot:
          invoiceTaxSnapshotPayload
            .tax_breakdown_snapshot,

        subtotal_net_amount_snapshot:
          invoiceTaxSnapshotPayload
            .subtotal_net_amount_snapshot,

        subtotal_tax_amount_snapshot:
          invoiceTaxSnapshotPayload
            .subtotal_tax_amount_snapshot,

        shipping_net_amount_snapshot:
          invoiceTaxSnapshotPayload
            .shipping_net_amount_snapshot,

        shipping_tax_amount_snapshot:
          invoiceTaxSnapshotPayload
            .shipping_tax_amount_snapshot,

        book_shipping_net_amount_snapshot:
          invoiceTaxSnapshotPayload
            .book_shipping_net_amount_snapshot,

        book_shipping_tax_amount_snapshot:
          invoiceTaxSnapshotPayload
            .book_shipping_tax_amount_snapshot,

        book_cover_net_amount_snapshot:
          invoiceTaxSnapshotPayload
            .book_cover_net_amount_snapshot,

        book_cover_tax_amount_snapshot:
          invoiceTaxSnapshotPayload
            .book_cover_tax_amount_snapshot,

        discount_net_amount_snapshot:
          invoiceTaxSnapshotPayload
            .discount_net_amount_snapshot,

        discount_tax_amount_snapshot:
          invoiceTaxSnapshotPayload
            .discount_tax_amount_snapshot,

        total_net_amount_snapshot:
          invoiceTaxSnapshotPayload
            .total_net_amount_snapshot,

        total_tax_amount_snapshot:
          invoiceTaxSnapshotPayload
            .total_tax_amount_snapshot,

        customer_name_snapshot:
          customerName,

        customer_email_snapshot:
          email,

        customer_phone_snapshot:
          phone,

        billing_name_snapshot:
          billingName,

        billing_email_snapshot:
          billingEmail,

        billing_phone_snapshot:
          billingPhone,

        billing_street_snapshot:
          billingStreet,

        billing_postal_code_snapshot:
          billingPostalCode,

        billing_city_snapshot:
          billingCity,

        shipping_address_differs_snapshot:
          shippingAddressDiffers,

        shipping_name_snapshot:
          shippingAddressDiffers
            ? shippingName
            : null,

        shipping_street_snapshot:
          shippingAddressDiffers
            ? shippingStreet
            : null,

        shipping_postal_code_snapshot:
          shippingAddressDiffers
            ? shippingPostalCode
            : null,

        shipping_city_snapshot:
          shippingAddressDiffers
            ? shippingCity
            : null,

        child_name_snapshot:
          requestRow.child_name,

        school_name_snapshot:
          requestRow.school_name,

        class_name_snapshot:
          requestRow.class_name,

        fulfillment_method_snapshot:
          fulfillmentMethod,

        admin_note:
          customerMessage
            ? `Kundenhinweis aus Checkout: ${customerMessage}`
            : null,
      };
    const nativeLexwareCheckout = cutoverDecision.selectedInvoiceProvider === "lexware";
    const legacyInvoiceInsert = nativeLexwareCheckout
      ? { data: {
          id: invoiceId,
          invoice_number: invoiceNumber,
          invoice_token: "native-staging-pending",
          invoice_status: "draft",
          payment_status: "waiting_for_payment",
        }, error: null }
      : await supabase.from("school_request_invoices").insert(invoiceValues)
          .select("id, invoice_number, invoice_token, invoice_status, payment_status").single();
    const { data: invoiceData, error: invoiceInsertError } = legacyInvoiceInsert;

    if (
      invoiceInsertError ||
      !invoiceData
    ) {
      return NextResponse.json(
        {
          ok: false,
          message:
            invoiceInsertError?.message ||
            "Die Rechnung konnte nicht erzeugt werden.",
        },
        {
          status: 500,
        },
      );
    }

    let invoice =
      invoiceData as unknown as
        InvoiceRow;

    if (!invoice.invoice_token) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Die Rechnung wurde erzeugt, aber es wurde kein Rechnungstoken zurückgegeben.",
        },
        {
          status: 500,
        },
      );
    }

    const invoiceItems =
      offerItems.map(
        (item) => {
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
              quantity *
                unitPrice,
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

          const itemTaxSnapshot =
            selectedItemSnapshotByOfferItemId.get(
              item.id,
            );

          if (!itemTaxSnapshot) {
            throw new Error(
              `Für die Rechnungsposition ${item.product_name} fehlt der verbindliche Steuer-Snapshot.`,
            );
          }

          return {
            id:
              crypto.randomUUID(),

            invoice_id:
              invoice.id,

            request_id:
              requestId,

            offer_item_id:
              item.id,

            product_id:
              item.product_id,

            product_name:
              item.product_name,

            product_sku:
              item.product_sku,

            quantity,

            unit:
              item.unit,

            unit_price:
              unitPrice,

            total_price:
              totalPrice,

            tax_rate_snapshot:
              itemTaxSnapshot
                .tax_rate_snapshot,

            product_gross_amount_snapshot:
              itemTaxSnapshot
                .product_gross_amount_snapshot,

            product_net_amount_snapshot:
              itemTaxSnapshot
                .product_net_amount_snapshot,

            product_tax_amount_snapshot:
              itemTaxSnapshot
                .product_tax_amount_snapshot,

            tax_snapshot_source:
              itemTaxSnapshot
                .tax_snapshot_source,

            tax_snapshot_version:
              itemTaxSnapshot
                .tax_snapshot_version,

            tax_snapshot_at:
              itemTaxSnapshot
                .tax_snapshot_at,

            book_cover_tax_rate_snapshot:
              itemTaxSnapshot
                .book_cover_tax_rate_snapshot,

            book_cover_net_amount_snapshot:
              itemTaxSnapshot
                .book_cover_net_amount_snapshot,

            book_cover_tax_amount_snapshot:
              itemTaxSnapshot
                .book_cover_tax_amount_snapshot,

            is_book_snapshot:
              bookSnapshot
                .isBookSnapshot,

            book_isbn13_snapshot:
              bookSnapshot
                .bookIsbn13Snapshot,

            book_cover_selected:
              bookSnapshot
                .bookCoverSelected,

            book_cover_name_snapshot:
              bookSnapshot
                .bookCoverNameSnapshot,

            book_cover_quantity:
              bookSnapshot
                .bookCoverQuantity,

            book_cover_unit_price:
              bookSnapshot
                .bookCoverUnitPrice,

            book_cover_total_price:
              bookSnapshot
                .bookCoverTotalPrice,

            source:
              item.source,

            notes:
              item.notes,
          };
        },
      );

    let invoiceItemsError: { message: string } | null = null;
    if (nativeLexwareCheckout) {
      try {
        const staged = await stageNativeLexwareCheckoutInvoice({
          client: supabase,
          invoice: invoiceValues,
          items: invoiceItems,
        });
        invoice = {
          id: staged.invoice_id,
          invoice_number: staged.invoice_number,
          invoice_token: staged.invoice_token,
          invoice_status: staged.invoice_status,
          payment_status: staged.payment_status,
        };
      } catch (error) {
        invoiceItemsError = {
          message: error instanceof Error ? error.message : "Native Lexware-Vorbereitung fehlgeschlagen.",
        };
      }
    } else {
      const result = await supabase.from("school_request_invoice_items").insert(invoiceItems);
      invoiceItemsError = result.error;
    }

    if (invoiceItemsError) {
      return NextResponse.json(
        {
          ok: false,
          message:
            `Rechnungspositionen konnten nicht gespeichert werden: ${invoiceItemsError.message}`,
        },
        {
          status: 500,
        },
      );
    }

    if (!invoice.invoice_token) {
      return NextResponse.json(
        { ok: false, message: "Die vorbereitete Rechnung besitzt keinen Rechnungstoken." },
        { status: 500 },
      );
    }

    const {
      error: updateRequestError,
    } = await supabase
      .from("school_requests")
      .update({
        status:
          "confirmed",

        offer_status:
          "confirmed",

        customer_name:
          customerName,

        email,

        phone,

        billing_name:
          billingName,

        billing_email:
          billingEmail,

        billing_phone:
          billingPhone,

        billing_street:
          billingStreet,

        billing_postal_code:
          billingPostalCode,

        billing_city:
          billingCity,

        shipping_address_differs:
          shippingAddressDiffers,

        shipping_name:
          shippingAddressDiffers
            ? shippingName
            : null,

        shipping_street:
          shippingAddressDiffers
            ? shippingStreet
            : null,

        shipping_postal_code:
          shippingAddressDiffers
            ? shippingPostalCode
            : null,

        shipping_city:
          shippingAddressDiffers
            ? shippingCity
            : null,

        fulfillment_method:
          fulfillmentMethod,

        fulfillment_status:
          fulfillmentMethod ===
          "shipping"
            ? "shipping_requested"
            : "pickup_requested",

        shipping_cost_status:
          fulfillmentMethod ===
          "shipping"
            ? "flat_rate_applied"
            : "not_required",

        shipping_amount:
          shippingAmount,

        contains_books:
          bookSummary
            .containsBooks,

        book_shipping_amount:
          bookSummary
            .bookShippingAmount,

        book_cover_amount:
          bookSummary
            .bookCoverAmount,

        cash_on_pickup_allowed:
          false,

        selected_payment_method:
          paymentMethod,

        payment_status:
          "waiting_for_payment",

        invoice_status:
          "draft",

        latest_invoice_id:
          invoice.id,

        invoice_total_amount:
          totalAmount,

        confirmed_at:
          now,

        updated_at:
          now,
      })
      .eq(
        "id",
        requestId,
      );

    if (updateRequestError) {
      return NextResponse.json(
        {
          ok: false,
          message:
            `Bestellung wurde erzeugt, aber die Anfrage konnte nicht aktualisiert werden: ${updateRequestError.message}`,
        },
        {
          status: 500,
        },
      );
    }

    await insertRequestEvent({
      supabase,
      requestId,
      eventType:
        "handzettel_checkout_ordered",
      title:
        "Paketwunsch verbindlich bestellt",
      description:
        `Der Paketwunsch wurde verbindlich bestellt. Rechnung ${invoice.invoice_number || ""}, Gesamtbetrag: ${totalAmount.toFixed(2)} EUR.`,
      metadata: {
        invoice_id:
          invoice.id,

        invoice_number:
          invoice.invoice_number,

        invoice_token:
          invoice.invoice_token,

        subtotal_amount:
          subtotalAmount,

        shipping_amount:
          shippingAmount,

        contains_books:
          bookSummary
            .containsBooks,

        book_position_count:
          bookSummary
            .bookPositionCount,

        book_quantity:
          bookSummary
            .bookQuantity,

        book_shipping_amount:
          bookSummary
            .bookShippingAmount,

        book_cover_position_count:
          bookSummary
            .bookCoverPositionCount,

        book_cover_quantity:
          bookSummary
            .bookCoverQuantity,

        book_cover_amount:
          bookSummary
            .bookCoverAmount,

        total_amount:
          totalAmount,

        tax_snapshot_status:
          invoiceTaxSnapshotPayload
            .tax_snapshot_status,

        tax_snapshot_source:
          invoiceTaxSnapshotPayload
            .tax_snapshot_source,

        tax_snapshot_version:
          invoiceTaxSnapshotPayload
            .tax_snapshot_version,

        tax_snapshot_at:
          invoiceTaxSnapshotPayload
            .tax_snapshot_at,

        total_net_amount_snapshot:
          invoiceTaxSnapshotPayload
            .total_net_amount_snapshot,

        total_tax_amount_snapshot:
          invoiceTaxSnapshotPayload
            .total_tax_amount_snapshot,

        tax_gross_amounts_match:
          failedSnapshotValidations
            .length ===
          0,

        invoice_provider:
          cutoverDecision
            .selectedInvoiceProvider,

        invoice_cutover_version:
          cutoverDecision
            .cutoverVersion,

        cutover_reached:
          cutoverDecision
            .cutoverReached,

        cutover_at:
          cutoverDecision
            .cutoverAt,

        selected_tax_snapshot_version:
          cutoverDecision
            .selectedTaxSnapshotVersion,

        selected_invoice_provider:
          cutoverDecision
            .selectedInvoiceProvider,

        fulfillment_method:
          fulfillmentMethod,

        payment_method:
          paymentMethod,

        checkout_override_used:
          requestRow
            .checkout_override_enabled ===
            true &&
          blockingState
            .rawBlockingCount >
            0,

        checkout_override_raw_blocking_count:
          blockingState
            .rawBlockingCount,

        ...maintenanceTestEventMetadata,
      },
      createdAt:
        now,
    });

    if (!nativeLexwareCheckout) {
      await sendCustomerInvoiceMailSafely({
        supabase,
        requestId,
        invoiceNumber:
          invoice.invoice_number,
        createdAt:
          now,
      });
    }

    return NextResponse.json({
      ok:
        true,

      requestId,

      invoiceId:
        invoice.id,

      invoiceNumber:
        invoice.invoice_number,

      invoiceToken:
        invoice.invoice_token,

      redirectUrl:
        `/rechnung/${encodeURIComponent(
          invoice.invoice_token,
        )}`,

      pricing: {
        subtotalAmount,
        shippingAmount,

        containsBooks:
          bookSummary
            .containsBooks,

        bookShippingAmount:
          bookSummary
            .bookShippingAmount,

        bookCoverAmount:
          bookSummary
            .bookCoverAmount,

        totalAmount,
      },

      taxSnapshot: {
        status:
          invoiceTaxSnapshotPayload
            .tax_snapshot_status,

        source:
          invoiceTaxSnapshotPayload
            .tax_snapshot_source,

        version:
          invoiceTaxSnapshotPayload
            .tax_snapshot_version,

        snapshotAt:
          invoiceTaxSnapshotPayload
            .tax_snapshot_at,

        totalNetAmount:
          invoiceTaxSnapshotPayload
            .total_net_amount_snapshot,

        totalTaxAmount:
          invoiceTaxSnapshotPayload
            .total_tax_amount_snapshot,

        grossAmountsMatch:
          failedSnapshotValidations
            .length ===
          0,
      },

      cutover: {
        reached:
          cutoverDecision
            .cutoverReached,

        cutoverAt:
          cutoverDecision
            .cutoverAt,

        version:
          cutoverDecision
            .cutoverVersion,

        selectedTaxSnapshotVersion:
          cutoverDecision
            .selectedTaxSnapshotVersion,

        selectedInvoiceProvider:
          cutoverDecision
            .selectedInvoiceProvider,
      },

      message:
        "Deine Bestellung wurde erstellt.",
    });
  } catch (error) {
    console.error(
      "Handzettel checkout error:",
      error,
    );

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Die Bestellung konnte nicht abgeschlossen werden.",
      },
      {
        status: 500,
      },
    );
  }
}

export async function GET() {
  return NextResponse.json(
    {
      ok: false,
      message:
        "Diese Route kann nur per POST genutzt werden.",
    },
    {
      status: 405,
    },
  );
}
