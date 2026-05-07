import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import PDFDocument from "pdfkit";
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

function formatDate(value = new Date()) {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
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
    "Hallo"
  );
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

function getItemUnit(item: AnyRecord) {
  return pickFirst(item, ["unit", "quantity_unit"], "Stk.");
}

function normalizeOfferItem(item: AnyRecord) {
  const quantity = pickNumber(item, ["quantity", "qty", "amount"], 1) || 1;

  const unitPrice = pickNumber(item, [
    "product_price",
    "unit_price",
    "price",
    "price_gross",
    "sale_price_gross",
  ]);

  const existingTotal = pickNumber(item, [
    "total_price",
    "line_total",
    "sum",
    "subtotal",
  ]);

  const total = existingTotal > 0 ? existingTotal : quantity * unitPrice;

  return {
    name: getItemName(item),
    quantity,
    unit: getItemUnit(item),
    unitPrice,
    total,
    note: pickFirst(item, ["notes", "note", "comment"], ""),
  };
}

function safeFilePart(value: string) {
  return value.replace(/[^a-zA-Z0-9-_]/g, "-").slice(0, 60);
}

async function createOfferPdfBuffer(params: {
  request: AnyRecord;
  offerItems: AnyRecord[];
  acceptUrl: string;
}) {
  const { request, offerItems, acceptUrl } = params;

  const items = offerItems.map(normalizeOfferItem);
  const total = items.reduce((sum, item) => sum + item.total, 0);

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 48,
      info: {
        Title: "Aktualisiertes Angebot Handzettel-Schulen.de",
        Author: "Handzettel-Schulen.de",
        Subject: "Schulmaterial-Angebot",
      },
    });

    const chunks: Buffer[] = [];

    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const primary = "#102A43";
    const accent = "#8A3A2B";
    const muted = "#5C6B73";
    const soft = "#F7EFE6";

    doc.rect(0, 0, doc.page.width, 110).fill(soft);

    doc
      .fillColor(primary)
      .fontSize(22)
      .font("Helvetica-Bold")
      .text("Handzettel-Schulen.de", 48, 38);

    doc
      .fillColor(accent)
      .fontSize(13)
      .font("Helvetica-Bold")
      .text("Aktualisiertes Schulmaterial-Angebot", 48, 68);

    doc
      .fillColor(muted)
      .fontSize(9)
      .font("Helvetica")
      .text(`Erstellt am ${formatDate()}`, 390, 42, {
        align: "right",
        width: 150,
      });

    doc.y = 135;

    const customerName = getCustomerName(request);
    const customerEmail = getCustomerEmail(request);

    doc
      .fillColor(primary)
      .fontSize(13)
      .font("Helvetica-Bold")
      .text("Angebot für:");

    doc.moveDown(0.35);

    doc.fillColor(primary).fontSize(11).font("Helvetica").text(customerName);

    if (customerEmail) {
      doc.fillColor(muted).fontSize(10).text(customerEmail);
    }

    doc.moveDown(1.2);

    doc
      .fillColor(primary)
      .fontSize(11)
      .font("Helvetica")
      .text(
        "Wir haben Deinen Schulmaterial-Paketwunsch geprüft und das Angebot aktualisiert. Die folgenden Positionen bilden den aktuellen Stand Deines Angebots ab.",
        {
          width: 500,
          lineGap: 3,
        }
      );

    doc.moveDown(1.4);

    const tableTop = doc.y;
    const left = 48;
    const width = 499;

    doc.roundedRect(left, tableTop, width, 28, 8).fill(primary);

    doc
      .fillColor("#FFFFFF")
      .fontSize(9)
      .font("Helvetica-Bold")
      .text("Position", left + 12, tableTop + 9, { width: 230 })
      .text("Menge", left + 260, tableTop + 9, { width: 50, align: "right" })
      .text("Einzel", left + 325, tableTop + 9, { width: 70, align: "right" })
      .text("Gesamt", left + 410, tableTop + 9, { width: 75, align: "right" });

    doc.y = tableTop + 42;

    items.forEach((item, index) => {
      const rowHeight = item.note ? 46 : 34;

      if (doc.y + rowHeight > 730) {
        doc.addPage();
        doc.y = 48;
      }

      if (index % 2 === 0) {
        doc.roundedRect(left, doc.y - 6, width, rowHeight, 6).fill("#FBF7F0");
      }

      const currentY = doc.y;

      doc
        .fillColor(primary)
        .fontSize(9.5)
        .font("Helvetica-Bold")
        .text(item.name, left + 12, currentY, { width: 230 });

      if (item.note) {
        doc
          .fillColor(muted)
          .fontSize(8)
          .font("Helvetica")
          .text(item.note, left + 12, currentY + 14, { width: 230 });
      }

      doc
        .fillColor(primary)
        .fontSize(9)
        .font("Helvetica")
        .text(`${item.quantity} ${item.unit}`, left + 260, currentY, {
          width: 50,
          align: "right",
        })
        .text(formatMoney(item.unitPrice), left + 325, currentY, {
          width: 70,
          align: "right",
        })
        .font("Helvetica-Bold")
        .text(formatMoney(item.total), left + 410, currentY, {
          width: 75,
          align: "right",
        });

      doc.y = currentY + rowHeight;
    });

    doc.moveDown(0.8);

    const totalBoxY = doc.y;

    doc.roundedRect(330, totalBoxY, 217, 45, 10).fill(primary);

    doc
      .fillColor("#FFFFFF")
      .fontSize(10)
      .font("Helvetica")
      .text("Gesamtbetrag", 350, totalBoxY + 10, { width: 80 });

    doc
      .fillColor("#FFFFFF")
      .fontSize(16)
      .font("Helvetica-Bold")
      .text(formatMoney(total), 430, totalBoxY + 8, {
        width: 95,
        align: "right",
      });

    doc.y = totalBoxY + 70;

    doc
      .fillColor(accent)
      .fontSize(12)
      .font("Helvetica-Bold")
      .text("Angebot offiziell annehmen");

    doc.moveDown(0.35);

    doc
      .fillColor(primary)
      .fontSize(10)
      .font("Helvetica")
      .text(
        "Wenn alles passt, kannst Du Dein Angebot online offiziell annehmen. Nutze dafür bitte den Button in der E-Mail oder öffne folgenden Link:",
        {
          width: 500,
          lineGap: 3,
        }
      );

    doc.moveDown(0.4);

    doc
      .fillColor(accent)
      .fontSize(9)
      .font("Helvetica-Bold")
      .text(acceptUrl, {
        width: 500,
        underline: true,
      });

    doc.moveDown(1.4);

    doc
      .fillColor(muted)
      .fontSize(8.5)
      .font("Helvetica")
      .text(
        "Hinweis: Dieses Angebot wurde auf Basis Deiner hochgeladenen Schulmaterialliste und der aktuellen manuellen Prüfung durch Handzettel-Schulen.de erstellt. Änderungen und Rückfragen sind weiterhin möglich.",
        {
          width: 500,
          lineGap: 2,
        }
      );

    doc.end();
  });
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

