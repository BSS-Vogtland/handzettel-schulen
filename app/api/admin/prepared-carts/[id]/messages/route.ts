import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import {
  cleanOutgoingMailSubject,
  cleanOutgoingMailText,
} from "@/lib/mailEncoding";
import { sendMailReliable } from "@/lib/mail/sendMailReliable";
import { supabaseServer } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type SendMessageBody = {
  action?: "email" | "whatsapp";
  subject?: string | null;
  message?: string | null;
};

type PreparedCartRow = {
  id: string;
  token: string;
  title: string | null;
  status: string;
  customer_name: string | null;
  email: string | null;
  phone: string | null;
  expires_at: string;
  sent_at: string | null;
};

type PreparedCartItemRow = {
  quantity: number | string;
  unit_price_snapshot: number | string;
};

function jsonResponse(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getSiteUrl(request: NextRequest) {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    request.nextUrl.origin.replace(/\/$/, "") ||
    "https://www.handzettel-schulen.de"
  );
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function normalizeQuantity(value: unknown) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return 1;
  }

  return Math.max(1, Math.min(99, Math.floor(parsed)));
}

function replacePlaceholders(
  text: string,
  params: {
    customerName: string;
    email: string;
    phone: string;
    customerUrl: string;
    title: string;
    expiresAt: string;
    itemCount: number;
    cartTotal: number;
  }
) {
  const replacements: Record<string, string> = {
    "{name}": params.customerName,
    "{email}": params.email,
    "{telefon}": params.phone,
    "{link}": params.customerUrl,
    "{titel}": params.title,
    "{ablaufdatum}": formatDate(params.expiresAt),
    "{anzahl_artikel}": String(params.itemCount),
    "{warenwert}": formatMoney(params.cartTotal),
  };

  let result = text;

  for (const [placeholder, replacement] of Object.entries(replacements)) {
    result = result.split(placeholder).join(replacement);
  }

  return result;
}

function createMessageHtml(params: {
  subject: string;
  message: string;
  customerUrl: string;
}) {
  const escapedMessage = escapeHtml(params.message)
    .replace(
      /(https?:\/\/[^\s<]+)/g,
      '<a href="$1" style="color:#B5282D;word-break:break-all;">$1</a>'
    )
    .replace(/\r?\n/g, "<br />");

  return `
<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(params.subject)}</title>
  </head>

  <body style="margin:0;padding:0;background:#FBF7F0;font-family:Arial,Helvetica,sans-serif;color:#102A43;">
    <table
      role="presentation"
      width="100%"
      cellspacing="0"
      cellpadding="0"
      style="background:#FBF7F0;padding:28px 12px;"
    >
      <tr>
        <td align="center">
          <table
            role="presentation"
            width="100%"
            cellspacing="0"
            cellpadding="0"
            style="max-width:640px;background:#ffffff;border-radius:24px;overflow:hidden;border:1px solid #E8DED2;"
          >
            <tr>
              <td style="background:#102A43;padding:24px 30px;color:#ffffff;">
                <table
                  role="presentation"
                  width="100%"
                  cellspacing="0"
                  cellpadding="0"
                >
                  <tr>
                    <td width="72" valign="middle" style="padding-right:16px;">
                      <img
                        src="${getSiteUrlFromEnvironment()}/handzettel-logo.png"
                        alt="Handzettel-Schulen.de"
                        width="64"
                        style="display:block;width:64px;height:auto;border:0;background:#ffffff;border-radius:16px;padding:6px;"
                      />
                    </td>

                    <td valign="middle">
                      <div style="font-size:22px;font-weight:800;line-height:1.2;">
                        Handzettel-Schulen.de
                      </div>

                      <div style="margin-top:6px;font-size:14px;color:#F7EFE6;">
                        Dein vorbereiteter Warenkorb
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:30px;">
                <div style="font-size:16px;line-height:1.65;">
                  ${escapedMessage}
                </div>

                <table
                  role="presentation"
                  cellspacing="0"
                  cellpadding="0"
                  style="margin:28px 0 10px;"
                >
                  <tr>
                    <td style="border-radius:16px;background:#B5282D;">
                      <a
                        href="${escapeHtml(params.customerUrl)}"
                        style="display:inline-block;padding:16px 24px;color:#ffffff;text-decoration:none;font-size:16px;font-weight:800;border-radius:16px;"
                      >
                        Warenkorb öffnen
                      </a>
                    </td>
                  </tr>
                </table>

                <div style="margin-top:24px;background:#FFF8EE;border:1px solid #F1D1A8;border-radius:18px;padding:16px;color:#8A4A1F;">
                  <p style="margin:0;font-size:14px;line-height:1.55;font-weight:700;">
                    Durch das Öffnen des Links wird noch keine Bestellung ausgelöst.
                    Eine verbindliche Bestellung entsteht erst nach Abschluss des Checkouts.
                  </p>
                </div>
              </td>
            </tr>

            <tr>
              <td style="padding:18px 30px;background:#FBF7F0;color:#5C6B73;font-size:12px;line-height:1.45;">
                Diese Nachricht wurde durch Handzettel-Schulen.de versendet.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function getSiteUrlFromEnvironment() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "https://www.handzettel-schulen.de"
  );
}

async function loadCart(cartId: string) {
  const { data, error } = await supabaseServer
    .from("school_prepared_carts")
    .select(
      [
        "id",
        "token",
        "title",
        "status",
        "customer_name",
        "email",
        "phone",
        "expires_at",
        "sent_at",
      ].join(",")
    )
    .eq("id", cartId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Der vorbereitete Warenkorb konnte nicht geladen werden: ${error.message}`
    );
  }

  return data as unknown as PreparedCartRow | null;
}

