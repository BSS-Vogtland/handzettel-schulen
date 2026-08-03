import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const moduleUrl = new URL("../app/lib/paymentSettings.ts", import.meta.url).href;
const settings = await import(moduleUrl);
const current = settings.validateBankTransferDetails(settings.BANK_TRANSFER_DETAILS);
assert.equal(current.currency, "EUR");
console.log("A PASS");

assert.equal(settings.normalizeIban(settings.BANK_TRANSFER_DETAILS.iban), "DE52870580000101072104");
console.log("B PASS");

assert.equal(settings.isValidIbanMod97(settings.BANK_TRANSFER_DETAILS.iban), true);
console.log("C PASS");

assert.throws(() => settings.validateBankTransferDetails({ ...settings.BANK_TRANSFER_DETAILS, iban: "DE51270580000101072104" }));
console.log("D PASS");

const historical = {
  bank_account_holder_snapshot: "Historischer Kontoinhaber",
  bank_name_snapshot: "Historische Bank",
  bank_iban_snapshot: "DE12500105170648489890",
  bank_bic_snapshot: "INGDDEFFXXX",
};
const historicalResolved = settings.resolveBankTransferDetails(historical);
assert.equal(historicalResolved.bankName, historical.bank_name_snapshot);
console.log("E PASS");

assert.equal(settings.resolveBankTransferDetails(null).iban, current.iban);
console.log("F PASS");

assert.throws(
  () => settings.resolveBankTransferDetails({ bank_iban_snapshot: current.iban }),
  (error: unknown) => (error as { code?: string }).code === "BANK_TRANSFER_SNAPSHOT_INCOMPLETE",
);
console.log("G PASS");

assert.throws(() => settings.resolveBankTransferDetails({
  bank_account_holder_snapshot: current.accountHolder,
  bank_name_snapshot: current.bankName,
  bank_iban_snapshot: current.iban,
}));
console.log("H PASS");

const completion = readFileSync("app/rechnung/[invoiceToken]/abschluss/page.tsx", "utf8");
assert.match(completion, /createEpcQrPayload\(invoice, bankDetails\)/);
assert.equal((completion.match(/resolveBankTransferDetails\(invoice\)/g) || []).length, 1);
console.log("I PASS");

const pdf = readFileSync("app/lib/requestInvoicePdfService.ts", "utf8");
assert.equal((pdf.match(/resolveBankTransferDetails\(invoice\)/g) || []).length, 1);
assert.doesNotMatch(pdf, /bankLine1|bankLine2/);
console.log("J PASS");

const snapshot = settings.createBankTransferSnapshot();
assert.ok(snapshot.bank_account_holder_snapshot && snapshot.bank_name_snapshot && snapshot.bank_iban_snapshot && snapshot.bank_bic_snapshot);
console.log("K PASS");

const adminRoute = readFileSync("app/api/admin/requests/[id]/invoice/create/route.ts", "utf8");
assert.match(adminRoute, /bankSnapshotState !== "complete"/);
assert.ok(adminRoute.indexOf("...createBankTransferSnapshot()") > adminRoute.indexOf(".insert({"));
console.log("L PASS");

assert.match(adminRoute, /BANK_TRANSFER_SNAPSHOT_MISSING/);
console.log("M PASS");

assert.match(adminRoute, /BANK_TRANSFER_SNAPSHOT_INCOMPLETE/);
console.log("N PASS");

assert.deepEqual(settings.resolveBankTransferDetails(historical), historicalResolved);
console.log("O PASS");

assert.match(completion, /invoice\.invoice_number/);
console.log("P PASS");

for (const source of [completion, pdf]) {
  assert.doesNotMatch(source, /DE56 8705 8000 3812 0058 82|DE56870580003812005882/);
}
console.log("Q PASS");

const migration = readFileSync("supabase/migrations/20260803060000_future_invoice_bank_snapshot.sql", "utf8");
assert.match(migration, /create or replace function public\.set_school_request_invoice_provider_on_insert/);
assert.doesNotMatch(migration, /create trigger/i);
assert.match(migration, /security definer/i);
assert.match(migration, /set search_path = public, pg_temp/i);
assert.match(migration, /BANK_TRANSFER_SNAPSHOT_INCOMPLETE/);
assert.doesNotMatch(migration, /update public\.school_request_invoices/i);
console.log("R PASS: PayPal- und Permit-Dateien sind nicht Bestandteil der Bankkorrektur");
