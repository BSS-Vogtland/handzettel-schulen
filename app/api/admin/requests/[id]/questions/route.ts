import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import { after, NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

type AnyRecord = Record<string, any>;

type QuestionMailResult =
  | { sent: true; email: string; offerUrl: string }
  | { sent: false; reason: string };

function jsonResponse(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase Umgebungsvariablen fehlen. PrÃ¼fe NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function pickFirst(
  row: AnyRecord | null | undefined,
  keys: string[],
  fallback = ""
) {
  if (!row) return fallback;

  for (const key of keys) {
    const value = row[key];

    if (value !== null && value !== undefined && String(value).trim() !== "") {
      return String(value).trim();
    }
  }

  return fallback;
}

function getSiteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "https://www.handzettel-schulen.de"
  );
}

function getCustomerEmail(requestData: AnyRecord) {
  return pickFirst(requestData, [
    "email",
    "customer_email",
    "parent_email",
    "contact_email",
    "guardian_email",
  ]);
}

function getCustomerName(requestData: AnyRecord) {
  return pickFirst(requestData, [
    "customer_name",
    "parent_name",
    "guardian_name",
    "name",
    "contact_name",
  ]);
}

function getChildName(requestData: AnyRecord) {
  return pickFirst(requestData, ["child_name", "child", "student_name"]);
}

function getSchoolName(requestData: AnyRecord) {
  return pickFirst(requestData, ["school_name", "school"]);
}

function getClassName(requestData: AnyRecord) {
  return pickFirst(requestData, ["class_name", "class"]);
}

function getRequestNumber(requestData: AnyRecord) {
  return pickFirst(requestData, ["request_number"]);
}

function getRequestToken(requestData: AnyRecord) {
  return pickFirst(requestData, [
    "offer_token",
    "token",
    "public_token",
    "access_token",
    "customer_token",
  ]);
}

function getRequestItemTitle(requestItem: AnyRecord | null) {
  if (!requestItem) return "Unklare Listenposition";

  return pickFirst(
    requestItem,
    [
      "normalized_name",
      "raw_text",
      "product_name",
      "name",
      "title",
      "label",
      "description",
    ],
    "Unklare Listenposition"
  );
}

function createTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error("SMTP-Konfiguration unvollstÃ¤ndig.");
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

