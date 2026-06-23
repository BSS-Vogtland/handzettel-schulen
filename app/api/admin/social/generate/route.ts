import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

type PlatformContent = {
  hook?: string;
  caption?: string;
};

type SocialProjectRow = {
  id: string;
  name: string;
  website_url: string | null;
  industry: string | null;
  target_audience: string | null;
  offer_summary: string | null;
  brand_voice: string | null;
  image_style: string | null;
  additional_notes: string | null;
  content_pillars: string[] | null;
  content_goals: string[] | null;
  taboo_topics: string[] | null;
  cta_examples: string[] | null;
  platform_targets: string[] | null;
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

const FALLBACK_PROJECT: SocialProjectRow = {
  id: "",
  name: "Handzettel-Schulen.de",
  website_url: "https://www.handzettel-schulen.de",
  industry: "Schulmaterial-Service / Elternservice",
  target_audience:
    "Eltern von Schulkindern, besonders vor dem Schulstart und bei Materiallisten",
  offer_summary:
    "Eltern laden ihre Schulmaterialliste hoch. Daraus wird ein vorbereiteter Paketwunsch erstellt. Die Eltern kÃ¶nnen alles prÃ¼fen und senden erst danach bewusst ab.",
  brand_voice:
    "Direkt, verstÃ¤ndlich, modern, vertrauenswÃ¼rdig, elternnah, hilfreich, nicht aufdringlich",
  image_style:
    "Familiennah, alltagsnah, Schulstart, Materialliste, Eltern-Kind-Situation, keine Business-/BÃ¼ro-Optik, Bild muss klar zum Hook passen",
  additional_notes:
    "Upload ist noch keine Bestellung. Keine falschen Versprechen. Bilder sollen nicht wie reine Hausaufgabenhilfe wirken.",
  content_pillars: [
    "FehlkÃ¤ufe vermeiden",
    "Stress vor Schulstart reduzieren",
    "Sommerferien entspannt genießen",
    "Schulmateriallisten verstehen",
    "Lineatur, Format und Farben erklÃ¤ren",
    "Upload und Paketwunsch erklÃ¤ren",
    "Eltern entlasten",
    "Vertrauen und lokaler Service",
  ],
  content_goals: [
    "mehr Website-Besuche",
    "mehr Listen-Uploads",
    "mehr Vertrauen bei Eltern",
    "bessere ErklÃ¤rung des Angebots",
  ],
  taboo_topics: [
    "keine automatische Bestellung behaupten",
    "keine Panikmache",
    "keine aggressiven Verkaufsversprechen",
    "keine generische Business-Bildsprache",
    "keine reine Hausaufgabenhilfe-Bildsprache",
  ],
  cta_examples: [
    "Lade Deine Materialliste hoch und prÃ¼fe Deinen Paketwunsch.",
    "Teste den Upload fÃ¼r Deine Schulmaterialliste.",
    "Spare Dir unnÃ¶tigen Schulstart-Stress.",
  ],
  platform_targets: ["tiktok", "instagram", "facebook"],
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
    .slice(0, 30);
}

function formatList(values: string[] | null | undefined, fallback: string) {
  const cleaned = cleanStringArray(values);

  if (cleaned.length === 0) return fallback;

  return cleaned.map((item) => `- ${item}`).join("\n");
}

async function loadActiveProject() {
  const { data, error } = await supabaseServer
    .from("social_projects")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return FALLBACK_PROJECT;
  }

  return data as SocialProjectRow;
}

function buildBrandingRules(project: SocialProjectRow) {
  const brandName = project.name || FALLBACK_PROJECT.name;

  return `
Branding-Regeln fÃ¼r Bild- und Videoprompts:
- Jeder image_prompt und jeder video_prompt muss sichtbares Branding fÃ¼r "${brandName}" enthalten.
- Das Branding soll natÃ¼rlich in der Szene auftauchen, nicht billig oder aufgeklebt wirken.
- Das Logo bzw. der Markenname "${brandName}" soll sichtbar und mÃ¶glichst lesbar erscheinen.
- Erlaubte Platzierungen: auf einem Schulmaterial-Paket, Versandlabel, Beileger, Flyer, Checklistenkarte, Website-Karte auf Tablet/Smartphone, kleiner Aufsteller, Tasche, Paketaufkleber, dezente Infobox oder Lower-Third-Element.
- Keine fremden Markenlogos.
- Keine TikTok-, Instagram- oder Facebook-Logos.
- MÃ¶glichst wenig sonstiger lesbarer Text im Bild.
- Wenn lesbarer Text erscheint, dann bevorzugt nur der Markenname "${brandName}".
- Die Branding-StÃ¤rke soll zum Beitrag passen:
  - informative/erklÃ¤rende BeitrÃ¤ge: dezent, aber sichtbar
  - Standard-ServicebeitrÃ¤ge: ausgewogen sichtbar
  - CTA-/Upload-/Paketwunsch-/Kampagnen-BeitrÃ¤ge: klar und prominent, aber hochwertig
- Das Bild darf nicht wie eine billige Anzeige wirken.
- Die Szene muss weiterhin zuerst die Botschaft des Hooks transportieren.
`.trim();
}

