import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { buildShopLeadSource, LEAD_SOURCE_COOKIE_NAME } from "@/lib/lead-source";
import { sendAdminShopOrderNotification } from "../../../lib/adminNotifications";
import { sendRequestInvoiceMail } from "@/app/lib/requestInvoiceMailService";
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
  findActiveDiscountCampaign,
  roundMoney,
} from "../../../lib/discountCampaigns";
import { createBankTransferSnapshot } from "@/app/lib/paymentSettings";
import { createSellerSnapshot } from "@/app/lib/sellerSettings";
import { getCheckoutMaintenanceDecision } from "@/lib/checkoutMaintenance";
import { stageNativeLexwareCheckoutInvoice } from "@/app/lib/lexware/lexwareNativeCheckoutStaging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CheckoutCartItem = {
  productId: string;
  name: string;
  sku: string | null;
  price: number;
  imageUrl: string | null;
  quantity: number;
  category: string | null;
  format: string | null;
  color: string | null;
  lineature: string | null;
  sourceType?: "shop" | "reorder_from_school_list";
  sourceRequestId?: string | null;
  sourceOfferItemId?: string | null;
  sourceRequestItemId?: string | null;
  taxRate: number | string | null;
  isBook: boolean;
};

type CheckoutCartInputItem = {
  productId: string;
  quantity: number;
  sourceType?: "shop" | "reorder_from_school_list";
  sourceRequestId?: string | null;
  sourceOfferItemId?: string | null;
  sourceRequestItemId?: string | null;
};

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

  childName?: string | null;
  schoolName?: string | null;
  className?: string | null;
  fulfillmentMethod?: "pickup" | "shipping" | null;
  paymentMethod?: "paypal" | "bank_transfer" | null;
  customerMessage?: string | null;
  preparedCartToken?: string | null;
  cartItems?: unknown;
};

type PreparedCartRow = {
  id: string;
  token: string;
  status: string;
  expires_at: string | null;
};

type CreatedRequestRow = {
  id: string;
  request_number: string | null;
};

type InvoiceRow = {
  id: string;
  invoice_number: string | null;
  invoice_token: string | null;
  invoice_status: string | null;
  payment_status: string | null;
};

type CreatedOfferItemRow = {
  id: string;
  request_id: string;
  product_id: string | null;
  product_name: string;
  product_sku: string | null;
  product_price: number | string | null;
  quantity: number | string | null;
  unit: string | null;
  source: string | null;
  notes: string | null;
  is_book_snapshot: boolean | null;
};

type InvoiceCutoverSettingsRow = {
  timezone_name: string;
  invoice_cutover_at: string;
  invoice_provider_before: string;
  invoice_provider_after: string;
  invoice_cutover_version: string;
};

type ProductRow = Record<string, unknown> & {
  id?: string | number | null;
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

function normalizeQuantity(value: unknown) {
  return Math.max(1, Math.min(99, Math.floor(toNumber(value, 1))));
}

async function readBodySafely(request: NextRequest): Promise<CheckoutBody> {
  try {
    const text = await request.text();

    if (!text.trim()) {
      return {};
    }

    return JSON.parse(text) as CheckoutBody;
  } catch {
    return {};
  }
}

async function getInvoiceNumber(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  checkoutNowDate: Date
): Promise<string> {
  const { data, error } = await supabase.rpc("generate_school_invoice_number");

  if (!error && typeof data === "string" && data.trim().length > 0) {
    return data;
  }

  const year = checkoutNowDate.getFullYear();
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
  createdAt: string;
}) {
  const {
    supabase,
    requestId,
    eventType,
    title,
    description,
    metadata,
    createdAt,
  } = params;

  const { error } = await supabase.from("school_request_events").insert({
    request_id: requestId,
    event_type: eventType,
    title,
    description,
    metadata: metadata || {},
    created_at: createdAt,
  });

  if (error) {
    console.error("Shop event konnte nicht gespeichert werden:", error);
  }
}

async function loadInvoiceCutoverSettings(
  supabase: ReturnType<typeof getSupabaseAdmin>
) {
  const { data, error } = await supabase
    .from("business_runtime_settings")
    .select(
      [
        "timezone_name",
        "invoice_cutover_at",
        "invoice_provider_before",
        "invoice_provider_after",
        "invoice_cutover_version",
      ].join(", ")
    )
    .eq("id", "default")
    .maybeSingle();

  if (error) {
    throw new Error(
      `Rechnungs-Cutover-Konfiguration konnte nicht geladen werden: ${error.message}`
    );
  }

  if (!data) {
    throw new Error("business_runtime_settings/default fehlt.");
  }

  return data as unknown as InvoiceCutoverSettingsRow;
}

function validateCartInputs(items: unknown): CheckoutCartInputItem[] {
  if (!Array.isArray(items)) {
    return [];
  }

  const itemsByProductId = new Map<string, CheckoutCartInputItem>();

  for (const rawItem of items) {
    if (!rawItem || typeof rawItem !== "object") {
      continue;
    }

    const cartItem = rawItem as Partial<CheckoutCartItem>;
    const productId = cleanString(cartItem.productId);
    const quantity = normalizeQuantity(cartItem.quantity);

    if (!productId || quantity <= 0) {
      continue;
    }

    const sourceType =
      cartItem.sourceType === "reorder_from_school_list"
        ? "reorder_from_school_list"
        : "shop";

    const existing = itemsByProductId.get(productId);

    if (existing) {
      itemsByProductId.set(productId, {
        ...existing,
        quantity: Math.min(99, existing.quantity + quantity),
      });
      continue;
    }

    itemsByProductId.set(productId, {
      productId,
      quantity,
      sourceType,
      sourceRequestId: cleanNullableString(cartItem.sourceRequestId),
      sourceOfferItemId: cleanNullableString(cartItem.sourceOfferItemId),
      sourceRequestItemId: cleanNullableString(cartItem.sourceRequestItemId),
    });
  }

  return Array.from(itemsByProductId.values());
}

