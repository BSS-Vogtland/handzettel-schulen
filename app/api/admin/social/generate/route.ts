import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

type PlatformContent = {
  hook?: string;
  caption?: string;
};

type SocialPostDraft = {
  topic?: string;
  content_angle?: string;
  hook?: string;
  caption?: string;
  cta?: string;
  hashtags?: string[];
  keywords?: string[];
  image_prompt?: string;
  video_prompt?: string;
  tiktok?: PlatformContent;
  instagram?: PlatformContent;
  facebook?: PlatformContent;
};

type OpenAiResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
};

function cleanString(value: unknown, fallback = "") {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function cleanStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function buildSystemPrompt() {
  return `
Du bist ein erfahrener deutscher Social-Media-Stratege für eine lokale Eltern- und Schulservice-Marke.

Marke:
Handzettel-Schulen.de

Kernnutzen:
Eltern laden ihre Schulmaterialliste hoch. Daraus wird ein vorbereiteter Paketwunsch erstellt. Die Eltern können alles prüfen und senden erst danach bewusst ab. Es geht um weniger Einkaufsstress, weniger Fehlkäufe, weniger doppelte Wege und bessere Orientierung bei Lineatur, Heftformaten, Umschlagfarben und Schulmateriallisten.

Zielgruppe:
Eltern von Schulkindern, besonders vor dem Schulstart und bei Materiallisten.

Ton:
Direkt, verständlich, modern, vertrauenswürdig, elternnah. Keine übertriebene Werbesprache. Keine falschen Versprechen. Keine aggressive Panikmache.

Wichtig:
- Schreibe auf Deutsch.
- Duze die Zielgruppe.
- Keine Kinder in Bildprompts erwähnen.
- Keine echten Logos fremder Plattformen verwenden.
- Keine Behauptung, dass automatisch bestellt wird.
- Immer klar machen: Der Upload ist noch keine Bestellung.
- Social Hooks dürfen neugierig sein, aber nicht unseriös.
- Erstelle Content, der zu TikTok, Instagram und Facebook passt.
`;
}

function buildUserPrompt() {
  return `
Erstelle 8 Social-Media-Beiträge für Handzettel-Schulen.de.

Jeder Beitrag braucht:
- topic
- content_angle
- hook
- caption
- cta
- hashtags
- keywords
- image_prompt
- video_prompt
- tiktok: { hook, caption }
- instagram: { hook, caption }
- facebook: { hook, caption }

Inhaltliche Themenmischung:
1. Fehlkäufe bei Schulmaterial
2. Stress vor Schulstart
3. Lineatur/Format/Farbe erklären
4. Upload ist noch keine Bestellung
5. Zeit sparen für Eltern
6. Warum Materiallisten oft komplizierter sind als gedacht
7. So funktioniert Handzettel-Schulen.de
8. Lokaler/vertrauter Servicecharakter

Bildprompts:
- Auf Englisch formulieren.
- 9:16 Social-Media-Format.
- Realistische warme Szene.
- Schulmaterial, Papierlisten, Hefte, Stifte, Tisch, Smartphone.
- Keine Kinder, keine zusätzlichen Personen.
- Kein Text im Bild oder nur sehr wenig generischer Platzhaltertext.

Video Prompts:
- Auf Englisch formulieren.
- 8 Sekunden.
- Ruhige Kamera.
- Warme realistische Lern-/Schreibtischumgebung.
- Eine erwachsene Person oder nur Hände/Schreibtisch.
- Keine Kinder.
- Voice-over auf Deutsch möglich beschreiben.

Antworte ausschließlich als valides JSON in dieser Struktur:

{
  "posts": [
    {
      "topic": "",
      "content_angle": "",
      "hook": "",
      "caption": "",
      "cta": "",
      "hashtags": [],
      "keywords": [],
      "image_prompt": "",
      "video_prompt": "",
      "tiktok": {
        "hook": "",
        "caption": ""
      },
      "instagram": {
        "hook": "",
        "caption": ""
      },
      "facebook": {
        "hook": "",
        "caption": ""
      }
    }
  ]
}
`;
}

export async function POST() {
  try {
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

    const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";

    const openAiResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          temperature: 0.8,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: buildSystemPrompt(),
            },
            {
              role: "user",
              content: buildUserPrompt(),
            },
          ],
        }),
      }
    );

    const openAiJson = (await openAiResponse.json()) as OpenAiResponse;

    if (!openAiResponse.ok) {
      return NextResponse.json(
        {
          ok: false,
          message:
            openAiJson.error?.message ||
            "OpenAI konnte keine Social-Beiträge erzeugen.",
        },
        { status: 500 }
      );
    }

    const rawContent = openAiJson.choices?.[0]?.message?.content;

    if (!rawContent) {
      return NextResponse.json(
        {
          ok: false,
          message: "OpenAI hat keine verwertbare Antwort geliefert.",
        },
        { status: 500 }
      );
    }

    let parsed: { posts?: SocialPostDraft[] };

    try {
      parsed = JSON.parse(rawContent) as { posts?: SocialPostDraft[] };
    } catch {
      return NextResponse.json(
        {
          ok: false,
          message: "Die KI-Antwort war kein gültiges JSON.",
        },
        { status: 500 }
      );
    }

    const drafts = Array.isArray(parsed.posts) ? parsed.posts : [];

    if (drafts.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          message: "Es wurden keine Social-Beiträge erzeugt.",
        },
        { status: 500 }
      );
    }

    const rows = drafts.map((draft) => ({
      brand_project: "handzettel-schulen.de",
      status: "draft",

      topic: cleanString(draft.topic, "Social-Beitrag"),
      content_angle: cleanString(draft.content_angle, ""),

      hook: cleanString(draft.hook, "Neuer Social-Beitrag"),
      caption: cleanString(draft.caption, ""),
      cta: cleanString(draft.cta, "Materialliste hochladen und prüfen lassen."),

      hashtags: cleanStringArray(draft.hashtags),
      keywords: cleanStringArray(draft.keywords),

      tiktok_hook: cleanString(draft.tiktok?.hook, cleanString(draft.hook, "")),
      tiktok_caption: cleanString(
        draft.tiktok?.caption,
        cleanString(draft.caption, "")
      ),

      instagram_hook: cleanString(
        draft.instagram?.hook,
        cleanString(draft.hook, "")
      ),
      instagram_caption: cleanString(
        draft.instagram?.caption,
        cleanString(draft.caption, "")
      ),

      facebook_hook: cleanString(
        draft.facebook?.hook,
        cleanString(draft.hook, "")
      ),
      facebook_caption: cleanString(
        draft.facebook?.caption,
        cleanString(draft.caption, "")
      ),

      image_prompt: cleanString(draft.image_prompt, ""),
      video_prompt: cleanString(draft.video_prompt, ""),

      platform_targets: ["tiktok", "instagram", "facebook"],
      performance_snapshot: {},
    }));

    const { data, error } = await supabaseServer
      .from("social_posts")
      .insert(rows)
      .select("*");

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          message: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: `${data?.length || 0} Social-Beiträge wurden erzeugt.`,
      posts: data || [],
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unbekannter Fehler beim Generieren der Social-Beiträge.";

    return NextResponse.json(
      {
        ok: false,
        message,
      },
      { status: 500 }
    );
  }
}