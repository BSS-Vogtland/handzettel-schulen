import { NextResponse } from "next/server";
import { LEAD_SOURCE_COOKIE_NAME, normalizeLeadSource } from "@/lib/lead-source";
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

function getCookieValueFromRequest(request: Request, name: string) {
  const cookieHeader = request.headers.get("cookie") || "";
  const cookies = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);

  for (const cookie of cookies) {
    const separatorIndex = cookie.indexOf("=");
    if (separatorIndex < 0) continue;

    const key = cookie.slice(0, separatorIndex).trim();
    const value = cookie.slice(separatorIndex + 1).trim();

    if (key === name) {
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    }
  }

  return null;
}

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

function getAdminNotificationEmail() {
  return (
    process.env.ADMIN_NOTIFICATION_EMAIL?.trim() ||
    process.env.ADMIN_EMAIL?.trim() ||
    process.env.NOTIFICATION_EMAIL?.trim() ||
    null
  );
}

function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "unbekannt";

  const mb = bytes / 1024 / 1024;

  if (mb >= 1) {
    return `${mb.toLocaleString("de-DE", {
      maximumFractionDigits: 2,
    })} MB`;
  }

  const kb = bytes / 1024;

  return `${kb.toLocaleString("de-DE", {
    maximumFractionDigits: 1,
  })} KB`;
}

function escapeHtml(value: string | null | undefined) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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
      <div style="background:#102A43;border-radius:24px;padding:22px 24px;color:#ffffff;margin-bottom:22px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
          <tr>
            <td width="72" valign="middle" style="width:72px;padding:0 16px 0 0;">
              <img
                src="${getSiteUrl()}/handzettel-logo.png"
                alt="Handzettel-Schulen.de"
                width="64"
                style="display:block;width:64px;max-width:64px;height:auto;border:0;background:#ffffff;border-radius:16px;padding:6px;"
              />
            </td>
            <td valign="middle" style="padding:0;">
              <div style="font-size:22px;font-weight:800;letter-spacing:-0.3px;line-height:1.15;white-space:nowrap;">Handzettel-Schulen.de</div>
              <div style="margin-top:6px;font-size:14px;line-height:1.35;color:#F7EFE6;">Dein persönlicher Link zu Deiner Schulmaterialliste</div>
            </td>
          </tr>
        </table>
      </div>

      <h2 style="color: #102A43; margin-bottom: 12px;">Dein persönlicher Link zu Deiner Schulmaterialliste</h2>

      <p>${escapeHtml(greeting)}</p>

      <p>
        vielen Dank für Deine Anfrage bei <strong>Handzettel-Schulen.de</strong>
        ${escapeHtml(childLine)}.
      </p>

      ${
        schoolLine || requestLine
          ? `
            <div style="background: #FBF7F0; border: 1px solid #E8DED2; border-radius: 16px; padding: 14px 16px; margin: 18px 0;">
              ${schoolLine ? `<p style="margin: 0;"><strong>${escapeHtml(schoolLine)}</strong></p>` : ""}
              ${requestLine ? `<p style="margin: 4px 0 0 0;">${escapeHtml(requestLine)}</p>` : ""}
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
        <strong>Dein Team von <span style="white-space:nowrap;">Handzettel-Schulen.de</span></strong>
      </p>
    </div>
  `;

  return {
    subject: "Dein persönlicher Link zu Deiner Schulmaterialliste",
    text,
    html,
  };
}

