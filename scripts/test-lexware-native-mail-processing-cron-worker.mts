import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const core = await import(pathToFileURL(resolve("app/lib/lexware/lexwareNativeMailProcessingCronWorkerCore.ts")).href);
const delivery = await import(pathToFileURL(resolve("app/lib/lexware/lexwareProductionDeliveryCore.ts")).href);
const auth = await import(pathToFileURL(resolve("app/lib/cron/cronAuthorization.ts")).href);
const { isNativeMailProcessingCronCandidate, runNativeMailProcessingCronWorker,
  NATIVE_MAIL_PROCESSING_CRON_BATCH_SIZE } = core;
type Candidate = import("../app/lib/lexware/lexwareNativeMailProcessingCronWorkerCore").NativeMailProcessingCronCandidate;

const base: Candidate = {
  localInvoiceId: "00000000-0000-4000-8000-000000000001",
  status: "pending", deliveryState: "not_attempted", attemptCount: 0, maxAttempts: 8,
  lockedAt: null, lockExpiresAt: null, lockedBy: null, transportMessageId: null,
  smtpAttemptStartedAt: null, smtpAttemptCompletedAt: null, sentAt: null,
  manualReviewReason: null, bindingValid: true,
};
const request = (authorization?: string) => ({ headers: new Headers(authorization ? { authorization } : {}) });
assert.equal(auth.isLexwareCronRequestAuthorized(request(), { CRON_SECRET: "secret" }), false, "A missing auth blocked");
assert.equal(auth.isLexwareCronRequestAuthorized(request("Bearer wrong"), { CRON_SECRET: "secret" }), false, "B wrong auth blocked");
assert.equal(auth.isLexwareCronRequestAuthorized(request("Bearer secret"), { CRON_SECRET: "secret" }), true, "C correct auth");
assert.equal(NATIVE_MAIL_PROCESSING_CRON_BATCH_SIZE, 1, "batch size is exactly one");
assert.equal(isNativeMailProcessingCronCandidate(base), true, "F pending candidate eligible");
assert.equal(isNativeMailProcessingCronCandidate({ ...base, status: "retry", deliveryState: "definitely_not_sent" }), true,
  "safe retry eligible");
assert.equal(isNativeMailProcessingCronCandidate({ ...base, lockedAt: "2026-08-11T08:00:00Z",
  lockExpiresAt: "2026-08-11T08:05:00Z", lockedBy: "worker" }), false, "I active lock ignored");
assert.equal(isNativeMailProcessingCronCandidate({ ...base, status: "processing", lockedAt: "2026-08-11T07:00:00Z",
  lockExpiresAt: "2026-08-11T07:05:00Z", lockedBy: "worker" }), false,
"J stale processing is ignored because no mail reclaim contract exists");
assert.equal(isNativeMailProcessingCronCandidate({ ...base, attemptCount: 8 }), false, "K max attempts ignored");
assert.equal(isNativeMailProcessingCronCandidate({ ...base, status: "sent", deliveryState: "definitely_sent",
  transportMessageId: "message", smtpAttemptStartedAt: "2026-08-11T08:00:00Z",
  smtpAttemptCompletedAt: "2026-08-11T08:00:01Z", sentAt: "2026-08-11T08:00:01Z" }), false,
"L sent never processed");
assert.equal(isNativeMailProcessingCronCandidate({ ...base, status: "manual_review" }), false, "M manual review ignored");
assert.equal(isNativeMailProcessingCronCandidate({ ...base, status: "manual_review", deliveryState: "ambiguous_send",
  transportMessageId: "message", smtpAttemptStartedAt: "2026-08-11T08:00:00Z",
  manualReviewReason: "ambiguous" }), false, "N/W ambiguous never processed again");
assert.equal(isNativeMailProcessingCronCandidate({ ...base, bindingValid: false }), false, "O/P invalid PDF binding ignored");

