import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type AnyRecord = Record<string, any>;

type MailVariant =
  | "standard_upload"
  | "manual_review_upload"
  | "standard_whatsapp"
  | "manual_review_whatsapp";

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase Umgebungsvariablen fehlen. Prüfe NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function pickFirst(row: AnyRecord | null | undefined, keys: string[], fallback = "") {
  if (!row) return fallback;

  for (const key of keys) {
    const value = row[key];

    if (value !== null && value !== undefined && String(value).trim() !== "") {
      return String(value).trim();
    }
  }

  return fallback;
}

function getCustomerEmail(request: AnyRecord) {
  return pickFirst(request, [
    "email",
    "customer_email",
    "parent_email",
    "contact_email",
    "guardian_email",
  ]);
}

function getCustomerName(request: AnyRecord) {
  return pickFirst(
    request,
    ["customer_name", "parent_name", "guardian_name", "name", "contact_name"],
    ""
  );
}

function getChildName(request: AnyRecord) {
  return pickFirst(request, ["child_name", "child", "student_name"], "");
}

function getSchoolName(request: AnyRecord) {
  return pickFirst(request, ["school_name", "school"], "");
}

function getClassName(request: AnyRecord) {
  return pickFirst(request, ["class_name", "class"], "");
}


function getSiteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "https://www.handzettel-schulen.de"
  );
}

function createTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error("SMTP-Konfiguration unvollständig.");
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user,
      pass,
    },
  });
}

function escapeHtml(value: string) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isWhatsappRequest(request: AnyRecord) {
  const source = String(request.source || "").trim().toLowerCase();

  return (
    source === "whatsapp_manual" ||
    source === "whatsapp" ||
    source.includes("whatsapp")
  );
}

function needsManualReview(request: AnyRecord) {
  const status = String(request.status || "").trim().toLowerCase();
  const aiStatus = String(request.ai_status || "").trim().toLowerCase();
  const offerStatus = String(request.offer_status || "").trim().toLowerCase();

  return (
    status === "manual_review" ||
    aiStatus === "manual_review" ||
    aiStatus === "no_items_detected" ||
    aiStatus === "missing_file" ||
    aiStatus === "error" ||
    offerStatus === "manual_review"
  );
}

function getMailVariant(request: AnyRecord): MailVariant {
  const whatsapp = isWhatsappRequest(request);
  const manualReview = needsManualReview(request);

  if (whatsapp && manualReview) return "manual_review_whatsapp";
  if (whatsapp) return "standard_whatsapp";
  if (manualReview) return "manual_review_upload";

  return "standard_upload";
}

function getSubject(variant: MailVariant) {
  switch (variant) {
    case "manual_review_whatsapp":
      return "Deine WhatsApp-Liste ist angekommen – wir prüfen sie persönlich";
    case "standard_whatsapp":
      return "Deine WhatsApp-Liste ist bei uns angekommen";
    case "manual_review_upload":
      return "Deine Schulmaterialliste ist angekommen – wir prüfen sie persönlich";
    case "standard_upload":
    default:
      return "Deine Schulmaterialliste ist bei uns angekommen";
  }
}

function getHeaderSubtitle(variant: MailVariant) {
  switch (variant) {
    case "manual_review_whatsapp":
      return "Deine WhatsApp-Liste wird persönlich bearbeitet";
    case "standard_whatsapp":
      return "Deine WhatsApp-Liste ist angekommen";
    case "manual_review_upload":
      return "Deine Liste wird persönlich bearbeitet";
    case "standard_upload":
    default:
      return "Deine Schulmaterialliste ist angekommen";
  }
}

function getIntroTextHtml(variant: MailVariant) {
  switch (variant) {
    case "manual_review_whatsapp":
      return `
        <p style="margin:0 0 16px;font-size:16px;line-height:1.55;">
          Deine Schulmaterialliste ist über WhatsApp bei uns angekommen.
        </p>

        <p style="margin:0 0 18px;font-size:16px;line-height:1.55;">
          Die automatische Erkennung konnte daraus noch keinen eindeutigen Paketwunsch vorbereiten.
          Keine Sorge: Wir prüfen Deine Liste persönlich und bereiten Deinen Paketwunsch manuell vor.
          Du musst dafür nichts weiter tun.
        </p>
      `;

    case "standard_whatsapp":
      return `
        <p style="margin:0 0 16px;font-size:16px;line-height:1.55;">
          Deine Schulmaterialliste ist über WhatsApp bei uns angekommen.
        </p>

        <p style="margin:0 0 18px;font-size:16px;line-height:1.55;">
          Wir prüfen Deine Angaben und bereiten daraus Deinen persönlichen Paketwunsch vor.
          Sobald Dein Paketwunsch vorbereitet ist, bekommst Du eine weitere E-Mail mit einem Link zur Prüfung.
        </p>
      `;

    case "manual_review_upload":
      return `
        <p style="margin:0 0 16px;font-size:16px;line-height:1.55;">
          Deine Schulmaterialliste ist bei uns angekommen.
        </p>

        <p style="margin:0 0 18px;font-size:16px;line-height:1.55;">
          Die automatische Erkennung konnte Deine Liste noch nicht eindeutig auswerten.
          Keine Sorge: Wir prüfen Deine Liste persönlich und bereiten Deinen Paketwunsch manuell vor.
          Du musst dafür nichts weiter tun.
        </p>
      `;

    case "standard_upload":
    default:
      return `
        <p style="margin:0 0 16px;font-size:16px;line-height:1.55;">
          Deine Schulmaterialliste ist bei uns angekommen.
        </p>

        <p style="margin:0 0 18px;font-size:16px;line-height:1.55;">
          Wir prüfen Deine Angaben und bereiten daraus Deinen persönlichen Paketwunsch vor.
          Sobald Dein Paketwunsch vorbereitet ist, bekommst Du eine weitere E-Mail mit einem Link zur Prüfung.
        </p>
      `;
  }
}

