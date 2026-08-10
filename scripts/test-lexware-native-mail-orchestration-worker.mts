import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const core = await import(pathToFileURL(resolve("app/lib/lexware/lexwareNativeMailOrchestrationCore.ts")).href);
const { classifyNativeMailOrchestrationCandidate, runNativeMailOrchestrationWorker, NATIVE_MAIL_ORCHESTRATION_BATCH_SIZE } = core;
type Candidate = import("../app/lib/lexware/lexwareNativeMailOrchestrationCore").NativeMailOrchestrationCandidate;

const base: Candidate = { invoiceId: "00000000-0000-4000-8000-000000000001", readiness: "ready", mailJob: null };
const waiting: Candidate = { ...base, mailJob: { id: "00000000-0000-4000-8000-000000000002", status: "waiting_for_activation",
  deliveryState: "not_attempted", attemptCount: 0, bindingValid: true, pristine: true } };
const calls = { load: 0, enqueue: [] as string[], activate: [] as string[] };
const deps = (candidates: Candidate[], gate = true) => ({
  automaticMailEnabled: async () => gate,
  loadCandidates: async () => { calls.load += 1; return candidates; },
  enqueueAndActivate: async (id: string) => { calls.enqueue.push(id); },
  activate: async (invoiceId: string, mailJobId: string) => { calls.activate.push(`${invoiceId}:${mailJobId}`); },
});

assert.equal(NATIVE_MAIL_ORCHESTRATION_BATCH_SIZE, 1, "batch size is exactly one");
assert.equal(classifyNativeMailOrchestrationCandidate(base), "enqueue_and_activate");
assert.equal(classifyNativeMailOrchestrationCandidate(waiting), "activate");
assert.equal(classifyNativeMailOrchestrationCandidate({ ...base, readiness: "missing_pdf" }), "ignore", "M missing PDF no-op");
assert.equal(classifyNativeMailOrchestrationCandidate({ ...base, readiness: "invalid_binding" }), "block", "N PDF mismatch blocks");
for (const status of ["pending", "processing", "retry", "sent", "failed", "manual_review", "cancelled"]) {
  assert.equal(classifyNativeMailOrchestrationCandidate({ ...waiting, mailJob: { ...waiting.mailJob!, status } }), "ignore", `${status} ignored`);
}
assert.equal(classifyNativeMailOrchestrationCandidate({ ...waiting, mailJob: { ...waiting.mailJob!, bindingValid: false } }), "block");
assert.equal(classifyNativeMailOrchestrationCandidate({ ...waiting, mailJob: { ...waiting.mailJob!, pristine: false } }), "block");

let result = await runNativeMailOrchestrationWorker(deps([base], false));
assert.equal(result.code, "NATIVE_MAIL_ORCHESTRATION_NOOP", "D closed gate no-op");
assert.equal(calls.load, 0, "D closed gate does not inspect or mutate candidates");
assert.equal(calls.enqueue.length, 0); assert.equal(calls.activate.length, 0);

result = await runNativeMailOrchestrationWorker(deps([]));
assert.equal(result.code, "NATIVE_MAIL_ORCHESTRATION_NOOP", "E no candidate no-op");

result = await runNativeMailOrchestrationWorker(deps([base]));
assert.equal(result.code, "NATIVE_MAIL_ORCHESTRATION_PROCESSED", "F candidate processed");
assert.deepEqual({ processed: result.processedCount, enqueue: result.enqueueCount, activate: result.activationCount },
  { processed: 1, enqueue: 1, activate: 1 });
assert.deepEqual(calls.enqueue, [base.invoiceId], "O/P exactly one enqueue");

calls.enqueue = []; calls.activate = [];
await runNativeMailOrchestrationWorker(deps([base, { ...base, invoiceId: "00000000-0000-4000-8000-000000000003" }]));
assert.deepEqual(calls.enqueue, [base.invoiceId], "G two candidates still batch one");