let loadCount = 0; let processCount = 0;
let result = await runNativeMailProcessingCronWorker({
  automaticMailEnabled: async () => false,
  loadCandidates: async () => { loadCount += 1; return [base]; },
  processMail: async () => { processCount += 1; return { outcome: "sent", smtpCalls: 1 }; },
});
assert.equal(result.code, "NATIVE_MAIL_PROCESS_CRON_NOOP", "D closed gate is no-op");
assert.equal(loadCount, 0); assert.equal(processCount, 0, "D closed gate makes zero claims/SMTP");
result = await runNativeMailProcessingCronWorker({ automaticMailEnabled: async () => true,
  loadCandidates: async () => [], processMail: async () => { throw new Error("unexpected"); } });
assert.equal(result.code, "NATIVE_MAIL_PROCESS_CRON_NOOP", "E no candidate is no-op");

const processedIds: string[] = [];
result = await runNativeMailProcessingCronWorker({ automaticMailEnabled: async () => true,
  loadCandidates: async () => [base], processMail: async (id: string) => {
    processedIds.push(id); return { outcome: "sent", smtpCalls: 1 };
  } });
assert.equal(result.processedCount, 1, "F one pending processed");
assert.equal(result.smtpAttemptCount, 1, "S exactly one SMTP send");
assert.equal(result.outcome, "sent", "T/U success persisted by existing completion core");
processedIds.length = 0;
await runNativeMailProcessingCronWorker({ automaticMailEnabled: async () => true,
  loadCandidates: async () => [base, { ...base, localInvoiceId: "00000000-0000-4000-8000-000000000002" }],
  processMail: async (id: string) => { processedIds.push(id); return { outcome: "sent", smtpCalls: 1 }; } });
assert.deepEqual(processedIds, [base.localInvoiceId], "G two pending still batch one");

let claimWon = false; let concurrentSends = 0;
const competing = { automaticMailEnabled: async () => true, loadCandidates: async () => [base],
  processMail: async () => { if (claimWon) throw new Error("claim lost"); claimWon = true; concurrentSends += 1;
    return { outcome: "sent" as const, smtpCalls: 1 }; } };
const competition = await Promise.all([runNativeMailProcessingCronWorker(competing), runNativeMailProcessingCronWorker(competing)]);
assert.equal(competition.filter((entry) => entry.outcome === "sent").length, 1, "H one concurrent worker wins");
assert.equal(concurrentSends, 1, "H concurrency sends once");

result = await runNativeMailProcessingCronWorker({ automaticMailEnabled: async () => true,
  loadCandidates: async () => [base], processMail: async () => ({ outcome: "definite_not_sent", smtpCalls: 0 }) });
assert.equal(result.outcome, "retry", "O/P/Q definite pre-dispatch failure is retryable");
assert.equal(result.smtpAttemptCount, 0, "O/P/Q pre-dispatch failure has zero SMTP");
result = await runNativeMailProcessingCronWorker({ automaticMailEnabled: async () => true,
  loadCandidates: async () => [base], processMail: async () => ({ outcome: "ambiguous_send", smtpCalls: 1 }) });
assert.equal(result.outcome, "manual_review", "V timeout becomes manual review");
assert.equal(result.smtpAttemptCount, 1, "V ambiguous path records the sole attempt");

const pdf = new Uint8Array(Buffer.from(`%PDF-${"x".repeat(200)}`));
const verified = delivery.validateLexwarePdf(pdf, "application/pdf");
const path = delivery.buildLexwarePdfStoragePath({ organizationId: "org", lexwareInvoiceId: "invoice", sha256: verified.sha256 });
const metadata = { bucket: delivery.LEXWARE_PDF_BUCKET, path, sha256: verified.sha256,
  sizeBytes: verified.sizeBytes, contentType: "application/pdf" as const, filename: "invoice.pdf",
  fetchedAt: "2026-08-11T08:00:00Z", storedAt: "2026-08-11T08:00:01Z" };
const messageId = delivery.buildDeterministicMailMessageId({ mailJobId: "mail", idempotencyKey: "key",
  pdfSha256: verified.sha256 });
