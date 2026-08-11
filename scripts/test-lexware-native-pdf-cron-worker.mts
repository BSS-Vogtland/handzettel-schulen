import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const core = await import(pathToFileURL(resolve("app/lib/lexware/lexwareNativePdfCronWorkerCore.ts")).href);
const { isNativePdfCronCandidate, runNativePdfCronWorker, NATIVE_PDF_CRON_BATCH_SIZE } = core;
type Candidate = import("../app/lib/lexware/lexwareNativePdfCronWorkerCore").NativePdfCronCandidate;
type Claimed = import("../app/lib/lexware/lexwareNativePdfCronWorkerCore").ClaimedNativePdfCronCandidate;

const now = Date.parse("2026-08-10T14:00:00Z");
const base: Candidate = {
  id: "00000000-0000-4000-8000-000000000001",
  local_invoice_id: "00000000-0000-4000-8000-000000000002",
  request_id: "00000000-0000-4000-8000-000000000003",
  invoice_job_id: "00000000-0000-4000-8000-000000000004",
  target_organization_id: "org",
  external_invoice_id: "external",
  payload_sha256: "a".repeat(64),
  payload_hash_version: "lexware-payload-canonical-v2",
  status: "pending",
  attempt_count: 0,
  max_attempts: 8,
  locked_at: null,
  lock_expires_at: null,
  locked_by: null,
  last_error_code: null,
  manual_review_reason: null,
  pdf_stored: false,
};
const claimed = (candidate: Candidate): Claimed => ({
  ...candidate,
  status: "processing",
  attempt_count: candidate.attempt_count + 1,
  locked_at: "2026-08-10T13:59:00Z",
  lock_expires_at: "2026-08-10T14:04:00Z",
  locked_by: "worker",
});

assert.equal(NATIVE_PDF_CRON_BATCH_SIZE, 1, "batch boundary is exactly one");
assert.equal(isNativePdfCronCandidate(base, now), true, "pending is claimable");
assert.equal(isNativePdfCronCandidate({ ...base, status: "retry" }, now), true, "retry is claimable");
assert.equal(isNativePdfCronCandidate({ ...base, status: "processing", locked_at: "2026-08-10T13:58:00Z",
  lock_expires_at: "2026-08-10T13:59:00Z", locked_by: "worker" }, now), true, "stale processing is reclaimable");
assert.equal(isNativePdfCronCandidate({ ...base, status: "processing", locked_at: "2026-08-10T13:59:00Z",
  lock_expires_at: "2026-08-10T14:01:00Z", locked_by: "worker" }, now), false, "active lock is ignored");
assert.equal(isNativePdfCronCandidate({ ...base, attempt_count: 8 }, now), false, "max attempts blocks");
assert.equal(isNativePdfCronCandidate({ ...base, status: "manual_review", manual_review_reason: "review" }, now), false,
  "manual review is ignored");
assert.equal(isNativePdfCronCandidate({ ...base, pdf_stored: true }, now), false, "stored PDF is ignored");

const calls = { acquire: 0, prepare: 0, complete: 0, failure: 0, providerGets: 0 };
const dependencies = (candidates: Candidate[]) => ({
  now: () => now,
  loadCandidates: async () => candidates,
  acquireLease: async (candidate: Candidate) => { calls.acquire += 1; return claimed(candidate); },
  preparePdf: async (_id: string, lifecycle: { onProviderGetStarted: () => void }) => {
    lifecycle.onProviderGetStarted(); calls.providerGets += 1; calls.prepare += 1; return { providerGetCount: 1 };
  },
  completeLease: async () => { calls.complete += 1; },
  recordFailure: async () => { calls.failure += 1; },
});

let result = await runNativePdfCronWorker(dependencies([]));
assert.equal(result.code, "NATIVE_PDF_CRON_NOOP", "D no candidate is a clean no-op");
assert.equal(calls.acquire, 0);

result = await runNativePdfCronWorker(dependencies([base]));
assert.equal(result.code, "NATIVE_PDF_CRON_PROCESSED", "E candidate is processed");
assert.equal(result.processedCount, 1);
assert.equal(result.providerGetCount, 1, "M exactly one provider GET");
assert.equal(calls.complete, 1, "Q lease completes");

const firstId: string[] = [];
await runNativePdfCronWorker({
  ...dependencies([base, { ...base, id: "00000000-0000-4000-8000-000000000011",
    local_invoice_id: "00000000-0000-4000-8000-000000000012" }]),
  acquireLease: async (candidate: Candidate) => { firstId.push(candidate.local_invoice_id); return claimed(candidate); },
});
assert.deepEqual(firstId, [base.local_invoice_id], "F two candidates still process batch one");

