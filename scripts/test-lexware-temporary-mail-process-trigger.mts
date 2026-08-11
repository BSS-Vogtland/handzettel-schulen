import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const core = await import(pathToFileURL(resolve(
  "app/lib/lexware/lexwareTemporaryMailProcessTriggerCore.ts",
)).href);
const base = {
  automaticMailEnabled: true, targetMailJobCount: 1, targetCandidateReady: true,
  selectedInvoiceId: core.TEMPORARY_MAIL_PROCESS_TARGET_INVOICE_ID,
  privatePdfReady: true, smtpConfigurationReady: true,
};
assert.equal(core.isTemporaryMailProcessPrecheckReady(base), true);
assert.equal(core.isTemporaryMailProcessPrecheckReady({ ...base, automaticMailEnabled: false }), false);
assert.equal(core.isTemporaryMailProcessPrecheckReady({ ...base, targetMailJobCount: 2 }), false);
assert.equal(core.isTemporaryMailProcessPrecheckReady({ ...base, targetCandidateReady: false }), false);
assert.equal(core.isTemporaryMailProcessPrecheckReady({ ...base, selectedInvoiceId: "wrong" }), false);
assert.equal(core.isTemporaryMailProcessPrecheckReady({ ...base, privatePdfReady: false }), false);
assert.equal(core.isTemporaryMailProcessPrecheckReady({ ...base, smtpConfigurationReady: false }), false);

const success = { targetMailJobCount: 1, successConfirmed: true, ambiguousConfirmed: false };
const ambiguous = { targetMailJobCount: 1, successConfirmed: false, ambiguousConfirmed: true };
assert.equal(core.isTemporaryMailProcessSuccessPostcheck(success), true);
assert.equal(core.isTemporaryMailProcessSuccessPostcheck(ambiguous), false);
assert.equal(core.isTemporaryMailProcessAmbiguousPostcheck(ambiguous), true);
assert.equal(core.isTemporaryMailProcessAmbiguousPostcheck(success), false);

const route = readFileSync("app/api/admin/lexware/cron/mail-process/trigger-once/route.ts", "utf8");
const coreSource = readFileSync("app/lib/lexware/lexwareTemporaryMailProcessTriggerCore.ts", "utf8");
const precheck = readFileSync("app/lib/lexware/lexwareTemporaryMailProcessPrecheck.ts", "utf8");
const worker = readFileSync("app/lib/lexware/lexwareNativeMailProcessingCronWorker.ts", "utf8");
const workerCore = readFileSync("app/lib/lexware/lexwareNativeMailProcessingCronWorkerCore.ts", "utf8");
const middleware = readFileSync("middleware.ts", "utf8");
const vercel = readFileSync("vercel.json", "utf8");
assert.match(route, /requireAdminApiSession\(\)/);
assert.match(route, /hasSameRequestOrigin\(request\)/);
assert.match(route, /hasExactConfirmation\(body, TEMPORARY_MAIL_PROCESS_CONFIRMATION\)/);
assert.match(coreSource, /TRIGGER_SINGLE_NATIVE_LEXWARE_MAIL_PROCESS_TEST/);
assert.match(coreSource, /620dd116-2d99-4884-9425-6beac914912f/);
assert.match(route, /process\.env\.CRON_SECRET\?\.trim\(\)/);
assert.match(route, /Authorization: `Bearer \$\{secret\}`/);
assert.equal((route.match(/fetch\(/g) ?? []).length, 1, "exactly one internal Cron request");
assert.match(route, /new URL\("\/api\/cron\/lexware\/mail-process", request\.url\)/);
assert.match(route, /method: "GET"/);
assert.doesNotMatch(route, /\b(?:for|while)\s*\(|retry/i, "no request retry path");
assert.match(route, /Cache-Control.*no-store/);
assert.match(precheck, /lexware_automatic_mail_enabled === true/);
assert.match(precheck, /\.eq\("local_invoice_id", TEMPORARY_MAIL_PROCESS_TARGET_INVOICE_ID\)\.limit\(2\)/);
assert.match(precheck, /\.in\("status", \["pending", "retry"\]\)\.order\("created_at", \{ ascending: true \}\)/);
assert.match(precheck, /isNativeMailProcessingCronCandidate/);
assert.match(precheck, /loadStoredNativeLexwarePdf\(TEMPORARY_MAIL_PROCESS_TARGET_INVOICE_ID\)/);
assert.match(precheck, /readLexwareMailTransportConfiguration\(\)/);
assert.match(precheck, /mail\.request_id === invoice\.request_id/);
assert.match(precheck, /mail\.invoice_job_id === job\.id/);
assert.match(precheck, /mail\.pdf_sha256 === invoice\.lexware_pdf_sha256/);
assert.match(precheck, /mail\.attachment_filename_snapshot === invoice\.lexware_pdf_filename/);
assert.match(precheck, /mail\.idempotency_key === `lexware-invoice-mail-v1:\$\{job\.id\}`/);
assert.match(workerCore, /NATIVE_MAIL_PROCESSING_CRON_BATCH_SIZE = 1/);
assert.match(worker, /processLexwareProductionMailJobAutomatically/);
assert.match(route, /row\.processedCount === 1/);
assert.match(route, /row\.smtpAttemptCount === 1/);
assert.match(route, /row\.outcome === "sent"/);
assert.match(route, /row\.outcome === "manual_review"/);
assert.match(route, /isTemporaryMailProcessSuccessPostcheck/);
assert.match(route, /isTemporaryMailProcessAmbiguousPostcheck/);
assert.match(precheck, /mail\.status === "sent" && mail\.delivery_state === "definitely_sent"/);
assert.match(precheck, /mail\.status === "manual_review" && mail\.delivery_state === "ambiguous_send"/);
assert.match(precheck, /invoiceRow\.invoice_mail_status === "sent"/);
assert.match(middleware, /\/api\/admin\/lexware\/cron\/mail-process\/trigger-once/);
assert.doesNotMatch(route + precheck, /console\.|logger|log\(/i);
assert.doesNotMatch(route + precheck, /sendMail\s*\(|createTransport|claim_native|mark_native|complete_native/i);
assert.doesNotMatch(route, /recipient|sender|email|messageId|invoiceId|mailJobId|pdfSha/i);
assert.doesNotMatch(vercel, /api\/cron\/lexware\/mail-process/, "Cron schedule remains inactive");
console.log("PASS: temporary native mail process trigger harness");