calls.enqueue = []; calls.activate = [];
result = await runNativeMailOrchestrationWorker(deps([waiting]));
assert.equal(result.outcome, "activated", "H waiting job only activated");
assert.equal(result.enqueueCount, 0); assert.equal(result.activationCount, 1);
assert.deepEqual(calls.activate, [`${waiting.invoiceId}:${waiting.mailJob!.id}`]);

for (const status of ["pending", "sent", "processing", "manual_review"]) {
  calls.enqueue = []; calls.activate = [];
  result = await runNativeMailOrchestrationWorker(deps([{ ...waiting, mailJob: { ...waiting.mailJob!, status } }]));
  assert.equal(result.code, "NATIVE_MAIL_ORCHESTRATION_NOOP", `${status} is no-op`);
  assert.equal(calls.enqueue.length + calls.activate.length, 0);
}

result = await runNativeMailOrchestrationWorker(deps([{ ...base, readiness: "invalid_binding" }]));
assert.equal(result.code, "NATIVE_MAIL_ORCHESTRATION_BLOCKED", "N mismatch fail-closed");
assert.equal(result.enqueueCount + result.activationCount, 0);

const route = readFileSync("app/api/cron/lexware/mail-orchestration/route.ts", "utf8");
const worker = readFileSync("app/lib/lexware/lexwareNativeMailOrchestrationWorker.ts", "utf8");
const manualEnqueue = readFileSync("app/api/admin/lexware/invoices/[invoiceId]/enqueue-mail/route.ts", "utf8");
const manualActivation = readFileSync("app/api/admin/lexware/invoices/[invoiceId]/activate-mail/route.ts", "utf8");
const invoiceWorker = readFileSync("app/lib/lexware/lexwareNativeInvoiceCronWorker.ts", "utf8");
const pdfWorker = readFileSync("app/lib/lexware/lexwareNativePdfCronWorker.ts", "utf8");
const mailProcessor = readFileSync("app/lib/lexware/lexwareProductionMailProcessor.ts", "utf8");
const vercel = readFileSync("vercel.json", "utf8");

assert.match(route, /export async function GET/, "cron route is GET");
assert.match(route, /isLexwareCronRequestAuthorized\(request\)/, "A-C central cron auth");
assert.match(route, /status: 401/, "A-B missing/wrong auth fail closed");
assert.match(route, /Cache-Control.*no-store/, "route response is not cached");
assert.match(worker, /lexware_automatic_mail_enabled === true/, "D automatic gate must be true");
assert.match(worker, /\.order\("created_at", \{ ascending: true \}\)/, "G deterministic order");
assert.match(worker, /enqueue_native_lexware_invoice_mail_job_manual/, "F existing idempotent native enqueue contract reused");
assert.match(worker, /activate_native_lexware_invoice_mail_job/, "H existing object-bound activation contract reused");
assert.match(worker, /lexware-invoice-mail-v1:/, "O idempotency key binding checked");
assert.match(worker, /lexware_pdf_storage_path/, "N PDF binding checked");
assert.doesNotMatch(route + worker, /sendLexwareInvoiceMailAtMostOnce|sendClaimedMailAtMostOnce|createTransport|sendMail|claim_native_lexware_invoice_mail_job|mark_native_lexware_invoice_mail_send_started/i, "Q/R no SMTP or mail processing");
assert.doesNotMatch(route + worker, /console\.|logger|log\(/i, "no personal-data logs");
assert.match(manualEnqueue, /enqueueNativeLexwareInvoiceMail/, "S manual enqueue remains present");
assert.match(manualActivation, /activateNativeLexwareInvoiceMail/, "S manual activation remains present");
assert.match(mailProcessor, /processLexwareProductionMailJob/, "mail processor remains separate");
assert.match(invoiceWorker, /processLexwareProductionInvoiceById/, "T invoice worker unchanged contract");
assert.match(pdfWorker, /fetchAndStoreLexwareProductionPdf/, "T PDF worker unchanged contract");
assert.doesNotMatch(vercel, /api\/cron\/lexware\/mail-orchestration/, "cron schedule remains inactive");

console.log("PASS: native mail orchestration worker A-T");