async function loadCartItems(cartId: string) {
  const { data, error } = await supabaseServer
    .from("school_prepared_cart_items")
    .select("quantity, unit_price_snapshot")
    .eq("cart_id", cartId);

  if (error) {
    throw new Error(
      `Die Warenkorbpositionen konnten nicht geladen werden: ${error.message}`
    );
  }

  return (data || []) as unknown as PreparedCartItemRow[];
}

export async function GET(
  _request: NextRequest,
  context: RouteContext
) {
  const unauthorized = await requireAdminApiSession();

  if (unauthorized) {
    return unauthorized;
  }

  try {
    const { id: cartId } = await context.params;

    if (!cartId) {
      return jsonResponse(
        {
          ok: false,
          message: "Keine Warenkorb-ID übergeben.",
        },
        400
      );
    }

    const { data, error } = await supabaseServer
      .from("school_customer_communications")
      .select(
        [
          "id",
          "channel",
          "status",
          "recipient",
          "subject",
          "message_text",
          "metadata",
          "sent_at",
          "created_by",
          "created_at",
        ].join(",")
      )
      .eq("entity_type", "prepared_cart")
      .eq("entity_id", cartId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      return jsonResponse(
        {
          ok: false,
          message: `Kommunikationsverlauf konnte nicht geladen werden: ${error.message}`,
        },
        500
      );
    }

    return jsonResponse({
      ok: true,
      messages: data || [],
    });
  } catch (error) {
    console.error("Prepared cart messages GET error:", error);

    return jsonResponse(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Kommunikationsverlauf konnte nicht geladen werden.",
      },
      500
    );
  }
}

