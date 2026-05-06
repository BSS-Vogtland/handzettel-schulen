export type SchoolRequestSource = "website" | "whatsapp";

export type SchoolRequestStatus =
  | "received"
  | "analysis_pending"
  | "analysis_running"
  | "analysis_done"
  | "manual_review"
  | "offer_created"
  | "offer_sent"
  | "confirmed"
  | "cancelled";

export type SchoolRequest = {
  id: string;
  request_number: string | null;
  source: SchoolRequestSource;
  status: SchoolRequestStatus;

  customer_name: string | null;
  child_name: string | null;
  school_name: string | null;
  class_name: string | null;
  email: string | null;
  phone: string | null;
  message: string | null;

  offer_token: string;
  ai_status: string;
  offer_status: string;

  created_at: string;
  updated_at: string;
};

export function getPublicOfferUrl(token: string) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return `${siteUrl}/angebot/${token}`;
}

export function getStatusLabel(status: string) {
  switch (status) {
    case "received":
      return "Eingegangen";
    case "analysis_pending":
      return "Analyse wartet";
    case "analysis_running":
      return "Analyse läuft";
    case "analysis_done":
      return "Analyse abgeschlossen";
    case "manual_review":
      return "Prüfung nötig";
    case "offer_created":
      return "Angebot erstellt";
    case "offer_sent":
      return "Angebot gesendet";
    case "confirmed":
      return "Bestätigt";
    case "cancelled":
      return "Abgebrochen";
    default:
      return status;
  }
}