import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

const STORAGE_BUCKET = "social-assets";

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

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
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

function detectTopicCategory(post: SocialPostRow) {
  const text =
    `${cleanString(post.topic)} ${cleanString(post.hook)} ${cleanString(post.caption)}`.toLowerCase();

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
    `${cleanString(post.topic)} ${cleanString(post.hook)} ${cleanString(post.caption)}`.toLowerCase();

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

  const placement = pickVariant(post.id + "-brand-placement", [
    `a small branded checklist card on the table showing the ${brandName} logo or readable brand name`,
    `a school-supply package insert with the ${brandName} logo or readable brand name`,
    `a realistic branded sticker or label on a school-material package showing ${brandName}`,
    `a subtle branded website card on a smartphone or tablet screen showing ${brandName}`,
    `a small desk sign or family-friendly information card with the ${brandName} logo or readable brand name`,
    `a branded paper flyer next to the school supply list showing ${brandName}`,
    `a discreet lower information panel with the ${brandName} logo or readable brand name`,
    `a branded shopping bag or material bag in the scene showing ${brandName}`,
  ]);

  const visibilityText =
    visibility === "strong"
      ? `
- Branding visibility: strong but professional.
- Make the ${brandName} branding clearly recognizable and intentionally part of the composition.
- The logo or readable brand name should be easy to notice without overpowering the people or story.
`
      : visibility === "subtle"
        ? `
- Branding visibility: subtle.
- The ${brandName} branding should be visible but not dominant.
- Integrate it tastefully in a small realistic object.
`
        : `
- Branding visibility: balanced.
- The ${brandName} branding should be clearly visible and readable if possible, but still natural.
- It should support trust and recognition without making the image look like a cheap advertisement.
`;

  return {
    visibility,
    placement,
    prompt: `
Branding requirement:
- Include visible, natural branding for "${brandName}".
- Use this specific brand placement direction: ${placement}.
${visibilityText}
- The branding must feel realistic, professional, family-friendly and integrated into the scene.
- The image should still primarily tell the story of the post hook.
- Do not use third-party brand logos.
- Do not use competitor logos.
- Do not use TikTok, Instagram or Facebook logos.
- Avoid random readable text.
- If readable text appears, it should preferably only be the brand name "${brandName}".
- The brand/logo element must not look pasted on afterwards.
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
- Show the people, the surrounding context, and the material problem clearly.
`,
    `
- Composition style: close practical storytelling crop.
- Focus strongly on hands, list, materials, and the specific action that expresses the hook.
`,
    `
- Composition style: environmental storytelling image.
- Use the space and object layout to make the situation obvious before reading any text.
`,
  ]).trim();
}

