import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Eye,
  FileText,
  MailCheck,
  MapPin,
  PackageCheck,
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
  totalPrice: number;
  hasAdminEdits: boolean;
};

type WorkflowStatus = {
  area: "open" | "fulfillment";
  title: string;
  subtitle: string;
  badge: string;
  tone: "neutral" | "blue" | "amber" | "green";
  icon: typeof ClipboardList;
};

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

function isUpdateMailEvent(event: EventRow) {
  const type = getEventType(event);
  const text = getEventText(event);

  return (
    type.includes("offer_update_mail_sent") ||
    type.includes("update_mail") ||
    text.includes("aktualisierungsmail") ||
    text.includes("pdf-angebot") ||
    text.includes("aktualisiertes angebot")
  );
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

function getEventTypeLabel(event: EventRow | null) {
  if (!event) return "Noch kein Verlauf";

  const type = event.event_type || event.type;

  switch (type) {
    case "request_received":
      return "Materialliste eingegangen";
    case "offer_link_email_sent":
      return "Angebotslink per E-Mail gesendet";
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
      return "Angebot bestätigt";
    case "offer_confirmed_complete_customer_selection":
      return "Angebot vollständig durch Kunde bestätigt";
    case "offer_update_mail_sent":
      return "Aktualisiertes Angebot versandt";
    case "offer_update_confirmed":
      return "Aktualisiertes Angebot bestätigt";
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
    default:
      return type || "Ereignis";
  }
}

function getWorkflowStatus(overview: RequestOverview): WorkflowStatus {
  const request = overview.request;
  const isConfirmed =
    request.status === "confirmed" || request.offer_status === "confirmed";

  const hasUpdatedConfirmation = hasEvent(overview, isUpdatedOfferConfirmedEvent);
  const hasUpdateMail =
    hasEvent(overview, isUpdateMailEvent) ||
    request.offer_status === "offer_sent";

  if (isConfirmed || hasUpdatedConfirmation) {
    if (request.fulfillment_status === "picked_up") {
      return {
        area: "fulfillment",
        title: "Abgeholt",
        subtitle:
          "Der Kunde hat Abholung gewählt und das Schulpaket wurde als abgeholt markiert.",
        badge: "Abgeholt",
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
        badge: "Versendet",
        tone: "green",
        icon: Truck,
      };
    }

    if (request.fulfillment_status === "ready_for_pickup") {
      return {
        area: "fulfillment",
        title: "Abholbereit",
        subtitle:
          "Das Angebot ist bestätigt und das Paket ist zur Abholung vorbereitet.",
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
          "Das Angebot ist bestätigt und das Paket ist für den Versand vorbereitet.",
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
          "Das Angebot ist bestätigt. Die Artikel wurden gepackt und warten auf Abholung oder Versand.",
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
          "Das Angebot ist bestätigt. Die Artikel wurden gepickt und können jetzt gepackt werden.",
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
          "Das Angebot ist bestätigt. Die Pickingliste wird gerade abgearbeitet.",
        badge: "Picking",
        tone: "amber",
        icon: ShoppingBasket,
      };
    }

    if (request.fulfillment_method === "pickup") {
      return {
        area: "fulfillment",
        title: "Angebot bestätigt · Abholung",
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
        title: "Angebot bestätigt · Versand",
        subtitle:
          "Der Kunde möchte Versand. Versandkosten prüfen, Pickingliste abarbeiten und Paket versenden.",
        badge: "Versand",
        tone: "green",
        icon: Truck,
      };
    }

    return {
      area: "fulfillment",
      title: "Angebot bestätigt",
      subtitle:
        "Der Kunde hat das Angebot offiziell angenommen. Übergabeart, Picking und Abwicklung können jetzt bearbeitet werden.",
      badge: "Bestätigt",
      tone: "green",
      icon: CheckCircle2,
    };
  }

  if (hasUpdateMail) {
    return {
      area: "open",
      title: "Aktualisiertes Angebot versandt",
      subtitle:
        "Das manuell geänderte Angebot wurde gesendet. Es wartet noch auf Kundenbestätigung.",
      badge: "Wartet auf Bestätigung",
      tone: "amber",
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
        "Du hast Positionen manuell angepasst. Prüfe final und sende danach das aktualisierte Angebot.",
      badge: "Bereit zur Prüfung",
      tone: "blue",
      icon: Wrench,
    };
  }

  if (overview.offerItemCount > 0) {
    return {
      area: "open",
      title: "Paket vorbereitet",
      subtitle:
        "Es gibt bereits Paketpositionen. Der Paketwunsch ist noch nicht final bestätigt.",
      badge: "In Bearbeitung",
      tone: "blue",
      icon: ShoppingBasket,
    };
  }

  if (overview.itemCount > 0 && overview.matchCount > 0) {
    return {
      area: "open",
      title: "Vorschläge verfügbar",
      subtitle:
        "Die Liste wurde ausgewertet und passende Produktvorschläge sind vorhanden.",
      badge: "Kunde kann wählen",
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
    title: "Neu eingegangen",
    subtitle:
      "Die Anfrage ist neu und muss noch ausgewertet oder bearbeitet werden.",
    badge: "Neu",
    tone: "neutral",
    icon: ClipboardList,
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

  if (request.status === "confirmed" || request.offer_status === "confirmed") {
    badges.push({
      label: "Angebot bestätigt",
      className: "border-[#BFE3CD] bg-[#F0FFF6] text-[#2F7D50]",
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
      className: "border-[#E8DED2] bg-white text-[#52616F]",
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

  if (
    hasEvent(overview, isUpdateMailEvent) ||
    overview.request.offer_status === "offer_sent"
  ) {
    badges.push({
      label: "Aktualisierungsmail versandt",
      className: "border-[#F1D1A8] bg-[#FFF8EE] text-[#A75B28]",
    });
  }

  return badges;
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

  const customerOfferPath = request.offer_token
    ? `/angebot/${request.offer_token}`
    : null;

  const customerOfferUrl = customerOfferPath
    ? `${siteUrl}${customerOfferPath}`
    : null;

  const infoBadges = getSmallInfoBadges(overview);

  return (
    <article className="rounded-[32px] border border-[#E8DED2] bg-white p-5 shadow-sm transition hover:shadow-[0_18px_45px_rgba(16,42,67,0.10)] sm:p-6">
      <div className="grid gap-5 lg:grid-cols-[1fr_280px] lg:items-start">
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

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
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

export default async function AdminRequestsPage() {
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

  if (requestIds.length > 0) {
    const [
      { data: filesData, error: filesError },
      { data: itemsData, error: itemsError },
      { data: offerItemsData, error: offerItemsError },
      { data: eventsData, error: eventsError },
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
    ]);

    if (filesError) {
      throw new Error(`Dateien konnten nicht geladen werden: ${filesError.message}`);
    }

    if (itemsError) {
      throw new Error(`Positionen konnten nicht geladen werden: ${itemsError.message}`);
    }

    if (offerItemsError) {
      throw new Error(
        `Paketpositionen konnten nicht geladen werden: ${offerItemsError.message}`
      );
    }

    if (eventsError) {
      throw new Error(`Verlauf konnte nicht geladen werden: ${eventsError.message}`);
    }

    files = (filesData || []) as RequestFile[];
    items = (itemsData || []) as RequestItem[];
    offerItems = (offerItemsData || []) as OfferItem[];
    events = (eventsData || []) as EventRow[];

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

    const offerItemsByRequestItem = new Map<string, OfferItem[]>();

    for (const offerItem of requestOfferItems) {
      if (!offerItem.request_item_id) continue;

      const current = offerItemsByRequestItem.get(offerItem.request_item_id) || [];
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
      totalPrice,
      hasAdminEdits: adminManualCount > 0 || hasAdminEditEvent,
    };
  });

  const openOverviews = overviews.filter(
    (overview) => getWorkflowStatus(overview).area === "open"
  );

  const fulfillmentOverviews = overviews.filter(
    (overview) => getWorkflowStatus(overview).area === "fulfillment"
  );

  const totalRequests = overviews.length;
  const openCount = openOverviews.length;
  const fulfillmentCount = fulfillmentOverviews.length;
  const shippingCount = fulfillmentOverviews.filter(
    (overview) => overview.request.fulfillment_method === "shipping"
  ).length;
  const pickupCount = fulfillmentOverviews.filter(
    (overview) => overview.request.fulfillment_method === "pickup"
  ).length;

  const refreshedAt = new Date().toISOString();

  return (
    <main className="min-h-screen bg-[#FBF7F0] text-[#102A43]">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
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
                Die Übersicht trennt offene Anfragen von bestätigten Angeboten
                in der Abwicklung. Sobald ein Kunde bestätigt hat, landet der
                Vorgang im Bereich „Angebot bestätigt / Abwicklung“.
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

        <section className="grid gap-4 md:grid-cols-5">
          <div className="rounded-[28px] border border-[#E8DED2] bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
              Gesamt
            </p>
            <p className="mt-2 text-3xl font-black">{totalRequests}</p>
          </div>

          <div className="rounded-[28px] border border-[#F1D1A8] bg-[#FFF8EE] p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
              Offen
            </p>
            <p className="mt-2 text-3xl font-black">{openCount}</p>
          </div>

          <div className="rounded-[28px] border border-[#BFE3CD] bg-[#F0FFF6] p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#2F7D50]">
              Bestätigt / Abwicklung
            </p>
            <p className="mt-2 text-3xl font-black">{fulfillmentCount}</p>
          </div>

          <div className="rounded-[28px] border border-[#E8DED2] bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#12395F]">
              Versand
            </p>
            <p className="mt-2 text-3xl font-black">{shippingCount}</p>
          </div>

          <div className="rounded-[28px] border border-[#E8DED2] bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#2F7D50]">
              Abholung
            </p>
            <p className="mt-2 text-3xl font-black">{pickupCount}</p>
          </div>
        </section>

        {overviews.length > 0 ? (
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
                      Neu, in Bearbeitung, manuelle Prüfung, Paket vorbereitet
                      oder aktualisiertes Angebot versandt.
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
                      Bereich Angebot bestätigt
                    </p>
                    <h2 className="mt-1 text-2xl font-black text-[#102A43]">
                      Angebot bestätigt / Abwicklung
                    </h2>
                    <p className="mt-1 text-sm font-semibold leading-6 text-[#52616F]">
                      Bestätigte Angebote, Pickingliste, Abholung, Versand,
                      abholbereit, versendet oder abgeholt.
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
                    Noch keine bestätigten Angebote in Abwicklung.
                  </h3>
                  <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#52616F]">
                    Sobald ein Kunde ein Angebot bestätigt, erscheint der Vorgang
                    hier für Picking, Abholung oder Versand.
                  </p>
                </div>
              )}
            </section>
          </section>
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