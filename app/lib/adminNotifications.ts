import nodemailer from "nodemailer";

type MailAddressConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
  to: string;
};

export type AdminShopOrderNotificationParams = {
  requestId: string;
  requestNumber: string | null;
  invoiceNumber: string | null;
  invoiceToken: string;
  customerName: string;
  email: string;
  phone: string | null;
  childName: string | null;
  schoolName: string | null;
  className: string | null;
  fulfillmentMethod: "pickup" | "shipping";
  itemCount: number;
  subtotalAmount: number;
  shippingAmount: number;
  discountName: string | null;
  discountAmount: number;
  totalAmount: number;
  customerMessage: string | null;
};

export type AdminQuestionAnswerNotificationParams = {
  requestId: string;
  requestNumber: string | null;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  childName: string | null;
  schoolName: string | null;
  className: string | null;
  requestItemTitle: string;
  questionText: string;
  answerText: string;
};

function getFirstEnv(names: string[]) {
  for (const name of names) {
    const value = process.env[name];

    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return "";
}

function getMailConfig(): MailAddressConfig | null {
  const host = getFirstEnv(["SMTP_HOST", "MAIL_HOST", "EMAIL_SERVER_HOST"]);
  const portRaw = getFirstEnv(["SMTP_PORT", "MAIL_PORT", "EMAIL_SERVER_PORT"]);
  const user = getFirstEnv(["SMTP_USER", "MAIL_USER", "EMAIL_SERVER_USER"]);
  const password = getFirstEnv([
    "SMTP_PASSWORD",
    "SMTP_PASS",
    "MAIL_PASSWORD",
    "MAIL_PASS",
    "EMAIL_SERVER_PASSWORD",
  ]);

  const from =
    getFirstEnv(["SMTP_FROM", "MAIL_FROM", "EMAIL_FROM"]) ||
    (user ? `Handzettel-Schulen.de <${user}>` : "");

  const to = getFirstEnv([
    "ADMIN_NOTIFICATION_EMAIL",
    "ADMIN_EMAIL",
    "NOTIFICATION_EMAIL",
  ]);

  const port = Number(portRaw || "587");
  const secure = port === 465;

  if (!host || !user || !password || !from || !to || !Number.isFinite(port)) {
    console.warn(
      "Admin-Mailbenachrichtigung nicht konfiguriert. Prüfe SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM und ADMIN_NOTIFICATION_EMAIL."
    );

    return null;
  }

  return {
    host,
    port,
    secure,
    user,
    password,
    from,
    to,
  };
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

function getFulfillmentLabel(method: "pickup" | "shipping") {
  if (method === "shipping") return "Versand";

  return "Abholung";
}

function escapeHtml(value: string | null | undefined) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildAdminUrl(path: string) {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "https://www.handzettel-schulen.de";

  return `${siteUrl}${path}`;
}

export async function sendAdminShopOrderNotification(
  params: AdminShopOrderNotificationParams
) {
  const mailConfig = getMailConfig();

  if (!mailConfig) {
    return {
      ok: false,
      skipped: true,
      message: "Mailversand übersprungen, weil SMTP nicht konfiguriert ist.",
    };
  }

  const transporter = nodemailer.createTransport({
    host: mailConfig.host,
    port: mailConfig.port,
    secure: mailConfig.secure,
    auth: {
      user: mailConfig.user,
      pass: mailConfig.password,
    },
  });

  const invoiceUrl = buildAdminUrl(
    `/rechnung/${encodeURIComponent(params.invoiceToken)}`
  );

  const adminRequestUrl = buildAdminUrl("/admin/anfragen");

  const subject = `Neue Shop-Bestellung: ${
    params.invoiceNumber || params.requestNumber || params.requestId
  }`;

  const discountLine =
    params.discountAmount > 0
      ? `Rabatt: -${formatMoney(params.discountAmount)}${
          params.discountName ? ` (${params.discountName})` : ""
        }`
      : "Rabatt: keiner";

  const text = [
    "Neue Shop-Bestellung eingegangen",
    "",
    `Kunde: ${params.customerName}`,
    `E-Mail: ${params.email}`,
    `Telefon: ${params.phone || "nicht angegeben"}`,
    "",
    `Kind: ${params.childName || "nicht angegeben"}`,
    `Schule: ${params.schoolName || "nicht angegeben"}`,
    `Klasse: ${params.className || "nicht angegeben"}`,
    "",
    `Übergabe: ${getFulfillmentLabel(params.fulfillmentMethod)}`,
    `Artikelanzahl: ${params.itemCount}`,
    `Zwischensumme: ${formatMoney(params.subtotalAmount)}`,
    discountLine,
    `Versand: ${formatMoney(params.shippingAmount)}`,
    `Gesamt: ${formatMoney(params.totalAmount)}`,
    "",
    params.customerMessage
      ? `Kundenhinweis: ${params.customerMessage}`
      : "Kundenhinweis: keiner",
    "",
    `Rechnung: ${invoiceUrl}`,
    `Admin: ${adminRequestUrl}`,
  ].join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; color: #102A43; line-height: 1.5;">
      <div style="background:#102A43;border-radius:24px;padding:22px 24px;color:#ffffff;margin-bottom:22px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
          <tr>
            <td width="72" valign="middle" style="width:72px;padding:0 16px 0 0;">
              <img
                src="${buildAdminUrl("/handzettel-logo.png")}"
                alt="Handzettel-Schulen.de"
                width="64"
                style="display:block;width:64px;max-width:64px;height:auto;border:0;background:#ffffff;border-radius:16px;padding:6px;"
              />
            </td>
            <td valign="middle" style="padding:0;">
              <div style="font-size:22px;font-weight:800;letter-spacing:-0.3px;line-height:1.15;white-space:nowrap;">Handzettel-Schulen.de</div>
              <div style="margin-top:6px;font-size:14px;line-height:1.35;color:#F7EFE6;">Neue Shop-Bestellung eingegangen</div>
            </td>
          </tr>
        </table>
      </div>

      <h1 style="margin: 0 0 16px; color: #102A43;">Neue Shop-Bestellung eingegangen</h1>

      <div style="padding: 16px; border: 1px solid #E8DED2; border-radius: 16px; background: #FBF7F0; margin-bottom: 16px;">
        <p><strong>Kunde:</strong> ${escapeHtml(params.customerName)}</p>
        <p><strong>E-Mail:</strong> ${escapeHtml(params.email)}</p>
        <p><strong>Telefon:</strong> ${escapeHtml(params.phone || "nicht angegeben")}</p>
      </div>

      <div style="padding: 16px; border: 1px solid #E8DED2; border-radius: 16px; background: #ffffff; margin-bottom: 16px;">
        <p><strong>Kind:</strong> ${escapeHtml(params.childName || "nicht angegeben")}</p>
        <p><strong>Schule:</strong> ${escapeHtml(params.schoolName || "nicht angegeben")}</p>
        <p><strong>Klasse:</strong> ${escapeHtml(params.className || "nicht angegeben")}</p>
      </div>

      <div style="padding: 16px; border: 1px solid #E8DED2; border-radius: 16px; background: #ffffff; margin-bottom: 16px;">
        <p><strong>Übergabe:</strong> ${escapeHtml(getFulfillmentLabel(params.fulfillmentMethod))}</p>
        <p><strong>Artikelanzahl:</strong> ${params.itemCount}</p>
        <p><strong>Zwischensumme:</strong> ${formatMoney(params.subtotalAmount)}</p>
        <p><strong>Rabatt:</strong> ${
          params.discountAmount > 0
            ? `-${formatMoney(params.discountAmount)}${
                params.discountName ? ` (${escapeHtml(params.discountName)})` : ""
              }`
            : "keiner"
        }</p>
        <p><strong>Versand:</strong> ${formatMoney(params.shippingAmount)}</p>
        <p style="font-size: 20px;"><strong>Gesamt:</strong> ${formatMoney(params.totalAmount)}</p>
      </div>

      <div style="padding: 16px; border: 1px solid #E8DED2; border-radius: 16px; background: #FFF8EE; margin-bottom: 16px;">
        <p><strong>Kundenhinweis:</strong></p>
        <p>${escapeHtml(params.customerMessage || "kein Hinweis")}</p>
      </div>

      <p>
        <a href="${invoiceUrl}" style="display: inline-block; padding: 12px 18px; background: #102A43; color: #ffffff; border-radius: 12px; text-decoration: none; font-weight: bold;">
          Rechnung öffnen
        </a>
      </p>

      <p>
        <a href="${adminRequestUrl}" style="color: #A75B28; font-weight: bold;">
          Admin-Anfragen öffnen
        </a>
      </p>
    </div>
  `;

  const info = await transporter.sendMail({
    from: mailConfig.from,
    to: mailConfig.to,
    subject,
    text,
    html,
  });

  return {
    ok: true,
    skipped: false,
    messageId: info.messageId,
  };
}

export async function sendAdminQuestionAnswerNotification(
  params: AdminQuestionAnswerNotificationParams
) {
  const mailConfig = getMailConfig();

  if (!mailConfig) {
    return {
      ok: false,
      skipped: true,
      message: "Mailversand übersprungen, weil SMTP nicht konfiguriert ist.",
    };
  }

  const transporter = nodemailer.createTransport({
    host: mailConfig.host,
    port: mailConfig.port,
    secure: mailConfig.secure,
    auth: {
      user: mailConfig.user,
      pass: mailConfig.password,
    },
  });

  const adminRequestUrl = buildAdminUrl(
    `/admin/anfragen/${encodeURIComponent(params.requestId)}`
  );

  const requestLabel =
    params.requestNumber || params.customerName || params.requestId;

  const subject = `Antwort auf Rückfrage: ${requestLabel}`;

  const text = [
    "Eine Rückfrage wurde beantwortet",
    "",
    `Anfrage: ${params.requestNumber || params.requestId}`,
    `Kunde: ${params.customerName || "nicht angegeben"}`,
    `E-Mail: ${params.customerEmail || "nicht angegeben"}`,
    `Telefon: ${params.customerPhone || "nicht angegeben"}`,
    "",
    `Kind: ${params.childName || "nicht angegeben"}`,
    `Schule: ${params.schoolName || "nicht angegeben"}`,
    `Klasse: ${params.className || "nicht angegeben"}`,
    "",
    `Position: ${params.requestItemTitle}`,
    "",
    "Gestellte Rückfrage:",
    params.questionText,
    "",
    "Antwort des Kunden:",
    params.answerText,
    "",
    `Admin öffnen: ${adminRequestUrl}`,
  ].join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; color: #102A43; line-height: 1.5;">
      <div style="background:#102A43;border-radius:24px;padding:22px 24px;color:#ffffff;margin-bottom:22px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
          <tr>
            <td width="72" valign="middle" style="width:72px;padding:0 16px 0 0;">
              <img
                src="${buildAdminUrl("/handzettel-logo.png")}"
                alt="Handzettel-Schulen.de"
                width="64"
                style="display:block;width:64px;max-width:64px;height:auto;border:0;background:#ffffff;border-radius:16px;padding:6px;"
              />
            </td>
            <td valign="middle" style="padding:0;">
              <div style="font-size:22px;font-weight:800;letter-spacing:-0.3px;line-height:1.15;white-space:nowrap;">Handzettel-Schulen.de</div>
              <div style="margin-top:6px;font-size:14px;line-height:1.35;color:#F7EFE6;">Eine Rückfrage wurde beantwortet</div>
            </td>
          </tr>
        </table>
      </div>

      <h1 style="margin: 0 0 16px; color: #102A43;">Eine Rückfrage wurde beantwortet</h1>

      <div style="padding: 16px; border: 1px solid #E8DED2; border-radius: 16px; background: #FBF7F0; margin-bottom: 16px;">
        <p><strong>Anfrage:</strong> ${escapeHtml(params.requestNumber || params.requestId)}</p>
        <p><strong>Kunde:</strong> ${escapeHtml(params.customerName || "nicht angegeben")}</p>
        <p><strong>E-Mail:</strong> ${escapeHtml(params.customerEmail || "nicht angegeben")}</p>
        <p><strong>Telefon:</strong> ${escapeHtml(params.customerPhone || "nicht angegeben")}</p>
      </div>

      <div style="padding: 16px; border: 1px solid #E8DED2; border-radius: 16px; background: #ffffff; margin-bottom: 16px;">
        <p><strong>Kind:</strong> ${escapeHtml(params.childName || "nicht angegeben")}</p>
        <p><strong>Schule:</strong> ${escapeHtml(params.schoolName || "nicht angegeben")}</p>
        <p><strong>Klasse:</strong> ${escapeHtml(params.className || "nicht angegeben")}</p>
      </div>

      <div style="padding: 16px; border: 1px solid #F1D1A8; border-radius: 16px; background: #FFF8EE; margin-bottom: 16px;">
        <p><strong>Position:</strong> ${escapeHtml(params.requestItemTitle)}</p>
        <p style="margin-top: 14px;"><strong>Gestellte Rückfrage:</strong></p>
        <p>${escapeHtml(params.questionText)}</p>
      </div>

      <div style="padding: 16px; border: 1px solid #BFE3CD; border-radius: 16px; background: #F0FFF6; margin-bottom: 16px;">
        <p><strong>Antwort des Kunden:</strong></p>
        <p style="font-size: 18px; font-weight: bold; white-space: pre-wrap;">${escapeHtml(params.answerText)}</p>
      </div>

      <p>
        <a href="${adminRequestUrl}" style="display: inline-block; padding: 12px 18px; background: #102A43; color: #ffffff; border-radius: 12px; text-decoration: none; font-weight: bold;">
          Anfrage im Admin öffnen
        </a>
      </p>
    </div>
  `;

  const info = await transporter.sendMail({
    from: mailConfig.from,
    to: mailConfig.to,
    subject,
    text,
    html,
  });

  return {
    ok: true,
    skipped: false,
    messageId: info.messageId,
  };
}
