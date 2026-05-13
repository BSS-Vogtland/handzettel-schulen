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

function buildImagePrompt(post: SocialPostRow) {
  const basePrompt = cleanString(post.image_prompt);
  const topic = cleanString(post.topic);
  const hook = cleanString(post.hook);
  const caption = cleanString(post.caption);

  return `
${basePrompt}

Important headline context:
The image must visually support this exact social media headline:
"${hook}"

Topic:
"${topic}"

Caption context:
"${caption}"

Core visual meaning:
This image is NOT about homework tutoring.
This image is about parents dealing with a school supply list, checking school materials, avoiding wrong purchases, organizing notebooks, pens, folders, colors, sizes and lineatures, and preparing the school start with less stress.

Additional fixed production requirements:
- Vertical portrait social media image.
- Format optimized for TikTok, Instagram Reels and Facebook stories.
- The image should primarily appeal to parents with school-age children.
- Warm, realistic family-oriented school preparation scene.
- Prefer a home environment instead of an office.
- Preferred settings: kitchen table, dining table, cozy family workspace, school preparation at home.
- Show a parent with one school-age child, but the action should focus on school material organization, not homework.
- Show a visible paper school supply list, notebooks, colored folders, pens, exercise books, backpack, smartphone on a table.
- The parent may point at the school supply list, compare notebooks, sort school materials, or take a photo of the list with a smartphone.
- Avoid scenes where the child is simply writing homework in a notebook.
- Avoid the impression of tutoring, learning support, homework help or private lesson.
- Emotion should feel supportive, calm, trustworthy, relatable, and family-friendly.
- Visual tone should suggest relief, preparation, orientation, less shopping stress, and everyday help for families.
- No corporate office feeling.
- Not business-like.
- Avoid sterile office scenes, startup aesthetics, or generic business stock photo style.
- Natural light, warm tones, premium but friendly look.
- No real brand logos.
- No TikTok, Instagram or Facebook logos.
- Avoid strong readable text inside the image.
- Leave clean negative space for later overlay text.
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