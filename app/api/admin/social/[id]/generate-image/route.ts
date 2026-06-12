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

type BrandVisibility = "subtle" | "balanced" | "strong";

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

type LogoOverlayPlan = {
  brandName: string;
  brandVisibility: BrandVisibility;
  panelWidth: number;
  panelHeight: number;
  panelLeft: number;
  panelTop: number;
  logoMaxWidth: number;
  logoMaxHeight: number;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(
    value
  );
}

function cleanString(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim();
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

async function loadBrandLogoBuffer() {
  const logoPath = getBrandLogoAbsolutePath();

  if (!existsSync(logoPath)) {
    throw new Error(
      `Logo-Datei wurde nicht gefunden: ${BRAND_LOGO_RELATIVE_PATH}. Bitte echtes Logo dort ablegen oder SOCIAL_BRAND_LOGO_PATH setzen.`
    );
  }

  return readFile(logoPath);
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
        "mädchen",
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
        "white card",
        "blank card",
        "blank label",
        "blank white",
        "handzettel-schulen",
      ];

      return !blockedTerms.some((term) => lower.includes(term));
    })
    .join("\n");
}

function detectTopicCategory(post: SocialPostRow) {
  const text =
    `${cleanString(post.topic)} ${cleanString(post.hook)} ${cleanString(
      post.caption
    )}`.toLowerCase();

  if (
    text.includes("fehlkauf") ||
    text.includes("fehlkäufe") ||
    text.includes("falsch gekauft") ||
    text.includes("doppelt") ||
    text.includes("unnötig gekauft") ||
    text.includes("falsche artikel")
  ) {
    return "wrong-purchases";
  }

  if (
    text.includes("stress") ||
    text.includes("schulstart") ||
    text.includes("chaos") ||
    text.includes("zeitdruck") ||
    text.includes("überfordert")
  ) {
    return "school-start-stress";
  }

  if (
    text.includes("upload") ||
    text.includes("hochladen") ||
    text.includes("foto") ||
    text.includes("liste fotografieren") ||
    text.includes("noch keine bestellung")
  ) {
    return "upload";
  }

  if (
    text.includes("lineatur") ||
    text.includes("format") ||
    text.includes("farbe") ||
    text.includes("a4") ||
    text.includes("a5") ||
    text.includes("umschlag") ||
    text.includes("heft")
  ) {
    return "details-and-differences";
  }

  if (
    text.includes("zeit sparen") ||
    text.includes("entlastung") ||
    text.includes("weniger stress") ||
    text.includes("einfacher") ||
    text.includes("übersicht")
  ) {
    return "relief-and-efficiency";
  }

  if (
    text.includes("funktioniert") ||
    text.includes("so geht") ||
    text.includes("ablauf") ||
    text.includes("paketwunsch")
  ) {
    return "how-it-works";
  }

  if (
    text.includes("lokal") ||
    text.includes("service") ||
    text.includes("vertrauen") ||
    text.includes("nah") ||
    text.includes("vertraut")
  ) {
    return "local-service";
  }

  return "general-school-material";
}

function detectBrandVisibility(
  post: SocialPostRow,
  category: string
): BrandVisibility {
  const text =
    `${cleanString(post.topic)} ${cleanString(post.hook)} ${cleanString(
      post.caption
    )}`.toLowerCase();

  if (
    text.includes("lade") ||
    text.includes("hochladen") ||
    text.includes("upload") ||
    text.includes("paketwunsch") ||
    text.includes("teste") ||
    text.includes("service") ||
    text.includes("lokal") ||
    text.includes("so funktioniert") ||
    text.includes("so geht") ||
    text.includes("angebot") ||
    text.includes("bestellung")
  ) {
    return "strong";
  }

  if (
    category === "upload" ||
    category === "how-it-works" ||
    category === "local-service" ||
    category === "relief-and-efficiency"
  ) {
    return "strong";
  }

  if (
    category === "wrong-purchases" ||
    category === "school-start-stress" ||
    category === "general-school-material"
  ) {
    return "balanced";
  }

  return "balanced";
}