function getStringFromProduct(product: ProductRow, keys: string[]) {
  for (const key of keys) {
    const value = product[key];

    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return null;
}

function getProductName(product: ProductRow) {
  return (
    getStringFromProduct(product, [
      "name",
      "product_name",
      "title",
      "display_name",
      "label",
    ]) || "Unbenanntes Produkt"
  );
}

function getProductSku(product: ProductRow) {
  return getStringFromProduct(product, [
    "sku",
    "product_sku",
    "article_number",
    "item_number",
    "artikelnummer",
  ]);
}

function getProductPrice(product: ProductRow) {
  return roundMoney(
    Math.max(
      0,
      toNumber(
        product.price ??
          product.gross_price ??
          product.product_price ??
          product.unit_price ??
          product.sale_price_gross ??
          product.sale_price,
        0
      )
    )
  );
}

function getProductImageUrl(product: ProductRow) {
  return getStringFromProduct(product, [
    "image_styled_url",
    "styled_image_url",
    "image_url",
    "product_image_url",
    "image",
    "photo_url",
    "picture_url",
  ]);
}

function getProductStatus(product: ProductRow) {
  return getStringFromProduct(product, ["status", "product_status"]);
}

function isProductActive(product: ProductRow) {
  if (product.active === false) return false;

  const status = getProductStatus(product);

  if (!status) return true;

  return !["inactive", "archived", "deleted", "disabled"].includes(
    status.toLowerCase()
  );
}

async function buildServerCartItems(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  cartInputs: CheckoutCartInputItem[];
}): Promise<CheckoutCartItem[]> {
  const productIds = params.cartInputs.map((item) => item.productId);

  const { data, error } = await params.supabase
    .from("school_products")
    .select("*")
    .in("id", productIds);

  if (error) {
    throw new Error(`Produkte konnten nicht geprüft werden: ${error.message}`);
  }

  const productsById = new Map<string, ProductRow>();

  for (const product of (data || []) as ProductRow[]) {
    const id = product.id ? String(product.id) : "";
    if (id) productsById.set(id, product);
  }

  const missingProductIds = productIds.filter((id) => !productsById.has(id));

  if (missingProductIds.length > 0) {
    throw new Error(
      "Mindestens ein Produkt aus Deinem Warenkorb ist nicht mehr verfügbar. Bitte aktualisiere den Warenkorb."
    );
  }

  const inactiveProducts: string[] = [];
  const invalidPriceProducts: string[] = [];
  const serverItems: CheckoutCartItem[] = [];

  for (const input of params.cartInputs) {
    const product = productsById.get(input.productId);

    if (!product) continue;

    const name = getProductName(product);
    const price = getProductPrice(product);

    if (!isProductActive(product)) {
      inactiveProducts.push(name);
      continue;
    }

    if (price <= 0) {
      invalidPriceProducts.push(name);
      continue;
    }

    serverItems.push({
      productId: input.productId,
      name,
      sku: getProductSku(product),
      price,
      imageUrl: getProductImageUrl(product),
      quantity: input.quantity,
      category: getStringFromProduct(product, ["category", "product_category", "type"]),
      format: getStringFromProduct(product, ["format", "size", "product_format"]),
      color: getStringFromProduct(product, ["color", "colour", "farbe"]),
      lineature: getStringFromProduct(product, ["lineature", "lineatur", "ruling"]),
      sourceType: input.sourceType,
      sourceRequestId: input.sourceRequestId || null,
      sourceOfferItemId: input.sourceOfferItemId || null,
      sourceRequestItemId: input.sourceRequestItemId || null,
      taxRate:
        product.tax_rate === null ||
        product.tax_rate === undefined
          ? null
          : (product.tax_rate as number | string),
      isBook: product.is_book === true,
    });
  }

  if (inactiveProducts.length > 0) {
    throw new Error(
      `Diese Produkte sind nicht mehr verfügbar: ${inactiveProducts.join(", ")}. Bitte entferne sie aus dem Warenkorb.`
    );
  }

  if (invalidPriceProducts.length > 0) {
    throw new Error(
      `Für diese Produkte ist aktuell kein gültiger Preis hinterlegt: ${invalidPriceProducts.join(", ")}. Bitte entferne sie aus dem Warenkorb oder kontaktiere uns.`
    );
  }

  return serverItems;
}

function formatEuroForEvent(value: number) {
  return value.toFixed(2).replace(".", ",");
}


