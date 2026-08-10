import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

const templateModule = await import(
  pathToFileURL(join(process.cwd(), "app/lib/lexware/lexwareInvoiceMailTemplate.ts")).href
);
const { buildNativeLexwareInvoiceMailTemplate } = templateModule;

const previewDirectory = join(tmpdir(), "native-lexware-mail-preview-20260810-brand");
await mkdir(previewDirectory, { recursive: true });

const variants = [
  { filename: "bank-transfer", invoiceNumber: "RE0003", paymentMethod: "bank_transfer" },
  { filename: "paypal", invoiceNumber: "RE0004", paymentMethod: "paypal" },
];

for (const variant of variants) {
  const rendered = buildNativeLexwareInvoiceMailTemplate({
    invoiceNumber: variant.invoiceNumber,
    billingName: "Marius TEST",
    totalAmount: "64.19",
    currency: "EUR",
    paymentMethod: variant.paymentMethod,
  });

  await writeFile(join(previewDirectory, `${variant.filename}.html`), rendered.html, "utf8");
  await writeFile(
    join(previewDirectory, `${variant.filename}.txt`),
    `Betreff: ${rendered.subject}\n\n${rendered.text}\n\nAttachment: Rechnung_${variant.invoiceNumber}.pdf (Lexware-Original-PDF)\n`,
    "utf8",
  );
}

console.log(previewDirectory);
