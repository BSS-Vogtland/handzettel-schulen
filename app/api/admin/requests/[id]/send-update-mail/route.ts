import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import { NextResponse } from "next/server";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type AnyRecord = Record<string, any>;

type NormalizedOfferItem = {
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
  note: string;
};

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

function normalizeOfferItem(item: AnyRecord): NormalizedOfferItem {
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

function hexToRgb(hex: string) {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return rgb(r, g, b);
}

function sanitizePdfText(value: string) {
  return String(value || "")
    .replace(/geprueft/g, "geprüft")
    .replace(/Geprueft/g, "Geprüft")
    .replace(/Pruefung/g, "Prüfung")
    .replace(/pruefung/g, "prüfung")
    .replace(/fuer/g, "für")
    .replace(/Fuer/g, "Für")
    .replace(/dafuer/g, "dafür")
    .replace(/Dafuer/g, "Dafür")
    .replace(/oeffne/g, "öffne")
    .replace(/Oeffne/g, "Öffne")
    .replace(/Aenderungen/g, "Änderungen")
    .replace(/aenderungen/g, "änderungen")
    .replace(/Rueckfragen/g, "Rückfragen")
    .replace(/rueckfragen/g, "rückfragen")
    .replace(/moeglich/g, "möglich")
    .replace(/Moeglich/g, "Möglich")
    .replace(/Schulmaterial-Paketwunsch/g, "Schulmaterial-Paketwunsch")
    .replace(/€/g, "EUR")
    .replace(/–/g, "-")
    .replace(/—/g, "-")
    .replace(/„/g, '"')
    .replace(/“/g, '"')
    .replace(/’/g, "'")
    .replace(/…/g, "...");
}

function drawText(params: {
  page: PDFPage;
  text: string;
  x: number;
  y: number;
  size: number;
  font: PDFFont;
  color?: ReturnType<typeof rgb>;
}) {
  const { page, text, x, y, size, font, color = hexToRgb("#102A43") } = params;

  page.drawText(sanitizePdfText(text), {
    x,
    y,
    size,
    font,
    color,
  });
}

function splitTextIntoLines(params: {
  text: string;
  font: PDFFont;
  fontSize: number;
  maxWidth: number;
}) {
  const { text, font, fontSize, maxWidth } = params;
  const words = sanitizePdfText(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    const width = font.widthOfTextAtSize(test, fontSize);

    if (width <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }

  if (current) lines.push(current);
  return lines;
}

function drawWrappedText(params: {
  page: PDFPage;
  text: string;
  x: number;
  y: number;
  maxWidth: number;
  size: number;
  font: PDFFont;
  color?: ReturnType<typeof rgb>;
  lineHeight?: number;
}) {
  const {
    page,
    text,
    x,
    y,
    maxWidth,
    size,
    font,
    color = hexToRgb("#102A43"),
    lineHeight = size + 4,
  } = params;

  const lines = splitTextIntoLines({
    text,
    font,
    fontSize: size,
    maxWidth,
  });

  let currentY = y;

  for (const line of lines) {
    drawText({
      page,
      text: line,
      x,
      y: currentY,
      size,
      font,
      color,
    });

    currentY -= lineHeight;
  }

  return currentY;
}

function drawHeader(params: {
  page: PDFPage;
  boldFont: PDFFont;
  regularFont: PDFFont;
}) {
  const { page, boldFont, regularFont } = params;
  const primary = hexToRgb("#102A43");
  const accent = hexToRgb("#8A3A2B");
  const soft = hexToRgb("#F7EFE6");
  const muted = hexToRgb("#5C6B73");

  page.drawRectangle({
    x: 0,
    y: 732,
    width: 595,
    height: 110,
    color: soft,
  });

  drawText({
    page,
    text: "Handzettel-Schulen.de",
    x: 48,
    y: 785,
    size: 22,
    font: boldFont,
    color: primary,
  });

  drawText({
    page,
    text: "Aktualisiertes Schulmaterial-Angebot",
    x: 48,
    y: 762,
    size: 13,
    font: boldFont,
    color: accent,
  });

  drawText({
    page,
    text: `Erstellt am ${formatDate()}`,
    x: 430,
    y: 785,
    size: 9,
    font: regularFont,
    color: muted,
  });
}

async function createOfferPdfBuffer(params: {
  request: AnyRecord;
  offerItems: AnyRecord[];
  acceptUrl: string;
}) {
  const { request, offerItems, acceptUrl } = params;

  const pdfDoc = await PDFDocument.create();
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const primary = hexToRgb("#102A43");
  const accent = hexToRgb("#8A3A2B");
  const muted = hexToRgb("#5C6B73");
  const soft = hexToRgb("#FBF7F0");
  const white = rgb(1, 1, 1);

  const pageSize: [number, number] = [595.28, 841.89];
  let page = pdfDoc.addPage(pageSize);

  drawHeader({ page, boldFont, regularFont });

  let y = 700;

  const customerName = getCustomerName(request);
  const customerEmail = getCustomerEmail(request);

  drawText({
    page,
    text: "Angebot für:",
    x: 48,
    y,
    size: 13,
    font: boldFont,
    color: primary,
  });

  y -= 22;

  drawText({
    page,
    text: customerName,
    x: 48,
    y,
    size: 11,
    font: regularFont,
    color: primary,
  });

  y -= 16;

  if (customerEmail) {
    drawText({
      page,
      text: customerEmail,
      x: 48,
      y,
      size: 10,
      font: regularFont,
      color: muted,
    });

    y -= 26;
  } else {
    y -= 10;
  }

  y = drawWrappedText({
    page,
    text:
      "Wir haben Deinen Schulmaterial-Paketwunsch geprüft und das Angebot aktualisiert. Die folgenden Positionen bilden den aktuellen Stand Deines Angebots ab.",
    x: 48,
    y,
    maxWidth: 500,
    size: 11,
    font: regularFont,
    color: primary,
    lineHeight: 16,
  });

  y -= 25;

  page.drawRectangle({
    x: 48,
    y: y - 8,
    width: 499,
    height: 28,
    color: primary,
  });

  drawText({
    page,
    text: "Position",
    x: 60,
    y,
    size: 9,
    font: boldFont,
    color: white,
  });

  drawText({
    page,
    text: "Menge",
    x: 300,
    y,
    size: 9,
    font: boldFont,
    color: white,
  });

  drawText({
    page,
    text: "Einzel",
    x: 380,
    y,
    size: 9,
    font: boldFont,
    color: white,
  });

  drawText({
    page,
    text: "Gesamt",
    x: 465,
    y,
    size: 9,
    font: boldFont,
    color: white,
  });

  y -= 35;

  const items = offerItems.map(normalizeOfferItem);
  const total = items.reduce((sum, item) => sum + item.total, 0);

  items.forEach((item, index) => {
    if (y < 110) {
      page = pdfDoc.addPage(pageSize);
      drawHeader({ page, boldFont, regularFont });
      y = 700;
    }

    const rowHeight = item.note ? 46 : 34;

    if (index % 2 === 0) {
      page.drawRectangle({
        x: 48,
        y: y - 18,
        width: 499,
        height: rowHeight,
        color: soft,
      });
    }

    const nameLines = splitTextIntoLines({
      text: item.name,
      font: boldFont,
      fontSize: 9.5,
      maxWidth: 220,
    }).slice(0, 2);

    let itemNameY = y;

    nameLines.forEach((line) => {
      drawText({
        page,
        text: line,
        x: 60,
        y: itemNameY,
        size: 9.5,
        font: boldFont,
        color: primary,
      });

      itemNameY -= 12;
    });

    if (item.note) {
      const noteLines = splitTextIntoLines({
        text: item.note,
        font: regularFont,
        fontSize: 8,
        maxWidth: 220,
      }).slice(0, 2);

      let noteY = y - 24;

      noteLines.forEach((line) => {
        drawText({
          page,
          text: line,
          x: 60,
          y: noteY,
          size: 8,
          font: regularFont,
          color: muted,
        });

        noteY -= 10;
      });
    }

    drawText({
      page,
      text: `${item.quantity} ${item.unit}`,
      x: 295,
      y,
      size: 9,
      font: regularFont,
      color: primary,
    });

    drawText({
      page,
      text: formatMoney(item.unitPrice),
      x: 365,
      y,
      size: 9,
      font: regularFont,
      color: primary,
    });

    drawText({
      page,
      text: formatMoney(item.total),
      x: 455,
      y,
      size: 9,
      font: boldFont,
      color: primary,
    });

    y -= rowHeight;
  });

  y -= 10;

  if (y < 190) {
    page = pdfDoc.addPage(pageSize);
    drawHeader({ page, boldFont, regularFont });
    y = 700;
  }

  page.drawRectangle({
    x: 330,
    y: y - 18,
    width: 217,
    height: 45,
    color: primary,
  });

  drawText({
    page,
    text: "Gesamtbetrag",
    x: 350,
    y: y + 5,
    size: 10,
    font: regularFont,
    color: white,
  });

  drawText({
    page,
    text: formatMoney(total),
    x: 430,
    y: y + 3,
    size: 15,
    font: boldFont,
    color: white,
  });

  y -= 70;

  drawText({
    page,
    text: "Angebot offiziell annehmen",
    x: 48,
    y,
    size: 12,
    font: boldFont,
    color: accent,
  });

  y -= 22;

  y = drawWrappedText({
    page,
    text:
      "Wenn alles passt, kannst Du Dein Angebot online offiziell annehmen. Nutze dafür bitte den Button in der E-Mail oder öffne folgenden Link:",
    x: 48,
    y,
    maxWidth: 500,
    size: 10,
    font: regularFont,
    color: primary,
    lineHeight: 14,
  });

  y -= 10;

  y = drawWrappedText({
    page,
    text: acceptUrl,
    x: 48,
    y,
    maxWidth: 500,
    size: 9,
    font: boldFont,
    color: accent,
    lineHeight: 12,
  });

  y -= 18;

  drawWrappedText({
    page,
    text:
      "Hinweis: Dieses Angebot wurde auf Basis Deiner hochgeladenen Schulmaterialliste und der aktuellen manuellen Prüfung durch Handzettel-Schulen.de erstellt. Änderungen und Rückfragen sind weiterhin möglich.",
    x: 48,
    y,
    maxWidth: 500,
    size: 8.5,
    font: regularFont,
    color: muted,
    lineHeight: 12,
  });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
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