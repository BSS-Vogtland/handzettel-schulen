import { NextResponse } from "next/server";
import OpenAI from "openai";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type RequestFile = {
  id: string;
  storage_path: string | null;
  file_type: string | null;
  original_filename: string | null;
};

type ExtractedItem = {
  rawText: string;
  normalizedName: string | null;
  quantity: number;
  category: string | null;
  format: string | null;
  color: string | null;
  lineature: string | null;
  notes: string | null;
  confidence: number;
};

type CleanedItem = ExtractedItem & {
  productType: string | null;
};

type ExtractionResult = {
  items: ExtractedItem[];
};

type OpenAiContentPart = {
  type?: string;
  text?: string;
};

type OpenAiOutputItem = {
  type?: string;
  content?: OpenAiContentPart[];
};

type OpenAiResponseLike = {
  output?: OpenAiOutputItem[];
};

const ANALYZE_VERSION = "school-material-analyze-v6-rawline-completeness-size-guards";

const materialSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          rawText: {
            type: "string",
            description:
              "Die vollständige Originalzeile der Materialposition. Wichtig: Klammern und Angaben wie (Lineatur 0), (Lineatur 8f), (Lin. 0), (L0), Buchmaß, Farbe und Format unbedingt übernehmen.",
          },
          normalizedName: {
            type: ["string", "null"],
            description:
              "Normalisierte Artikelbezeichnung ohne Menge, aber mit wichtigem Artikelnamen, z. B. Schreibheft A5, Umschlag A5 blau, Schnellhefter rot A4.",
          },
          quantity: {
            type: "number",
            description: "Erkannte Menge. Falls unklar: 1.",
          },
          category: {
            type: ["string", "null"],
            description:
              "Kategorie wie Heft, Rechenheft, Hausaufgabenheft, Umschlag, Mappe, Schnellhefter, Schreibblock, Zeichenblock, Zeichenkarton, Stift, Papier, Basteln.",
          },
          format: {
            type: ["string", "null"],
            description:
              "Format exakt als A3, A4 oder A5, falls vorhanden oder aus Buchmaß ableitbar.",
          },
          color: {
            type: ["string", "null"],
            description:
              "Farbe exakt, z. B. blau, rot, grün, gelb, orange, braun, transparent.",
          },
          lineature: {
            type: ["string", "null"],
            description:
              "Lineatur exakt. Erlaubte wichtige Werte: 0, 1, 2, 3, 4, 5, 6, 7, 8f, 9, 10, 25, 26, 27, 28, kariert, liniert. Wichtig: Lineatur 0 ist eine echte Lineatur und darf niemals als unklar ausgegeben werden. Lineatur 8, Lin. 8, L8, 8 F und 8f immer als 8f ausgeben.",
          },
          notes: {
            type: ["string", "null"],
            description:
              "Zusätzliche Hinweise, z. B. Buchmaß, Pappe, ROTH, Klipp & Klar.",
          },
          confidence: {
            type: "number",
            description: "Sicherheit zwischen 0 und 1.",
          },
        },
        required: [
          "rawText",
          "normalizedName",
          "quantity",
          "category",
          "format",
          "color",
          "lineature",
          "notes",
          "confidence",
        ],
      },
    },
  },
  required: ["items"],
};

function getOpenAiClient() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (
    !apiKey ||
    apiKey.trim().length < 20 ||
    apiKey.includes("DEIN") ||
    apiKey.includes("HIER_") ||
    apiKey === "DEIN_OPENAI_API_KEY"
  ) {
    throw new Error(
      "OPENAI_API_KEY fehlt oder ist noch ein Platzhalter. Bitte trage in .env.local einen echten OpenAI API-Key ein und starte npm run dev neu."
    );
  }

  return new OpenAI({
    apiKey,
  });
}

function isSupportedImage(file: RequestFile) {
  return (
    file.file_type === "image/jpeg" ||
    file.file_type === "image/png" ||
    file.file_type === "image/webp" ||
    file.file_type === "image/heic" ||
    file.file_type === "image/heif"
  );
}

function isSupportedPdf(file: RequestFile) {
  return file.file_type === "application/pdf";
}

function extractOutputText(response: unknown) {
  const typedResponse = response as OpenAiResponseLike;

  const texts =
    typedResponse.output
      ?.flatMap((item) => item.content || [])
      .filter((content) => content.type === "output_text" && content.text)
      .map((content) => content.text || "") || [];

  return texts.join("\n").trim();
}

async function createSignedUrl(storagePath: string) {
  const { data, error } = await supabaseServer.storage
    .from("school-request-files")
    .createSignedUrl(storagePath, 60 * 10);

  if (error || !data?.signedUrl) {
    throw new Error("Die Datei konnte nicht für die Analyse geöffnet werden.");
  }

  return data.signedUrl;
}