function buildBrandingDirection(post: SocialPostRow, category: string) {
  const brandName = getBrandName(post);
  const visibility = detectBrandVisibility(post, category);

  const visualPlacement = pickVariant(post.id + "-brand-panel", [
    "a calm, uncluttered lower-left area with natural table surface, suitable for a real logo overlay added later",
    "a clean lower-third area with simple school materials around it, suitable for a real logo overlay added later",
    "a quiet lower-left composition area with enough negative space for a real logo badge added later",
    "a realistic lower-third area on the table with no text, no labels and no blank white cards",
    "a clean but natural lower area of the image with enough visual breathing room for a later logo overlay",
  ]);

  const visibilityText =
    visibility === "strong"
      ? `
- Logo overlay area visibility: strong but professional.
- Leave a clearly usable lower-third area for the application to add the real logo later.
- Do not create a physical blank card, blank label, empty white rectangle, package insert or sticker for the logo.
`
      : visibility === "subtle"
        ? `
- Logo overlay area visibility: subtle.
- Leave only a tasteful amount of calm visual space for the application to add the real logo later.
- Do not create a physical blank card, blank label, empty white rectangle, package insert or sticker for the logo.
`
        : `
- Logo overlay area visibility: balanced.
- Leave a clean but natural lower-third area for the application to add the real logo later.
- Do not create a physical blank card, blank label, empty white rectangle, package insert or sticker for the logo.
`;

  return {
    visibility,
    visualPlacement,
    prompt: `
Branding overlay requirement:
- The real "${brandName}" logo will be added later by the application as a technical overlay.
- Do NOT invent, draw, imitate, or render the "${brandName}" logo.
- Do NOT create fake logo text.
- Do NOT write "${brandName}" into the AI-generated image.
- Do NOT create a separate blank white label, blank white card, blank package insert, blank sticker, empty white rectangle, or empty branding panel inside the generated image.
- Instead, leave natural negative space where the application can place the real logo overlay.
- Use this exact composition idea: ${visualPlacement}.
${visibilityText}
- The lower part of the image should stay visually calm enough for a logo badge overlay.
- The scene must still look realistic and complete, not like something is missing.
- Keep the scene realistic, family-friendly, warm, and practical.
- Do not use third-party brand logos.
- Do not use competitor logos.
- Do not use TikTok, Instagram or Facebook logos.
- Avoid random readable text.
`.trim(),
  };
}

function buildCompositionDirection(post: SocialPostRow) {
  return pickVariant(post.id + "-composition", [
    `
- Composition style: slightly top-down storytelling shot.
- The situation and objects must be very readable at first glance.
- Show enough of the scene so the practical problem is obvious.
`,
    `
- Composition style: over-the-shoulder view with strong focus on the main problem.
- The hook meaning should be obvious through the action and visible objects.
`,
    `
- Composition style: medium-wide documentary scene.
- Show the adult person, the surrounding context, and the material problem clearly.
`,
    `
- Composition style: close practical storytelling crop.
- Focus strongly on adult hands, list, materials, and the specific action that expresses the hook.
`,
    `
- Composition style: environmental storytelling image.
- Use the space and object layout to make the situation obvious before reading any text.
`,
  ]).trim();
}

