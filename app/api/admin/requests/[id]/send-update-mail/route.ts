import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import { NextResponse } from "next/server";
import { assertAdminRequestReadyForOfferMail } from "@/lib/adminRequestWorkflow";

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

function pickNumber(row: AnyRecord | null | undefined, keys: string[], fallback = 0) {
  if (!row) return fallback;

  for (const key of keys) {
    const value = row[key];

    if (value !== null && value !== undefined && value !== "") {
      const numberValue = Number(String(value).replace(",", "."));
      if (Number.isFinite(numberValue)) return numberValue;
    }
  }

  return fallback;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

function getSiteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "https://www.handzettel-schulen.de"
  );
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

function getRequestToken(request: AnyRecord) {
  return pickFirst(request, [
    "offer_token",
    "token",
    "public_token",
    "access_token",
    "customer_token",
  ]);
}

function getItemName(item: AnyRecord) {
  return pickFirst(
    item,
    [
      "product_name",
      "name",
      "title",
      "label",
      "manual_name",
      "custom_name",
      "description",
      "item_name",
    ],
    "Produkt"
  );
}

function getItemSku(item: AnyRecord) {
  return pickFirst(item, ["product_sku", "sku", "article_number"], "");
}

function getItemUnit(item: AnyRecord) {
  return pickFirst(item, ["unit", "quantity_unit"], "Stk.");
}

function getItemQuantity(item: AnyRecord) {
  return pickNumber(item, ["quantity", "qty", "amount"], 1) || 1;
}

function getItemPrice(item: AnyRecord) {
  return pickNumber(item, [
    "product_price",
    "unit_price",
    "price",
    "price_gross",
    "sale_price_gross",
  ]);
}