function buildSystemPrompt(project: SocialProjectRow) {
  return `
Du bist ein erfahrener deutscher Social-Media-Stratege und Creative Director.

Du erstellst Social-Media-Content fÃ¼r ein konfigurierbares Kundenprojekt.

Projekt / Marke:
${project.name}

Website:
${project.website_url || "Keine Website hinterlegt"}

Branche:
${project.industry || "Nicht angegeben"}

Zielgruppe:
${project.target_audience || "Nicht angegeben"}

Angebot / Kernnutzen:
${project.offer_summary || "Nicht angegeben"}

Markenstimme / Tonfall:
${project.brand_voice || "verstÃ¤ndlich, hilfreich, modern, vertrauenswÃ¼rdig"}

Bildstil:
${project.image_style || "realistisch, hochwertig, passend zur Zielgruppe"}

ZusÃ¤tzliche Hinweise:
${project.additional_notes || "Keine zusÃ¤tzlichen Hinweise"}

Content-Ziele:
${formatList(project.content_goals, "- Reichweite\n- Vertrauen\n- Anfragen")}

Tabuthemen / Dinge, die vermieden werden mÃ¼ssen:
${formatList(project.taboo_topics, "- Keine falschen Versprechen\n- Keine unseriÃ¶sen Behauptungen")}

CTA-Beispiele:
${formatList(project.cta_examples, "- Mehr erfahren")}

${buildBrandingRules(project)}

Wichtig:
- Schreibe auf Deutsch.
- Duze die Zielgruppe, auÃŸer das Projektprofil verlangt ausdrÃ¼cklich etwas anderes.
- Keine falschen Versprechen.
- Keine erfundenen Garantien.
- Social Hooks dÃ¼rfen neugierig sein, aber nicht unseriÃ¶s.
- Erstelle Content, der zu den hinterlegten Plattformen passt.
- Bildprompts mÃ¼ssen zur jeweiligen Ãœberschrift / zum Hook passen.
- Jeder Bildprompt braucht eine eigene visuelle Idee.
- Die Szene muss die Botschaft des Hooks ausdrÃ¼cken, nicht nur schÃ¶n aussehen.
- Bild- und Videoprompts mÃ¼ssen Branding fÃ¼r die Marke enthalten.
`;
}

