import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

const STORAGE_BUCKET = "social-assets";

type SocialPostRow = {
  id: string;
  status: string;
  topic: string;
  hook: string;
  caption: string;
  image_prompt: string | null;
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
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function pickVariant<T>(input: string, variants: T[]) {
  const number = createDeterministicNumber(input);
  return variants[number % variants.length];
}

function detectTopicCategory(post: SocialPostRow) {
  const text = `${cleanString(post.topic)} ${cleanString(post.hook)} ${cleanString(
    post.caption
  )}`.toLowerCase();

  if (
    text.includes("fehlkauf") ||
    text.includes("fehlkäufe") ||
    text.includes("falsche") ||
    text.includes("doppelt") ||
    text.includes("falsch gekauft")
  ) {
    return "wrong-purchases";
  }

  if (
    text.includes("stress") ||
    text.includes("schulstart") ||
    text.includes("chaos") ||
    text.includes("zeitdruck")
  ) {
    return "school-start-stress";
  }

  if (
    text.includes("upload") ||
    text.includes("hochladen") ||
    text.includes("foto") ||
    text.includes("liste fotografieren")
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
    text.includes("einfacher")
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
    text.includes("nah")
  ) {
    return "local-service";
  }

  return "general-school-material";
}

function buildCompositionDirection(post: SocialPostRow) {
  return pickVariant(post.id, [
    `
- Composition style: medium shot from the side.
- Show parent and child at a table with clear focus on the materials and the list.
- Scene should feel natural and documentary, not staged.
`,
    `
- Composition style: over-the-shoulder view.
- Focus on the school supply list and the objects on the table.
- The parent is actively checking items against the list.
`,
    `
- Composition style: slightly top-down angle.
- Show the table surface clearly with materials, list, smartphone, folders and notebooks.
- The action should feel practical and organized around the task.
`,
    `
- Composition style: closer, more intimate crop.
- Focus on hands, list, school materials and facial expressions of concentration or relief.
- The image should still clearly show the situation, not just a portrait.
`,
    `
- Composition style: wider home scene.
- Show more environment around the table, school bag, materials and preparation mood.
- The story should read instantly as school material preparation at home.
`,
  ]).trim();
}

function buildHookSpecificDirection(post: SocialPostRow) {
  const category = detectTopicCategory(post);

  switch (category) {
    case "wrong-purchases":
      return `
- Core scene type: avoiding wrong school-supply purchases.
- Show a parent and child comparing a school supply list with several school materials on the table.
- Include visible mismatches or duplicate items, for example wrong notebook size, wrong colors, duplicate pens, or unsuitable exercise books.
- The image should communicate uncertainty turning into clarity.
- The emotional message should be: "We want to avoid buying the wrong things."
- Important: do not make this look like homework time.
`.trim();

    case "school-start-stress":
      return `
- Core scene type: stress before school starts.
- Show a realistic but relatable amount of school materials spread across the table.
- Include a school bag, notebooks, folders, pens, checklist, and a parent trying to get overview together with the child.
- The mood should show slight pressure or overwhelm, but still feel warm and hopeful.
- The emotional message should be: "School start creates stress, and families need orientation."
- Important: the focus is preparation chaos, not homework help.
`.trim();

    case "upload":
      return `
- Core scene type: uploading or photographing the school supply list.
- Show a parent using a smartphone to photograph or review a printed school list.
- The child can be present and interested, but the main action is about capturing or checking the list.
- Include school materials nearby so the scene feels practical and relevant.
- The emotional message should be: "This starts with the school list upload, not with shopping."
- Avoid checkout or buying scenes.
- Important: do not make this look like homework help.
`.trim();

    case "details-and-differences":
      return `
- Core scene type: understanding details like lineature, format and color.
- Show a parent and child comparing different exercise books, folders or covers.
- Differences between materials should be visually obvious: different colors, sizes, or notebook types.
- The list should be part of the checking process.
- The emotional message should be: "These small details are confusing, so parents need clarity."
- Important: do not make this look like tutoring or homework.
`.trim();

    case "relief-and-efficiency":
      return `
- Core scene type: saving time and reducing stress.
- Show a parent and child in a more organized, calm situation with materials already sorted or nearly sorted.
- The table should look clearer and more structured than chaotic.
- Include a school list and smartphone, but show calm orientation and relief.
- The emotional message should be: "This makes school preparation easier for families."
- Important: do not make this look like homework help.
`.trim();

    case "how-it-works":
      return `
- Core scene type: understanding how the process works.
- Show a clear step-like visual situation: school list, smartphone, selected materials, organized preparation.
- The scene should visually suggest a process from list to overview.
- Keep it realistic and home-based.
- The emotional message should be: "The process is simple and understandable."
- Important: do not make this look like homework help.
`.trim();

    case "local-service":
      return `
- Core scene type: trustworthy family support around school materials.
- Show a warm, believable home preparation scene that feels personal and supportive.
- The focus should still stay on school list, material checking and preparation.
- The emotional message should be: "Families receive helpful, trustworthy support."
- Important: do not make this look like homework help.
`.trim();

    default:
      return `
- Core scene type: family school material preparation at home.
- Show a parent and child checking a school list and organizing school supplies together.
- The materials and the list should be central in the story.
- The emotional message should be: "Parents are getting orientation and support with school preparation."
- Important: do not make this look like homework help.
`.trim();
  }
}

function buildImagePrompt(post: SocialPostRow) {
  const basePrompt = cleanString(post.image_prompt);
  const topic = cleanString(post.topic);
  const hook = cleanString(post.hook);
  const caption = cleanString(post.caption);
  const compositionDirection = buildCompositionDirection(post);
  const hookSpecificDirection = buildHookSpecificDirection(post);

  return `
${basePrompt}

Important social-media context:
The image must visually support this exact hook:
"${hook}"

Topic:
"${topic}"

Caption context:
"${caption}"

Very important:
The image must not be a generic family-school scene only.
It must clearly express the content meaning of the hook and topic.
The scene should feel specifically connected to the post theme.

${hookSpecificDirection}

${compositionDirection}

Additional fixed production requirements:
- Vertical portrait social media image.
- Format optimized for TikTok, Instagram Reels and Facebook stories.
- The image should primarily appeal to parents with school-age children.
- Warm, realistic family-oriented school preparation scene.
- Prefer a home environment instead of an office.
- Preferred settings: kitchen table, dining table, cozy family workspace, school preparation at home.
- Show a parent with one school-age child or a believable parent-child school preparation situation.
- Show a visible paper school supply list, notebooks, colored folders, pens, exercise books, backpack, pencil case, smartphone on a table.
- The action must focus on school material organization, checking, comparing, sorting, photographing the list, or preparing for school start.
- Avoid scenes where the child is simply writing homework in a notebook.
- Avoid the impression of tutoring, learning support, homework help or private lesson.
- The visual story must feel practical and clearly related to school material planning.
- Emotion should feel supportive, calm, trustworthy, relatable, and family-friendly.
- Visual tone should suggest relief, preparation, orientation, less shopping stress, and everyday help for families.
- No corporate office feeling.
- Not business-like.
- Avoid sterile office scenes, startup aesthetics, or generic business stock photo style.
- Natural light, warm tones, premium but friendly look.
- No real brand logos.
- No TikTok, Instagram or Facebook logos.
- Avoid strong readable text inside the image.
- Leave some clean negative space for later overlay text.
- Realistic lighting, emotionally warm, high-quality, authentic family atmosphere.
- No exaggerated advertising style.
`.trim();
}

export async function POST(
  request: Request,
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
      .select("id, status, topic, hook, caption, image_prompt")
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
    const finalPrompt = buildImagePrompt(post);

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
          prompt: finalPrompt,
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
        prompt: finalPrompt,
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
          topic_category: detectTopicCategory(post),
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