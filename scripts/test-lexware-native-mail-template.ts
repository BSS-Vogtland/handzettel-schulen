import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const templateModule = await import(pathToFileURL(resolve(root, "app/lib/lexware/lexwareInvoiceMailTemplate.ts")).href);
const { buildNativeLexwareInvoiceMailTemplate } = templateModule;

const base = {
  invoiceNumber: "RE0003",
  billingName: "Marius TEST",
  totalAmount: "0.01",
  currency: "EUR",
};

const transfer = buildNativeLexwareInvoiceMailTemplate({ ...base, paymentMethod: "bank_transfer" });
assert.equal(transfer.subject, "Ihre Rechnung RE0003", "subject contract");
assert.equal(transfer.paymentMethodLabel, "Überweisung", "bank_transfer customer label");
assert.doesNotMatch(transfer.text + transfer.html, /bank_transfer/, "no internal payment value in customer copy");
assert.match(transfer.text, /Rechnungsnummer: RE0003/);
assert.match(transfer.text, /Rechnungsbetrag: 0,01\s*€/);
assert.match(transfer.text, /Zahlungsart: Überweisung/);
assert.match(transfer.text, /unter Angabe der Rechnungsnummer RE0003/);
assert.match(transfer.html, /Rechnungsnummer/);
assert.match(transfer.html, /Rechnungsbetrag/);
assert.match(transfer.html, /Zahlungsart/);
assert.match(transfer.html, /font-weight:700/);

for (const paymentMethod of ["paypal", "stripe"] as const) {
  const paid = buildNativeLexwareInvoiceMailTemplate({ ...base, paymentMethod });
  assert.doesNotMatch(paid.text + paid.html, /bitte überweisen|unter Angabe der Rechnungsnummer/i,
    `${paymentMethod} has no transfer instruction`);
  assert.match(paid.text, /bereits/);
}

const pickup = buildNativeLexwareInvoiceMailTemplate({ ...base, paymentMethod: "cash_on_pickup" });
assert.equal(pickup.paymentMethodLabel, "Barzahlung bei Abholung");
assert.doesNotMatch(pickup.text + pickup.html, /bitte überweisen/i);

const unknown = buildNativeLexwareInvoiceMailTemplate({ ...base, paymentMethod: "internal_future_value" });
assert.equal(unknown.paymentMethodLabel, "Gemäß Bestellung");
assert.doesNotMatch(unknown.text + unknown.html, /internal_future_value|bitte überweisen/i);

assert.match(transfer.html, /<meta name="viewport" content="width=device-width,initial-scale=1">/, "mobile viewport");
assert.match(transfer.html, /@media only screen and \(max-width: 600px\)/, "mobile breakpoint");
assert.match(transfer.html, /class="mail-shell"/);
assert.match(transfer.html, /class="invoice-row"/);
assert.match(transfer.text, /Freundliche Grüße\nIhr Team von Handzettel-Schulen\.de\nBSS Vogtland$/);
assert.match(transfer.html, /Ihr Team von Handzettel-Schulen\.de/);
assert.match(transfer.html, /BSS Vogtland/);
assert.match(transfer.text + transfer.html, /PDF im Anhang/);

assert.match(transfer.html, /https:\/\/www\.handzettel-schulen\.de\/handzettel-logo\.png/, "real public brand logo");
for (const brandColor of ["#B5282D", "#102A43", "#FBF7F0", "#E8DED2", "#52616F"]) {
  assert.match(transfer.html, new RegExp(brandColor, "i"), `brand color ${brandColor}`);
}
for (const legacyColor of ["#276c73", "#27364a", "#f3f6f8", "#dce4e9", "#1f2f42", "#f7fafb"]) {
  assert.doesNotMatch(transfer.html, new RegExp(legacyColor, "i"), `legacy petrol color removed: ${legacyColor}`);
}
assert.match(transfer.html, /background:#FFF8EE;border:1px solid #F1D1A8/);
assert.match(transfer.html, /color:#8A4A1F/);
assert.doesNotMatch(transfer.html, /<svg|<picture|background-image|icon/i, "no illustration or icon treatment");
assert.doesNotMatch(transfer.html, /newsletter|jetzt kaufen|angebot sichern/i, "no marketing footer or CTA");
assert.match(transfer.html, /width="620"/);
assert.match(transfer.html, /border-radius:28px/);
assert.match(transfer.html, /border-radius:16px/);

const paypal = buildNativeLexwareInvoiceMailTemplate({ ...base, paymentMethod: "paypal" });
assert.match(paypal.html, /Ihre Zahlung wurde bereits über PayPal abgewickelt\./);
assert.doesNotMatch(paypal.html, /#FFF8EE|#F1D1A8|#8A4A1F/, "paid method has no transfer warning box");

const escaped = buildNativeLexwareInvoiceMailTemplate({
  ...base,
  invoiceNumber: "RE<1>",
  billingName: "Test <script>alert(1)</script>",
  paymentMethod: "bank_transfer",
});
assert.doesNotMatch(escaped.html, /<script>/, "customer data HTML-escaped");
assert.match(escaped.html, /&lt;script&gt;/);

for (const forbidden of ["payload_sha256", "idempotency", "definitely_sent", "checkout_native_lexware", "delivery_state"]) {
  assert.doesNotMatch(transfer.text + transfer.html, new RegExp(forbidden, "i"), `no internal value ${forbidden}`);
}

const processor = await readFile(resolve(root, "app/lib/lexware/lexwareProductionMailProcessor.ts"), "utf8");
assert.match(processor, /buildNativeLexwareInvoiceMailTemplate/);
assert.match(processor, /p_subject:template\.subject,p_text_body:template\.text,p_html_body:template\.html/);
assert.match(processor, /attachment_filename_snapshot|p_attachment_filename/);
assert.match(processor, /loadStoredNativeLexwarePdf/);
assert.equal((processor.match(/sendLexwareInvoiceMailAtMostOnce\s*\(/g) ?? []).length, 1, "delivery path unchanged");
assert.doesNotMatch(processor, /bank_transfer.*p_text_body|bank_transfer.*p_html_body/s, "no duplicate template path");

console.log("PASS: native Lexware invoice mail template, payment copy, mobile HTML and plain text fallback.");