function getItemTotal(item: AnyRecord) {
  const existingTotal = pickNumber(item, [
    "total_price",
    "line_total",
    "sum",
    "subtotal",
  ]);

  if (existingTotal > 0) return existingTotal;

  return getItemQuantity(item) * getItemPrice(item);
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

function createOfferItemsHtml(offerItems: AnyRecord[]) {
  const visibleItems = offerItems.slice(0, 8);

  return visibleItems
    .map((item) => {
      const name = getItemName(item);
      const sku = getItemSku(item);
      const quantity = getItemQuantity(item);
      const unit = getItemUnit(item);
      const total = getItemTotal(item);

      return `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #E8DED2;">
            <div style="font-weight:800;color:#102A43;">${escapeHtml(name)}</div>
            ${
              sku
                ? `<div style="margin-top:3px;font-size:12px;color:#52616F;">Art.-Nr.: ${escapeHtml(
                    sku
                  )}</div>`
                : ""
            }
          </td>
          <td style="padding:12px 0;border-bottom:1px solid #E8DED2;text-align:center;color:#52616F;font-weight:700;">
            ${quantity} ${escapeHtml(unit)}
          </td>
          <td style="padding:12px 0;border-bottom:1px solid #E8DED2;text-align:right;font-weight:800;color:#102A43;">
            ${formatMoney(total)}
          </td>
        </tr>
      `;
    })
    .join("");
}

function createMailHtml(params: {
  customerName: string;
  childName: string;
  schoolName: string;
  className: string;
  requestNumber: string;
  offerUrl: string;
  offerItems: AnyRecord[];
  total: number;
}) {
  const {
    customerName,
    childName,
    schoolName,
    className,
    requestNumber,
    offerUrl,
    offerItems,
    total,
  } = params;

  const greeting = customerName ? `Hallo ${escapeHtml(customerName)},` : "Hallo,";

  const hasSchoolInfo = Boolean(childName || schoolName || className);

  return `
<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <title>Dein Paketwunsch ist fertig</title>
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
                      <div style="margin-top:6px;font-size:14px;line-height:1.35;color:#F7EFE6;">Paketwunsch prüfen und bestätigen</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:30px;">
                <p style="margin:0 0 16px;font-size:16px;line-height:1.55;">${greeting}</p>

                <p style="margin:0 0 16px;font-size:16px;line-height:1.55;">
                  Dein Paketwunsch ist fertig.
                </p>

                <p style="margin:0 0 18px;font-size:16px;line-height:1.55;">
                  Bitte prüfe die vorgeschlagenen Produkte in Ruhe.<br />\nWenn alles passt, bestätigst Du anschließend Deinen Paketwunsch und schließt die Bestellung ab.
                </p>

                ${
                  hasSchoolInfo || requestNumber
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

                

                <table role="presentation" cellspacing="0" cellpadding="0" style="margin:28px 0;">
                  <tr>
                    <td style="border-radius:16px;background:#B5282D;">
                      <a href="${offerUrl}" style="display:inline-block;padding:16px 24px;color:#ffffff;text-decoration:none;font-size:16px;font-weight:800;border-radius:16px;">
                        Paketwunsch prüfen
                      </a>
                    </td>
                  </tr>
                </table>

                <div style="background:#FFF8EE;border:1px solid #F1D1A8;border-radius:18px;padding:16px;margin:24px 0;color:#8A4A1F;">
                  <p style="margin:0;font-size:14px;line-height:1.55;font-weight:700;">
                    Wichtig: Mit dem Öffnen des Links bestellst Du noch nichts automatisch. Erst wenn Du Deinen Paketwunsch auf der Seite prüfst, bestätigst und den Checkout abschließt, wird daraus eine verbindliche Bestellung.
                  </p>
                </div>

                <p style="margin:0 0 16px;font-size:14px;line-height:1.55;color:#5C6B73;">
                  Falls der Button nicht funktioniert, kopiere diesen Link in Deinen Browser:<br />
                  <a href="${offerUrl}" style="color:#8A3A2B;word-break:break-all;">${offerUrl}</a>
                </p>

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
  offerUrl: string;
  offerItems: AnyRecord[];
  total: number;
}) {
  const {
    customerName,
    childName,
    schoolName,
    className,
    requestNumber,
    offerUrl,
    offerItems,
    total,
  } = params;

  const greeting = customerName ? `Hallo ${customerName},` : "Hallo,";

  const itemLines = offerItems
    .slice(0, 10)
    .map((item) => {
      const name = getItemName(item);
      const quantity = getItemQuantity(item);
      const unit = getItemUnit(item);
      const totalPrice = getItemTotal(item);

      return `- ${quantity} ${unit} ${name} · ${formatMoney(totalPrice)}`;
    })
    .join("\n");

  const moreLine =
    offerItems.length > 10
      ? `\n+ ${offerItems.length - 10} weitere Positionen im Paketwunsch.`
      : "";

  return `${greeting}

Dein Paketwunsch ist fertig.

Bitte prüfe die vorgeschlagenen Produkte in Ruhe.<br />\nWenn alles passt, bestätigst Du anschließend Deinen Paketwunsch und schließt die Bestellung ab.

${requestNumber ? `Anfrage: ${requestNumber}\n` : ""}${
    childName ? `Kind: ${childName}\n` : ""
  }${schoolName ? `Schule: ${schoolName}\n` : ""}${
    className ? `Klasse: ${className}\n` : ""
  }

Kurzübersicht:
${itemLines}${moreLine}

Aktueller Paketwert: ${formatMoney(total)}

Paketwunsch prüfen:
${offerUrl}

Wichtig:
Mit dem Öffnen des Links bestellst Du noch nichts automatisch.
Erst wenn Du Deinen Paketwunsch auf der Seite bewusst absendest, wird er an uns übermittelt.

Viele Grüße
Dein Team von Handzettel-Schulen.de`;
}

async function insertEvent(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  requestId: string;
  message: string;
  offerUrl: string;
  customerEmail: string;
}) {
  const { supabase, requestId, message, offerUrl, customerEmail } = params;

  const payloads = [
    {
      request_id: requestId,
      event_type: "offer_update_mail_sent",
      title: "Paketwunsch ist fertig",
      message,
      description: message,
      metadata: {
        offer_url_type: "customer_package_review_link",
        offer_url: offerUrl,
        email: customerEmail,
      },
      created_at: new Date().toISOString(),
    },
    {
      request_id: requestId,
      event_type: "offer_link_email_sent",
      title: "Paketwunsch-Link per E-Mail gesendet",
      message,
      description: message,
      metadata: {
        offer_url_type: "customer_package_review_link",
        offer_url: offerUrl,
        email: customerEmail,
      },
      created_at: new Date().toISOString(),
    },
  ];

  for (const payload of payloads) {
    const { error } = await supabase.from("school_request_events").insert(payload);

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
    const token = getRequestToken(schoolRequest);

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

    if (!token) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Für diese Anfrage wurde kein Angebots-Token gefunden. Der Paketwunsch-Link kann nicht erstellt werden.",
        },
        { status: 400 }
      );
    }

    const { data: offerItems, error: offerItemsError } = await supabase
      .from("school_offer_items")
      .select("*")
      .eq("request_id", requestId)
      .order("created_at", { ascending: true });

    if (offerItemsError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Paketpositionen konnten nicht geladen werden.",
          details: offerItemsError.message,
        },
        { status: 500 }
      );
    }

    if (!offerItems || offerItems.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Es sind noch keine Paketpositionen vorhanden. Bitte erst Liste auswerten, Produkte übernehmen oder manuell ergänzen.",
        },
        { status: 400 }
      );
    }

    try {
      await assertAdminRequestReadyForOfferMail(supabase, requestId);
    } catch (workflowError) {
      return NextResponse.json(
        {
          ok: false,
          error:
            workflowError instanceof Error
              ? workflowError.message
              : "Der Paketwunsch ist noch nicht versandbereit.",
        },
        { status: 400 }
      );
    }
    const encodedToken = encodeURIComponent(token);
    const offerUrl = `${getSiteUrl()}/angebot/${encodedToken}`;

    const total = offerItems.reduce((sum, item) => {
      return sum + getItemTotal(item);
    }, 0);

    const transporter = createTransporter();

    const from =
      process.env.SMTP_FROM ||
      process.env.SMTP_USER ||
      "Handzettel-Schulen.de";

    const requestNumber = pickFirst(schoolRequest, ["request_number"], "");

    const subject = "Dein Paketwunsch ist fertig";

    const mailParams = {
      customerName,
      childName,
      schoolName,
      className,
      requestNumber,
      offerUrl,
      offerItems,
      total,
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
      offerUrl,
      customerEmail,
      message: `Paketwunsch-Mail mit Prüflink wurde an ${customerEmail} gesendet.`,
    });

    await supabase
      .from("school_requests")
      .update({
        status: "offer_sent",
        offer_status: "offer_sent",
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestId);

    await supabase
      .from("school_requests")
      .update({
        customer_offer_finalized_at: new Date().toISOString(),
        customer_offer_finalized_by: "offer_update_mail",
      })
      .eq("id", requestId);

    return NextResponse.json({
      ok: true,
      message: "Paketwunsch-Mail wurde erfolgreich gesendet.",
      sentTo: customerEmail,
      offerUrl,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unbekannter Fehler beim Senden der Paketwunsch-Mail.";

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 }
    );
  }
}