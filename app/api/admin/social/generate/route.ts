import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
﻿import { NextResponse } from "next/server";
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

type GenerateSocialPostsRequest = {
  postCount?: unknown;
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
    "Eltern laden ihre Schulmaterialliste online hoch. Daraus wird ein vorbereiteter Paketwunsch mit passenden Artikeln erstellt. Die Eltern prüfen.",
  brand_voice:
    "Direkt, verständlich, modern, vertrauenswürdig, elternnah, hilfreich, nicht aufdringlich",
  image_style:
    "Familiennah, alltagsnah, Schulstart, Materialliste, Eltern-Kind-Situation, keine Business-/Büro-Optik, Bild muss klar zum Hook passen",
  additional_notes:
    "Upload ist noch keine automatische Bestellung. Keine falschen Versprechen. Der Hauptnutzen ist: Liste online hochladen, passende Artikel/Paketwunsch vorbereiten lassen, bewusst absenden und Zeit sparen. Nicht als reiner Prüfservice oder Hausaufgabenhilfe darstellen.",
  content_pillars: [
    "Fehlkäufe vermeiden",
    "Stress vor Schulstart reduzieren",
    "Sommerferien entspannt genießen",
    "Schulmaterialliste online hochladen",
    "Schulmaterial online vorbereiten und bestellen",
    "Paketwunsch erklären und abschließen",
    "Eltern entlasten",
    "Vertrauen und lokaler Service",
  ],
  content_goals: [
    "mehr Website-Besuche",
    "mehr Listen-Uploads",
    "mehr Vertrauen bei Eltern",
    "bessere Erklärung des Angebots",
  ],
  taboo_topics: [
    "keine automatische Bestellung behaupten",
    "keine Panikmache",
    "keine aggressiven Verkaufsversprechen",
    "keine generische Business-Bildsprache",
    "keine reine Hausaufgabenhilfe-Bildsprache",
  ],
  cta_examples: [
    "Lade Deine Schulmaterialliste hoch und lass Dein Paket online vorbereiten.",
    "Schulmaterialliste hochladen, Paketwunsch prüfen und online bestellen.",
    "Erledige den Schulmaterial-Einkauf in wenigen Minuten online statt stundenlang im Geschäft.",
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

function normalizePostCount(value: unknown) {
  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : 8;

  if (!Number.isFinite(numericValue)) return 8;

  const rounded = Math.round(numericValue);

  if (rounded < 1) return 1;
  if (rounded > 20) return 20;

  return rounded;
}

async function readGenerateRequestBody(request: Request) {
  try {
    const body = (await request.json()) as GenerateSocialPostsRequest;

    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
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


function containsWeakInfoOnlyCta(value: string) {
  const normalized = value.toLowerCase();

  return (
    normalized.includes("lerne, wie") ||
    normalized.includes("lerne wie") ||
    normalized.includes("prüfe deine liste") ||
    normalized.includes("pruefe deine liste") ||
    normalized.includes("liste einfacher") ||
    normalized.includes("liste verstehen") ||
    normalized.includes("einfach verstehst") ||
    normalized.includes("einfacher verstehst") ||
    normalized.includes("details verstehen") ||
    normalized.includes("teste den upload")
  );
}

function strengthenHandzettelCta(value: string) {
  const cleaned = cleanString(value);

  if (!cleaned || containsWeakInfoOnlyCta(cleaned)) {
    return "Lade Deine Schulmaterialliste hoch und lass Dein Paket online vorbereiten.";
  }

  const lower = cleaned.toLowerCase();
  const hasUpload = lower.includes("hochladen") || lower.includes("upload");
  const hasOrderIntent =
    lower.includes("bestell") ||
    lower.includes("paket") ||
    lower.includes("vorbereiten") ||
    lower.includes("online erledigen") ||
    lower.includes("schulmaterial");

  if (hasUpload && hasOrderIntent) return cleaned;

  if (lower.includes("prüf") || lower.includes("pruef")) {
    return "Schulmaterialliste hochladen, Paketwunsch prüfen und online bestellen.";
  }

  return `${cleaned.replace(/[.\s]+$/g, "")} – Liste hochladen und Paket online vorbereiten lassen.`;
}

function strengthenHandzettelCaption(value: string) {
  const cleaned = cleanString(value);

  if (!cleaned) return "";

  return cleaned
    .replace(/Lerne, wie Du die Listen einfach verstehst mit Handzettel-Schulen\.de\.?/gi, "Lade Deine Schulmaterialliste hoch und lass Dein Paket online vorbereiten.")
    .replace(/Prüfe Deine Liste einfacher mit Handzettel-Schulen\.de\.?/gi, "Lade Deine Liste hoch, prüfe Deinen Paketwunsch und erledige das Schulmaterial online.")
    .replace(/Pruefe Deine Liste einfacher mit Handzettel-Schulen\.de\.?/gi, "Lade Deine Liste hoch, prüfe Deinen Paketwunsch und erledige das Schulmaterial online.")
    .replace(/Liste einfacher verstehen\.?/gi, "Liste hochladen und Paket online vorbereiten lassen.")
    .replace(/Details besser verstehen\.?/gi, "Passende Artikel auswählen und Schulmaterial online erledigen.");
}

function buildBrandingRules(project: SocialProjectRow) {
  const brandName = project.name || FALLBACK_PROJECT.name;

  return `
Branding-Regeln für Bild- und Videoprompts:
- Jeder image_prompt und jeder video_prompt muss sichtbares Branding für "${brandName}" enthalten.
- Das Branding soll natürlich in der Szene auftauchen, nicht billig oder aufgeklebt wirken.
- Das Logo bzw. der Markenname "${brandName}" soll sichtbar und möglichst lesbar erscheinen.
- Erlaubte Platzierungen: auf einem Schulmaterial-Paket, Versandlabel, Beileger, Flyer, Checklistenkarte, Website-Karte auf Tablet/Smartphone, kleiner Aufsteller, Tasche, Paketaufkleber, dezente Infobox oder Lower-Third-Element.
- Keine fremden Markenlogos.
- Keine TikTok-, Instagram- oder Facebook-Logos.
- Möglichst wenig sonstiger lesbarer Text im Bild.
- Wenn lesbarer Text erscheint, dann bevorzugt nur der Markenname "${brandName}".
- Die Branding-Stärke soll zum Beitrag passen:
  - informative/erklärende Beiträge: dezent, aber sichtbar
  - Standard-Servicebeiträge: ausgewogen sichtbar
  - CTA-/Upload-/Paketwunsch-/Kampagnen-Beiträge: klar und prominent, aber hochwertig
- Das Bild darf nicht wie eine billige Anzeige wirken.
- Die Szene muss weiterhin zuerst die Botschaft des Hooks transportieren.
`.trim();
}


const GERMAN_UMLAUT_QUALITY_RULES = `
Deutsche Schreibweise / Umlaute:
- Verwende korrektes deutsches Schriftbild mit echten Umlauten: ä, ö, ü, Ä, Ö, Ü.
- Verwende ß, wenn es sprachlich richtig ist.
- Schreibe nicht ae, oe oder ue als Ersatz für ä, ö oder ü.
- Schreibe nicht "kuemmern", sondern "kümmern".
- Schreibe nicht "fuer", sondern "für".
- Schreibe nicht "ueber", sondern "über".
- Schreibe nicht "geniess", sondern "genieß".
- Schreibe nicht "koennen", sondern "können".
- Schreibe nicht "muessen", sondern "müssen".
- Diese Regel gilt besonders für topic, hook, caption, instagram.caption, facebook.caption und tiktok.caption.
`.trim();

function buildSystemPrompt(project: SocialProjectRow) {
  return `
Du bist ein erfahrener deutscher Social-Media-Stratege und Creative Director.

Du erstellst Social-Media-Content für ein konfigurierbares Kundenprojekt.

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
${project.brand_voice || "verständlich, hilfreich, modern, vertrauenswürdig"}

Bildstil:
${project.image_style || "realistisch, hochwertig, passend zur Zielgruppe"}

Zusätzliche Hinweise:
${project.additional_notes || "Keine zusätzlichen Hinweise"}

Content-Ziele:
${formatList(project.content_goals, "- Reichweite\n- Vertrauen\n- Anfragen")}

Tabuthemen / Dinge, die vermieden werden müssen:
${formatList(project.taboo_topics, "- Keine falschen Versprechen\n- Keine unseriösen Behauptungen")}

CTA-Beispiele:
${formatList(project.cta_examples, "- Mehr erfahren")}

${buildBrandingRules(project)}

Conversion-Regeln für Handzettel-Schulen.de:
- Handzettel-Schulen.de ist kein reiner Prüfservice und keine reine Erklärseite.
- Der Hauptnutzen ist: Schulmaterialliste online hochladen, passende Artikel/Paketwunsch vorbereiten lassen, bewusst prüfen/auswählen und online absenden bzw. bestellen.
- Kommuniziere klar den Zeitvorteil: in wenigen Minuten online erledigen statt stundenlang durch Geschäfte laufen.
- CTAs müssen zu einer konkreten Handlung führen: Liste hochladen, Paket vorbereiten lassen, Schulmaterial online erledigen, Paketwunsch prüfen und absenden/bestellen.
- Schwache reine Info-CTAs sind verboten: Lerne wie, Prüfe Deine Liste, Verstehe Deine Liste, Liste einfacher verstehen.
- Prüfen darf nur als Zwischenschritt vorkommen, nicht als Endnutzen. Richtig: Paketwunsch prüfen und online bestellen.


Wichtig:
- Schreibe auf Deutsch.
- Duze die Zielgruppe, außer das Projektprofil verlangt ausdrücklich etwas anderes.
- Keine falschen Versprechen.
- Keine erfundenen Garantien.
- Social Hooks dürfen neugierig sein, aber nicht unseriös.
- Erstelle Content, der zu den hinterlegten Plattformen passt.
- Bildprompts müssen zur jeweiligen Überschrift / zum Hook passen.
- Jeder Bildprompt braucht eine eigene visuelle Idee.
- Die Szene muss die Botschaft des Hooks ausdrücken, nicht nur schön aussehen.
- Bild- und Videoprompts müssen Branding für die Marke enthalten.
`;
}

function buildUserPrompt(project: SocialProjectRow, postCount: number) {
  const brandName = project.name || FALLBACK_PROJECT.name;

  return `
Erstelle  Social-Media-Beiträge für dieses Projekt:

Projekt:
${project.name}

Content-Säulen, aus denen die Beiträge entstehen sollen:
${formatList(project.content_pillars, "- Problem-Bewusstsein\n- Fehler vermeiden\n- Vertrauen\n- Ablauf erklären\n- Kundenfragen")}

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
- Jeder Beitrag muss zu Zielgruppe, Angebot und Content-Säulen passen.
- Die Themen dürfen sich nicht zu stark ähneln.
- Die Hooks sollen neugierig machen, aber seriös bleiben.
- Die Caption soll verständlich erklären, warum das Thema relevant ist.
- Der CTA soll zu den hinterlegten CTA-Beispielen passen.
- Verwende korrektes deutsches Schriftbild mit echten Umlauten (ä, ö, ü, Ä, Ö, Ü) und ß, wenn sprachlich passend.
- Schreibe nicht ae, oe, ue oder ss als Ersatz für Umlaute, außer wenn es technisch unvermeidbar wäre.- Hashtags sollen themennah sein, kein Spam.


Saisonale Themenoption Sommerferien / Familienzeit:
- Sommerferien, Ferienzeit, Familienzeit und "kein Schulmaterialstress in den Ferien" dürfen als saisonale Themen verwendet werden.
- Diese Themen sind besonders passend vor und während der Sommerferien.
- Wenn ein Beitrag Sommer/Ferien/Familienzeit als Hauptthema hat, müssen topic und hook dieses Thema klar tragen.
- Die Caption darf den Upload der Schulliste erwähnen, aber der Beitrag soll nicht automatisch zu einem reinen Upload-/Ablauf-Post werden.

Strenge Bildprompt-Regeln:
- image_prompt muss auf Englisch formuliert sein.
- image_prompt muss exakt zum jeweiligen topic und hook passen.
- image_prompt darf nicht allgemein bleiben.
- image_prompt muss erklären, was im Bild konkret passiert.
- Die Szene muss die Botschaft ausdrücken.
- Die Umgebung darf je nach Hook variieren.
- Nicht immer dieselbe Szene.
- Nicht immer dieselbe Perspektive.
- Nicht generisch, nicht austauschbar.
- Sichtbares Branding ist Pflicht.
- Das Logo bzw. der Markenname "${brandName}" muss natürlich in die Szene integriert werden.
- Nutze dafür realistische Platzierungen: Paketaufkleber, Flyer, Checklistenkarte, Website-Karte, Schulmaterial-Paket, Tasche, dezente Infobox, kleiner Aufsteller oder Lower-Third.
- Keine fremden Markenlogos.
- Keine TikTok-, Instagram- oder Facebook-Logos.
- Möglichst wenig lesbarer Text im Bild.
- Wenn Text erscheint, dann bevorzugt nur "${brandName}".
- 9:16 vertical social media image.
- Realistic, high-quality, emotionally believable.
- Das Bild darf nicht nach billiger Werbung aussehen.
- Die Branding-Stärke muss zum Beitrag passen:
  - erklärende Beiträge: subtil, aber sichtbar
  - Service-/Vertrauensbeiträge: ausgewogen sichtbar
  - CTA-/Upload-/Paketwunsch-Beiträge: klar sichtbar und professionell

Video Prompts:
- Auf Englisch formulieren.
- 8 Sekunden.
- Ruhige Kamera.
- Die Szene muss zum Hook passen.
- Das Logo bzw. der Markenname "${brandName}" muss natürlich im Video sichtbar sein.
- Mögliche Platzierung: Paket, Flyer, Website-Karte, dezenter Lower-Third, Kleidung, Tischaufsteller oder Material-Beileger.
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

export async function POST(request: Request) {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;

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

    const generateBody = await readGenerateRequestBody(request);
    const postCount = normalizePostCount(generateBody.postCount);

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
              content: buildUserPrompt(project, postCount),
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

    const drafts = (Array.isArray(parsed.posts) ? parsed.posts : []).slice(0, postCount);

    if (drafts.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          message: "Es wurden keine Social-Beiträge erzeugt.",
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
      caption: strengthenHandzettelCaption(cleanString(draft.caption, "")),
      cta: strengthenHandzettelCta(cleanString(draft.cta, project.cta_examples?.[0] || "Lade Deine Schulmaterialliste hoch und lass Dein Paket online vorbereiten.")),

      hashtags: cleanStringArray(draft.hashtags),
      keywords: cleanStringArray(draft.keywords),

      tiktok_hook: cleanString(draft.tiktok?.hook, cleanString(draft.hook, "")),
      tiktok_caption: strengthenHandzettelCaption(cleanString(
        draft.tiktok?.caption,
        cleanString(draft.caption, "")
      )),

      instagram_hook: cleanString(
        draft.instagram?.hook,
        cleanString(draft.hook, "")
      ),
      instagram_caption: strengthenHandzettelCaption(cleanString(
        draft.instagram?.caption,
        cleanString(draft.caption, "")
      )),

      facebook_hook: cleanString(
        draft.facebook?.hook,
        cleanString(draft.hook, "")
      ),
      facebook_caption: strengthenHandzettelCaption(cleanString(
        draft.facebook?.caption,
        cleanString(draft.caption, "")
      )),

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
      message: `${data?.length || 0} Social-Beiträge wurden für ${project.name} erzeugt.`,
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





