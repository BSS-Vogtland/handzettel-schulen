export type PreparedCartCheckoutContext = {
  token: string;

  customerName: string;
  email: string;
  phone: string;

  billingName: string;
  billingEmail: string;
  billingPhone: string;
  billingStreet: string;
  billingPostalCode: string;
  billingCity: string;

  shippingAddressDiffers: boolean;
  shippingName: string;
  shippingStreet: string;
  shippingPostalCode: string;
  shippingCity: string;

  childName: string;
  schoolName: string;
  className: string;

  fulfillmentMethod: "pickup" | "shipping";
  paymentMethod: "paypal" | "bank_transfer";

  customerMessage: string;
};

export const PREPARED_CART_CHECKOUT_KEY =
  "handzettel_schulen_prepared_cart_checkout_v1";

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeContext(
  value: unknown
): PreparedCartCheckoutContext | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const context = value as Partial<PreparedCartCheckoutContext>;
  const token = normalizeString(context.token);

  if (!token) {
    return null;
  }

  return {
    token,

    customerName: normalizeString(context.customerName),
    email: normalizeString(context.email),
    phone: normalizeString(context.phone),

    billingName: normalizeString(context.billingName),
    billingEmail: normalizeString(context.billingEmail),
    billingPhone: normalizeString(context.billingPhone),
    billingStreet: normalizeString(context.billingStreet),
    billingPostalCode: normalizeString(context.billingPostalCode),
    billingCity: normalizeString(context.billingCity),

    shippingAddressDiffers: Boolean(context.shippingAddressDiffers),
    shippingName: normalizeString(context.shippingName),
    shippingStreet: normalizeString(context.shippingStreet),
    shippingPostalCode: normalizeString(context.shippingPostalCode),
    shippingCity: normalizeString(context.shippingCity),

    childName: normalizeString(context.childName),
    schoolName: normalizeString(context.schoolName),
    className: normalizeString(context.className),

    fulfillmentMethod:
      context.fulfillmentMethod === "shipping" ? "shipping" : "pickup",

    paymentMethod:
      context.paymentMethod === "bank_transfer"
        ? "bank_transfer"
        : "paypal",

    customerMessage: normalizeString(context.customerMessage),
  };
}

export function readPreparedCartCheckoutContext() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(PREPARED_CART_CHECKOUT_KEY);

    if (!raw) {
      return null;
    }

    return normalizeContext(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writePreparedCartCheckoutContext(
  context: PreparedCartCheckoutContext
) {
  if (typeof window === "undefined") {
    return;
  }

  const normalized = normalizeContext(context);

  if (!normalized) {
    return;
  }

  window.localStorage.setItem(
    PREPARED_CART_CHECKOUT_KEY,
    JSON.stringify(normalized)
  );
}

export function clearPreparedCartCheckoutContext() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(PREPARED_CART_CHECKOUT_KEY);
}