function getIntroTextPlain(variant: MailVariant) {
  switch (variant) {
    case "manual_review_whatsapp":
      return `Deine Schulmaterialliste ist über WhatsApp bei uns angekommen.

Die automatische Erkennung konnte daraus noch keinen eindeutigen Paketwunsch vorbereiten.
Keine Sorge: Wir prüfen Deine Liste persönlich und bereiten Deinen Paketwunsch manuell vor.
Du musst dafür nichts weiter tun.`;

    case "standard_whatsapp":
      return `Deine Schulmaterialliste ist über WhatsApp bei uns angekommen.

Wir prüfen Deine Angaben und bereiten daraus Deinen persönlichen Paketwunsch vor.
Sobald Dein Paketwunsch vorbereitet ist, bekommst Du eine weitere E-Mail mit einem Link zur Prüfung.`;

    case "manual_review_upload":
      return `Deine Schulmaterialliste ist bei uns angekommen.

Die automatische Erkennung konnte Deine Liste noch nicht eindeutig auswerten.
Keine Sorge: Wir prüfen Deine Liste persönlich und bereiten Deinen Paketwunsch manuell vor.
Du musst dafür nichts weiter tun.`;

    case "standard_upload":
    default:
      return `Deine Schulmaterialliste ist bei uns angekommen.

Wir prüfen Deine Angaben und bereiten daraus Deinen persönlichen Paketwunsch vor.
Sobald Dein Paketwunsch vorbereitet ist, bekommst Du eine weitere E-Mail mit einem Link zur Prüfung.`;
  }
}