async function sendCustomerInvoiceMailSafely(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  requestId: string;
  invoiceNumber: string | null;
  createdAt: string;
}) {
  const { supabase, requestId, invoiceNumber, createdAt } = params;

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
          "Die Rechnungsmail an den Kunden konnte nach der Shop-Bestellung nicht automatisch versendet werden.",
        createdAt,
      });

      return;
    }

    await insertRequestEvent({
      supabase,
      requestId,
      eventType: "customer_invoice_mail_sent_after_shop_checkout",
      title: "Rechnungsmail an Kunde versendet",
      description: `Die Rechnung ${invoiceNumber || ""} wurde nach der Shop-Bestellung automatisch an den Kunden versendet.`,
      createdAt,
    });
  } catch (error) {
    console.error("Kunden-Rechnungsmail zur Shop-Bestellung konnte nicht versendet werden:", error);

    await insertRequestEvent({
      supabase,
      requestId,
      eventType: "customer_invoice_mail_failed",
      title: "Rechnungsmail an Kunde fehlgeschlagen",
      description:
        error instanceof Error
          ? error.message
          : "Die Rechnungsmail an den Kunden konnte nach der Shop-Bestellung nicht automatisch versendet werden.",
      createdAt,
    });
  }
}

async function sendShopOrderAdminNotificationSafely(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  requestId: string;
  requestNumber: string | null;
  invoiceNumber: string | null;
  invoiceToken: string;
  customerName: string;
  email: string;
  phone: string | null;
  childName: string | null;
  schoolName: string | null;
  className: string | null;
  fulfillmentMethod: "pickup" | "shipping";
  itemCount: number;
  subtotalAmount: number;
  shippingAmount: number;
  discountName: string | null;
  discountAmount: number;
  totalAmount: number;
  customerMessage: string | null;
  createdAt: string;
}) {
  try {
    const result = await sendAdminShopOrderNotification({
      requestId: params.requestId,
      requestNumber: params.requestNumber,
      invoiceNumber: params.invoiceNumber,
      invoiceToken: params.invoiceToken,
      customerName: params.customerName,
      email: params.email,
      phone: params.phone,
      childName: params.childName,
      schoolName: params.schoolName,
      className: params.className,
      fulfillmentMethod: params.fulfillmentMethod,
      itemCount: params.itemCount,
      subtotalAmount: params.subtotalAmount,
      shippingAmount: params.shippingAmount,
      discountName: params.discountName,
      discountAmount: params.discountAmount,
      totalAmount: params.totalAmount,
      customerMessage: params.customerMessage,
    });

    await insertRequestEvent({
      supabase: params.supabase,
      requestId: params.requestId,
      eventType: result.ok
        ? "admin_shop_notification_sent"
        : "admin_shop_notification_skipped",
      title: result.ok
        ? "Admin-Mail versendet"
        : "Admin-Mail nicht versendet",
      description: result.ok
        ? "Die Admin-Benachrichtigung zur Shop-Bestellung wurde versendet."
        : result.message || "Die Admin-Benachrichtigung wurde nicht versendet.",
      createdAt: params.createdAt,
    });
  } catch (error) {
    console.error("Admin-Mail zur Shop-Bestellung konnte nicht versendet werden:", error);

    await insertRequestEvent({
      supabase: params.supabase,
      requestId: params.requestId,
      eventType: "admin_shop_notification_failed",
      title: "Admin-Mail fehlgeschlagen",
      description:
        error instanceof Error
          ? error.message
          : "Die Admin-Benachrichtigung zur Shop-Bestellung konnte nicht versendet werden.",
      createdAt: params.createdAt,
    });
  }
}