export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  const unauthorized = await requireAdminApiSession();

  if (unauthorized) {
    return unauthorized;
  }

  try {
    const { id: cartId } = await context.params;
    const body = (await request.json()) as SendMessageBody;

    if (!cartId) {
      return jsonResponse(
        {
          ok: false,
          message: "Keine Warenkorb-ID übergeben.",
        },
        400
      );
    }

    if (body.action !== "email" && body.action !== "whatsapp") {
      return jsonResponse(
        {
          ok: false,
          message: "Ungültige Versandart.",
        },
        400
      );
    }

    const cart = await loadCart(cartId);

    if (!cart) {
      return jsonResponse(
        {
          ok: false,
          message: "Der vorbereitete Warenkorb wurde nicht gefunden.",
        },
        404
      );
    }

    if (cart.status === "expired") {
      return jsonResponse(
        {
          ok: false,
          message:
            "Der vorbereitete Warenkorb ist abgelaufen und kann nicht mehr versendet werden.",
        },
        409
      );
    }

    if (cart.status === "cancelled") {
      return jsonResponse(
        {
          ok: false,
          message:
            "Der vorbereitete Warenkorb wurde zurückgezogen und kann nicht mehr versendet werden.",
        },
        409
      );
    }

    const items = await loadCartItems(cartId);

    if (items.length === 0) {
      return jsonResponse(
        {
          ok: false,
          message:
            "Der vorbereitete Warenkorb enthält noch keine Produkte.",
        },
        400
      );
    }

    const itemCount = items.reduce(
      (sum, item) => sum + normalizeQuantity(item.quantity),
      0
    );

    const cartTotal = items.reduce((sum, item) => {
      const quantity = normalizeQuantity(item.quantity);
      const unitPrice = Number(
        String(item.unit_price_snapshot ?? 0).replace(",", ".")
      );

      return sum + quantity * (Number.isFinite(unitPrice) ? unitPrice : 0);
    }, 0);

    const customerName = cleanText(cart.customer_name) || "Kunde";
    const email = cleanText(cart.email);
    const phone = cleanText(cart.phone);
    const customerUrl = `${getSiteUrl(request)}/warenkorb/${encodeURIComponent(
      cart.token
    )}`;
    const cartTitle =
      cleanText(cart.title) || `Warenkorb für ${customerName}`;

    const rawSubject = cleanText(body.subject);
    const rawMessage = cleanText(body.message);

    if (!rawMessage) {
      return jsonResponse(
        {
          ok: false,
          message: "Bitte gib eine Nachricht ein.",
        },
        400
      );
    }

    const placeholderParams = {
      customerName,
      email,
      phone,
      customerUrl,
      title: cartTitle,
      expiresAt: cart.expires_at,
      itemCount,
      cartTotal,
    };

    const finalMessage = replacePlaceholders(
      rawMessage,
      placeholderParams
    );

    const finalSubject = replacePlaceholders(
      rawSubject ||
        "Dein vorbereiteter Warenkorb bei Handzettel-Schulen.de",
      placeholderParams
    );

    const now = new Date().toISOString();

    if (body.action === "email") {
      if (!email || !email.includes("@")) {
        return jsonResponse(
          {
            ok: false,
            message:
              "Für diesen Kunden wurde keine gültige E-Mail-Adresse hinterlegt.",
          },
          400
        );
      }

      const from =
        process.env.SMTP_FROM ||
        process.env.SMTP_USER ||
        "Handzettel-Schulen.de";

      await sendMailReliable({
        from,
        to: email,
        subject: cleanOutgoingMailSubject(finalSubject),
        text: cleanOutgoingMailText(finalMessage),
        html: cleanOutgoingMailText(
          createMessageHtml({
            subject: finalSubject,
            message: finalMessage,
            customerUrl,
          })
        ),
      });

      const { error: historyError } = await supabaseServer
        .from("school_customer_communications")
        .insert({
          entity_type: "prepared_cart",
          entity_id: cartId,
          channel: "email",
          status: "sent",
          recipient: email,
          subject: finalSubject,
          message_text: finalMessage,
          metadata: {
            customerUrl,
            templateSubject: rawSubject,
            templateMessage: rawMessage,
          },
          sent_at: now,
          created_by: "admin",
        });

      if (historyError) {
        console.error(
          "Prepared cart email history insert error:",
          historyError
        );
      }

      const nextStatus =
        cart.status === "ordered" ? "ordered" : "sent";

      const { error: updateError } = await supabaseServer
        .from("school_prepared_carts")
        .update({
          status: nextStatus,
          sent_at: cart.sent_at || now,
          sent_by_email_at: now,
          last_sent_channel: "email",
        })
        .eq("id", cartId);

      if (updateError) {
        console.error(
          "Prepared cart email status update error:",
          updateError
        );
      }

      return jsonResponse({
        ok: true,
        message: `Die E-Mail wurde an ${email} gesendet.`,
        channel: "email",
        sentAt: now,
      });
    }

    if (!phone) {
      return jsonResponse(
        {
          ok: false,
          message:
            "Für diesen Kunden wurde keine Telefonnummer hinterlegt.",
        },
        400
      );
    }

    const { error: historyError } = await supabaseServer
      .from("school_customer_communications")
      .insert({
        entity_type: "prepared_cart",
        entity_id: cartId,
        channel: "whatsapp",
        status: "confirmed",
        recipient: phone,
        subject: null,
        message_text: finalMessage,
        metadata: {
          customerUrl,
          templateMessage: rawMessage,
          confirmationType: "manual_admin_confirmation",
        },
        sent_at: now,
        created_by: "admin",
      });

    if (historyError) {
      return jsonResponse(
        {
          ok: false,
          message: `WhatsApp-Versand konnte nicht gespeichert werden: ${historyError.message}`,
        },
        500
      );
    }

    const nextStatus =
      cart.status === "ordered" ? "ordered" : "sent";

    const { error: updateError } = await supabaseServer
      .from("school_prepared_carts")
      .update({
        status: nextStatus,
        sent_at: cart.sent_at || now,
        sent_by_whatsapp_at: now,
        last_sent_channel: "whatsapp",
      })
      .eq("id", cartId);

    if (updateError) {
      return jsonResponse(
        {
          ok: false,
          message: `WhatsApp-Status konnte nicht gespeichert werden: ${updateError.message}`,
        },
        500
      );
    }

    return jsonResponse({
      ok: true,
      message: "Der WhatsApp-Versand wurde als erledigt gespeichert.",
      channel: "whatsapp",
      sentAt: now,
    });
  } catch (error) {
    console.error("Prepared cart message POST error:", error);

    return jsonResponse(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Die Nachricht konnte nicht verarbeitet werden.",
      },
      500
    );
  }
}