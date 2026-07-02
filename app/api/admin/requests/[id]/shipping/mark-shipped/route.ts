import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type AnyRecord = Record<string, any>;

type BodyPayload = {
  carrier?: unknown;
  trackingNumber?: unknown;
  trackingUrl?: unknown;
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

function createTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error(
      "SMTP-Konfiguration fehlt. Prüfe SMTP_HOST, SMTP_PORT, SMTP_USER und SMTP_PASS."
    );
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

function cleanText(value: unknown, maxLength = 240) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLength);
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

function getCustomerEmail(requestRow: AnyRecord) {
  return pickFirst(requestRow, [
    "email",
    "customer_email",
    "parent_email",
    "contact_email",
    "guardian_email",
  ]);
}

function getCustomerName(requestRow: AnyRecord) {
  return pickFirst(requestRow, [
    "customer_name",
    "parent_name",
    "guardian_name",
    "name",
    "contact_name",
  ]);
}

function getRequestNumber(requestRow: AnyRecord) {
  return pickFirst(requestRow, ["request_number", "number"]);
}

function isPaidStatus(value: unknown) {
  const status = cleanText(value, 80);
  return status === "payment_received" || status === "cash_paid" || status === "paid";
}

function getCarrierLabel(carrier: string) {
  switch (carrier) {
    case "dpd":
      return "DPD";
    case "dhl":
      return "DHL";
    case "hermes":
      return "Hermes";
    case "gls":
      return "GLS";
    case "ups":
      return "UPS";
    default:
      return carrier || "Paketdienst";
  }
}

function normalizeCarrier(value: unknown) {
  const carrier = cleanText(value, 40).toLowerCase();

  if (carrier === "dpd") return "dpd";
  if (carrier === "dhl") return "dhl";
  if (carrier === "hermes") return "hermes";
  if (carrier === "gls") return "gls";
  if (carrier === "ups") return "ups";

  return carrier || "sonstiges";
}

function buildTrackingUrl(params: {
  carrier: string;
  trackingNumber: string;
  customUrl: string;
}) {
  if (params.customUrl) return params.customUrl;

  const encoded = encodeURIComponent(params.trackingNumber);

  switch (params.carrier) {
    case "dpd":
      return `https://tracking.dpd.de/status/de_DE/parcel/${encoded}`;
    case "dhl":
      return `https://www.dhl.de/de/privatkunden/dhl-sendungsverfolgung.html?piececode=${encoded}`;
    case "hermes":
      return `https://www.myhermes.de/empfangen/sendungsverfolgung/?su=${encoded}`;
    case "gls":
      return `https://gls-group.com/DE/de/paketverfolgung?match=${encoded}`;
    case "ups":
      return `https://www.ups.com/track?tracknum=${encoded}`;
    default:
      return "";
  }
}

function createMailText(params: {
  customerName: string;
  requestNumber: string;
  carrierLabel: string;
  trackingNumber: string;
  trackingUrl: string;
}) {
  const greeting = params.customerName ? `Hallo ${params.customerName},` : "Hallo,";
  const requestLine = params.requestNumber ? `\nAnfrage: ${params.requestNumber}\n` : "";

  return `${greeting}

Dein Schulmaterial-Paket wurde versendet.${requestLine}
Versanddienst: ${params.carrierLabel}
Paketnummer: ${params.trackingNumber}

${
  params.trackingUrl
    ? `Sendung verfolgen:
${params.trackingUrl}`
    : "Eine direkte Sendungsverfolgung ist mit den gespeicherten Daten aktuell nicht verfügbar."
}

Viele Grüße
Handzettel-Schulen.de`;
}

function createMailHtml(params: {
  customerName: string;
  requestNumber: string;
  carrierLabel: string;
  trackingNumber: string;
  trackingUrl: string;
}) {
  const greeting = params.customerName ? `Hallo ${params.customerName},` : "Hallo,";
  const requestLine = params.requestNumber
    ? `<p style="margin:0 0 12px 0;color:#52616F;"><strong>Anfrage:</strong> ${params.requestNumber}</p>`
    : "";

  const button = params.trackingUrl
    ? `<p style="margin:24px 0;text-align:center;">
        <a href="${params.trackingUrl}" style="display:inline-block;background:#C6282D;color:#ffffff;text-decoration:none;border-radius:18px;padding:16px 22px;font-weight:800;">
          Sendung verfolgen
        </a>
      </p>
      <p style="margin:0;color:#52616F;font-size:13px;line-height:1.5;">
        Falls der Button nicht funktioniert, kopiere diesen Link in Deinen Browser:<br />
        <a href="${params.trackingUrl}" style="color:#12395F;word-break:break-all;">${params.trackingUrl}</a>
      </p>`
    : `<p style="margin:20px 0 0 0;padding:14px 16px;border-radius:18px;background:#FFF8EE;color:#8A4A1F;line-height:1.5;font-weight:700;">
        Für diese Sendung wurde kein direkter Trackinglink gespeichert.
      </p>`;

  return `
  <div style="margin:0;padding:0;background:#FBF7F0;font-family:Arial,sans-serif;color:#102A43;">
    <div style="max-width:640px;margin:0 auto;padding:28px 16px;">
      <div style="background:#ffffff;border:1px solid #E8DED2;border-radius:28px;padding:28px;">
        <p style="margin:0 0 16px 0;font-size:16px;">${greeting}</p>

        <p style="margin:0 0 16px 0;line-height:1.6;color:#52616F;">
          Dein Schulmaterial-Paket wurde versendet.
        </p>

        ${requestLine}

        <div style="margin:18px 0;padding:16px;border-radius:20px;background:#F5FAFD;border:1px solid #D6E7EF;">
          <p style="margin:0 0 8px 0;color:#102A43;"><strong>Versanddienst:</strong> ${params.carrierLabel}</p>
          <p style="margin:0;color:#102A43;"><strong>Paketnummer:</strong> ${params.trackingNumber}</p>
        </div>

        ${button}

        <p style="margin:24px 0 0 0;line-height:1.6;color:#52616F;">
          Viele Grüße<br />
          Handzettel-Schulen.de
        </p>
      </div>
    </div>
  </div>`;
}

