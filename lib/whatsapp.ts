export const DEFAULT_WHATSAPP_BUSINESS_PHONE = "491733157671";

export function normalizeWhatsappPhone(value: unknown, defaultCountryCode = "49") {
  let digits = String(value || "").replace(/[^\d]/g, "");

  if (!digits) return "";

  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }

  if (digits.startsWith("0")) {
    return defaultCountryCode + digits.slice(1);
  }

  if (digits.startsWith(defaultCountryCode)) {
    return digits;
  }

  if (defaultCountryCode === "49" && digits.startsWith("1")) {
    return defaultCountryCode + digits;
  }

  return digits;
}

export function getWhatsappBusinessPhone() {
  return normalizeWhatsappPhone(
    process.env.NEXT_PUBLIC_WHATSAPP_BUSINESS_PHONE ||
      process.env.WHATSAPP_BUSINESS_PHONE ||
      DEFAULT_WHATSAPP_BUSINESS_PHONE
  );
}

export function getSiteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    "https://www.handzettel-schulen.de"
  ).replace(/\/+$/, "");
}

export function createWhatsappLink(phone: unknown, text: string) {
  const normalizedPhone = normalizeWhatsappPhone(phone);

  if (!normalizedPhone) return "";

  return "https://wa.me/" + normalizedPhone + "?text=" + encodeURIComponent(text);
}

export function buildCustomerWhatsappOptInText(input: {
  requestNumber?: string | null;
  customerName?: string | null;
  offerUrl?: string | null;
}) {
  return [
    "Hallo Handzettel-Schulen.de,",
    "",
    "ich möchte WhatsApp-Updates zu meinem Paketwunsch erhalten.",
    input.requestNumber ? "Anfrage: " + input.requestNumber : null,
    input.customerName ? "Name: " + input.customerName : null,
    input.offerUrl ? "Link: " + input.offerUrl : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildAdminWhatsappUpdateText(input: {
  customerName?: string | null;
  requestNumber?: string | null;
  offerUrl?: string | null;
}) {
  const salutation = input.customerName
    ? "Hallo " + input.customerName + ","
    : "Hallo,";

  return [
    salutation,
    "",
    "Dein Paketwunsch wurde aktualisiert.",
    "Du kannst ihn hier prüfen:",
    input.offerUrl || null,
    "",
    input.requestNumber ? "Anfrage: " + input.requestNumber : null,
    "",
    "Viele Grüße",
    "Handzettel-Schulen.de",
  ]
    .filter((line) => line !== null)
    .join("\n");
}