function buildUserPrompt(project: SocialProjectRow) {
  const brandName = project.name || FALLBACK_PROJECT.name;

  return `
Erstelle 8 Social-Media-BeitrÃ¤ge fÃ¼r dieses Projekt:

Projekt:
${project.name}

Content-SÃ¤ulen, aus denen die BeitrÃ¤ge entstehen sollen:
${formatList(project.content_pillars, "- Problem-Bewusstsein\n- Fehler vermeiden\n- Vertrauen\n- Ablauf erklÃ¤ren\n- Kundenfragen")}

Aktive Plattformen:
${formatList(project.platform_targets, "- tiktok\n- instagram\n- facebook")}

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

Strenge Content-Regeln:
- Jeder Beitrag muss zu Zielgruppe, Angebot und Content-SÃ¤ulen passen.
- Die Themen dÃ¼rfen sich nicht zu stark Ã¤hneln.
- Die Hooks sollen neugierig machen, aber seriÃ¶s bleiben.
- Die Caption soll verstÃ¤ndlich erklÃ¤ren, warum das Thema relevant ist.
- Der CTA soll zu den hinterlegten CTA-Beispielen passen.
- Verwende korrektes deutsches Schriftbild mit echten Umlauten (ä, ö, ü, Ä, Ö, Ü) und ß, wenn sprachlich passend.
- Schreibe nicht ae, oe, ue oder ss als Ersatz für Umlaute, außer wenn es technisch unvermeidbar wäre.- Hashtags sollen themennah sein, kein Spam.


Template-4-Testbeitrag / Sommerferien:
- Erzeuge in dieser Generierungsrunde mindestens einen Beitrag zum Thema Sommerferien, Ferienzeit oder Familienzeit.
- Dieser Beitrag soll Eltern zeigen, dass sie die Ferien genießen können, statt sich in der freien Zeit mit Schulmaterialkauf und Materiallisten zu stressen.
- Der Beitrag muss in "topic" oder "hook" mindestens eines dieser Wörter enthalten: "Sommerferien", "Ferien", "Familienzeit" oder "Sommer".
- Der Beitrag darf in der Caption den Upload der Schulliste erwähnen, aber topic und hook müssen klar Sommer/Ferien/Familienzeit als Hauptthema haben.
- Geeigneter Beispielinhalt, nicht zwingend wortgleich:
  topic: "Sommerferien entspannt genießen"
  hook: "Genieß die Ferien – wir kümmern uns um die Schulliste"
  caption: "Mehr Familienzeit, weniger Schulmaterialstress: Lade Deine Liste hoch und wir stellen Deinen Paketwunsch zusammen. So bleibt mehr Zeit für Sommer, Familie und echte Ferienmomente."
Strenge Bildprompt-Regeln:
- image_prompt muss auf Englisch formuliert sein.
- image_prompt muss exakt zum jeweiligen topic und hook passen.
- image_prompt darf nicht allgemein bleiben.
- image_prompt muss erklÃ¤ren, was im Bild konkret passiert.
- Die Szene muss die Botschaft ausdrÃ¼cken.
- Die Umgebung darf je nach Hook variieren.
- Nicht immer dieselbe Szene.
- Nicht immer dieselbe Perspektive.
- Nicht generisch, nicht austauschbar.
- Sichtbares Branding ist Pflicht.
- Das Logo bzw. der Markenname "${brandName}" muss natÃ¼rlich in die Szene integriert werden.
- Nutze dafÃ¼r realistische Platzierungen: Paketaufkleber, Flyer, Checklistenkarte, Website-Karte, Schulmaterial-Paket, Tasche, dezente Infobox, kleiner Aufsteller oder Lower-Third.
- Keine fremden Markenlogos.
- Keine TikTok-, Instagram- oder Facebook-Logos.
- MÃ¶glichst wenig lesbarer Text im Bild.
- Wenn Text erscheint, dann bevorzugt nur "${brandName}".
- 9:16 vertical social media image.
- Realistic, high-quality, emotionally believable.
- Das Bild darf nicht nach billiger Werbung aussehen.
- Die Branding-StÃ¤rke muss zum Beitrag passen:
  - erklÃ¤rende BeitrÃ¤ge: subtil, aber sichtbar
  - Service-/VertrauensbeitrÃ¤ge: ausgewogen sichtbar
  - CTA-/Upload-/Paketwunsch-BeitrÃ¤ge: klar sichtbar und professionell

Video Prompts:
- Auf Englisch formulieren.
- 8 Sekunden.
- Ruhige Kamera.
- Die Szene muss zum Hook passen.
- Das Logo bzw. der Markenname "${brandName}" muss natÃ¼rlich im Video sichtbar sein.
- MÃ¶gliche Platzierung: Paket, Flyer, Website-Karte, dezenter Lower-Third, Kleidung, Tischaufsteller oder Material-Beileger.
- Voice-over auf Deutsch mÃ¶glich beschreiben.

Antworte ausschlieÃŸlich als valides JSON in dieser Struktur:

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

    const project = await loadActiveProject();
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
          temperature: 0.85,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: buildSystemPrompt(project),
            },
            {
              role: "user",
              content: buildUserPrompt(project),
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
            "OpenAI konnte keine Social-BeitrÃ¤ge erzeugen.",
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
          message: "Die KI-Antwort war kein gÃ¼ltiges JSON.",
        },
        { status: 500 }
      );
    }

    const drafts = Array.isArray(parsed.posts) ? parsed.posts : [];

    if (drafts.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          message: "Es wurden keine Social-BeitrÃ¤ge erzeugt.",
        },
        { status: 500 }
      );
    }

    const platformTargets = cleanStringArray(project.platform_targets);
    const finalPlatformTargets =
      platformTargets.length > 0
        ? platformTargets
        : ["tiktok", "instagram", "facebook"];

    const rows = drafts.map((draft) => ({
      project_id: project.id || null,
      brand_project: project.name,
      status: "draft",

      topic: cleanString(draft.topic, "Social-Beitrag"),
      content_angle: cleanString(draft.content_angle, ""),

      hook: cleanString(draft.hook, "Neuer Social-Beitrag"),
      caption: cleanString(draft.caption, ""),
      cta: cleanString(
        draft.cta,
        project.cta_examples?.[0] || "Mehr erfahren."
      ),

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

      platform_targets: finalPlatformTargets,
      performance_snapshot: {
        source_project: project.name,
        source_project_id: project.id || null,
        branding_required: true,
        branding_instruction:
          "Generated image_prompt and video_prompt should include visible, natural brand/logo placement.",
      },
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
      message: `${data?.length || 0} Social-BeitrÃ¤ge wurden fÃ¼r ${project.name} erzeugt.`,
      posts: data || [],
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unbekannter Fehler beim Generieren der Social-BeitrÃ¤ge.";

    return NextResponse.json(
      {
        ok: false,
        message,
      },
      { status: 500 }
    );
  }
}

