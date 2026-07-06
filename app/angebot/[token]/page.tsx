import { createClient } from "@supabase/supabase-js";
import Image from "next/image";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  ImageIcon,
  PackageCheck,
  School,
  Search,
  ShieldCheck,
  ShoppingBasket,
  Sparkles,
} from "lucide-react";
import CustomerPreparePackageButton from "@/components/CustomerPreparePackageButton";
import CustomerOpenPositionDecisionPanel from "@/components/CustomerOpenPositionDecisionPanel";
import CustomerOfferPresenceHeartbeat from "@/components/CustomerOfferPresenceHeartbeat";
import CustomerRefreshProductsButton from "@/components/CustomerRefreshProductsButton";
import CustomerSelectProductButton from "@/components/CustomerSelectProductButton";
import ConfirmOfferButton from "@/components/ConfirmOfferButton";
import CustomerProductSearch from "@/components/CustomerProductSearch";
import CustomerRemoveOfferItemButton from "@/components/CustomerRemoveOfferItemButton";
import CustomerReorderToCartButton from "@/components/CustomerReorderToCartButton";
import CustomerQuestionAnswerForm from "@/components/CustomerQuestionAnswerForm";
import CustomerOfferItemNoteForm from "@/components/CustomerOfferItemNoteForm";
import CustomerOfferRecommendations from "@/components/CustomerOfferRecommendations";
import LegalFooter from "@/components/LegalFooter";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    token: string;
  }>;
};

type SchoolRequest = {
  id: string;
  request_number: string | null;
  status: string | null;
  customer_name: string | null;
  child_name: string | null;
  school_name: string | null;
  class_name: string | null;
  email: string | null;
  phone: string | null;
  message: string | null;
  offer_token: string | null;
  ai_status: string | null;
  offer_status: string | null;
  is_active?: boolean | null;
  archived_at?: string | null;
  archive_reason?: string | null;
  created_at: string | null;
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
  product_type?: string | null;
  category: string | null;
  format: string | null;
  color: string | null;
  lineature: string | null;
  notes: string | null;
  confidence: number | string | null;
  status: string | null;
};

type RequestMatch = {
  id: string;
  request_item_id: string;
  product_id: string | null;
  product_name: string | null;
  product_sku: string | null;
  product_price: number | string | null;
  match_score: number | string | null;
  match_reason: string | null;
  selected: boolean | null;
};

type OfferItem = {
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
  total_price: number | string | null;
  source: string | null;
  status: string | null;
  notes: string | null;
  customer_note?: string | null;
  customer_note_updated_at?: string | null;
};

type RequestItemQuestion = {
  id: string;
  request_id: string;
  request_item_id: string | null;
  offer_item_id?: string | null;
  question_text: string;
  answer_text: string | null;
  status: "pending" | "answered" | "resolved" | "cancelled" | string;
  channel: string | null;
  created_at: string | null;
  answered_at: string | null;
  resolved_at: string | null;
  updated_at?: string | null;
};

type RequestEvent = {
  id: string;
  request_id: string;
  event_type?: string | null;
  type?: string | null;
  created_at: string | null;
};

type ProductRow = {
  id: string;
  image_url?: string | null;
  image_original_url?: string | null;
  image_styled_url?: string | null;
};

const AUTO_PRESELECT_MIN_SCORE = 85;
type CustomerVisibleResolutionStatus =
  | "customer_supplies_self"
  | "covered_by_alternative"
  | "";

function getCustomerVisibleResolutionStatus(item: RequestItem) {
  const value = String(
    (item as { admin_resolution_status?: string | null })
      .admin_resolution_status || ""
  ).trim();

  if (
    value === "customer_supplies_self" ||
    value === "covered_by_alternative"
  ) {
    return value as CustomerVisibleResolutionStatus;
  }

  return "";
}

function getCustomerResolutionTitle(status: CustomerVisibleResolutionStatus) {
  switch (status) {
    case "customer_supplies_self":
      return "Bitte selbst besorgen";
    case "covered_by_alternative":
      return "Bereits berücksichtigt";
    default:
      return "";
  }
}

function getCustomerResolutionText(status: CustomerVisibleResolutionStatus) {
  switch (status) {
    case "customer_supplies_self":
      return "Diesen Artikel führen wir aktuell nicht im Sortiment. Bitte besorge ihn separat.";
    case "covered_by_alternative":
      return "Diese Position ist durch einen passenden Alternativartikel oder eine Sammelposition im Paketwunsch abgedeckt.";
    default:
      return "";
  }
}


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

function cleanText(value: unknown, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value).trim();
  return text.length > 0 ? text : fallback;
}

function normalizeText(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .trim()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/grün/g, "gruen")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLineature(value: unknown) {
  const text = normalizeText(value);
  const compact = text.replace(/\s+/g, "");

  if (!text || text === "null" || text === "undefined") return null;

  if (
    text.includes("nicht lesbar") ||
    text.includes("nicht erkennbar") ||
    text.includes("keine lineatur erkennbar")
  ) {
    return "unknown";
  }

  if (
    text === "0" ||
    compact === "0" ||
    text.includes("lineatur 0") ||
    compact.includes("lineatur0") ||
    text.includes("lin 0") ||
    compact.includes("lin0") ||
    text.includes(" l 0") ||
    text.includes(" l0") ||
    text.includes("l0 ") ||
    text.endsWith(" l0") ||
    text.includes("heft 0") ||
    text.includes("schreibheft 0") ||
    text.includes("schulheft 0")
  ) {
    return "0";
  }

  if (
    text === "8" ||
    text === "8f" ||
    compact === "8" ||
    compact === "8f" ||
    text.includes("lineatur 8") ||
    text.includes("lineatur 8f") ||
    compact.includes("lineatur8") ||
    compact.includes("lineatur8f") ||
    text.includes("lin 8") ||
    text.includes("lin 8f") ||
    compact.includes("lin8") ||
    compact.includes("lin8f") ||
    text.includes(" l 8") ||
    text.includes(" l8") ||
    text.includes("l8 ") ||
    text.endsWith(" l8") ||
    text.includes(" l 8f") ||
    text.includes(" l8f") ||
    text.includes("l8f ") ||
    text.endsWith(" l8f") ||
    text.includes("8 f")
  ) {
    return "8f";
  }

  if (text.includes("kariert") || text.includes("karriert")) return "28";
  if (text.includes("liniert")) return "liniert";

  const known = [
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "9",
    "10",
    "25",
    "26",
    "27",
    "28",
  ];

  for (const entry of known) {
    if (
      text === entry ||
      compact === entry ||
      text.includes(`lineatur ${entry}`) ||
      compact.includes(`lineatur${entry}`) ||
      text.includes(`lin ${entry}`) ||
      compact.includes(`lin${entry}`) ||
      text.includes(` l ${entry}`) ||
      text.includes(` l${entry} `) ||
      text.endsWith(` l${entry}`) ||
      text.includes(`l${entry} `) ||
      text.endsWith(`l${entry}`)
    ) {
      return entry;
    }
  }

  if (text.includes("unklar")) return "unknown";

  return null;
}

function isHeftText(value: unknown) {
  const text = normalizeText(value);


return (
    text.includes("heft") ||
    text.includes("schulheft") ||
    text.includes("schreibheft")
  );
}

function isHausaufgabenheftText(value: unknown) {
  const text = normalizeText(value);

  return (
    text.includes("hausaufgabenheft") ||
    text.includes("hausaufgaben") ||
    text.includes("aufgabenheft")
  );
}

function isUmschlagText(value: unknown) {
  const text = normalizeText(value);

  return (
    text.includes("umschlag") ||
    text.includes("umschlaege") ||
    text.includes("hefthuelle") ||
    text.includes("hefthuellen") ||
    text.includes("huelle") ||
    text.includes("huellen")
  );
}

function isA5Text(value: unknown) {
  return normalizeText(value).includes("a5");
}

function getDisplayLineature(item: RequestItem) {
  const combinedText = `${item.lineature || ""} ${item.raw_text || ""} ${
    item.normalized_name || ""
  } ${item.notes || ""}`;

  const detectedLineature = normalizeLineature(combinedText);

  if (detectedLineature && detectedLineature !== "unknown") {
    return detectedLineature;
  }

  const itemText = `${item.raw_text || ""} ${item.normalized_name || ""} ${
    item.category || ""
  } ${item.product_type || ""}`;

  if (
    isHeftText(itemText) &&
    !isHausaufgabenheftText(itemText) &&
    isA5Text(itemText)
  ) {
    return "0";
  }

  return detectedLineature;
}

function getCustomerSearchDefaultQuery(item: RequestItem) {
  const title = getRequestItemTitle(item);
  const lineature = getDisplayLineature(item);

  if (lineature && lineature !== "unknown") {
    return `${title} Lineatur ${lineature}`;
  }

  return title;
}

function isFormatCompatible(item: RequestItem, match: RequestMatch) {
  const itemFormat = normalizeText(item.format);
  const productText = normalizeText(
    `${match.product_name || ""} ${match.product_sku || ""} ${
      match.match_reason || ""
    }`
  );

  if (!itemFormat) return true;
  if (itemFormat === "a4") return productText.includes("a4");
  if (itemFormat === "a5") return productText.includes("a5");
  if (itemFormat === "a3") return productText.includes("a3");

  return true;
}