function createMailHtml(params: {
  customerName: string;
  childName: string;
  schoolName: string;
  className: string;
  requestNumber: string;
  variant: MailVariant;
}) {
  const {
    customerName,
    childName,
    schoolName,
    className,
    requestNumber,
    variant,
  } = params;

  const greeting = customerName ? `Hallo ${escapeHtml(customerName)},` : "Hallo,";
  const subtitle = getHeaderSubtitle(variant);
  const introHtml = getIntroTextHtml(variant);
  const manualReview = variant === "manual_review_upload" || variant === "manual_review_whatsapp";

  return `
<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(getSubject(variant))}</title>
  </head>
  <body style="margin:0;padding:0;background:#FBF7F0;font-family:Arial,Helvetica,sans-serif;color:#102A43;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#FBF7F0;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border-radius:24px;overflow:hidden;border:1px solid #eadfce;">
            <tr>
              <td style="background:#102A43;padding:24px 30px;color:#ffffff;">
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
                      <div style="margin-top:6px;font-size:14px;line-height:1.35;color:#F7EFE6;">${escapeHtml(subtitle)}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:30px;">
                <p style="margin:0 0 16px;font-size:16px;line-height:1.55;">${greeting}</p>

                ${introHtml}

                ${
                  manualReview
                    ? `<div style="background:#FFF4F4;border:1px solid #F1B8B8;border-radius:18px;padding:16px;margin:22px 0;color:#9F1F2A;">
                        <p style="margin:0;font-size:14px;line-height:1.55;font-weight:800;">
                          Deine Anfrage ist bei uns in der persönlichen Bearbeitung. Es wurde dadurch noch keine Bestellung ausgelöst.
                        </p>
                      </div>`
                    : ""
                }

                <div style="background:#FBF7F0;border:1px solid #E8DED2;border-radius:18px;padding:16px;margin:22px 0;">
                  <div style="font-size:13px;font-weight:800;color:#A75B28;text-transform:uppercase;letter-spacing:0.12em;margin-bottom:10px;">
                    Deine Angaben
                  </div>

                  ${requestNumber ? `<p style="margin:0 0 6px;font-size:14px;"><strong>Anfrage:</strong> ${escapeHtml(requestNumber)}</p>` : ""}
                  ${childName ? `<p style="margin:0 0 6px;font-size:14px;"><strong>Kind:</strong> ${escapeHtml(childName)}</p>` : ""}
                  ${schoolName ? `<p style="margin:0 0 6px;font-size:14px;"><strong>Schule:</strong> ${escapeHtml(schoolName)}</p>` : ""}
                  ${className ? `<p style="margin:0;font-size:14px;"><strong>Klasse:</strong> ${escapeHtml(className)}</p>` : ""}
                </div>

                <div style="background:#FFF8EE;border:1px solid #F1D1A8;border-radius:18px;padding:16px;margin:24px 0;color:#8A4A1F;">
                  <p style="margin:0;font-size:14px;line-height:1.55;font-weight:700;">
                    Wichtig: Diese E-Mail bestätigt nur den Eingang Deiner Liste. Es wurde dadurch noch keine Bestellung ausgelöst.
                  </p>
                </div>

                <p style="margin:26px 0 0;font-size:16px;line-height:1.55;">
                  Viele Grüße<br />
                  Dein Team von <span style="white-space:nowrap;">Handzettel-Schulen.de</span>
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding:18px 30px;background:#FBF7F0;color:#5C6B73;font-size:12px;line-height:1.45;">
                Diese E-Mail wurde gesendet, weil Du über Handzettel-Schulen.de eine Schulmaterialliste eingereicht hast.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function createMailText(params: {
  customerName: string;
  childName: string;
  schoolName: string;
  className: string;
  requestNumber: string;
  variant: MailVariant;
}) {
  const {
    customerName,
    childName,
    schoolName,
    className,
    requestNumber,
    variant,
  } = params;

  const greeting = customerName ? `Hallo ${customerName},` : "Hallo,";
  const intro = getIntroTextPlain(variant);
  const manualReview = variant === "manual_review_upload" || variant === "manual_review_whatsapp";

  return `${greeting}

${intro}

${manualReview ? "Deine Anfrage ist bei uns in der persönlichen Bearbeitung. Es wurde dadurch noch keine Bestellung ausgelöst.\n\n" : ""}${requestNumber ? `Anfrage: ${requestNumber}\n` : ""}${childName ? `Kind: ${childName}\n` : ""}${schoolName ? `Schule: ${schoolName}\n` : ""}${className ? `Klasse: ${className}\n` : ""}

Wichtig:
Diese E-Mail bestätigt nur den Eingang Deiner Liste. Es wurde dadurch noch keine Bestellung ausgelöst.

Viele Grüße
Dein Team von Handzettel-Schulen.de`;
}

async function insertEvent(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  requestId: string;
  customerEmail: string;
  variant: MailVariant;
}) {
  const message = `Eingangsmail wurde an ${params.customerEmail} gesendet.`;

  const payloads = [
    {
      request_id: params.requestId,
      event_type: "request_received_mail_sent",
      title: "Eingangsmail versendet",
      message,
      description: message,
      metadata: {
        email: params.customerEmail,
        mailVariant: params.variant,
      },
      created_at: new Date().toISOString(),
    },
    {
      request_id: params.requestId,
      type: "request_received_mail_sent",
      message,
      metadata: {
        email: params.customerEmail,
        mailVariant: params.variant,
      },
      created_at: new Date().toISOString(),
    },
  ];

  for (const payload of payloads) {
    const { error } = await params.supabase
      .from("school_request_events")
      .insert(payload);

    if (!error) return;
  }
}

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const requestId = String(id || "").trim();

    if (!requestId) {
      return NextResponse.json(
        { ok: false, error: "Ungültige Anfrage-ID." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: schoolRequest, error: requestError } = await supabase
      .from("school_requests")
      .select("*")
      .eq("id", requestId)
      .maybeSingle();

    if (requestError || !schoolRequest) {
      return NextResponse.json(
        {
          ok: false,
          error: "Anfrage wurde nicht gefunden.",
          details: requestError?.message ?? null,
        },
        { status: 404 }
      );
    }

    const variant = getMailVariant(schoolRequest);
    const customerEmail = getCustomerEmail(schoolRequest);
    const customerName = getCustomerName(schoolRequest);
    const childName = getChildName(schoolRequest);
    const schoolName = getSchoolName(schoolRequest);
    const className = getClassName(schoolRequest);
    const requestNumber = pickFirst(schoolRequest, ["request_number"], "");

    if (!customerEmail) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Für diese Anfrage wurde keine Kunden-E-Mail gefunden. Bitte prüfe die Anfrage-Daten.",
        },
        { status: 400 }
      );
    }

    const transporter = createTransporter();

    const from =
      process.env.SMTP_FROM ||
      process.env.SMTP_USER ||
      "Handzettel-Schulen.de";

    const subject = getSubject(variant);

    const mailParams = {
      customerName,
      childName,
      schoolName,
      className,
      requestNumber,
      variant,
    };

    await transporter.sendMail({
      from,
      to: customerEmail,
      subject,
      text: createMailText(mailParams),
      html: createMailHtml(mailParams),
    });

    await insertEvent({
      supabase,
      requestId,
      customerEmail,
      variant,
    });

    await supabase
      .from("school_requests")
      .update({
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestId);

    return NextResponse.json({
      ok: true,
      message: "Eingangsmail wurde erfolgreich gesendet.",
      sentTo: customerEmail,
      mailVariant: variant,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unbekannter Fehler beim Senden der Eingangsmail.";

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 }
    );
  }
}