function buildSettingDirection(post: SocialPostRow, category: string) {
  const generalSettings = [
    "a kitchen island during family school-supply preparation",
    "a dining table with school materials spread out",
    "a living room floor with opened backpacks and supplies, without visible people",
    "a home workspace with school items laid out for sorting",
    "a hallway or entry area with backpacks, papers and shopping bags",
    "a cozy family workspace at home with school materials and a printed list",
  ];

  const stressSettings = [
    "a cluttered dining table full of school supplies and lists",
    "a hallway floor with open backpacks, shoes, papers and school materials",
    "a home workspace with scattered notebooks, folders and supplies",
    "a kitchen island with too many materials, shopping bags and a long checklist",
    "a living room scene with visible school-preparation chaos and time pressure",
  ];

  const wrongPurchaseSettings = [
    "a dining table where wrong and correct school materials are being compared",
    "a family workspace with duplicate or mismatched school supplies on display",
    "a kitchen table with a printed school list and clearly unsuitable materials nearby",
    "a school-supply sorting scene at home with visible comparison between list and purchased items",
  ];

  const uploadSettings = [
    "a home setting where an adult parent photographs a school list with a smartphone",
    "a kitchen table where an adult parent reviews and uploads a printed material list",
    "a hallway bench or family workspace where the school list is being photographed",
    "a practical school-preparation corner at home with smartphone and list in focus",
  ];

  const detailsSettings = [
    "a home sorting scene with multiple exercise books, folders and colored covers laid out clearly",
    "a practical comparison setup with visible differences between A4 and A5 materials",
    "a family workspace focused on comparing notebook types, colors and school covers",
    "a well-lit preparation scene where material details are checked carefully",
  ];

  const reliefSettings = [
    "a tidy and organized school-preparation scene at home",
    "a calm family workspace with sorted materials and a clear list",
    "a neat dining table with already organized school items and checklist",
    "a relaxed preparation scene with visible order and overview",
  ];

  const processSettings = [
    "a home process scene with list, smartphone and selected materials",
    "a practical family setup showing list review and organized school materials",
    "a clean preparation environment suggesting step-by-step school list handling",
    "a believable school-preparation scene focused on the workflow from list to materials",
  ];

  const localServiceSettings = [
    "a warm and believable family home setting focused on school-material support",
    "a realistic everyday family school-preparation environment",
    "a personal, trustworthy home scene with school list review and sorted materials",
    "a supportive family setting centered around school-material organization",
  ];

  switch (category) {
    case "school-start-stress":
      return pickVariant(post.id + "-setting", stressSettings);
    case "wrong-purchases":
      return pickVariant(post.id + "-setting", wrongPurchaseSettings);
    case "upload":
      return pickVariant(post.id + "-setting", uploadSettings);
    case "details-and-differences":
      return pickVariant(post.id + "-setting", detailsSettings);
    case "relief-and-efficiency":
      return pickVariant(post.id + "-setting", reliefSettings);
    case "how-it-works":
      return pickVariant(post.id + "-setting", processSettings);
    case "local-service":
      return pickVariant(post.id + "-setting", localServiceSettings);
    default:
      return pickVariant(post.id + "-setting", generalSettings);
  }
}

function buildHookSpecificDirection(category: string) {
  switch (category) {
    case "wrong-purchases":
      return `
- Core scene type: avoiding wrong school-supply purchases.
- Show an adult parent checking a school supply list against already bought materials.
- Include clearly wrong, duplicate, or unsuitable items, such as wrong notebook size, wrong folder color, duplicate pens, or the wrong exercise book type.
- The difference between suitable and unsuitable materials should be obvious.
- The adult parent should actively compare items or point out the mismatch.
- The emotional message should be: "Without clarity, families easily buy the wrong school materials."
- The image must visually express the mistake problem, not just a general school-preparation scene.
- Important: do not make this look like homework help.
`.trim();

    case "school-start-stress":
      return `
- Core scene type: stress before school starts.
- The image must clearly communicate pressure, overload or time stress.
- Show too many school items at once: open backpack, folders, notebooks, pens, packaging, paper list, maybe shopping bags or a second pile of supplies.
- If a person appears, show only an adult parent who looks visibly overwhelmed, worried, concentrated or under pressure.
- Use object clutter, unfinished packing or visible checking pressure to communicate stress.
- A clock, watch, or late preparation mood may help if subtle.
- The emotional message should be: "School start creates stress and families need help getting control."
- The scene should feel clearly more hectic than calm.
- Important: do not make this look like homework help.
`.trim();

    case "upload":
      return `
- Core scene type: uploading or photographing the school supply list.
- Show an adult parent clearly using a smartphone to photograph, review or upload the printed list.
- The smartphone action must be central in the story.
- Nearby school materials may be visible, but the key message is the upload/check step.
- The scene should not feel like shopping, ordering or checkout.
- The emotional message should be: "It starts with uploading the list, not with an immediate order."
- Important: do not make this look like homework help.
`.trim();

    case "details-and-differences":
      return `
- Core scene type: understanding confusing material details.
- Show school materials with clearly visible differences: notebook types, lineatures, sizes, colors, folders or covers.
- Show adult hands or an adult parent actively comparing or sorting the materials while using the list as reference.
- The scene should communicate that these little details are easy to misunderstand.
- The emotional message should be: "Families often need orientation because school materials differ in important details."
- Important: do not make this look like tutoring or homework.
`.trim();

    case "relief-and-efficiency":
      return `
- Core scene type: saving time and reducing family stress.
- Show a noticeably more structured, sorted, or calmer preparation moment.
- The materials should look organized or nearly finished.
- If a person appears, show only an adult parent looking relieved, focused or satisfied rather than chaotic.
- The emotional message should be: "This makes school preparation easier, faster and less stressful."
- Important: do not make this look like homework help.
`.trim();

    case "how-it-works":
      return `
- Core scene type: explaining the process visually.
- Show a practical sequence-like situation: printed school list, smartphone in use, selected school materials, visible order or preparation.
- The composition should suggest a simple process from list to overview.
- The emotional message should be: "The process is easy to understand and practical."
- Important: do not make this look like homework help.
`.trim();

    case "local-service":
      return `
- Core scene type: warm, trustworthy support for families.
- Show a believable school-material preparation scene with a strong feeling of trust and practical support.
- The support feeling should be more important than perfect styling.
- The focus must still stay on school-material checking, list review or preparation.
- The emotional message should be: "Families receive supportive, trustworthy help."
- Important: do not make this look like homework help.
`.trim();

    default:
      return `
- Core scene type: family school-material preparation.
- Show an adult parent or adult hands dealing with a school supply list and real materials.
- The list and materials must be central.
- The emotional message should be: "Families are getting orientation and help for school preparation."
- Important: do not make this look like homework help.
`.trim();
  }
}

