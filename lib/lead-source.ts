export const LEAD_SOURCE_COOKIE_NAME = "hds_lead_source";

export type LeadSource =
  | "facebook"
  | "instagram"
  | "tiktok"
  | "google"
  | "direct"
  | "website"
  | "shop"
  | "whatsapp_manual"
  | "unknown"
  | string;

function cleanSourceValue(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

export function normalizeLeadSource(value: unknown, fallback: LeadSource = "direct"): LeadSource {
  const source = cleanSourceValue(value);

  if (!source) return fallback;

  if (source === "whatsapp_manual" || source.includes("whatsapp")) return "whatsapp_manual";

  if (
    source.includes("instagram") ||
    source === "ig" ||
    source.includes("l.instagram.com")
  ) {
    return "instagram";
  }

  if (
    source.includes("facebook") ||
    source === "fb" ||
    source.includes("fbclid") ||
    source.includes("m.facebook.com") ||
    source.includes("l.facebook.com")
  ) {
    return "facebook";
  }

  if (source.includes("tiktok") || source.includes("ttclid")) {
    return "tiktok";
  }

  if (
    source.includes("google") ||
    source.includes("gclid") ||
    source.includes("googleads") ||
    source.includes("google_cpc")
  ) {
    return "google";
  }

  if (source === "direct" || source === "direkt") return "direct";
  if (source === "website" || source === "website_upload") return "website";
  if (source === "shop" || source.startsWith("shop_")) return source;

  return fallback;
}

export function buildShopLeadSource(value: unknown) {
  const normalized = normalizeLeadSource(value, "direct");

  if (normalized === "whatsapp_manual") return "shop";
  if (normalized === "shop" || String(normalized).startsWith("shop_")) {
    return String(normalized);
  }

  return `shop_${normalized}`;
}

export function getLeadSourceLabel(value: unknown) {
  const source = cleanSourceValue(value);

  switch (source) {
    case "facebook":
      return "Facebook";
    case "shop_facebook":
      return "Shop · Facebook";
    case "instagram":
      return "Instagram";
    case "shop_instagram":
      return "Shop · Instagram";
    case "tiktok":
      return "TikTok";
    case "shop_tiktok":
      return "Shop · TikTok";
    case "google":
      return "Google";
    case "shop_google":
      return "Shop · Google";
    case "direct":
      return "Direkt";
    case "shop_direct":
      return "Shop · Direkt";
    case "website":
    case "website_upload":
      return "Website";
    case "shop":
    case "shop_unknown":
      return "Shop";
    case "whatsapp_manual":
      return "WhatsApp manuell";
    default:
      return source ? source.replace(/_/g, " ") : "Unbekannt";
  }
}

export function getLeadSourceBadgeClass(value: unknown) {
  const source = cleanSourceValue(value);

  if (source.includes("facebook")) return "border-[#C8D8E8] bg-[#EEF4FA] text-[#12395F]";
  if (source.includes("instagram")) return "border-[#F1C4DA] bg-[#FFF0F7] text-[#9B2F62]";
  if (source.includes("tiktok")) return "border-[#D9D2EA] bg-[#F6F2FF] text-[#503C8A]";
  if (source.includes("google")) return "border-[#F1D1A8] bg-[#FFF8EE] text-[#A75B28]";
  if (source.includes("shop")) return "border-[#C8D8E8] bg-[#EEF4FA] text-[#12395F]";
  if (source.includes("whatsapp")) return "border-[#BFE3CD] bg-[#F0FFF6] text-[#2F7D50]";

  return "border-[#E8DED2] bg-white text-[#52616F]";
}
