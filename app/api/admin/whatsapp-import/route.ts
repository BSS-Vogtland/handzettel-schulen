import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { sendMail } from "@/lib/sendMail";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 20 * 1024 * 1024;

const ALLOWED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

function cleanString(value: FormDataEntryValue | null) {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function looksLikeEmail(value: string | null) {
  if (!value) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function getFileExtension(fileName: string) {
  const parts = fileName.split(".");
  if (parts.length < 2) return "upload";
  return parts.pop()?.toLowerCase() || "upload";
}

function getSiteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "http://localhost:3000"
  );
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function cleanWhatsappLine(value: string) {
  return normalizeWhitespace(
    value
      .replace(/^[\s\-–—•*]+/g, "")
      .replace(/^\d+[.)]\s*/g, "")
      .trim()
  );
}

function extractQuantityAndName(line: string) {
  const cleaned = cleanWhatsappLine(line);

  const match = cleaned.match(
    /^(\d+(?:[,.]\d+)?)\s*(x|×|stk\.?|stück|stueck|mal)?\s+(.+)$/i
  );

  if (!match) {
    return {
      quantity: 1,
      name: cleaned,
    };
  }

  const quantity = Number(String(match[1]).replace(",", "."));
  const name = cleanWhatsappLine(match[3]);

  return {
    quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
    name: name || cleaned,
  };
}

function buildItemsFromWhatsappText(text: string) {
  const ignoredStarts = [
    "hallo",
    "guten tag",
    "name:",
    "e-mail:",
    "email:",
    "telefon:",
    "kind:",
    "schule:",
    "klasse:",
    "ich sende",
    "liste",
    "hier ist",
    "anbei",
    "lg",
    "liebe grüße",
    "viele grüße",
  ];

  const lines = text
    .split(/\r?\n/)
    .map(cleanWhatsappLine)
    .filter((line) => line.length >= 3)
    .filter((line) => {
      const lower = line.toLowerCase();
      return !ignoredStarts.some((start) => lower.startsWith(start));
    });

  const uniqueLines = Array.from(new Set(lines));

  return uniqueLines
    .map((line) => extractQuantityAndName(line))
    .filter((item) => item.name.length >= 3)
    .slice(0, 80);
}

