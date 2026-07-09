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


type UploadedChildInput = {
  clientId: string;
  label: string | null;
  childName: string | null;
  schoolName: string | null;
  className: string | null;
  sortOrder: number;
  fileFieldKey: string;
};

function cleanNullableStringValue(value: unknown) {
  const text = String(value || "").trim();
  return text.length > 0 ? text : null;
}

function parseUploadedChildren(formData: FormData): UploadedChildInput[] {
  const raw = cleanString(formData.get("children"));

  if (!raw) return [];

  let parsed: unknown = null;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((entry, index) => {
      const record = entry as Record<string, unknown>;
      const clientId =
        cleanNullableStringValue(record.clientId) || `child-${index + 1}`;
      const label = cleanNullableStringValue(record.label);
      const childName = cleanNullableStringValue(record.childName);
      const schoolName = cleanNullableStringValue(record.schoolName);
      const className = cleanNullableStringValue(record.className);
      const fileFieldKey =
        cleanNullableStringValue(record.fileFieldKey) || `childFile_${clientId}`;
      const sortOrderValue = Number(record.sortOrder);
      const sortOrder =
        Number.isFinite(sortOrderValue) && sortOrderValue > 0
          ? Math.floor(sortOrderValue)
          : index + 1;

      return {
        clientId,
        label: label || childName || `Kind ${index + 1}`,
        childName,
        schoolName,
        className,
        sortOrder,
        fileFieldKey,
      };
    })
    .filter((entry) => entry.childName || entry.label);
}

function getFileFromFormData(formData: FormData, key: string) {
  const value = formData.get(key);

  return value instanceof File && value.size > 0 ? value : null;
}

function validateUploadFile(file: File) {
  if (file.size <= 0) {
    return "Die hochgeladene Datei ist leer.";
  }

  if (file.size > MAX_FILE_SIZE) {
    return "Die Datei darf maximal 20 MB gross sein.";
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return "Dieses Dateiformat wird noch nicht unterstuetzt. Bitte nutze PDF, JPG, PNG, WEBP oder ein Handyfoto.";
  }

  return null;
}

