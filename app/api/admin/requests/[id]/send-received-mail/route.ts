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

function createMailHtml(params: {
  customerName: string;
  childName: string;
  schoolName: string;
  className: string;
  requestNumber: string;
}) {
  const { customerName, childName, schoolName, className, requestNumber } = params;
  const greeting = customerName ? `Hallo ${escapeHtml(customerName)},` : "Hallo,";

  return `
<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <title>Deine Liste ist angekommen</title>
  </head>
  <body style="margin:0;padding:0;background:#FBF7F0;font-family:Arial,Helvetica,sans-serif;color:#102A43;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#FBF7F0;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border-radius:24px;overflow:hidden;border:1px solid #eadfce;">
            <tr>
              <td style="background:#102A43;padding:28px 30px;color:#ffffff;">
                <div style="font-size:22px;font-weight:800;letter-spacing:-0.3px;">Handzettel-Schulen.de</div>
                <div style="margin-top:6px;font-size:14px;color:#F7EFE6;">Deine Schulmaterialliste ist angekommen</div>
              </td>
            </tr>

            <tr>
              <td style="padding:30px;">
                <p style="margin:0 0 16px;font-size:16px;line-height:1.55;">${greeting}</p>

                <p style="margin:0 0 16px;font-size:16px;line-height:1.55;">
                  Deine Schulmaterialliste ist bei uns angekommen.
                </p>

                <p style="margin:0 0 18px;font-size:16px;line-height:1.55;">
                  Wir prüfen Deine Angaben und bereiten daraus Deinen persönlichen Paketwunsch vor.
                  Sobald Dein Paketwunsch vorbereitet ist, bekommst Du eine weitere E-Mail mit einem Link zur Prüfung.
                </p>

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
                  Dein Team von Handzettel-Schulen.de
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
}) {
  const { customerName, childName, schoolName, className, requestNumber } = params;
  const greeting = customerName ? `Hallo ${customerName},` : "Hallo,";

  return `${greeting}

Deine Schulmaterialliste ist bei uns angekommen.

Wir prüfen Deine Angaben und bereiten daraus Deinen persönlichen Paketwunsch vor.
Sobald Dein Paketwunsch vorbereitet ist, bekommst Du eine weitere E-Mail mit einem Link zur Prüfung.

${requestNumber ? `Anfrage: ${requestNumber}\n` : ""}${childName ? `Kind: ${childName}\n` : ""}${schoolName ? `Schule: ${schoolName}\n` : ""}${className ? `Klasse: ${className}\n` : ""}

Wichtig:
Diese E-Mail bestätigt nur den Eingang Deiner Liste. Es wurde dadurch noch keine Bestellung ausgelöst.

Viele Grüße
Dein Team von Handzettel-Schulen.de`;
}

async function insertEvent(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  requestId: string;
  customerEmail: string;
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
      },
      created_at: new Date().toISOString(),
    },
    {
      request_id: params.requestId,
      type: "request_received_mail_sent",
      message,
      metadata: {
        email: params.customerEmail,
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

    const subject = "Deine Schulmaterialliste ist bei uns angekommen";

    const mailParams = {
      customerName,
      childName,
      schoolName,
      className,
      requestNumber,
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