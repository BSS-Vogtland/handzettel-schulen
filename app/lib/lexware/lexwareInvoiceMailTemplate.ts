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

function resolvePaymentCopy(paymentMethod: string | null, invoiceNumber: string) {
  switch (paymentMethod) {
    case "bank_transfer":
      return {
        label: "Überweisung",
        instruction: `Bitte überweisen Sie den Rechnungsbetrag unter Angabe der Rechnungsnummer ${invoiceNumber}. Sobald Ihre Zahlung bei uns eingegangen ist, kann Ihre Bestellung weiterbearbeitet werden.`,
      };
    case "paypal":
      return {
        label: "PayPal",
        instruction: "Ihre Zahlung wurde bereits über PayPal abgewickelt.",
      };
    case "stripe":
      return {
        label: "Kreditkarte",
        instruction: "Ihre Zahlung wurde bereits per Kreditkarte abgewickelt.",
      };
    case "cash_on_pickup":
      return {
        label: "Zahlung bei Abholung",
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
  const payment = resolvePaymentCopy(input.paymentMethod, invoiceNumber);
  const name = input.billingName?.trim() || null;
  const greeting = name ? `Hallo ${name},` : "Hallo,";
  const subject = `Ihre Rechnung ${invoiceNumber}`;

  const text = [
    subject,
    "",
    greeting,
    "",
    "vielen Dank für Ihre Bestellung bei Handzettel-Schulen.de. Ihre Rechnung finden Sie als PDF im Anhang.",
    "",
    `Rechnungsnummer: ${invoiceNumber}`,
    `Rechnungsbetrag: ${formattedAmount}`,
    `Zahlungsart: ${payment.label}`,
    ...(payment.instruction ? ["", payment.instruction] : []),
    "",
    "Bei Fragen antworten Sie einfach auf diese E-Mail.",
    "",
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
    ? `<p style="margin:24px 0 0;color:#27364a;font-size:15px;line-height:1.65;">${safe.instruction}</p>`
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
      .mail-content { padding: 24px 20px !important; }
      .invoice-row td { display: block !important; width: 100% !important; padding: 4px 0 !important; text-align: left !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#f3f6f8;color:#27364a;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f3f6f8;">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" class="mail-shell" style="width:600px;max-width:100%;background:#ffffff;border:1px solid #dce4e9;border-radius:10px;overflow:hidden;">
        <tr><td style="height:6px;background:#276c73;font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td class="mail-content" style="padding:32px 36px;">
          <p style="margin:0 0 8px;color:#276c73;font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;">Handzettel-Schulen.de</p>
          <h1 style="margin:0 0 24px;color:#1f2f42;font-size:25px;line-height:1.25;">${safe.subject}</h1>
          <p style="margin:0 0 14px;font-size:15px;line-height:1.65;">${safe.greeting}</p>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.65;">Vielen Dank für Ihre Bestellung bei Handzettel-Schulen.de. Ihre Rechnung finden Sie als PDF im Anhang.</p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f7fafb;border:1px solid #dce4e9;border-radius:8px;">
            <tr class="invoice-row">
              <td style="padding:18px 20px 6px;color:#5a6878;font-size:13px;">Rechnungsnummer</td>
              <td style="padding:18px 20px 6px;color:#1f2f42;font-size:16px;font-weight:700;text-align:right;">${safe.invoiceNumber}</td>
            </tr>
            <tr class="invoice-row">
              <td style="padding:8px 20px 6px;color:#5a6878;font-size:13px;">Rechnungsbetrag</td>
              <td style="padding:8px 20px 6px;color:#1f2f42;font-size:19px;font-weight:700;text-align:right;">${safe.amount}</td>
            </tr>
            <tr class="invoice-row">
              <td style="padding:8px 20px 18px;color:#5a6878;font-size:13px;">Zahlungsart</td>
              <td style="padding:8px 20px 18px;color:#276c73;font-size:16px;font-weight:700;text-align:right;">${safe.paymentLabel}</td>
            </tr>
          </table>
          ${instructionHtml}
          <p style="margin:24px 0 0;font-size:15px;line-height:1.65;">Bei Fragen antworten Sie einfach auf diese E-Mail.</p>
          <p style="margin:28px 0 0;color:#1f2f42;font-size:15px;line-height:1.55;"><strong>Ihr Team von Handzettel-Schulen.de</strong><br><span style="color:#7b8794;font-size:13px;">BSS Vogtland</span></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, text, html, paymentMethodLabel: payment.label };
}