async function uploadRequestFile(input: {
  requestId: string;
  childId: string | null;
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
      child_id: input.childId,
      storage_path: storagePath,
      file_url: storagePath,
      original_filename: input.file.name,
      file_type: input.file.type,
      file_size: input.file.size,
      source: input.source,
    });

  if (fileRowError) {
    throw new Error(
      `Datei wurde gespeichert, aber nicht sauber verknuepft: ${fileRowError.message}`
    );
  }

  return storagePath;
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
    ? `fÃƒÆ’Ã‚Â¼r ${input.childName}`
    : "fÃƒÆ’Ã‚Â¼r Deine Schulmaterialliste";

  const schoolLine = input.schoolName
    ? `Schule: ${input.schoolName}`
    : null;

  const requestLine = input.requestNumber
    ? `Anfrage: ${input.requestNumber}`
    : null;

  const text = [
    greeting,
    "",
    `vielen Dank fÃƒÆ’Ã‚Â¼r Deine Anfrage bei Handzettel-Schulen.de ${childLine}.`,
    "",
    schoolLine,
    requestLine,
    "",
    "ÃƒÆ’Ã…â€œber den folgenden persÃƒÆ’Ã‚Â¶nlichen Link kannst Du Deine Schulmaterialliste auswerten lassen, Produkte auswÃƒÆ’Ã‚Â¤hlen und Deinen Paketwunsch jederzeit wieder ÃƒÆ’Ã‚Â¶ffnen:",
    "",
    input.offerUrl,
    "",
    "Bitte bewahre diesen Link auf. DarÃƒÆ’Ã‚Â¼ber kommst Du jederzeit wieder zu Deinem persÃƒÆ’Ã‚Â¶nlichen Paketwunsch.",
    "",
    "Viele GrÃƒÆ’Ã‚Â¼ÃƒÆ’Ã…Â¸e",
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
              <div style="margin-top:6px;font-size:14px;line-height:1.35;color:#F7EFE6;">Dein persÃƒÆ’Ã‚Â¶nlicher Link zu Deiner Schulmaterialliste</div>
            </td>
          </tr>
        </table>
      </div>

      <h2 style="color: #102A43; margin-bottom: 12px;">Dein persÃƒÆ’Ã‚Â¶nlicher Link zu Deiner Schulmaterialliste</h2>

      <p>${escapeHtml(greeting)}</p>

      <p>
        vielen Dank fÃƒÆ’Ã‚Â¼r Deine Anfrage bei <strong>Handzettel-Schulen.de</strong>
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
        ÃƒÆ’Ã…â€œber den folgenden persÃƒÆ’Ã‚Â¶nlichen Link kannst Du Deine Schulmaterialliste
        auswerten lassen, Produkte auswÃƒÆ’Ã‚Â¤hlen und Deinen Paketwunsch jederzeit
        wieder ÃƒÆ’Ã‚Â¶ffnen:
      </p>

      <p style="margin: 24px 0;">
        <a
          href="${input.offerUrl}"
          style="background: #B5282D; color: #ffffff; text-decoration: none; padding: 14px 20px; border-radius: 14px; font-weight: bold; display: inline-block;"
        >
          PersÃƒÆ’Ã‚Â¶nlichen Paketwunsch ÃƒÆ’Ã‚Â¶ffnen
        </a>
      </p>

      <p style="font-size: 14px; color: #52616F;">
        Falls der Button nicht funktioniert, kopiere diesen Link in Deinen Browser:<br />
        <a href="${input.offerUrl}" style="color: #12395F;">${input.offerUrl}</a>
      </p>

      <p>
        Bitte bewahre diesen Link auf. DarÃƒÆ’Ã‚Â¼ber kommst Du jederzeit wieder zu
        Deinem persÃƒÆ’Ã‚Â¶nlichen Paketwunsch.
      </p>

      <p>
        Viele GrÃƒÆ’Ã‚Â¼ÃƒÆ’Ã…Â¸e<br />
        <strong>Dein Team von <span style="white-space:nowrap;">Handzettel-Schulen.de</span></strong>
      </p>
    </div>
  `;

  return {
    subject: "Dein persÃƒÆ’Ã‚Â¶nlicher Link zu Deiner Schulmaterialliste",
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
    `DateigrÃƒÆ’Ã‚Â¶ÃƒÆ’Ã…Â¸e: ${formatFileSize(input.fileSize)}`,
    "",
    input.message ? `Nachricht: ${input.message}` : "Nachricht: keine",
    "",
    `Admin-ÃƒÆ’Ã…â€œbersicht: ${adminUrl}`,
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
        <p><strong>DateigrÃƒÆ’Ã‚Â¶ÃƒÆ’Ã…Â¸e:</strong> ${escapeHtml(formatFileSize(input.fileSize))}</p>
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
          Admin-Anfragen ÃƒÆ’Ã‚Â¶ffnen
        </a>
      </p>

      <p>
        <a href="${adminDetailUrl}" style="color: #A75B28; font-weight: bold;">
          Admin-Detail ÃƒÆ’Ã‚Â¶ffnen
        </a>
      </p>

      <p>
        <a href="${input.offerUrl}" style="color: #12395F; font-weight: bold;">
          Kundenlink ÃƒÆ’Ã‚Â¶ffnen
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

const DISCOVERY_SOURCE_VALUES = new Set([
  "instagram",
  "facebook",
  "tiktok",
  "google",
  "flyer_aushang",
  "empfehlung",
]);

function cleanDiscoverySource(value: FormDataEntryValue | null) {
  const raw = cleanString(value) || "";

  return raw && DISCOVERY_SOURCE_VALUES.has(raw) ? raw : null;
}

function getDiscoverySourceLabel(value: string) {
  switch (value) {
    case "instagram":
      return "Instagram";
    case "facebook":
      return "Facebook";
    case "tiktok":
      return "TikTok";
    case "google":
      return "Google";
    case "flyer_aushang":
      return "Flyer/Aushang";
    case "empfehlung":
      return "Empfehlung";
    default:
      return value;
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const customerName = getFirstCleanString(formData, [
      "customer_name",
      "customerName",
      "name",
    ]);

    const uploadedChildrenFromForm = parseUploadedChildren(formData);
    const legacyFile = getFileFromFormData(formData, "file");

    const legacyChildName = getFirstCleanString(formData, [
      "child_name",
      "childName",
    ]);

    const legacyClassName = getFirstCleanString(formData, [
      "class_name",
      "className",
    ]);

    const legacySchoolName = getFirstCleanString(formData, [
      "school_name",
      "schoolName",
    ]);

    const uploadedChildren =
      uploadedChildrenFromForm.length > 0
        ? uploadedChildrenFromForm
        : [
            {
              clientId: "legacy-child-1",
              label: legacyChildName || "Kind 1",
              childName: legacyChildName,
              schoolName: legacySchoolName,
              className: legacyClassName,
              sortOrder: 1,
              fileFieldKey: "file",
            },
          ];

    const childrenWithFiles = uploadedChildren
      .map((child) => {
        const file =
          getFileFromFormData(formData, child.fileFieldKey) ||
          (child.fileFieldKey === "file" ? legacyFile : null);

        return {
          child,
          file,
        };
      })
      .filter((entry): entry is { child: UploadedChildInput; file: File } =>
        Boolean(entry.file)
      );

    if (childrenWithFiles.length === 0) {
      return NextResponse.json(
        { ok: false, message: "Bitte lade mindestens eine Datei hoch." },
        { status: 400 }
      );
    }

    for (const entry of childrenWithFiles) {
      const validationMessage = validateUploadFile(entry.file);

      if (validationMessage) {
        return NextResponse.json(
          { ok: false, message: validationMessage },
          { status: 400 }
        );
      }
    }

    const firstChild = childrenWithFiles[0].child;
    const childName = firstChild.childName || firstChild.label;
    const className = firstChild.className;
    const schoolName = firstChild.schoolName;

    const contact = cleanString(formData.get("contact"));
    const rawEmail = cleanString(formData.get("email"));
    const rawPhone = cleanString(formData.get("phone"));
    const message = cleanString(formData.get("message"));
    const discoverySource = cleanDiscoverySource(
      formData.get("discoverySource") || formData.get("discovery_source")
    );

    if (!discoverySource) {
      return NextResponse.json(
        {
          ok: false,
          message: "Bitte w\u00e4hle aus, wie Du auf uns aufmerksam geworden bist.",
        },
        { status: 400 }
      );
    }
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
    if (!phone) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Bitte gib eine Telefonnummer an. Wir benötigen sie für Rückfragen zur Liste und Updates zu Deinem Paketstatus.",
        },
        { status: 400 }
      );
    }

    const requestInsertPayload = {
      source: leadSource,
      discovery_source: discoverySource,
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
    };

    let createdRequest: any = null;
    let requestError: any = null;

    const insertResult = await supabaseServer
      .from("school_requests")
      .insert(requestInsertPayload)
      .select("id, request_number, offer_token")
      .single();

    createdRequest = insertResult.data;
    requestError = insertResult.error;

    if (
      requestError &&
      (String(requestError.message || "").includes("discovery_source") ||
        String(requestError.code || "") === "PGRST204")
    ) {
      const fallbackPayload = { ...requestInsertPayload } as Record<string, unknown>;
      delete fallbackPayload.discovery_source;

      const fallbackInsertResult = await supabaseServer
        .from("school_requests")
        .insert(fallbackPayload)
        .select("id, request_number, offer_token")
        .single();

      createdRequest = fallbackInsertResult.data;
      requestError = fallbackInsertResult.error;
    }

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

    const childRows = uploadedChildren.map((child, index) => ({
      request_id: createdRequest.id,
      sort_order: child.sortOrder || index + 1,
      label: child.label || child.childName || `Kind ${index + 1}`,
      child_name: child.childName,
      school_name: child.schoolName,
      class_name: child.className,
      source: "customer_upload",
    }));

    const { data: createdChildren, error: childrenError } = await supabaseServer
      .from("school_request_children")
      .insert(childRows)
      .select("id, label, child_name, school_name, class_name, sort_order");

    if (childrenError || !createdChildren) {
      console.error("school_request_children insert error:", childrenError);

      return NextResponse.json(
        {
          ok: false,
          message:
            "Die Anfrage wurde gespeichert, aber die Kinder konnten nicht sauber angelegt werden.",
        },
        { status: 500 }
      );
    }

    const childIdBySortOrder = new Map<number, string>();

    for (const child of createdChildren) {
      const sortOrder = Number(child.sort_order || 0);
      if (sortOrder > 0 && child.id) {
        childIdBySortOrder.set(sortOrder, child.id);
      }
    }

    const uploadedFiles: Array<{
      childLabel: string;
      fileName: string;
      fileType: string;
      fileSize: number;
    }> = [];

    for (const entry of childrenWithFiles) {
      const childId = childIdBySortOrder.get(entry.child.sortOrder) || null;

      await uploadRequestFile({
        requestId: createdRequest.id,
        childId,
        file: entry.file,
        source: "website",
      });

      uploadedFiles.push({
        childLabel: entry.child.label || entry.child.childName || "Kind",
        fileName: entry.file.name,
        fileType: entry.file.type,
        fileSize: entry.file.size,
      });
    }

    await saveRequestEvent({
      requestId: createdRequest.id,
      eventType: "request_received",
      title: "Materialliste eingegangen",
      description:
        uploadedFiles.length > 1
          ? `${uploadedFiles.length} Materiallisten wurden ueber die Website hochgeladen.`
          : "Die Materialliste wurde ueber die Website hochgeladen.",
      metadata: {
        customerName,
        childName,
        schoolName,
        className,
        contact,
        email,
        phone,
        children: uploadedChildren.map((child) => ({
          label: child.label,
          childName: child.childName,
          schoolName: child.schoolName,
          className: child.className,
          sortOrder: child.sortOrder,
        })),
        uploadedFiles,
      },
    });

    const siteUrl = getSiteUrl();
    const offerUrl = `${siteUrl}/angebot/${createdRequest.offer_token}`;
    const firstFile = childrenWithFiles[0].file;

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
      message: [
        message,
        `Aufmerksam geworden: ${getDiscoverySourceLabel(discoverySource)}`,
        uploadedFiles.length > 1
          ? `Mehrkind-Upload: ${uploadedFiles
              .map((file) => `${file.childLabel}: ${file.fileName}`)
              .join(", ")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      originalFilename: firstFile.name,
      fileType: firstFile.type,
      fileSize: firstFile.size,
    });

    let emailSent = false;
    let emailMessage: string | null = email
      ? "Kundenmail nach Upload bewusst deaktiviert. Die naechste Kundenmail erfolgt erst, wenn der Paketwunsch fertig ist oder nach verbindlicher Bestellung mit Rechnung."
      : "Es wurde keine E-Mail-Adresse angegeben. Es wurde keine Kundenmail versendet.";

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
      childCount: createdChildren.length,
      fileCount: uploadedFiles.length,
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