export async function POST(request: NextRequest) {
  const checkoutMaintenance = getCheckoutMaintenanceDecision();

  if (checkoutMaintenance.active) {
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
      }
    );
  }

  const checkoutNowDate = new Date();
  const now = checkoutNowDate.toISOString();

  try {
    const body = await readBodySafely(request);

    const customerName = cleanString(body.customerName);
    const email = cleanString(body.email).toLowerCase();
    const phone = cleanNullableString(body.phone);

    const childName = cleanNullableString(body.childName);
    const schoolName = cleanNullableString(body.schoolName);
    const className = cleanNullableString(body.className);

    const fulfillmentMethod =
      body.fulfillmentMethod === "shipping" ? "shipping" : "pickup";

    const customerMessage = cleanNullableString(body.customerMessage);
    const preparedCartToken = cleanNullableString(
      body.preparedCartToken
    );

    const paymentMethod =
      body.paymentMethod === "bank_transfer" ? "bank_transfer" : "paypal";
    const paymentProvider =
      paymentMethod === "paypal" ? "paypal" : "bank_transfer";

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

    const cartInputs = validateCartInputs(body.cartItems);

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

    if (!billingName) {
      return NextResponse.json(
        {
          ok: false,
          message: "Bitte gib den Namen für die Rechnungsadresse ein.",
        },
        { status: 400 }
      );
    }

    if (!billingEmail || !billingEmail.includes("@")) {
      return NextResponse.json(
        {
          ok: false,
          message: "Bitte gib eine gültige Rechnungs-E-Mail-Adresse ein.",
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

    if (cartInputs.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Dein Warenkorb ist leer. Bitte lege zuerst Produkte in den Warenkorb.",
        },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const invoiceCutoverSettings =
      await loadInvoiceCutoverSettings(supabase);
    const cutoverDecision = resolveInvoiceTaxCutover({
      now: checkoutNowDate,
      invoiceCutoverAt:
        invoiceCutoverSettings.invoice_cutover_at,
      timezoneName:
        invoiceCutoverSettings.timezone_name,
      invoiceProviderBefore:
        invoiceCutoverSettings.invoice_provider_before,
      invoiceProviderAfter:
        invoiceCutoverSettings.invoice_provider_after,
      invoiceCutoverVersion:
        invoiceCutoverSettings.invoice_cutover_version,
    });

    let preparedCart: PreparedCartRow | null = null;

    if (preparedCartToken) {
      const { data, error } = await supabase
        .from("school_prepared_carts")
        .select("id, token, status, expires_at")
        .eq("token", preparedCartToken)
        .maybeSingle();

      if (error) {
        return NextResponse.json(
          {
            ok: false,
            message: `Der vorbereitete Warenkorb konnte nicht geprüft werden: ${error.message}`,
          },
          { status: 500 }
        );
      }

      preparedCart = data as PreparedCartRow | null;

      if (!preparedCart) {
        return NextResponse.json(
          {
            ok: false,
            message:
              "Der vorbereitete Warenkorb wurde nicht gefunden. Bitte öffne den ursprünglichen Kundenlink erneut.",
          },
          { status: 404 }
        );
      }

      if (
        ["ordered", "expired", "cancelled"].includes(
          preparedCart.status
        )
      ) {
        return NextResponse.json(
          {
            ok: false,
            message:
              "Dieser vorbereitete Warenkorb kann nicht mehr bestellt werden.",
          },
          { status: 409 }
        );
      }

      if (
        preparedCart.expires_at &&
        new Date(preparedCart.expires_at).getTime() <= Date.now()
      ) {
        await supabase
          .from("school_prepared_carts")
          .update({
            status: "expired",
          })
          .eq("id", preparedCart.id);

        return NextResponse.json(
          {
            ok: false,
            message:
              "Dieser vorbereitete Warenkorb ist abgelaufen. Bitte fordere einen neuen Link an.",
          },
          { status: 410 }
        );
      }
    }

    const cartItems = await buildServerCartItems({
      supabase,
      cartInputs,
    });

    if (cartItems.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Für Deinen Warenkorb konnten keine gültigen Produkte gefunden werden.",
        },
        { status: 400 }
      );
    }

    const shippingAmount =
      fulfillmentMethod === "shipping" ? SHIPPING_AMOUNT : 0;

    const subtotalAmount = roundMoney(
      cartItems.reduce((sum, item) => {
        return sum + item.quantity * item.price;
      }, 0)
    );

    const appliedDiscount = await findActiveDiscountCampaign({
      supabase,
      appliesTo: "shop",
      subtotalAmount,
    });

    const discountAmount = roundMoney(appliedDiscount.discountAmount);
    const totalAmount = roundMoney(
      Math.max(0, subtotalAmount + shippingAmount - discountAmount)
    );

    const requestLeadSource = buildShopLeadSource(
      request.cookies.get(LEAD_SOURCE_COOKIE_NAME)?.value ||
        request.headers.get("referer") ||
        "direct"
    );

    const messageParts = [
      "Shop-Bestellung über /shop.",
      customerMessage ? `Kundenhinweis: ${customerMessage}` : null,
      appliedDiscount.discountName
        ? `Automatisch angewendete Rabattaktion: ${appliedDiscount.discountName} (-${formatEuroForEvent(
            discountAmount
          )} EUR).`
        : null,
      cartItems.some((item) => item.sourceType === "reorder_from_school_list")
        ? "Enthält Nachkauf-Artikel aus früherem Paketwunsch."
        : null,
      preparedCart
        ? `Bestellung aus vorbereitetem Bestandskunden-Warenkorb ${preparedCart.id}.`
        : null,
    ].filter(Boolean);

    const { data: createdRequestData, error: requestInsertError } =
      await supabase
        .from("school_requests")
        .insert({
          status: "confirmed",
          offer_status: "confirmed",
          ai_status: "not_required",
          source: requestLeadSource,

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

          child_name: childName,
          school_name: schoolName,
          class_name: className,

          message: messageParts.join("\n"),
          fulfillment_method: fulfillmentMethod,

          cash_on_pickup_allowed: false,

          discount_campaign_id: appliedDiscount.campaignId,
          discount_amount: discountAmount,

          checkout_committed_at: now,
          invoice_provider:
            cutoverDecision.selectedInvoiceProvider,
          invoice_provider_assigned_at: now,
          invoice_cutover_version:
            cutoverDecision.cutoverVersion,

          confirmed_at: now,
          updated_at: now,
        })
        .select("id, request_number")
        .single();

    if (requestInsertError || !createdRequestData) {
      return NextResponse.json(
        {
          ok: false,
          message:
            requestInsertError?.message ||
            "Die Shop-Bestellung konnte nicht angelegt werden.",
        },
        { status: 500 }
      );
    }

    const createdRequest = createdRequestData as CreatedRequestRow;
    const requestId = createdRequest.id;

    const offerRows = cartItems.map((item) => {
      const source =
        item.sourceType === "reorder_from_school_list"
          ? "reorder_from_school_list"
          : "shop_cart";

      const notes = [
        item.category ? `Kategorie: ${item.category}` : null,
        item.format ? `Format: ${item.format}` : null,
        item.lineature ? `Lineatur: ${item.lineature}` : null,
        item.color ? `Farbe: ${item.color}` : null,
        item.sourceType === "reorder_from_school_list"
          ? "Nachkauf aus früherem Paketwunsch."
          : null,
        item.sourceRequestId
          ? `Ursprungsanfrage: ${item.sourceRequestId}`
          : null,
        item.sourceOfferItemId
          ? `Ursprungspaketposition: ${item.sourceOfferItemId}`
          : null,
      ]
        .filter(Boolean)
        .join(" | ");

      return {
        request_id: requestId,
        request_item_id: null,
        match_id: null,
        product_id: item.productId,

        product_name: item.name,
        product_sku: item.sku,
        product_price: item.price,

        quantity: item.quantity,
        unit: "Stk.",

        source,
        status: "confirmed",
        notes: notes || null,
        is_book_snapshot: item.isBook,

        created_at: now,
        updated_at: now,
      };
    });

    const { data: createdOfferItemsData, error: offerInsertError } =
      await supabase
        .from("school_offer_items")
        .insert(offerRows)
        .select(
          [
            "id",
            "request_id",
            "product_id",
            "product_name",
            "product_sku",
            "product_price",
            "quantity",
            "unit",
            "source",
            "notes",
            "is_book_snapshot",
          ].join(", ")
        );

    if (offerInsertError || !createdOfferItemsData) {
      return NextResponse.json(
        {
          ok: false,
          message:
            offerInsertError?.message ||
            "Die Shop-Positionen konnten nicht gespeichert werden.",
        },
        { status: 500 }
      );
    }

    const createdOfferItems =
      createdOfferItemsData as unknown as CreatedOfferItemRow[];

    const cartItemByProductId = new Map(
      cartItems.map((item) => [item.productId, item] as const)
    );

    const checkoutTaxSnapshot = buildCheckoutInvoiceTaxSnapshot({
      currency: "EUR",
      snapshotAt: now,
      lines: createdOfferItems.map((offerItem) => {
        const productId = String(offerItem.product_id || "").trim();
        const cartItem = cartItemByProductId.get(productId);

        if (!cartItem) {
          throw new Error(
            `Für die Shop-Position ${offerItem.id} fehlen die verbindlichen Katalogdaten.`
          );
        }

        return {
          key: offerItem.id,
          productId,
          productName: offerItem.product_name,
          quantity: offerItem.quantity,
          unitPriceGross: offerItem.product_price,
          isBookSnapshot: offerItem.is_book_snapshot,
          bookCoverSelected: false,
          bookCoverUnitPriceGross: 0,
        };
      }),
      products: cartItems.map((item) => ({
        id: item.productId,
        taxRate: item.taxRate,
        isBook: item.isBook,
        active: true,
      })),
      regularShippingGrossAmount: shippingAmount,
      bookShippingGrossAmount: 0,
      discountGrossAmount: discountAmount,
      bookShippingAllocationScope: "book_products_only",
      discountAllocationScope: "products_only",
      expectedGrossAmounts: {
        subtotal: subtotalAmount,
        regular_shipping: shippingAmount,
        book_shipping: 0,
        book_covers: 0,
        discount: discountAmount,
        total: totalAmount,
      },
      requireExpectedGrossAmountsMatch: true,
    });

    const v1LineByOfferItemId = new Map(
      checkoutTaxSnapshot.lines.map((line) => [line.key, line] as const)
    );
    const v2Entries: InvoiceTaxSnapshotV2EntryInput[] = [];

    if (cutoverDecision.cutoverReached) {
      for (const offerItem of createdOfferItems) {
        const line = v1LineByOfferItemId.get(offerItem.id);

        if (!line) {
          throw new Error(
            `Für die Shop-Position ${offerItem.id} fehlt die validierte V1-Steuerzeile.`
          );
        }

        v2Entries.push({
          key: `product:${offerItem.id}`,
          component: "product",
          itemKey: offerItem.id,
          productId: line.productId,
          productName: line.productName,
          quantity: line.quantity,
          taxRatePercentage: line.catalogTaxRate,
          grossAmount: line.productGrossAmount,
          isBook: line.catalogIsBook,
        });
      }

      for (const rate of checkoutTaxSnapshot.taxSnapshot.breakdown.rates) {
        if (rate.regular_shipping.gross > 0) {
          v2Entries.push({
            key: `regular-shipping:${rate.tax_rate}`,
            component: "regular_shipping",
            taxRatePercentage: rate.tax_rate,
            grossAmount: rate.regular_shipping.gross,
          });
        }

        if (rate.discount.gross > 0) {
          v2Entries.push({
            key: `discount:${rate.tax_rate}`,
            component: "discount",
            taxRatePercentage: rate.tax_rate,
            grossAmount: -rate.discount.gross,
          });
        }
      }
    }

    const v2TaxSnapshot = cutoverDecision.cutoverReached
      ? buildInvoiceTaxSnapshotV2({
          currency: "EUR",
          snapshotAt: now,
          entries: v2Entries,
        })
      : null;
    const selectedTaxSnapshot =
      v2TaxSnapshot || checkoutTaxSnapshot.taxSnapshot;
    const invoiceTaxSnapshotPayload =
      selectedTaxSnapshot.invoiceSnapshotPayload;
    const selectedItemSnapshotByOfferItemId = new Map(
      selectedTaxSnapshot.items.map(
        (item) => [item.key, item.snapshotPayload] as const
      )
    );
    const selectedTotals = selectedTaxSnapshot.breakdown.totals;
    const snapshotValidation = {
      statusComplete:
        invoiceTaxSnapshotPayload.tax_snapshot_status === "complete",
      selectedVersionMatches:
        invoiceTaxSnapshotPayload.tax_snapshot_version ===
        cutoverDecision.selectedTaxSnapshotVersion,
      subtotalGrossMatches:
        roundMoney(selectedTotals.subtotal.gross) === subtotalAmount,
      regularShippingGrossMatches:
        roundMoney(selectedTotals.regular_shipping.gross) === shippingAmount,
      bookShippingGrossMatches:
        roundMoney(selectedTotals.book_shipping.gross) === 0,
      bookCoverGrossMatches:
        roundMoney(selectedTotals.book_covers.gross) === 0,
      discountGrossMatches:
        roundMoney(selectedTotals.discount.gross) === discountAmount,
      totalGrossMatches:
        roundMoney(selectedTotals.total.gross) === totalAmount,
      totalMoneyIdentityValid:
        Math.round(
          invoiceTaxSnapshotPayload.total_net_amount_snapshot * 100
        ) +
          Math.round(
            invoiceTaxSnapshotPayload.total_tax_amount_snapshot * 100
          ) ===
        Math.round(selectedTotals.total.gross * 100),
      allV2InvariantsPassed:
        v2TaxSnapshot?.diagnostics.allInvariantsPassed ?? true,
      productItemCountMatches:
        selectedTaxSnapshot.items.length === createdOfferItems.length,
      itemSnapshotsComplete:
        createdOfferItems.every((item) =>
          selectedItemSnapshotByOfferItemId.has(item.id)
        ),
    };
    const failedSnapshotValidations = Object.entries(snapshotValidation)
      .filter(([, passed]) => passed !== true)
      .map(([name]) => name);

    if (failedSnapshotValidations.length > 0) {
      throw new Error(
        `Der verbindliche Shop-Steuer-Snapshot ist inkonsistent (${failedSnapshotValidations.join(", ")}). Die Rechnung wurde nicht gespeichert.`
      );
    }

    const invoiceNumber = await getInvoiceNumber(
      supabase,
      checkoutNowDate
    );

    const invoiceId = crypto.randomUUID();
    const invoiceValues = {
        id: invoiceId,
        request_id: requestId,
        invoice_number: invoiceNumber,

        invoice_status: "draft",
        payment_status: "waiting_for_payment",
        selected_payment_method: paymentMethod,
        payment_provider: paymentProvider,

        subtotal_amount: subtotalAmount,
        shipping_amount: shippingAmount,
        discount_campaign_id: appliedDiscount.campaignId,
        discount_name: appliedDiscount.discountName,
        discount_type: appliedDiscount.discountType,
        discount_value: appliedDiscount.discountValue,
        discount_amount: discountAmount,
        total_amount: totalAmount,
        currency: "EUR",
        contains_books: cartItems.some((item) => item.isBook),
        book_shipping_amount: 0,
        book_cover_amount: 0,
        ...createBankTransferSnapshot(),
        ...createSellerSnapshot(),
        bank_payment_purpose_snapshot: invoiceNumber,

        invoice_provider:
          cutoverDecision.selectedInvoiceProvider,
        invoice_provider_assigned_at: now,
        invoice_cutover_version:
          cutoverDecision.cutoverVersion,

        tax_snapshot_status:
          invoiceTaxSnapshotPayload.tax_snapshot_status,
        tax_snapshot_source:
          invoiceTaxSnapshotPayload.tax_snapshot_source,
        tax_snapshot_version:
          invoiceTaxSnapshotPayload.tax_snapshot_version,
        tax_snapshot_at:
          invoiceTaxSnapshotPayload.tax_snapshot_at,
        tax_breakdown_snapshot:
          invoiceTaxSnapshotPayload.tax_breakdown_snapshot,
        subtotal_net_amount_snapshot:
          invoiceTaxSnapshotPayload.subtotal_net_amount_snapshot,
        subtotal_tax_amount_snapshot:
          invoiceTaxSnapshotPayload.subtotal_tax_amount_snapshot,
        shipping_net_amount_snapshot:
          invoiceTaxSnapshotPayload.shipping_net_amount_snapshot,
        shipping_tax_amount_snapshot:
          invoiceTaxSnapshotPayload.shipping_tax_amount_snapshot,
        book_shipping_net_amount_snapshot:
          invoiceTaxSnapshotPayload.book_shipping_net_amount_snapshot,
        book_shipping_tax_amount_snapshot:
          invoiceTaxSnapshotPayload.book_shipping_tax_amount_snapshot,
        book_cover_net_amount_snapshot:
          invoiceTaxSnapshotPayload.book_cover_net_amount_snapshot,
        book_cover_tax_amount_snapshot:
          invoiceTaxSnapshotPayload.book_cover_tax_amount_snapshot,
        discount_net_amount_snapshot:
          invoiceTaxSnapshotPayload.discount_net_amount_snapshot,
        discount_tax_amount_snapshot:
          invoiceTaxSnapshotPayload.discount_tax_amount_snapshot,
        total_net_amount_snapshot:
          invoiceTaxSnapshotPayload.total_net_amount_snapshot,
        total_tax_amount_snapshot:
          invoiceTaxSnapshotPayload.total_tax_amount_snapshot,

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

        child_name_snapshot: childName,
        school_name_snapshot: schoolName,
        class_name_snapshot: className,
        customer_note: null,
        created_at: now,

        fulfillment_method_snapshot: fulfillmentMethod,
        pickup_location_label_snapshot:
          fulfillmentMethod === "pickup" ? "Abholung im Laden" : null,
        pickup_address_snapshot:
          fulfillmentMethod === "pickup"
            ? "BSS Vogtland"
            : null,

        admin_note: appliedDiscount.discountName
          ? `Automatisch aus Shop-Warenkorb erzeugt. Rabattaktion: ${
              appliedDiscount.discountName
            }, Rabattbetrag: ${formatEuroForEvent(discountAmount)} EUR.`
          : "Automatisch aus Shop-Warenkorb erzeugt.",
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

    if (invoiceInsertError || !invoiceData) {
      return NextResponse.json(
        {
          ok: false,
          message:
            invoiceInsertError?.message ||
            "Die Rechnung zur Shop-Bestellung konnte nicht erzeugt werden.",
        },
        { status: 500 }
      );
    }

    let invoice = invoiceData as InvoiceRow;

    if (!invoice.invoice_token) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Die Rechnung wurde erzeugt, aber es wurde kein Zahlungslink-Token zurückgegeben.",
        },
        { status: 500 }
      );
    }

    const invoiceItems = createdOfferItems.map((offerItem) => {
      const quantity = normalizeQuantity(offerItem.quantity);
      const unitPrice = roundMoney(toNumber(offerItem.product_price, 0));
      const itemTotalPrice = roundMoney(quantity * unitPrice);
      const itemTaxSnapshot =
        selectedItemSnapshotByOfferItemId.get(offerItem.id);

      if (!itemTaxSnapshot) {
        throw new Error(
          `Für die Shop-Rechnungsposition ${offerItem.id} fehlt der ausgewählte Steuer-Snapshot.`
        );
      }

      return {
        id: crypto.randomUUID(),
        invoice_id: invoice.id,
        request_id: requestId,

        offer_item_id: offerItem.id,
        product_id: offerItem.product_id,

        product_name: offerItem.product_name,
        product_sku: offerItem.product_sku,

        quantity,
        unit: offerItem.unit,

        unit_price: unitPrice,
        total_price: itemTotalPrice,

        tax_rate_snapshot:
          itemTaxSnapshot.tax_rate_snapshot,
        product_gross_amount_snapshot:
          itemTaxSnapshot.product_gross_amount_snapshot,
        product_net_amount_snapshot:
          itemTaxSnapshot.product_net_amount_snapshot,
        product_tax_amount_snapshot:
          itemTaxSnapshot.product_tax_amount_snapshot,
        tax_snapshot_source:
          itemTaxSnapshot.tax_snapshot_source,
        tax_snapshot_version:
          itemTaxSnapshot.tax_snapshot_version,
        tax_snapshot_at:
          itemTaxSnapshot.tax_snapshot_at,
        book_cover_tax_rate_snapshot:
          itemTaxSnapshot.book_cover_tax_rate_snapshot,
        book_cover_net_amount_snapshot:
          itemTaxSnapshot.book_cover_net_amount_snapshot,
        book_cover_tax_amount_snapshot:
          itemTaxSnapshot.book_cover_tax_amount_snapshot,

        is_book_snapshot: offerItem.is_book_snapshot,
        book_isbn13_snapshot: null,
        book_cover_selected: false,
        book_cover_name_snapshot: null,
        book_cover_quantity: 0,
        book_cover_unit_price: 0,
        book_cover_total_price: 0,

        source: offerItem.source,
        notes: offerItem.notes,
      };
    });

    let invoiceItemsInsertError: { message: string } | null = null;
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
        invoiceItemsInsertError = {
          message: error instanceof Error ? error.message : "Native Lexware-Vorbereitung fehlgeschlagen.",
        };
      }
    } else {
      const result = await supabase.from("school_request_invoice_items").insert(invoiceItems);
      invoiceItemsInsertError = result.error;
    }

    if (invoiceItemsInsertError) {
      return NextResponse.json(
        {
          ok: false,
          message: `Die Rechnungspositionen konnten nicht gespeichert werden: ${invoiceItemsInsertError.message}`,
        },
        { status: 500 }
      );
    }

    const { error: requestUpdateError } = await supabase
      .from("school_requests")
      .update({
        invoice_status: "draft",
        payment_status: "waiting_for_payment",
        selected_payment_method: paymentMethod,
        latest_invoice_id: invoice.id,
        shipping_amount: shippingAmount,
        discount_campaign_id: appliedDiscount.campaignId,
        discount_amount: discountAmount,
        invoice_total_amount: totalAmount,
        updated_at: now,
      })
      .eq("id", requestId);

    if (requestUpdateError) {
      return NextResponse.json(
        {
          ok: false,
          message: `Die Shop-Bestellung wurde angelegt, aber der Rechnungsstatus konnte nicht aktualisiert werden: ${requestUpdateError.message}`,
        },
        { status: 500 }
      );
    }

    if (!invoice.invoice_token) {
      return NextResponse.json({ ok: false, message: "Die vorbereitete Rechnung besitzt keinen Zahlungslink-Token." }, { status: 500 });
    }

    const cutoverEventMetadata = {
      invoice_id: invoice.id,
      invoice_number: invoice.invoice_number,
      invoice_provider: cutoverDecision.selectedInvoiceProvider,
      invoice_cutover_version: cutoverDecision.cutoverVersion,
      selected_tax_snapshot_version:
        cutoverDecision.selectedTaxSnapshotVersion,
      cutover_reached: cutoverDecision.cutoverReached,
      cutover_at: cutoverDecision.cutoverAt,
      source: "shop_checkout",
    };

    await insertRequestEvent({
      supabase,
      requestId,
      eventType: "shop_order_created",
      title: "Shop-Bestellung erstellt",
      description: appliedDiscount.discountName
        ? `Shop-Bestellung mit ${
            cartItems.length
          } Positionen wurde erstellt. Zwischensumme: ${formatEuroForEvent(
            subtotalAmount
          )} EUR, Rabatt: -${formatEuroForEvent(
            discountAmount
          )} EUR, Versand: ${formatEuroForEvent(
            shippingAmount
          )} EUR, Gesamtbetrag: ${formatEuroForEvent(totalAmount)} EUR.`
        : `Shop-Bestellung mit ${
            cartItems.length
          } Positionen wurde erstellt. Gesamtbetrag: ${formatEuroForEvent(
            totalAmount
          )} EUR.`,
      metadata: cutoverEventMetadata,
      createdAt: now,
    });

    await insertRequestEvent({
      supabase,
      requestId,
      eventType: "invoice_draft_created",
      title: "Rechnung vorbereitet",
      description: appliedDiscount.discountName
        ? `Rechnung ${
            invoice.invoice_number || ""
          } wurde für die Shop-Bestellung vorbereitet. Rabattaktion: ${
            appliedDiscount.discountName
          }. Gesamtbetrag: ${formatEuroForEvent(totalAmount)} EUR.`
        : `Rechnung ${
            invoice.invoice_number || ""
          } wurde für die Shop-Bestellung vorbereitet. Gesamtbetrag: ${formatEuroForEvent(
            totalAmount
          )} EUR.`,
      metadata: cutoverEventMetadata,
      createdAt: now,
    });

    if (!nativeLexwareCheckout) {
      await sendCustomerInvoiceMailSafely({
        supabase,
        requestId,
        invoiceNumber: invoice.invoice_number,
        createdAt: now,
      });

      await sendShopOrderAdminNotificationSafely({
      supabase,
      requestId,
      requestNumber: createdRequest.request_number,
      invoiceNumber: invoice.invoice_number,
      invoiceToken: invoice.invoice_token,
      customerName,
      email,
      phone,
      childName,
      schoolName,
      className,
      fulfillmentMethod,
      itemCount: cartItems.length,
      subtotalAmount,
      shippingAmount,
      discountName: appliedDiscount.discountName,
      discountAmount,
      totalAmount,
      customerMessage,
      createdAt: now,
      });
    }

    if (preparedCart) {
      const { error: preparedCartUpdateError } = await supabase
        .from("school_prepared_carts")
        .update({
          status: "ordered",
          ordered_request_id: requestId,
          ordered_invoice_id: invoice.id,
          ordered_invoice_token: invoice.invoice_token,
          ordered_at: now,
        })
        .eq("id", preparedCart.id)
        .neq("status", "ordered");

      if (preparedCartUpdateError) {
        console.error(
          "Vorbereiteter Warenkorb konnte nicht als bestellt markiert werden:",
          preparedCartUpdateError
        );

        await insertRequestEvent({
          supabase,
          requestId,
          eventType: "prepared_cart_link_failed",
          title: "Vorbereiteter Warenkorb nicht verknüpft",
          description:
            "Die Bestellung wurde erfolgreich erstellt, aber der vorbereitete Bestandskunden-Warenkorb konnte nicht als bestellt markiert werden.",
          createdAt: now,
        });
      } else {
        await insertRequestEvent({
          supabase,
          requestId,
          eventType: "prepared_cart_ordered",
          title: "Vorbereiteter Warenkorb bestellt",
          description:
            "Die Bestellung wurde aus einem vorbereiteten Bestandskunden-Warenkorb abgeschlossen.",
          createdAt: now,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      requestId,
      requestNumber: createdRequest.request_number,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number,
      invoiceToken: invoice.invoice_token,
      invoicePending: false,
      invoiceProvider: cutoverDecision.selectedInvoiceProvider,
      invoiceAvailable: true,
      redirectUrl: `/rechnung/${encodeURIComponent(invoice.invoice_token)}`,
      subtotalAmount,
      shippingAmount,
      discountCampaignId: appliedDiscount.campaignId,
      discountName: appliedDiscount.discountName,
      discountType: appliedDiscount.discountType,
      discountValue: appliedDiscount.discountValue,
      discountAmount,
      totalAmount,
      preparedCartLinked: Boolean(preparedCart),
      cutover: {
        reached: cutoverDecision.cutoverReached,
        cutoverAt: cutoverDecision.cutoverAt,
        version: cutoverDecision.cutoverVersion,
        selectedTaxSnapshotVersion:
          cutoverDecision.selectedTaxSnapshotVersion,
        selectedInvoiceProvider:
          cutoverDecision.selectedInvoiceProvider,
      },
      message: appliedDiscount.discountName
        ? `Die Shop-Bestellung wurde erstellt. Rabattaktion "${appliedDiscount.discountName}" wurde angewendet.`
        : "Die Shop-Bestellung wurde erstellt.",
    });
  } catch (error) {
    console.error("Shop checkout error:", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Die Shop-Bestellung konnte nicht abgeschlossen werden.",
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
