import { randomUUID } from "crypto";
import { existsSync } from "fs";
import { readFile } from "fs/promises";
import path from "path";
import sharp from "sharp";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

const STORAGE_BUCKET = "social-assets";

const BRAND_LOGO_RELATIVE_PATH =
  process.env.SOCIAL_BRAND_LOGO_PATH ||
  "public/brand/handzettel-schulen-logo.png";

const CANVAS_WIDTH = 1080;
const CANVAS_HEIGHT = 1350;

const TEMPLATE_SYSTEM_VERSION =
  "socialpilot-template-composite-v1-final";

type TopicCategory =
  | "wrong-purchases"
  | "school-start-stress"
  | "summer-family-time"
  | "upload"
  | "details-and-differences"
  | "relief-and-efficiency"
  | "how-it-works"
  | "local-service"
  | "general-school-material";

type SocialPostRow = {
  id: string;
  status: string;
  topic: string;
  hook: string;
  caption: string;
  image_prompt: string | null;
  brand_project: string | null;
};

type OpenAiImageResponse = {
  data?: Array<{
    b64_json?: string;
    revised_prompt?: string;
  }>;
  error?: {
    message?: string;
    type?: string;
  };
};

type Box = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type TemplateConfig = {
  key: string;
  label: string;
  file: string;
  hookBox: Box;
  imageBox: Box;
  logoBox: Box;
  hookTextColor: string;
  hookMaxLines: number;
  hookFontSize: number;
  hookMaxCharsPerLine: number;
  imageRadius: number;
  motifDirection: string;
};