function createQuestionMailHtml(params: {
  customerName: string;
  childName: string;
  schoolName: string;
  className: string;
  requestNumber: string;
  offerUrl: string;
  requestItemTitle: string;
  questionText: string;
}) {
  const {
    customerName,
    childName,
    schoolName,
    className,
    requestNumber,
    offerUrl,
    requestItemTitle,
    questionText,
  } = params;

  const greeting = customerName ? `Hallo ${escapeHtml(customerName)},` : "Hallo,";

  const hasSchoolInfo = Boolean(
    childName || schoolName || className || requestNumber
  );

  return `
<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <title>Kurze RÃ¼ckfrage zu Deiner Materialliste</title>
  </head>
  <body style="margin:0;padding:0;background:#FBF7F0;font-family:Arial,Helvetica,sans-serif;color:#102A43;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#FBF7F0;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border-radius:24px;overflow:hidden;border:1px solid #eadfce;">
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
                      <div style="margin-top:6px;font-size:14px;line-height:1.35;color:#F7EFE6;">Kurze RÃ¼ckfrage zu Deiner Materialliste</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:30px;">
                <p style="margin:0 0 16px;font-size:16px;line-height:1.55;">${greeting}</p>

                <p style="margin:0 0 16px;font-size:16px;line-height:1.55;">
                  wir prÃ¼fen gerade Deine Materialliste und haben noch eine kurze RÃ¼ckfrage zu einer Position.
                </p>

                ${
                  hasSchoolInfo
                    ? `
                    <div style="background:#FBF7F0;border:1px solid #E8DED2;border-radius:18px;padding:16px;margin:20px 0;">
                      ${
                        requestNumber
                          ? `<p style="margin:0 0 6px;font-size:14px;"><strong>Anfrage:</strong> ${escapeHtml(
                              requestNumber
                            )}</p>`
                          : ""
                      }
                      ${
                        childName
                          ? `<p style="margin:0 0 6px;font-size:14px;"><strong>Kind:</strong> ${escapeHtml(
                              childName
                            )}</p>`
                          : ""
                      }
                      ${
                        schoolName
                          ? `<p style="margin:0 0 6px;font-size:14px;"><strong>Schule:</strong> ${escapeHtml(
                              schoolName
                            )}</p>`
                          : ""
                      }
                      ${
                        className
                          ? `<p style="margin:0;font-size:14px;"><strong>Klasse:</strong> ${escapeHtml(
                              className
                            )}</p>`
                          : ""
                      }
                    </div>
                  `
                    : ""
                }

                <div style="border:1px solid #F1D1A8;background:#FFF8EE;border-radius:18px;padding:18px;margin:22px 0;">
                  <div style="font-size:13px;font-weight:800;color:#A75B28;text-transform:uppercase;letter-spacing:0.12em;margin-bottom:10px;">
                    RÃ¼ckfrage
                  </div>

                  <p style="margin:0 0 10px;font-size:15px;line-height:1.55;color:#102A43;">
                    <strong>Position:</strong> ${escapeHtml(requestItemTitle)}
                  </p>

                  <p style="margin:0;font-size:16px;line-height:1.6;color:#102A43;font-weight:700;">
                    ${escapeHtml(questionText)}
                  </p>
                </div>

                <p style="margin:0 0 18px;font-size:16px;line-height:1.55;">
                  Bitte Ã¶ffne Deinen persÃ¶nlichen PrÃ¼flink und beantworte die RÃ¼ckfrage dort direkt auf der Seite.
                </p>

                <table role="presentation" cellspacing="0" cellpadding="0" style="margin:28px 0;">
                  <tr>
                    <td style="border-radius:16px;background:#B5282D;">
                      <a href="${offerUrl}" style="display:inline-block;padding:16px 24px;color:#ffffff;text-decoration:none;font-size:16px;font-weight:800;border-radius:16px;">
                        RÃ¼ckfrage beantworten
                      </a>
                    </td>
                  </tr>
                </table>

                <div style="background:#F0FFF6;border:1px solid #BFE3CD;border-radius:18px;padding:16px;margin:24px 0;color:#2F7D50;">
                  <p style="margin:0;font-size:14px;line-height:1.55;font-weight:700;">
                    Sobald Deine Antwort eingegangen ist, kÃ¶nnen wir Dein Schulpaket weiter vorbereiten.
                  </p>
                </div>

                <p style="margin:0 0 16px;font-size:14px;line-height:1.55;color:#5C6B73;">
                  Falls der Button nicht funktioniert, kopiere diesen Link in Deinen Browser:<br />
                  <a href="${offerUrl}" style="color:#8A3A2B;word-break:break-all;">${offerUrl}</a>
                </p>

                <p style="margin:26px 0 0;font-size:16px;line-height:1.55;">
                  Viele GrÃ¼ÃŸe<br />
                  Dein Team von <span style="white-space:nowrap;">Handzettel-Schulen.de</span>
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding:18px 30px;background:#FBF7F0;color:#5C6B73;font-size:12px;line-height:1.45;">
                Diese E-Mail wurde gesendet, weil Du Ã¼ber Handzettel-Schulen.de eine Schulmaterialliste eingereicht hast.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function createQuestionMailText(params: {
  customerName: string;
  childName: string;
  schoolName: string;
  className: string;
  requestNumber: string;
  offerUrl: string;
  requestItemTitle: string;
  questionText: string;
}) {
  const {
    customerName,
    childName,
    schoolName,
    className,
    requestNumber,
    offerUrl,
    requestItemTitle,
    questionText,
  } = params;

  const greeting = customerName ? `Hallo ${customerName},` : "Hallo,";

  const schoolInfoLines = [
    requestNumber ? `Anfrage: ${requestNumber}` : "",
    childName ? `Kind: ${childName}` : "",
    schoolName ? `Schule: ${schoolName}` : "",
    className ? `Klasse: ${className}` : "",
  ].filter(Boolean);

  return `${greeting}

wir prÃ¼fen gerade Deine Materialliste und haben noch eine kurze RÃ¼ckfrage zu einer Position.

${schoolInfoLines.length > 0 ? `${schoolInfoLines.join("\n")}\n\n` : ""}Position: ${requestItemTitle}

RÃ¼ckfrage:
${questionText}

Bitte Ã¶ffne Deinen persÃ¶nlichen PrÃ¼flink und beantworte die RÃ¼ckfrage dort direkt auf der Seite:

${offerUrl}

Sobald Deine Antwort eingegangen ist, kÃ¶nnen wir Dein Schulpaket weiter vorbereiten.

Viele GrÃ¼ÃŸe
Dein Team von Handzettel-Schulen.de`;
}

async function createRequestEvent(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  requestId: string,
  eventType: string,
  message: string,
  metadata?: Record<string, unknown>
) {
  const payloads = [
    {
      request_id: requestId,
      event_type: eventType,
      title: "RÃ¼ckfrage",
      description: message,
      created_at: new Date().toISOString(),
    },
    {
      request_id: requestId,
      event_type: eventType,
      message,
    },
    {
      request_id: requestId,
      type: eventType,
      message,
    },
  ];

  for (const payload of payloads) {
    const { error } = await supabase
      .from("school_request_events")
      .insert(payload);

    if (!error) return;
  }
}

async function sendQuestionNotificationMail(params: {
  requestData: AnyRecord;
  requestItem: AnyRecord | null;
  questionText: string;
}): Promise<QuestionMailResult> {
  const { requestData, requestItem, questionText } = params;

  const customerEmail = getCustomerEmail(requestData);
  const token = getRequestToken(requestData);

  if (!customerEmail) {
    return {
      sent: false,
      reason:
        "FÃ¼r diese Anfrage wurde keine Kunden-E-Mail gefunden. Die RÃ¼ckfrage wurde gespeichert, aber keine Mail versendet.",
    };
  }

  if (!token) {
    return {
      sent: false,
      reason:
        "FÃ¼r diese Anfrage wurde kein Angebots-Token gefunden. Die RÃ¼ckfrage wurde gespeichert, aber kein PrÃ¼flink konnte versendet werden.",
    };
  }

  const encodedToken = encodeURIComponent(token);
  const offerUrl = `${getSiteUrl()}/angebot/${encodedToken}`;

  const customerName = getCustomerName(requestData);
  const childName = getChildName(requestData);
  const schoolName = getSchoolName(requestData);
  const className = getClassName(requestData);
  const requestNumber = getRequestNumber(requestData);
  const requestItemTitle = getRequestItemTitle(requestItem);

  const transporter = createTransporter();

  const from =
    process.env.SMTP_FROM ||
    process.env.SMTP_USER ||
    "Handzettel-Schulen.de";

  const subject = "Kurze RÃ¼ckfrage zu Deiner Materialliste";

  const mailParams = {
    customerName,
    childName,
    schoolName,
    className,
    requestNumber,
    offerUrl,
    requestItemTitle,
    questionText,
  };

  await transporter.sendMail({
    from,
    to: customerEmail,
    subject,
    text: createQuestionMailText(mailParams),
    html: createQuestionMailHtml(mailParams),
  });

  return {
    sent: true,
    email: customerEmail,
    offerUrl,
  };
}

export async function POST(request: NextRequest, context: Params) {
  try {
    const { id } = await context.params;
    const supabase = getSupabaseAdmin();

    const body = await request.json().catch(() => null);

    const requestItemId =
      typeof body?.requestItemId === "string" && body.requestItemId.trim()
        ? body.requestItemId.trim()
        : null;

    const questionText = String(body?.questionText || "").trim();

    if (!id) {
      return jsonResponse(
        {
          ok: false,
          message: "Keine Anfrage-ID Ã¼bergeben.",
        },
        400
      );
    }

    if (questionText.length < 3) {
      return jsonResponse(
        {
          ok: false,
          message: "Bitte gib eine konkrete RÃ¼ckfrage ein.",
        },
        400
      );
    }

    const { data: requestData, error: requestError } = await supabase
      .from("school_requests")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (requestError) {
      return jsonResponse(
        {
          ok: false,
          message: `Anfrage konnte nicht geladen werden: ${requestError.message}`,
        },
        500
      );
    }

    if (!requestData) {
      return jsonResponse(
        {
          ok: false,
          message: "Anfrage wurde nicht gefunden.",
        },
        404
      );
    }

    let requestItem: AnyRecord | null = null;

    if (requestItemId) {
      const { data: itemData, error: itemError } = await supabase
        .from("school_request_items")
        .select("*")
        .eq("id", requestItemId)
        .eq("request_id", id)
        .maybeSingle();

      if (itemError) {
        return jsonResponse(
          {
            ok: false,
            message: `Listenposition konnte nicht geprÃ¼ft werden: ${itemError.message}`,
          },
          500
        );
      }

      if (!itemData) {
        return jsonResponse(
          {
            ok: false,
            message: "Die gewÃ¤hlte Listenposition gehÃ¶rt nicht zu dieser Anfrage.",
          },
          400
        );
      }

      requestItem = itemData as AnyRecord;
    }

    const questionChildId =
      requestItem && requestItem.child_id
        ? String(requestItem.child_id).trim() || null
        : null;

    const { data: question, error: insertError } = await supabase
      .from("school_request_item_questions")
      .insert({
        request_id: id,
        request_item_id: requestItemId,
        child_id: questionChildId,
        question_text: questionText,
        status: "pending",
        channel: "portal",
        created_by: "admin",
        created_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (insertError) {
      return jsonResponse(
        {
          ok: false,
          message: `RÃ¼ckfrage konnte nicht gespeichert werden: ${insertError.message}`,
        },
        500
      );
    }

    await createRequestEvent(
      supabase,
      id,
      "request_item_question_created",
      "Eine positionsbezogene RÃ¼ckfrage wurde erstellt.",
      {
        questionId: question?.id,
        requestItemId,
        childId: questionChildId,
      }
    );

    const mailResult: QuestionMailResult = {
      sent: false,
      reason: "RÃ¼ckfrage wurde gespeichert. Der Mailversand lÃ¤uft im Hintergrund.",
    };

    after(async () => {
      console.log("admin_question_mail_after_started", { requestId: id, requestItemId });
      try {
        const backgroundMailResult = await sendQuestionNotificationMail({
          requestData,
          questionText,
          requestItem,
        });

        await supabase.from("school_request_events").insert({
          request_id: id,
          event_type: backgroundMailResult.sent
            ? "background_question_mail_sent"
            : "background_question_mail_skipped",
          title: backgroundMailResult.sent
            ? "RÃ¼ckfrage-Mail versendet"
            : "RÃ¼ckfrage-Mail nicht versendet",
          description: backgroundMailResult.sent
            ? `RÃ¼ckfrage-Mail wurde nach schneller Serverantwort an ${backgroundMailResult.email} gesendet.`
            : backgroundMailResult.reason || "RÃ¼ckfrage-Mail wurde nicht versendet.",
        });
      } catch (mailError) {
        console.error("after question mail error:", mailError);

        try {
          await supabase.from("school_request_events").insert({
            request_id: id,
            event_type: "background_question_mail_failed",
            title: "RÃ¼ckfrage-Mail konnte nicht versendet werden",
            description:
              mailError instanceof Error
                ? mailError.message
                : "Unbekannter Fehler beim Versand der RÃ¼ckfrage-Mail.",
          });
        } catch (eventError) {
          console.error("after question mail failed event error:", eventError);
        }
      }
    });

    await supabase.from("school_request_events").insert({
      request_id: id,
      event_type: "background_question_mail_started",
      title: "RÃ¼ckfrage-Mailversand gestartet",
      description: "Der Mailversand zur RÃ¼ckfrage wurde gestartet.",
    });

    return NextResponse.json({
      ok: true,
      question,
      mail: mailResult,
      message: "RÃ¼ckfrage wurde gespeichert. Der Mailversand lÃ¤uft im Hintergrund.",
    });
  } catch (error) {
    console.error("Admin request question create error:", error);

    return jsonResponse(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "RÃ¼ckfrage konnte nicht gespeichert werden.",
      },
      500
    );
  }
}

