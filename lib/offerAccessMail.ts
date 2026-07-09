import nodemailer from "nodemailer";

import { cleanOutgoingMailSubject, cleanOutgoingMailText } from "@/lib/mailEncoding";
type SupabaseLike = {
  from: (table: string) => any;
};

type AnyRecord = Record<string, any>;

type SendOfferAccessMailResult = {
  ok: boolean;
  status:
    | "sent"
    | "not_due"
    | "already_sent"
    | "missing_email"
    | "not_found"
    | "error";
  message: string;
  requestId?: string;
  sentTo?: string;
};

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
    throw new Error("SMTP-Konfiguration fehlt. Prüfe SMTP_HOST, SMTP_PORT, SMTP_USER und SMTP_PASS.");
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

function getRequestNumber(request: AnyRecord) {
  return pickFirst(request, ["request_number", "number"], "");
}

function createText(params: {
  customerName: string;
  offerUrl: string;
  requestNumber: string;
}) {
  const greeting = params.customerName
    ? `Hallo ${params.customerName},`
    : "Hallo,";

  const requestLine = params.requestNumber
    ? `\nAnfrage: ${params.requestNumber}\n`
    : "";

  return `${greeting}

Du hast Deine Schulmaterialliste bei Handzettel-Schulen.de auslesen lassen.${requestLine}
ÃƒÅ“ber diesen Link kommst Du jederzeit zurück zu Deinem Paketwunsch:

${params.offerUrl}

Dort kannst Du Deine Liste prüfen, offene Positionen bearbeiten oder später Deine Bestellung abschließen.

Wichtig: Diese Mail ist noch keine Rechnung und keine Bestellung.

Viele Grüße
Handzettel-Schulen.de`;
}

function createHtml(params: {
  customerName: string;
  offerUrl: string;
  requestNumber: string;
}) {
  const greeting = params.customerName
    ? `Hallo ${params.customerName},`
    : "Hallo,";

  const requestLine = params.requestNumber
    ? `<p style="margin:0 0 16px 0;color:#52616F;"><strong>Anfrage:</strong> ${params.requestNumber}</p>`
    : "";

  return `
  <div style="margin:0;padding:0;background:#FBF7F0;font-family:Arial,sans-serif;color:#102A43;">
    <div style="max-width:640px;margin:0 auto;padding:28px 16px;">
      <div style="background:#ffffff;border:1px solid #E8DED2;border-radius:28px;padding:28px;">
        <p style="margin:0 0 16px 0;font-size:16px;">${greeting}</p>

        <p style="margin:0 0 16px 0;line-height:1.6;color:#52616F;">
          Du hast Deine Schulmaterialliste bei <strong>Handzettel-Schulen.de</strong> auslesen lassen.
        </p>

        ${requestLine}

        <p style="margin:0 0 20px 0;line-height:1.6;color:#52616F;">
          ÃƒÅ“ber den folgenden Button kommst Du jederzeit zurück zu Deinem Paketwunsch.
          Dort kannst Du Deine Liste prüfen, offene Positionen bearbeiten oder später Deine Bestellung abschließen.
        </p>

        <p style="margin:24px 0;text-align:center;">
          <a href="${params.offerUrl}" style="display:inline-block;background:#C6282D;color:#ffffff;text-decoration:none;border-radius:18px;padding:16px 22px;font-weight:800;">
            Zurück zu meinem Paketwunsch
          </a>
        </p>

        <p style="margin:20px 0 0 0;padding:14px 16px;border-radius:18px;background:#FFF8EE;color:#8A4A1F;line-height:1.5;font-weight:700;">
          Wichtig: Diese Mail ist noch keine Rechnung und keine Bestellung.
        </p>

        <p style="margin:24px 0 0 0;line-height:1.6;color:#52616F;">
          Viele Grüße<br />
          Handzettel-Schulen.de
        </p>
      </div>
    </div>
  </div>`;
}