async function insertEvent(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  requestId: string;
  title: string;
  description: string;
}) {
  await params.supabase.from("school_request_events").insert({
    request_id: params.requestId,
    event_type: "fulfillment_shipping_notification_sent",
    title: params.title,
    description: params.description,
    created_at: new Date().toISOString(),
  });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const requestId = cleanText(id, 120);

  if (!requestId) {
    return NextResponse.json(
      {
        ok: false,
        message: "Keine Anfrage-ID übergeben.",
      },
      { status: 400 }
    );
  }

  let body: BodyPayload = {};

  try {
    body = (await request.json()) as BodyPayload;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        message: "Versanddaten konnten nicht gelesen werden.",
      },
      { status: 400 }
    );
  }

  const carrier = normalizeCarrier(body.carrier);
  const carrierLabel = getCarrierLabel(carrier);
  const trackingNumber = cleanText(body.trackingNumber, 120);
  const customTrackingUrl = cleanText(body.trackingUrl, 500);
  const trackingUrl = buildTrackingUrl({
    carrier,
    trackingNumber,
    customUrl: customTrackingUrl,
  });

  if (!trackingNumber) {
    return NextResponse.json(
      {
        ok: false,
        message: "Bitte gib eine Paketnummer ein.",
      },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();

  const { data: requestRow, error: requestError } = await supabase
    .from("school_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();

  if (requestError) {
    return NextResponse.json(
      {
        ok: false,
        message: requestError.message,
      },
      { status: 500 }
    );
  }

  if (!requestRow) {
    return NextResponse.json(
      {
        ok: false,
        message: "Anfrage wurde nicht gefunden.",
      },
      { status: 404 }
    );
  }

  if (requestRow.fulfillment_method !== "shipping") {
    return NextResponse.json(
      {
        ok: false,
        message: "Diese Aktion ist nur möglich, wenn der Kunde Versand gewählt hat.",
      },
      { status: 400 }
    );
  }

  if (!isPaidStatus(requestRow.payment_status)) {
    return NextResponse.json(
      {
        ok: false,
        message: "Versand ist erst möglich, wenn die Zahlung verbucht wurde.",
      },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();

  const { error: updateError } = await supabase
    .from("school_requests")
    .update({
      fulfillment_status: "shipped",
      shipped_at: requestRow.shipped_at || now,
      shipping_carrier: carrierLabel,
      shipping_tracking_number: trackingNumber,
      shipping_tracking_url: trackingUrl || null,
      shipping_notification_status: "pending",
      shipping_notification_error: null,
      updated_at: now,
    })
    .eq("id", requestId);

  if (updateError) {
    return NextResponse.json(
      {
        ok: false,
        message: updateError.message,
      },
      { status: 500 }
    );
  }

  const customerEmail = getCustomerEmail(requestRow);

  if (!customerEmail) {
    await supabase
      .from("school_requests")
      .update({
        shipping_notification_status: "missing_email",
        shipping_notification_error: "Keine Kunden-E-Mail vorhanden.",
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestId);

    return NextResponse.json({
      ok: true,
      mailSent: false,
      message:
        "Paket wurde als versendet markiert. Versandmail wurde nicht gesendet, weil keine Kunden-E-Mail vorhanden ist.",
    });
  }

  try {
    const transporter = createTransporter();
    const from =
      process.env.SMTP_FROM ||
      process.env.SMTP_USER ||
      "Handzettel-Schulen.de";

    const customerName = getCustomerName(requestRow);
    const requestNumber = getRequestNumber(requestRow);

    await transporter.sendMail({
      from,
      to: customerEmail,
      subject: "Dein Schulmaterial-Paket wurde versendet",
      text: createMailText({
        customerName,
        requestNumber,
        carrierLabel,
        trackingNumber,
        trackingUrl,
      }),
      html: createMailHtml({
        customerName,
        requestNumber,
        carrierLabel,
        trackingNumber,
        trackingUrl,
      }),
    });

    const sentAt = new Date().toISOString();

    await supabase
      .from("school_requests")
      .update({
        shipping_notification_sent_at: sentAt,
        shipping_notification_status: "sent",
        shipping_notification_error: null,
        updated_at: sentAt,
      })
      .eq("id", requestId);

    await insertEvent({
      supabase,
      requestId,
      title: "Versandmail gesendet",
      description: `Versandmail mit ${carrierLabel}-Sendungsverfolgung wurde an ${customerEmail} gesendet.`,
    });

    return NextResponse.json({
      ok: true,
      mailSent: true,
      message: "Paket wurde als versendet markiert und die Versandmail wurde gesendet.",
      trackingUrl,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Versandmail konnte nicht gesendet werden.";

    await supabase
      .from("school_requests")
      .update({
        shipping_notification_status: "error",
        shipping_notification_error: errorMessage,
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestId);

    return NextResponse.json(
      {
        ok: true,
        mailSent: false,
        message:
          "Paket wurde als versendet markiert, aber die Versandmail konnte nicht gesendet werden.",
        error: errorMessage,
      },
      { status: 200 }
    );
  }
}
