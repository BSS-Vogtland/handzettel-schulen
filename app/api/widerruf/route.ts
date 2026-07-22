import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendMailReliable } from "@/lib/mail/sendMailReliable";
import {
  getGeneralEmail,
  getLegalAddress,
  getLegalDisplayName,
  getLegalSettings,
} from "@/lib/legal-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type WithdrawalBody = {
  customerName?: unknown;
  contractReference?: unknown;
  customerEmail?: unknown;
  withdrawalScope?: unknown;
  customerMessage?: unknown;
  website?: unknown;
};

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase Umgebungsvariablen fehlen. Prüfe NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function cleanText(
  value: unknown,
  maxLength: number,
) {
  return String(value ?? "")
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, maxLength);
}

function normalizeEmail(value: unknown) {
  return cleanText(value, 320).toLowerCase();
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildReferenceNumber(now: Date) {
  const datePart = now
    .toISOString()
    .slice(0, 10)
    .replaceAll("-", "");
  const randomPart = randomUUID()
    .replaceAll("-", "")
    .slice(0, 8)
    .toUpperCase();

  return `WD-${datePart}-${randomPart}`;
}

function formatGermanDateTime(value: Date) {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(value);
}

function buildCustomerText(params: {
  displayName: string;
  address: string[];
  email: string;
  phone: string | null;
  referenceNumber: string;
  submittedAt: string;
  customerName: string;
  contractReference: string;
  withdrawalScope: string;
  customerMessage: string;
}) {
  const lines = [
    "Eingangsbestätigung Deines Widerrufs",
    "",
    `Referenz: ${params.referenceNumber}`,
    `Eingang: ${params.submittedAt}`,
    "",
    `Name: ${params.customerName}`,
    `Bestell-/Vertragskennung: ${params.contractReference}`,
    `Umfang: ${
      params.withdrawalScope ||
      "Vollständiger Widerruf des angegebenen Vertrags"
    }`,
    params.customerMessage
      ? `Weitere Nachricht: ${params.customerMessage}`
      : null,
    "",
    "Wir bestätigen hiermit den Eingang Deiner elektronischen Widerrufserklärung.",
    "Diese Nachricht dokumentiert Inhalt, Datum und Uhrzeit des Eingangs.",
    "",
    params.displayName,
    ...params.address,
    `E-Mail: ${params.email}`,
    params.phone ? `Telefon: ${params.phone}` : null,
  ].filter((line): line is string => Boolean(line));

  return lines.join("\n");
}

function buildCustomerHtml(params: {
  displayName: string;
  address: string[];
  email: string;
  phone: string | null;
  referenceNumber: string;
  submittedAt: string;
  customerName: string;
  contractReference: string;
  withdrawalScope: string;
  customerMessage: string;
}) {
  const addressHtml = params.address
    .map((line) => escapeHtml(line))
    .join("<br />");

  return `
    <div style="font-family:Arial,sans-serif;background:#FBF7F0;padding:24px;color:#102A43;">
      <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #E8DED2;border-radius:24px;padding:28px;">
        <p style="margin:0 0 8px;color:#2F7D50;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:0.12em;">
          Widerruf eingegangen
        </p>
        <h1 style="margin:0 0 18px;font-size:26px;line-height:1.25;">
          Eingangsbestätigung Deines Widerrufs
        </h1>

        <div style="background:#F0FFF6;border:1px solid #BFE3CD;border-radius:16px;padding:16px;margin-bottom:20px;">
          <p style="margin:0 0 6px;"><strong>Referenz:</strong> ${escapeHtml(
            params.referenceNumber,
          )}</p>
          <p style="margin:0;"><strong>Eingang:</strong> ${escapeHtml(
            params.submittedAt,
          )}</p>
        </div>

        <table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr>
            <td style="padding:8px 0;color:#52616F;vertical-align:top;">Name</td>
            <td style="padding:8px 0;font-weight:700;vertical-align:top;">${escapeHtml(
              params.customerName,
            )}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#52616F;vertical-align:top;">Bestell-/Vertragskennung</td>
            <td style="padding:8px 0;font-weight:700;vertical-align:top;">${escapeHtml(
              params.contractReference,
            )}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#52616F;vertical-align:top;">Umfang</td>
            <td style="padding:8px 0;font-weight:700;vertical-align:top;">${escapeHtml(
              params.withdrawalScope ||
                "Vollständiger Widerruf des angegebenen Vertrags",
            )}</td>
          </tr>
          ${
            params.customerMessage
              ? `
          <tr>
            <td style="padding:8px 0;color:#52616F;vertical-align:top;">Weitere Nachricht</td>
            <td style="padding:8px 0;font-weight:700;vertical-align:top;white-space:pre-wrap;">${escapeHtml(
              params.customerMessage,
            )}</td>
          </tr>`
              : ""
          }
        </table>

        <p style="margin:22px 0 0;font-size:14px;line-height:1.65;color:#52616F;">
          Wir bestätigen hiermit den Eingang Deiner elektronischen
          Widerrufserklärung. Diese Nachricht dokumentiert Inhalt, Datum und
          Uhrzeit des Eingangs.
        </p>

        <div style="margin-top:24px;padding-top:18px;border-top:1px solid #E8DED2;font-size:13px;line-height:1.6;color:#52616F;">
          <strong style="color:#102A43;">${escapeHtml(
            params.displayName,
          )}</strong><br />
          ${addressHtml}
          ${addressHtml ? "<br />" : ""}
          E-Mail: ${escapeHtml(params.email)}
          ${
            params.phone
              ? `<br />Telefon: ${escapeHtml(params.phone)}`
              : ""
          }
        </div>
      </div>
    </div>
  `;
}

export async function POST(request: Request) {
  const contentLength = Number(
    request.headers.get("content-length") || "0",
  );

  if (Number.isFinite(contentLength) && contentLength > 32_000) {
    return NextResponse.json(
      {
        ok: false,
        received: false,
        message: "Die übermittelten Daten sind zu umfangreich.",
      },
      { status: 413 },
    );
  }

  try {
    const body = (await request.json()) as WithdrawalBody;

    if (cleanText(body.website, 200)) {
      return NextResponse.json({
        ok: true,
        received: true,
        referenceNumber: "WD-RECEIVED",
        submittedAt: formatGermanDateTime(new Date()),
        message: "Der Widerruf wurde übermittelt.",
      });
    }

    const customerName = cleanText(body.customerName, 200);
    const contractReference = cleanText(
      body.contractReference,
      200,
    );
    const customerEmail = normalizeEmail(body.customerEmail);
    const withdrawalScope = cleanText(
      body.withdrawalScope,
      2000,
    );
    const customerMessage = cleanText(
      body.customerMessage,
      2000,
    );

    if (customerName.length < 2) {
      return NextResponse.json(
        {
          ok: false,
          received: false,
          message: "Bitte gib Deinen Namen an.",
        },
        { status: 400 },
      );
    }

    if (contractReference.length < 2) {
      return NextResponse.json(
        {
          ok: false,
          received: false,
          message:
            "Bitte gib eine Bestell-, Rechnungs- oder Vertragskennung an.",
        },
        { status: 400 },
      );
    }

    if (!isValidEmail(customerEmail)) {
      return NextResponse.json(
        {
          ok: false,
          received: false,
          message:
            "Bitte gib eine gültige E-Mail-Adresse für die Eingangsbestätigung an.",
        },
        { status: 400 },
      );
    }

    const now = new Date();
    const submittedAtIso = now.toISOString();
    const submittedAtGerman = formatGermanDateTime(now);
    const referenceNumber = buildReferenceNumber(now);
    const userAgent = cleanText(
      request.headers.get("user-agent"),
      500,
    );

    const supabase = getSupabaseAdmin();

    const { data: storedWithdrawal, error: insertError } =
      await supabase
        .from("customer_withdrawal_requests")
        .insert({
          reference_number: referenceNumber,
          customer_name: customerName,
          contract_reference: contractReference,
          customer_email: customerEmail,
          withdrawal_scope: withdrawalScope || null,
          customer_message: customerMessage || null,
          submitted_at: submittedAtIso,
          status: "received",
          user_agent: userAgent || null,
        })
        .select("id")
        .single();

    if (insertError || !storedWithdrawal) {
      throw new Error(
        `Der Widerruf konnte nicht gespeichert werden: ${
          insertError?.message || "Datensatz fehlt"
        }`,
      );
    }

    const settings = await getLegalSettings();
    const displayName = getLegalDisplayName(settings);
    const address = getLegalAddress(settings);
    const contactEmail =
      getGeneralEmail(settings) || "kontakt@bss-vogtland.de";
    const notificationEmail =
      process.env.WITHDRAWAL_NOTIFICATION_EMAIL?.trim() ||
      contactEmail;

    const mailParams = {
      displayName,
      address,
      email: contactEmail,
      phone: settings.phone_primary,
      referenceNumber,
      submittedAt: submittedAtGerman,
      customerName,
      contractReference,
      customerEmail,
      withdrawalScope,
      customerMessage,
    };

    let confirmationSent = false;
    let adminNotificationSent = false;
    let confirmationError: string | null = null;

    try {
      await sendMailReliable({
        to: customerEmail,
        subject: `Eingangsbestätigung Widerruf ${referenceNumber}`,
        text: buildCustomerText(mailParams),
        html: buildCustomerHtml(mailParams),
      });

      confirmationSent = true;

      await supabase
        .from("customer_withdrawal_requests")
        .update({
          confirmation_sent_at: new Date().toISOString(),
          status: "confirmed",
        })
        .eq("id", storedWithdrawal.id);
    } catch (error) {
      confirmationError =
        error instanceof Error ? error.message : String(error);

      console.error("withdrawal_confirmation_mail_failed", {
        referenceNumber,
        error: confirmationError,
      });
    }

    try {
      const adminText = [
        "Neue elektronische Widerrufserklärung",
        "",
        `Referenz: ${referenceNumber}`,
        `Eingang: ${submittedAtGerman}`,
        `Name: ${customerName}`,
        `E-Mail: ${customerEmail}`,
        `Bestell-/Vertragskennung: ${contractReference}`,
        `Umfang: ${
          withdrawalScope ||
          "Vollständiger Widerruf des angegebenen Vertrags"
        }`,
        customerMessage
          ? `Weitere Nachricht: ${customerMessage}`
          : null,
        `Kundenbestätigung versendet: ${
          confirmationSent ? "ja" : "nein"
        }`,
        confirmationError
          ? `Fehler Kundenbestätigung: ${confirmationError}`
          : null,
      ]
        .filter((line): line is string => Boolean(line))
        .join("\n");

      const adminHtml = `
        <div style="font-family:Arial,sans-serif;color:#102A43;">
          <h1>Neue elektronische Widerrufserklärung</h1>
          <p><strong>Referenz:</strong> ${escapeHtml(
            referenceNumber,
          )}</p>
          <p><strong>Eingang:</strong> ${escapeHtml(
            submittedAtGerman,
          )}</p>
          <p><strong>Name:</strong> ${escapeHtml(
            customerName,
          )}</p>
          <p><strong>E-Mail:</strong> ${escapeHtml(
            customerEmail,
          )}</p>
          <p><strong>Bestell-/Vertragskennung:</strong> ${escapeHtml(
            contractReference,
          )}</p>
          <p><strong>Umfang:</strong> ${escapeHtml(
            withdrawalScope ||
              "Vollständiger Widerruf des angegebenen Vertrags",
          )}</p>
          ${
            customerMessage
              ? `<p><strong>Weitere Nachricht:</strong><br />${escapeHtml(
                  customerMessage,
                )}</p>`
              : ""
          }
          <p><strong>Kundenbestätigung versendet:</strong> ${
            confirmationSent ? "ja" : "nein"
          }</p>
          ${
            confirmationError
              ? `<p style="color:#A61B1B;"><strong>Fehler Kundenbestätigung:</strong> ${escapeHtml(
                  confirmationError,
                )}</p>`
              : ""
          }
        </div>
      `;

      await sendMailReliable({
        to: notificationEmail,
        replyTo: customerEmail,
        subject: `Widerruf ${referenceNumber} · ${contractReference}`,
        text: adminText,
        html: adminHtml,
      });

      adminNotificationSent = true;

      await supabase
        .from("customer_withdrawal_requests")
        .update({
          admin_notification_sent_at:
            new Date().toISOString(),
        })
        .eq("id", storedWithdrawal.id);
    } catch (error) {
      console.error("withdrawal_admin_mail_failed", {
        referenceNumber,
        error:
          error instanceof Error ? error.message : String(error),
      });
    }

    if (!confirmationSent) {
      return NextResponse.json(
        {
          ok: false,
          received: true,
          referenceNumber,
          submittedAt: submittedAtGerman,
          confirmationSent: false,
          message:
            "Dein Widerruf wurde gespeichert, die E-Mail-Eingangsbestätigung konnte aber nicht versendet werden. Bitte notiere die Referenz und kontaktiere uns zusätzlich per E-Mail.",
          adminNotificationSent,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      received: true,
      referenceNumber,
      submittedAt: submittedAtGerman,
      confirmationSent: true,
      message:
        "Dein Widerruf wurde gespeichert und per E-Mail bestätigt.",
      adminNotificationSent,
    });
  } catch (error) {
    console.error("withdrawal_submission_failed", error);

    return NextResponse.json(
      {
        ok: false,
        received: false,
        message:
          error instanceof Error
            ? error.message
            : "Der Widerruf konnte nicht verarbeitet werden.",
      },
      { status: 500 },
    );
  }
}
