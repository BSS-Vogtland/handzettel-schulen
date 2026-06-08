import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Banknote,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  Eye,
  FileText,
  MailCheck,
  MapPin,
  MessageCircle,
  PackageCheck,
  ReceiptText,
  RefreshCw,
  School,
  ShoppingBasket,
  Sparkles,
  Truck,
  User,
  Wrench,
} from "lucide-react";
import CopyOfferLinkButton from "@/components/CopyOfferLinkButton";
import DeleteRequestButton from "@/components/DeleteRequestButton";

export const dynamic = "force-dynamic";

type SchoolRequest = {
  id: string;
  request_number: string | null;
  source: string | null;
  status: string | null;

  customer_name: string | null;
  name?: string | null;
  parent_name?: string | null;
  guardian_name?: string | null;
  contact_name?: string | null;

  child_name: string | null;
  school_name: string | null;
  class_name: string | null;

  email: string | null;
  customer_email?: string | null;
  parent_email?: string | null;
  contact_email?: string | null;
  guardian_email?: string | null;

  phone: string | null;
  message: string | null;
  offer_token: string | null;
  ai_status: string | null;
  offer_status: string | null;

  fulfillment_method?: string | null;
  fulfillment_status?: string | null;
  picking_status?: string | null;
  shipping_cost_status?: string | null;
  pickup_location_label?: string | null;
  pickup_address_snapshot?: string | null;
  pickup_maps_url_snapshot?: string | null;
  confirmed_at?: string | null;
  picking_started_at?: string | null;
  picked_at?: string | null;
  packed_at?: string | null;
  shipped_at?: string | null;
  picked_up_at?: string | null;

  latest_invoice_id?: string | null;
  invoice_status?: string | null;
  invoice_sent_at?: string | null;
  invoice_total_amount?: number | string | null;
  shipping_amount?: number | string | null;
  payment_status?: string | null;
  selected_payment_method?: string | null;
  payment_due_at?: string | null;
  cash_pickup_due_at?: string | null;
  payment_received_at?: string | null;

  created_at: string | null;
  updated_at: string | null;
};

type RequestFile = {
  id: string;
  request_id: string;
  original_filename: string | null;
  file_type: string | null;
  file_size: number | null;
  created_at: string | null;
};

type RequestItem = {
  id: string;
  request_id: string;
  raw_text: string | null;
  normalized_name: string | null;
  quantity: number | string | null;
  status: string | null;
};

type RequestMatch = {
  id: string;
  request_item_id: string;
  product_id: string | null;
  product_name: string | null;
  match_score: number | string | null;
  selected: boolean | null;
};