const TEMPLATES: Record<string, TemplateConfig> = {
  "stress-einkauf": {
    key: "stress-einkauf",
    label: "Stress Einkauf",
    file: "public/social/templates/template-1-stress-einkauf-v1.png",
    hookBox: {
      x: 66,
      y: 78,
      width: 455,
      height: 265,
    },
    imageBox: {
      x: 405,
      y: 420,
      width: 560,
      height: 610,
    },
    logoBox: {
      x: 250,
      y: 1198,
      width: 580,
      height: 92,
    },
    hookTextColor: "#FFFFFF",
    hookMaxLines: 5,
    hookFontSize: 42,
    hookMaxCharsPerLine: 12,
    imageRadius: 24,
    motifDirection:
      "Motif must fit cleanly inside the large white card on the right side. Prefer school supplies, wrong purchases, confusing materials, shopping-list comparison, or an adult-only detail scene.",
  },
  "stress-schreibtisch": {
    key: "stress-schreibtisch",
    label: "Stress Schreibtisch",
    file: "public/social/templates/template-2-stress-schreibtisch-v1.png",
    hookBox: {
      x: 42,
      y: 108,
      width: 360,
      height: 200,
    },
    imageBox: {
      x: 82,
      y: 438,
      width: 916,
      height: 585,
    },
    logoBox: {
      x: 250,
      y: 1198,
      width: 580,
      height: 92,
    },
    hookTextColor: "#FFFFFF",
    hookMaxLines: 3,
    hookFontSize: 40,
    hookMaxCharsPerLine: 11,
    imageRadius: 18,
    motifDirection:
      "Motif must fit cleanly inside the central white content panel. Prefer adult-only desk, list, school supplies, paper chaos, checklist, wrong items, lineature/format comparison, or school-material sorting.",
  },

  "erleichtert-loesung": {
    key: "erleichtert-loesung",
    label: "Erleichtert Lösung",
    file: "public/social/templates/template-3-erleichtert-loesung-v1.png",
    hookBox: {
      x: 500,
      y: 108,
      width: 360,
      height: 205,
    },
    imageBox: {
      x: 88,
      y: 410,
      width: 570,
      height: 635,
    },
    logoBox: {
      x: 250,
      y: 1198,
      width: 580,
      height: 92,
    },
    hookTextColor: "#102A43",
    hookMaxLines: 3,
    hookFontSize: 46,
    hookMaxCharsPerLine: 9,
    imageRadius: 30,
    motifDirection:
      "Motif must fit cleanly inside the large rounded white card. Prefer organized school materials, smartphone upload, checked list, packed school supplies, order confirmation mood, or practical adult-only solution scene.",
  },
  "sommer-familienzeit": {
    key: "sommer-familienzeit",
    label: "Sommer Familienzeit",
    file: "public/social/templates/template-4-sommer-familienzeit-v1.png",
    hookBox: {
      x: 58,
      y: 86,
      width: 492,
      height: 330,
    },
    imageBox: {
      x: 604,
      y: 166,
      width: 370,
      height: 405,
    },
    logoBox: {
      x: 86,
      y: 430,
      width: 430,
      height: 145,
    },
    hookTextColor: "#102A43",
    hookMaxLines: 5,
    hookFontSize: 42,
    hookMaxCharsPerLine: 13,
    imageRadius: 22,
    motifDirection:
      "Motif must fit cleanly inside the upper-right calm framed image area. Prefer summer holidays, relaxed adult-only family time, sunny desk, terrace, holiday planning, school supply list handled in the background, warm practical relief mood, no children, no text.",
  },
};
function cleanString(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function normalizeForMatching(value: unknown) {
  return cleanString(value)
    .toLowerCase()
    .replace(/Ã¤/g, "ae")
    .replace(/Ã¶/g, "oe")
    .replace(/Ã¼/g, "ue")
    .replace(/ÃŸ/g, "ss")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}

async function getPostIdFromRequest(
  request: Request,
  context: { params?: Promise<{ id?: string }> | { id?: string } }
) {
  let contextId = "";

  try {
    const rawParams = context.params;

    let params: { id?: string } | undefined;

    if (!rawParams) {
      params = undefined;
    } else if (
      typeof (rawParams as Promise<{ id?: string }>).then === "function"
    ) {
      params = await (rawParams as Promise<{ id?: string }>);
    } else {
      params = rawParams as { id?: string };
    }

    contextId = cleanString(params?.id);
  } catch {
    contextId = "";
  }

  const url = new URL(request.url);
  const match = url.pathname.match(
    /\/api\/admin\/social\/([^/]+)\/generate-image\/?$/
  );

  const pathId = match?.[1] ? decodeURIComponent(match[1]) : "";

  return cleanString(contextId || pathId)
    .replace(/^"+/, "")
    .replace(/"+$/, "")
    .trim();
}

function createDeterministicNumber(input: string) {
  let hash = 0;

  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 33 + input.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function pickVariant<T>(input: string, variants: T[]) {
  const number = createDeterministicNumber(input);
  return variants[number % variants.length];
}

function getBrandName(post: SocialPostRow) {
  return cleanString(post.brand_project) || "Handzettel-Schulen.de";
}

function getBrandLogoAbsolutePath() {
  return path.join(process.cwd(), BRAND_LOGO_RELATIVE_PATH);
}

function getTemplateAbsolutePath(template: TemplateConfig) {
  return path.join(process.cwd(), template.file);
}

async function loadBrandLogoBuffer() {
  const logoPath = getBrandLogoAbsolutePath();

  if (!existsSync(logoPath)) {
    throw new Error(
      `Logo-Datei wurde nicht gefunden: ${BRAND_LOGO_RELATIVE_PATH}. Bitte echtes Logo dort ablegen oder SOCIAL_BRAND_LOGO_PATH setzen.`
    );
  }

  return readFile(logoPath);
}

async function loadTemplateBuffer(template: TemplateConfig) {
  const templatePath = getTemplateAbsolutePath(template);

  if (!existsSync(templatePath)) {
    throw new Error(
      `Template wurde nicht gefunden: ${template.file}. Bitte Template-Datei unter public/social/templates ablegen.`
    );
  }

  return sharp(await readFile(templatePath))
    .rotate()
    .resize(CANVAS_WIDTH, CANVAS_HEIGHT, {
      fit: "cover",
      position: "center",
    })
    .png()
    .toBuffer();
}

function sanitizeBaseImagePrompt(value: string) {
  const cleaned = cleanString(value);

  if (!cleaned) return "";

  return cleaned
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => {
      const lower = line.toLowerCase();

      const blockedTerms = [
        "child",
        "children",
        "school-age",
        "kid",
        "kids",
        "minor",
        "minors",
        "junge",
        "mÃ¤dchen",
        "kind",
        "kinder",
        "schulkind",
        "schulkinder",
        "parent-child",
        "logo",
        "brand name",
        "branded",
        "branding",
        "label",
        "sticker",
        "handzettel-schulen",
      ];

      return !blockedTerms.some((term) => lower.includes(term));
    })
    .join("\n");
}

function detectTopicCategory(post: SocialPostRow): TopicCategory {
  const primaryText = normalizeForMatching(
    `${cleanString(post.topic)} ${cleanString(post.hook)}`
  );

  const fullText = normalizeForMatching(
    `${cleanString(post.topic)} ${cleanString(post.hook)} ${cleanString(
      post.caption
    )}`
  );

  const hasStressSignal = (text: string) =>
    text.includes("stress") ||
    text.includes("stressfrei") ||
    text.includes("schulstart") ||
    text.includes("chaos") ||
    text.includes("zeitdruck") ||
    text.includes("ueberfordert") ||
    text.includes("genervt");

  const hasWrongPurchaseSignal = (text: string) =>
    text.includes("fehlkauf") ||
    text.includes("fehlkaeufe") ||
    text.includes("falsch gekauft") ||
    text.includes("falsche artikel") ||
    text.includes("falsches material") ||
    text.includes("doppelt") ||
    text.includes("unnoetig gekauft") ||
    text.includes("richtig kaufen") ||
    text.includes("schulsachen richtig") ||
    text.includes("schulmaterial richtig") ||
    text.includes("richtig zuordnen");

  const hasDetailsSignal = (text: string) =>
    text.includes("lineatur") ||
    text.includes("format") ||
    text.includes("a4") ||
    text.includes("a5") ||
    text.includes("umschlag") ||
    text.includes("heft") ||
    text.includes("hefte") ||
    text.includes("farbe") ||
    text.includes("farben") ||
    text.includes("unterschied") ||
    text.includes("materialdetails") ||
    text.includes("zuordnen") ||
    text.includes("erklaert") ||
    text.includes("erklaeren");

  const hasUploadSignal = (text: string) =>
    text.includes("upload") ||
    text.includes("hochladen") ||
    text.includes("liste fotografieren") ||
    text.includes("foto der liste") ||
    text.includes("schulliste hochladen") ||
    text.includes("paketwunsch") ||
    text.includes("so funktioniert") ||
    text.includes("so geht") ||
    text.includes("ablauf");

  const hasSummerFamilySignal = (text: string) =>
    text.includes("sommer") ||
    text.includes("sommerferien") ||
    text.includes("ferien") ||
    text.includes("ferienzeit") ||
    text.includes("familienzeit") ||
    text.includes("urlaub") ||
    text.includes("freie zeit") ||
    text.includes("zeit fuer die familie") ||
    text.includes("zeit mit der familie") ||
    text.includes("mehr zeit") ||
    text.includes("geniess die ferien") ||
    text.includes("geniesse die ferien") ||
    text.includes("ferien geniessen") ||
    text.includes("kein stress in den ferien") ||
    text.includes("stressfrei durch die ferien") ||
    text.includes("schulmaterialstress") ||
    text.includes("ferien statt einkaufsstress") ||
    text.includes("ferien statt schulmaterialstress");

  const hasExplicitProcessUploadSignal = (text: string) =>
    text.includes("so funktioniert") ||
    text.includes("so geht") ||
    text.includes("ablauf") ||
    text.includes("schritt fuer schritt") ||
    text.includes("prozess") ||
    text.includes("upload erklaert") ||
    text.includes("hochladen erklaert");
  const hasReliefSignal = (text: string) =>
    text.includes("zeit sparen") ||
    text.includes("entlastung") ||
    text.includes("weniger stress") ||
    text.includes("einfacher") ||
    text.includes("uebersicht") ||
    text.includes("erleichtert") ||
    text.includes("entspannt") ||
    text.includes("bequem") ||
    text.includes("bestellen") ||
    text.includes("zu hause");

  const hasLocalServiceSignal = (text: string) =>
    text.includes("lokal") ||
    text.includes("service") ||
    text.includes("vertrauen") ||
    text.includes("nah") ||
    text.includes("vertraut");

  // Absolute Priorität: Topic + Hook.
  // "Stress vor Schulstart" darf nie durch "hochladen" in der Caption zu Template 3 werden.
  // Sommer / Ferien / Familienzeit hat Vorrang vor allgemeinem Stress,
  // damit "kein Stress in den Ferien" nicht fälschlich Template 1 zieht.
  // Details/Fehlkäufe bleiben aber stärker, wenn Topic + Hook genau darauf zielen.
  if (
    hasSummerFamilySignal(primaryText) &&
    !hasExplicitProcessUploadSignal(primaryText) &&
    !hasWrongPurchaseSignal(primaryText) &&
    !hasDetailsSignal(primaryText)
  ) {
    return "summer-family-time";
  }
  if (hasStressSignal(primaryText)) {
    return "school-start-stress";
  }

  if (hasWrongPurchaseSignal(primaryText)) {
    return "wrong-purchases";
  }

  if (hasDetailsSignal(primaryText)) {
    return "details-and-differences";
  }

  if (hasUploadSignal(primaryText)) {
    return "upload";
  }

  if (hasReliefSignal(primaryText)) {
    return "relief-and-efficiency";
  }

  if (hasLocalServiceSignal(primaryText)) {
    return "local-service";
  }

  // Caption nur als zweite Ebene.
  // Caption-Ebene: Sommer/Ferien nur nutzen, wenn nichts Spezifischeres im Beitrag stärker ist.
  if (
    hasSummerFamilySignal(fullText) &&
    !hasExplicitProcessUploadSignal(fullText) &&
    !hasWrongPurchaseSignal(primaryText) &&
    !hasDetailsSignal(primaryText)
  ) {
    return "summer-family-time";
  }
  if (hasWrongPurchaseSignal(fullText)) {
    return "wrong-purchases";
  }

  if (hasDetailsSignal(fullText)) {
    return "details-and-differences";
  }

  if (hasStressSignal(fullText)) {
    return "school-start-stress";
  }

  if (hasUploadSignal(fullText)) {
    return "upload";
  }

  if (hasReliefSignal(fullText)) {
    return "relief-and-efficiency";
  }

  if (hasLocalServiceSignal(fullText)) {
    return "local-service";
  }

  return "general-school-material";
}
function chooseTemplate(post: SocialPostRow, category: TopicCategory) {
  if (category === "summer-family-time") {
    return TEMPLATES["sommer-familienzeit"];
  }

  if (category === "school-start-stress") {
    return TEMPLATES["stress-einkauf"];
  }

  if (category === "wrong-purchases" || category === "details-and-differences") {
    return TEMPLATES["stress-schreibtisch"];
  }

  if (
    category === "upload" ||
    category === "how-it-works" ||
    category === "relief-and-efficiency" ||
    category === "local-service"
  ) {
    return TEMPLATES["erleichtert-loesung"];
  }

  return TEMPLATES["stress-einkauf"];
}
function buildMotifSpecificDirection(category: TopicCategory) {
  switch (category) {
    case "wrong-purchases":
      return `
Create a realistic motif about avoiding wrong school-supply purchases.
Show adult hands or an adult parent comparing a school list with school supplies.
Show wrong or confusing items: wrong notebook size, wrong folder color, duplicate pens, wrong exercise book type, or mismatched materials.
The visual story must be obvious without reading a caption.
`.trim();

    case "school-start-stress":
      return `
Create a realistic motif about school-start stress.
Show too many school supplies, a long list, open backpack, packaging, folders, pens, and visible preparation pressure.
If a person appears, show adults only; stressed, annoyed, or overwhelmed expression is allowed.
No children.
`.trim();

    case "summer-family-time":
      return `
Create a realistic summer holiday motif about relaxed adult family time instead of stressful school-supply shopping.
Show a warm summer scene with adults only: terrace, garden table, lakeside mood, holiday planning, a school supply list placed casually aside, smartphone, calendar, or neatly handled school materials in the background.
The feeling should be calm, relieved, warm, practical, and family-oriented.
No children.
No teenagers.
No visible pupils.
No text.
No logos.
`.trim();
    case "upload":
      return `
Create a realistic motif about uploading or photographing a school supply list.
Show adult hands or an adult parent using a smartphone to photograph or upload a printed list.
The smartphone/list action must be central.
No children.
`.trim();

    case "details-and-differences":
      return `
Create a realistic motif about confusing school-material details.
Show school supplies with clear differences: notebook lineature, A4/A5 sizes, folder colors, covers, exercise books, pens, or envelopes.
Show adult hands sorting or comparing.
No children.
`.trim();

    case "relief-and-efficiency":
      return `
Create a realistic motif about relief, order, and saving time.
Show organized school supplies, a checked list, sorted materials, a packed school bag, or an adult-only calm preparation moment.
The feeling should be relieved and practical, not chaotic.
No children.
`.trim();

    case "how-it-works":
      return `
Create a realistic motif about a simple process from list to organized school materials.
Show printed school list, smartphone, selected supplies, and a clear workflow feeling.
No children.
`.trim();

    case "local-service":
      return `
Create a realistic motif about trustworthy practical support for school-material preparation.
Show adult-only school-list review, sorted supplies, or helpful preparation context.
No children.
`.trim();

    default:
      return `
Create a realistic motif about family school-material preparation.
Show a school supply list and real school materials such as notebooks, folders, pens, pencil case, backpack, smartphone, or packaging.
Adults only if people appear.
No children.
`.trim();
  }
}

function buildMotifPrompt(
  post: SocialPostRow,
  category: TopicCategory,
  template: TemplateConfig
) {
  const basePrompt = sanitizeBaseImagePrompt(cleanString(post.image_prompt));
  const topic = cleanString(post.topic);
  const hook = cleanString(post.hook);
  const caption = cleanString(post.caption);

  const basePromptSection = basePrompt
    ? `
Existing creative direction, cleaned from children/logo/brand instructions:
${basePrompt}
`
    : "";

  return `
${basePromptSection}

Create only the topic-specific MOTIF IMAGE for a modular Handzettel-Schulen.de social-post template.

This motif will be inserted later into a fixed template area. Do NOT create the full social post.
Do NOT add headline areas.
Do NOT add logo areas.
Do NOT add text overlays.
Do NOT add labels, brand names, or watermarks.

Post topic:
"${topic}"

Post hook that the motif must support:
"${hook}"

Caption context:
"${caption}"

Motif direction:
${buildMotifSpecificDirection(category)}

Template insertion context:
${template.motifDirection}

Hard rules:
- Photorealistic, realistic everyday German school-material context.
- Adults only if people are visible.
- No children, no teenagers, no minors.
- No visible brand logos.
- No Handzettel-Schulen.de logo.
- No social-media logos.
- No readable promotional text.
- No poster layout.
- No flyer layout.
- No blank white card.
- No fake logo.
- No cartoon style.
- No pastel scrapbook style.
- No tutoring/homework-help look.
- Strong relation to school supplies, list checking, sorting, buying, upload, or packing.
- Clear, useful, practical, parent-oriented visual story.
- High-quality lighting, believable objects, natural perspective.
`.trim();
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeHook(input: string) {
  return cleanString(input)
    .replace(/â€“/g, " – ")
    .replace(/â€”/g, " – ")
    .replace(/â€‘/g, "-")
    .replace(/â/g, " ")
    .replace(/[–—]/g, " – ")
    .replace(/ß/g, "SS")
    .replace(/ẞ/g, "SS")
    .replace(/Ã¤/g, "ä")
    .replace(/Ã¶/g, "ö")
    .replace(/Ã¼/g, "ü")
    .replace(/Ã„/g, "Ä")
    .replace(/Ã–/g, "Ö")
    .replace(/Ãœ/g, "Ü")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}
function splitHookIntoSentenceParts(input: string) {
  const normalized = normalizeHook(input);

  if (!normalized) return [];

  const parts: string[] = [];
  const rawParts = normalized.match(/[^.!?-]+[.!?]?|-+/g) || [normalized];

  for (const rawPart of rawParts) {
    const part = rawPart.trim();

    if (!part) continue;

    if (part === "-") {
      continue;
    }

    parts.push(part);
  }

  return parts;
}

function wrapSentencePart(
  sentence: string,
  maxCharsPerLine: number,
  remainingLines: number
) {
  const words = sentence.split(" ").filter(Boolean);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;

    if (candidate.length <= maxCharsPerLine) {
      currentLine = candidate;
      continue;
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    currentLine = word;

    if (lines.length >= remainingLines) {
      break;
    }
  }

  if (currentLine && lines.length < remainingLines) {
    lines.push(currentLine);
  }

  return lines;
}

function wrapText(input: string, maxCharsPerLine: number, maxLines: number) {
  const sentenceParts = splitHookIntoSentenceParts(input);

  if (!sentenceParts.length) {
    return ["DEIN", "HOOK"];
  }

  const finalLines: string[] = [];

  for (let index = 0; index < sentenceParts.length; index += 1) {
    const sentence = sentenceParts[index];

    let preparedSentence = sentence;

    const isNotLastSentence = index < sentenceParts.length - 1;

    if (
      isNotLastSentence &&
      !/[.!?]$/.test(preparedSentence)
    ) {
      preparedSentence = `${preparedSentence}!`;
    }

    const remainingLines = maxLines - finalLines.length;

    if (remainingLines <= 0) {
      break;
    }

    const wrapped = wrapSentencePart(
      preparedSentence,
      maxCharsPerLine,
      remainingLines
    );

    finalLines.push(...wrapped);
  }

  return finalLines.slice(0, maxLines);
}
function estimateFontSize(lines: string[], template: TemplateConfig) {
  let fontSize = template.hookFontSize;

  while (fontSize > 34) {
    const longest = Math.max(...lines.map((line) => line.length));
    const estimatedWidth = longest * fontSize * 0.58;
    const estimatedHeight = lines.length * fontSize * 1.08;

    if (
      estimatedWidth <= template.hookBox.width &&
      estimatedHeight <= template.hookBox.height
    ) {
      return fontSize;
    }

    fontSize -= 2;
  }

  return fontSize;
}

function getBitmapGlyph(char: string) {
  const glyphs: Record<string, string[]> = {
    A: ["01110","10001","10001","11111","10001","10001","10001"],
    B: ["11110","10001","10001","11110","10001","10001","11110"],
    C: ["01111","10000","10000","10000","10000","10000","01111"],
    D: ["11110","10001","10001","10001","10001","10001","11110"],
    E: ["11111","10000","10000","11110","10000","10000","11111"],
    F: ["11111","10000","10000","11110","10000","10000","10000"],
    G: ["01111","10000","10000","10011","10001","10001","01111"],
    H: ["10001","10001","10001","11111","10001","10001","10001"],
    I: ["11111","00100","00100","00100","00100","00100","11111"],
    J: ["00111","00010","00010","00010","00010","10010","01100"],
    K: ["10001","10010","10100","11000","10100","10010","10001"],
    L: ["10000","10000","10000","10000","10000","10000","11111"],
    M: ["10001","11011","10101","10101","10001","10001","10001"],
    N: ["10001","11001","10101","10011","10001","10001","10001"],
    O: ["01110","10001","10001","10001","10001","10001","01110"],
    P: ["11110","10001","10001","11110","10000","10000","10000"],
    Q: ["01110","10001","10001","10001","10101","10010","01101"],
    R: ["11110","10001","10001","11110","10100","10010","10001"],
    S: ["01111","10000","10000","01110","00001","00001","11110"],
    T: ["11111","00100","00100","00100","00100","00100","00100"],
    U: ["10001","10001","10001","10001","10001","10001","01110"],
    V: ["10001","10001","10001","10001","10001","01010","00100"],
    W: ["10001","10001","10001","10101","10101","10101","01010"],
    X: ["10001","10001","01010","00100","01010","10001","10001"],
    Y: ["10001","10001","01010","00100","00100","00100","00100"],
    Z: ["11111","00001","00010","00100","01000","10000","11111"],
    "Ä": ["01010","01110","10001","11111","10001","10001","10001"],
    "Ö": ["01010","01110","10001","10001","10001","10001","01110"],
    "Ü": ["01010","10001","10001","10001","10001","10001","01110"],

    "0": ["01110","10001","10011","10101","11001","10001","01110"],
    "1": ["00100","01100","00100","00100","00100","00100","01110"],
    "2": ["01110","10001","00001","00010","00100","01000","11111"],
    "3": ["11110","00001","00001","01110","00001","00001","11110"],
    "4": ["00010","00110","01010","10010","11111","00010","00010"],
    "5": ["11111","10000","10000","11110","00001","00001","11110"],
    "6": ["01110","10000","10000","11110","10001","10001","01110"],
    "7": ["11111","00001","00010","00100","01000","01000","01000"],
    "8": ["01110","10001","10001","01110","10001","10001","01110"],
    "9": ["01110","10001","10001","01111","00001","00001","01110"],

    "-": ["00000","00000","00000","11111","00000","00000","00000"],
    ".": ["00000","00000","00000","00000","00000","01100","01100"],
    "!": ["00100","00100","00100","00100","00100","00000","00100"],
    "?": ["01110","10001","00001","00010","00100","00000","00100"],
    "/": ["00001","00010","00010","00100","01000","01000","10000"],
    "&": ["01100","10010","10100","01000","10101","10010","01101"],
    ":": ["00000","01100","01100","00000","01100","01100","00000"],
    ",": ["00000","00000","00000","00000","00000","01100","01000"],
    ";": ["00000","01100","01100","00000","01100","01100","01000"],
  };

  return glyphs[char] || glyphs["?"];
}

function normalizeBitmapText(value: string) {
  return cleanString(value)
    // kaputte Encoding-Reste zuerst reparieren
    .replace(/Ã¤/g, "ä")
    .replace(/Ã¶/g, "ö")
    .replace(/Ã¼/g, "ü")
    .replace(/Ã„/g, "Ä")
    .replace(/Ã–/g, "Ö")
    .replace(/Ãœ/g, "Ü")
    .replace(/ÃŸ/g, "ß")

    // Sicherheitsnetz für alte gespeicherte Ersatzschreibweisen.
    // Bewusst nur typische Wörter, kein blindes UE/AE/OE-Replacement.
    .replace(/\bkuemmern\b/gi, "kümmern")
    .replace(/\bkuemmer\b/gi, "kümmer")
    .replace(/\bfuer\b/gi, "für")
    .replace(/\bueber\b/gi, "über")
    .replace(/\bkoennen\b/gi, "können")
    .replace(/\bkoennte\b/gi, "könnte")
    .replace(/\bmuessen\b/gi, "müssen")
    .replace(/\bmoeglich\b/gi, "möglich")
    .replace(/\bschoen\b/gi, "schön")
    .replace(/\bzurueck\b/gi, "zurück")

    .toUpperCase()
    .replace(/ẞ/g, "SS")
    .replace(/ß/g, "SS")
    .replace(/[^A-ZÄÖÜ0-9 .!?,;:&:\/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getBitmapLineUnits(line: string) {
  let units = 0;

  for (const char of line) {
    if (char === " ") {
      units += 4;
    } else {
      units += 6;
    }
  }

  return Math.max(1, units - 1);
}

function createHookOverlayBuffer(
  post: SocialPostRow,
  template: TemplateConfig
) {
  const rawLines = wrapText(
    post.hook || post.topic || "Dein Hook",
    template.hookMaxCharsPerLine,
    template.hookMaxLines
  );

  const lines = rawLines
    .map((line) => normalizeBitmapText(line))
    .filter(Boolean);

  const safeLines = lines.length ? lines : ["DEIN HOOK"];

  const glyphHeight = 7;
  const lineGapUnits = 2;
  const maxLineUnits = Math.max(...safeLines.map(getBitmapLineUnits));
  const totalHeightUnits =
    safeLines.length * glyphHeight + (safeLines.length - 1) * lineGapUnits;

  const scale = Math.max(
    2,
    Math.floor(
      Math.min(
        (template.hookBox.width - 64) / maxLineUnits,
        (template.hookBox.height - 42) / totalHeightUnits,
        10
      )
    )
  );

  const blockSize = Math.max(3, Math.round(scale * 0.86));
  const xStart = 20;
  const yStart = Math.round(
    (template.hookBox.height - totalHeightUnits * scale) / 2
  );

  function buildRects(offsetX: number, offsetY: number, fill: string, opacity: number) {
    const rects: string[] = [];
    let cursorY = yStart + offsetY;

    for (const line of safeLines) {
      let cursorX = xStart + offsetX;

      for (const char of line) {
        if (char === " ") {
          cursorX += 4 * scale;
          continue;
        }

        const glyph = getBitmapGlyph(char);

        glyph.forEach((row, rowIndex) => {
          row.split("").forEach((cell, colIndex) => {
            if (cell !== "1") return;

            rects.push(
              `<rect x="${cursorX + colIndex * scale}" y="${cursorY + rowIndex * scale}" width="${blockSize}" height="${blockSize}" rx="${Math.max(
                1,
                Math.round(blockSize * 0.16)
              )}" fill="${fill}" opacity="${opacity}"/>`
            );
          });
        });

        cursorX += 6 * scale;
      }

      cursorY += (glyphHeight + lineGapUnits) * scale;
    }

    return rects.join("\n");
  }

  const shadowRects = buildRects(3, 3, "#001B33", 0.45);
  const mainRects = buildRects(0, 0, template.hookTextColor, 1);

  return Buffer.from(
    `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${template.hookBox.width}" height="${template.hookBox.height}" viewBox="0 0 ${template.hookBox.width} ${template.hookBox.height}" xmlns="http://www.w3.org/2000/svg">
  ${shadowRects}
  ${mainRects}
</svg>`,
    "utf8"
  );
}
async function createRoundedImageBuffer(
  imageBuffer: Buffer,
  box: Box,
  radius: number
) {
  const background = await sharp(imageBuffer)
    .rotate()
    .resize(box.width, box.height, {
      fit: "cover",
      position: "center",
    })
    .blur(18)
    .modulate({
      brightness: 1.06,
      saturation: 0.75,
    })
    .png()
    .toBuffer();

  const fadedBackground = await sharp(background)
    .ensureAlpha(0.22)
    .png()
    .toBuffer();

  const foreground = await sharp(imageBuffer)
    .rotate()
    .resize(box.width - 34, box.height - 34, {
      fit: "contain",
      position: "center",
      background: { r: 255, g: 252, b: 247, alpha: 0 },
    })
    .png()
    .toBuffer();

  const composed = await sharp({
    create: {
      width: box.width,
      height: box.height,
      channels: 4,
      background: { r: 255, g: 252, b: 247, alpha: 1 },
    },
  })
    .composite([
      {
        input: fadedBackground,
        left: 0,
        top: 0,
      },
      {
        input: foreground,
        left: 17,
        top: 17,
      },
    ])
    .png()
    .toBuffer();

  const maskSvg = Buffer.from(`
<svg width="${box.width}" height="${box.height}" viewBox="0 0 ${box.width} ${box.height}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="${box.width}" height="${box.height}" rx="${radius}" ry="${radius}" fill="#fff"/>
</svg>
`);

  return sharp(composed)
    .composite([
      {
        input: maskSvg,
        blend: "dest-in",
      },
    ])
    .png()
    .toBuffer();
}
async function createLogoOverlayBuffer(box: Box) {
  const logoBuffer = await loadBrandLogoBuffer();

  let trimmedLogoBuffer: Buffer;

  try {
    trimmedLogoBuffer = await sharp(logoBuffer, {
      density: 300,
    })
      .rotate()
      .trim({ threshold: 18 })
      .png()
      .toBuffer();
  } catch {
    trimmedLogoBuffer = await sharp(logoBuffer, {
      density: 300,
    })
      .rotate()
      .png()
      .toBuffer();
  }

  return sharp(trimmedLogoBuffer)
    .resize({
      width: box.width,
      height: box.height,
      fit: "inside",
      withoutEnlargement: false,
    })
    .png()
    .toBuffer();
}

async function composeFinalTemplateImage({
  template,
  motifImageBuffer,
  post,
}: {
  template: TemplateConfig;
  motifImageBuffer: Buffer;
  post: SocialPostRow;
}) {
  const templateBuffer = await loadTemplateBuffer(template);

  const motifOverlay = await createRoundedImageBuffer(
    motifImageBuffer,
    template.imageBox,
    template.imageRadius
  );

  const hookOverlay = createHookOverlayBuffer(post, template);
  const logoOverlay = await createLogoOverlayBuffer(template.logoBox);
  const logoMeta = await sharp(logoOverlay).metadata();

  const logoWidth = logoMeta.width || template.logoBox.width;
  const logoHeight = logoMeta.height || template.logoBox.height;

  const logoLeft =
    template.logoBox.x + Math.round((template.logoBox.width - logoWidth) / 2);
  const logoTop =
    template.logoBox.y + Math.round((template.logoBox.height - logoHeight) / 2);

  return sharp(templateBuffer)
    .composite([
      {
        input: motifOverlay,
        left: template.imageBox.x,
        top: template.imageBox.y,
      },
      {
        input: hookOverlay,
        left: template.hookBox.x,
        top: template.hookBox.y,
      },
      {
        input: logoOverlay,
        left: logoLeft,
        top: logoTop,
      },
    ])
    .png()
    .toBuffer();
}

async function generateMotifImage({
  apiKey,
  model,
  prompt,
}: {
  apiKey: string;
  model: string;
  prompt: string;
}) {
  const openAiResponse = await fetch(
    "https://api.openai.com/v1/images/generations",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        prompt,
        size: "1024x1024",
        quality: "low",
        n: 1,
      }),
    }
  );

  const rawText = await openAiResponse.text();

  let openAiJson: OpenAiImageResponse;

  try {
    openAiJson = rawText ? (JSON.parse(rawText) as OpenAiImageResponse) : {};
  } catch {
    throw new Error("OpenAI hat keine gÃ¼ltige JSON-Antwort geliefert.");
  }

  if (!openAiResponse.ok) {
    throw new Error(
      openAiJson.error?.message || "OpenAI konnte das Motivbild nicht erzeugen."
    );
  }

  const imageBase64 = openAiJson.data?.[0]?.b64_json;

  if (!imageBase64) {
    throw new Error("OpenAI hat keine Motiv-Bilddaten geliefert.");
  }

  return {
    motifBuffer: Buffer.from(imageBase64, "base64"),
    revisedPrompt: openAiJson.data?.[0]?.revised_prompt || null,
  };
}

export async function POST(
  request: Request,
  context: { params?: Promise<{ id?: string }> | { id?: string } }
) {
  try {
    const id = await getPostIdFromRequest(request, context);

    if (!id || !isUuid(id)) {
      return NextResponse.json(
        {
          ok: false,
          message: `UngÃ¼ltige Beitrags-ID: ${id || "keine ID empfangen"}`,
        },
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          ok: false,
          message: "OPENAI_API_KEY fehlt in den Umgebungsvariablen.",
        },
        { status: 500 }
      );
    }

    const { data: postData, error: postError } = await supabaseServer
      .from("social_posts")
      .select("id, status, topic, hook, caption, image_prompt, brand_project")
      .eq("id", id)
      .single();

    if (postError || !postData) {
      return NextResponse.json(
        {
          ok: false,
          message: postError?.message || "Social-Beitrag wurde nicht gefunden.",
        },
        { status: 404 }
      );
    }

    const post = postData as SocialPostRow;

    if (post.status === "archived") {
      return NextResponse.json(
        {
          ok: false,
          message: "FÃ¼r archivierte BeitrÃ¤ge wird kein neues Bild erzeugt.",
        },
        { status: 400 }
      );
    }

    const category = detectTopicCategory(post);
    const template = chooseTemplate(post, category);
    const motifPrompt = buildMotifPrompt(post, category, template);
    const model = process.env.OPENAI_MOTIF_IMAGE_MODEL || process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";

    const { motifBuffer, revisedPrompt } = await generateMotifImage({
      apiKey,
      model,
      prompt: motifPrompt,
    });

    const imageBuffer = await composeFinalTemplateImage({
      template,
      motifImageBuffer: motifBuffer,
      post,
    });

    const storagePath = `social-posts/${id}/${Date.now()}-${randomUUID()}.png`;

    const { error: uploadError } = await supabaseServer.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, imageBuffer, {
        contentType: "image/png",
        cacheControl: "31536000",
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json(
        {
          ok: false,
          message: uploadError.message,
        },
        { status: 500 }
      );
    }

    const { data: publicUrlData } = supabaseServer.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(storagePath);

    const publicUrl = publicUrlData.publicUrl || null;

    const { data: assetData, error: assetError } = await supabaseServer
      .from("social_assets")
      .insert({
        post_id: id,
        asset_type: "image",
        provider: "openai-template-composite",
        model,
        prompt: motifPrompt,
        storage_bucket: STORAGE_BUCKET,
        storage_path: storagePath,
        public_url: publicUrl,
        mime_type: "image/png",
        file_size: imageBuffer.byteLength,
        status: "ready",
        metadata: {
          source: "admin_social_generate_image_template_v1",
          generation_mode: "fixed_template_plus_ai_motif",
          openai_model: model,
          openai_size: "1024x1024",
          openai_quality: "low",
          revised_prompt: revisedPrompt,
          topic_category: category,
          template_key: template.key,
          template_label: template.label,
          template_file: template.file,
          canvas_width: CANVAS_WIDTH,
          canvas_height: CANVAS_HEIGHT,
          hook: cleanString(post.hook),
          hook_overlay: {
            enabled: true,
            box: template.hookBox,
            text_color: template.hookTextColor,
            max_lines: template.hookMaxLines,
          },
          motif_overlay: {
            enabled: true,
            box: template.imageBox,
            radius: template.imageRadius,
          },
          logo_overlay: {
            enabled: true,
            logo_path: BRAND_LOGO_RELATIVE_PATH,
            box: template.logoBox,
          },
          safety_adjustment:
            "Template system uses fixed backgrounds. Motif prompt forbids children, logos, brand names, final ad copy and readable promotional text.",
        },
      })
      .select("*")
      .single();

    if (assetError) {
      return NextResponse.json(
        {
          ok: false,
          message: assetError.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message:
        "Template-Bild wurde erzeugt: Master-Template, KI-Motiv, Hook und echtes Logo wurden technisch zusammengesetzt.",
      asset: assetData,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unbekannter Fehler beim Erzeugen des Template-Bildes.";

    return NextResponse.json(
      {
        ok: false,
        message,
      },
      { status: 500 }
    );
  }
}





