function buildAdminUploadNotificationEmail(input: {
  customerName: string | null;
  childName: string | null;
  schoolName: string | null;
  className: string | null;
  requestNumber: string | null;
  requestId: string;
  email: string | null;
  phone: string | null;
  contact: string | null;
  message: string | null;
  originalFilename: string;
  fileType: string;
  fileSize: number;
  offerUrl: string;
}) {
  const siteUrl = getSiteUrl();
  const adminUrl = `${siteUrl}/admin/anfragen`;
  const adminDetailUrl = `${siteUrl}/admin/anfragen/${input.requestId}`;

  const subject = `Neue Materialliste eingegangen${
    input.requestNumber ? `: ${input.requestNumber}` : ""
  }`;

  const text = [
    "Neue Materialliste eingegangen",
    "",
    `Anfrage: ${input.requestNumber || input.requestId}`,
    `Kunde: ${input.customerName || "nicht angegeben"}`,
    `E-Mail: ${input.email || "nicht angegeben"}`,
    `Telefon/Kontakt: ${input.phone || input.contact || "nicht angegeben"}`,
    "",
    `Kind: ${input.childName || "nicht angegeben"}`,
    `Schule: ${input.schoolName || "nicht angegeben"}`,
    `Klasse: ${input.className || "nicht angegeben"}`,
    "",
    `Datei: ${input.originalFilename}`,
    `Dateityp: ${input.fileType || "nicht angegeben"}`,
    `Dateigröße: ${formatFileSize(input.fileSize)}`,
    "",
    input.message ? `Nachricht: ${input.message}` : "Nachricht: keine",
    "",
    `Admin-Übersicht: ${adminUrl}`,
    `Admin-Detail: ${adminDetailUrl}`,
    `Kundenlink: ${input.offerUrl}`,
  ].join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; color: #102A43; line-height: 1.5; max-width: 680px;">
      <div style="background:#102A43;border-radius:24px;padding:22px 24px;color:#ffffff;margin-bottom:22px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
          <tr>
            <td width="72" valign="middle" style="width:72px;padding:0 16px 0 0;">
              <img
                src="${getSiteUrl()}/handzettel-logo.png"
                alt="Handzettel-Schulen.de"
                width="64"
                style="display:block;width:64px;max-width:64px;height:auto;border:0;background:#ffffff;border-radius:16px;padding:6px;"
              />
            </td>
            <td valign="middle" style="padding:0;">
              <div style="font-size:22px;font-weight:800;letter-spacing:-0.3px;line-height:1.15;white-space:nowrap;">Handzettel-Schulen.de</div>
              <div style="margin-top:6px;font-size:14px;line-height:1.35;color:#F7EFE6;">Neue Materialliste eingegangen</div>
            </td>
          </tr>
        </table>
      </div>

      <h1 style="margin: 0 0 16px; color: #102A43;">Neue Materialliste eingegangen</h1>

      <div style="padding: 16px; border: 1px solid #E8DED2; border-radius: 16px; background: #FBF7F0; margin-bottom: 16px;">
        <p><strong>Anfrage:</strong> ${escapeHtml(input.requestNumber || input.requestId)}</p>
        <p><strong>Kunde:</strong> ${escapeHtml(input.customerName || "nicht angegeben")}</p>
        <p><strong>E-Mail:</strong> ${escapeHtml(input.email || "nicht angegeben")}</p>
        <p><strong>Telefon/Kontakt:</strong> ${escapeHtml(input.phone || input.contact || "nicht angegeben")}</p>
      </div>

      <div style="padding: 16px; border: 1px solid #E8DED2; border-radius: 16px; background: #ffffff; margin-bottom: 16px;">
        <p><strong>Kind:</strong> ${escapeHtml(input.childName || "nicht angegeben")}</p>
        <p><strong>Schule:</strong> ${escapeHtml(input.schoolName || "nicht angegeben")}</p>
        <p><strong>Klasse:</strong> ${escapeHtml(input.className || "nicht angegeben")}</p>
      </div>

      <div style="padding: 16px; border: 1px solid #E8DED2; border-radius: 16px; background: #ffffff; margin-bottom: 16px;">
        <p><strong>Datei:</strong> ${escapeHtml(input.originalFilename)}</p>
        <p><strong>Dateityp:</strong> ${escapeHtml(input.fileType || "nicht angegeben")}</p>
        <p><strong>Dateigröße:</strong> ${escapeHtml(formatFileSize(input.fileSize))}</p>
      </div>

      <div style="padding: 16px; border: 1px solid #F1D1A8; border-radius: 16px; background: #FFF8EE; margin-bottom: 16px;">
        <p><strong>Nachricht:</strong></p>
        <p>${escapeHtml(input.message || "keine Nachricht")}</p>
      </div>

      <p style="margin: 24px 0;">
        <a
          href="${adminUrl}"
          style="display: inline-block; padding: 12px 18px; background: #102A43; color: #ffffff; border-radius: 12px; text-decoration: none; font-weight: bold;"
        >
          Admin-Anfragen öffnen
        </a>
      </p>

      <p>
        <a href="${adminDetailUrl}" style="color: #A75B28; font-weight: bold;">
          Admin-Detail öffnen
        </a>
      </p>

      <p>
        <a href="${input.offerUrl}" style="color: #12395F; font-weight: bold;">
          Kundenlink öffnen
        </a>
      </p>
    </div>
  `;

  return {
    subject,
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

async function sendAdminUploadNotificationSafely(input: {
  requestId: string;
  requestNumber: string | null;
  offerUrl: string;
  customerName: string | null;
  childName: string | null;
  schoolName: string | null;
  className: string | null;
  email: string | null;
  phone: string | null;
  contact: string | null;
  message: string | null;
  originalFilename: string;
  fileType: string;
  fileSize: number;
}) {
  const adminEmail = getAdminNotificationEmail();

  if (!adminEmail) {
    await saveRequestEvent({
      requestId: input.requestId,
      eventType: "admin_upload_notification_skipped",
      title: "Admin-Mail nicht versendet",
      description:
        "Es ist keine ADMIN_NOTIFICATION_EMAIL, ADMIN_EMAIL oder NOTIFICATION_EMAIL konfiguriert.",
      metadata: {
        requestNumber: input.requestNumber,
      },
    });

    return;
  }

  try {
    const emailContent = buildAdminUploadNotificationEmail({
      customerName: input.customerName,
      childName: input.childName,
      schoolName: input.schoolName,
      className: input.className,
      requestNumber: input.requestNumber,
      requestId: input.requestId,
      email: input.email,
      phone: input.phone,
      contact: input.contact,
      message: input.message,
      originalFilename: input.originalFilename,
      fileType: input.fileType,
      fileSize: input.fileSize,
      offerUrl: input.offerUrl,
    });

    await sendMail({
      to: adminEmail,
      subject: emailContent.subject,
      text: emailContent.text,
      html: emailContent.html,
    });

    await saveRequestEvent({
      requestId: input.requestId,
      eventType: "admin_upload_notification_sent",
      title: "Admin-Mail versendet",
      description: `Die Admin-Benachrichtigung wurde an ${adminEmail} versendet.`,
      metadata: {
        adminEmail,
        requestNumber: input.requestNumber,
      },
    });
  } catch (error) {
    console.error("admin upload notification error:", error);

    await saveRequestEvent({
      requestId: input.requestId,
      eventType: "admin_upload_notification_failed",
      title: "Admin-Mail fehlgeschlagen",
      description:
        error instanceof Error
          ? error.message
          : "Die Admin-Benachrichtigung konnte nicht versendet werden.",
      metadata: {
        adminEmail,
        requestNumber: input.requestNumber,
      },
    });
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
    const submittedLeadSource = cleanString(formData.get("source"));
    const cookieLeadSource =
      getCookieValueFromRequest(request, LEAD_SOURCE_COOKIE_NAME);
    const leadSource = normalizeLeadSource(
      submittedLeadSource || cookieLeadSource || request.headers.get("referer"),
      "website"
    );

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
        source: leadSource,
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

    await sendAdminUploadNotificationSafely({
      requestId: createdRequest.id,
      requestNumber: createdRequest.request_number,
      offerUrl,
      customerName,
      childName,
      schoolName,
      className,
      email,
      phone,
      contact,
      message,
      originalFilename: file.name,
      fileType: file.type,
      fileSize: file.size,
    });

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