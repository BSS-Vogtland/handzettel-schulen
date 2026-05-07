import { createClient } from "@supabase/supabase-js";
import Image from "next/image";
import { notFound } from "next/navigation";
import {
  CheckCircle2,
  FileText,
  ImageIcon,
  PackageCheck,
  School,
  ShoppingBasket,
  Sparkles,
} from "lucide-react";
import CustomerPreparePackageButton from "@/components/CustomerPreparePackageButton";
import CustomerSelectProductButton from "@/components/CustomerSelectProductButton";
import ConfirmOfferButton from "@/components/ConfirmOfferButton";
import CustomerProductSearch from "@/components/CustomerProductSearch";
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
};

type ProductRow = {
  id: string;
  image_url?: string | null;
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

function formatDate(value: string | null) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
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
  if (value >= 80) return "Sehr passend";
  if (value >= 70) return "Passend";
  return "Option";
}

function getOfferItemSourceLabel(source: string | null) {
  switch (source) {
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

function uniqueCleanStrings(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value || "").trim())
        .filter((value) => value.length > 0)
    )
  );
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

  const [{ data: files }, { data: requestItems }, { data: offerItems }] =
    await Promise.all([
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
    ]);

  const items = (requestItems || []) as RequestItem[];
  const selectedOfferItems = ((offerItems || []) as OfferItem[]).sort(
    compareOfferItemsStable
  );
  const uploadedFiles = (files || []) as RequestFile[];

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
    const { data: productRows } = await supabase
      .from("school_products")
      .select("id, image_url")
      .in("id", productIds);

    for (const product of (productRows || []) as ProductRow[]) {
      productImageById.set(product.id, product.image_url || null);
    }
  }

  const matchesByItem = new Map<string, RequestMatch[]>();

  for (const item of items) {
    const allItemMatches = matches
      .filter((match) => match.request_item_id === item.id)
      .sort(compareMatchesStable);

    const strictMatches = allItemMatches
      .filter((match) => isStrictMatchVisible(item, match))
      .slice(0, 3);

    matchesByItem.set(item.id, strictMatches);
  }

  const selectedMatchIds = new Set(
    selectedOfferItems
      .map((item) => item.match_id)
      .filter((id): id is string => Boolean(id))
  );

  const isConfirmed =
    request.status === "confirmed" || request.offer_status === "confirmed";

  const shouldShowPrepareButton =
    !isConfirmed && (items.length === 0 || matches.length === 0);

  const totalPrice = selectedOfferItems.reduce((sum, item) => {
    const quantity = toNumber(item.quantity, 1);
    const price = toNumber(item.product_price, 0);
    return sum + quantity * price;
  }, 0);

  return (
    <main className="min-h-screen bg-[#FBF7F0] text-[#102A43]">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="rounded-[32px] border border-[#E8DED2] bg-white p-5 shadow-sm sm:p-7">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <div className="relative h-16 w-16 overflow-hidden rounded-3xl border border-[#E8DED2] bg-[#FBF7F0]">
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

                <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-4xl">
                  {isConfirmed
                    ? "Dein finaler Schulmaterial-Paketwunsch"
                    : "Deine persönliche Produktauswahl"}
                </h1>

                <p className="mt-2 max-w-2xl text-sm leading-6 text-[#52616F]">
                  {isConfirmed
                    ? "Hier siehst Du den aktuellen finalen Paketwunsch inklusive Produktbildern und möglichen Korrekturen durch Handzettel-Schulen.de."
                    : "Wir bereiten Deine Schulmaterialliste für Dich vor. Sichere Treffer kannst Du direkt übernehmen. Alles, was nicht eindeutig ist, prüfen wir persönlich."}
                </p>
              </div>
            </div>

            <div className="rounded-3xl border border-[#E8DED2] bg-[#FBF7F0] px-4 py-3 text-sm">
              <p className="font-black text-[#102A43]">
                Anfrage {request.request_number || "—"}
              </p>
              <p className="mt-1 text-[#52616F]">
                Erstellt am {formatDate(request.created_at)}
              </p>
            </div>
          </div>
        </header>

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
              Hochgeladene Liste
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
              {isConfirmed ? "Abgesendet" : "Auswahl offen"}
            </h2>
            <p className="mt-1 text-sm text-[#52616F]">
              {items.length} erkannte Positionen · {selectedOfferItems.length}{" "}
              Paketpositionen
            </p>
          </div>
        </section>

        {shouldShowPrepareButton ? (
          <CustomerPreparePackageButton token={token} />
        ) : null}

        {isConfirmed ? (
          <section className="rounded-[28px] border border-[#BFE3CD] bg-[#F0FFF6] p-5 text-[#2F7D50] shadow-sm">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <h2 className="font-black">
                  Dein Paketwunsch wurde erfolgreich abgesendet.
                </h2>
                <p className="mt-1 text-sm leading-6">
                  Handzettel-Schulen.de hat Deine Auswahl erhalten. Der
                  Paketwunsch wird final geprüft und bei Bedarf sauber ergänzt
                  oder korrigiert.
                </p>
              </div>
            </div>
          </section>
        ) : null}

        {items.length > 0 && !isConfirmed ? (
          <section className="rounded-[32px] border border-[#E8DED2] bg-white p-5 shadow-sm sm:p-7">
            <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-[#FBF7F0] px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-[#A75B28]">
                  <Sparkles className="h-3.5 w-3.5" />
                  Persönliche Vorauswahl
                </div>

                <h2 className="text-2xl font-black">
                  Deine Liste wurde vorbereitet
                </h2>

                <p className="mt-2 max-w-2xl text-sm leading-6 text-[#52616F]">
                  Pro Position zeigen wir Dir maximal drei passende Produkte.
                  Der beste Treffer ist deutlich markiert. Weitere Optionen sind
                  nur Alternativen. Unsichere Positionen werden nicht geraten,
                  sondern persönlich durch unser Team geprüft.
                </p>
              </div>
            </div>

            <div className="space-y-5">
              {items.map((item, index) => {
                const itemMatches = matchesByItem.get(item.id) || [];
                const displayLineature = getDisplayLineature(item);

                const selectedOfferItemsForThisItem = selectedOfferItems.filter(
                  (offerItem) => offerItem.request_item_id === item.id
                );

                const excludedProductIds = uniqueCleanStrings([
                  ...itemMatches.map((match) => match.product_id),
                  ...selectedOfferItemsForThisItem.map(
                    (offerItem) => offerItem.product_id
                  ),
                ]);

                const excludedProductSkus = uniqueCleanStrings([
                  ...itemMatches.map((match) => match.product_sku),
                  ...selectedOfferItemsForThisItem.map(
                    (offerItem) => offerItem.product_sku
                  ),
                ]);

                return (
                  <article
                    key={item.id}
                    className="rounded-[28px] border border-[#E8DED2] bg-[#FBF7F0] p-4 sm:p-5"
                  >
                    <div className="flex flex-col items-center gap-3 text-center">
                      <div className="inline-flex rounded-full bg-[#102A43] px-5 py-2 text-sm font-black uppercase tracking-[0.18em] text-white shadow-sm">
                        Position {index + 1}
                      </div>

                      <div>
                        <h3 className="mt-1 text-xl font-black text-[#102A43]">
                          {getRequestItemTitle(item)}
                        </h3>

                        <div className="mt-3 flex flex-wrap justify-center gap-2 text-xs font-bold text-[#52616F]">
                          <span className="rounded-full bg-white px-3 py-1 shadow-sm">
                            Menge: {toNumber(item.quantity, 1)}
                          </span>

                          {item.format ? (
                            <span className="rounded-full bg-white px-3 py-1 shadow-sm">
                              Format: {item.format}
                            </span>
                          ) : null}

                          {displayLineature &&
                          displayLineature !== "unknown" ? (
                            <span className="rounded-full bg-white px-3 py-1 shadow-sm">
                              Lineatur: {displayLineature}
                            </span>
                          ) : null}

                          {item.color ? (
                            <span className="rounded-full bg-white px-3 py-1 shadow-sm">
                              Farbe: {item.color}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    {itemMatches.length > 0 ? (
                      <div className="mt-4 grid gap-3">
                        {itemMatches.map((match, matchIndex) => {
                          const alreadySelected = selectedMatchIds.has(match.id);
                          const imageUrl = match.product_id
                            ? productImageById.get(match.product_id) || null
                            : null;

                          const isTopMatch = matchIndex === 0;

                          return (
                            <div
                              key={match.id}
                              className={
                                isTopMatch
                                  ? "rounded-3xl border-2 border-[#2F7D50] bg-white p-4 shadow-sm"
                                  : "rounded-3xl border border-[#E8DED2] bg-white/80 p-3"
                              }
                            >
                              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                                <div className="flex flex-col gap-4 md:flex-row md:items-center">
                                  <ProductImageBox
                                    imageUrl={imageUrl}
                                    alt={match.product_name || "Produktvorschlag"}
                                    size={isTopMatch ? "large" : "small"}
                                  />

                                  <div>
                                    <div className="mb-2 flex flex-wrap items-center gap-2">
                                      <span
                                        className={
                                          isTopMatch
                                            ? "rounded-full bg-[#2F7D50] px-4 py-1.5 text-sm font-black text-white"
                                            : "rounded-full bg-[#F0FFF6] px-3 py-1 text-xs font-black text-[#2F7D50]"
                                        }
                                      >
                                        {getMatchScoreLabel(match.match_score)} ·{" "}
                                        {toNumber(match.match_score, 0)} %
                                      </span>

                                      {isTopMatch ? (
                                        <span className="rounded-full bg-[#102A43] px-3 py-1 text-xs font-black text-white">
                                          Empfohlenes Produkt
                                        </span>
                                      ) : (
                                        <span className="rounded-full bg-[#FBF7F0] px-3 py-1 text-xs font-black text-[#A75B28]">
                                          Alternative Option
                                        </span>
                                      )}

                                      {alreadySelected ? (
                                        <span className="rounded-full bg-[#102A43] px-3 py-1 text-xs font-black text-white">
                                          Im Paket
                                        </span>
                                      ) : null}
                                    </div>

                                    <h4
                                      className={
                                        isTopMatch
                                          ? "text-lg font-black text-[#102A43]"
                                          : "font-black text-[#102A43]"
                                      }
                                    >
                                      {match.product_name || "Produktvorschlag"}
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

                                <div className="flex shrink-0 flex-col gap-3 md:items-end">
                                  <p
                                    className={
                                      isTopMatch
                                        ? "text-xl font-black text-[#102A43]"
                                        : "text-lg font-black text-[#102A43]"
                                    }
                                  >
                                    {formatMoney(match.product_price)}
                                  </p>

                                  <CustomerSelectProductButton
                                    token={token}
                                    matchId={match.id}
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="mt-4 rounded-[30px] border border-[#D8C8B8] bg-white p-6 shadow-sm sm:p-7">
                        <div className="flex flex-col items-center text-center">
                          <div className="inline-flex rounded-full bg-[#102A43] px-4 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-white">
                            Top-Service
                          </div>

                          <div className="relative mt-4 h-24 w-24 overflow-hidden rounded-[26px] border border-[#E8DED2] bg-[#FBF7F0] shadow-sm">
                            <Image
                              src="/handzettel-logo.png"
                              alt="Handzettel-Schulen.de"
                              fill
                              className="object-contain p-3"
                            />
                          </div>

                          <h4 className="mt-4 text-center text-2xl font-black leading-tight text-[#102A43] sm:text-3xl">
                            Persönliche Produktprüfung
                            <span className="block text-[#A75B28]">
                              durch unser Team
                            </span>
                          </h4>

                          <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-[#52616F]">
                            Für diese Position wird kein unsicherer Artikel
                            geraten. Handzettel-Schulen.de sucht das passende
                            Produkt persönlich für Dich heraus und ergänzt es
                            sauber für Deinen Paketwunsch.
                          </p>

                          <div className="mt-5 grid w-full max-w-3xl gap-3 sm:grid-cols-3">
                            <div className="rounded-[24px] border border-[#E8DED2] bg-[#FBF7F0] p-3 text-left">
                              <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-2xl bg-white text-[#A75B28] shadow-sm">
                                <FileText className="h-4 w-4" />
                              </div>

                              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#A75B28]">
                                1. Position erkannt
                              </p>

                              <p className="mt-1.5 text-xs leading-5 text-[#52616F]">
                                Deine Listenposition wird übernommen und nicht
                                blind mit einem unsicheren Artikel gefüllt.
                              </p>
                            </div>

                            <div className="rounded-[24px] border border-[#D8C8B8] bg-white p-3 text-left shadow-sm">
                              <div className="mb-2 flex items-center gap-2">
                                <div className="relative h-9 w-9 overflow-hidden rounded-2xl border border-[#E8DED2] bg-[#FBF7F0]">
                                  <Image
                                    src="/handzettel-logo.png"
                                    alt="Handzettel-Schulen.de"
                                    fill
                                    className="object-contain p-1.5"
                                  />
                                </div>

                                <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[#F4E9DC] text-[#A75B28]">
                                  <Sparkles className="h-4 w-4" />
                                </div>
                              </div>

                              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#A75B28]">
                                2. Persönlich geprüft
                              </p>

                              <p className="mt-1.5 text-xs leading-5 text-[#52616F]">
                                Unser Team prüft Format, Farbe, Lineatur und
                                Artikelart und sucht gezielt das passende
                                Produkt heraus.
                              </p>
                            </div>

                            <div className="rounded-[24px] border border-[#E8DED2] bg-[#FBF7F0] p-3 text-left">
                              <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-2xl bg-white text-[#2F7D50] shadow-sm">
                                <CheckCircle2 className="h-4 w-4" />
                              </div>

                              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#A75B28]">
                                3. Sauber ergänzt
                              </p>

                              <p className="mt-1.5 text-xs leading-5 text-[#52616F]">
                                Das passende Produkt wird für Deinen
                                Paketwunsch ergänzt, damit Du eine saubere
                                Auswahl erhältst.
                              </p>
                            </div>
                          </div>

                          <p className="mx-auto mt-4 max-w-xl text-sm font-black leading-6 text-[#A75B28]">
                            Du musst hier nichts weiter tun. Optional kannst Du
                            unten zusätzlich selbst im Produktbestand suchen und
                            uns einen Vorschlag mitsenden.
                          </p>
                        </div>
                      </div>
                    )}

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

        <section className="rounded-[32px] border border-[#E8DED2] bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-[#FBF7F0] px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-[#A75B28]">
                <ShoppingBasket className="h-3.5 w-3.5" />
                {isConfirmed ? "Finaler Paketwunsch" : "Aktueller Paketwunsch"}
              </div>

              <h2 className="text-2xl font-black">
                {isConfirmed
                  ? "Aktueller finaler Stand"
                  : "Deine bisher ausgewählten Produkte"}
              </h2>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#52616F]">
                {isConfirmed
                  ? "Diese Übersicht zeigt den aktuellen Paketwunsch inklusive möglicher Ergänzungen oder Korrekturen durch Handzettel-Schulen.de."
                  : "Diese Auswahl ist noch nicht verbindlich. Sobald Du Deinen Paketwunsch absendest, prüft Handzettel-Schulen.de die Angaben final und meldet sich bei Rückfragen."}
              </p>
            </div>

            <div className="rounded-3xl bg-[#FBF7F0] px-4 py-3 text-right">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
                Aktuelle Zwischensumme
              </p>
              <p className="text-2xl font-black text-[#102A43]">
                {formatMoney(totalPrice)}
              </p>
            </div>
          </div>

          {selectedOfferItems.length > 0 ? (
            <div className="space-y-3">
              {selectedOfferItems.map((item) => {
                const itemTotal =
                  toNumber(item.quantity, 1) * toNumber(item.product_price, 0);

                const imageUrl = item.product_id
                  ? productImageById.get(item.product_id) || null
                  : null;

                return (
                  <div
                    key={item.id}
                    className="rounded-3xl border border-[#E8DED2] bg-[#FBF7F0] p-4"
                  >
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div className="flex flex-col gap-4 md:flex-row md:items-start">
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

                            {item.source === "admin_manual" ||
                            item.source === "admin_existing_product" ? (
                              <span className="rounded-full bg-[#F0FFF6] px-3 py-1 text-xs font-black text-[#2F7D50]">
                                durch Handzettel-Schulen.de geprüft
                              </span>
                            ) : null}
                          </div>

                          <h3 className="font-black text-[#102A43]">
                            {item.product_name}
                          </h3>

                          <p className="mt-1 text-sm text-[#52616F]">
                            {item.product_sku
                              ? `Art.-Nr.: ${item.product_sku}`
                              : "Ohne Artikelnummer"}
                          </p>

                          <p className="mt-1 text-sm text-[#52616F]">
                            Menge: {toNumber(item.quantity, 1)}
                            {item.unit ? ` ${item.unit}` : ""}
                          </p>

                          {item.notes ? (
                            <p className="mt-2 rounded-2xl bg-white px-3 py-2 text-sm font-semibold text-[#52616F]">
                              Hinweis: {item.notes}
                            </p>
                          ) : null}
                        </div>
                      </div>

                      <div className="text-left md:text-right">
                        <p className="font-black text-[#102A43]">
                          {formatMoney(item.product_price)}
                        </p>
                        <p className="mt-1 text-sm text-[#52616F]">
                          Gesamt: {formatMoney(itemTotal)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}

              {!isConfirmed ? (
                <div className="pt-3">
                  <ConfirmOfferButton token={token} />
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-[#D8C8B8] bg-[#FBF7F0] p-6 text-center">
              <p className="font-black text-[#102A43]">
                Noch keine Produkte ausgewählt.
              </p>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#52616F]">
                {isConfirmed
                  ? "Aktuell sind keine Produkte im Paketwunsch hinterlegt."
                  : "Wähle oben passende Produktvorschläge aus oder nutze die Produktsuche. Unsichere Positionen kannst Du trotzdem absenden – unser Team prüft sie persönlich."}
              </p>
            </div>
          )}
        </section>
      </section>

      <LegalFooter />
    </main>
  );
}