function buildSettingDirection(post: SocialPostRow, category: string) {
  const generalSettings = [
    "a kitchen island during family school preparation",
    "a dining table with school materials spread out",
    "a living room floor with opened school bags and supplies",
    "a child's room with school items laid out for sorting",
    "a hallway or entry area with backpacks, papers and shopping bags",
    "a cozy family workspace at home",
  ];

  const stressSettings = [
    "a cluttered dining table full of school supplies and lists",
    "a hallway floor with open backpacks, shoes, papers and school materials",
    "a child's room floor with scattered notebooks, folders and supplies",
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
    "a home setting where a parent photographs a school list with a smartphone",
    "a kitchen table where a parent reviews and uploads a printed material list",
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
    "a personal, trustworthy home scene with parent-child school list review",
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
- Show a parent and child checking a school supply list against already bought materials.
- Include clearly wrong, duplicate, or unsuitable items, such as wrong notebook size, wrong folder color, duplicate pens, or the wrong exercise book type.
- The difference between suitable and unsuitable materials should be obvious.
- The parent should actively compare items or point out the mismatch.
- The emotional message should be: "Without clarity, families easily buy the wrong school materials."
- The image must visually express the mistake problem, not just a general school-preparation scene.
- Important: do not make this look like homework help.
`.trim();

    case "school-start-stress":
      return `
- Core scene type: stress before school starts.
- The image must clearly communicate pressure, overload or time stress.
- Show too many school items at once: open backpack, folders, notebooks, pens, packaging, paper list, maybe shopping bags or a second pile of supplies.
- The parent should look visibly overwhelmed, worried, concentrated or under pressure.
- The child may also look uncertain, waiting, or involved in the hectic preparation.
- Use object clutter, unfinished packing or visible checking pressure to communicate stress.
- A clock, watch, or "late preparation" mood may help if subtle.
- The emotional message should be: "School start creates stress and families need help getting control."
- The scene should feel clearly more hectic than calm.
- Important: do not make this look like homework help.
`.trim();

    case "upload":
      return `
- Core scene type: uploading or photographing the school supply list.
- Show a parent clearly using a smartphone to photograph, review or upload the printed list.
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
- The parent and child should actively compare or sort the materials while using the list as reference.
- The scene should communicate that these little details are easy to misunderstand.
- The emotional message should be: "Parents often need orientation because school materials differ in important details."
- Important: do not make this look like tutoring or homework.
`.trim();

    case "relief-and-efficiency":
      return `
- Core scene type: saving time and reducing family stress.
- Show a noticeably more structured, sorted, or calmer preparation moment.
- The materials should look organized or nearly finished.
- The people should look relieved, focused or satisfied rather than chaotic.
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
- Show a believable parent-child school-material preparation scene with strong emotional trust.
- The support feeling should be more important than perfect styling.
- The focus must still stay on school-material checking, list review or preparation.
- The emotional message should be: "Families receive supportive, trustworthy help."
- Important: do not make this look like homework help.
`.trim();

    default:
      return `
- Core scene type: family school-material preparation.
- Show a parent and child dealing with a school supply list and real materials.
- The list and materials must be central, not just the people.
- The emotional message should be: "Parents are getting orientation and help for school preparation."
- Important: do not make this look like homework help.
`.trim();
  }
}

function buildActionDirection(post: SocialPostRow) {
  return pickVariant(post.id + "-action", [
    `
- Main action: the parent points at the school list while the child looks at the listed items.
- Show active checking and comparison, not passive posing.
`,
    `
- Main action: the parent sorts materials into "correct" and "unclear/wrong" groups.
- The visual logic of the action should be easy to understand.
`,
    `
- Main action: the parent holds or checks the list while the child helps organize or move school items.
- The scene must feel active and purposeful.
`,
    `
- Main action: the parent compares materials with the list while the child watches or assists.
- Make the practical problem more important than the portrait feeling.
`,
    `
- Main action: the parent is in the middle of preparation, reviewing materials, packing, checking or photographing.
- Show a real task, not a generic family moment.
`,
  ]).trim();
}

function buildImagePlan(post: SocialPostRow) {
  const basePrompt = cleanString(post.image_prompt);
  const topic = cleanString(post.topic);
  const hook = cleanString(post.hook);
  const caption = cleanString(post.caption);

  const topicCategory = detectTopicCategory(post);
  const chosenSetting = buildSettingDirection(post, topicCategory);
  const compositionDirection = buildCompositionDirection(post);
  const hookSpecificDirection = buildHookSpecificDirection(topicCategory);
  const actionDirection = buildActionDirection(post);
  const brandingDirection = buildBrandingDirection(post, topicCategory);

  const finalPrompt = `
${basePrompt}

Important social-media context:
The image must visually support this exact hook:
"${hook}"

Topic:
"${topic}"

Caption context:
"${caption}"

Very important:
The image must not be a generic family-school scene.
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
- The image should primarily appeal to parents with school-age children.
- The image should feel realistic, practical and emotionally believable.
- Show a parent with one school-age child or a believable parent-child school-preparation situation.
- Show school-related objects that fit the hook: school supply list, notebooks, folders, pens, pencil case, backpack, paper notes, smartphone, shopping bags, packaging, or sorted material piles when appropriate.
- The action must focus on school-material organization, checking, comparing, sorting, photographing the list, packing for school, or preparing for school start.
- Avoid scenes where the child is simply doing homework or writing in a notebook as the main story.
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
- Avoid strong readable text except the intended brand name/logo placement.
- Leave some clean negative space for later overlay text when possible.
- No exaggerated advertising style.
`.trim();

  return {
    finalPrompt,
    topicCategory,
    chosenSetting,
    brandVisibility: brandingDirection.visibility,
    brandPlacement: brandingDirection.placement,
    brandName: getBrandName(post),
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

    const imageBuffer = Buffer.from(imageBase64, "base64");
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
      message: "Bild wurde erzeugt und gespeichert.",
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