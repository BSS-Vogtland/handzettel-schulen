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

function getFirstCleanString(
  formData: FormData,
  keys: string[]
): string | null {
  for (const key of keys) {
    const value = cleanString(formData.get(key));
    if (value) return value;
  }

  return null;
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

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { ok: false, message: "Bitte lade eine Datei hoch." },
        { status: 400 }
      );
    }

    if (file.size <= 0) {
      return NextResponse.json(
        { ok: false, message: "Die hochgeladene Datei ist leer." },
        { status: 400 }
      );
    }

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

    const customerName = getFirstCleanString(formData, [
      "customer_name",
      "customerName",
      "name",
    ]);

    const childName = getFirstCleanString(formData, [
      "child_name",
      "childName",
    ]);

    const className = getFirstCleanString(formData, [
      "class_name",
      "className",
    ]);

    const schoolName = getFirstCleanString(formData, [
      "school_name",
      "schoolName",
    ]);

    const contact = cleanString(formData.get("contact"));
    const rawEmail = cleanString(formData.get("email"));
    const rawPhone = cleanString(formData.get("phone"));
    const message = cleanString(formData.get("message"));

    const email =
      looksLikeEmail(rawEmail) ? rawEmail : looksLikeEmail(contact) ? contact : null;

    const phone =
      !looksLikeEmail(contact) && contact
        ? contact
        : rawPhone && !looksLikeEmail(rawPhone)
        ? rawPhone
        : null;

    const { data: createdRequest, error: requestError } = await supabaseServer
      .from("school_requests")
      .insert({
        source: "website",
        status: "received",
        customer_name: customerName,
        child_name: childName,
        class_name: className,
        school_name: schoolName,
        email,
        phone,
        message,
        ai_status: "pending",
        offer_status: "not_created",
      })
      .select("id, request_number, offer_token")
      .single();

    if (requestError || !createdRequest) {
      console.error("school_requests insert error:", requestError);

      return NextResponse.json(
        {
          ok: false,
          message: "Die Anfrage konnte nicht gespeichert werden.",
        },
        { status: 500 }
      );
    }

    const extension = getFileExtension(file.name);
    const safeFileName = `${Date.now()}-${crypto.randomUUID()}.${extension}`;
    const storagePath = `${createdRequest.id}/${safeFileName}`;

    const arrayBuffer = await file.arrayBuffer();

    const { error: uploadError } = await supabaseServer.storage
      .from("school-request-files")
      .upload(storagePath, arrayBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("storage upload error:", uploadError);

      return NextResponse.json(
        {
          ok: false,
          message: "Die Datei konnte nicht gespeichert werden.",
        },
        { status: 500 }
      );
    }

    const { error: fileRowError } = await supabaseServer
      .from("school_request_files")
      .insert({
        request_id: createdRequest.id,
        storage_path: storagePath,
        file_url: storagePath,
        original_filename: file.name,
        file_type: file.type,
        file_size: file.size,
        source: "website",
      });

    if (fileRowError) {
      console.error("school_request_files insert error:", fileRowError);

      return NextResponse.json(
        {
          ok: false,
          message: "Die Datei wurde gespeichert, aber nicht sauber verknüpft.",
        },
        { status: 500 }
      );
    }

    await saveRequestEvent({
      requestId: createdRequest.id,
      eventType: "request_received",
      title: "Materialliste eingegangen",
      description: "Die Materialliste wurde über die Website hochgeladen.",
      metadata: {
        customerName,
        childName,
        schoolName,
        className,
        contact,
        email,
        phone,
        originalFilename: file.name,
        fileType: file.type,
        fileSize: file.size,
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
          },
        });
      } catch (emailError) {
        console.error("offer link email error:", emailError);

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
          },
        });
      }
    } else {
      emailMessage =
        "Es wurde keine E-Mail-Adresse angegeben. Der Angebotslink wurde daher nicht automatisch versendet.";

      await saveRequestEvent({
        requestId: createdRequest.id,
        eventType: "offer_link_email_skipped",
        title: "E-Mail-Versand übersprungen",
        description:
          "Es wurde keine E-Mail-Adresse angegeben. Der Angebotslink wurde nicht automatisch versendet.",
        metadata: {
          contact,
          phone,
          offerUrl,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      requestId: createdRequest.id,
      requestNumber: createdRequest.request_number,
      offerToken: createdRequest.offer_token,
      token: createdRequest.offer_token,
      offerUrl,
      redirectUrl: `/angebot/${createdRequest.offer_token}`,
      emailSent,
      emailMessage,
    });
  } catch (error) {
    console.error("upload route error:", error);

    return NextResponse.json(
      {
        ok: false,
        message: "Beim Upload ist ein unerwarteter Fehler aufgetreten.",
      },
      { status: 500 }
    );
  }
}