import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { sendMail } from "@/lib/sendMail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type RequestRow = {
  id: string;
  request_number: string | null;
  customer_name: string | null;
  email: string | null;
  child_name: string | null;
  school_name: string | null;
  class_name: string | null;
  fulfillment_method: string | null;
};

type InvoiceRow = {
  id: string;
  request_id: string;
  invoice_number: string | null;
  invoice_token: string;
  invoice_status: string | null;
  payment_status: string | null;
  selected_payment_method: string | null;

  subtotal_amount: number | string | null;
  shipping_amount: number | string | null;
  total_amount: number | string | null;
  currency: string | null;

  customer_name_snapshot: string | null;
  customer_email_snapshot: string | null;

  billing_name_snapshot: string | null;
  billing_email_snapshot: string | null;
  billing_phone_snapshot: string | null;
  billing_street_snapshot: string | null;
  billing_postal_code_snapshot: string | null;
  billing_city_snapshot: string | null;

  shipping_address_differs_snapshot: boolean | null;
  shipping_name_snapshot: string | null;
  shipping_street_snapshot: string | null;
  shipping_postal_code_snapshot: string | null;
  shipping_city_snapshot: string | null;
  child_name_snapshot: string | null;
  school_name_snapshot: string | null;
  class_name_snapshot: string | null;

  fulfillment_method_snapshot: string | null;

  created_at: string | null;
  updated_at: string | null;
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

function toNumber(value: unknown, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatMoney(value: unknown) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(toNumber(value, 0));
}

function safeText(value: unknown, fallback = "") {
  const text = String(value || "").trim();
  return text.length > 0 ? text : fallback;
}

function cleanOptionalText(value: unknown) {
  const text = String(value || "").trim();
  return text.length > 0 ? text : null;
}

function cleanFileName(value: string) {
  return value
    .replace(/[^\wäöüÄÖÜß\-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);
}

function getFulfillmentLabel(method: string | null) {
  if (method === "pickup") return "Abholung im Laden";
  if (method === "shipping") return "Versand";
  return "Noch nicht gewählt";
}

function getPaymentIntro(invoice: InvoiceRow) {
  if (invoice.selected_payment_method === "paypal") {
    return "PayPal wurde als Zahlungsart gewählt. Über den Zahlungslink kannst Du die PayPal-Zahlung fortsetzen.";
  }

  if (invoice.selected_payment_method === "bank_transfer") {
    return "Du kannst per Überweisung bezahlen. Die Bearbeitung startet nach Zahlungseingang.";
  }

  if (invoice.selected_payment_method === "cash_on_pickup") {
    return "Barzahlung ist nur bei Abholung möglich.";
  }

  return "Bitte öffne den Zahlungslink, um die Zahlung fortzusetzen.";
}


function getSiteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "https://www.handzettel-schulen.de"
  );
}

async function insertRequestEvent(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  requestId: string;
  eventType: string;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}) {
  const { supabase, requestId, eventType, title, message, metadata } = params;
  const createdAt = new Date().toISOString();

  const payloads = [
    {
      request_id: requestId,
      event_type: eventType,
      title,
      message,
      description: message,
      metadata: metadata || null,
      created_at: createdAt,
    },
    {
      request_id: requestId,
      event_type: eventType,
      message,
      metadata: metadata || null,
      created_at: createdAt,
    },
    {
      request_id: requestId,
      event_type: eventType,
      message,
      created_at: createdAt,
    },
    {
      request_id: requestId,
      type: eventType,
      message,
      created_at: createdAt,
    },
  ];

  for (const payload of payloads) {
    const { error } = await supabase.from("school_request_events").insert(payload);

    if (!error) return;
  }
}