export async function scheduleOfferAccessMail(params: {
  supabase: SupabaseLike;
  requestId: string;
  delayMinutes?: number;
}) {
  const delayMinutes = params.delayMinutes ?? 2;
  const dueAt = new Date(Date.now() + delayMinutes * 60 * 1000).toISOString();

  const { error } = await params.supabase
    .from("school_requests")
    .update({
      // self_selection_only_offer_access_mail_guard:
        // Die 2-Minuten-Mail darf nicht mehr automatisch nach dem Auslesen geplant werden.
        // Sie wird nur noch in /api/offer/[token]/self-selection direkt gesetzt.
        offer_access_mail_due_at: null,
      offer_access_mail_status: "scheduled",
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.requestId)
    .is("offer_access_mail_sent_at", null)
      .eq("offer_access_mail_trigger", "self_selection");

  if (error) {
    throw new Error(`Link-Mail konnte nicht geplant werden: ${error.message}`);
  }

  return dueAt;
}

export async function sendOfferAccessMailForRequest(params: {
  supabase: SupabaseLike;
  requestId: string;
  allowBeforeDue?: boolean;
}): Promise<SendOfferAccessMailResult> {
  try {
    const { data: request, error } = await params.supabase
      .from("school_requests")
      .select("*")
      .eq("id", params.requestId)
      .maybeSingle();

    if (error) {
      return {
        ok: false,
        status: "error",
        message: error.message,
        requestId: params.requestId,
      };
    }

    if (!request) {
      return {
        ok: false,
        status: "not_found",
        message: "Anfrage wurde nicht gefunden.",
        requestId: params.requestId,
      };
    }

    if (request.offer_access_mail_sent_at) {
      return {
        ok: true,
        status: "already_sent",
        message: "Link-Mail wurde bereits gesendet.",
        requestId: params.requestId,
      };
    }

    let accessMailTrigger = String(
    (request as { offer_access_mail_trigger?: string | null })
      .offer_access_mail_trigger || ""
  ).trim();
if (!accessMailTrigger) {
    const { data: triggerRow, error: triggerLookupError } = await params.supabase
      .from("school_requests")
      .select("offer_access_mail_trigger")
      .eq("id", request.id)
      .maybeSingle();

    if (!triggerLookupError) {
      accessMailTrigger = String(
        (triggerRow as { offer_access_mail_trigger?: string | null } | null)
          ?.offer_access_mail_trigger || ""
      ).trim();
    }
  }

  if (accessMailTrigger !== "self_selection") {
    // access_mail_blocked_without_self_selection_trigger:
    // Diese Link-Mail darf nur nach aktivem Klick auf „Artikel selbst auswählen“ rausgehen.
    await params.supabase
      .from("school_requests")
      .update({
        offer_access_mail_due_at: null,
      })
      .eq("id", request.id)
      .is("offer_access_mail_sent_at", null);

    return {
      ok: true,
      status: "not_due",
      message:
        "Access-Mail wurde nicht gesendet, weil der Self-Selection-Trigger fehlt.",
    };
  }

  const dueAt = request.offer_access_mail_due_at
      ? new Date(request.offer_access_mail_due_at).getTime()
      : 0;

    if (!params.allowBeforeDue && dueAt > Date.now()) {
      return {
        ok: true,
        status: "not_due",
        message: "Link-Mail ist noch nicht fällig.",
        requestId: params.requestId,
      };
    }

    const customerEmail = getCustomerEmail(request);

    if (!customerEmail) {
      await params.supabase
        .from("school_requests")
        .update({
          offer_access_mail_status: "missing_email",
          updated_at: new Date().toISOString(),
        })
        .eq("id", params.requestId);

      return {
        ok: false,
        status: "missing_email",
        message: "Für diese Anfrage wurde keine Kunden-E-Mail gefunden.",
        requestId: params.requestId,
      };
    }

    const offerToken = String(request.offer_token || "").trim();

    if (!offerToken) {
      return {
        ok: false,
        status: "error",
        message: "Für diese Anfrage wurde kein Angebotslink gefunden.",
        requestId: params.requestId,
      };
    }

    const offerUrl = `${getSiteUrl()}/angebot/${encodeURIComponent(offerToken)}`;
    const customerName = getCustomerName(request);
    const requestNumber = getRequestNumber(request);

    const transporter = createTransporter();
    const from =
      process.env.SMTP_FROM ||
      process.env.SMTP_USER ||
      "Handzettel-Schulen.de";

    await transporter.sendMail({
      from,
      to: customerEmail,
      subject: cleanOutgoingMailSubject("Dein Link zu Deinem Schulmaterial-Paketwunsch"),
      text: cleanOutgoingMailText(createText({
        customerName,
        offerUrl,
        requestNumber,
      })),
      html: cleanOutgoingMailText(createHtml({
        customerName,
        offerUrl,
        requestNumber,
      })),
    });

    const now = new Date().toISOString();

    await params.supabase
      .from("school_requests")
      .update({
        offer_access_mail_sent_at: now,
        offer_access_mail_status: "sent",
        updated_at: now,
      })
      .eq("id", params.requestId)
      .is("offer_access_mail_sent_at", null);

    await params.supabase.from("school_request_events").insert({
      request_id: params.requestId,
      event_type: "offer_access_mail_sent",
      title: "Paketwunsch-Link gesendet",
      message: `Link zum Paketwunsch wurde an ${customerEmail} gesendet.`,
      metadata: {
        offerUrl,
        reason: "customer_prepare_started",
      },
    });

    return {
      ok: true,
      status: "sent",
      message: "Link-Mail wurde gesendet.",
      requestId: params.requestId,
      sentTo: customerEmail,
    };
  } catch (error) {
    return {
      ok: false,
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Link-Mail konnte nicht gesendet werden.",
      requestId: params.requestId,
    };
  }
}
