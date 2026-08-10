import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const core = await import(pathToFileURL(resolve("app/lib/lexware/lexwareNativeInvoiceCronWorkerCore.ts")).href);
const { isNativeInvoiceCronCandidate, runNativeInvoiceCronWorker, NATIVE_INVOICE_CRON_BATCH_SIZE } = core;
type Candidate = import("../app/lib/lexware/lexwareNativeInvoiceCronWorkerCore").NativeInvoiceCronCandidate;
const now = Date.parse("2026-08-10T12:00:00Z");
const base: Candidate = {
  local_invoice_id: "00000000-0000-4000-8000-000000000001", status: "pending", creation_state: "not_attempted",
  attempt_count: 0, max_attempts: 5, locked_by: null, locked_at: null, lock_expires_at: null,
  external_write_started_at: null, external_write_completed_at: null, lexware_invoice_id: null, lexware_invoice_number: null,
};
const processed = { ok: true, status: 200, code: "LEXWARE_PROCESS_SUCCEEDED", outcome: "succeeded", postCount: 1, reasons: [] };

assert.equal(NATIVE_INVOICE_CRON_BATCH_SIZE, 1, "hard batch boundary is one");
assert.equal(isNativeInvoiceCronCandidate(base, now), true, "pending is eligible");
assert.equal(isNativeInvoiceCronCandidate({ ...base, status: "retry", creation_state: "definite_not_created" }, now), true, "safe retry eligible");
assert.equal(isNativeInvoiceCronCandidate({ ...base, status: "succeeded", creation_state: "definitely_created" }, now), false, "H succeeded ignored");
assert.equal(isNativeInvoiceCronCandidate({ ...base, status: "manual_review", creation_state: "creation_state_unknown" }, now), false, "I manual review ignored");
assert.equal(isNativeInvoiceCronCandidate({ ...base, status: "processing", locked_by: "worker", locked_at: "2026-08-10T11:50:00Z", lock_expires_at: "2026-08-10T11:59:00Z" }, now), true, "J stale processing offered to existing reclaim contract");
assert.equal(isNativeInvoiceCronCandidate({ ...base, status: "processing", locked_by: "worker", locked_at: "2026-08-10T11:59:00Z", lock_expires_at: "2026-08-10T12:01:00Z" }, now), false, "K active lock ignored");
assert.equal(isNativeInvoiceCronCandidate({ ...base, attempt_count: 5 }, now), false, "L max attempts ignored");
assert.equal(isNativeInvoiceCronCandidate({ ...base, status: "processing", locked_by: "worker", locked_at: "2026-08-10T11:50:00Z", lock_expires_at: "2026-08-10T11:59:00Z", external_write_started_at: "2026-08-10T11:51:00Z" }, now), false, "M ambiguity marker never retried");

let calls: string[] = [];
let result = await runNativeInvoiceCronWorker({ now: () => now, loadCandidates: async () => [], processInvoice: async (id: string) => { calls.push(id); return processed; } });
assert.equal(result.code, "NATIVE_INVOICE_CRON_NOOP", "D no candidate is clean no-op");
assert.equal(calls.length, 0);
result = await runNativeInvoiceCronWorker({ now: () => now, loadCandidates: async () => [base], processInvoice: async (id: string) => { calls.push(id); return processed; } });
assert.equal(result.processedCount, 1, "E one pending processed once");
assert.equal(result.postCount, 1, "N exactly processor-reported one POST");
calls = [];
await runNativeInvoiceCronWorker({ now: () => now, loadCandidates: async () => [base, { ...base, local_invoice_id: "00000000-0000-4000-8000-000000000002" }], processInvoice: async (id: string) => { calls.push(id); return processed; } });
assert.deepEqual(calls, [base.local_invoice_id], "F two pending still batch one");

let claimed = false;
let postCount = 0;
const competingProcessor = async () => {
  if (claimed) return { ...processed, ok: false, status: 409, code: "LEXWARE_PROCESS_BLOCKED", outcome: "blocked", postCount: 0 };
  claimed = true; postCount += 1; return processed;
};
const competingDeps = { now: () => now, loadCandidates: async () => [base], processInvoice: competingProcessor };
const competition = await Promise.all([runNativeInvoiceCronWorker(competingDeps), runNativeInvoiceCronWorker(competingDeps)]);
assert.equal(competition.filter((entry) => entry.ok).length, 1, "G only one competing worker wins");
assert.equal(postCount, 1, "N concurrency still one POST");

const route = readFileSync("app/api/cron/lexware/invoices/route.ts", "utf8");
const service = readFileSync("app/lib/lexware/lexwareNativeInvoiceCronWorker.ts", "utf8");
const adminRoute = readFileSync("app/api/admin/lexware/invoices/[invoiceId]/process/route.ts", "utf8");
const auth = readFileSync("app/lib/cron/cronAuthorization.ts", "utf8");
const vercel = readFileSync("vercel.json", "utf8");
assert.match(route, /export async function GET/);
assert.match(route, /isLexwareCronRequestAuthorized\(request\)/, "A-C central fail-closed auth is used");
assert.match(route, /status: 401/);
assert.match(auth, /`Bearer \$\{secret\}`/);
assert.match(service, /processLexwareProductionInvoiceById\(invoiceId\)/, "O existing processor is the only core");
assert.match(adminRoute, /processLexwareProductionInvoiceById/, "O manual admin processor remains intact");
assert.doesNotMatch(service + route, /getLexwareInvoicePdf|pdf_delivery|enqueue.*mail|mail_job|smtp|sendMail/i, "P-R no PDF, mail job, or SMTP");
assert.doesNotMatch(service + route, /console\.|recipient|billing|address|email|customer/i, "S no personal logs/data");
assert.doesNotMatch(vercel, /api\/cron\/lexware\/invoices/, "cron schedule is not activated");

console.log("PASS: native invoice cron worker A-S");