let atomicWinner = false;
let concurrentGets = 0;
const concurrentDeps = {
  now: () => now,
  loadCandidates: async () => [base],
  acquireLease: async (candidate: Candidate) => {
    if (atomicWinner) return null;
    atomicWinner = true;
    return claimed(candidate);
  },
  preparePdf: async (_id: string, lifecycle: { onProviderGetStarted: () => void }) => {
    lifecycle.onProviderGetStarted(); concurrentGets += 1; return { providerGetCount: 1 };
  },
  completeLease: async () => undefined,
  recordFailure: async () => undefined,
};
const competition = await Promise.all([runNativePdfCronWorker(concurrentDeps), runNativePdfCronWorker(concurrentDeps)]);
assert.equal(competition.filter((entry) => entry.processedCount === 1).length, 1, "G only one concurrent worker wins");
assert.equal(concurrentGets, 1, "G/M concurrency still performs one GET");

let failure: { code: string; ambiguous: boolean } | null = null;
result = await runNativePdfCronWorker({
  ...dependencies([base]),
  preparePdf: async () => { throw new Error("NATIVE_PDF_PRECHECK_FAILED"); },
  recordFailure: async (_candidate: Claimed, code: string, ambiguous: boolean) => { failure = { code, ambiguous }; },
});
assert.equal(result.outcome, "retry", "R pre-GET failure is retryable");
assert.deepEqual(failure, { code: "NATIVE_PDF_PRECHECK_FAILED", ambiguous: false });

failure = null;
result = await runNativePdfCronWorker({
  ...dependencies([base]),
  preparePdf: async (_id: string, lifecycle: { onProviderGetStarted: () => void }) => {
    lifecycle.onProviderGetStarted(); throw new Error("NATIVE_PDF_PROVIDER_RESULT_UNCERTAIN");
  },
  recordFailure: async (_candidate: Claimed, code: string, ambiguous: boolean) => { failure = { code, ambiguous }; },
});
assert.equal(result.outcome, "manual_review", "R post-dispatch uncertainty fails closed");
assert.deepEqual(failure, { code: "NATIVE_PDF_PROVIDER_RESULT_UNCERTAIN", ambiguous: true });

const route = readFileSync("app/api/cron/lexware/pdfs/route.ts", "utf8");
const worker = readFileSync("app/lib/lexware/lexwareNativePdfCronWorker.ts", "utf8");
const pdfService = readFileSync("app/lib/lexware/lexwareProductionPdfStorage.ts", "utf8");
const manualRoute = readFileSync("app/api/admin/lexware/invoices/[invoiceId]/prepare-pdf/route.ts", "utf8");
const invoiceWorker = readFileSync("app/lib/lexware/lexwareNativeInvoiceCronWorker.ts", "utf8");
const vercel = readFileSync("vercel.json", "utf8");
assert.match(route, /export async function GET/, "cron route is GET");
assert.match(route, /isLexwareCronRequestAuthorized\(request\)/, "A-C central cron auth");
assert.match(route, /status: 401/, "A-B unauthorized fails closed");
assert.match(route, /Cache-Control.*no-store/, "cron response is not cached");
assert.match(worker, /claim_native_lexware_invoice_pdf_delivery_job/, "claim RPC used");
assert.match(worker, /reclaim_native_lexware_invoice_pdf_delivery_job/, "I explicit stale reclaim RPC used");
assert.match(worker, /complete_native_lexware_invoice_pdf_delivery_job/, "Q completion RPC used");
assert.match(worker, /record_native_lexware_invoice_pdf_delivery_failure/, "R failure RPC used");
assert.match(worker, /fetchAndStoreLexwareProductionPdf\(invoiceId, lifecycle\)/, "U existing PDF service reused");
assert.match(pdfService, /getLexwareInvoicePdf\("production"/, "M existing provider GET remains single implementation");
assert.match(pdfService, /validateLexwarePdf/, "N existing PDF validation reused");
assert.match(pdfService, /storage\.from\(LEXWARE_PDF_BUCKET\)\.upload/, "O private bucket storage reused");
assert.match(pdfService, /persist_native_lexware_invoice_pdf_storage/, "P metadata CAS reused");
assert.match(manualRoute, /fetchAndStoreLexwareProductionPdf\(invoiceId\)/, "U manual prepare route unchanged");
assert.match(invoiceWorker, /processLexwareProductionInvoiceById/, "V invoice worker unchanged");
assert.doesNotMatch(worker + route, /enqueue.*mail|mail_job|smtp|sendMail/i, "S-T no mail job or SMTP");
assert.doesNotMatch(worker + route, /console\.|recipient|billing|address|email|customer/i, "W no personal logs/data");
assert.match(vercel, /"path": "\/api\/cron\/lexware\/pdfs"[\s\S]*?"schedule": "1-59\/2 \* \* \* \*"/,
  "PDF Cron runs on the odd two-minute phase");

console.log("PASS: native PDF cron worker A-W");