assert.equal(messageId, delivery.buildDeterministicMailMessageId({ mailJobId: "mail", idempotencyKey: "key",
  pdfSha256: verified.sha256 }), "X message ID deterministic");
const events: string[] = [];
await delivery.sendClaimedMailAtMostOnce({ pdf, metadata, messageId,
  validateTransport: () => events.push("smtp_precheck"), markSendStarted: async () => { events.push("send_started"); },
  send: async (id: string) => { events.push("smtp"); return { messageId: id }; },
  complete: async () => { events.push("complete"); }, recordDefiniteFailure: async () => events.push("retry"),
  recordAmbiguous: async () => events.push("manual_review") });
assert.deepEqual(events, ["smtp_precheck", "send_started", "smtp", "complete"],
  "Q/R/S SMTP precheck precedes marker and exactly one send");

const route = readFileSync("app/api/cron/lexware/mail-process/route.ts", "utf8");
const worker = readFileSync("app/lib/lexware/lexwareNativeMailProcessingCronWorker.ts", "utf8");
const processor = readFileSync("app/lib/lexware/lexwareProductionMailProcessor.ts", "utf8");
const manualRoute = readFileSync("app/api/admin/lexware/invoices/[invoiceId]/process-mail/route.ts", "utf8");
const orchestrator = readFileSync("app/lib/lexware/lexwareNativeMailOrchestrationWorker.ts", "utf8");
const invoiceWorker = readFileSync("app/lib/lexware/lexwareNativeInvoiceCronWorker.ts", "utf8");
const pdfWorker = readFileSync("app/lib/lexware/lexwareNativePdfCronWorker.ts", "utf8");
const completionMigration = readFileSync("supabase/migrations/20260810023000_synchronize_native_invoice_mail_status.sql", "utf8");
const vercel = readFileSync("vercel.json", "utf8");
assert.match(route, /export async function GET/);
assert.match(route, /isLexwareCronRequestAuthorized\(request\)/, "A-C central auth used");
assert.match(route, /status: 401/); assert.match(route, /Cache-Control.*no-store/);
assert.match(worker, /processLexwareProductionMailJobAutomatically/, "Y existing processor is reused");
assert.match(processor, /claim_native_lexware_invoice_mail_job/, "claim core reused");
assert.match(processor, /loadStoredNativeLexwarePdf/, "O/P PDF loaded and verified before marker");
assert.match(processor, /readLexwareMailTransportConfiguration\(\)/, "Q SMTP configuration validated");
assert.match(processor, /mark_native_lexware_invoice_mail_send_started/, "R marker reused");
assert.match(processor, /sendLexwareInvoiceMailAtMostOnce/, "S sole SMTP implementation reused");
assert.match(processor, /complete_native_lexware_invoice_mail_send/, "T completion reused");
assert.match(completionMigration, /invoice_mail_status\s*=\s*'sent'/, "U invoice status completed atomically");
assert.match(processor, /recordAmbiguous:\(reason\)=>recordFailure\([\s\S]*?true\)/,
  "V ambiguity persisted fail-closed");
assert.match(manualRoute, /processLexwareProductionMailJob\(invoiceId\)/, "Y manual processor unchanged");
assert.match(orchestrator, /runNativeMailOrchestrationWorker/, "Z orchestrator unchanged");
assert.match(invoiceWorker, /processLexwareProductionInvoiceById/, "AA invoice worker unchanged");
assert.match(pdfWorker, /runNativePdfCronWorker/, "AA PDF worker unchanged");
assert.doesNotMatch(worker + route, /console\./, "AB no logs containing personal data");
assert.doesNotMatch(route, /recipient_email|from_email|message_id|local_invoice_id|billing_|customer|address_snapshot/i,
  "AB sanitized route response has no personal or object identifiers");
assert.doesNotMatch(vercel, /api\/cron\/lexware\/mail-process/, "cron schedule is not activated");

console.log("PASS: native mail processing cron worker A-AB");