function buildActionDirection(post: SocialPostRow) {
  return pickVariant(post.id + "-action", [
    `
- Main action: an adult parent points at the school list while comparing listed items with real materials.
- Show active checking and comparison, not passive posing.
`,
    `
- Main action: an adult parent sorts materials into "correct" and "unclear/wrong" groups.
- The visual logic of the action should be easy to understand.
`,
    `
- Main action: adult hands hold or check the list while organizing school items.
- The scene must feel active and purposeful.
`,
    `
- Main action: an adult parent compares materials with the list.
- Make the practical problem more important than the portrait feeling.
`,
    `
- Main action: an adult parent is in the middle of preparation, reviewing materials, packing, checking or photographing.
- Show a real task, not a generic family moment.
`,
  ]).trim();
}

function buildOverlayPlan(
  imageWidth: number,
  imageHeight: number,
  brandName: string,
  brandVisibility: BrandVisibility
): LogoOverlayPlan {
  const panelWidth =
    brandVisibility === "strong"
      ? Math.round(imageWidth * 0.72)
      : Math.round(imageWidth * 0.64);

  const panelHeight =
    brandVisibility === "strong"
      ? Math.round(imageHeight * 0.13)
      : Math.round(imageHeight * 0.115);

  const margin = Math.round(imageWidth * 0.055);

  return {
    brandName,
    brandVisibility,
    panelWidth,
    panelHeight,
    panelLeft: margin,
    panelTop: imageHeight - panelHeight - margin,
    logoMaxWidth: Math.round(panelWidth * 0.9),
    logoMaxHeight: Math.round(panelHeight * 0.78),
  };
}