async function createPdfBase64FileData(storagePath: string) {
  const { data, error } = await supabaseServer.storage
    .from("school-request-files")
    .download(storagePath);

  if (error || !data) {
    throw new Error(
      "Die PDF-Datei konnte nicht aus dem Speicher geladen werden."
    );
  }

  const arrayBuffer = await data.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const base64String = buffer.toString("base64");

  return `data:application/pdf;base64,${base64String}`;
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
    .replace(/[^a-z0-9,.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripCheckboxNoise(value: unknown) {
  return String(value ?? "")
    .replace(/^[\s\-–—*•]+/g, "")
    .replace(/^(?:â˜|â–¡|â–¢|â—»|â‘|â’|âœ“|âœ”|x|\[ \]|\[\]|0)\s*/i, "")
    .trim();
}

function getSearchableText(...values: unknown[]) {
  return normalizeText(values.map((value) => stripCheckboxNoise(value)).join(" "));
}

function cleanNullableString(value: unknown) {
  const text = String(value ?? "").trim();

  if (!text) return null;
const lowered = normalizeText(text);

  if (
    lowered === "null" ||
    lowered === "undefined" ||
    lowered === "keine" ||
    lowered === "kein" ||
    lowered === "nicht vorhanden" ||
    lowered === "n/a"
  ) {
    return null;
  }

  return text;
}

function normalizeFormat(value: unknown) {
  const text = normalizeText(value);

  if (!text) return null;
if (text.includes("a3")) return "A3";
  if (text.includes("a4")) return "A4";
  if (text.includes("a5")) return "A5";

  return null;
}

function extractDimensions(value: unknown) {
  const text = normalizeText(value).replace(/,/g, ".");

  const patterns = [
    /(\d+(?:\.\d+)?)\s*cm\s+hoch\s+und\s+(\d+(?:\.\d+)?)\s*cm\s+breit/g,
    /(\d+(?:\.\d+)?)\s*cm\s+breit\s+und\s+(\d+(?:\.\d+)?)\s*cm\s+hoch/g,
    /(\d+(?:\.\d+)?)\s*(?:cm)?\s*(?:x|und)\s*(\d+(?:\.\d+)?)/g,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (!match) continue;

    const first = Number(match[1]);
    const second = Number(match[2]);

    if (!Number.isFinite(first) || !Number.isFinite(second)) continue;

    return {
      longSide: Math.max(first, second),
      shortSide: Math.min(first, second),
    };
  }

  return null;
}

function inferFormatFromDimensions(value: unknown) {
  const dimensions = extractDimensions(value);

  if (!dimensions) return null;

  const { longSide, shortSide } = dimensions;

  if (longSide >= 29 && longSide <= 33.5 && shortSide >= 20 && shortSide <= 24) {
    return "A4";
  }

  if (longSide >= 20 && longSide <= 27.5 && shortSide >= 14 && shortSide <= 20) {
    return "A5";
  }

  return null;
}

function getEffectiveFormat(...values: unknown[]) {
  for (const value of values) {
    const format = normalizeFormat(value) || inferFormatFromDimensions(value);
    if (format) return format;
  }

  return null;
}

function normalizeColor(value: unknown) {
  const text = normalizeText(value);

  if (!text) return null;
if (text.includes("transparent") || text.includes("klar")) {
    return "transparent";
  }

  const colors: Array<{ key: string; label: string }> = [
    { key: "rot", label: "rot" },
    { key: "blau", label: "blau" },
    { key: "gruen", label: "grün" },
    { key: "gelb", label: "gelb" },
    { key: "orange", label: "orange" },
    { key: "lila", label: "lila" },
    { key: "violett", label: "violett" },
    { key: "pink", label: "pink" },
    { key: "rosa", label: "rosa" },
    { key: "schwarz", label: "schwarz" },
    { key: "weiss", label: "weiß" },
    { key: "braun", label: "braun" },
  ];

  for (const color of colors) {
    if (text.includes(color.key)) return color.label;
  }

  return null;
}

function getEffectiveColor(...values: unknown[]) {
  for (const value of values) {
    const color = normalizeColor(value);
    if (color) return color;
  }

  return null;
}

function normalizeLineature(value: unknown) {
  const text = normalizeText(value);

  if (!text) return null;
  // Exakte Lineatur-Erkennung vor Teilstring-Regeln.
  // Wichtig: "Lineatur 28" darf nicht als "Lineatur 2" erkannt werden.
  const exactLineaturePattern =
    /\b(?:lineatur|lin\.?|l|nr\.?|nummer)\s*(28|27|26|25|24|23|22|21|20|19|18|17|16|15|14|13|12|11|10|9|8f|8|7|6|5|4|3|2|1|0)\b/;

  const exactLineatureMatch =
    text.match(exactLineaturePattern) ||
    text.match(/^(28|27|26|25|24|23|22|21|20|19|18|17|16|15|14|13|12|11|10|9|8f|8|7|6|5|4|3|2|1|0)$/);

  if (exactLineatureMatch) {
    return exactLineatureMatch[1] === "8f" ? "8" : exactLineatureMatch[1];
  }

const compact = text.replace(/\s+/g, "");

  const clearlyUnknown =
    text.includes("nicht lesbar") ||
    text.includes("nicht erkennbar") ||
    text.includes("keine lineatur erkennbar");

  if (clearlyUnknown) {
    return "unknown";
  }

  if (
    text === "0" ||
    compact === "0" ||
    text.includes("lineatur 0") ||
    compact.includes("lineatur0") ||
    text.includes("lin 0") ||
    text.includes("lin. 0") ||
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
    text.includes("lin. 8") ||
    text.includes("lin 8f") ||
    text.includes("lin. 8f") ||
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

  if (
    text.includes("blanko") ||
    text.includes("unliniert") ||
    text.includes("ohne lineatur")
  ) {
    return "0";
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
      text.includes(`lin. ${entry}`) ||
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

  if (text.includes("unklar")) {
    return "unknown";
  }

  return null;
}

function getEffectiveLineature(...values: unknown[]) {
  for (const value of values) {
    const lineature = normalizeLineature(value);

    if (lineature && lineature !== "unknown") {
      return lineature;
    }
  }

  for (const value of values) {
    const lineature = normalizeLineature(value);

    if (lineature === "unknown") {
      return "unknown";
    }
  }

  return null;
}

function classifyType(value: unknown) {
  const text = getSearchableText(value);

  if (
    text.includes("umschlag") ||
    text.includes("umschlaege") ||
    text.includes("hefthuelle") ||
    text.includes("hefthuellen") ||
    text.includes("huelle") ||
    text.includes("huellen")
  ) {
    return "Umschlag";
  }

  if (
    text.includes("hausaufgabenheft") ||
    text.includes("hausaufgaben") ||
    text.includes("aufgabenheft") ||
    text.includes("ha heft") ||
    text.includes("haheft") ||
    text.includes("hausaufg")
  ) {
    return "Hausaufgabenheft";
  }

  if (
    text.includes("mappe") ||
    text.includes("mappen") ||
    text.includes("sammelmappe") ||
    text.includes("eckspanner") ||
    text.includes("gummizugmappe")
  ) {
    return "Mappe";
  }

  if (
    text.includes("schreibblock") ||
    text.includes("collegeblock") ||
    text.includes("notizblock")
  ) {
    return "Schreibblock";
  }

  if (
    text.includes("zeichenblock") ||
    text.includes("malblock") ||
    text.includes("skizzenblock")
  ) {
    return "Zeichenblock";
  }

  if (
    text.includes("zeichenkarton") ||
    text.includes("tonkarton") ||
    text.includes("fotokarton")
  ) {
    return "Zeichenkarton";
  }

  if (
    text.includes("farbkasten") ||
    text.includes("deckfarbkasten") ||
    text.includes("malkasten") ||
    text.includes("wasserfarben")
  ) {
    return "Farbkasten";
  }

  if (text.includes("bleistift") || text.includes(" hb ")) {
    return "Bleistift";
  }

  if (text.includes("radiergummi") || text.includes("radierer")) {
    return "Radiergummi";
  }

  if (text.includes("lineal")) {
    return "Lineal";
  }

  if (text.includes("schnellhefter") || text.includes("hefter")) {
    return "Schnellhefter";
  }

  if (
    text.includes("rechenheft") ||
    text.includes("rechenh") ||
    text.includes("matheheft") ||
    text.includes("math heft") ||
    text.includes("mathe heft")
  ) {
    return "Heft";
  }

  if (
    text.includes("schreibheft") ||
    text.includes("schreibh") ||
    text.includes("schulheft") ||
    text.includes("heft")
  ) {
    return "Heft";
  }

  return null;
}

function getEffectiveCategory(...values: unknown[]) {
  for (const value of values) {
    const type = classifyType(value);

    if (type) return type;
  }

  const fallback = cleanNullableString(values.find(Boolean));

  return fallback;
}

function cleanConfidence(value: unknown) {
  const numberValue =
    typeof value === "number"
      ? value
      : Number(String(value ?? "").replace(",", "."));

  if (!Number.isFinite(numberValue)) return 0.75;

  if (numberValue > 1) {
    return Math.max(0, Math.min(1, numberValue / 100));
  }

  return Math.max(0, Math.min(1, numberValue));
}

function cleanQuantity(value: unknown) {
  const numberValue =
    typeof value === "number"
      ? value
      : Number(String(value ?? "").replace(",", "."));

  if (!Number.isFinite(numberValue) || numberValue <= 0) return 1;

  return Math.round(numberValue);
}

function cleanNormalizedName(item: ExtractedItem, productType: string | null) {
  const rawText = cleanNullableString(item.rawText);
  const aiName = cleanNullableString(item.normalizedName);

  const base = aiName || rawText || "Unbekannter Artikel";

  const format = getEffectiveFormat(
    item.rawText,
    item.normalizedName,
    item.format
  );

  const color = getEffectiveColor(item.rawText, item.normalizedName, item.color);

  const normalizedBase = normalizeText(base);

  let name = base;

  if (productType === "Heft") {
    if (
      normalizedBase.includes("rechenheft") ||
      normalizedBase.includes("rechenh") ||
      normalizedBase.includes("matheheft") ||
      normalizedBase.includes("mathe heft") ||
      normalizedBase.includes("math heft")
    ) {
      name = "Rechenheft";
    } else {
      name = "Schreibheft";
    }

    if (format) {
      name += ` ${format}`;
    }
  } else if (productType === "Hausaufgabenheft") {
    name = "Hausaufgabenheft";

    if (format) {
      name += ` ${format}`;
    }
  } else if (productType === "Umschlag") {
    name = "Umschlag";

    if (format) {
      name += ` ${format}`;
    }

    if (color) {
      name += ` ${color}`;
    }
  } else if (productType === "Mappe") {
    name = "Mappe";

    if (color) {
      name += ` ${color}`;
    }

    if (format) {
      name += ` ${format}`;
    }
  } else if (productType === "Schnellhefter") {
    name = normalizedBase.includes("schnellhefter") ? "Schnellhefter" : "Hefter";

    if (color) {
      name += ` ${color}`;
    }

    if (format) {
      name += ` ${format}`;
    }
  } else if (productType === "Schreibblock") {
    name = "Schreibblock";

    if (format) {
      name += ` ${format}`;
    }
  } else if (productType === "Zeichenblock") {
    name = "Zeichenblock";

    if (format) {
      name += ` ${format}`;
    }
  } else if (productType === "Zeichenkarton") {
    name = "Zeichenkarton";

    if (format) {
      name += ` ${format}`;
    }
  }

  return name;
}

function forceLineatureForKnownPatterns(item: ExtractedItem, detectedLineature: string | null) {
  const combined = normalizeText(
    [
      item.rawText,
      item.normalizedName,
      item.category,
      item.format,
      item.color,
      item.lineature,
      item.notes,
    ]
      .filter(Boolean)
      .join(" ")
  );

  const compact = combined.replace(/\s+/g, "");

  if (
    compact.includes("schreibhefta5lineatur0") ||
    compact.includes("schulhefta5lineatur0") ||
    compact.includes("hefta5lineatur0") ||
    compact.includes("schreibhefta5lin0") ||
    compact.includes("schulhefta5lin0") ||
    compact.includes("hefta5lin0") ||
    compact.includes("schreibhefta5l0") ||
    compact.includes("schulhefta5l0") ||
    compact.includes("hefta5l0")
  ) {
    return "0";
  }

  if (
    compact.includes("schreibhefta5lineatur8") ||
    compact.includes("schreibhefta5lineatur8f") ||
    compact.includes("schulhefta5lineatur8") ||
    compact.includes("schulhefta5lineatur8f") ||
    compact.includes("hefta5lineatur8") ||
    compact.includes("hefta5lineatur8f") ||
    compact.includes("schreibhefta5lin8") ||
    compact.includes("schreibhefta5lin8f") ||
    compact.includes("schulhefta5lin8") ||
    compact.includes("schulhefta5lin8f") ||
    compact.includes("hefta5lin8") ||
    compact.includes("hefta5lin8f") ||
    compact.includes("schreibhefta5l8") ||
    compact.includes("schreibhefta5l8f") ||
    compact.includes("schulhefta5l8") ||
    compact.includes("schulhefta5l8f") ||
    compact.includes("hefta5l8") ||
    compact.includes("hefta5l8f")
  ) {
    return "8f";
  }

  return detectedLineature;
}


function splitOutsideParentheses(value: string, separator = ",") {
  const parts: string[] = [];
  let current = "";
  let depth = 0;

  for (const char of value) {
    if (char === "(") depth += 1;
    if (char === ")") depth = Math.max(0, depth - 1);

    if (char === separator && depth === 0) {
      const trimmed = current.trim();
      if (trimmed) parts.push(trimmed);
      current = "";
      continue;
    }

    current += char;
  }

  const trimmed = current.trim();
  if (trimmed) parts.push(trimmed);

  return parts;
}

function cleanCompoundSegment(value: unknown) {
  return String(value || "")
    .replace(/^[\s\-–—•●▪▫□☐▢\[\]]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function removeNonArticleHintsFromSegment(value: string) {
  return value
    .replace(/\(\s*ggf?s?\.?\s+[^)]*\)/gi, "")
    .replace(/\(\s*von\s+letztem\s+jahr\s+[^)]*\)/gi, "")
    .replace(/\bggf?s?\.?\s+von\s+letztem\s+jahr\s+kontrollieren\s*\/?\s*auffüllen\b/gi, "")
    .replace(/\bggf?s?\.?\s+kontrollieren\s*\/?\s*auffüllen\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractLeadingQuantityFromSegment(value: string) {
  const match = value.match(/^\s*(\d+)\s+(.+)$/);
  if (!match) {
    return { quantity: null as number | null, text: value.trim() };
  }

  return {
    quantity: Number(match[1]),
    text: match[2].trim(),
  };
}

function normalizePluralMaterialName(value: string) {
  const text = value.trim();

  return text
    .replace(/^mehrere\s+/i, "")
    .replace(/\bDeutschhefte\b/i, "Deutschheft")
    .replace(/\bMathematikhefte\b/i, "Mathematikheft")
    .replace(/\bMathehefte\b/i, "Matheheft")
    .replace(/\bHefte\b/i, "Heft")
    .replace(/\bBlöcke\b/i, "Block")
    .replace(/\bBloecke\b/i, "Block")
    .replace(/\bLineale\b/i, "Lineal")
    .replace(/\bBleistifte\b/i, "Bleistift")
    .replace(/\bErsatzpatronen\b/i, "Ersatzpatronen")
    .replace(/\bFüller\b/i, "Füller")
    .replace(/\bFueller\b/i, "Füller")
    .trim();
}

function inferCompoundCategory(value: string, fallback: unknown) {
  const text = normalizeText(value);

  if (text.includes("umschlag")) return "Umschlag";
  if (text.includes("deutschheft") || text.includes("mathematikheft") || text.includes("matheheft") || text.includes("heft")) return "Heft";
  if (text.includes("block")) return "Block";
  if (text.includes("farbkasten")) return "Farbkasten";
  if (text.includes("deckweiss") || text.includes("deckweiß")) return "Deckweiß";
  if (text.includes("pinsel")) return "Pinsel";
  if (text.includes("wasserbecher")) return "Wasserbecher";
  if (text.includes("radiergummi")) return "Radiergummi";
  if (text.includes("spitzer")) return "Spitzer";
  if (text.includes("fueller") || text.includes("füller")) return "Füller";
  if (text.includes("ersatzpatrone")) return "Ersatzpatronen";
  if (text.includes("bleistift")) return "Bleistift";
  if (text.includes("buntstift")) return "Buntstift";
  if (text.includes("fineliner")) return "Fineliner";
  if (text.includes("lineal")) return "Lineal";
  if (text.includes("geodreieck")) return "Geodreieck";
  if (text.includes("zirkel")) return "Zirkel";
  if (text.includes("klebestift")) return "Klebestift";
  if (text.includes("schere")) return "Schere";
  if (text.includes("filzstift")) return "Filzstift";
  if (text.includes("textmarker")) return "Textmarker";
  if (text.includes("tonkarton")) return "Tonkarton";
  if (text.includes("zeichenblock")) return "Zeichenblock";
  if (text.includes("zeichenkarton")) return "Zeichenkarton";

  return cleanNullableString(fallback);
}

function shouldSplitCommaMaterialLine(value: string) {
  const text = normalizeText(value);

  if (!value.includes(",")) return false;
  if (text.includes("isbn")) return false;
  if (text.includes("preis")) return false;
  if (text.includes("vor- und zuname")) return false;
  if (text.includes("beschriftung")) return false;

  const parts = splitOutsideParentheses(value);
  if (parts.length < 2) return false;

  const materialHints = [
    "farbkasten",
    "deckweiß",
    "deckweiss",
    "pinsel",
    "wasserbecher",
    "radiergummi",
    "spitzer",
    "lineal",
    "geodreieck",
    "füller",
    "fueller",
    "ersatzpatrone",
    "bleistift",
    "buntstift",
    "fineliner",
    "zirkel",
    "klebestift",
    "schere",
    "filzstift",
    "textmarker",
    "tonkarton",
    "zeichenblock",
    "zeichenkarton",
  ];

  return materialHints.some((hint) => text.includes(hint));
}

function buildCompoundItemFromSegment(
  item: ExtractedItem,
  segment: string,
  sourceLine: string,
  inheritedQuantity: unknown
): ExtractedItem {
  const cleanedSegment = removeNonArticleHintsFromSegment(cleanCompoundSegment(segment));
  const quantityResult = extractLeadingQuantityFromSegment(cleanedSegment);
  const segmentText = normalizePluralMaterialName(quantityResult.text);
  const quantity = quantityResult.quantity ?? cleanQuantity(inheritedQuantity);
  const format = normalizeFormat(segmentText) || normalizeFormat(sourceLine);
  const color = normalizeColor(segmentText);
  const lineature = normalizeLineature(segmentText);

  return {
    ...item,
    rawText: sourceLine,
    normalizedName: segmentText,
    quantity,
    category: inferCompoundCategory(segmentText, item.category),
    format,
    color,
    lineature,
    notes: [
      cleanNullableString(item.notes),
      `Sammelzeile deterministisch auf Einzelartikel zerlegt: ${segmentText}`,
      `Analyse-Version: ${ANALYZE_VERSION}`,
    ]
      .filter(Boolean)
      .join(" | "),
  };
}

function expandCommaMaterialLine(item: ExtractedItem): ExtractedItem[] | null {
  const sourceLine = cleanNullableString(item.rawText) || cleanNullableString(item.normalizedName);
  if (!sourceLine || !shouldSplitCommaMaterialLine(sourceLine)) return null;

  const sourceWithoutHints = removeNonArticleHintsFromSegment(sourceLine);
  const parts = splitOutsideParentheses(sourceWithoutHints)
    .map((part) => cleanCompoundSegment(part))
    .map((part) => removeNonArticleHintsFromSegment(part))
    .filter(Boolean);

  if (parts.length < 2) return null;

  return parts.map((part) =>
    buildCompoundItemFromSegment(item, part, sourceLine, item.quantity)
  );
}

function extractCoverColor(value: string) {
  const text = normalizeText(value);

  if (text.includes("rotem umschlag") || text.includes("roter umschlag") || text.includes("rot umschlag")) return "rot";
  if (text.includes("blauem umschlag") || text.includes("blauer umschlag") || text.includes("blau umschlag")) return "blau";
  if (text.includes("gruenem umschlag") || text.includes("grüner umschlag") || text.includes("gruen umschlag")) return "grün";
  if (text.includes("gelbem umschlag") || text.includes("gelber umschlag") || text.includes("gelb umschlag")) return "gelb";
  if (text.includes("weissem umschlag") || text.includes("weißem umschlag") || text.includes("weisser umschlag") || text.includes("weißer umschlag")) return "weiß";
  if (text.includes("schwarzem umschlag") || text.includes("schwarzer umschlag")) return "schwarz";
  if (text.includes("lila umschlag") || text.includes("lilafarbenem umschlag")) return "lila";
  if (text.includes("orangem umschlag") || text.includes("oranger umschlag")) return "orange";

  return normalizeColor(value);
}

function shouldSplitCoverLine(value: string) {
  const text = normalizeText(value);

  const hasExerciseBook =
    text.includes("deutschheft") ||
    text.includes("deutschhefte") ||
    text.includes("mathematikheft") ||
    text.includes("mathematikhefte") ||
    text.includes("matheheft") ||
    text.includes("mathehefte") ||
    text.includes("heft") ||
    text.includes("hefte");

  return hasExerciseBook && text.includes("umschlag");
}

function getExerciseBookBaseName(value: string) {
  const text = normalizeText(value);

  if (text.includes("deutschheft") || text.includes("deutschhefte")) return "Deutschheft";
  if (text.includes("mathematikheft") || text.includes("mathematikhefte")) return "Mathematikheft";
  if (text.includes("matheheft") || text.includes("mathehefte")) return "Matheheft";

  return "Heft";
}

function buildExerciseBookName(value: string) {
  const baseName = getExerciseBookBaseName(value);
  const format = normalizeFormat(value);
  const lineature = normalizeLineature(value);
  const text = normalizeText(value);
  const hasDoppelrand = text.includes("doppelrand");

  return [
    baseName,
    format,
    lineature ? `Lineatur ${lineature}` : null,
    hasDoppelrand ? "Doppelrand" : null,
  ]
    .filter(Boolean)
    .join(" ");
}

function expandCoverMaterialLine(item: ExtractedItem): ExtractedItem[] | null {
  const sourceLine = cleanNullableString(item.rawText) || cleanNullableString(item.normalizedName);
  if (!sourceLine || !shouldSplitCoverLine(sourceLine)) return null;

  const quantityResult = extractLeadingQuantityFromSegment(cleanCompoundSegment(sourceLine));
  const quantity = quantityResult.quantity ?? cleanQuantity(item.quantity);
  const format = normalizeFormat(sourceLine);
  const lineature = normalizeLineature(sourceLine);
  const coverColor = extractCoverColor(sourceLine);
  const exerciseBookName = buildExerciseBookName(sourceLine);
  const coverName = ["Umschlag", format, coverColor].filter(Boolean).join(" ");

  const exerciseBookItem: ExtractedItem = {
    ...item,
    rawText: sourceLine,
    normalizedName: exerciseBookName,
    quantity,
    category: "Heft",
    format,
    color: null,
    lineature,
    notes: [
      cleanNullableString(item.notes),
      "Heft-mit-Umschlag-Zeile deterministisch getrennt: Heft ist eigener Artikel.",
      `Analyse-Version: ${ANALYZE_VERSION}`,
    ]
      .filter(Boolean)
      .join(" | "),
  };

  const coverItem: ExtractedItem = {
    ...item,
    rawText: sourceLine,
    normalizedName: coverName || "Umschlag",
    quantity,
    category: "Umschlag",
    format,
    color: coverColor,
    lineature: null,
    notes: [
      cleanNullableString(item.notes),
      "Heft-mit-Umschlag-Zeile deterministisch getrennt: Umschlag ist eigener Artikel.",
      `Analyse-Version: ${ANALYZE_VERSION}`,
    ]
      .filter(Boolean)
      .join(" | "),
  };

  return [exerciseBookItem, coverItem];
}

const COLOR_ONLY_TERMS = new Set([
  "rot",
  "rote",
  "roter",
  "rotes",
  "blau",
  "blaue",
  "blauer",
  "blaues",
  "grün",
  "grüne",
  "grüner",
  "grünes",
  "gruen",
  "gruene",
  "gruener",
  "gruenes",
  "gelb",
  "gelbe",
  "gelber",
  "gelbes",
  "schwarz",
  "schwarze",
  "schwarzer",
  "schwarzes",
  "weiß",
  "weiss",
  "weiße",
  "weisse",
  "weißer",
  "weisser",
  "weißes",
  "weisses",
  "lila",
  "violett",
  "braun",
  "braune",
  "brauner",
  "braunes",
  "orange",
  "rosa",
]);

function normalizeDedupeText(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function isColorOnlyExtractedName(value: unknown) {
  const normalized = normalizeDedupeText(value);
  if (!normalized) return false;

  const compact = normalized.replace(/\s+/g, "");
  return COLOR_ONLY_TERMS.has(normalized) || COLOR_ONLY_TERMS.has(compact);
}

function getExtractedField(item: ExtractedItem | CleanedItem, camelKey: string, snakeKey: string) {
  const record = item as unknown as Record<string, unknown>;
  return record[camelKey] ?? record[snakeKey] ?? null;
}

function getExtractedItemName(item: ExtractedItem | CleanedItem) {
  return getExtractedField(item, "normalizedName", "normalized_name");
}

function getExtractedItemRawText(item: ExtractedItem | CleanedItem) {
  return getExtractedField(item, "rawText", "raw_text");
}

function isFinelinerColorListItem(item: ExtractedItem | CleanedItem) {
  const raw = normalizeDedupeText(getExtractedItemRawText(item));
  const name = normalizeDedupeText(getExtractedItemName(item));
  const category = normalizeDedupeText(item.category);

  return (
    raw.includes("fineliner") &&
    (name === "schwarz" ||
      name === "rot" ||
      name === "gruen" ||
      name === "grun" ||
      isColorOnlyExtractedName(name) ||
      category.includes("fineliner"))
  );
}

function shouldDropExtractedItemAsColorOnly(item: ExtractedItem | CleanedItem) {
  const name = normalizeDedupeText(getExtractedItemName(item) || getExtractedItemRawText(item));
  if (!name) return true;

  if (isColorOnlyExtractedName(name)) return true;

  if (isFinelinerColorListItem(item) && isColorOnlyExtractedName(getExtractedItemName(item))) {
    return true;
  }

  return false;
}

function getDedupeKeyForExtractedItem(item: ExtractedItem | CleanedItem) {
  const rawText = getExtractedItemRawText(item);
  const normalizedName = getExtractedItemName(item);

  return [
    normalizeDedupeText(rawText),
    normalizeDedupeText(normalizedName),
    String(item.quantity || 1),
    normalizeDedupeText(item.category),
    normalizeDedupeText(item.format),
    normalizeDedupeText(item.color),
    normalizeDedupeText(item.lineature),
  ].join("|");
}

function dedupeExtractedItems<T extends ExtractedItem | CleanedItem>(items: T[]) {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const item of items) {
    if (shouldDropExtractedItemAsColorOnly(item)) {
      continue;
    }

    const key = getDedupeKeyForExtractedItem(item);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(item);
  }

  return result;
}
function normalizeAnalyzeColorWord(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectOrderedColorWords(value: unknown) {
  const text = normalizeAnalyzeColorWord(value);

  const colorMap: Array<[string, string]> = [
    ["hellgruen", "hellgrün"],
    ["hellgrun", "hellgrün"],
    ["dunkelgruen", "dunkelgrün"],
    ["dunkelgrun", "dunkelgrün"],
    ["gruen", "grün"],
    ["grun", "grün"],
    ["schwarz", "schwarz"],
    ["rot", "rot"],
    ["blau", "blau"],
    ["gelb", "gelb"],
    ["orange", "orange"],
    ["lila", "lila"],
    ["violett", "violett"],
    ["braun", "braun"],
    ["rosa", "rosa"],
    ["pink", "pink"],
    ["weiss", "weiß"],
    ["grau", "grau"],
  ];

  const found: Array<{ index: number; color: string }> = [];

  for (const [needle, color] of colorMap) {
    const pattern = new RegExp(`(^|\\s)${needle}(\\s|$)`);
    const match = text.match(pattern);

    if (match?.index !== undefined) {
      found.push({ index: match.index, color });
    }
  }

  return found
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.color)
    .filter((color, index, list) => list.indexOf(color) === index);
}

function isColorListSplitType(value: unknown) {
  const text = normalizeAnalyzeColorWord(value);

  return (
    text.includes("fineliner") ||
    text.includes("textmarker")
  );
}

function removeColorSuffixFromMaterialName(value: unknown) {
  let text = String(value || "").trim();

  text = text.replace(/:\s*.+$/g, "");
  text = text.replace(/\b(hellgrün|hellgruen|dunkelgrün|dunkelgruen|grün|gruen|schwarz|rot|blau|gelb|orange|lila|violett|braun|rosa|pink|weiß|weiss|grau)\b/gi, "");
  text = text.replace(/[-–—]\s*$/g, "");
  text = text.replace(/\s+/g, " ").trim();

  return text;
}

function expandColorVariantQuantityItems(items: CleanedItem[]) {
  const expanded: CleanedItem[] = [];

  for (const item of items) {
    const fullText = [
      item.rawText,
      item.normalizedName,
      item.category,
      item.notes,
      item.color,
    ]
      .filter(Boolean)
      .join(" ");

    const colors = detectOrderedColorWords(fullText);
    const quantity = Number(item.quantity || 1);

    if (
      quantity > 1 &&
      colors.length >= 2 &&
      colors.length === quantity &&
      isColorListSplitType(fullText)
    ) {
      const baseName =
        removeColorSuffixFromMaterialName(item.normalizedName) ||
        removeColorSuffixFromMaterialName(item.rawText) ||
        "Artikel";

      for (const color of colors) {
        expanded.push({
          ...item,
          quantity: 1,
          normalizedName: `${baseName} ${color}`.replace(/\s+/g, " ").trim(),
          color,
          notes: [
            item.notes,
            `Aus Farbliste automatisch als Einzelposition erkannt (${color}).`,
          ]
            .filter(Boolean)
            .join(" "),
        });
      }

      continue;
    }

    expanded.push(item);
  }

  return expanded;
}
function splitFinalColorQuantityItems(items: CleanedItem[]) {
  const result: CleanedItem[] = [];
  const alreadySplitSourceKeys = new Set<string>();

  function normalizeFinalColorToken(value: unknown) {
    return String(value || "")
      .toLowerCase()
      .replace(/ä/g, "ae")
      .replace(/ö/g, "oe")
      .replace(/ü/g, "ue")
      .replace(/ß/g, "ss")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function mapFinalColorToken(value: unknown) {
    const text = normalizeFinalColorToken(value);

    if (text.includes("hellgruen") || text.includes("hellgrun")) return "hellgrün";
    if (text.includes("dunkelgruen") || text.includes("dunkelgrun")) return "dunkelgrün";
    if (text.includes("gruen") || text.includes("grun")) return "grün";
    if (text.includes("schwarz")) return "schwarz";
    if (text.includes("rot")) return "rot";
    if (text.includes("blau")) return "blau";
    if (text.includes("gelb")) return "gelb";
    if (text.includes("orange")) return "orange";
    if (text.includes("lila")) return "lila";
    if (text.includes("violett")) return "violett";
    if (text.includes("braun")) return "braun";
    if (text.includes("rosa")) return "rosa";
    if (text.includes("pink")) return "pink";
    if (text.includes("weiss") || text.includes("weis")) return "weiß";
    if (text.includes("grau")) return "grau";

    return null;
  }

  function extractFinelinerColorList(item: CleanedItem) {
    const rawText = String(item.rawText || "");
    const normalizedName = String(item.normalizedName || "");
    const combined = `${rawText} ${normalizedName} ${item.category || ""} ${item.notes || ""}`;

    if (!normalizeFinalColorToken(combined).includes("fineliner")) {
      return [];
    }

    const source =
      rawText.match(/fineliner\s*:\s*([^.;\n\r]+)/i)?.[1] ||
      normalizedName.match(/fineliner\s*:\s*([^.;\n\r]+)/i)?.[1] ||
      "";

    if (!source) {
      return [];
    }

    const colors = source
      .split(/,|\/|\+| und /gi)
      .map((part) => mapFinalColorToken(part))
      .filter(Boolean)
      .map((color) => String(color))
      .filter((color, index, list) => list.indexOf(color) === index);

    return colors;
  }

  for (const item of items) {
    const rawSourceKey = normalizeFinalColorToken(item.rawText || item.normalizedName);
    const colors = extractFinelinerColorList(item);

    if (colors.length >= 2) {
      if (alreadySplitSourceKeys.has(rawSourceKey)) {
        continue;
      }

      alreadySplitSourceKeys.add(rawSourceKey);

      for (const color of colors) {
        result.push({
          ...item,
          quantity: 1,
          normalizedName: `Fineliner ${color}`,
          category: "Fineliner",
          color,
          notes: [
            item.notes,
            `Fineliner-Farbliste final als Einzelposition gespeichert (${color}).`,
          ]
            .filter(Boolean)
            .join(" "),
        });
      }

      continue;
    }

    result.push(item);
  }

  return result;
}
function normalizeColorListTextV2(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectColorListWordsV2(value: unknown) {
  const text = normalizeColorListTextV2(value);

  const colorMap: Array<[string, string]> = [
    ["hellgruen", "hellgrün"],
    ["hellgrun", "hellgrün"],
    ["dunkelgruen", "dunkelgrün"],
    ["dunkelgrun", "dunkelgrün"],
    ["gruen", "grün"],
    ["grun", "grün"],
    ["schwarz", "schwarz"],
    ["rot", "rot"],
    ["blau", "blau"],
    ["gelb", "gelb"],
    ["orange", "orange"],
    ["lila", "lila"],
    ["violett", "violett"],
    ["braun", "braun"],
    ["rosa", "rosa"],
    ["pink", "pink"],
    ["weiss", "weiß"],
    ["grau", "grau"],
  ];

  const found: Array<{ index: number; color: string }> = [];

  for (const [needle, color] of colorMap) {
    const pattern = new RegExp(`(^|\\s)${needle}(\\s|$)`);
    const match = text.match(pattern);

    if (match?.index !== undefined) {
      found.push({ index: match.index, color });
    }
  }

  return found
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.color)
    .filter((color, index, list) => list.indexOf(color) === index);
}

function removeColorListSuffixV2(value: unknown) {
  let text = String(value || "").trim();

  text = text.replace(/:\s*.+$/g, "");
  text = text.replace(/\b(hellgrün|hellgruen|dunkelgrün|dunkelgruen|grün|gruen|schwarz|rot|blau|gelb|orange|lila|violett|braun|rosa|pink|weiß|weiss|grau)\b/gi, "");
  text = text.replace(/^\s*[-–—]\s*/g, "");
  text = text.replace(/^\s*\d+\s*x?\s*/gi, "");
  text = text.replace(/\s+/g, " ").trim();

  return text;
}

function expandColorListExtractedItemV2(item: ExtractedItem) {
  const fullText = [
    item.rawText,
    item.normalizedName,
    item.category,
    item.notes,
    item.color,
  ]
    .filter(Boolean)
    .join(" ");

  const normalizedText = normalizeColorListTextV2(fullText);
  const quantity = Number(item.quantity || 1);
  const colors = detectColorListWordsV2(fullText);

  const isSupportedColorList =
    normalizedText.includes("fineliner") ||
    normalizedText.includes("textmarker");

  if (
    !isSupportedColorList ||
    quantity <= 1 ||
    colors.length < 2 ||
    colors.length !== quantity
  ) {
    return null;
  }

  const baseName =
    removeColorListSuffixV2(item.normalizedName) ||
    removeColorListSuffixV2(item.rawText) ||
    "Fineliner";

  return colors.map((color) => ({
    ...item,
    quantity: 1,
    normalizedName: `${baseName} ${color}`.replace(/\s+/g, " ").trim(),
    color,
    notes: [
      item.notes,
      `Farbliste vor Komma-Splitting als Einzelposition erkannt (${color}).`,
    ]
      .filter(Boolean)
      .join(" "),
  }));
}
function normalizeColorListTextV3(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getLooseItemValueV3(item: unknown, keys: string[]) {
  const record = item as Record<string, unknown>;

  for (const key of keys) {
    const value = record?.[key];
    if (value !== null && value !== undefined && String(value).trim()) {
      return String(value);
    }
  }

  return "";
}

function getLooseItemQuantityV3(item: unknown, fallbackText: string) {
  const record = item as Record<string, unknown>;
  const directQuantity = Number(record?.quantity ?? record?.qty ?? 0);

  if (Number.isFinite(directQuantity) && directQuantity > 0) {
    return directQuantity;
  }

  const normalized = normalizeColorListTextV3(fallbackText);
  const match = normalized.match(/(?:^|\s)(\d+)\s*x?\s+fineliner(?:\s|:|$)/);

  if (match?.[1]) {
    const parsed = Number(match[1]);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }

  return 1;
}

function detectColorListWordsV3(value: unknown) {
  const text = normalizeColorListTextV3(value);

  const colorMap: Array<[string, string]> = [
    ["hellgruen", "hellgrün"],
    ["hellgrun", "hellgrün"],
    ["dunkelgruen", "dunkelgrün"],
    ["dunkelgrun", "dunkelgrün"],
    ["gruen", "grün"],
    ["grun", "grün"],
    ["schwarz", "schwarz"],
    ["rot", "rot"],
    ["blau", "blau"],
    ["gelb", "gelb"],
    ["orange", "orange"],
    ["lila", "lila"],
    ["violett", "violett"],
    ["braun", "braun"],
    ["rosa", "rosa"],
    ["pink", "pink"],
    ["weiss", "weiß"],
    ["grau", "grau"],
  ];

  const found: Array<{ index: number; color: string }> = [];

  for (const [needle, color] of colorMap) {
    const pattern = new RegExp(`(^|\\s)${needle}(\\s|$)`);
    const match = text.match(pattern);

    if (match?.index !== undefined) {
      found.push({ index: match.index, color });
    }
  }

  return found
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.color)
    .filter((color, index, list) => list.indexOf(color) === index);
}

function removeColorListSuffixV3(value: unknown) {
  let text = String(value || "").trim();

  text = text.replace(/:\s*.+$/g, "");
  text = text.replace(/\b(hellgrün|hellgruen|dunkelgrün|dunkelgruen|grün|gruen|schwarz|rot|blau|gelb|orange|lila|violett|braun|rosa|pink|weiß|weiss|grau)\b/gi, "");
  text = text.replace(/^\s*[-–—]\s*/g, "");
  text = text.replace(/^\s*\d+\s*x?\s*/gi, "");
  text = text.replace(/\s+/g, " ").trim();

  return text;
}

function expandColorListExtractedItemV3(item: ExtractedItem) {
  const rawText = getLooseItemValueV3(item, ["rawText", "raw_text", "text"]);
  const normalizedName = getLooseItemValueV3(item, ["normalizedName", "normalized_name", "name"]);
  const category = getLooseItemValueV3(item, ["category"]);
  const notes = getLooseItemValueV3(item, ["notes"]);
  const color = getLooseItemValueV3(item, ["color"]);

  const combinedText = [rawText, normalizedName, category, notes, color]
    .filter(Boolean)
    .join(" ");

  const normalizedText = normalizeColorListTextV3(combinedText);

  if (!normalizedText.includes("fineliner")) {
    return null;
  }

  const quantity = getLooseItemQuantityV3(item, combinedText);
  const colors = detectColorListWordsV3(combinedText);

  if (quantity <= 1 || colors.length < 2) {
    return null;
  }

  // Bei "3 Fineliner: grün, schwarz, rot" sind Menge und Farbanzahl identisch.
  // Falls OCR später eine Menge leicht falsch liest, splitten wir nur, wenn mindestens 2 Farben klar erkannt wurden.
  const baseName =
    removeColorListSuffixV3(normalizedName) ||
    removeColorListSuffixV3(rawText) ||
    "Fineliner";

  return colors.map((detectedColor) => ({
    ...item,
    quantity: 1,
    normalizedName: `${baseName} ${detectedColor}`.replace(/\s+/g, " ").trim(),
    normalized_name: `${baseName} ${detectedColor}`.replace(/\s+/g, " ").trim(),
    color: detectedColor,
    notes: [
      notes,
      `Farbliste vor Komma-Splitting als Einzelposition erkannt (${detectedColor}).`,
    ]
      .filter(Boolean)
      .join(" "),
  }));
}
function expandCompoundExtractedItems(items: ExtractedItem[]) {
  return items.flatMap((item) => {
    const colorListItems = expandColorListExtractedItemV3(item);
    if (colorListItems) return colorListItems;

    const coverItems = expandCoverMaterialLine(item);
    if (coverItems) return coverItems;

    const commaItems = expandCommaMaterialLine(item);
    if (commaItems) return commaItems;

    return [item];
  });
}
function cleanExtractedItem(item: ExtractedItem): CleanedItem {
  const rawText = cleanNullableString(item.rawText) || "";
  const aiName = cleanNullableString(item.normalizedName);

  const productType = classifyType(
    `${rawText} ${aiName || ""} ${item.category || ""}`
  );

  const format = getEffectiveFormat(rawText, aiName, item.format);
  const color = getEffectiveColor(rawText, aiName, item.color);

  const detectedLineature = getEffectiveLineature(
    rawText,
    aiName,
    item.notes,
    item.lineature
  );

  const lineature = forceLineatureForKnownPatterns(item, detectedLineature);
  const hefterCorrection = getHefterCorrection(rawText, aiName, item.category, color);

  const normalizedName = cleanNormalizedName(item, productType);

  const notesParts = [
    cleanNullableString(item.notes),
    productType ? `Produkttyp: ${productType}` : null,
    lineature === "0"
      ? "Lineatur 0 wurde als eigenständige Lineatur erkannt."
      : null,
    lineature === "8f" ? "Lineatur 8 wurde als 8f normalisiert." : null,
    `Analyse-Version: ${ANALYZE_VERSION}`,
  ].filter(Boolean);

  return {
    rawText,
    normalizedName: hefterCorrection?.normalizedName || normalizedName,
    quantity: cleanQuantity(item.quantity),
    category: hefterCorrection?.category || getEffectiveCategory(rawText, aiName, item.category),
    format,
    color: hefterCorrection?.color || color,
    lineature,
    notes: notesParts.length > 0 ? notesParts.join(" | ") : null,
    confidence: cleanConfidence(item.confidence),
    productType: hefterCorrection?.productType || productType,
  };
}

type HefterCorrection = {
  normalizedName: string;
  category: string;
  productType: string;
  color: string | null;
  note: string;
};

function normalizeAnalyzerText(value: unknown) {
  return String(value || "")
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

function getAnalyzerColor(value: unknown) {
  const text = normalizeAnalyzerText(value);

  const colors: Array<[string, string]> = [
    ["hellblau", "hellblau"],
    ["dunkelblau", "dunkelblau"],
    ["blau", "blau"],
    ["rot", "rot"],
    ["schwarz", "schwarz"],
    ["gruen", "grün"],
    ["grun", "grün"],
    ["braun", "braun"],
    ["weiss", "weiß"],
    ["gelb", "gelb"],
    ["lila", "lila"],
    ["orange", "orange"],
    ["pink", "pink"],
    ["rosa", "rosa"],
    ["transparent", "transparent"],
  ];

  for (const [needle, label] of colors) {
    if (text.includes(needle)) return label;
  }

  return null;
}

function getHefterSubjectFromRawText(value: unknown) {
  const text = String(value || "");
  const match = text.match(/(?:für|fuer)\s+[„"“]?([^"”„(]+)[“"]?/i);

  if (!match?.[1]) return "";

  return match[1]
    .replace(/\s+mit\s+.*$/i, "")
    .replace(/\s+zum\s+.*$/i, "")
    .replace(/\s+einheften.*$/i, "")
    .replace(/[.,;:]+$/g, "")
    .trim();
}

function getHefterCorrection(
  rawText: unknown,
  aiName: unknown,
  category: unknown,
  color: unknown
): HefterCorrection | null {
  const combined = normalizeAnalyzerText(`${rawText || ""} ${aiName || ""} ${category || ""}`);
  const hasExplicitHefter =
    combined.includes("schnellhefter") ||
    combined.split(" ").includes("hefter");

  if (!hasExplicitHefter) return null;

  const subject = getHefterSubjectFromRawText(rawText);
  const explicitColor = String(color || "").trim();
  const detectedColor =
    explicitColor || getAnalyzerColor(`${rawText || ""} ${aiName || ""}`);
  const normalizedName = ["Schnellhefter", subject, detectedColor]
    .filter(Boolean)
    .join(" ");

  return {
    normalizedName: normalizedName || "Schnellhefter",
    category: "Schnellhefter",
    productType: "Schnellhefter",
    color: detectedColor,
    note:
      "Hefter wurde deterministisch als Schnellhefter normalisiert; Mappe-/Einsteckfolie-Kontext überschreibt den Hauptartikel nicht.",
  };
}
function getFriendlyOpenAiError(error: unknown) {
  if (error instanceof Error) {
    const message = error.message;

    if (
      message.includes("401") ||
      message.toLowerCase().includes("incorrect api key") ||
      message.toLowerCase().includes("invalid api key")
    ) {
      return "Der OpenAI API-Key ist falsch oder noch ein Platzhalter. Bitte OPENAI_API_KEY in .env.local prüfen und den Server neu starten.";
    }

    if (
      message.toLowerCase().includes("quota") ||
      message.toLowerCase().includes("billing") ||
      message.toLowerCase().includes("insufficient_quota")
    ) {
      return "OpenAI konnte nicht genutzt werden, vermutlich wegen Guthaben, Billing oder Limit. Bitte OpenAI Platform Billing prüfen.";
    }

    if (
      message.toLowerCase().includes("file") ||
      message.toLowerCase().includes("pdf")
    ) {
      return `Die Datei konnte von OpenAI nicht verarbeitet werden: ${message}`;
    }

    return message;
  }

  return "Bei der Analyse ist ein unerwarteter Fehler aufgetreten.";
}

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    if (!id) {
      return NextResponse.json(
        { ok: false, message: "Keine Anfrage-ID übergeben." },
        { status: 400 }
      );
    }

    const openai = getOpenAiClient();

    const { data: requestData, error: requestError } = await supabaseServer
      .from("school_requests")
      .select(
        `
        id,
        request_number,
        status,
        school_request_files (
          id,
          storage_path,
          file_type,
          original_filename
        )
      `
      )
      .eq("id", id)
      .single();

    if (requestError || !requestData) {
      return NextResponse.json(
        { ok: false, message: "Anfrage wurde nicht gefunden." },
        { status: 404 }
      );
    }

    const files = (requestData.school_request_files || []) as RequestFile[];

    const usableFile = files.find(
      (file) => isSupportedImage(file) || isSupportedPdf(file)
    );

    if (!usableFile || !usableFile.storage_path) {
      await supabaseServer
        .from("school_requests")
        .update({
          status: "manual_review",
          ai_status: "unsupported_file_type",
        })
        .eq("id", id);

      return NextResponse.json(
        {
          ok: false,
          message:
            "Diese Datei kann aktuell nicht analysiert werden. Bitte nutze JPG, PNG, WEBP, Handyfoto oder PDF.",
        },
        { status: 400 }
      );
    }

    await supabaseServer
      .from("school_requests")
      .update({
        status: "analysis_running",
        ai_status: "running",
      })
      .eq("id", id);

    const { data: oldItems } = await supabaseServer
      .from("school_request_items")
      .select("id")
      .eq("request_id", id);

    const oldItemIds = (oldItems || []).map((item) => item.id);

    if (oldItemIds.length > 0) {
      await supabaseServer
        .from("school_request_matches")
        .delete()
        .in("request_item_id", oldItemIds);
    }
    // Bei einer Neuanalyse werden die Request-Items neu geschrieben.
    // Alte automatisch erzeugte Paketpositionen zeigen sonst auf gelöschte request_item_ids
    // und verursachen doppelte Paketpositionen bzw. falsche offene Checklistenpunkte.
    await supabaseServer
      .from("school_offer_items")
      .delete()
      .eq("request_id", id)
      .in("source", ["auto_safe_match", "auto_preselected"]);


    await supabaseServer
      .from("school_request_items")
      .delete()
      .eq("request_id", id);

    const model = process.env.OPENAI_ANALYZE_MODEL || process.env.OPENAI_MODEL || "gpt-4.1";

    const fileContentPart = isSupportedPdf(usableFile)
      ? {
          type: "input_file",
          filename: usableFile.original_filename || "materialliste.pdf",
          file_data: await createPdfBase64FileData(usableFile.storage_path),
        }
      : {
          type: "input_image",
          image_url: await createSignedUrl(usableFile.storage_path),
          detail: "high",
        };

    const aiRequest = {
      model,
      temperature: 0,
      max_output_tokens: Number(process.env.OPENAI_ANALYZE_MAX_OUTPUT_TOKENS || 8000),
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text:
                "Du bist ein extrem genauer Assistent für deutsche Schulmateriallisten. " +
                "Du extrahierst echte Materialpositionen aus deutschen Schulmateriallisten, auch wenn es Screenshots, kleine Schrift, schlechte Auflösung, Checkbox-Listen, mehrspaltige Listen oder eingerückte Kategorien sind. " +
                "Du extrahierst keine Schule, keine Namen, keine Datenschutztexte, keine Preise, keine reinen Überschriften und keine Dekoration. " +
                "Du musst jede sichtbare Materialposition vollständig als eigene Position erfassen. Lieber eine plausible Position mit niedriger confidence erfassen als eine lesbare Materialposition ganz weglassen. " +
                "Arbeite dabei streng in zwei Phasen: Erst alle sichtbaren Rohzeilen erfassen, dann daraus strukturierte Materialpositionen bilden. Überspringe keine lesbare Listenzeile nur deshalb, weil sie eingerückt, klein gedruckt, in einer Tabelle, in einem farbigen Kasten oder unter einer Kategorie steht. " +
                "Vollständigkeitsregel: Wenn eine Liste 20 Materialzeilen enthält, soll die Ausgabe ungefähr 20 Materialpositionen oder bewusst ausgeschlossene Hinweise enthalten. Eine kurze Ausgabe bei langer Liste ist falsch. " +
                "Größenregel: Wörter wie klein, kleines, kleine, kleiner, groß, große, großer, dick, dünn, breit, schmal sind harte Merkmale. Sie dürfen nicht entfernt oder vertauscht werden. '2 große Klebestifte' darf niemals als kleiner Klebestift normalisiert werden. 'kleines Lineal' und 'Lineal 30 cm' sind zwei verschiedene Positionen. " +
                "Formatregel: A3, A4, A5, DIN A3, DIN A4, DIN A5, 15 cm, 16 cm, 17 cm, 30 cm sind harte Merkmale und müssen in rawText sowie format oder notes erhalten bleiben. " +
                "Split-Regel: Wenn eine Zeile mehrere eindeutig getrennte Materialien enthält, erstelle mehrere Positionen. Beispiele: 'Hefte DIN A4 Nr.27 und Nr.28' ergibt zwei Positionen mit Lineatur 27 und 28. '2 Lineale (15cm und 30cm)' ergibt zwei Positionen, wenn beide Lineale benötigt werden. " +
                "Tabellenregel: Bei Tabellen mit Fach, Titel, Verlag, ISBN, Preis extrahierst du die Titel als Positionen, aber Preise nicht als Material. Verlag und ISBN kommen in notes. Hinweise wie 'kann ausgeliehen werden' sind kein Kaufartikel und müssen als Hinweis in notes markiert oder ausgelassen werden, wenn kein Kaufbedarf besteht. " +
                "Ausschlussregel: Zeilen wie 'wird von der Lehrerin angeschafft', 'bekommen die Kinder in der Schule', 'nicht kaufen', 'kann ausgeliehen werden', 'wird separat eingesammelt', 'alle Sachen beschriften' sind keine normalen Kaufpositionen. Erfasse sie höchstens mit niedriger confidence und notes als Hinweis, aber nicht als normale benötigte Kaufposition. " +
                "Checkbox-Regel erweitert: Nicht angekreuzte und angekreuzte Kästchen sind meist Drucklayout, nicht Auswahlstatus. Eine angekreuzte Zeile kann trotzdem ein Hinweis sein. Entscheidend ist der Text der Zeile. " +
                "Fach-/Kastenregel: Farbig umrandete Bereiche wie Deutsch, Mathematik, Kunst, Sport sind Kontext. Die darin enthaltenen Zeilen müssen trotzdem einzeln extrahiert werden. " +
                "Die vollständige Originalzeile muss in rawText erhalten bleiben. Klammerangaben sind sehr wichtig und dürfen niemals weggelassen werden. " +
                "Checkbox-Regel: Eine Checkbox vor einer Zeile ist kein Mengenwert. Zeichen wie â˜, â–¡, â–¢, [ ], Häkchen, Aufzählungspunkte oder Streichpunkte ignorierst du für quantity. " +
                "Die Menge steht meist nach der Checkbox oder am Zeilenanfang: 'â˜ 2 dicke Bleistifte' bedeutet quantity 2, 'â˜ 1 blaue Mappe' bedeutet quantity 1. " +
                "Kategorie-Regel: Überschriften wie 'Hefte', 'Mappen', 'Kunst', 'Federmappe', 'Schreiben', 'Mathematik', 'Deutsch' oder 'Werken' sind Kontext für die darunterstehenden eingerückten Zeilen. " +
                "Wenn unter der Überschrift 'Mappen' die Zeile '1 blaue' oder '1 blaue Mappe' steht, ist category 'Mappe', color 'blau', quantity 1. " +
                "Hefter-Regel: Wenn in der Originalzeile ausdrücklich 'Hefter' oder 'Schnellhefter' steht, ist der Hauptartikel immer ein Schnellhefter/Hefter, niemals Mappe. Beispiel: '1 Hefter für Mathematik (blau) mit einer Einsteckfolie' => normalizedName 'Schnellhefter Mathematik blau', category 'Schnellhefter', color 'blau'. Eine Einsteckfolie ist nur Zusatzkontext und überschreibt den Hauptartikel nicht. " +
                "Wenn unter der Überschrift 'Hefte' die Zeile '1 Schreibheft 1 DIN A5 roter Umschlag' steht, ist es ein Heft bzw. Schreibheft mit Lineatur 1, Format A5 und Hinweis roter Umschlag. " +
                "Wenn eine Position '1 Rechenh. Nr. 7' oder '1 Rechenheft Nr. 7' lautet, ist normalizedName 'Rechenheft', category 'Heft', lineature '7', quantity 1. " +
                "Wenn eine Position '2 Schreibhefte A4 Lineatur 2 (bitte farbig unterlegt)' lautet, ist quantity 2, normalizedName 'Schreibheft A4', category 'Heft', format 'A4', lineature '2', notes enthält 'bitte farbig unterlegt'. " +
                "Wenn eine Position '2 Hefte A4 kariert Lineatur 8f (bitte mit Rand)' lautet, ist quantity 2, format 'A4', lineature '8f', notes enthält 'mit Rand'. " +
                "Wenn eine Position '1 Sammelmappe A3' lautet, ist category 'Mappe', format 'A3'. Sie darf nicht als A4 erkannt werden. " +
                "Wenn eine Position '1 Block Tonpapier weiß A3' lautet, ist category 'Papier/Block', color 'weiß', format 'A3'. Sie darf nicht als A4 erkannt werden. " +
                "Wenn eine Position 'kleines Lineal' lautet, muss 'klein' in normalizedName oder notes erhalten bleiben. " +
                "Wenn eine Position 'Lineal 30 cm' lautet, muss '30 cm' in normalizedName oder notes erhalten bleiben. " +
                "Wenn eine Position '2 große Klebestifte' lautet, muss 'groß' in normalizedName oder notes erhalten bleiben. " +
                "Abkürzungen: 'Rechenh.' = Rechenheft, 'Schreibh.' = Schreibheft, 'HA-Heft' oder 'HA Heft' = Hausaufgabenheft, 'Hs.' nur bei eindeutiger Heft-Kontextzeile als Heft interpretieren. " +
                "Hausaufgabenheft-Regel: Hausaufgabenheft, HA-Heft und Aufgabenheft niemals als normales Schreibheft interpretieren. " +
                "Blanko-Regel: 'blanko', 'unliniert' und 'ohne Lineatur' bedeuten lineature '0', wenn es um Hefte/Blöcke geht. " +
                "Kariert-Regel: 'kariert' bedeutet lineature '28', wenn keine exakte Nummer angegeben ist. 'liniert' bedeutet lineature 'liniert', wenn keine exakte Nummer angegeben ist. " +
                "Mehrspalten-Regel: Bei mehreren Spalten musst du alle sichtbaren Materialpositionen aus allen Spalten extrahieren. " +
                "Störgrafiken, Stempel, Logos, Illustrationen und Randgrafiken ignorierst du. " +
                "Beispiele: " +
                "'40x Schreibheft A5 (Lineatur 0)' bedeutet lineature exakt '0'. Lineatur 0 ist NICHT unklar. " +
                "'40x Schreibheft A5 (Lineatur 1)' bedeutet lineature exakt '1'. " +
                "'80x Schreibheft A5 (Lineatur 8f)' bedeutet lineature exakt '8f'. " +
                "'80x Schreibheft A5 (Lineatur 8)' bedeutet lineature exakt '8f'. " +
                "'Lin. 8', 'L8', '8 F' und '8f' bedeuten immer lineature exakt '8f'. " +
                "Wenn irgendwo Lineatur 0, Lin. 0, L0 oder L 0 steht, ist lineature exakt '0'. Niemals 'unklar'. " +
                "Wenn eine Lineatur wirklich nicht vorhanden oder nicht lesbar ist, nutze null oder 'unknown'. " +
                "Bei Umschlägen achte besonders auf Farbe und Buchmaß. Buchmaß 30 x 21 cm entspricht ungefähr A4. Buchmaß um 26,5 x 19,5 cm entspricht ungefähr A5. " +
                `Interne Analyse-Version: ${ANALYZE_VERSION}.`,
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                "Analysiere diese Schulmaterialliste vollständig. " +
                "Extrahiere alle Materialpositionen strukturiert, auch aus kleinen Screenshots, Checkbox-Listen, mehrspaltigen Bereichen und eingerückten Kategorien. " +
                "Achte besonders auf Menge, Format, Lineatur, Farbe, Artikelart und den Kontext von Überschriften. " +
                "Wichtig: Schreibe rawText als vollständige Originalzeile inklusive Klammern und sichtbarer Abkürzungen. " +
                "Checkboxen oder Aufzählungszeichen sind keine Mengen. " +
                "Wenn Text teilweise unsicher ist, extrahiere die plausible Materialposition trotzdem mit niedrigerer confidence, statt sie wegzulassen. " +
                "Lineatur 0, blanko, unliniert oder ohne Lineatur muss als lineature '0' gespeichert werden. " +
                "Lineatur 8, 8f, 8 F, L8 oder Lin. 8 muss als lineature '8f' gespeichert werden. " +
                "Rechenh. bedeutet Rechenheft. Schreibh. bedeutet Schreibheft. HA-Heft bedeutet Hausaufgabenheft. " +
                "Überschriften wie Hefte, Mappen, Kunst oder Federmappe dienen als Kontext für die darunter stehenden Positionen.",
            },
            fileContentPart,
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "school_material_extraction",
          strict: true,
          schema: materialSchema,
        },
      },
    } as Parameters<typeof openai.responses.create>[0];

    const response = await openai.responses.create(aiRequest);
    const outputText = extractOutputText(response);

    if (!outputText) {
      throw new Error("Die KI hat keine verwertbare Antwort geliefert.");
    }

    const parsed = JSON.parse(outputText) as ExtractionResult;
    const items = Array.isArray(parsed.items) ? parsed.items : [];

    if (items.length === 0) {
      await supabaseServer
        .from("school_requests")
        .update({
          status: "manual_review",
          ai_status: "no_items_detected",
        })
        .eq("id", id);

      await supabaseServer.from("school_request_events").insert({
        request_id: id,
        event_type: "analysis_no_items",
        title: "Keine Artikel erkannt",
        description:
          "Die Analyse wurde ausgeführt, es konnten aber keine Materialpositionen sicher erkannt werden.",
      });

      return NextResponse.json({
        ok: true,
        message: "Analyse abgeschlossen, aber keine Artikel erkannt.",
        itemCount: 0,
        analyzeVersion: ANALYZE_VERSION,
      });
    }

    const expandedItems = dedupeExtractedItems(expandCompoundExtractedItems(items));
    const cleanedItems = dedupeExtractedItems(expandedItems.map(cleanExtractedItem));

    function shouldDropFinalCleanedItem(item: CleanedItem) {
      const name = normalizeDedupeText(item.normalizedName);
      const raw = normalizeDedupeText(item.rawText);
      const category = normalizeDedupeText(item.category);

      if (!name) return true;

      // Farbwörter sind keine eigenständigen Artikel.
      // Beispiel-Fehler: "schwarz" mit Farbe "rot" aus "3 Fineliner: grün, schwarz, rot".
      if (isColorOnlyExtractedName(name)) return true;

      // Fineliner-Farblisten dürfen nicht zu einzelnen Farb-Artikeln werden.
      if (
        raw.includes("fineliner") &&
        (isColorOnlyExtractedName(name) ||
          name === "schwarz" ||
          name === "rot" ||
          name === "gruen" ||
          name === "grun" ||
          category.includes("fineliner"))
      ) {
        return !name.includes("fineliner");
      }

      return false;
    }

    function getFinalCleanedItemKey(item: CleanedItem) {
      const raw = normalizeDedupeText(item.rawText);
      const name = normalizeDedupeText(item.normalizedName);
      const category = normalizeDedupeText(item.category);

      let canonicalName = name;

      if (raw.includes("fineliner") && name.includes("fineliner")) {
        canonicalName = "fineliner";
      }

      if (name.includes("lineal")) {
        canonicalName = "lineal";
      }

      if (name.includes("geodreieck")) {
        canonicalName = "geodreieck";
      }

      if (name.includes("umschlag")) {
        canonicalName = "umschlag";
      }

      return [
        canonicalName,
        String(item.quantity || 1),
        category,
        normalizeDedupeText(item.format),
        normalizeDedupeText(item.color),
        normalizeDedupeText(item.lineature),
      ].join("|");
    }

    const finalCleanedItemsBeforeColorSplit = (() => {
      const sourceItems = expandColorVariantQuantityItems(
        typeof cleanedItems !== "undefined" ? cleanedItems : []
      );

      const seen = new Set<string>();
      const result: CleanedItem[] = [];

      for (const item of sourceItems) {
        if (shouldDropFinalCleanedItem(item)) {
          continue;
        }

        const key = getFinalCleanedItemKey(item);
        if (seen.has(key)) {
          continue;
        }

        seen.add(key);
        result.push(item);
      }

      return result;
    })();
    const finalCleanedItems = splitFinalColorQuantityItems(finalCleanedItemsBeforeColorSplit);

    const rows = finalCleanedItems.map((item) => ({
      request_id: id,
      raw_text: item.rawText,
      normalized_name: item.normalizedName,
      quantity: item.quantity || 1,
      category: item.category,
      format: item.format,
      color: item.color,
      lineature: item.lineature,
      notes: item.notes,
      confidence: item.confidence,
      status: item.confidence >= 0.85 ? "detected" : "needs_review",
    }));

    const { error: insertError } = await supabaseServer
      .from("school_request_items")
      .insert(rows);

    if (insertError) {
      console.error("Fehler beim Speichern der erkannten Artikel:", insertError);
      throw new Error("Die erkannten Artikel konnten nicht gespeichert werden.");
    }

    await supabaseServer
      .from("school_requests")
      .update({
        status: "analysis_done",
        ai_status: "done",
      })
      .eq("id", id);

    await supabaseServer.from("school_request_events").insert({
      request_id: id,
      event_type: "analysis_done",
      title: "Materialliste analysiert",
      description: `${finalCleanedItems.length} Materialpositionen wurden erkannt und gespeichert. Analyse-Version: ${ANALYZE_VERSION}`,
    });

    return NextResponse.json({
      ok: true,
      message: "Materialliste wurde analysiert.",
      itemCount: finalCleanedItems.length,
      analyzeVersion: ANALYZE_VERSION,
      items: finalCleanedItems.map((item) => ({
        rawText: item.rawText,
        normalizedName: item.normalizedName,
        quantity: item.quantity,
        category: item.category,
        format: item.format,
        color: item.color,
        lineature: item.lineature,
        confidence: item.confidence,
      })),
    });
  } catch (error) {
    console.error("Analyse-Fehler:", error);

    if (id) {
      await supabaseServer
        .from("school_requests")
        .update({
          status: "manual_review",
          ai_status: "error",
        })
        .eq("id", id);
    }

    return NextResponse.json(
      {
        ok: false,
        message: getFriendlyOpenAiError(error),
        analyzeVersion: ANALYZE_VERSION,
      },
      { status: 500 }
    );
  }
}



















