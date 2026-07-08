const DEFAULT_WHATSAPP_BUSINESS_PHONE = "491733157671";
const DEFAULT_SITE_URL = "https://www.handzettel-schulen.de";

type CustomerWhatsappOptInInput = {
  requestNumber?: string | null;
  customerName?: string | null;
  offerUrl: string;
};

type AdminWhatsappUpdateInput = {
  requestNumber?: string | null;
  customerName?: string | null;
  offerUrl: string;
};

function cleanText(value: unknown) {
  return String(value || "").trim();
}

export function normalizeWhatsappPhone(
  value: string | null | undefined,
  defaultCountryCode = "49"
) {
  const rawValue = cleanText(value);

  if (!rawValue) {
    return "";
  }

  let normalized = rawValue
    .replace(/^00/, "+")
    .replace(/[^\d+]/g, "");

  if (normalized.startsWith("+")) {
    normalized = normalized.slice(1);
  }

  if (normalized.startsWith("0")) {
    normalized = defaultCountryCode + normalized.slice(1);
  }

  return normalized.replace(/\D/g, "");
}

export function getWhatsappBusinessPhone() {
  return (
    normalizeWhatsappPhone(
      process.env.NEXT_PUBLIC_WHATSAPP_BUSINESS_PHONE ||
        process.env.WHATSAPP_BUSINESS_PHONE ||
        DEFAULT_WHATSAPP_BUSINESS_PHONE
    ) || DEFAULT_WHATSAPP_BUSINESS_PHONE
  );
}

export function getSiteUrl() {
  return cleanText(
    process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.SITE_URL ||
      DEFAULT_SITE_URL
  ).replace(/\/+$/g, "");
}

export function createWhatsappLink(phone: string, text: string) {
  const normalizedPhone = normalizeWhatsappPhone(phone);

  if (!normalizedPhone) {
    return "";
  }

  return `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(text)}`;
}

export function buildCustomerWhatsappOptInText(input: CustomerWhatsappOptInInput) {
  const requestNumber = cleanText(input.requestNumber);
  const customerName = cleanText(input.customerName);

  const lines = [
    "Hallo Handzettel-Schulen.de,",
    "",
    "ich möchte Updates zu meinem Paketwunsch per WhatsApp erhalten.",
    requestNumber ? `Anfrage: ${requestNumber}` : null,
    customerName ? `Name: ${customerName}` : null,
    "",
    input.offerUrl,
  ].filter((line): line is string => line !== null);

  return lines.join("\n");
}

export function buildAdminWhatsappUpdateText(input: AdminWhatsappUpdateInput) {
  const customerName = cleanText(input.customerName);
  const requestNumber = cleanText(input.requestNumber);
  const greetingName = customerName || "zusammen";

  const lines = [
    `Hallo ${greetingName},`,
    "",
    "Dein Paketwunsch wurde aktualisiert.",
    "",
    "Du kannst ihn hier prüfen und die Bestellung abschließen:",
    "",
    input.offerUrl,
    "",
    requestNumber ? `Anfrage: ${requestNumber}` : null,
    "",
    "Viele Grüße",
    "Handzettel-Schulen.de",
  ].filter((line): line is string => line !== null);

  return lines.join("\n");
}