async function createLogoOverlaySvg(plan: LogoOverlayPlan) {
  const logoBuffer = await loadBrandLogoBuffer();

  let trimmedLogoBuffer: Buffer;

  try {
    trimmedLogoBuffer = await sharp(logoBuffer, {
      density: 300,
    })
      .rotate()
      .trim({ threshold: 16 })
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

  const logoPng = await sharp(trimmedLogoBuffer)
    .resize({
      width: plan.logoMaxWidth,
      height: plan.logoMaxHeight,
      fit: "inside",
      withoutEnlargement: false,
    })
    .png()
    .toBuffer();

  const logoBase64 = logoPng.toString("base64");

  const logoMeta = await sharp(logoPng).metadata();
  const logoWidth = logoMeta.width || plan.logoMaxWidth;
  const logoHeight = logoMeta.height || plan.logoMaxHeight;

  const logoX = Math.round((plan.panelWidth - logoWidth) / 2);
  const logoY = Math.round((plan.panelHeight - logoHeight) / 2);

  return Buffer.from(`
<svg width="${plan.panelWidth}" height="${plan.panelHeight}" viewBox="0 0 ${plan.panelWidth} ${plan.panelHeight}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="rgba(0,0,0,0.18)"/>
    </filter>
  </defs>

  <rect
    x="0"
    y="0"
    width="${plan.panelWidth}"
    height="${plan.panelHeight}"
    rx="${Math.round(plan.panelHeight * 0.24)}"
    fill="rgba(255,255,255,0.94)"
    filter="url(#shadow)"
  />

  <rect
    x="1"
    y="1"
    width="${plan.panelWidth - 2}"
    height="${plan.panelHeight - 2}"
    rx="${Math.round(plan.panelHeight * 0.24)}"
    fill="none"
    stroke="rgba(16,42,67,0.12)"
    stroke-width="2"
  />

  <image
    href="data:image/png;base64,${logoBase64}"
    x="${logoX}"
    y="${logoY}"
    width="${logoWidth}"
    height="${logoHeight}"
    preserveAspectRatio="xMidYMid meet"
  />
</svg>
`);
}

async function applyLogoOverlay(
  imageBuffer: Buffer,
  brandName: string,
  brandVisibility: BrandVisibility
) {
  const image = sharp(imageBuffer);
  const metadata = await image.metadata();

  const width = metadata.width || 1024;
  const height = metadata.height || 1536;

  const overlayPlan = buildOverlayPlan(
    width,
    height,
    brandName,
    brandVisibility
  );
  const overlaySvg = await createLogoOverlaySvg(overlayPlan);

  const finalBuffer = await sharp(imageBuffer)
    .composite([
      {
        input: overlaySvg,
        left: overlayPlan.panelLeft,
        top: overlayPlan.panelTop,
      },
    ])
    .png()
    .toBuffer();

  return {
    finalBuffer,
    overlayPlan,
  };
}

function buildImagePlan(post: SocialPostRow) {
  const basePrompt = sanitizeBaseImagePrompt(cleanString(post.image_prompt));
  const topic = cleanString(post.topic);
  const hook = cleanString(post.hook);
  const caption = cleanString(post.caption);

  const topicCategory = detectTopicCategory(post);
  const chosenSetting = buildSettingDirection(post, topicCategory);
  const compositionDirection = buildCompositionDirection(post);
  const hookSpecificDirection = buildHookSpecificDirection(topicCategory);
  const actionDirection = buildActionDirection(post);
  const brandingDirection = buildBrandingDirection(post, topicCategory);
  const brandName = getBrandName(post);

  const basePromptSection = basePrompt
    ? `
Original creative direction after safety and branding cleanup:
${basePrompt}
`
    : "";

  const finalPrompt = `
${basePromptSection}

Important social-media context:
The image must visually support this exact hook:
"${hook}"

Topic:
"${topic}"

Caption context:
"${caption}"

Very important:
The image must not be a generic school-supply scene.
The image must clearly express the message, tension, or practical problem of the hook.
The setting does NOT have to be a kitchen table or a calm home desk.
The setting may change if another environment communicates the hook better.
Message and scene clarity are more important than a fixed environment.

Scene setting:
- Use this as the main environment direction: ${chosenSetting}

${hookSpecificDirection}

${compositionDirection}

${actionDirection}

${brandingDirection.prompt}

Additional fixed production requirements:
- Vertical portrait social media image.
- Format optimized for TikTok, Instagram Reels and Facebook stories.
- The image should primarily appeal to parents and families preparing school supplies.
- The image should feel realistic, practical and emotionally believable.
- If people appear, show adults only.
- It is also acceptable to show only adult hands, school materials, packages, lists and smartphone actions without faces.
- Show school-related objects that fit the hook: school supply list, notebooks, folders, pens, pencil case, backpack, paper notes, smartphone, shopping bags, packaging, or sorted material piles when appropriate.
- The action must focus on school-material organization, checking, comparing, sorting, photographing the list, packing for school, or preparing for school start.
- Avoid scenes where the main story is someone writing in a notebook.
- Avoid the impression of tutoring, learning support, homework help or private lesson.
- The visual story must feel strongly related to the specific post theme.
- Emotion should feel relatable, supportive, realistic and useful.
- Natural light or realistic everyday lighting.
- Warm, high-quality, emotionally authentic look.
- No corporate office feeling.
- Not business-like.
- Avoid sterile office scenes, startup aesthetics, or generic business stock photo style.
- Do not include third-party brand logos or competitor logos.
- Do not include TikTok, Instagram or Facebook logos.
- Avoid strong readable text.
- Do not create artificial blank white cards, blank labels, empty sticker fields or empty branding rectangles inside the scene.
- Leave natural lower-third negative space for the logo overlay, but the image must still look complete without it.
- No exaggerated advertising style.
`.trim();

  return {
    finalPrompt,
    topicCategory,
    chosenSetting,
    brandVisibility: brandingDirection.visibility,
    brandPlacement: brandingDirection.visualPlacement,
    brandName,
  };
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    if (!id || !isUuid(id)) {
      return NextResponse.json(
        {
          ok: false,
          message: "Ungültige Beitrags-ID.",
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

    if (!cleanString(post.image_prompt)) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Für diesen Beitrag ist noch kein Bild-Prompt hinterlegt. Bitte zuerst den Bild-Prompt bearbeiten und speichern.",
        },
        { status: 400 }
      );
    }

    if (post.status === "archived") {
      return NextResponse.json(
        {
          ok: false,
          message: "Für archivierte Beiträge wird kein neues Bild erzeugt.",
        },
        { status: 400 }
      );
    }

    const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";
    const imagePlan = buildImagePlan(post);

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
          prompt: imagePlan.finalPrompt,
          size: "1024x1536",
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
      return NextResponse.json(
        {
          ok: false,
          message: "OpenAI hat keine gültige JSON-Antwort geliefert.",
        },
        { status: 500 }
      );
    }

    if (!openAiResponse.ok) {
      return NextResponse.json(
        {
          ok: false,
          message:
            openAiJson.error?.message ||
            "OpenAI konnte das Bild nicht erzeugen.",
          openai_error_type: openAiJson.error?.type || null,
        },
        { status: 500 }
      );
    }

    const imageBase64 = openAiJson.data?.[0]?.b64_json;

    if (!imageBase64) {
      return NextResponse.json(
        {
          ok: false,
          message: "OpenAI hat keine Bilddaten geliefert.",
        },
        { status: 500 }
      );
    }

    const rawImageBuffer = Buffer.from(imageBase64, "base64");

    const { finalBuffer: imageBuffer, overlayPlan } = await applyLogoOverlay(
      rawImageBuffer,
      imagePlan.brandName,
      imagePlan.brandVisibility
    );

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
        provider: "openai",
        model,
        prompt: imagePlan.finalPrompt,
        storage_bucket: STORAGE_BUCKET,
        storage_path: storagePath,
        public_url: publicUrl,
        mime_type: "image/png",
        file_size: imageBuffer.byteLength,
        status: "ready",
        metadata: {
          source: "admin_social_generate_image",
          openai_model: model,
          openai_size: "1024x1536",
          openai_quality: "low",
          revised_prompt: openAiJson.data?.[0]?.revised_prompt || null,
          topic_category: imagePlan.topicCategory,
          chosen_setting: imagePlan.chosenSetting,
          brand_required: true,
          brand_name: imagePlan.brandName,
          brand_visibility: imagePlan.brandVisibility,
          brand_placement: imagePlan.brandPlacement,
          prompt_cleanup:
            "Existing prompt was cleaned from logo, blank card and visible young-person instructions before generation.",
          safety_adjustment:
            "Prompt focuses on adults, hands, materials, lists, packages and smartphone actions.",
          logo_overlay: {
            enabled: true,
            logo_path: BRAND_LOGO_RELATIVE_PATH,
            panel_width: overlayPlan.panelWidth,
            panel_height: overlayPlan.panelHeight,
            panel_left: overlayPlan.panelLeft,
            panel_top: overlayPlan.panelTop,
            logo_max_width: overlayPlan.logoMaxWidth,
            logo_max_height: overlayPlan.logoMaxHeight,
          },
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
      message: "Bild wurde erzeugt, mit echtem Logo versehen und gespeichert.",
      asset: assetData,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unbekannter Fehler beim Erzeugen des Bildes.";

    return NextResponse.json(
      {
        ok: false,
        message,
      },
      { status: 500 }
    );
  }
}