function isLineatureCompatible(item: RequestItem, match: RequestMatch) {
  const itemLineature = getDisplayLineature(item);

  const productText = normalizeText(
    `${match.product_name || ""} ${match.product_sku || ""} ${
      match.match_reason || ""
    }`
  );

  if (!itemLineature || itemLineature === "unknown") return true;

  if (itemLineature === "0") {
    return (
      productText.includes("lineatur 0") ||
      productText.includes("lineatur0") ||
      productText.includes("lin 0") ||
      productText.includes("lin0") ||
      productText.includes(" l0 ") ||
      productText.endsWith(" l0")
    );
  }

  if (itemLineature === "8f") {
    return (
      productText.includes("lineatur 8") ||
      productText.includes("lineatur 8f") ||
      productText.includes("lineatur8") ||
      productText.includes("lineatur8f") ||
      productText.includes("lin 8") ||
      productText.includes("lin 8f") ||
      productText.includes("lin8") ||
      productText.includes("lin8f") ||
      productText.includes(" l8 ") ||
      productText.includes(" l8f ") ||
      productText.endsWith(" l8") ||
      productText.endsWith(" l8f")
    );
  }

  if (itemLineature === "28") {
    return (
      productText.includes("lineatur 28") ||
      productText.includes("lineatur28") ||
      productText.includes("lin 28") ||
      productText.includes("lin28") ||
      productText.includes(" l28") ||
      productText.includes("kariert") ||
      productText.includes("karriert")
    );
  }

  if (itemLineature === "liniert") {
    return productText.includes("liniert");
  }

  return (
    productText.includes(`lineatur ${itemLineature}`) ||
    productText.includes(`lineatur${itemLineature}`) ||
    productText.includes(`lin ${itemLineature}`) ||
    productText.includes(`lin${itemLineature}`) ||
    productText.includes(` l${itemLineature} `) ||
    productText.endsWith(` l${itemLineature}`)
  );
}

function isProductTypeCompatible(item: RequestItem, match: RequestMatch) {
  const itemText = normalizeText(
    `${item.raw_text || ""} ${item.normalized_name || ""} ${
      item.product_type || ""
    } ${item.category || ""}`
  );

  const productText = normalizeText(
    `${match.product_name || ""} ${match.product_sku || ""} ${
      match.match_reason || ""
    }`
  );

  const itemIsUmschlag = isUmschlagText(itemText);
  const productIsUmschlag = isUmschlagText(productText);

  if (itemIsUmschlag && !productIsUmschlag) return false;
  if (!itemIsUmschlag && productIsUmschlag) return false;

  const itemIsHausaufgabenheft = isHausaufgabenheftText(itemText);
  const productIsHausaufgabenheft = isHausaufgabenheftText(productText);

  if (itemIsHausaufgabenheft && !productIsHausaufgabenheft) return false;
  if (!itemIsHausaufgabenheft && productIsHausaufgabenheft) return false;

  const itemIsHeft = isHeftText(itemText);
  const productIsHeft = isHeftText(productText);

  if (itemIsHeft && !productIsHeft) return false;

  return true;
}

function isStrictMatchVisible(item: RequestItem, match: RequestMatch) {
  const score = toNumber(match.match_score, 0);

  if (score < 70) return false;
  if (!isProductTypeCompatible(item, match)) return false;
  if (!isFormatCompatible(item, match)) return false;
  if (!isLineatureCompatible(item, match)) return false;

  return true;
}

function isCustomerVisibleLearnedMatch(_match: RequestMatch) {
  // S0: gelernte Alias-Treffer bleiben bis zur echten Lerntabelle Admin-Prüfung.
  return false;
}
function isCustomerHiddenReviewMatch(match: RequestMatch) {
  const reason = String(match.match_reason || "").toLowerCase();

  return (
    reason.includes("artverwandter kandidat") ||
    reason.includes("admin-prüfung") ||
    reason.includes("admin-pruefung") ||
    reason.includes("variantenmerkmale")
  );
}
function isAutoSelectionBlockedMatch(match: RequestMatch) {
  const reason = String(match.match_reason || "").toLowerCase();

  if (
    reason.includes("artverwandter kandidat") ||
    reason.includes("admin-prüfung") ||
    reason.includes("admin-pruefung") ||
    reason.includes("variantenmerkmale") ||
    reason.includes("bitte prüfen") ||
    reason.includes("bitte pruefen") ||
    reason.includes("teilweise erkannt")
  ) {
    return true;
  }

  if (
    reason.includes("gelernte zuordnung") &&
    !reason.includes("exakt erkannt") &&
    !reason.includes("wiedererkannt")
  ) {
    return true;
  }

  return false;
}

function isSafeAutoMatch(match: RequestMatch) {
  return (
    Boolean(match.product_id) &&
    toNumber(match.match_score, 0) >= AUTO_PRESELECT_MIN_SCORE &&
    !isAutoSelectionBlockedMatch(match)
  );
}

function isSelectableOpenMatch(match: RequestMatch) {
  const score = toNumber(match.match_score, 0);
  return score >= 70 && score < AUTO_PRESELECT_MIN_SCORE;
}

function compareMatchesStable(a: RequestMatch, b: RequestMatch) {
  const scoreDifference = toNumber(b.match_score, 0) - toNumber(a.match_score, 0);

  if (scoreDifference !== 0) return scoreDifference;

  const productNameComparison = String(a.product_name || "").localeCompare(
    String(b.product_name || ""),
    "de",
    {
      numeric: true,
      sensitivity: "base",
    }
  );

  if (productNameComparison !== 0) return productNameComparison;

  const skuComparison = String(a.product_sku || "").localeCompare(
    String(b.product_sku || ""),
    "de",
    {
      numeric: true,
      sensitivity: "base",
    }
  );

  if (skuComparison !== 0) return skuComparison;

  return String(a.id).localeCompare(String(b.id), "de", {
    numeric: true,
    sensitivity: "base",
  });
}

function compareOfferItemsStable(a: OfferItem, b: OfferItem) {
  const requestItemComparison = String(a.request_item_id || "").localeCompare(
    String(b.request_item_id || ""),
    "de",
    {
      numeric: true,
      sensitivity: "base",
    }
  );

  if (requestItemComparison !== 0) return requestItemComparison;

  const sourceComparison = String(a.source || "").localeCompare(
    String(b.source || ""),
    "de",
    {
      numeric: true,
      sensitivity: "base",
    }
  );

  if (sourceComparison !== 0) return sourceComparison;

  const nameComparison = String(a.product_name || "").localeCompare(
    String(b.product_name || ""),
    "de",
    {
      numeric: true,
      sensitivity: "base",
    }
  );

  if (nameComparison !== 0) return nameComparison;

  return String(a.id).localeCompare(String(b.id), "de", {
    numeric: true,
    sensitivity: "base",
  });
}

function formatMoney(value: unknown) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(toNumber(value, 0));
}