type OfferItem = {
  id: string;
  request_id: string;
  request_item_id: string | null;
  match_id: string | null;
  product_name: string;
  product_sku: string | null;
  product_price: number | string | null;
  quantity: number | string | null;
  source: string | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type EventRow = {
  id: string;
  request_id: string;
  event_type?: string | null;
  type?: string | null;
  message: string | null;
  title?: string | null;
  description?: string | null;
  created_at: string | null;
};

type RequestQuestion = {
  id: string;
  request_id: string;
  request_item_id: string | null;
  question_text: string | null;
  answer_text: string | null;
  status: string | null;
  created_at: string | null;
  answered_at: string | null;
  resolved_at: string | null;
  updated_at: string | null;
};

type RequestOverview = {
  request: SchoolRequest;
  fileCount: number;
  firstFileName: string | null;
  itemCount: number;
  matchCount: number;
  offerItemCount: number;
  customerSelectedCount: number;
  adminManualCount: number;
  manualReviewCount: number;
  openWithMatchesCount: number;
  latestEvent: EventRow | null;
  events: EventRow[];
  questions: RequestQuestion[];
  questionCount: number;
  openQuestionCount: number;
  answeredQuestionCount: number;
  resolvedQuestionCount: number;
  totalPrice: number;
  hasAdminEdits: boolean;
};

type WorkflowStatus = {
  area: "open" | "fulfillment";
  title: string;
  subtitle: string;
  badge: string;
  tone: "neutral" | "blue" | "amber" | "green" | "red";
  icon: typeof ClipboardList;
};

type AdminRequestsPageProps = {
  searchParams?: Promise<{
    filter?: string | string[];
  }>;
};

type AdminFilter =
  | "all"
  | "questions-answered"
  | "questions-open"
  | "manual"
  | "payment-open"
  | "paid"
  | "packable"
  | "shipping"
  | "pickup"
  | "completed";

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

function toNumber(value: unknown, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function cleanText(value: unknown) {
  const text = String(value || "").trim();
  return text.length > 0 ? text : null;
}

function formatMoney(value: unknown) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(toNumber(value, 0));
}

function formatDateTime(value: string | null) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDate(value: string | null) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function getCustomerDisplayName(request: SchoolRequest) {
  return (
    cleanText(request.customer_name) ||
    cleanText(request.parent_name) ||
    cleanText(request.guardian_name) ||
    cleanText(request.contact_name) ||
    cleanText(request.name) ||
    "Nicht angegeben"
  );
}

function getCustomerDisplayContact(request: SchoolRequest) {
  return (
    cleanText(request.email) ||
    cleanText(request.customer_email) ||
    cleanText(request.parent_email) ||
    cleanText(request.contact_email) ||
    cleanText(request.guardian_email) ||
    cleanText(request.phone) ||
    "Kein Kontakt"
  );
}

function getEventType(event: EventRow | null) {
  if (!event) return "";
  return String(event.event_type || event.type || "").toLowerCase();
}

function getEventText(event: EventRow | null) {
  if (!event) return "";

  return [
    event.event_type || "",
    event.type || "",
    event.message || "",
    event.title || "",
    event.description || "",
  ]
    .join(" ")
    .toLowerCase();
}

function hasEvent(
  overview: RequestOverview,
  matcher: (event: EventRow) => boolean
) {
  return overview.events.some(matcher);
}

function isPackageWishlistMailEvent(event: EventRow) {
  const type = getEventType(event);
  const text = getEventText(event);

  return (
    type.includes("package_wishlist_mail_sent") ||
    type.includes("offer_link_email_sent") ||
    type.includes("offer_update_mail_sent") ||
    text.includes("paketwunsch-mail") ||
    text.includes("paketwunsch-link") ||
    text.includes("prüflink") ||
    text.includes("prueflink") ||
    text.includes("kundenseite")
  );
}

function isRequestReceivedMailEvent(event: EventRow) {
  const type = getEventType(event);
  const text = getEventText(event);

  return (
    type.includes("request_received_mail_sent") ||
    text.includes("eingangsmail") ||
    text.includes("liste ist angekommen")
  );
}

function isWhatsappPrepareEvent(event: EventRow) {
  const type = getEventType(event);
  const text = getEventText(event);

  return (
    type.includes("whatsapp_prepare_done") ||
    text.includes("whatsapp-liste wurde ausgewertet") ||
    text.includes("sichere treffer wurden in den paketwunsch übernommen")
  );
}

function isUpdateMailEvent(event: EventRow) {
  return isPackageWishlistMailEvent(event);
}

function isUpdatedOfferConfirmedEvent(event: EventRow) {
  const type = getEventType(event);
  const text = getEventText(event);

  return (
    type.includes("offer_update_confirmed") ||
    text.includes("aktualisiertes angebot bestätigt") ||
    text.includes("aktualisiertes angebot offiziell angenommen")
  );
}

function getFulfillmentMethodLabel(method?: string | null) {
  if (method === "pickup") return "Abholung";
  if (method === "shipping") return "Versand";
  return "Übergabe offen";
}

function getPickingStatusLabel(status?: string | null) {
  switch (status) {
    case "picking":
      return "Picking läuft";
    case "picked":
      return "Gepickt";
    case "packed":
      return "Gepackt";
    default:
      return "Picking offen";
  }
}

function getFulfillmentStatusLabel(status?: string | null) {
  switch (status) {
    case "pickup_requested":
      return "Abholung gewünscht";
    case "shipping_requested":
      return "Versand gewünscht";
    case "ready_for_pickup":
      return "Abholbereit";
    case "shipping_ready":
      return "Versandbereit";
    case "shipped":
      return "Versendet";
    case "picked_up":
      return "Abgeholt";
    default:
      return "Abwicklung offen";
  }
}

function getInvoiceStatusLabel(status?: string | null) {
  switch (status) {
    case "draft":
      return "Rechnung vorbereitet";
    case "sent":
      return "Rechnung gesendet";
    case "paid":
      return "Rechnung bezahlt";
    case "cancelled":
      return "Rechnung storniert";
    default:
      return "Rechnung offen";
  }
}

function getPaymentMethodLabel(method?: string | null) {
  switch (method) {
    case "paypal":
      return "PayPal";
    case "bank_transfer":
      return "Überweisung";
    case "cash_on_pickup":
      return "Bar bei Abholung";
    default:
      return "Noch nicht gewählt";
  }
}

function getPaymentStatusLabel(status?: string | null) {
  switch (status) {
    case "not_selected":
      return "Zahlungsart offen";
    case "waiting_for_payment":
      return "Wartet auf Zahlung";
    case "payment_received":
      return "Bezahlt";
    case "cash_on_pickup":
      return "Barzahlung bei Abholung";
    case "cash_paid":
      return "Bar bezahlt";
    case "overdue":
      return "Überfällig";
    case "payment_failed":
      return "Zahlung fehlgeschlagen";
    case "payment_refunded":
      return "Erstattet";
    case "payment_reversed":
      return "Zurückgebucht";
    case "cancelled":
      return "Zahlung abgebrochen";
    default:
      return status || "Noch keine Rechnung";
  }
}

function getPaymentSubtitle(request: SchoolRequest) {
  const method = getPaymentMethodLabel(request.selected_payment_method);
  const amount =
    request.invoice_total_amount !== null &&
    request.invoice_total_amount !== undefined &&
    request.invoice_total_amount !== ""
      ? formatMoney(request.invoice_total_amount)
      : null;

  switch (request.payment_status) {
    case "payment_received":
      return `Bezahlt per ${method}${amount ? ` · ${amount}` : ""}`;
    case "cash_paid":
      return `Barzahlung erhalten${amount ? ` · ${amount}` : ""}`;
    case "waiting_for_payment":
      return `${method} gewählt${amount ? ` · ${amount}` : ""}`;
    case "cash_on_pickup":
      return `Barzahlung bei Abholung${amount ? ` · ${amount}` : ""}`;
    case "not_selected":
      return `Rechnung versendet · Zahlungsart noch offen${
        amount ? ` · ${amount}` : ""
      }`;
    case "overdue":
      return `Zahlung überfällig${amount ? ` · ${amount}` : ""}`;
    case "payment_failed":
      return `PayPal/Online-Zahlung fehlgeschlagen${
        amount ? ` · ${amount}` : ""
      }`;
    case "payment_refunded":
      return `Zahlung wurde erstattet${amount ? ` · ${amount}` : ""}`;
    case "payment_reversed":
      return `Zahlung wurde zurückgebucht${amount ? ` · ${amount}` : ""}`;
    case "cancelled":
      return `Zahlung wurde abgebrochen${amount ? ` · ${amount}` : ""}`;
    default:
      if (request.invoice_status === "sent") {
        return `Rechnung versendet${amount ? ` · ${amount}` : ""}`;
      }

      if (request.invoice_status === "draft") {
        return `Rechnung vorbereitet${amount ? ` · ${amount}` : ""}`;
      }

      return "Noch keine Rechnung vorbereitet";
  }
}

function getPaymentBoxClasses(status?: string | null) {
  switch (status) {
    case "payment_received":
    case "cash_paid":
      return {
        wrap: "border-[#BFE3CD] bg-[#F0FFF6]",
        icon: "bg-white text-[#2F7D50]",
        title: "text-[#1F5D3A]",
        badge: "bg-white text-[#2F7D50] border-[#BFE3CD]",
      };
    case "waiting_for_payment":
    case "not_selected":
    case "cash_on_pickup":
      return {
        wrap: "border-[#F1D1A8] bg-[#FFF8EE]",
        icon: "bg-white text-[#A75B28]",
        title: "text-[#8A4A1F]",
        badge: "bg-white text-[#A75B28] border-[#F1D1A8]",
      };
    case "overdue":
    case "payment_failed":
    case "payment_refunded":
    case "payment_reversed":
    case "cancelled":
      return {
        wrap: "border-[#F2B8B8] bg-[#FFF1F1]",
        icon: "bg-white text-[#B5282D]",
        title: "text-[#B5282D]",
        badge: "bg-white text-[#B5282D] border-[#F2B8B8]",
      };
    default:
      return {
        wrap: "border-[#E8DED2] bg-[#FBF7F0]",
        icon: "bg-white text-[#52616F]",
        title: "text-[#102A43]",
        badge: "bg-white text-[#52616F] border-[#E8DED2]",
      };
  }
}

function getPaymentIcon(request: SchoolRequest) {
  if (request.selected_payment_method === "paypal") return CreditCard;
  if (request.selected_payment_method === "bank_transfer") return Banknote;
  if (request.selected_payment_method === "cash_on_pickup") return Banknote;
  return ReceiptText;
}

function isConfirmedRequest(overview: RequestOverview) {
  return (
    overview.request.status === "confirmed" ||
    overview.request.offer_status === "confirmed" ||
    hasEvent(overview, isUpdatedOfferConfirmedEvent)
  );
}

function isPaidRequest(overview: RequestOverview) {
  return (
    overview.request.payment_status === "payment_received" ||
    overview.request.payment_status === "cash_paid"
  );
}

function isWaitingPaymentRequest(overview: RequestOverview) {
  return (
    overview.request.payment_status === "waiting_for_payment" ||
    overview.request.payment_status === "not_selected" ||
    overview.request.payment_status === "cash_on_pickup"
  );
}

function isProblemPaymentRequest(overview: RequestOverview) {
  return (
    overview.request.payment_status === "overdue" ||
    overview.request.payment_status === "payment_failed" ||
    overview.request.payment_status === "payment_refunded" ||
    overview.request.payment_status === "payment_reversed" ||
    overview.request.payment_status === "cancelled"
  );
}

function isCompletedRequest(overview: RequestOverview) {
  return (
    overview.request.fulfillment_status === "shipped" ||
    overview.request.fulfillment_status === "picked_up"
  );
}

function isManualReviewRequest(overview: RequestOverview) {
  return (
    overview.manualReviewCount > 0 || overview.request.status === "manual_review"
  );
}

function isPackableRequest(overview: RequestOverview) {
  const request = overview.request;

  if (!isConfirmedRequest(overview)) return false;
  if (isCompletedRequest(overview)) return false;

  const paid = isPaidRequest(overview);
  const cashAllowedForPickup =
    request.selected_payment_method === "cash_on_pickup" &&
    request.payment_status === "cash_on_pickup" &&
    request.fulfillment_method === "pickup";

  return paid || cashAllowedForPickup;
}

function isShippingRequest(overview: RequestOverview) {
  return overview.request.fulfillment_method === "shipping";
}

function isPickupRequest(overview: RequestOverview) {
  return overview.request.fulfillment_method === "pickup";
}

function hasAnsweredQuestions(overview: RequestOverview) {
  return overview.answeredQuestionCount > 0;
}

function hasOpenQuestions(overview: RequestOverview) {
  return overview.openQuestionCount > 0;
}

function hasResolvedQuestions(overview: RequestOverview) {
  return overview.resolvedQuestionCount > 0;
}

function getOperationalHint(overview: RequestOverview) {
  const request = overview.request;

  if (hasAnsweredQuestions(overview)) {
    return {
      label: "Antwort eingegangen",
      text: "Der Kunde hat eine Rückfrage beantwortet. Bitte prüfen und die Position abschließen.",
      className: "border-[#BFE3CD] bg-[#F0FFF6] text-[#2F7D50]",
    };
  }

  if (hasOpenQuestions(overview)) {
    return {
      label: "Rückfrage offen",
      text: "Es wartet noch eine Rückfrage auf Kundenantwort. Vorgang beobachten, noch nicht final abschließen.",
      className: "border-[#F1D1A8] bg-[#FFF8EE] text-[#A75B28]",
    };
  }

  if (isManualReviewRequest(overview)) {
    return {
      label: "Manuelle Prüfung",
      text: "Es gibt offene Listenpositionen ohne sicheren Produktvorschlag.",
      className: "border-[#F1D1A8] bg-[#FFF8EE] text-[#A75B28]",
    };
  }

  if (isProblemPaymentRequest(overview)) {
    return {
      label: "Zahlungsproblem",
      text: "Bitte Zahlungsstatus prüfen, bevor weiter gepackt oder übergeben wird.",
      className: "border-[#F2B8B8] bg-[#FFF1F1] text-[#B5282D]",
    };
  }

  if (isCompletedRequest(overview)) {
    return {
      label: "Abgeschlossen",
      text: "Der Vorgang wurde bereits versendet oder abgeholt.",
      className: "border-[#BFE3CD] bg-[#F0FFF6] text-[#2F7D50]",
    };
  }

  if (isPackableRequest(overview)) {
    if (request.picking_status === "packed") {
      return {
        label: "Bereit zur Übergabe",
        text: "Das Paket ist gepackt. Jetzt Abholung oder Versand final abschließen.",
        className: "border-[#C8D8E8] bg-[#EEF4FA] text-[#12395F]",
      };
    }

    return {
      label: "Packen möglich",
      text: "Zahlung/Freigabe passt. Picking und Packen können bearbeitet werden.",
      className: "border-[#BFE3CD] bg-[#F0FFF6] text-[#2F7D50]",
    };
  }

  if (isConfirmedRequest(overview) && isWaitingPaymentRequest(overview)) {
    return {
      label: "Wartet auf Zahlung",
      text: "Nicht packen/versenden, bevor Zahlungseingang oder Barfreigabe passt.",
      className: "border-[#F1D1A8] bg-[#FFF8EE] text-[#A75B28]",
    };
  }

  if (request.invoice_status === "sent" && !request.payment_status) {
    return {
      label: "Rechnung gesendet",
      text: "Rechnung ist raus. Zahlungsstatus ist noch nicht gesetzt.",
      className: "border-[#F1D1A8] bg-[#FFF8EE] text-[#A75B28]",
    };
  }

  if (request.invoice_status === "draft") {
    return {
      label: "Rechnung vorbereitet",
      text: "Rechnung ist vorbereitet, aber noch nicht final versendet.",
      className: "border-[#C8D8E8] bg-[#EEF4FA] text-[#12395F]",
    };
  }

  if (hasEvent(overview, isPackageWishlistMailEvent)) {
    return {
      label: "Wartet auf Kunde",
      text: "Der Paketwunsch-Link wurde gesendet. Kunde muss Paketwunsch prüfen und bestätigen.",
      className: "border-[#F1D1A8] bg-[#FFF8EE] text-[#A75B28]",
    };
  }

  if (hasEvent(overview, isWhatsappPrepareEvent) || overview.offerItemCount > 0) {
    return {
      label: "Paketwunsch vorbereitet",
      text: "Als nächstes Paketwunsch-Mail senden oder fehlende Positionen prüfen.",
      className: "border-[#C8D8E8] bg-[#EEF4FA] text-[#12395F]",
    };
  }

  return {
    label: "Neu / offen",
    text: "Der Vorgang wartet auf Auswertung, Kundenauswahl oder Admin-Bearbeitung.",
    className: "border-[#E8DED2] bg-white text-[#52616F]",
  };
}

function getEventTypeLabel(event: EventRow | null) {
  if (!event) return "Noch kein Verlauf";

  const type = event.event_type || event.type;

  switch (type) {
    case "request_received":
      return "Materialliste eingegangen";
    case "request_received_mail_sent":
      return "Eingangsmail versendet";
    case "whatsapp_manual_import_created":
      return "WhatsApp-Anfrage importiert";
    case "whatsapp_prepare_started":
      return "WhatsApp-Auswertung gestartet";
    case "whatsapp_prepare_done":
      return "WhatsApp-Liste vorbereitet";
    case "whatsapp_prepare_needs_manual_review":
      return "WhatsApp-Anfrage braucht Prüfung";
    case "package_wishlist_mail_sent":
      return "Paketwunsch-Mail versendet";
    case "offer_link_email_sent":
      return "Paketwunsch-Link per E-Mail gesendet";
    case "offer_link_email_failed":
      return "E-Mail-Versand fehlgeschlagen";
    case "offer_link_email_skipped":
      return "E-Mail-Versand übersprungen";
    case "customer_prepare_started":
      return "Kunde hat Auswertung gestartet";
    case "customer_prepare_done":
      return "Auswertung abgeschlossen";
    case "customer_product_selected":
      return "Kunde hat Produkt gewählt";
    case "customer_product_search_selected":
      return "Kunde hat Produkt gesucht";
    case "customer_package_submitted_manual_review":
      return "Paketwunsch abgesendet · manuelle Prüfung nötig";
    case "offer_confirmed":
      return "Paketwunsch bestätigt";
    case "offer_confirmed_complete_customer_selection":
      return "Paketwunsch vollständig bestätigt";
    case "offer_update_mail_sent":
      return "Paketwunsch-Mail versendet";
    case "offer_update_confirmed":
      return "Paketwunsch bestätigt";
    case "invoice_created":
      return "Rechnung erstellt";
    case "invoice_mail_sent":
      return "Rechnung per Mail versendet";
    case "payment_method_selected":
      return "Zahlungsart gewählt";
    case "paypal_payment_started":
      return "PayPal-Zahlung gestartet";
    case "paypal_payment_completed":
      return "PayPal-Zahlung abgeschlossen";
    case "paypal_webhook_payment_completed":
      return "PayPal-Zahlung per Webhook bestätigt";
    case "paypal_payment_cancelled":
      return "PayPal-Zahlung abgebrochen";
    case "admin_payment_marked_paid":
      return "Zahlung manuell als bezahlt markiert";
    case "admin_cash_payment_marked_paid":
      return "Barzahlung erhalten markiert";
    case "cash_on_pickup_allowed":
      return "Barzahlung bei Abholung freigegeben";
    case "fulfillment_start_picking":
      return "Picking gestartet";
    case "fulfillment_mark_picked":
      return "Artikel gepickt";
    case "fulfillment_mark_packed":
      return "Paket gepackt";
    case "fulfillment_ready_for_pickup":
      return "Paket abholbereit";
    case "fulfillment_mark_picked_up":
      return "Paket abgeholt";
    case "fulfillment_ready_for_shipping":
      return "Paket versandbereit";
    case "fulfillment_mark_shipped":
      return "Paket versendet";
    case "admin_manual_offer_item_added":
      return "Admin hat Position ergänzt";
    case "admin_offer_item_deleted":
      return "Admin hat Position gelöscht";
    case "admin_offer_item_updated":
      return "Admin hat Position bearbeitet";
    case "request_item_question_created":
      return "Rückfrage gestellt";
    case "request_item_question_mail_sent":
      return "Rückfrage-Mail versendet";
    case "request_item_question_answered":
      return "Rückfrage beantwortet";
    case "request_item_question_answer_notification_sent":
      return "Admin über Antwort informiert";
    case "request_item_question_resolved":
      return "Rückfrage erledigt";
    default:
      return type || "Ereignis";
  }
}

function getWorkflowStatus(overview: RequestOverview): WorkflowStatus {
  const request = overview.request;
  const isConfirmed = isConfirmedRequest(overview);

  if (hasAnsweredQuestions(overview)) {
    return {
      area: "open",
      title: "Rückfrage beantwortet",
      subtitle:
        "Der Kunde hat eine Rückfrage beantwortet. Öffne die Anfrage, prüfe die Antwort und löse die Position auf.",
      badge: `${overview.answeredQuestionCount} Antwort${overview.answeredQuestionCount === 1 ? "" : "en"}`,
      tone: "green",
      icon: MessageCircle,
    };
  }

  if (hasOpenQuestions(overview)) {
    return {
      area: "open",
      title: "Wartet auf Rückfrage-Antwort",
      subtitle:
        "Eine Rückfrage wurde gestellt. Der Kunde muss die fehlenden Informationen noch nachreichen.",
      badge: `${overview.openQuestionCount} offen`,
      tone: "amber",
      icon: MessageCircle,
    };
  }

  const hasRequestReceivedMail = hasEvent(overview, isRequestReceivedMailEvent);

  const hasPreparedWhatsappRequest = hasEvent(overview, isWhatsappPrepareEvent);

  const hasPackageWishlistMail =
    hasEvent(overview, isPackageWishlistMailEvent) ||
    request.offer_status === "offer_sent";

  if (isProblemPaymentRequest(overview)) {
    return {
      area: isConfirmed ? "fulfillment" : "open",
      title: "Zahlungsproblem prüfen",
      subtitle:
        "Der Zahlungsstatus ist auffällig. Bitte prüfen, bevor dieser Vorgang weiter bearbeitet wird.",
      badge: getPaymentStatusLabel(request.payment_status),
      tone: "red",
      icon: AlertTriangle,
    };
  }

  if (isConfirmed) {
    if (request.fulfillment_status === "picked_up") {
      return {
        area: "fulfillment",
        title: "Abgeholt",
        subtitle:
          "Der Kunde hat Abholung gewählt und das Schulpaket wurde als abgeholt markiert.",
        badge: "Abgeschlossen",
        tone: "green",
        icon: CheckCircle2,
      };
    }

    if (request.fulfillment_status === "shipped") {
      return {
        area: "fulfillment",
        title: "Versendet",
        subtitle:
          "Der Kunde hat Versand gewählt und das Schulpaket wurde als versendet markiert.",
        badge: "Abgeschlossen",
        tone: "green",
        icon: Truck,
      };
    }

    if (isWaitingPaymentRequest(overview) && !isPackableRequest(overview)) {
      return {
        area: "fulfillment",
        title: "Wartet auf Zahlung",
        subtitle:
          "Der Paketwunsch ist bestätigt, aber Picking/Versand bleiben bis Zahlungseingang gesperrt.",
        badge: getPaymentStatusLabel(request.payment_status),
        tone: "amber",
        icon: ReceiptText,
      };
    }

    if (request.fulfillment_status === "ready_for_pickup") {
      return {
        area: "fulfillment",
        title: "Abholbereit",
        subtitle:
          "Der Paketwunsch ist bestätigt und das Paket ist zur Abholung vorbereitet.",
        badge: "Abholbereit",
        tone: "green",
        icon: MapPin,
      };
    }

    if (request.fulfillment_status === "shipping_ready") {
      return {
        area: "fulfillment",
        title: "Versandbereit",
        subtitle:
          "Der Paketwunsch ist bestätigt und das Paket ist für den Versand vorbereitet.",
        badge: "Versandbereit",
        tone: "blue",
        icon: Truck,
      };
    }

    if (request.picking_status === "packed") {
      return {
        area: "fulfillment",
        title: "Paket gepackt",
        subtitle:
          "Der Paketwunsch ist bestätigt. Die Artikel wurden gepackt und warten auf Abholung oder Versand.",
        badge: getFulfillmentMethodLabel(request.fulfillment_method),
        tone: "blue",
        icon: PackageCheck,
      };
    }

    if (request.picking_status === "picked") {
      return {
        area: "fulfillment",
        title: "Artikel gepickt",
        subtitle:
          "Der Paketwunsch ist bestätigt. Die Artikel wurden gepickt und können jetzt gepackt werden.",
        badge: "Gepickt",
        tone: "blue",
        icon: ShoppingBasket,
      };
    }

    if (request.picking_status === "picking") {
      return {
        area: "fulfillment",
        title: "Picking läuft",
        subtitle:
          "Der Paketwunsch ist bestätigt. Die Pickingliste wird gerade abgearbeitet.",
        badge: "Picking",
        tone: "amber",
        icon: ShoppingBasket,
      };
    }

    if (request.fulfillment_method === "pickup") {
      return {
        area: "fulfillment",
        title: "Paketwunsch bestätigt · Abholung",
        subtitle:
          "Der Kunde möchte im Laden abholen. Pickingliste erstellen und Paket zur Abholung vorbereiten.",
        badge: "Abholung",
        tone: "green",
        icon: MapPin,
      };
    }

    if (request.fulfillment_method === "shipping") {
      return {
        area: "fulfillment",
        title: "Paketwunsch bestätigt · Versand",
        subtitle:
          "Der Kunde möchte Versand. Zahlung prüfen, Pickingliste abarbeiten und Paket versenden.",
        badge: "Versand",
        tone: "green",
        icon: Truck,
      };
    }

    return {
      area: "fulfillment",
      title: "Paketwunsch bestätigt",
      subtitle:
        "Der Kunde hat den Paketwunsch offiziell bestätigt. Rechnung, Zahlung, Picking und Abwicklung können jetzt bearbeitet werden.",
      badge: "Bestätigt",
      tone: "green",
      icon: CheckCircle2,
    };
  }

  if (hasPackageWishlistMail) {
    return {
      area: "open",
      title: "Paketwunsch-Mail versendet",
      subtitle:
        "Der Kunde hat den Link zur Kundenseite erhalten. Jetzt wartet der Vorgang auf Prüfung und Bestätigung durch den Kunden.",
      badge: "Wartet auf Kunde",
      tone: "amber",
      icon: MailCheck,
    };
  }

  if (hasPreparedWhatsappRequest || overview.offerItemCount > 0) {
    return {
      area: "open",
      title: "Paketwunsch vorbereitet",
      subtitle:
        "Die Liste wurde ausgewertet und der Paketwunsch ist vorbereitet. Als nächstes die Paketwunsch-Mail an den Kunden senden.",
      badge: "Mail senden",
      tone: "blue",
      icon: ShoppingBasket,
    };
  }

  if (hasRequestReceivedMail) {
    return {
      area: "open",
      title: "Eingang bestätigt",
      subtitle:
        "Der Kunde hat die Eingangsmail erhalten. Als nächstes Liste auswerten und Paketwunsch vorbereiten.",
      badge: "Auswertung offen",
      tone: "blue",
      icon: MailCheck,
    };
  }

  if (overview.manualReviewCount > 0 || request.status === "manual_review") {
    return {
      area: "open",
      title: "Manuelle Prüfung nötig",
      subtitle:
        "Es gibt offene Positionen, die geprüft oder ergänzt werden müssen.",
      badge: `${overview.manualReviewCount} offen`,
      tone: "amber",
      icon: AlertTriangle,
    };
  }

  if (overview.hasAdminEdits) {
    return {
      area: "open",
      title: "Nachbearbeitet",
      subtitle:
        "Du hast Positionen manuell angepasst. Prüfe final und sende danach die Paketwunsch-Mail.",
      badge: "Bereit zur Prüfung",
      tone: "blue",
      icon: Wrench,
    };
  }

  if (overview.itemCount > 0 && overview.matchCount > 0) {
    return {
      area: "open",
      title: "Vorschläge verfügbar",
      subtitle:
        "Die Liste wurde ausgewertet und passende Produktvorschläge sind vorhanden.",
      badge: "Paket vorbereiten",
      tone: "blue",
      icon: Sparkles,
    };
  }

  if (request.ai_status === "running" || request.status === "analysis_running") {
    return {
      area: "open",
      title: "Analyse läuft",
      subtitle: "Die Kundenliste wird gerade ausgewertet oder vorbereitet.",
      badge: "In Bearbeitung",
      tone: "blue",
      icon: RefreshCw,
    };
  }

  if (request.ai_status === "done" || request.status === "analysis_done") {
    return {
      area: "open",
      title: "Auswertung fertig",
      subtitle:
        "Die KI-Auswertung ist fertig. Die Anfrage kann weiter bearbeitet werden.",
      badge: "Nächster Schritt offen",
      tone: "blue",
      icon: Sparkles,
    };
  }

  return {
    area: "open",
    title: request.source === "whatsapp_manual" ? "WhatsApp-Anfrage" : "Neu eingegangen",
    subtitle:
      request.source === "whatsapp_manual"
        ? "Diese Anfrage wurde manuell aus WhatsApp übernommen und kann jetzt weiter bearbeitet werden."
        : "Die Anfrage ist neu und muss noch ausgewertet oder bearbeitet werden.",
    badge: request.source === "whatsapp_manual" ? "WhatsApp" : "Neu",
    tone: request.source === "whatsapp_manual" ? "green" : "neutral",
    icon: request.source === "whatsapp_manual" ? MessageCircle : ClipboardList,
  };
}

function getStatusToneClasses(tone: WorkflowStatus["tone"]) {
  switch (tone) {
    case "green":
      return {
        wrap: "border-[#BFE3CD] bg-[#F0FFF6]",
        icon: "bg-white text-[#2F7D50]",
        label: "bg-white text-[#2F7D50] border-[#BFE3CD]",
        title: "text-[#1F5D3A]",
      };
    case "amber":
      return {
        wrap: "border-[#F1D1A8] bg-[#FFF8EE]",
        icon: "bg-white text-[#A75B28]",
        label: "bg-white text-[#A75B28] border-[#F1D1A8]",
        title: "text-[#8A4A1F]",
      };
    case "blue":
      return {
        wrap: "border-[#C8D8E8] bg-[#EEF4FA]",
        icon: "bg-white text-[#12395F]",
        label: "bg-white text-[#12395F] border-[#C8D8E8]",
        title: "text-[#12395F]",
      };
    case "red":
      return {
        wrap: "border-[#F2B8B8] bg-[#FFF1F1]",
        icon: "bg-white text-[#B5282D]",
        label: "bg-white text-[#B5282D] border-[#F2B8B8]",
        title: "text-[#B5282D]",
      };
    default:
      return {
        wrap: "border-[#E8DED2] bg-[#FBF7F0]",
        icon: "bg-white text-[#52616F]",
        label: "bg-white text-[#52616F] border-[#E8DED2]",
        title: "text-[#102A43]",
      };
  }
}

function getAiStatusLabel(status: string | null) {
  switch (status) {
    case "pending":
      return "KI offen";
    case "running":
      return "KI läuft";
    case "done":
      return "KI fertig";
    case "error":
      return "KI-Fehler";
    case "unsupported_file_type":
      return "Dateityp unklar";
    case "no_items_detected":
      return "Nichts erkannt";
    default:
      return status || "KI unbekannt";
  }
}

function isCompletedStatus(status?: string | null) {
  return status === "shipped" || status === "picked_up";
}

function getSmallInfoBadges(overview: RequestOverview) {
  const request = overview.request;

  const badges: Array<{
    label: string;
    className: string;
  }> = [];

  badges.push({
    label: getAiStatusLabel(request.ai_status),
    className: "border-[#E8DED2] bg-[#FBF7F0] text-[#52616F]",
  });

  if (hasAnsweredQuestions(overview)) {
    badges.push({
      label: `Rückfrage beantwortet: ${overview.answeredQuestionCount}`,
      className: "border-[#BFE3CD] bg-[#F0FFF6] text-[#2F7D50]",
    });
  }

  if (hasOpenQuestions(overview)) {
    badges.push({
      label: `Rückfrage offen: ${overview.openQuestionCount}`,
      className: "border-[#F1D1A8] bg-[#FFF8EE] text-[#A75B28]",
    });
  }

  if (hasResolvedQuestions(overview)) {
    badges.push({
      label: `Rückfrage erledigt: ${overview.resolvedQuestionCount}`,
      className: "border-[#E8DED2] bg-white text-[#52616F]",
    });
  }

  if (request.source === "whatsapp_manual") {
    badges.push({
      label: "WhatsApp-Import",
      className: "border-[#BFE3CD] bg-[#F0FFF6] text-[#2F7D50]",
    });
  }

  if (hasEvent(overview, isRequestReceivedMailEvent)) {
    badges.push({
      label: "Eingangsmail gesendet",
      className: "border-[#C8D8E8] bg-[#EEF4FA] text-[#12395F]",
    });
  }

  if (hasEvent(overview, isWhatsappPrepareEvent)) {
    badges.push({
      label: "Paketwunsch vorbereitet",
      className: "border-[#C8D8E8] bg-[#EEF4FA] text-[#12395F]",
    });
  }

  if (
    hasEvent(overview, isPackageWishlistMailEvent) ||
    overview.request.offer_status === "offer_sent"
  ) {
    badges.push({
      label: "Paketwunsch-Mail gesendet",
      className: "border-[#F1D1A8] bg-[#FFF8EE] text-[#A75B28]",
    });
  }

  if (request.invoice_status) {
    badges.push({
      label: getInvoiceStatusLabel(request.invoice_status),
      className:
        request.invoice_status === "sent" || request.invoice_status === "paid"
          ? "border-[#BFE3CD] bg-[#F0FFF6] text-[#2F7D50]"
          : "border-[#C8D8E8] bg-[#EEF4FA] text-[#12395F]",
    });
  }

  if (request.status === "confirmed" || request.offer_status === "confirmed") {
    badges.push({
      label: "Paketwunsch bestätigt",
      className: "border-[#BFE3CD] bg-[#F0FFF6] text-[#2F7D50]",
    });
  }

  if (request.payment_status) {
    const isPaid =
      request.payment_status === "payment_received" ||
      request.payment_status === "cash_paid";

    const isProblem =
      request.payment_status === "overdue" ||
      request.payment_status === "payment_failed" ||
      request.payment_status === "payment_refunded" ||
      request.payment_status === "payment_reversed" ||
      request.payment_status === "cancelled";

    badges.push({
      label: getPaymentStatusLabel(request.payment_status),
      className: isPaid
        ? "border-[#BFE3CD] bg-[#F0FFF6] text-[#2F7D50]"
        : isProblem
        ? "border-[#F2B8B8] bg-[#FFF1F1] text-[#B5282D]"
        : "border-[#F1D1A8] bg-[#FFF8EE] text-[#A75B28]",
    });
  }

  if (request.selected_payment_method) {
    badges.push({
      label: getPaymentMethodLabel(request.selected_payment_method),
      className:
        request.selected_payment_method === "paypal"
          ? "border-[#C8D8E8] bg-[#EEF4FA] text-[#12395F]"
          : "border-[#E8DED2] bg-white text-[#52616F]",
    });
  }

  if (request.fulfillment_method) {
    badges.push({
      label: getFulfillmentMethodLabel(request.fulfillment_method),
      className:
        request.fulfillment_method === "shipping"
          ? "border-[#C8D8E8] bg-[#EEF4FA] text-[#12395F]"
          : "border-[#BFE3CD] bg-[#F0FFF6] text-[#2F7D50]",
    });
  }

  if (request.picking_status) {
    badges.push({
      label: getPickingStatusLabel(request.picking_status),
      className: "border-[#E8DED2] bg-white text-[#52616F]",
    });
  }

  if (request.fulfillment_status) {
    badges.push({
      label: getFulfillmentStatusLabel(request.fulfillment_status),
      className: isCompletedStatus(request.fulfillment_status)
        ? "border-[#BFE3CD] bg-[#F0FFF6] text-[#2F7D50]"
        : "border-[#E8DED2] bg-white text-[#52616F]",
    });
  }

  if (overview.customerSelectedCount > 0) {
    badges.push({
      label: `Kunde gewählt: ${overview.customerSelectedCount}`,
      className: "border-[#BFE3CD] bg-[#F0FFF6] text-[#2F7D50]",
    });
  }

  if (overview.adminManualCount > 0) {
    badges.push({
      label: `Manuell ergänzt: ${overview.adminManualCount}`,
      className: "border-[#C8D8E8] bg-[#EEF4FA] text-[#12395F]",
    });
  }

  if (overview.manualReviewCount > 0) {
    badges.push({
      label: `Offene Positionen: ${overview.manualReviewCount}`,
      className: "border-[#F1D1A8] bg-[#FFF8EE] text-[#A75B28]",
    });
  }

  if (overview.openWithMatchesCount > 0) {
    badges.push({
      label: `Auswahl offen: ${overview.openWithMatchesCount}`,
      className: "border-[#E8DED2] bg-white text-[#52616F]",
    });
  }

  return badges;
}

function getFilterValue(rawFilter: string | string[] | undefined): AdminFilter {
  const value = Array.isArray(rawFilter) ? rawFilter[0] : rawFilter;

  if (
    value === "questions-answered" ||
    value === "questions-open" ||
    value === "manual" ||
    value === "payment-open" ||
    value === "paid" ||
    value === "packable" ||
    value === "shipping" ||
    value === "pickup" ||
    value === "completed"
  ) {
    return value;
  }

  return "all";
}

function filterOverviews(overviews: RequestOverview[], filter: AdminFilter) {
  switch (filter) {
    case "questions-answered":
      return overviews.filter(hasAnsweredQuestions);
    case "questions-open":
      return overviews.filter(hasOpenQuestions);
    case "manual":
      return overviews.filter(isManualReviewRequest);
    case "payment-open":
      return overviews.filter(isWaitingPaymentRequest);
    case "paid":
      return overviews.filter(isPaidRequest);
    case "packable":
      return overviews.filter(isPackableRequest);
    case "shipping":
      return overviews.filter(isShippingRequest);
    case "pickup":
      return overviews.filter(isPickupRequest);
    case "completed":
      return overviews.filter(isCompletedRequest);
    default:
      return overviews;
  }
}

function getWorkflowPriority(overview: RequestOverview) {
  const workflow = getWorkflowStatus(overview);

  if (hasAnsweredQuestions(overview)) return 0;
  if (isProblemPaymentRequest(overview)) return 1;
  if (hasOpenQuestions(overview)) return 2;
  if (isManualReviewRequest(overview)) return 3;
  if (overview.request.status === "received" || overview.request.status === "analysis_pending") {
    return 4;
  }
  if (overview.request.ai_status === "running" || overview.request.status === "analysis_running") {
    return 5;
  }
  if (overview.itemCount > 0 && (overview.matchCount > 0 || overview.offerItemCount > 0)) {
    return 6;
  }
  if (workflow.area === "open") return 7;
  if (isConfirmedRequest(overview) && isWaitingPaymentRequest(overview)) return 8;
  if (isPackableRequest(overview)) return 9;
  if (overview.request.picking_status === "picking") return 10;
  if (overview.request.picking_status === "picked") return 11;
  if (overview.request.picking_status === "packed") return 12;
  if (overview.request.fulfillment_status === "ready_for_pickup") return 13;
  if (overview.request.fulfillment_status === "shipping_ready") return 14;
  if (isCompletedRequest(overview)) return 99;

  return 20;
}

function getRequestSortTime(overview: RequestOverview) {
  const value = overview.request.created_at || overview.request.updated_at || "";
  const time = value ? new Date(value).getTime() : 0;

  return Number.isFinite(time) ? time : 0;
}

function compareRequestOverviewsByWorkflow(a: RequestOverview, b: RequestOverview) {
  const priorityDifference = getWorkflowPriority(a) - getWorkflowPriority(b);

  if (priorityDifference !== 0) return priorityDifference;

  const timeDifference = getRequestSortTime(b) - getRequestSortTime(a);

  if (timeDifference !== 0) return timeDifference;

  return String(a.request.request_number || a.request.id).localeCompare(
    String(b.request.request_number || b.request.id),
    "de",
    {
      numeric: true,
      sensitivity: "base",
    }
  );
}

function FilterPill({
  href,
  label,
  count,
  active,
  tone = "neutral",
}: {
  href: string;
  label: string;
  count: number;
  active: boolean;
  tone?: "neutral" | "green" | "amber" | "blue" | "red";
}) {
  const activeClass =
    tone === "green"
      ? "border-[#2F7D50] bg-[#F0FFF6] text-[#1F5D3A]"
      : tone === "amber"
      ? "border-[#A75B28] bg-[#FFF8EE] text-[#8A4A1F]"
      : tone === "blue"
      ? "border-[#12395F] bg-[#EEF4FA] text-[#12395F]"
      : tone === "red"
      ? "border-[#B5282D] bg-[#FFF1F1] text-[#B5282D]"
      : "border-[#102A43] bg-white text-[#102A43]";

  return (
    <Link
      href={href}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border px-4 py-2 text-sm font-black transition hover:brightness-105 ${
        active
          ? activeClass
          : "border-[#E8DED2] bg-white text-[#52616F] hover:border-[#D8C8B8]"
      }`}
    >
      {label}
      <span
        className={`rounded-full px-2 py-0.5 text-xs ${
          active ? "bg-white/80" : "bg-[#FBF7F0]"
        }`}
      >
        {count}
      </span>
    </Link>
  );
}

function PaymentStatusCard({ request }: { request: SchoolRequest }) {
  const paymentClasses = getPaymentBoxClasses(request.payment_status);
  const PaymentIcon = getPaymentIcon(request);

  return (
    <div className={`rounded-[24px] border p-4 ${paymentClasses.wrap}`}>
      <div className="flex items-start gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${paymentClasses.icon}`}
        >
          <PaymentIcon className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[#A75B28]">
              Zahlung
            </p>

            <span
              className={`rounded-full border px-2 py-0.5 text-[11px] font-black ${paymentClasses.badge}`}
            >
              {getPaymentStatusLabel(request.payment_status)}
            </span>
          </div>

          <p className={`mt-2 font-black ${paymentClasses.title}`}>
            {getPaymentSubtitle(request)}
          </p>

          <div className="mt-2 grid gap-1 text-xs font-semibold text-[#52616F]">
            {request.payment_received_at ? (
              <p>Bezahlt am: {formatDateTime(request.payment_received_at)}</p>
            ) : null}

            {request.payment_due_at &&
            request.payment_status === "waiting_for_payment" ? (
              <p>Zahlungsfrist: {formatDate(request.payment_due_at)}</p>
            ) : null}

            {request.cash_pickup_due_at &&
            request.payment_status === "cash_on_pickup" ? (
              <p>Abholfrist: {formatDate(request.cash_pickup_due_at)}</p>
            ) : null}

            {request.invoice_sent_at ? (
              <p>Rechnung gesendet: {formatDateTime(request.invoice_sent_at)}</p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function InvoiceFulfillmentMiniCard({ request }: { request: SchoolRequest }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-[22px] border border-[#E8DED2] bg-white p-3">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-[#A75B28]">
          Rechnung
        </p>
        <p className="mt-1 font-black text-[#102A43]">
          {getInvoiceStatusLabel(request.invoice_status)}
        </p>
        <p className="mt-1 text-xs font-semibold text-[#52616F]">
          {request.invoice_total_amount !== null &&
          request.invoice_total_amount !== undefined &&
          request.invoice_total_amount !== ""
            ? formatMoney(request.invoice_total_amount)
            : "Noch kein Betrag"}
        </p>
      </div>

      <div className="rounded-[22px] border border-[#E8DED2] bg-white p-3">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-[#A75B28]">
          Abwicklung
        </p>
        <p className="mt-1 font-black text-[#102A43]">
          {getFulfillmentMethodLabel(request.fulfillment_method)}
        </p>
        <p className="mt-1 text-xs font-semibold text-[#52616F]">
          {getPickingStatusLabel(request.picking_status)} ·{" "}
          {getFulfillmentStatusLabel(request.fulfillment_status)}
        </p>
      </div>
    </div>
  );
}

function RequestCard({
  overview,
  siteUrl,
}: {
  overview: RequestOverview;
  siteUrl: string;
}) {
  const request = overview.request;
  const workflow = getWorkflowStatus(overview);
  const toneClasses = getStatusToneClasses(workflow.tone);
  const StatusIcon = workflow.icon;
  const operationalHint = getOperationalHint(overview);

  const customerOfferPath = request.offer_token
    ? `/angebot/${request.offer_token}`
    : null;

  const customerOfferUrl = customerOfferPath
    ? `${siteUrl}${customerOfferPath}`
    : null;

  const infoBadges = getSmallInfoBadges(overview);

  return (
    <article className="rounded-[32px] border border-[#E8DED2] bg-white p-5 shadow-sm transition hover:shadow-[0_18px_45px_rgba(16,42,67,0.10)] sm:p-6">
      <div className="grid gap-5 lg:grid-cols-[1fr_320px] lg:items-start">
        <div>
          <div className={`mb-4 rounded-[26px] border p-4 ${toneClasses.wrap}`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3">
                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${toneClasses.icon}`}
                >
                  <StatusIcon className="h-5 w-5" />
                </div>

                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
                    Aktueller Status
                  </p>

                  <h2 className={`mt-1 text-xl font-black ${toneClasses.title}`}>
                    {workflow.title}
                  </h2>

                  <p className="mt-1 text-sm font-semibold leading-6 text-[#52616F]">
                    {workflow.subtitle}
                  </p>
                </div>
              </div>

              <span
                className={`inline-flex shrink-0 rounded-full border px-3 py-1 text-xs font-black ${toneClasses.label}`}
              >
                {workflow.badge}
              </span>
            </div>
          </div>

          <div
            className={`mb-4 rounded-[22px] border px-4 py-3 ${operationalHint.className}`}
          >
            <p className="text-xs font-black uppercase tracking-[0.14em]">
              {operationalHint.label}
            </p>
            <p className="mt-1 text-sm font-bold leading-6">
              {operationalHint.text}
            </p>
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            {infoBadges.map((badge) => (
              <span
                key={badge.label}
                className={`rounded-full border px-3 py-1 text-xs font-black ${badge.className}`}
              >
                {badge.label}
              </span>
            ))}
          </div>

          <h3 className="text-xl font-black text-[#102A43] sm:text-2xl">
            Anfrage {request.request_number || request.id}
          </h3>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl bg-[#FBF7F0] p-3">
              <div className="mb-1 flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-[#A75B28]">
                <User className="h-3.5 w-3.5" />
                Kunde
              </div>
              <p className="font-black text-[#102A43]">
                {getCustomerDisplayName(request)}
              </p>
              <p className="mt-1 text-xs font-semibold text-[#52616F]">
                {getCustomerDisplayContact(request)}
              </p>
            </div>

            <div className="rounded-2xl bg-[#FBF7F0] p-3">
              <div className="mb-1 flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-[#A75B28]">
                <School className="h-3.5 w-3.5" />
                Kind / Schule
              </div>
              <p className="font-black text-[#102A43]">
                {request.child_name || "Nicht angegeben"}
              </p>
              <p className="mt-1 text-xs font-semibold text-[#52616F]">
                {request.school_name || "Keine Schule"}
                {request.class_name ? ` · ${request.class_name}` : ""}
              </p>
            </div>

            <div className="rounded-2xl bg-[#FBF7F0] p-3">
              <div className="mb-1 flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-[#A75B28]">
                <FileText className="h-3.5 w-3.5" />
                Datei
              </div>
              <p className="font-black text-[#102A43]">
                {overview.fileCount} Datei
                {overview.fileCount === 1 ? "" : "en"}
              </p>
              <p className="mt-1 truncate text-xs font-semibold text-[#52616F]">
                {overview.firstFileName || "Keine Datei"}
              </p>
            </div>

            <div className="rounded-2xl bg-[#FBF7F0] p-3">
              <div className="mb-1 flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-[#A75B28]">
                <ShoppingBasket className="h-3.5 w-3.5" />
                Paket
              </div>
              <p className="font-black text-[#102A43]">
                {overview.offerItemCount} Position
                {overview.offerItemCount === 1 ? "" : "en"}
              </p>
              <p className="mt-1 text-xs font-semibold text-[#52616F]">
                {formatMoney(overview.totalPrice)}
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <div className="rounded-2xl border border-[#E8DED2] bg-white px-3 py-2">
              <p className="text-xs font-bold text-[#52616F]">Erkannt</p>
              <p className="text-lg font-black text-[#102A43]">
                {overview.itemCount}
              </p>
            </div>

            <div className="rounded-2xl border border-[#E8DED2] bg-white px-3 py-2">
              <p className="text-xs font-bold text-[#52616F]">Vorschläge</p>
              <p className="text-lg font-black text-[#102A43]">
                {overview.matchCount}
              </p>
            </div>

            <div className="rounded-2xl border border-[#E8DED2] bg-white px-3 py-2">
              <p className="text-xs font-bold text-[#52616F]">Kunde gewählt</p>
              <p className="text-lg font-black text-[#102A43]">
                {overview.customerSelectedCount}
              </p>
            </div>

            <div className="rounded-2xl border border-[#E8DED2] bg-white px-3 py-2">
              <p className="text-xs font-bold text-[#52616F]">Manuell ergänzt</p>
              <p className="text-lg font-black text-[#102A43]">
                {overview.adminManualCount}
              </p>
            </div>

            <div
              className={`rounded-2xl border px-3 py-2 ${
                overview.manualReviewCount > 0
                  ? "border-[#F1D1A8] bg-[#FFF8EE]"
                  : "border-[#E8DED2] bg-white"
              }`}
            >
              <p className="text-xs font-bold text-[#52616F]">Offen</p>
              <p className="text-lg font-black text-[#102A43]">
                {overview.manualReviewCount}
              </p>
            </div>

            <div
              className={`rounded-2xl border px-3 py-2 ${
                overview.answeredQuestionCount > 0
                  ? "border-[#BFE3CD] bg-[#F0FFF6]"
                  : overview.openQuestionCount > 0
                  ? "border-[#F1D1A8] bg-[#FFF8EE]"
                  : "border-[#E8DED2] bg-white"
              }`}
            >
              <p className="text-xs font-bold text-[#52616F]">Rückfragen</p>
              <p className="text-lg font-black text-[#102A43]">
                {overview.answeredQuestionCount > 0
                  ? `${overview.answeredQuestionCount} Antwort`
                  : overview.openQuestionCount > 0
                  ? `${overview.openQuestionCount} offen`
                  : overview.questionCount}
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] p-3">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[#A75B28]">
              Letztes Ereignis
            </p>
            <p className="mt-1 text-sm font-black text-[#102A43]">
              {getEventTypeLabel(overview.latestEvent)}
            </p>
            <p className="mt-1 text-xs font-semibold text-[#52616F]">
              {overview.latestEvent?.message ||
                "Noch keine Detailmeldung vorhanden."}
            </p>
            <p className="mt-1 text-xs font-semibold text-[#52616F]">
              {formatDateTime(overview.latestEvent?.created_at || null)}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="rounded-[24px] border border-[#E8DED2] bg-[#FBF7F0] p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
              Eingegangen
            </p>
            <p className="mt-2 text-lg font-black text-[#102A43]">
              {formatDate(request.created_at)}
            </p>
            <p className="mt-1 text-xs font-semibold text-[#52616F]">
              Aktualisiert: {formatDateTime(request.updated_at)}
            </p>
          </div>

          <PaymentStatusCard request={request} />

          <InvoiceFulfillmentMiniCard request={request} />

          <Link
            href={`/admin/anfragen/${request.id}`}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#B5282D] px-4 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110"
          >
            Anfrage bearbeiten
            <ArrowRight className="h-4 w-4" />
          </Link>

          {customerOfferPath && customerOfferUrl ? (
            <>
              <Link
                href={customerOfferPath}
                target="_blank"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#12395F] px-4 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110"
              >
                Kundenseite öffnen
                <Eye className="h-4 w-4" />
              </Link>

              <CopyOfferLinkButton url={customerOfferUrl} />
            </>
          ) : null}

          <DeleteRequestButton
            requestId={request.id}
            requestLabel={`Anfrage ${request.request_number || request.id}`}
          />
        </div>
      </div>
    </article>
  );
}

export default async function AdminRequestsPage({
  searchParams,
}: AdminRequestsPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const activeFilter = getFilterValue(resolvedSearchParams.filter);

  const supabase = getSupabaseAdmin();
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "http://localhost:3000";

  const { data: requestRows, error: requestError } = await supabase
    .from("school_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (requestError) {
    throw new Error(
      `Anfragen konnten nicht geladen werden: ${requestError.message}`
    );
  }

  const requests = (requestRows || []) as SchoolRequest[];
  const requestIds = requests.map((request) => request.id);

  let files: RequestFile[] = [];
  let items: RequestItem[] = [];
  let matches: RequestMatch[] = [];
  let offerItems: OfferItem[] = [];
  let events: EventRow[] = [];
  let questions: RequestQuestion[] = [];

  if (requestIds.length > 0) {
    const [
      { data: filesData, error: filesError },
      { data: itemsData, error: itemsError },
      { data: offerItemsData, error: offerItemsError },
      { data: eventsData, error: eventsError },
      { data: questionsData, error: questionsError },
    ] = await Promise.all([
      supabase
        .from("school_request_files")
        .select("*")
        .in("request_id", requestIds)
        .order("created_at", { ascending: true }),

      supabase
        .from("school_request_items")
        .select("*")
        .in("request_id", requestIds)
        .order("created_at", { ascending: true }),

      supabase
        .from("school_offer_items")
        .select("*")
        .in("request_id", requestIds)
        .order("created_at", { ascending: true }),

      supabase
        .from("school_request_events")
        .select("*")
        .in("request_id", requestIds)
        .order("created_at", { ascending: false }),

      supabase
        .from("school_request_item_questions")
        .select("*")
        .in("request_id", requestIds)
        .order("created_at", { ascending: false }),
    ]);

    if (filesError) {
      throw new Error(
        `Dateien konnten nicht geladen werden: ${filesError.message}`
      );
    }

    if (itemsError) {
      throw new Error(
        `Positionen konnten nicht geladen werden: ${itemsError.message}`
      );
    }

    if (offerItemsError) {
      throw new Error(
        `Paketpositionen konnten nicht geladen werden: ${offerItemsError.message}`
      );
    }

    if (eventsError) {
      throw new Error(
        `Verlauf konnte nicht geladen werden: ${eventsError.message}`
      );
    }

    if (questionsError) {
      throw new Error(
        `Rückfragen konnten nicht geladen werden: ${questionsError.message}`
      );
    }

    files = (filesData || []) as RequestFile[];
    items = (itemsData || []) as RequestItem[];
    offerItems = (offerItemsData || []) as OfferItem[];
    events = (eventsData || []) as EventRow[];
    questions = (questionsData || []) as RequestQuestion[];

    const itemIds = items.map((item) => item.id);

    if (itemIds.length > 0) {
      const { data: matchesData, error: matchesError } = await supabase
        .from("school_request_matches")
        .select("*")
        .in("request_item_id", itemIds);

      if (matchesError) {
        throw new Error(
          `Produktvorschläge konnten nicht geladen werden: ${matchesError.message}`
        );
      }

      matches = (matchesData || []) as RequestMatch[];
    }
  }

  const filesByRequest = new Map<string, RequestFile[]>();
  const itemsByRequest = new Map<string, RequestItem[]>();
  const offerItemsByRequest = new Map<string, OfferItem[]>();
  const eventsByRequest = new Map<string, EventRow[]>();
  const questionsByRequest = new Map<string, RequestQuestion[]>();
  const matchesByItem = new Map<string, RequestMatch[]>();

  for (const file of files) {
    const current = filesByRequest.get(file.request_id) || [];
    current.push(file);
    filesByRequest.set(file.request_id, current);
  }

  for (const item of items) {
    const current = itemsByRequest.get(item.request_id) || [];
    current.push(item);
    itemsByRequest.set(item.request_id, current);
  }

  for (const offerItem of offerItems) {
    const current = offerItemsByRequest.get(offerItem.request_id) || [];
    current.push(offerItem);
    offerItemsByRequest.set(offerItem.request_id, current);
  }

  for (const event of events) {
    const current = eventsByRequest.get(event.request_id) || [];
    current.push(event);
    eventsByRequest.set(event.request_id, current);
  }

  for (const question of questions) {
    const current = questionsByRequest.get(question.request_id) || [];
    current.push(question);
    questionsByRequest.set(question.request_id, current);
  }

  for (const match of matches) {
    const current = matchesByItem.get(match.request_item_id) || [];
    current.push(match);
    matchesByItem.set(match.request_item_id, current);
  }

  const overviews: RequestOverview[] = requests.map((request) => {
    const requestFiles = filesByRequest.get(request.id) || [];
    const requestItems = itemsByRequest.get(request.id) || [];
    const requestOfferItems = offerItemsByRequest.get(request.id) || [];
    const requestEvents = eventsByRequest.get(request.id) || [];
    const requestQuestions = questionsByRequest.get(request.id) || [];

    const offerItemsByRequestItem = new Map<string, OfferItem[]>();

    for (const offerItem of requestOfferItems) {
      if (!offerItem.request_item_id) continue;

      const current =
        offerItemsByRequestItem.get(offerItem.request_item_id) || [];
      current.push(offerItem);
      offerItemsByRequestItem.set(offerItem.request_item_id, current);
    }

    let requestMatchCount = 0;
    let manualReviewCount = 0;
    let openWithMatchesCount = 0;

    for (const item of requestItems) {
      const itemMatches = matchesByItem.get(item.id) || [];
      const selected = offerItemsByRequestItem.get(item.id) || [];

      requestMatchCount += itemMatches.length;

      if (selected.length === 0 && itemMatches.length === 0) {
        manualReviewCount += 1;
      }

      if (selected.length === 0 && itemMatches.length > 0) {
        openWithMatchesCount += 1;
      }
    }

    const customerSelectedCount = requestOfferItems.filter(
      (item) =>
        item.source === "customer_selection" ||
        item.source === "customer_search"
    ).length;

    const adminManualCount = requestOfferItems.filter(
      (item) =>
        item.source === "admin_manual" ||
        item.source === "admin_existing_product"
    ).length;

    const totalPrice = requestOfferItems.reduce((sum, item) => {
      return sum + toNumber(item.quantity, 1) * toNumber(item.product_price, 0);
    }, 0);

    const hasAdminEditEvent = requestEvents.some((event) => {
      const eventType = event.event_type || event.type || "";
      return (
        eventType.includes("admin_manual") ||
        eventType.includes("admin_offer_item")
      );
    });

    const openQuestionCount = requestQuestions.filter(
      (question) => question.status === "pending"
    ).length;

    const answeredQuestionCount = requestQuestions.filter(
      (question) => question.status === "answered"
    ).length;

    const resolvedQuestionCount = requestQuestions.filter(
      (question) => question.status === "resolved"
    ).length;

    return {
      request,
      fileCount: requestFiles.length,
      firstFileName: requestFiles[0]?.original_filename || null,
      itemCount: requestItems.length,
      matchCount: requestMatchCount,
      offerItemCount: requestOfferItems.length,
      customerSelectedCount,
      adminManualCount,
      manualReviewCount,
      openWithMatchesCount,
      latestEvent: requestEvents[0] || null,
      events: requestEvents,
      questions: requestQuestions,
      questionCount: requestQuestions.length,
      openQuestionCount,
      answeredQuestionCount,
      resolvedQuestionCount,
      totalPrice,
      hasAdminEdits: adminManualCount > 0 || hasAdminEditEvent,
    };
  }).sort(compareRequestOverviewsByWorkflow);

  const openOverviews = overviews.filter(
    (overview) => getWorkflowStatus(overview).area === "open"
  );

  const fulfillmentOverviews = overviews.filter(
    (overview) => getWorkflowStatus(overview).area === "fulfillment"
  );

  const totalRequests = overviews.length;
  const openCount = openOverviews.length;
  const fulfillmentCount = fulfillmentOverviews.length;
  const answeredQuestionsCount = overviews.filter(hasAnsweredQuestions).length;
  const openQuestionsCount = overviews.filter(hasOpenQuestions).length;
  const manualCount = overviews.filter(isManualReviewRequest).length;
  const shippingCount = overviews.filter(isShippingRequest).length;
  const pickupCount = overviews.filter(isPickupRequest).length;
  const paidCount = overviews.filter(isPaidRequest).length;
  const waitingPaymentCount = overviews.filter(isWaitingPaymentRequest).length;
  const problemPaymentCount = overviews.filter(isProblemPaymentRequest).length;
  const packableCount = overviews.filter(isPackableRequest).length;
  const completedCount = overviews.filter(isCompletedRequest).length;
  const actionRequiredCount = overviews.filter((overview) => {
    return (
      hasAnsweredQuestions(overview) ||
      isProblemPaymentRequest(overview) ||
      hasOpenQuestions(overview) ||
      isManualReviewRequest(overview) ||
      isWaitingPaymentRequest(overview) ||
      isPackableRequest(overview)
    );
  }).length;

  const filteredOverviews = filterOverviews(overviews, activeFilter);
  const refreshedAt = new Date().toISOString();

  return (
    <main className="min-h-screen bg-[#FBF7F0] text-[#102A43]">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/admin"
            className="inline-flex min-h-11 w-fit items-center justify-center gap-2 rounded-2xl border border-[#E8DED2] bg-white px-4 py-3 text-sm font-black text-[#12395F] shadow-sm transition hover:bg-[#EEF4FA]"
          >
            <ArrowLeft className="h-4 w-4" />
            Zurück zum Admin-Bereich
          </Link>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="/admin/whatsapp-import"
              className="inline-flex min-h-11 w-fit items-center justify-center gap-2 rounded-2xl bg-[#1FA855] px-4 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110"
            >
              <MessageCircle className="h-4 w-4" />
              WhatsApp-Import
            </Link>

            <Link
              href="/admin/produkte/mobile"
              className="inline-flex min-h-11 w-fit items-center justify-center gap-2 rounded-2xl bg-[#B5282D] px-4 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110"
            >
              <PackageCheck className="h-4 w-4" />
              Mobile Produkterfassung
            </Link>
          </div>
        </div>

        <header className="rounded-[34px] border border-[#E8DED2] bg-white p-5 shadow-[0_18px_45px_rgba(16,42,67,0.10)] sm:p-7">
          <div className="grid gap-6 lg:grid-cols-[1fr_340px] lg:items-start">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[#FBF7F0] px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-[#A75B28]">
                <ClipboardList className="h-3.5 w-3.5" />
                Handzettel-Schulen.de
              </div>

              <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
                Admin-Anfragen
              </h1>

              <p className="mt-3 max-w-3xl text-sm leading-6 text-[#52616F] sm:text-base">
                Die Übersicht zeigt Dir schneller, was als Nächstes zu tun ist:
                Eingang, Auswertung, Paketwunsch, Kundenbestätigung, Rechnung,
                Zahlung, Packfreigabe, Versand, Abholung und Abschluss.
              </p>
            </div>

            <div className="rounded-[28px] border border-[#E8DED2] bg-[#FBF7F0] p-4">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
                Letzte Aktualisierung
              </p>

              <p className="mt-2 text-lg font-black text-[#102A43]">
                {formatDateTime(refreshedAt)}
              </p>

              <p className="mt-1 text-sm font-semibold text-[#52616F]">
                Server-seitig neu geladen
              </p>

              <a
                href="/admin/anfragen"
                className="mt-4 inline-flex w-full min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#12395F] px-4 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110"
              >
                <RefreshCw className="h-4 w-4" />
                Aktualisieren
              </a>
            </div>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Link
            href="/admin/anfragen"
            className={`rounded-[30px] border p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-[0_18px_45px_rgba(16,42,67,0.10)] ${
              activeFilter === "all"
                ? "border-[#102A43] bg-white"
                : "border-[#E8DED2] bg-white"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
                  Gesamt
                </p>
                <p className="mt-2 text-4xl font-black text-[#102A43]">
                  {totalRequests}
                </p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FBF7F0] text-[#A75B28]">
                <ClipboardList className="h-5 w-5" />
              </div>
            </div>
            <p className="mt-3 text-sm font-semibold leading-6 text-[#52616F]">
              Alle aktuellen Anfragen in der Übersicht.
            </p>
          </Link>

          <div className="rounded-[30px] border border-[#F1D1A8] bg-[#FFF8EE] p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
                  Jetzt bearbeiten
                </p>
                <p className="mt-2 text-4xl font-black text-[#102A43]">
                  {actionRequiredCount}
                </p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[#A75B28]">
                <AlertTriangle className="h-5 w-5" />
              </div>
            </div>
            <p className="mt-3 text-sm font-semibold leading-6 text-[#8A4A1F]">
              Vorgänge mit Rückfrage, Prüfung, Zahlung, Problem oder Packfreigabe.
            </p>
          </div>

          <Link
            href="/admin/anfragen?filter=questions-answered"
            className={`rounded-[30px] border p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-[0_18px_45px_rgba(16,42,67,0.10)] ${
              activeFilter === "questions-answered"
                ? "border-[#2F7D50] bg-[#F0FFF6]"
                : "border-[#BFE3CD] bg-[#F0FFF6]"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#2F7D50]">
                  Antworten
                </p>
                <p className="mt-2 text-4xl font-black text-[#102A43]">
                  {answeredQuestionsCount}
                </p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[#2F7D50]">
                <MessageCircle className="h-5 w-5" />
              </div>
            </div>
            <p className="mt-3 text-sm font-semibold leading-6 text-[#2F7D50]">
              Kundenantworten, die Du prüfen und erledigen musst.
            </p>
          </Link>

          <Link
            href="/admin/anfragen?filter=questions-open"
            className={`rounded-[30px] border p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-[0_18px_45px_rgba(16,42,67,0.10)] ${
              activeFilter === "questions-open"
                ? "border-[#A75B28] bg-[#FFF8EE]"
                : "border-[#F1D1A8] bg-[#FFF8EE]"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
                  Wartet auf Kunde
                </p>
                <p className="mt-2 text-4xl font-black text-[#102A43]">
                  {openQuestionsCount}
                </p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[#A75B28]">
                <MailCheck className="h-5 w-5" />
              </div>
            </div>
            <p className="mt-3 text-sm font-semibold leading-6 text-[#8A4A1F]">
              Rückfragen, die bereits gestellt wurden und noch offen sind.
            </p>
          </Link>
        </section>

        <section className="rounded-[30px] border border-[#E8DED2] bg-white p-4 shadow-sm">
          <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#A75B28]">
                Arbeitsfilter
              </p>
              <h2 className="text-xl font-black text-[#102A43]">
                Schnellansicht für den Tagesbetrieb
              </h2>
            </div>

            <p className="max-w-xl text-sm font-semibold leading-6 text-[#52616F]">
              Oben siehst Du nur die wichtigsten Signale. Hier filterst Du die
              Detailphasen, ohne die Übersicht mit Kennzahlen zu überladen.
            </p>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              <FilterPill
                href="/admin/anfragen"
                label="Alle"
                count={totalRequests}
                active={activeFilter === "all"}
              />
              <FilterPill
                href="/admin/anfragen?filter=questions-answered"
                label="Antworten eingegangen"
                count={answeredQuestionsCount}
                active={activeFilter === "questions-answered"}
                tone="green"
              />
              <FilterPill
                href="/admin/anfragen?filter=questions-open"
                label="Rückfragen offen"
                count={openQuestionsCount}
                active={activeFilter === "questions-open"}
                tone="amber"
              />
              <FilterPill
                href="/admin/anfragen?filter=manual"
                label="Prüfung"
                count={manualCount}
                active={activeFilter === "manual"}
                tone="amber"
              />
            </div>

            <div className="flex flex-wrap gap-2 border-t border-[#E8DED2] pt-4">
              <FilterPill
                href="/admin/anfragen?filter=payment-open"
                label="Zahlung offen"
                count={waitingPaymentCount}
                active={activeFilter === "payment-open"}
                tone="amber"
              />
              <FilterPill
                href="/admin/anfragen?filter=paid"
                label="Bezahlt"
                count={paidCount}
                active={activeFilter === "paid"}
                tone="green"
              />
              <FilterPill
                href="/admin/anfragen?filter=packable"
                label="Packen"
                count={packableCount}
                active={activeFilter === "packable"}
                tone="green"
              />
              <FilterPill
                href="/admin/anfragen?filter=shipping"
                label="Versand"
                count={shippingCount}
                active={activeFilter === "shipping"}
                tone="blue"
              />
              <FilterPill
                href="/admin/anfragen?filter=pickup"
                label="Abholung"
                count={pickupCount}
                active={activeFilter === "pickup"}
                tone="green"
              />
              <FilterPill
                href="/admin/anfragen?filter=completed"
                label="Abgeschlossen"
                count={completedCount}
                active={activeFilter === "completed"}
                tone="green"
              />
            </div>
          </div>
        </section>

        {overviews.length > 0 ? (
          activeFilter === "all" ? (
            <section className="space-y-8">
              <section className="space-y-4">
                <div className="rounded-[30px] border border-[#F1D1A8] bg-[#FFF8EE] p-5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-[#A75B28]">
                        Bereich Offen
                      </p>
                      <h2 className="mt-1 text-2xl font-black text-[#102A43]">
                        Offene Anfragen
                      </h2>
                      <p className="mt-1 text-sm font-semibold leading-6 text-[#52616F]">
                        Neu, in Bearbeitung, manuelle Prüfung, Paketwunsch
                        vorbereitet oder Paketwunsch-Mail versandt.
                      </p>
                    </div>

                    <span className="rounded-full bg-white px-4 py-2 text-sm font-black text-[#A75B28]">
                      {openCount} offen
                    </span>
                  </div>
                </div>

                {openOverviews.length > 0 ? (
                  <div className="space-y-4">
                    {openOverviews.map((overview) => (
                      <RequestCard
                        key={overview.request.id}
                        overview={overview}
                        siteUrl={siteUrl}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-[32px] border border-dashed border-[#D8C8B8] bg-white p-8 text-center shadow-sm">
                    <h3 className="text-xl font-black text-[#102A43]">
                      Keine offenen Anfragen.
                    </h3>
                    <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#52616F]">
                      Alles, was aktuell bearbeitet werden muss, erscheint später
                      wieder in diesem Bereich.
                    </p>
                  </div>
                )}
              </section>

              <section className="space-y-4">
                <div className="rounded-[30px] border border-[#BFE3CD] bg-[#F0FFF6] p-5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2F7D50]">
                        Bereich Paketwunsch bestätigt
                      </p>
                      <h2 className="mt-1 text-2xl font-black text-[#102A43]">
                        Paketwunsch bestätigt / Abwicklung
                      </h2>
                      <p className="mt-1 text-sm font-semibold leading-6 text-[#52616F]">
                        Bestätigte Paketwünsche, Rechnung, Zahlungsstatus,
                        Pickingliste, Abholung, Versand, abholbereit, versendet
                        oder abgeholt.
                      </p>
                    </div>

                    <span className="rounded-full bg-white px-4 py-2 text-sm font-black text-[#2F7D50]">
                      {fulfillmentCount} in Abwicklung
                    </span>
                  </div>
                </div>

                {fulfillmentOverviews.length > 0 ? (
                  <div className="space-y-4">
                    {fulfillmentOverviews.map((overview) => (
                      <RequestCard
                        key={overview.request.id}
                        overview={overview}
                        siteUrl={siteUrl}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-[32px] border border-dashed border-[#D8C8B8] bg-white p-8 text-center shadow-sm">
                    <h3 className="text-xl font-black text-[#102A43]">
                      Noch keine bestätigten Paketwünsche in Abwicklung.
                    </h3>
                    <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#52616F]">
                      Sobald ein Kunde den Paketwunsch bestätigt, erscheint der
                      Vorgang hier für Rechnung, Zahlung, Picking, Abholung oder
                      Versand.
                    </p>
                  </div>
                )}
              </section>
            </section>
          ) : (
            <section className="space-y-4">
              <div className="rounded-[30px] border border-[#E8DED2] bg-white p-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-[#A75B28]">
                      Gefilterte Arbeitsliste
                    </p>
                    <h2 className="mt-1 text-2xl font-black text-[#102A43]">
                      {activeFilter === "manual"
                        ? "Manuelle Prüfung"
                        : activeFilter === "payment-open"
                        ? "Wartet auf Zahlung"
                        : activeFilter === "paid"
                        ? "Bezahlte Vorgänge"
                        : activeFilter === "packable"
                        ? "Packen möglich"
                        : activeFilter === "shipping"
                        ? "Versand"
                        : activeFilter === "pickup"
                        ? "Abholung"
                        : "Abgeschlossen"}
                    </h2>
                    <p className="mt-1 text-sm font-semibold leading-6 text-[#52616F]">
                      Diese Ansicht zeigt nur die Vorgänge, die zum gewählten
                      Arbeitsfilter passen.
                    </p>
                  </div>

                  <span className="rounded-full bg-[#FBF7F0] px-4 py-2 text-sm font-black text-[#102A43]">
                    {filteredOverviews.length} Treffer
                  </span>
                </div>
              </div>

              {filteredOverviews.length > 0 ? (
                <div className="space-y-4">
                  {filteredOverviews.map((overview) => (
                    <RequestCard
                      key={overview.request.id}
                      overview={overview}
                      siteUrl={siteUrl}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-[32px] border border-dashed border-[#D8C8B8] bg-white p-8 text-center shadow-sm">
                  <h3 className="text-xl font-black text-[#102A43]">
                    Keine passenden Anfragen.
                  </h3>
                  <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#52616F]">
                    Für diesen Filter gibt es aktuell keine Vorgänge.
                  </p>

                  <Link
                    href="/admin/anfragen"
                    className="mt-5 inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#12395F] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110"
                  >
                    Alle Anfragen anzeigen
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              )}
            </section>
          )
        ) : (
          <section className="rounded-[32px] border border-dashed border-[#D8C8B8] bg-white p-8 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-3xl bg-[#FBF7F0] text-[#A75B28]">
              <ClipboardList className="h-6 w-6" />
            </div>

            <h2 className="text-xl font-black text-[#102A43]">
              Noch keine Anfragen vorhanden.
            </h2>

            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#52616F]">
              Sobald Kunden eine Schulmaterialliste hochladen, erscheinen die
              Anfragen hier in der Admin-Übersicht.
            </p>
          </section>
        )}
      </section>
    </main>
  );
}