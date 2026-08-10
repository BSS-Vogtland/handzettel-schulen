import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  isTemporaryPdfCronTargetReady,
  TEMPORARY_PDF_CRON_CONFIRMATION,
  TEMPORARY_PDF_CRON_TARGET_INVOICE_ID,
  type TemporaryPdfCronPrecheck,
} from "../app/lib/lexware/lexwareTemporaryPdfCronTriggerCore";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const route = read("app/api/admin/lexware/cron/pdfs/trigger-once/route.ts");
const precheckSource = read("app/lib/lexware/lexwareTemporaryPdfCronTriggerPrecheck.ts");
const middleware = read("middleware.ts");
const vercel = read("vercel.json");
const pdfWorker = read("app/lib/lexware/lexwareNativePdfCronWorker.ts");
const invoiceWorker = read("app/lib/lexware/lexwareNativeInvoiceCronWorker.ts");

const ready: TemporaryPdfCronPrecheck = {
  selectedInvoiceId: TEMPORARY_PDF_CRON_TARGET_INVOICE_ID,
  eligibleExistingLeaseInvoiceId: null,
  targetInvoiceFinalized: true,
  targetJobSucceeded: true,
  targetPdfMetadataEmpty: true,
  targetStorageObjectCount: 0,
  targetLeaseCount: 0,
  targetErrorReviewMarkersAbsent: true,
};

assert.equal(isTemporaryPdfCronTargetReady(ready), true);
assert.equal(isTemporaryPdfCronTargetReady({ ...ready, selectedInvoiceId: crypto.randomUUID() }), false);
assert.equal(isTemporaryPdfCronTargetReady({ ...ready, eligibleExistingLeaseInvoiceId: crypto.randomUUID() }), false);
for (const field of ["targetInvoiceFinalized", "targetJobSucceeded", "targetPdfMetadataEmpty", "targetErrorReviewMarkersAbsent"] as const) {
  assert.equal(isTemporaryPdfCronTargetReady({ ...ready, [field]: false }), false, field);
}
assert.equal(isTemporaryPdfCronTargetReady({ ...ready, targetStorageObjectCount: 1 }), false);
assert.equal(isTemporaryPdfCronTargetReady({ ...ready, targetLeaseCount: 1 }), false);

assert.match(route, /requireAdminApiSession\(\)/);
assert.match(route, /hasSameRequestOrigin\(request\)/);
assert.match(route, /hasExactConfirmation\(body, TEMPORARY_PDF_CRON_CONFIRMATION\)/);
assert.equal(TEMPORARY_PDF_CRON_CONFIRMATION, "TRIGGER_SINGLE_NATIVE_LEXWARE_PDF_CRON_TEST");
assert.match(route, /process\.env\.CRON_SECRET\?\.trim\(\)/);
assert.match(route, /CRON_SECRET_UNAVAILABLE/);
assert.match(route, /readTemporaryPdfCronPrecheck\(\)/);
assert.match(route, /PDF_CRON_PRECHECK_BLOCKED/);
assert.match(route, /new URL\("\/api\/cron\/lexware\/pdfs", request\.url\)/);
assert.match(route, /method: "GET"/);
assert.match(route, /Authorization: `Bearer \$\{secret\}`/);
assert.equal((route.match(/await fetch\(/g) ?? []).length, 1, "exactly one internal request site");
assert.doesNotMatch(route, /console\.|setTimeout|CRON_SECRET:/i);
assert.doesNotMatch(route, /retry\s*\(|for\s*\([^)]*fetch|while\s*\(/i);
assert.match(route, /Cache-Control": "no-store"/);
assert.match(middleware, /\/api\/admin\/lexware\/cron\/pdfs\/trigger-once/);

assert.match(precheckSource, /\.order\("created_at", \{ ascending: true \}\)/);
assert.match(precheckSource, /firstEligibleExistingLeaseInvoiceId\(\)/);
assert.match(precheckSource, /firstDiscoverableInvoiceId\(\)/);
assert.match(precheckSource, /targetStorageObjectCount/);
assert.match(precheckSource, /targetLeaseCount/);
assert.match(precheckSource, /targetErrorReviewMarkersAbsent/);
assert.doesNotMatch(precheckSource, /\.insert\(|\.update\(|\.delete\(|\.rpc\(/);

assert.match(pdfWorker, /fetchAndStoreLexwareProductionPdf/);
assert.match(invoiceWorker, /processNextNativeLexwareInvoice/);
assert.doesNotMatch(route, /smtp|mail|sendMail|fetchAndStoreLexwareProductionPdf/i);
assert.doesNotMatch(vercel, /lexware\/pdfs|trigger-once/);

console.log("Temporary PDF cron trigger tests passed.");