async function loadLatestInvoice(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  requestId: string;
}) {
  const { supabase, requestId } = params;

  const { data: requestData, error: requestError } = await supabase
    .from("school_requests")
    .select(
      [
        "id",
        "request_number",
        "customer_name",
        "email",
        "child_name",
        "school_name",
        "class_name",
        "fulfillment_method",
      ].join(", ")
    )
    .eq("id", requestId)
    .maybeSingle();

  if (requestError || !requestData) {
    throw new Error(requestError?.message || "Die Anfrage wurde nicht gefunden.");
  }

  const requestRow = requestData as unknown as RequestRow;

  const { data: invoiceData, error: invoiceError } = await supabase
    .from("school_request_invoices")
    .select("*")
    .eq("request_id", requestId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (invoiceError || !invoiceData) {
    throw new Error(
      invoiceError?.message ||
        "Zu dieser Anfrage wurde noch keine Rechnung vorbereitet."
    );
  }

  const invoice = invoiceData as unknown as InvoiceRow;

  return {
    requestRow,
    invoice,
  };
}

function buildMailContent(params: {
  requestRow: RequestRow;
  invoice: InvoiceRow;
  paymentUrl: string;
}) {
  const { requestRow, invoice, paymentUrl } = params;

  const customerName =
    cleanOptionalText(invoice.billing_name_snapshot) ||
    cleanOptionalText(invoice.customer_name_snapshot) ||
    cleanOptionalText(requestRow.customer_name) ||
    "liebe Kundin, lieber Kunde";

  const childName = invoice.child_name_snapshot || requestRow.child_name || "—";
  const schoolName = invoice.school_name_snapshot || requestRow.school_name || "—";
  const className = invoice.class_name_snapshot || requestRow.class_name || "—";

  const invoiceNumber = safeText(invoice.invoice_number, "Deine Rechnung");

  const subtotal = formatMoney(invoice.subtotal_amount);
  const shipping = formatMoney(invoice.shipping_amount);
  const total = formatMoney(invoice.total_amount);

  const fulfillmentMethod =
    invoice.fulfillment_method_snapshot || requestRow.fulfillment_method;

  const fulfillmentLabel = getFulfillmentLabel(fulfillmentMethod);
  const paymentIntro = getPaymentIntro(invoice);

  const subject = `${invoiceNumber} · Deine Bestellung von Handzettel-Schulen.de`;

  const text = [
    `Hallo ${customerName},`,
    "",
    "Deine Bestellung wurde vorbereitet. Im Anhang findest Du Deine Rechnung als PDF.",
    "",
    "Kurzübersicht:",
    `Kind: ${childName}`,
    `Schule / Klasse: ${schoolName} · ${className}`,
    `Übergabe: ${fulfillmentLabel}`,
    "",
    `Paketbetrag: ${subtotal}`,
    `Versandkosten: ${shipping}`,
    `Gesamtbetrag: ${total}`,
    "",
    paymentIntro,
    "",
    `Rechnung und Zahlung öffnen: ${paymentUrl}`,
    "",
    "Wichtig:",
    "Bei PayPal oder Überweisung bearbeiten wir Dein Paket nach Zahlungseingang weiter.",
    "Barzahlung bei Abholung erscheint nur, wenn sie für Deinen Vorgang freigegeben wurde.",
    "",
    "Viele Grüße",
    "Dein Team von Handzettel-Schulen.de",
  ].join("\n");

  const html = `
    <div style="margin:0;padding:0;background:#FBF7F0;font-family:Arial,sans-serif;color:#102A43;">
      <div style="max-width:680px;margin:0 auto;padding:28px 18px;">
        <div style="background:#ffffff;border:1px solid #E8DED2;border-radius:28px;padding:28px;">
          <div style="background:#102A43;border-radius:24px;padding:22px 24px;color:#ffffff;margin-bottom:24px;">
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
                  <div style="margin-top:6px;font-size:14px;line-height:1.35;color:#F7EFE6;">Deine Rechnung zu Deiner Bestellung</div>
                </td>
              </tr>
            </table>
          </div>

          <h1 style="margin:18px 0 8px;font-size:28px;line-height:1.15;color:#102A43;">
            Deine Rechnung zu Deiner Bestellung
          </h1>

          <p style="margin:0 0 18px;font-size:16px;line-height:1.6;color:#52616F;">
            Hallo ${customerName},<br />
            Deine Bestellung wurde vorbereitet. Im Anhang findest Du Deine Rechnung als PDF.
          </p>

          <div style="background:#F0FFF6;border:1px solid #BFE3CD;border-radius:22px;padding:18px;margin:22px 0;">
            <p style="margin:0 0 10px;font-size:12px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:#2F7D50;">
              Kurzübersicht
            </p>

            <table style="width:100%;border-collapse:collapse;font-size:15px;">
              <tr>
                <td style="padding:7px 0;color:#52616F;">Rechnung</td>
                <td style="padding:7px 0;text-align:right;font-weight:800;color:#102A43;">${invoiceNumber}</td>
              </tr>
              <tr>
                <td style="padding:7px 0;color:#52616F;">Kind</td>
                <td style="padding:7px 0;text-align:right;font-weight:800;color:#102A43;">${childName}</td>
              </tr>
              <tr>
                <td style="padding:7px 0;color:#52616F;">Schule / Klasse</td>
                <td style="padding:7px 0;text-align:right;font-weight:800;color:#102A43;">${schoolName} · ${className}</td>
              </tr>
              <tr>
                <td style="padding:7px 0;color:#52616F;">Übergabe</td>
                <td style="padding:7px 0;text-align:right;font-weight:800;color:#102A43;">${fulfillmentLabel}</td>
              </tr>
            </table>
          </div>

          <div style="background:#FBF7F0;border:1px solid #E8DED2;border-radius:22px;padding:18px;margin:22px 0;">
            <table style="width:100%;border-collapse:collapse;font-size:16px;">
              <tr>
                <td style="padding:8px 0;color:#52616F;">Paketbetrag</td>
                <td style="padding:8px 0;text-align:right;font-weight:800;color:#102A43;">${subtotal}</td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:#52616F;">Versandkosten</td>
                <td style="padding:8px 0;text-align:right;font-weight:800;color:#102A43;">${shipping}</td>
              </tr>
              <tr>
                <td colspan="2" style="border-top:1px solid #E8DED2;padding-top:12px;"></td>
              </tr>
              <tr>
                <td style="padding:8px 0;font-size:18px;font-weight:800;color:#102A43;">Gesamtbetrag</td>
                <td style="padding:8px 0;text-align:right;font-size:22px;font-weight:900;color:#B5282D;">${total}</td>
              </tr>
            </table>
          </div>

          <p style="margin:20px 0 14px;font-size:15px;line-height:1.6;color:#52616F;">
            ${paymentIntro}
          </p>

          <a href="${paymentUrl}" style="display:block;text-align:center;background:#B5282D;color:#ffffff;text-decoration:none;border-radius:18px;padding:16px 20px;font-size:16px;font-weight:900;margin:20px 0;">
            Rechnung und Zahlung öffnen
          </a>

          <div style="background:#FFF8EE;border:1px solid #F1D1A8;border-radius:20px;padding:16px;margin-top:22px;">
            <p style="margin:0;font-size:14px;line-height:1.6;color:#A75B28;font-weight:700;">
              Wichtig: Bei PayPal oder Überweisung bearbeiten wir Dein Paket nach Zahlungseingang weiter.
              Barzahlung bei Abholung erscheint nur, wenn sie für Deinen Vorgang freigegeben wurde.
            </p>
          </div>

          <p style="margin:26px 0 0;font-size:15px;line-height:1.6;color:#52616F;">
            Viele Grüße<br />
            <strong style="color:#102A43;">Dein Team von <span style="white-space:nowrap;">Handzettel-Schulen.de</span></strong>
          </p>
        </div>
      </div>
    </div>
  `;

  return {
    subject,
    text,
    html,
  };
}

async function fetchInvoicePdf(params: {
  request: Request;
  requestId: string;
}) {
  const { request, requestId } = params;
  const origin = new URL(request.url).origin;

  const response = await fetch(
    `${origin}/api/admin/requests/${requestId}/invoice/pdf`,
    {
      method: "GET",
      cache: "no-store",
    }
  );

  if (!response.ok) {
    const rawText = await response.text().catch(() => "");
    throw new Error(
      rawText ||
        `Die Rechnungs-PDF konnte nicht erzeugt werden. Status: ${response.status}`
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const requestId = String(id || "").trim();

    if (!requestId) {
      return NextResponse.json(
        {
          ok: false,
          message: "Ungültige Anfrage-ID.",
        },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { requestRow, invoice } = await loadLatestInvoice({
      supabase,
      requestId,
    });

    const customerEmail =
      cleanOptionalText(invoice.billing_email_snapshot) ||
      cleanOptionalText(invoice.customer_email_snapshot) ||
      cleanOptionalText(requestRow.email);

    if (!customerEmail) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Für diese Anfrage ist keine E-Mail-Adresse hinterlegt. Die Rechnung kann nicht per Mail gesendet werden.",
        },
        { status: 409 }
      );
    }

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
      new URL(request.url).origin;

    const paymentUrl = `${siteUrl}/rechnung/${invoice.invoice_token}`;

    const pdfBuffer = await fetchInvoicePdf({
      request,
      requestId,
    });

    const mailContent = buildMailContent({
      requestRow,
      invoice,
      paymentUrl,
    });

    const invoiceNumber = invoice.invoice_number || "rechnung";
    const pdfFileName = cleanFileName(`${invoiceNumber}.pdf`);

    await sendMail({
      to: customerEmail,
      subject: mailContent.subject,
      text: mailContent.text,
      html: mailContent.html,
      attachments: [
        {
          filename: pdfFileName,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });

    const now = new Date().toISOString();

    const { error: updateInvoiceError } = await supabase
      .from("school_request_invoices")
      .update({
        invoice_status: "sent",
        sent_at: now,
        payment_status:
          invoice.payment_status && invoice.payment_status !== "not_selected"
            ? invoice.payment_status
            : "not_selected",
        updated_at: now,
      })
      .eq("id", invoice.id);

    if (updateInvoiceError) {
      return NextResponse.json(
        {
          ok: false,
          message: `Rechnungs-Mail wurde gesendet, aber der Rechnungsstatus konnte nicht aktualisiert werden: ${updateInvoiceError.message}`,
        },
        { status: 500 }
      );
    }

    const { error: updateRequestError } = await supabase
      .from("school_requests")
      .update({
        invoice_status: "sent",
        payment_status:
          invoice.payment_status && invoice.payment_status !== "not_selected"
            ? invoice.payment_status
            : "not_selected",
        selected_payment_method: invoice.selected_payment_method || "paypal",
        latest_invoice_id: invoice.id,
        invoice_sent_at: now,
        invoice_total_amount: toNumber(invoice.total_amount, 0),
        shipping_amount: toNumber(invoice.shipping_amount, 0),
        updated_at: now,
      })
      .eq("id", requestId);

    if (updateRequestError) {
      return NextResponse.json(
        {
          ok: false,
          message: `Rechnungs-Mail wurde gesendet, aber die Anfrage konnte nicht aktualisiert werden: ${updateRequestError.message}`,
        },
        { status: 500 }
      );
    }

    await insertRequestEvent({
      supabase,
      requestId,
      eventType: "invoice_mail_sent",
      title: "Rechnung per Mail versendet",
      message: `Die Rechnung ${invoice.invoice_number || ""} wurde mit PDF-Anhang an ${customerEmail} gesendet.`,
      metadata: {
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
        customer_email: customerEmail,
        payment_url: paymentUrl,
        total_amount: toNumber(invoice.total_amount, 0),
      },
    });

    return NextResponse.json({
      ok: true,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number,
      paymentUrl,
      message: `Die Rechnung ${invoice.invoice_number || ""} wurde per Mail an ${customerEmail} gesendet.`,
    });
  } catch (error) {
    console.error("Invoice send mail error:", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Die Rechnungs-Mail konnte nicht gesendet werden.",
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    {
      ok: false,
      message: "Diese Route kann nur per POST genutzt werden.",
    },
    { status: 405 }
  );
}




