export type NativeLexwareInvoiceMailTemplateInput = {
  invoiceNumber: string;
  billingName: string | null;
  totalAmount: number | string;
  currency: string | null;
  paymentMethod: string | null;
};

export type NativeLexwareInvoiceMailTemplate = {
  subject: string;
  text: string;
  html: string;
  paymentMethodLabel: string;
};

const escapeHtml = (value: string) => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

const HANDZETTEL_LOGO_URL = "https://www.handzettel-schulen.de/handzettel-logo.png";

function resolvePaymentCopy(
  paymentMethod: string | null,
  invoiceNumber: string,
  formattedAmount: string,
) {
  switch (paymentMethod) {
    case "bank_transfer":
      return {
        label: "Überweisung",
        instruction: `Bitte überweisen Sie ${formattedAmount} unter Angabe der Rechnungsnummer ${invoiceNumber}. Sobald Ihre Zahlung eingegangen ist, bearbeiten wir Ihre Bestellung weiter.`,
      };
    case "paypal":
      return {
        label: "PayPal",
        instruction: "Die Zahlung über PayPal ist bereits erfolgt. Sie müssen nichts weiter veranlassen.",
      };
    case "stripe":
      return {
        label: "Kreditkarte",
        instruction: "Ihre Zahlung wurde bereits per Kreditkarte abgewickelt.",
      };
    case "cash_on_pickup":
      return {
        label: "Barzahlung bei Abholung",
        instruction: "Sie bezahlen den Rechnungsbetrag bei der Abholung.",
      };
    default:
      return {
        label: "Gemäß Bestellung",
        instruction: null,
      };
  }
}

export function buildNativeLexwareInvoiceMailTemplate(
  input: NativeLexwareInvoiceMailTemplateInput,
): NativeLexwareInvoiceMailTemplate {
  const invoiceNumber = input.invoiceNumber.trim();
  if (!invoiceNumber) throw new Error("NATIVE_MAIL_INVOICE_NUMBER_REQUIRED");

  const amount = Number(input.totalAmount);
  if (!Number.isFinite(amount) || amount < 0) throw new Error("NATIVE_MAIL_AMOUNT_INVALID");

  const currency = (input.currency || "EUR").trim().toUpperCase();
  const formattedAmount = new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency,
  }).format(amount);
  const payment = resolvePaymentCopy(input.paymentMethod, invoiceNumber, formattedAmount);
  const name = input.billingName?.trim() || null;
  const greeting = name ? `Hallo ${name},` : "Hallo,";
  const subject = `Ihre Rechnung ${invoiceNumber}`;

  const text = [
    subject,
    "",
    greeting,
    "",
    "vielen Dank für Ihre Bestellung bei Handzettel-Schulen.de.",
    "Ihre Rechnung finden Sie als PDF im Anhang.",
    "",
    `Rechnungsnummer: ${invoiceNumber}`,
    `Rechnungsbetrag: ${formattedAmount}`,
    `Zahlungsart: ${payment.label}`,
    ...(payment.instruction ? ["", payment.instruction] : []),
    "",
    "Bei Fragen antworten Sie einfach auf diese E-Mail.",
    "",
    "Freundliche Grüße",
    "Ihr Team von Handzettel-Schulen.de",
    "BSS Vogtland",
  ].join("\n");

  const safe = {
    amount: escapeHtml(formattedAmount),
    greeting: escapeHtml(greeting),
    instruction: payment.instruction ? escapeHtml(payment.instruction) : null,
    invoiceNumber: escapeHtml(invoiceNumber),
    paymentLabel: escapeHtml(payment.label),
    subject: escapeHtml(subject),
  };
  const instructionHtml = safe.instruction
    ? input.paymentMethod === "bank_transfer"
      ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:18px;background:#FFF8EE;border:1px solid #F1D1A8;border-radius:16px;"><tr><td style="padding:16px 20px;color:#8A4A1F;font-size:15px;line-height:1.6;">${safe.instruction}</td></tr></table>`
      : `<p style="margin:18px 0 0;color:#52616F;font-size:15px;line-height:1.6;">${safe.instruction}</p>`
    : "";

  const html = `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${safe.subject}</title>
  <style>
    @media only screen and (max-width: 600px) {
      .mail-shell { width: 100% !important; }
      .mail-outer { padding: 12px 10px !important; }
      .mail-content { padding: 20px !important; }
      .brand-logo { width: 200px !important; max-width: 100% !important; height: auto !important; }
      .mail-heading { font-size: 24px !important; }
      .invoice-row td { display: block !important; width: 100% !important; padding: 4px 0 !important; text-align: left !important; }
      .invoice-row-first td:first-child { padding-top: 18px !important; }
      .invoice-row-last td:last-child { padding-bottom: 18px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#FBF7F0;color:#102A43;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#FBF7F0;">
    <tr><td align="center" class="mail-outer" style="padding:24px 12px;">
      <table role="presentation" width="620" cellspacing="0" cellpadding="0" border="0" class="mail-shell" style="width:620px;max-width:100%;background:#FFFFFF;border:1px solid #E8DED2;border-top:4px solid #B5282D;border-radius:28px;overflow:hidden;">
        <tr><td class="mail-content" style="padding:24px 28px;">
          <img class="brand-logo" src="${HANDZETTEL_LOGO_URL}" width="250" alt="Handzettel-Schulen.de" style="display:block;width:250px;max-width:100%;height:auto;margin:0 0 10px;border:0;">
          <h1 class="mail-heading" style="margin:0 0 18px;color:#102A43;font-size:28px;font-weight:700;line-height:1.3;">${safe.subject}</h1>
          <p style="margin:0 0 10px;color:#52616F;font-size:15px;line-height:1.6;">${safe.greeting}</p>
          <p style="margin:0 0 20px;color:#52616F;font-size:15px;line-height:1.6;">Vielen Dank für Ihre Bestellung bei Handzettel-Schulen.de.<br>Ihre Rechnung finden Sie als PDF im Anhang dieser E-Mail.</p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#FBF7F0;border:1px solid #E8DED2;border-radius:16px;">
            <tr class="invoice-row invoice-row-first">
              <td style="padding:20px 22px 7px;color:#52616F;font-size:13px;">Rechnungsnummer</td>
              <td style="padding:20px 22px 7px;color:#102A43;font-size:16px;font-weight:700;text-align:right;">${safe.invoiceNumber}</td>
            </tr>
            <tr class="invoice-row">
              <td style="padding:8px 22px 7px;color:#52616F;font-size:13px;">Rechnungsbetrag</td>
              <td style="padding:8px 22px 7px;color:#102A43;font-size:20px;font-weight:700;text-align:right;">${safe.amount}</td>
            </tr>
            <tr class="invoice-row invoice-row-last">
              <td style="padding:8px 22px 20px;color:#52616F;font-size:13px;">Zahlungsart</td>
              <td style="padding:8px 22px 20px;color:#102A43;font-size:16px;font-weight:700;text-align:right;">${safe.paymentLabel}</td>
            </tr>
          </table>
          ${instructionHtml}
          <p style="margin:18px 0 0;color:#52616F;font-size:15px;line-height:1.6;">Bei Fragen zu Ihrer Bestellung oder Rechnung antworten Sie einfach auf diese E-Mail.</p>
          <p style="margin:20px 0 0;color:#52616F;font-size:15px;line-height:1.55;">Freundliche Grüße<br><strong style="color:#102A43;">Ihr Team von Handzettel-Schulen.de</strong><br><span style="color:#52616F;font-size:13px;">BSS Vogtland</span></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, text, html, paymentMethodLabel: payment.label };
}