function buildOfferEmail(input: {
  customerName: string | null;
  childName: string | null;
  schoolName: string | null;
  requestNumber: string | null;
  offerUrl: string;
}) {
  const greeting = input.customerName ? `Hallo ${input.customerName},` : "Hallo,";

  const childLine = input.childName
    ? `für ${input.childName}`
    : "für Deine Schulmaterialliste";

  const schoolLine = input.schoolName
    ? `Schule: ${input.schoolName}`
    : null;

  const requestLine = input.requestNumber
    ? `Anfrage: ${input.requestNumber}`
    : null;

  const text = [
    greeting,
    "",
    `vielen Dank für Deine Anfrage bei Handzettel-Schulen.de ${childLine}.`,
    "",
    schoolLine,
    requestLine,
    "",
    "Über den folgenden persönlichen Link kannst Du Deine Schulmaterialliste auswerten lassen, Produkte auswählen und Deinen Paketwunsch jederzeit wieder öffnen:",
    "",
    input.offerUrl,
    "",
    "Bitte bewahre diesen Link auf. Darüber kommst Du jederzeit wieder zu Deinem persönlichen Paketwunsch.",
    "",
    "Viele Grüße",
    "Dein Team von Handzettel-Schulen.de",
  ]
    .filter((line) => line !== null)
    .join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; color: #102A43; line-height: 1.6; max-width: 640px;">
      <h2 style="color: #102A43; margin-bottom: 12px;">Dein persönlicher Link zu Deiner Schulmaterialliste</h2>

      <p>${greeting}</p>

      <p>
        vielen Dank für Deine Anfrage bei <strong>Handzettel-Schulen.de</strong>
        ${childLine}.
      </p>

      ${
        schoolLine || requestLine
          ? `
            <div style="background: #FBF7F0; border: 1px solid #E8DED2; border-radius: 16px; padding: 14px 16px; margin: 18px 0;">
              ${schoolLine ? `<p style="margin: 0;"><strong>${schoolLine}</strong></p>` : ""}
              ${requestLine ? `<p style="margin: 4px 0 0 0;">${requestLine}</p>` : ""}
            </div>
          `
          : ""
      }

      <p>
        Über den folgenden persönlichen Link kannst Du Deine Schulmaterialliste
        auswerten lassen, Produkte auswählen und Deinen Paketwunsch jederzeit
        wieder öffnen:
      </p>

      <p style="margin: 24px 0;">
        <a
          href="${input.offerUrl}"
          style="background: #B5282D; color: #ffffff; text-decoration: none; padding: 14px 20px; border-radius: 14px; font-weight: bold; display: inline-block;"
        >
          Persönlichen Paketwunsch öffnen
        </a>
      </p>

      <p style="font-size: 14px; color: #52616F;">
        Falls der Button nicht funktioniert, kopiere diesen Link in Deinen Browser:<br />
        <a href="${input.offerUrl}" style="color: #12395F;">${input.offerUrl}</a>
      </p>

      <p>
        Bitte bewahre diesen Link auf. Darüber kommst Du jederzeit wieder zu
        Deinem persönlichen Paketwunsch.
      </p>

      <p>
        Viele Grüße<br />
        <strong>Dein Team von Handzettel-Schulen.de</strong>
      </p>
    </div>
  `;

  return {
    subject: "Dein persönlicher Link zu Deiner Schulmaterialliste",
    text,
    html,
  };
}

async function saveRequestEvent(input: {
  requestId: string;
  eventType: string;
  title: string;
  description: string;
  metadata?: Record<string, unknown>;
}) {
  const payloads = [
    {
      request_id: input.requestId,
      event_type: input.eventType,
      title: input.title,
      description: input.description,
      metadata: input.metadata ?? {},
    },
    {
      request_id: input.requestId,
      event_type: input.eventType,
      message: input.description,
      metadata: input.metadata ?? {},
    },
    {
      request_id: input.requestId,
      type: input.eventType,
      message: input.description,
      metadata: input.metadata ?? {},
    },
  ];

  for (const payload of payloads) {
    const { error } = await supabaseServer
      .from("school_request_events")
      .insert(payload);

    if (!error) return;
  }
}

async function uploadFileForRequest(input: {
  requestId: string;
  file: File;
  source: string;
}) {
  const extension = getFileExtension(input.file.name);
  const safeFileName = `${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const storagePath = `${input.requestId}/${safeFileName}`;
  const arrayBuffer = await input.file.arrayBuffer();

  const { error: uploadError } = await supabaseServer.storage
    .from("school-request-files")
    .upload(storagePath, arrayBuffer, {
      contentType: input.file.type,
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`Datei konnte nicht gespeichert werden: ${uploadError.message}`);
  }

  const { error: fileRowError } = await supabaseServer
    .from("school_request_files")
    .insert({
      request_id: input.requestId,
      storage_path: storagePath,
      file_url: storagePath,
      original_filename: input.file.name,
      file_type: input.file.type,
      file_size: input.file.size,
      source: input.source,
    });

  if (fileRowError) {
    throw new Error(
      `Datei wurde gespeichert, aber nicht sauber verknüpft: ${fileRowError.message}`
    );
  }

  return storagePath;
}

async function createTextFileForRequest(input: {
  requestId: string;
  text: string;
}) {
  const fileName = `whatsapp-text-${Date.now()}.txt`;
  const file = new File([input.text], fileName, {
    type: "text/plain",
  });

  const extension = "txt";
  const safeFileName = `${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const storagePath = `${input.requestId}/${safeFileName}`;
  const arrayBuffer = await file.arrayBuffer();

  const { error: uploadError } = await supabaseServer.storage
    .from("school-request-files")
    .upload(storagePath, arrayBuffer, {
      contentType: "text/plain; charset=utf-8",
      upsert: false,
    });

  if (uploadError) {
    throw new Error(
      `WhatsApp-Text konnte nicht gespeichert werden: ${uploadError.message}`
    );
  }

  const { error: fileRowError } = await supabaseServer
    .from("school_request_files")
    .insert({
      request_id: input.requestId,
      storage_path: storagePath,
      file_url: storagePath,
      original_filename: fileName,
      file_type: "text/plain",
      file_size: file.size,
      source: "whatsapp_manual_text",
    });

  if (fileRowError) {
    throw new Error(
      `WhatsApp-Text wurde gespeichert, aber nicht sauber verknüpft: ${fileRowError.message}`
    );
  }

  return storagePath;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const customerName = cleanString(formData.get("customerName"));
    const rawEmail = cleanString(formData.get("email"));
    const phone = cleanString(formData.get("phone"));
    const childName = cleanString(formData.get("childName"));
    const schoolName = cleanString(formData.get("schoolName"));
    const className = cleanString(formData.get("className"));
    const whatsappText = cleanString(formData.get("whatsappText"));
    const internalNote = cleanString(formData.get("internalNote"));

    const email = looksLikeEmail(rawEmail) ? rawEmail : null;

    const fileValue = formData.get("file");
    const file = fileValue instanceof File && fileValue.size > 0 ? fileValue : null;

    if (!whatsappText && !file) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Bitte füge entweder den WhatsApp-Text ein oder lade ein Foto/PDF hoch.",
        },
        { status: 400 }
      );
    }

    if (file) {
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { ok: false, message: "Die Datei darf maximal 20 MB groß sein." },
          { status: 400 }
        );
      }

      if (!ALLOWED_TYPES.includes(file.type)) {
        return NextResponse.json(
          {
            ok: false,
            message:
              "Dieses Dateiformat wird noch nicht unterstützt. Bitte nutze PDF, JPG, PNG, WEBP oder ein Handyfoto.",
          },
          { status: 400 }
        );
      }
    }

    const combinedMessage = [
      whatsappText ? `WhatsApp-Text:\n${whatsappText}` : null,
      internalNote ? `Interne Notiz:\n${internalNote}` : null,
    ]
      .filter(Boolean)
      .join("\n\n");

    const textItems = whatsappText ? buildItemsFromWhatsappText(whatsappText) : [];

    const hasOnlyText = Boolean(whatsappText) && !file;

    const { data: createdRequest, error: requestError } = await supabaseServer
      .from("school_requests")
      .insert({
        source: "whatsapp_manual",
        status: hasOnlyText ? "analysis_done" : "received",
        customer_name: customerName,
        child_name: childName,
        class_name: className,
        school_name: schoolName,
        email,
        phone,
        message: combinedMessage || null,
        ai_status: hasOnlyText ? "done" : "pending",
        offer_status: hasOnlyText ? "matching_done" : "not_created",
      })
      .select("id, request_number, offer_token")
      .single();

    if (requestError || !createdRequest) {
      console.error("school_requests whatsapp insert error:", requestError);

      return NextResponse.json(
        {
          ok: false,
          message: "Die WhatsApp-Anfrage konnte nicht gespeichert werden.",
        },
        { status: 500 }
      );
    }

    const storedPaths: string[] = [];

    if (file) {
      const path = await uploadFileForRequest({
        requestId: createdRequest.id,
        file,
        source: "whatsapp_manual",
      });

      storedPaths.push(path);
    }

    if (whatsappText) {
      const path = await createTextFileForRequest({
        requestId: createdRequest.id,
        text: whatsappText,
      });

      storedPaths.push(path);
    }

    let insertedItemCount = 0;

    if (textItems.length > 0) {
      const { error: itemInsertError } = await supabaseServer
        .from("school_request_items")
        .insert(
          textItems.map((item) => ({
            request_id: createdRequest.id,
            raw_text: item.name,
            normalized_name: item.name,
            quantity: item.quantity,
            status: "recognized_from_whatsapp",
            confidence: 0.75,
            notes: "Aus manuell eingefügtem WhatsApp-Text übernommen.",
          }))
        );

      if (itemInsertError) {
        console.error("whatsapp school_request_items insert error:", itemInsertError);

        await saveRequestEvent({
          requestId: createdRequest.id,
          eventType: "whatsapp_text_items_failed",
          title: "WhatsApp-Textpositionen konnten nicht angelegt werden",
          description: itemInsertError.message,
          metadata: {
            itemCount: textItems.length,
          },
        });
      } else {
        insertedItemCount = textItems.length;
      }
    }

    await saveRequestEvent({
      requestId: createdRequest.id,
      eventType: "whatsapp_manual_import_created",
      title: "WhatsApp-Anfrage manuell importiert",
      description: "Die Anfrage wurde manuell aus einer WhatsApp-Nachricht angelegt.",
      metadata: {
        customerName,
        childName,
        schoolName,
        className,
        email,
        phone,
        hasFile: Boolean(file),
        hasWhatsappText: Boolean(whatsappText),
        insertedItemCount,
        storedPaths,
        source: "whatsapp_manual",
      },
    });

    const siteUrl = getSiteUrl();
    const offerUrl = `${siteUrl}/angebot/${createdRequest.offer_token}`;

    let emailSent = false;
    let emailMessage: string | null = null;

    if (email) {
      try {
        const emailContent = buildOfferEmail({
          customerName,
          childName,
          schoolName,
          requestNumber: createdRequest.request_number,
          offerUrl,
        });

        await sendMail({
          to: email,
          subject: emailContent.subject,
          text: emailContent.text,
          html: emailContent.html,
        });

        emailSent = true;
        emailMessage = "Der Angebotslink wurde automatisch per E-Mail gesendet.";

        await saveRequestEvent({
          requestId: createdRequest.id,
          eventType: "offer_link_email_sent",
          title: "Angebotslink per E-Mail gesendet",
          description: `Der persönliche Angebotslink wurde automatisch an ${email} gesendet.`,
          metadata: {
            email,
            offerUrl,
            source: "whatsapp_manual",
          },
        });
      } catch (emailError) {
        console.error("whatsapp offer link email error:", emailError);

        emailSent = false;
        emailMessage =
          "Die Anfrage wurde gespeichert, aber die E-Mail konnte nicht automatisch gesendet werden.";

        await saveRequestEvent({
          requestId: createdRequest.id,
          eventType: "offer_link_email_failed",
          title: "E-Mail-Versand fehlgeschlagen",
          description:
            emailError instanceof Error
              ? emailError.message
              : "Der Angebotslink konnte nicht automatisch per E-Mail gesendet werden.",
          metadata: {
            email,
            offerUrl,
            source: "whatsapp_manual",
          },
        });
      }
    } else {
      emailMessage =
        "Es wurde keine gültige E-Mail-Adresse angegeben. Der Angebotslink wurde daher nicht automatisch versendet.";

      await saveRequestEvent({
        requestId: createdRequest.id,
        eventType: "offer_link_email_skipped",
        title: "E-Mail-Versand übersprungen",
        description:
          "Es wurde keine gültige E-Mail-Adresse angegeben. Der Angebotslink wurde nicht automatisch versendet.",
        metadata: {
          phone,
          offerUrl,
          source: "whatsapp_manual",
        },
      });
    }

    return NextResponse.json({
      ok: true,
      message: "WhatsApp-Anfrage wurde angelegt.",
      requestId: createdRequest.id,
      requestNumber: createdRequest.request_number,
      offerToken: createdRequest.offer_token,
      token: createdRequest.offer_token,
      offerUrl,
      redirectUrl: `/admin/anfragen/${createdRequest.id}`,
      emailSent,
      emailMessage,
      insertedItemCount,
    });
  } catch (error) {
    console.error("whatsapp import route error:", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Beim WhatsApp-Import ist ein unerwarteter Fehler aufgetreten.",
      },
      { status: 500 }
    );
  }
}