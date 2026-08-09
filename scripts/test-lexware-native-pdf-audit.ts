import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { NativePdfAuditState } from "../app/lib/lexware/lexwareNativePdfAuditCore";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const corePath = resolve(root, "app/lib/lexware/lexwareNativePdfAuditCore" + ".ts");
const core = await import(pathToFileURL(corePath).href);
const valid: NativePdfAuditState = {
  invoiceProvider: "lexware",
  taxSnapshotVersion: "invoice-tax-snapshot-v2",
  taxSnapshotStatus: "complete",
  invoiceFinalizedAt: "2026-08-09T10:00:00.000Z",
  invoiceLexwareId: "11111111-1111-4111-8111-111111111111",
  invoiceLexwareNumber: "RE-1",
  invoiceOrganizationId: "22222222-2222-4222-8222-222222222222",
  jobSource: "checkout_native_lexware",
  jobStatus: "succeeded",
  creationState: "definitely_created",
  jobLexwareId: "11111111-1111-4111-8111-111111111111",
  jobLexwareNumber: "RE-1",
  jobOrganizationId: "22222222-2222-4222-8222-222222222222",
  databaseOrganizationId: "22222222-2222-4222-8222-222222222222",
  runtimeOrganizationId: "22222222-2222-4222-8222-222222222222",
};
const pdf = Buffer.from(`%PDF-${"x".repeat(200)}`);
let gets = 0;
const result = await core.auditNativeLexwarePdfCore(valid, async () => {
  gets += 1;
  return { content: pdf, byteLength: pdf.byteLength, contentType: "application/pdf", contentDisposition: 'attachment; filename="../Rechnung RE-1.pdf"', downloadedAt: "2026-08-09T10:01:00.000Z" };
});
assert.equal(result.contentType, "application/pdf", "A native finalized invoice allowed");
assert.equal(gets, 1, "B exactly one PDF GET");
assert.equal(result.sha256Prefix.length, 16, "M SHA-256 prefix generated");
assert.equal(result.normalizedFilename, "Rechnung-RE-1.pdf", "N safe filename");
assert.equal("content" in result, false, "O no PDF bytes in result");

const blocked: Array<[string, Partial<NativePdfAuditState>, string]> = [
  ["D", { invoiceProvider: "legacy_internal" }, "invoice_provider_invalid"],
  ["E", { invoiceFinalizedAt: null }, "invoice_not_finalized"],
  ["F", { jobStatus: "pending" }, "job_status_invalid"],
  ["G", { creationState: "not_attempted" }, "creation_state_invalid"],
  ["H", { invoiceLexwareId: null }, "invoice_external_id_missing"],
  ["H2", { jobLexwareId: "33333333-3333-4333-8333-333333333333" }, "external_id_binding_invalid"],
];
for (const [label, patch, reason] of blocked) {
  let blockedGets = 0;
  await assert.rejects(
    () => core.auditNativeLexwarePdfCore({ ...valid, ...patch }, async () => { blockedGets += 1; throw new Error("unexpected"); }),
    new RegExp(reason),
    `${label} blocked`,
  );
  assert.equal(blockedGets, 0, `${label} no provider GET`);
}

for (const [label, download, reason] of [
  ["I", { content: pdf, byteLength: pdf.byteLength, contentType: "text/html", contentDisposition: null, downloadedAt: "now" }, "PDF_CONTENT_TYPE_INVALID"],
  ["J", { content: Buffer.from("%PDF-x"), byteLength: 6, contentType: "application/pdf", contentDisposition: null, downloadedAt: "now" }, "PDF_TOO_SMALL"],
  ["K", { content: Buffer.concat([Buffer.from("%PDF-"), Buffer.alloc(core.LEXWARE_NATIVE_PDF_MAX_BYTES)]), byteLength: core.LEXWARE_NATIVE_PDF_MAX_BYTES + 5, contentType: "application/pdf", contentDisposition: null, downloadedAt: "now" }, "PDF_TOO_LARGE"],
  ["L", { content: Buffer.from(`<!doctype html>${"x".repeat(200)}`), byteLength: 215, contentType: "application/pdf", contentDisposition: null, downloadedAt: "now" }, "PDF_SIGNATURE_INVALID"],
] as const) {
  assert.throws(() => core.validateNativeLexwarePdf(download), new RegExp(reason), `${label} invalid PDF blocked`);
}

const service = await readFile(resolve(root, "app/lib/lexware/lexwareNativePdfAuditService.ts"), "utf8");
const route = await readFile(resolve(root, "app/api/admin/lexware/invoices/[invoiceId]/pdf-audit/route.ts"), "utf8");
const middleware = await readFile(resolve(root, "middleware.ts"), "utf8");
const adminPdf = await readFile(resolve(root, "app/api/admin/requests/[id]/invoice/pdf/route.ts"), "utf8");
assert.match(service, /getLexwareInvoicePdf\("production", externalInvoiceId/, "B provider PDF client");
assert.equal((service.match(/getLexwareInvoicePdf\(/g) ?? []).length, 1, "B exactly one client call site");
assert.doesNotMatch(service + route, /createFinalInvoice|lexwarePost|method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/, "C zero provider writes");
assert.match(route, /export async function GET/, "A GET only");
assert.doesNotMatch(route, /export async function (?:POST|PUT|PATCH|DELETE)/, "C GET only");
assert.match(route, /requireAdminApiSession/, "Q admin auth");
assert.match(route, /Cache-Control.*no-store/, "P route no-store");
assert.match(middleware, /pdf-audit/, "P/Q unauthenticated 401 no-store contract");
assert.doesNotMatch(service + route, /\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/, "R no DB mutation");
assert.doesNotMatch(service + route, /sendMail|MailJob|requestInvoicePdf|generateRequestInvoicePdf/, "S/T no mail or legacy PDF");
assert.doesNotMatch(route, /content\s*:|Buffer|arrayBuffer|externalInvoiceId|voucherNumber/, "O sanitized route response");
assert.match(adminPdf, /generateRequestInvoicePdf/, "inventory: existing admin route still uses internal PDF");
console.log("PASS A-T: native Lexware PDF audit is read-only and sanitized.");