function formatFileSize(size: number | null) {
  if (!size) return "—";

  if (size < 1024 * 1024) {
    return `${Math.round(size / 1024)} KB`;
  }

  return `${(size / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

function getRequestItemTitle(item: RequestItem) {
  return item.normalized_name || item.raw_text || "Unbekannte Position";
}

function getMatchScoreLabel(score: unknown) {
  const value = toNumber(score, 0);

  if (value >= 90) return "Beste Empfehlung";
  if (value >= 85) return "Sicherer Treffer";
  if (value >= 80) return "Sehr passend";
  if (value >= 70) return "Passend";
  return "Option";
}

function getOfferItemSourceLabel(source: string | null) {
  switch (source) {
    case "auto_preselected":
      return "Für Dich vorausgewählt";
    case "admin_manual":
      return "Von Handzettel-Schulen.de ergänzt";
    case "admin_existing_product":
      return "Von Handzettel-Schulen.de ergänzt";
    case "customer_search":
      return "Von Dir gesucht";
    case "customer_selection":
      return "Von Dir ausgewählt";
    case "match":
      return "Automatisch übernommen";
    default:
      return "Paketposition";
  }
}

function getQuestionStatusLabel(status: string | null) {
  switch (status) {
    case "pending":
      return "Bitte beantworten";
    case "answered":
      return "Antwort gespeichert";
    case "resolved":
      return "Erledigt";
    default:
      return status || "Rückfrage";
  }
}

function uniqueCleanStrings(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value || "").trim())
        .filter((value) => value.length > 0)
    )
  );
}
function getPreferredProductImageUrl(product: ProductRow) {
  return (
    cleanText(product.image_styled_url, "") ||
    cleanText(product.image_url, "") ||
    cleanText(product.image_original_url, "") ||
    null
  );
}
function getItemFacts(item: RequestItem | null | undefined) {
  if (!item) return [];

  const facts: string[] = [];
  const lineature = getDisplayLineature(item);

  facts.push(`Menge: ${toNumber(item.quantity, 1)}`);

  if (item.format) facts.push(`Format: ${item.format}`);
  if (lineature && lineature !== "unknown") facts.push(`Lineatur: ${lineature}`);
  if (item.color) facts.push(`Farbe: ${item.color}`);

  return facts;
}

function getOfferItemScoreLabel(
  item: OfferItem,
  matchById: Map<string, RequestMatch>
) {
  if (!item.match_id) return null;

  const match = matchById.get(item.match_id);
  if (!match) return null;

  const score = toNumber(match.match_score, 0);

  if (score <= 0) return null;

  if (item.source === "auto_preselected" || score >= AUTO_PRESELECT_MIN_SCORE) {
    return `Vorausgewählt · ${score} %`;
  }

  return `${getMatchScoreLabel(score)} · ${score} %`;
}

function isAutoPreselectedOfferItem(
  item: OfferItem,
  matchById: Map<string, RequestMatch>
) {
  if (item.source === "auto_preselected" || item.status === "preselected") {
    return true;
  }

  if (!item.match_id) return false;

  const match = matchById.get(item.match_id);
  return toNumber(match?.match_score, 0) >= AUTO_PRESELECT_MIN_SCORE;
}

async function insertMissingSafeMatchesIntoOffer(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  request: SchoolRequest;
  items: RequestItem[];
  matchesByItem: Map<string, RequestMatch[]>;
  selectedOfferItemsByRequestItem: Map<string, OfferItem[]>;
}) {
  const {
    supabase,
    request,
    items,
    matchesByItem,
    selectedOfferItemsByRequestItem,
  } = params;

  if (request.status === "confirmed" || request.offer_status === "confirmed") {
    return 0;
  }

  const rowsToInsert = items
    .map((item) => {
      const selectedForItem = selectedOfferItemsByRequestItem.get(item.id) || [];

      if (selectedForItem.length > 0) return null;

      const bestSafeMatch = (matchesByItem.get(item.id) || [])
        .filter(isSafeAutoMatch)
        .sort(compareMatchesStable)[0];

      if (!bestSafeMatch) return null;

      const productPrice = toNumber(bestSafeMatch.product_price, 0);

      return {
        request_id: request.id,
        request_item_id: bestSafeMatch.request_item_id,
        match_id: bestSafeMatch.id,
        product_id: bestSafeMatch.product_id,
        product_name: cleanText(bestSafeMatch.product_name, "Produkt"),
        product_sku: cleanText(bestSafeMatch.product_sku, "") || null,
        product_price: productPrice,
        quantity: toNumber(item.quantity, 1) || 1,
        unit: "Stk.",
        source: "auto_preselected",
        status: "preselected",
        notes: `Automatisch vorausgewählt, da der Produkttreffer ${toNumber(
          bestSafeMatch.match_score,
          0
        )} % Übereinstimmung erreicht hat.`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  if (rowsToInsert.length === 0) return 0;

  const { error } = await supabase.from("school_offer_items").insert(rowsToInsert);

  if (error) {
    console.error("Sichere Treffer konnten nicht nachgezogen werden:", error);
    return 0;
  }

  await supabase.from("school_request_events").insert({
    request_id: request.id,
    event_type: "customer_auto_preselected_items_repaired",
    title: "Sichere Treffer automatisch ergänzt",
    description: `${rowsToInsert.length} sichere Treffer wurden automatisch in den Paketwunsch gelegt. Schwelle: ${AUTO_PRESELECT_MIN_SCORE} %.`,
    created_at: new Date().toISOString(),
  });

  await supabase
    .from("school_requests")
    .update({
      offer_status: "customer_selection",
      updated_at: new Date().toISOString(),
    })
    .eq("id", request.id);

  return rowsToInsert.length;
}

function ProductImageBox({
  imageUrl,
  alt,
  size = "large",
}: {
  imageUrl?: string | null;
  alt: string;
  size?: "small" | "large";
}) {
  const sizeClass = size === "small" ? "h-20 w-20" : "h-28 w-full md:w-32";

  return (
    <div
      className={`${sizeClass} shrink-0 overflow-hidden rounded-2xl border border-[#E8DED2] bg-white`}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={alt}
          className="h-full w-full object-contain p-2"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[#A75B28]">
          <ImageIcon className="h-5 w-5" />
        </div>
      )}
    </div>
  );
}

function ReorderButtonBlock({
  item,
  request,
  requestItem,
  imageUrl,
}: {
  item: OfferItem;
  request: SchoolRequest;
  requestItem: RequestItem | null | undefined;
  imageUrl: string | null;
}) {
  return (
    <CustomerReorderToCartButton
      productId={item.product_id}
      productName={item.product_name}
      productSku={item.product_sku}
      productPrice={item.product_price}
      productImageUrl={imageUrl}
      quantity={1}
      category={requestItem?.category || null}
      format={requestItem?.format || null}
      color={requestItem?.color || null}
      lineature={
        requestItem ? getDisplayLineature(requestItem) || null : null
      }
      sourceRequestId={request.id}
      sourceOfferItemId={item.id}
      sourceRequestItemId={item.request_item_id}
      buttonLabel="Artikel nachkaufen"
    />
  );
}

function isArchivedCustomerRequest(request: SchoolRequest) {
  return (
    request.is_active === false ||
    request.status === "archived" ||
    Boolean(request.archived_at)
  );
}

function getCustomerDecisionEventType(event: RequestEvent) {
  return String(event.event_type || event.type || "").toLowerCase();
}

function getCustomerOpenPositionDecision(events: RequestEvent[]) {
  const relevantEvents = events.filter((event) => {
    const type = getCustomerDecisionEventType(event);

    return (
      type.includes("customer_requested_team_takeover") ||
      type.includes("customer_selected_self_selection")
    );
  });

  const latestEvent = relevantEvents[0] || null;

  if (!latestEvent) return null;

  const type = getCustomerDecisionEventType(latestEvent);

  if (type.includes("customer_requested_team_takeover")) return "team" as const;
  if (type.includes("customer_selected_self_selection")) return "self" as const;

  return null;
}