function createMailHtml(params: { customerName: string; acceptUrl: string }) {
  const { customerName, acceptUrl } = params;

  const greeting = customerName === "Hallo" ? "Hallo," : `Hallo ${customerName},`;

  return `
<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <title>Aktualisiertes Angebot</title>
  </head>
  <body style="margin:0;padding:0;background:#FBF7F0;font-family:Arial,Helvetica,sans-serif;color:#102A43;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#FBF7F0;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border-radius:24px;overflow:hidden;border:1px solid #eadfce;">
            <tr>
              <td style="background:#102A43;padding:28px 30px;color:#ffffff;">
                <div style="font-size:22px;font-weight:800;letter-spacing:-0.3px;">Handzettel-Schulen.de</div>
                <div style="margin-top:6px;font-size:14px;color:#F7EFE6;">Dein aktualisiertes Schulmaterial-Angebot</div>
              </td>
            </tr>

            <tr>
              <td style="padding:30px;">
                <p style="margin:0 0 16px;font-size:16px;line-height:1.55;">${greeting}</p>

                <p style="margin:0 0 16px;font-size:16px;line-height:1.55;">
                  wir haben Deinen Schulmaterial-Paketwunsch geprüft und das Angebot für Dich aktualisiert.
                </p>

                <p style="margin:0 0 22px;font-size:16px;line-height:1.55;">
                  Im Anhang findest Du das aktuelle Angebot noch einmal als PDF. Wenn alles passt, kannst Du es über den folgenden Button offiziell annehmen.
                </p>

                <table role="presentation" cellspacing="0" cellpadding="0" style="margin:28px 0;">
                  <tr>
                    <td style="border-radius:999px;background:#8A3A2B;">
                      <a href="${acceptUrl}" style="display:inline-block;padding:15px 24px;color:#ffffff;text-decoration:none;font-size:16px;font-weight:800;border-radius:999px;">
                        Angebot offiziell annehmen
                      </a>
                    </td>
                  </tr>
                </table>

                <p style="margin:0 0 16px;font-size:14px;line-height:1.55;color:#5C6B73;">
                  Falls der Button nicht funktioniert, kopiere diesen Link in Deinen Browser:<br />
                  <a href="${acceptUrl}" style="color:#8A3A2B;word-break:break-all;">${acceptUrl}</a>
                </p>

                <p style="margin:26px 0 0;font-size:16px;line-height:1.55;">
                  Viele Grüße<br />
                  Dein Team von Handzettel-Schulen.de
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding:18px 30px;background:#FBF7F0;color:#5C6B73;font-size:12px;line-height:1.45;">
                Diese E-Mail wurde gesendet, weil Du über Handzettel-Schulen.de eine Schulmaterialliste hochgeladen hast.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

async function insertEvent(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  requestId: string;
  message: string;
}) {
  const { supabase, requestId, message } = params;

  try {
    await supabase.from("school_request_events").insert({
      request_id: requestId,
      event_type: "offer_update_mail_sent",
      message,
      created_at: new Date().toISOString(),
    });
  } catch {
    // Der Verlauf darf den Mailversand nicht blockieren.
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
            "Für diese Anfrage wurde kein Angebots-Token gefunden. Der Annahmelink kann nicht erstellt werden.",
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
          error: "Angebotspositionen konnten nicht geladen werden.",
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
            "Es sind noch keine Angebotspositionen vorhanden. Bitte erst das Angebot manuell ergänzen oder Produkte übernehmen.",
        },
        { status: 400 }
      );
    }

    const acceptUrl = `${getSiteUrl()}/angebot/${encodeURIComponent(token)}`;

    const pdfBuffer = await createOfferPdfBuffer({
      request: schoolRequest,
      offerItems,
      acceptUrl,
    });

    const transporter = createTransporter();

    const from =
      process.env.SMTP_FROM ||
      process.env.SMTP_USER ||
      "Handzettel-Schulen.de";

    const subject = "Dein aktualisiertes Angebot von Handzettel-Schulen.de";

    const greeting = customerName === "Hallo" ? "Hallo," : `Hallo ${customerName},`;

    await transporter.sendMail({
      from,
      to: customerEmail,
      subject,
      text: `${greeting}

wir haben Deinen Schulmaterial-Paketwunsch geprüft und das Angebot für Dich aktualisiert.

Im Anhang findest Du das aktuelle Angebot noch einmal als PDF.

Wenn alles passt, kannst Du das Angebot über diesen Link offiziell annehmen:

${acceptUrl}

Viele Grüße
Dein Team von Handzettel-Schulen.de`,
      html: createMailHtml({
        customerName,
        acceptUrl,
      }),
      attachments: [
        {
          filename: `aktualisiertes-angebot-handzettel-schulen-${safeFilePart(requestId)}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });

    await insertEvent({
      supabase,
      requestId,
      message: `Aktualisierungsmail mit PDF-Angebot wurde an ${customerEmail} gesendet.`,
    });

    await supabase
      .from("school_requests")
      .update({
        offer_status: "offer_sent",
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestId);

    return NextResponse.json({
      ok: true,
      message: "Aktualisierungsmail wurde erfolgreich gesendet.",
      sentTo: customerEmail,
      acceptUrl,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unbekannter Fehler beim Senden der Aktualisierungsmail.";

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 }
    );
  }
}