export default async function CustomerOfferPage({ params }: Params) {
  const { token } = await params;
  const supabase = getSupabaseAdmin();

  const { data: schoolRequest, error: requestError } = await supabase
    .from("school_requests")
    .select("*")
    .eq("offer_token", token)
    .maybeSingle();

  if (requestError) {
    throw new Error(
      `Anfrage konnte nicht geladen werden: ${requestError.message}`
    );
  }

  if (!schoolRequest) {
    notFound();
  }

  const request = schoolRequest as SchoolRequest;

  if (isArchivedCustomerRequest(request)) {
    return (
    <main className="min-h-screen bg-[#FBF7F0] text-[#102A43]">
      <CustomerOfferPresenceHeartbeat token={token} context="offer_page" />
        <section className="mx-auto flex min-h-[70vh] w-full max-w-4xl flex-col justify-center px-4 py-10 sm:px-6 lg:px-8">
          <div className="rounded-[36px] border border-[#E8DED2] bg-white p-6 text-center shadow-sm sm:p-10">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-3xl bg-[#FFF1F1] text-[#B5282D]">
              <AlertTriangle className="h-7 w-7" />
            </div>

            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#B5282D]">
              Paketwunsch abgelaufen
            </p>

            <h1 className="mt-3 text-3xl font-black tracking-tight text-[#102A43] sm:text-5xl">
              Dieser Paketwunsch ist nicht mehr aktiv.
            </h1>

            <p className="mx-auto mt-4 max-w-2xl text-base font-semibold leading-7 text-[#52616F]">
              Der Vorgang wurde archiviert, weil er nicht innerhalb der vorgesehenen
              Frist bezahlt wurde. Bitte stelle bei Bedarf eine neue Anfrage oder
              kontaktiere uns direkt.
            </p>
          </div>
        </section>

        <LegalFooter />
      </main>
    );
  }

  const [
    { data: files },
    { data: requestItems },
    { data: offerItems },
    { data: questionsData },
  ] = await Promise.all([
      supabase
        .from("school_request_files")
        .select("*")
        .eq("request_id", request.id)
        .order("created_at", { ascending: true }),

      supabase
        .from("school_request_items")
        .select("*")
        .eq("request_id", request.id)
        .order("created_at", { ascending: true }),

      supabase
        .from("school_offer_items")
        .select("*")
        .eq("request_id", request.id)
        .order("created_at", { ascending: true }),

      supabase
        .from("school_request_item_questions")
        .select("*")
        .eq("request_id", request.id)
        .in("status", ["pending", "answered"])
        .order("created_at", { ascending: true }),
    ]);

  const items = (requestItems || []) as RequestItem[];
  let selectedOfferItems = ((offerItems || []) as OfferItem[]).sort(
    compareOfferItemsStable
  );
  const questions = ((questionsData || []) as RequestItemQuestion[]).filter(
    (question) => question.status !== "cancelled" && question.status !== "resolved"
  );
  const uploadedFiles = (files || []) as RequestFile[];

const { data: customerDecisionEventsData, error: customerDecisionEventsError } =
    await supabase
      .from("school_request_events")
      .select("id, request_id, event_type, type, created_at")
      .eq("request_id", request.id)
      .or(
        "event_type.eq.customer_requested_team_takeover,event_type.eq.customer_selected_self_selection,type.eq.customer_requested_team_takeover,type.eq.customer_selected_self_selection"
      )
      .order("created_at", { ascending: false });

  if (customerDecisionEventsError) {
    throw new Error(
      `Kundenentscheidung konnte nicht geladen werden: ${customerDecisionEventsError.message}`
    );
  }

  const customerDecisionEvents =
    (customerDecisionEventsData || []) as RequestEvent[];

  const requestItemByIdForQuestions = new Map<string, RequestItem>();

  for (const item of items) {
    requestItemByIdForQuestions.set(item.id, item);
  }

  const itemIds = items.map((item) => item.id);

  let matches: RequestMatch[] = [];

  if (itemIds.length > 0) {
    const { data: matchRows, error: matchError } = await supabase
      .from("school_request_matches")
      .select("*")
      .in("request_item_id", itemIds)
      .order("request_item_id", { ascending: true })
      .order("match_score", { ascending: false })
      .order("product_name", { ascending: true })
      .order("product_sku", { ascending: true })
      .order("id", { ascending: true });

    if (matchError) {
      throw new Error(
        `Produktvorschläge konnten nicht geladen werden: ${matchError.message}`
      );
    }

    matches = (matchRows || []) as RequestMatch[];
  }

  const requestItemById = new Map<string, RequestItem>();
  const matchById = new Map<string, RequestMatch>();

  for (const item of items) {
    requestItemById.set(item.id, item);
  }

  for (const match of matches) {
    matchById.set(match.id, match);
  }

  const matchesByItem = new Map<string, RequestMatch[]>();

  for (const item of items) {
    const allItemMatches = matches
      .filter((match) => match.request_item_id === item.id)
      .sort(compareMatchesStable);

    const strictMatches = allItemMatches
      .filter(
        (match) =>
          isCustomerVisibleLearnedMatch(match) ||
          (isStrictMatchVisible(item, match) &&
            !isCustomerHiddenReviewMatch(match))
      )
      .slice(0, 3);

    matchesByItem.set(item.id, strictMatches);
  }

  let selectedOfferItemsByRequestItem = new Map<string, OfferItem[]>();

  for (const offerItem of selectedOfferItems) {
    if (!offerItem.request_item_id) continue;

    const current =
      selectedOfferItemsByRequestItem.get(offerItem.request_item_id) || [];
    current.push(offerItem);
    selectedOfferItemsByRequestItem.set(offerItem.request_item_id, current);
  }

  const isConfirmed =
    request.status === "confirmed" || request.offer_status === "confirmed";

  const hasNoRecognizedItems = items.length === 0;

  const isManualReviewState =
    request.status === "manual_review" ||
    request.ai_status === "manual_review" ||
    request.ai_status === "no_items_detected" ||
    request.ai_status === "missing_file" ||
    request.offer_status === "manual_review";

  const shouldShowManualReviewNotice =
    !isConfirmed && hasNoRecognizedItems && isManualReviewState;

  const shouldShowPrepareButton =
    !isConfirmed &&
    !shouldShowManualReviewNotice &&
    (hasNoRecognizedItems || matches.length === 0);

  const repairedCount = await insertMissingSafeMatchesIntoOffer({
    supabase,
    request,
    items,
    matchesByItem,
    selectedOfferItemsByRequestItem,
  });

  if (repairedCount > 0) {
    const { data: refreshedOfferItems, error: refreshedOfferItemsError } =
      await supabase
        .from("school_offer_items")
        .select("*")
        .eq("request_id", request.id)
        .order("created_at", { ascending: true });

    if (refreshedOfferItemsError) {
      throw new Error(
        `Paketpositionen konnten nach der automatischen Vorauswahl nicht neu geladen werden: ${refreshedOfferItemsError.message}`
      );
    }

    selectedOfferItems = ((refreshedOfferItems || []) as OfferItem[]).sort(
      compareOfferItemsStable
    );

    selectedOfferItemsByRequestItem = new Map<string, OfferItem[]>();

    for (const offerItem of selectedOfferItems) {
      if (!offerItem.request_item_id) continue;

      const current =
        selectedOfferItemsByRequestItem.get(offerItem.request_item_id) || [];
      current.push(offerItem);
      selectedOfferItemsByRequestItem.set(offerItem.request_item_id, current);
    }
  }

  const productIds = Array.from(
    new Set(
      [
        ...matches.map((match) => match.product_id),
        ...selectedOfferItems.map((item) => item.product_id),
      ].filter((id): id is string => Boolean(id))
    )
  );

  const productImageById = new Map<string, string | null>();

if (productIds.length > 0) {
  const { data: productRows, error: productRowsError } = await supabase
    .from("school_products")
    .select("id, image_styled_url, image_url, image_original_url")
    .in("id", productIds);

  if (productRowsError) {
    throw new Error(
      `Produktbilder konnten nicht geladen werden: ${productRowsError.message}`
    );
  }

  for (const product of (productRows || []) as ProductRow[]) {
    productImageById.set(product.id, getPreferredProductImageUrl(product));
  }
}

  const selectedMatchIds = new Set(
    selectedOfferItems
      .map((item) => item.match_id)
      .filter((id): id is string => Boolean(id))
  );

  const totalPrice = selectedOfferItems.reduce((sum, item) => {
    const quantity = toNumber(item.quantity, 1);
    const price = toNumber(item.product_price, 0);
    return sum + quantity * price;
  }, 0);

  const autoPreselectedOfferItems = selectedOfferItems.filter((item) =>
    isAutoPreselectedOfferItem(item, matchById)
  );

  const otherSelectedOfferItems = selectedOfferItems.filter(
    (item) => !isAutoPreselectedOfferItem(item, matchById)
  );

  const openChoiceItems = items.filter((item) => {
    const selectedForItem = selectedOfferItemsByRequestItem.get(item.id) || [];
    const itemMatches = matchesByItem.get(item.id) || [];
    const selectableMatches = itemMatches.filter(isSelectableOpenMatch);
    const adminResolutionStatus = getCustomerVisibleResolutionStatus(item);

    return (
      !adminResolutionStatus &&
      selectedForItem.length === 0 &&
      selectableMatches.length > 0
    );
  });

  const manualReviewItems = items.filter((item) => {
    const selectedForItem = selectedOfferItemsByRequestItem.get(item.id) || [];
    const itemMatches = matchesByItem.get(item.id) || [];
    const adminResolutionStatus = getCustomerVisibleResolutionStatus(item);
    const safeMatches = itemMatches.filter(isSafeAutoMatch);
    const selectableMatches = itemMatches.filter(isSelectableOpenMatch);

    return (
      !adminResolutionStatus &&
      selectedForItem.length === 0 &&
      safeMatches.length === 0 &&
      selectableMatches.length === 0
    );
  });

  const customerResolvedItems = items.filter((item) => {
    const selectedForItem = selectedOfferItemsByRequestItem.get(item.id) || [];
    const adminResolutionStatus = getCustomerVisibleResolutionStatus(item);

    return adminResolutionStatus && selectedForItem.length === 0;
  });
  const handledItemCount =
    items.length - openChoiceItems.length - manualReviewItems.length;

  const hasOpenCustomerBlockingItems =
    openChoiceItems.length > 0 || manualReviewItems.length > 0;

  const openDecisionItemCount =
    openChoiceItems.length + manualReviewItems.length;

const persistedOpenPositionDecision =
    getCustomerOpenPositionDecision(customerDecisionEvents);

  const customerOpenPositionDecision =
    persistedOpenPositionDecision ||
    (hasOpenCustomerBlockingItems &&
    (request.status === "manual_review" || request.offer_status === "manual_review")
      ? ("team" as const)
      : null);

const customerOpenPositionScreenMode =
    !isConfirmed && openDecisionItemCount > 0
      ? customerOpenPositionDecision === "self"
        ? ("self" as const)
        : ("decision" as const)
      : ("package" as const);

  if (customerOpenPositionScreenMode === "decision") {
    return (
      <main className="min-h-screen bg-[#FBF7F0] px-4 py-8 text-[#102A43] sm:px-6 lg:px-8">
        <CustomerOfferPresenceHeartbeat token={token} context="offer_page" />

        <section className="mx-auto flex w-full max-w-6xl flex-col gap-6">
          <section className="rounded-[34px] border-2 border-[#B5282D] bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#B5282D]">
                  Ergebnis nach dem Auslesen
                </p>

                <h1 className="mt-2 text-3xl font-black tracking-tight text-[#102A43] sm:text-4xl">
                  Ein Teil ist fertig. Für die offenen Positionen wählst Du jetzt den nächsten Schritt.
                </h1>

                <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-[#52616F]">
                  Erkannte Artikel liegen bereits im Paket. Für offene Positionen entscheidest Du zuerst:
                  selbst auswählen oder von Handzettel-Schulen.de übernehmen lassen.
                </p>
              </div>

              <div className="rounded-2xl bg-[#FFF1F1] px-4 py-3 text-sm font-black text-[#B5282D]">
                Entscheidung erforderlich
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <div className="rounded-[28px] border border-[#E8DED2] bg-[#FBF7F0] p-5 shadow-sm">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
                  Erkannte Positionen
                </p>
                <p className="mt-2 text-4xl font-black text-[#102A43]">
                  {items.length}
                </p>
              </div>

              <div className="rounded-[28px] border border-[#BFE3CD] bg-[#F0FFF6] p-5 text-[#2F7D50] shadow-sm">
                <p className="text-xs font-black uppercase tracking-[0.16em]">
                  Schon im Paket
                </p>
                <p className="mt-2 text-4xl font-black">
                  {autoPreselectedOfferItems.length}
                </p>
              </div>

              <div className="rounded-[28px] border border-[#F1D1A8] bg-[#FFF8EE] p-5 text-[#A75B28] shadow-sm">
                <p className="text-xs font-black uppercase tracking-[0.16em]">
                  Auswahl offen
                </p>
                <p className="mt-2 text-4xl font-black">
                  {openDecisionItemCount}
                </p>
              </div>
            </div>
          </section>

          <CustomerOpenPositionDecisionPanel
            token={token}
            openChoiceCount={openChoiceItems.length}
            manualReviewCount={openDecisionItemCount}
            initialChoice={customerOpenPositionDecision}
          />
        </section>

        <LegalFooter />
      </main>
    );
  }

  const shouldGateCustomerOpenPositionDecision =
    !isConfirmed &&
    hasOpenCustomerBlockingItems &&
    customerOpenPositionDecision !== "self";

const isFreshBeforeAnalysis =
    !isConfirmed &&
    hasNoRecognizedItems &&
    !isManualReviewState &&
    selectedOfferItems.length === 0 &&
    matches.length === 0;

  if (isFreshBeforeAnalysis) {
    return (
    <main className="min-h-screen bg-[#FBF7F0] text-[#102A43]">
      <CustomerOfferPresenceHeartbeat token={token} context="offer_page" />
        <section className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
          <CustomerPreparePackageButton token={token} requestId={request.id} />
        </section>
<LegalFooter />
      </main>
    );
  }

  if (shouldShowManualReviewNotice) {
    return (
    <main className="min-h-screen bg-[#FBF7F0] text-[#102A43]">
      <CustomerOfferPresenceHeartbeat token={token} context="offer_page" />
        <section className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
          <section className="overflow-hidden rounded-[34px] border border-[#E8DED2] bg-white shadow-sm">
            <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-[#F0FFF6] px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-[#2F7D50]">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Persönlicher Service
                </div>

                <h1 className="mt-4 text-3xl font-black tracking-tight text-[#102A43] sm:text-5xl">
                  Wir übernehmen die persönliche Prüfung.
                </h1>

                <p className="mt-4 max-w-3xl text-base font-semibold leading-8 text-[#52616F]">
                  Deine Liste ist bei uns angekommen. Die automatische
                  Vorbereitung konnte Deine Liste nicht direkt eindeutig
                  zuordnen – das ist kein Problem. Genau dafür gibt es unseren
                  persönlichen Service: Wir schauen uns Deine Liste jetzt
                  manuell an und suchen die passenden Schulmaterialien für Dich
                  heraus.
                </p>

                <div className="mt-6 grid gap-3 md:grid-cols-3">
                  <div className="rounded-[22px] border border-[#BFE3CD] bg-[#F0FFF6] p-4">
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-[#2F7D50]">
                      Bestätigt
                    </p>
                    <p className="mt-1 text-sm font-black leading-6 text-[#2F7D50]">
                      Deine Anfrage ist angekommen.
                    </p>
                  </div>

                  <div className="rounded-[22px] border border-[#E8DED2] bg-[#FBF7F0] p-4">
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-[#A75B28]">
                      Service
                    </p>
                    <p className="mt-1 text-sm font-black leading-6 text-[#52616F]">
                      Wir prüfen die Liste persönlich.
                    </p>
                  </div>

                  <div className="rounded-[22px] border border-[#D6E7EF] bg-[#F5FAFD] p-4">
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-[#12395F]">
                      Nächster Schritt
                    </p>
                    <p className="mt-1 text-sm font-black leading-6 text-[#12395F]">
                      Du erhältst Deinen Paketwunsch per E-Mail.
                    </p>
                  </div>
                </div>

                <div className="mt-6 rounded-[28px] border border-[#BFE3CD] bg-[#F7FBF8] p-5">
                  <div className="flex items-start gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#F0FFF6] text-[#2F7D50]">
                      <CheckCircle2 className="h-6 w-6" />
                    </div>

                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.16em] text-[#2F7D50]">
                        Du bist gut aufgehoben
                      </p>

                      <h2 className="mt-1 text-xl font-black text-[#102A43]">
                        Du musst jetzt nichts weiter tun.
                      </h2>

                      <p className="mt-2 text-sm font-semibold leading-6 text-[#52616F]">
                        Unser Team sucht die passenden Artikel für Dich heraus.
                        Sobald Dein Paketwunsch vorbereitet ist, bekommst Du
                        eine E-Mail mit Deinem persönlichen Prüflink.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <aside className="flex flex-col gap-4">
                <div className="inline-flex min-h-[76px] w-full items-center justify-center gap-3 rounded-[28px] border border-[#BFE3CD] bg-[#F0FFF6] px-8 py-5 text-center text-xl font-black text-[#2F7D50] shadow-sm">
                  <CheckCircle2 className="h-6 w-6" />
                  <span>Wird persönlich für Dich vorbereitet</span>
                </div>

                <div className="overflow-hidden rounded-[28px] border border-[#E8DED2] bg-[#FBF7F0] shadow-sm">
                  <div className="relative h-[280px] w-full bg-white">
                    <Image
                      src="/service-schulheft-assistentin.png"
                      alt="Freundliche Mitarbeiterin sucht passende Schulhefte für den Kunden aus dem Regal"
                      fill
                      className="object-cover"
                      priority
                    />
                  </div>

                  <div className="p-5">
                    <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-[#A75B28]">
                      <Search className="h-3.5 w-3.5" />
                      Unser Service für Dich
                    </div>

                    <h3 className="mt-3 text-xl font-black text-[#102A43]">
                      Wir suchen nicht nur automatisch – wir prüfen auch
                      persönlich.
                    </h3>

                    <p className="mt-2 text-sm font-semibold leading-6 text-[#52616F]">
                      Wenn ein Artikel nicht sofort automatisch erkannt wird,
                      ist das kein Problem. Genau dann schaut unser Team
                      persönlich auf Deine Liste.
                    </p>
                  </div>
                </div>
              </aside>
            </div>
          </section>
        </section>
<LegalFooter />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#FBF7F0] text-[#102A43]">
      <CustomerOfferPresenceHeartbeat token={token} context="offer_page" />
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        {!isConfirmed ? (
          <section className="rounded-[34px] border-2 border-[#B5282D] bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#B5282D]">
                  Ergebnis nach dem Auslesen
                </p>

                <h1 className="mt-2 text-3xl font-black tracking-tight text-[#102A43] sm:text-4xl">
                  {hasOpenCustomerBlockingItems
                    ? "Ein Teil ist fertig. Für die offenen Positionen wählst Du jetzt den nächsten Schritt."
                    : "Alle Positionen sind vorbereitet. Prüfe jetzt Dein Paket."}
                </h1>

                <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-[#52616F]">
                  Erkannte Artikel liegen bereits im Paket. Für offene Positionen wählst Du jetzt: selbst auswählen oder von Handzettel-Schulen.de übernehmen lassen.
                </p>
              </div>

              <div className="rounded-2xl bg-[#FFF1F1] px-4 py-3 text-sm font-black text-[#B5282D]">
                {hasOpenCustomerBlockingItems
                  ? "Entscheidung erforderlich"
                  : "Bereit zur Prüfung"}
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <div className="rounded-[28px] border border-[#E8DED2] bg-[#FBF7F0] p-5 shadow-sm">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
                  Erkannte Positionen
                </p>
                <p className="mt-2 text-4xl font-black text-[#102A43]">
                  {items.length}
                </p>
              </div>

              <div className="rounded-[28px] border border-[#BFE3CD] bg-[#F0FFF6] p-5 text-[#2F7D50] shadow-sm">
                <p className="text-xs font-black uppercase tracking-[0.16em]">
                  Schon im Paket
                </p>
                <p className="mt-2 text-4xl font-black">
                  {autoPreselectedOfferItems.length}
                </p>
              </div>

              <div className="rounded-[28px] border border-[#F1D1A8] bg-[#FFF8EE] p-5 text-[#A75B28] shadow-sm">
                <p className="text-xs font-black uppercase tracking-[0.16em]">
                  Auswahl offen
                </p>
                <p className="mt-2 text-4xl font-black">
                  {openDecisionItemCount}
                </p>
              </div>
            </div>
          </section>
        ) : null}

        {!isConfirmed && hasOpenCustomerBlockingItems ? (
          <CustomerOpenPositionDecisionPanel
            token={token}
            openChoiceCount={openChoiceItems.length}
            manualReviewCount={openDecisionItemCount}
          />
        ) : null}

        <header className="overflow-hidden rounded-[34px] border border-[#E8DED2] bg-white shadow-sm">
          <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[1fr_360px] lg:items-stretch">
            <div className="flex flex-col justify-between">
              <div className="flex items-start gap-4">
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-3xl border border-[#E8DED2] bg-[#FBF7F0]">
                  <Image
                    src="/handzettel-logo.png"
                    alt="Handzettel-Schulen.de"
                    fill
                    className="object-contain p-2"
                    priority
                  />
                </div>

                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-[#A75B28]">
                    Handzettel-Schulen.de
                  </p>

                  <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-5xl">
                    {isConfirmed
                      ? "Dein Schulpaket ist bestätigt"
                      : "Prüfe jetzt Dein vorbereitetes Schulpaket"}
                  </h1>

                  <p className="mt-3 max-w-3xl text-sm leading-6 text-[#52616F] sm:text-base sm:leading-7">
                    {isConfirmed
                      ? "Dein Paketwunsch wurde an Handzettel-Schulen.de übermittelt. Wir prüfen den finalen Stand und bereiten die nächsten Schritte vor. Du kannst passende Artikel später direkt nachkaufen."
                      : "Wir haben Deine Materialliste erfasst und passende Produkte vorbereitet. Sichere Treffer liegen bereits im Paket. Du kannst einzelne Artikel entfernen, offene Positionen ergänzen oder unklare Artikel von uns prüfen lassen."}
                  </p>
                </div>
              </div>

              {!isConfirmed ? (
                <div className="mt-6 grid gap-3 md:grid-cols-3">
                  <div className="rounded-[22px] border border-[#BFE3CD] bg-[#F0FFF6] p-4 text-[#2F7D50]">
                    <p className="text-xs font-black uppercase tracking-[0.14em]">
                      Sicher
                    </p>
                    <p className="mt-1 font-black">
                      Treffer ab 85 % werden vorausgewählt.
                    </p>
                  </div>

                  <div className="rounded-[22px] border border-[#F1D1A8] bg-[#FFF8EE] p-4 text-[#A75B28]">
                    <p className="text-xs font-black uppercase tracking-[0.14em]">
                      Offen
                    </p>
                    <p className="mt-1 font-black">
                      Wenn etwas offen bleibt, entscheidest Du: selbst ergänzen oder Team übernehmen lassen.
                    </p>
                  </div>

                  <div className="rounded-[22px] border border-[#D6E7EF] bg-[#F5FAFD] p-4 text-[#12395F]">
                    <p className="text-xs font-black uppercase tracking-[0.14em]">
                      Service
                    </p>
                    <p className="mt-1 font-black">
                      Wir übernehmen offene Positionen, sobald Du es auswählst.
                    </p>
                  </div>
                </div>
              ) : null}
            </div>

            <aside className="rounded-[30px] border border-[#E8DED2] bg-[#FBF7F0] p-5">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
                Aktueller Paketwert
              </p>

              <h2 className="mt-2 text-2xl font-black text-[#102A43]">
                {formatMoney(totalPrice)}
              </h2>

              <p className="mt-1 text-sm font-semibold text-[#52616F]">
                {selectedOfferItems.length} Paketposition
                {selectedOfferItems.length === 1 ? "" : "en"}
              </p>

              <div className="mt-4 space-y-2 text-sm font-semibold text-[#52616F]">
                <div className="flex justify-between gap-3">
                  <span>Schon im Paket</span>
                  <span className="font-black text-[#2F7D50]">
                    {autoPreselectedOfferItems.length}
                  </span>
                </div>

                <div className="flex justify-between gap-3">
                  <span>Noch klären</span>
                  <span className="font-black text-[#A75B28]">
                    {openChoiceItems.length}
                  </span>
                </div>

                <div className="flex justify-between gap-3">
                  <span>Auswahl offen gesamt</span>
                  <span className="font-black text-[#52616F]">
                    {manualReviewItems.length}
                  </span>
                </div>
              </div>

              {!isConfirmed && selectedOfferItems.length > 0 ? (
                <div className="mt-5">
                  <ConfirmOfferButton
                    token={token}
                    disabled={hasOpenCustomerBlockingItems}
                    buttonLabel={
                      hasOpenCustomerBlockingItems
                        ? "Offene Positionen zuerst klären"
                        : "Paketwunsch bestätigen"
                    }
                  />
                </div>
              ) : null}

              {!isConfirmed ? (
                <p className="mt-4 text-xs font-semibold leading-5 text-[#52616F]">
                  Du kommst erst mit dem Bestätigungsbutton in den Checkout
                  ab. Vorher kannst Du Artikel entfernen oder ergänzen.
                </p>
              ) : null}

              {isConfirmed ? (
                <div className="mt-5 rounded-2xl border border-[#BFE3CD] bg-white p-4 text-[#2F7D50]">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                    <p className="text-sm font-black">
                      Dein Paketwunsch wurde bestätigt.
                    </p>
                  </div>
                </div>
              ) : null}
            </aside>
          </div>
        </header>

        {questions.length > 0 && !isConfirmed ? (
          <section className="rounded-[34px] border border-[#F1D1A8] bg-[#FFF8EE] p-5 shadow-sm sm:p-6">
            <div className="mb-5 flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-[#A75B28]">
                <AlertTriangle className="h-5 w-5" />
              </div>

              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
                  Kurze Rückfrage
                </p>
                <h2 className="text-2xl font-black text-[#102A43]">
                  Wir brauchen noch eine kurze Info von Dir
                </h2>
                <p className="mt-2 text-sm font-semibold leading-6 text-[#52616F]">
                  Bitte beantworte die Rückfrage direkt hier. Dann können wir
                  die betroffene Position sauber prüfen und Dein Paket fertigstellen.
                </p>
              </div>
            </div>

            <div className="grid gap-4">
              {questions.map((question) => {
                const relatedItem = question.request_item_id
                  ? requestItemByIdForQuestions.get(question.request_item_id)
                  : null;

                return (
                  <article
                    key={question.id}
                    className="rounded-[28px] border border-[#E8DED2] bg-white p-4"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
                          {relatedItem
                            ? `Position: ${getRequestItemTitle(relatedItem)}`
                            : "Allgemeine Rückfrage"}
                        </p>
                        <p className="mt-2 whitespace-pre-wrap text-base font-black leading-7 text-[#102A43]">
                          {question.question_text}
                        </p>
                      </div>

                      <span className="inline-flex rounded-full bg-[#FBF7F0] px-3 py-1 text-xs font-black text-[#A75B28]">
                        {getQuestionStatusLabel(question.status)}
                      </span>
                    </div>

                    {question.status === "pending" ? (
                      <CustomerQuestionAnswerForm
                        token={token}
                        questionId={question.id}
                      />
                    ) : question.answer_text ? (
                      <div className="mt-4 rounded-2xl border border-[#BFE3CD] bg-[#F0FFF6] p-4">
                        <p className="text-xs font-black uppercase tracking-[0.16em] text-[#2F7D50]">
                          Deine Antwort wurde gespeichert
                        </p>
                        <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6 text-[#102A43]">
                          {question.answer_text}
                        </p>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-[28px] border border-[#E8DED2] bg-white p-5 shadow-sm">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#F4E9DC] text-[#A75B28]">
              <School className="h-5 w-5" />
            </div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
              Kind / Schule
            </p>
            <h2 className="mt-2 text-lg font-black">
              {request.child_name || "Noch nicht angegeben"}
            </h2>
            <p className="mt-1 text-sm text-[#52616F]">
              {request.school_name || "Schule nicht angegeben"}
              {request.class_name ? ` · Klasse ${request.class_name}` : ""}
            </p>
          </div>

          <div className="rounded-[28px] border border-[#E8DED2] bg-white p-5 shadow-sm">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#F4E9DC] text-[#A75B28]">
              <FileText className="h-5 w-5" />
            </div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
              Deine Liste
            </p>
            <h2 className="mt-2 text-lg font-black">
              {uploadedFiles[0]?.original_filename || "Datei vorhanden"}
            </h2>
            <p className="mt-1 text-sm text-[#52616F]">
              {formatFileSize(uploadedFiles[0]?.file_size || null)}
            </p>
          </div>

          <div className="rounded-[28px] border border-[#E8DED2] bg-white p-5 shadow-sm">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#F4E9DC] text-[#A75B28]">
              <PackageCheck className="h-5 w-5" />
            </div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
              Bearbeitungsstand
            </p>
            <h2 className="mt-2 text-lg font-black">
              {isConfirmed ? "Abgesendet" : "Noch prüfbar"}
            </h2>
            <p className="mt-1 text-sm text-[#52616F]">
              {handledItemCount} von {items.length} Positionen im Paket
            </p>
          </div>
        </section>

        {shouldShowPrepareButton ? (
          <CustomerPreparePackageButton token={token} requestId={request.id} />
        ) : null}

        {isConfirmed ? (
          <section className="rounded-[28px] border border-[#BFE3CD] bg-[#F0FFF6] p-5 text-[#2F7D50] shadow-sm">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <h2 className="font-black">
                  Dein Paketwunsch wurde erfolgreich bestätigt.
                </h2>
                <p className="mt-1 text-sm leading-6">
                  Handzettel-Schulen.de hat Deine Auswahl erhalten. Wenn noch
                  etwas unklar ist, prüfen wir es persönlich, bevor Dein Paket
                  final vorbereitet wird.
                </p>
              </div>
            </div>
          </section>
        ) : null}

        {items.length > 0 ? (
          <section className="grid gap-6 lg:grid-cols-[1fr_360px] lg:items-start">
            <div className="space-y-6">
              <section className="rounded-[32px] border border-[#BFE3CD] bg-[#F0FFF6] p-5 shadow-sm sm:p-6">
                <div className="mb-5 flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-[#2F7D50]">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>

                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-[#2F7D50]">
                      Bereits erledigt
                    </p>
                    <h2 className="text-2xl font-black text-[#102A43]">
                      Diese Artikel liegen schon in Deinem Paket
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-[#2F7D50]">
                      Diese Produkte passen sehr sicher zu Deiner Liste. Du
                      musst hier nichts tun – nur entfernen, falls Du einen
                      Artikel nicht möchtest.
                    </p>
                  </div>
                </div>

                {autoPreselectedOfferItems.length > 0 ? (
                  <div className="space-y-3">
                    {autoPreselectedOfferItems.map((item) => {
                      const requestItem = item.request_item_id
                        ? requestItemById.get(item.request_item_id)
                        : null;

                      const imageUrl = item.product_id
                        ? productImageById.get(item.product_id) || null
                        : null;

                      const itemTotal =
                        toNumber(item.quantity, 1) *
                        toNumber(item.product_price, 0);

                      const scoreLabel = getOfferItemScoreLabel(item, matchById);

                      return (
                        <article
                          key={item.id}
                          className="rounded-[26px] border border-[#BFE3CD] bg-white p-4"
                        >
                          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                            <div className="flex flex-col gap-4 md:flex-row md:items-center">
                              <ProductImageBox
                                imageUrl={imageUrl}
                                alt={item.product_name}
                                size="small"
                              />

                              <div>
                                <div className="mb-2 flex flex-wrap gap-2">
                                  <span className="rounded-full bg-[#2F7D50] px-3 py-1 text-xs font-black text-white">
                                    {scoreLabel || "Vorausgewählt"}
                                  </span>

                                  <span className="rounded-full bg-[#F0FFF6] px-3 py-1 text-xs font-black text-[#2F7D50]">
                                    Im Paket
                                  </span>
                                </div>

                                <h3 className="font-black text-[#102A43]">
                                  {item.product_name}
                                </h3>

                                <p className="mt-1 text-sm text-[#52616F]">
                                  {item.product_sku
                                    ? `Art.-Nr.: ${item.product_sku}`
                                    : "Ohne Artikelnummer"}
                                </p>

                                <div className="mt-2 flex flex-wrap gap-2">
                                  {getItemFacts(requestItem).map((fact) => (
                                    <span
                                      key={fact}
                                      className="rounded-full bg-[#FBF7F0] px-3 py-1 text-xs font-bold text-[#52616F]"
                                    >
                                      {fact}
                                    </span>
                                  ))}
                                </div>

                                {isConfirmed ? (
                                  <ReorderButtonBlock
                                    item={item}
                                    request={request}
                                    requestItem={requestItem}
                                    imageUrl={imageUrl}
                                  />
                                ) : null}
                              </div>
                            </div>

                            <div className="flex shrink-0 flex-col gap-3 md:min-w-[190px] md:items-end">
                              <div className="md:text-right">
                                <p className="text-lg font-black text-[#102A43]">
                                  {formatMoney(item.product_price)}
                                </p>
                                <p className="text-sm font-semibold text-[#52616F]">
                                  Gesamt: {formatMoney(itemTotal)}
                                </p>
                              </div>

                              {!isConfirmed ? (
                                <CustomerRemoveOfferItemButton
                                  token={token}
                                  itemId={item.id}
                                  productName={item.product_name}
                                />
                              ) : null}
                            </div>
                          </div>

                          <CustomerOfferItemNoteForm
                            token={token}
                            itemId={item.id}
                            productName={item.product_name}
                            initialNote={item.customer_note || ""}
                            disabled={isConfirmed}
                          />
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-[26px] border border-dashed border-[#BFE3CD] bg-white p-5 text-sm font-semibold text-[#2F7D50]">
                    Noch keine sicheren Treffer automatisch im Paket. Sobald
                    passende Produkte mit mindestens 85 % erkannt werden,
                    erscheinen sie hier.
                  </div>
                )}
              </section>

              {otherSelectedOfferItems.length > 0 ? (
                <section className="rounded-[32px] border border-[#E8DED2] bg-white p-5 shadow-sm sm:p-6">
                  <div className="mb-5 flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#FBF7F0] text-[#A75B28]">
                      <ShoppingBasket className="h-5 w-5" />
                    </div>

                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
                        Zusätzlich im Paket
                      </p>
                      <h2 className="text-2xl font-black text-[#102A43]">
                        Von Dir oder unserem Team ergänzt
                      </h2>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {otherSelectedOfferItems.map((item) => {
                      const requestItem = item.request_item_id
                        ? requestItemById.get(item.request_item_id)
                        : null;

                      const imageUrl = item.product_id
                        ? productImageById.get(item.product_id) || null
                        : null;

                      const itemTotal =
                        toNumber(item.quantity, 1) *
                        toNumber(item.product_price, 0);

                      return (
                        <article
                          key={item.id}
                          className="rounded-[26px] border border-[#E8DED2] bg-[#FBF7F0] p-4"
                        >
                          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                            <div className="flex flex-col gap-4 md:flex-row md:items-center">
                              <ProductImageBox
                                imageUrl={imageUrl}
                                alt={item.product_name}
                                size="small"
                              />

                              <div>
                                <div className="mb-2 flex flex-wrap gap-2">
                                  <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-[#A75B28]">
                                    {getOfferItemSourceLabel(item.source)}
                                  </span>

                                  <span className="rounded-full bg-[#F0FFF6] px-3 py-1 text-xs font-black text-[#2F7D50]">
                                    Im Paket
                                  </span>
                                </div>

                                <h3 className="font-black text-[#102A43]">
                                  {item.product_name}
                                </h3>

                                <p className="mt-1 text-sm text-[#52616F]">
                                  {item.product_sku
                                    ? `Art.-Nr.: ${item.product_sku}`
                                    : "Ohne Artikelnummer"}
                                </p>

                                <div className="mt-2 flex flex-wrap gap-2">
                                  {getItemFacts(requestItem).map((fact) => (
                                    <span
                                      key={fact}
                                      className="rounded-full bg-white px-3 py-1 text-xs font-bold text-[#52616F]"
                                    >
                                      {fact}
                                    </span>
                                  ))}
                                </div>

                                {item.notes ? (
                                  <p className="mt-2 rounded-2xl bg-white px-3 py-2 text-sm font-semibold text-[#52616F]">
                                    Hinweis: {item.notes}
                                  </p>
                                ) : null}

                                {isConfirmed ? (
                                  <ReorderButtonBlock
                                    item={item}
                                    request={request}
                                    requestItem={requestItem}
                                    imageUrl={imageUrl}
                                  />
                                ) : null}
                              </div>
                            </div>

                            <div className="flex shrink-0 flex-col gap-3 md:min-w-[190px] md:items-end">
                              <div className="md:text-right">
                                <p className="text-lg font-black text-[#102A43]">
                                  {formatMoney(item.product_price)}
                                </p>
                                <p className="text-sm font-semibold text-[#52616F]">
                                  Gesamt: {formatMoney(itemTotal)}
                                </p>
                              </div>

                              {!isConfirmed ? (
                                <CustomerRemoveOfferItemButton
                                  token={token}
                                  itemId={item.id}
                                  productName={item.product_name}
                                />
                              ) : null}
                            </div>
                          </div>

                          <CustomerOfferItemNoteForm
                            token={token}
                            itemId={item.id}
                            productName={item.product_name}
                            initialNote={item.customer_note || ""}
                            disabled={isConfirmed}
                          />
                        </article>
                      );
                    })}
                  </div>
                </section>
              ) : null}

              {!isConfirmed && openChoiceItems.length > 0 ? (
                <section
                  id="customer-open-positions-list"
                  className="hds-open-position-self-content rounded-[32px] border border-[#F1D1A8] bg-[#FFF8EE] p-5 shadow-sm sm:p-6"
                >
                  <div className="mb-5 flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-[#A75B28]">
                      <AlertTriangle className="h-5 w-5" />
                    </div>

                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
                        Deine Entscheidung
                      </p>
                      <h2 className="text-2xl font-black text-[#102A43]">
                        Diese Artikel brauchen noch eine Auswahl
                      </h2>
                      <p className="mt-2 text-sm leading-6 text-[#A75B28]">
                        Hier gibt es passende Vorschläge, aber noch keinen
                        Treffer, den wir ohne Deine Entscheidung automatisch
                        übernehmen möchten.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {openChoiceItems.map((item, index) => {
                      const itemMatches = (matchesByItem.get(item.id) || [])
                        .filter(isSelectableOpenMatch)
                        .sort(compareMatchesStable);

                      const displayLineature = getDisplayLineature(item);

                      const excludedProductIds = uniqueCleanStrings([
                        ...itemMatches.map((match) => match.product_id),
                      ]);

                      const excludedProductSkus = uniqueCleanStrings([
                        ...itemMatches.map((match) => match.product_sku),
                      ]);

                      return (
                        <article
                          key={item.id}
                          className="rounded-[28px] border border-[#F1D1A8] bg-white p-4"
                        >
                          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div>
                              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
                                Offene Position {index + 1}
                              </p>

                              <h3 className="mt-1 text-xl font-black text-[#102A43]">
                                {getRequestItemTitle(item)}
                              </h3>

                              <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-[#52616F]">
                                <span className="rounded-full bg-[#FBF7F0] px-3 py-1">
                                  Menge: {toNumber(item.quantity, 1)}
                                </span>

                                {item.format ? (
                                  <span className="rounded-full bg-[#FBF7F0] px-3 py-1">
                                    Format: {item.format}
                                  </span>
                                ) : null}

                                {displayLineature &&
                                displayLineature !== "unknown" ? (
                                  <span className="rounded-full bg-[#FBF7F0] px-3 py-1">
                                    Lineatur: {displayLineature}
                                  </span>
                                ) : null}

                                {item.color ? (
                                  <span className="rounded-full bg-[#FBF7F0] px-3 py-1">
                                    Farbe: {item.color}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </div>

                          <div className="space-y-3">
                            {itemMatches.map((match, matchIndex) => {
                              const alreadySelected = selectedMatchIds.has(
                                match.id
                              );

                              const imageUrl = match.product_id
                                ? productImageById.get(match.product_id) || null
                                : null;

                              return (
                                <div
                                  key={match.id}
                                  className={
                                    matchIndex === 0
                                      ? "rounded-3xl border-2 border-[#A75B28] bg-[#FFF8EE] p-4"
                                      : "rounded-3xl border border-[#E8DED2] bg-[#FBF7F0] p-4"
                                  }
                                >
                                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                                    <div className="flex flex-col gap-4 md:flex-row md:items-center">
                                      <ProductImageBox
                                        imageUrl={imageUrl}
                                        alt={
                                          match.product_name ||
                                          "Produktvorschlag"
                                        }
                                        size={matchIndex === 0 ? "large" : "small"}
                                      />

                                      <div>
                                        <div className="mb-2 flex flex-wrap gap-2">
                                          <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-[#A75B28]">
                                            {getMatchScoreLabel(
                                              match.match_score
                                            )}{" "}
                                            · {toNumber(match.match_score, 0)} %
                                          </span>

                                          {matchIndex === 0 ? (
                                            <span className="rounded-full bg-[#102A43] px-3 py-1 text-xs font-black text-white">
                                              Beste Empfehlung
                                            </span>
                                          ) : (
                                            <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-[#52616F]">
                                              Alternative
                                            </span>
                                          )}
                                        </div>

                                        <h4 className="font-black text-[#102A43]">
                                          {match.product_name ||
                                            "Produktvorschlag"}
                                        </h4>

                                        <p className="mt-1 text-sm text-[#52616F]">
                                          {match.product_sku
                                            ? `Art.-Nr.: ${match.product_sku}`
                                            : "Ohne Artikelnummer"}
                                        </p>

                                        {match.match_reason ? (
                                          <p className="mt-2 max-w-2xl text-xs leading-5 text-[#52616F]">
                                            {match.match_reason}
                                          </p>
                                        ) : null}
                                      </div>
                                    </div>

                                    <div className="flex shrink-0 flex-col gap-3 md:min-w-[180px] md:items-end">
                                      <p className="text-lg font-black text-[#102A43]">
                                        {formatMoney(match.product_price)}
                                      </p>

                                      <CustomerSelectProductButton
                                        token={token}
                                        matchId={match.id}
                                        alreadySelected={alreadySelected}
                                      />
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          <CustomerProductSearch
                            token={token}
                            requestItemId={item.id}
                            defaultQuery={getCustomerSearchDefaultQuery(item)}
                            excludedProductIds={excludedProductIds}
                            excludedProductSkus={excludedProductSkus}
                          />
                        </article>
                      );
                    })}
                  </div>
                </section>
              ) : null}

              {!isConfirmed && customerResolvedItems.length > 0 ? (
                <section className="rounded-[28px] border border-[#D8C8B8] bg-white p-4 shadow-sm sm:p-6">
                  <div className="mb-5 flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#FBF7F0] text-[#A75B28]">
                      <span className="text-lg font-black">i</span>
                    </div>

                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
                        Hinweis zu einzelnen Listenpositionen
                      </p>
                      <h2 className="mt-1 text-2xl font-black text-[#102A43]">
                        Diese Positionen sind geklärt
                      </h2>
                      <p className="mt-2 text-sm font-semibold leading-6 text-[#52616F]">
                        Für diese Artikel ist keine weitere Auswahl durch Dich nötig.
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-4">
                    {customerResolvedItems.map((item, index) => {
                      const resolutionStatus =
                        getCustomerVisibleResolutionStatus(item);
                      const isCustomerSuppliesSelf =
                        resolutionStatus === "customer_supplies_self";

                      return (
                        <article
                          key={item.id}
                          className={`rounded-[24px] border p-4 ${
                            isCustomerSuppliesSelf
                              ? "border-[#F1D1A8] bg-[#FFF8EE]"
                              : "border-[#BFE3CD] bg-[#F0FFF6]"
                          }`}
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <p
                                className={`text-xs font-black uppercase tracking-[0.16em] ${
                                  isCustomerSuppliesSelf
                                    ? "text-[#A75B28]"
                                    : "text-[#2F7D50]"
                                }`}
                              >
                                Listenposition {index + 1}
                              </p>

                              <h3 className="mt-1 text-xl font-black text-[#102A43]">
                                {getRequestItemTitle(item)}
                              </h3>

                              <p className="mt-2 inline-flex rounded-full bg-white px-3 py-1 text-xs font-black text-[#52616F]">
                                Menge: {item.quantity || 1}
                              </p>
                            </div>

                            <div
                              className={`rounded-2xl border bg-white px-4 py-3 text-sm font-black ${
                                isCustomerSuppliesSelf
                                  ? "border-[#F1D1A8] text-[#A75B28]"
                                  : "border-[#BFE3CD] text-[#2F7D50]"
                              }`}
                            >
                              {getCustomerResolutionTitle(resolutionStatus)}
                            </div>
                          </div>

                          <p className="mt-4 text-sm font-semibold leading-6 text-[#102A43]">
                            {getCustomerResolutionText(resolutionStatus)}
                          </p>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ) : null}
              {!isConfirmed && manualReviewItems.length > 0 ? (
                <section className="hds-open-position-self-content rounded-[32px] border border-[#E8DED2] bg-white p-5 shadow-sm sm:p-6">
                  <div className="mb-5 flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#FBF7F0] text-[#A75B28]">
                      <Sparkles className="h-5 w-5" />
                    </div>

                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
                        Persönlicher Service
                      </p>
                      <h2 className="text-2xl font-black text-[#102A43]">
                        Diese Positionen prüfen wir für Dich
                      </h2>
                      <p className="mt-2 text-sm leading-6 text-[#52616F]">
                        Wenn kein sicherer Treffer vorhanden ist, raten wir
                        nicht einfach. Diese Artikel werden von uns persönlich
                        geprüft und sauber ergänzt.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {manualReviewItems.map((item, index) => {
                      const displayLineature = getDisplayLineature(item);

                      return (
                        <article
                          key={item.id}
                          className="rounded-[28px] border border-[#E8DED2] bg-[#FBF7F0] p-4"
                        >
                          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                            <div>
                              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
                                Prüfposition {index + 1}
                              </p>

                              <h3 className="mt-1 text-xl font-black text-[#102A43]">
                                {getRequestItemTitle(item)}
                              </h3>

                              <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-[#52616F]">
                                <span className="rounded-full bg-white px-3 py-1">
                                  Menge: {toNumber(item.quantity, 1)}
                                </span>

                                {item.format ? (
                                  <span className="rounded-full bg-white px-3 py-1">
                                    Format: {item.format}
                                  </span>
                                ) : null}

                                {displayLineature &&
                                displayLineature !== "unknown" ? (
                                  <span className="rounded-full bg-white px-3 py-1">
                                    Lineatur: {displayLineature}
                                  </span>
                                ) : null}

                                {item.color ? (
                                  <span className="rounded-full bg-white px-3 py-1">
                                    Farbe: {item.color}
                                  </span>
                                ) : null}
                              </div>

                              <p className="mt-3 text-sm font-semibold leading-6 text-[#52616F]">
                                Du musst hier nichts weiter tun. Wir prüfen
                                diese Position persönlich.
                              </p>
                            </div>

                            <div className="rounded-2xl border border-[#E8DED2] bg-white px-4 py-3 text-sm font-black text-[#A75B28]">
                              Wird geprüft
                            </div>
                          </div>

                          <CustomerProductSearch
                            token={token}
                            requestItemId={item.id}
                            defaultQuery={getCustomerSearchDefaultQuery(item)}
                            excludedProductIds={[]}
                            excludedProductSkus={[]}
                          />
                        </article>
                      );
                    })}
                  </div>
                </section>
              ) : null}
            </div>

            <aside className="sticky top-6 space-y-4">
              {!isConfirmed && items.length > 0 ? (
  <CustomerRefreshProductsButton token={token} />
) : null}

              <section className="rounded-[32px] border border-[#E8DED2] bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FBF7F0] text-[#A75B28]">
                    <ShoppingBasket className="h-5 w-5" />
                  </div>

                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
                      Dein Paket
                    </p>
                    <h2 className="font-black text-[#102A43]">
                      Aktueller Stand
                    </h2>
                  </div>
                </div>

                {selectedOfferItems.length > 0 ? (
                  <div className="space-y-3">
                    {selectedOfferItems.slice(0, 7).map((item) => (
                      <div
                        key={item.id}
                        className="rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] p-3"
                      >
                        <p className="font-black leading-5 text-[#102A43]">
                          {item.product_name}
                        </p>

                        <p className="mt-1 text-xs font-semibold text-[#52616F]">
                          Menge: {toNumber(item.quantity, 1)}
                          {item.unit ? ` ${item.unit}` : ""}
                        </p>

                        <div className="mt-2 flex items-center justify-between gap-3">
                          <span className="text-xs font-bold text-[#52616F]">
                            {getOfferItemSourceLabel(item.source)}
                          </span>
                          <span className="text-sm font-black text-[#102A43]">
                            {formatMoney(
                              toNumber(item.quantity, 1) *
                                toNumber(item.product_price, 0)
                            )}
                          </span>
                        </div>
                      </div>
                    ))}

                    {selectedOfferItems.length > 7 ? (
                      <p className="text-center text-xs font-bold text-[#52616F]">
                        + {selectedOfferItems.length - 7} weitere Positionen
                      </p>
                    ) : null}

                    <div className="rounded-2xl bg-[#102A43] p-4 text-white">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-bold opacity-80">
                          Zwischensumme
                        </span>
                        <span className="text-xl font-black">
                          {formatMoney(totalPrice)}
                        </span>
                      </div>
                    </div>

                    {!isConfirmed ? (
                      <ConfirmOfferButton
                        token={token}
                        disabled={hasOpenCustomerBlockingItems}
                        buttonLabel={
                          hasOpenCustomerBlockingItems
                            ? "Offene Positionen zuerst klären"
                            : "Paketwunsch bestätigen"
                        }
                      />
                    ) : null}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-[#D8C8B8] bg-[#FBF7F0] p-4 text-sm font-semibold text-[#52616F]">
                    Noch keine Produkte im Paket.
                  </div>
                )}
              </section>

              {!isConfirmed ? (
                <section className="rounded-[28px] border border-[#E8DED2] bg-[#FBF7F0] p-4">
                  <p className="text-sm font-black text-[#102A43]">
                    Keine Sorge bei unklaren Artikeln.
                  </p>
                  <p className="mt-2 text-sm font-semibold leading-6 text-[#52616F]">
                    Wenn etwas nicht eindeutig erkannt wurde, prüfen wir es
                    persönlich, statt Dir ein falsches Produkt vorzuschlagen.
                  </p>
                </section>
              ) : null}
            </aside>
          </section>
        ) : null}
      </section>


      <CustomerOfferRecommendations
        token={token}
        disabled={isConfirmed}
      />
      <LegalFooter />
    </main>
  );
}
