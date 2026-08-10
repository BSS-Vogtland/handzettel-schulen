import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const core = await import(pathToFileURL(resolve(
  "app/lib/lexware/lexwareTemporaryMailOrchestrationTriggerCore.ts",
)).href);
const base = {
  automaticMailEnabled: true,
  selectedInvoiceId: core.TEMPORARY_MAIL_ORCHESTRATION_TARGET_INVOICE_ID,
  selectedInvoiceJobId: "00000000-0000-4000-8000-000000000001",
  targetSnapshotReady: true,
  targetMailJobCount: 0,
  openMailJobCount: 0,
  totalMailJobCount: 2,
};
assert.equal(core.isTemporaryMailOrchestrationPrecheckReady(base), true);
assert.equal(core.isTemporaryMailOrchestrationPrecheckReady({ ...base, automaticMailEnabled: false }), false);
assert.equal(core.isTemporaryMailOrchestrationPrecheckReady({ ...base, selectedInvoiceId: "wrong" }), false);
assert.equal(core.isTemporaryMailOrchestrationPrecheckReady({ ...base, targetSnapshotReady: false }), false);
assert.equal(core.isTemporaryMailOrchestrationPrecheckReady({ ...base, targetMailJobCount: 1 }), false);
assert.equal(core.isTemporaryMailOrchestrationPrecheckReady({ ...base, openMailJobCount: 1 }), false);
assert.equal(core.isTemporaryMailOrchestrationPostcheckReady({
  targetMailJobCount: 1, totalMailJobCount: 3, targetPendingPristine: true,
}, 2), true);
assert.equal(core.isTemporaryMailOrchestrationPostcheckReady({
  targetMailJobCount: 1, totalMailJobCount: 3, targetPendingPristine: false,
}, 2), false);

const route = readFileSync("app/api/admin/lexware/cron/mail-orchestration/trigger-once/route.ts", "utf8");
const coreSource = readFileSync("app/lib/lexware/lexwareTemporaryMailOrchestrationTriggerCore.ts", "utf8");
const precheck = readFileSync("app/lib/lexware/lexwareTemporaryMailOrchestrationPrecheck.ts", "utf8");
const worker = readFileSync("app/lib/lexware/lexwareNativeMailOrchestrationCore.ts", "utf8");
const middleware = readFileSync("middleware.ts", "utf8");
const vercel = readFileSync("vercel.json", "utf8");

assert.match(route, /requireAdminApiSession\(\)/);
assert.match(route, /hasSameRequestOrigin\(request\)/);
assert.match(route, /hasExactConfirmation\(body, TEMPORARY_MAIL_ORCHESTRATION_CONFIRMATION\)/);
assert.match(coreSource, /TRIGGER_SINGLE_NATIVE_LEXWARE_MAIL_ORCHESTRATION_TEST/);
assert.match(coreSource, /620dd116-2d99-4884-9425-6beac914912f/);
assert.match(route, /process\.env\.CRON_SECRET\?\.trim\(\)/);
assert.match(route, /Authorization: `Bearer \$\{secret\}`/);
assert.equal((route.match(/fetch\(/g) ?? []).length, 1, "exactly one internal cron GET");
assert.match(route, /method: "GET"/);
assert.match(route, /row\.processedCount === 1/);
assert.match(route, /row\.enqueueCount === 1/);
assert.match(route, /row\.activationCount === 1/);
assert.match(route, /row\.outcome === "enqueued_and_activated"/);
assert.match(route, /isTemporaryMailOrchestrationPostcheckReady/);
assert.match(precheck, /lexware_automatic_mail_enabled === true/);
assert.match(precheck, /classifyNativeMailOrchestrationCandidate/);
assert.match(precheck, /\.order\("created_at", \{ ascending: true \}\)\.limit\(CANDIDATE_SCAN_LIMIT\)/);
assert.match(precheck, /waiting_for_activation/);
assert.match(precheck, /"pending", "processing", "retry"/);
assert.match(precheck, /invoice\.lexware_pdf_storage_path === expectedPath/);
assert.match(precheck, /job\.status === "succeeded"/);
assert.match(precheck, /job\.creation_state === "definitely_created"/);
assert.match(precheck, /resolveLexwareMailSenderAddress\(process\.env\)/);
assert.match(precheck, /buildNativeLexwareInvoiceMailTemplate/);
assert.match(precheck, /mail\.status === "pending"/);
assert.match(precheck, /mail\.delivery_state === "not_attempted"/);
assert.match(worker, /NATIVE_MAIL_ORCHESTRATION_BATCH_SIZE = 1/);
assert.match(worker, /"pending", "processing", "retry", "sent"/);
assert.match(middleware, /\/api\/admin\/lexware\/cron\/mail-orchestration\/trigger-once/);
assert.doesNotMatch(route + precheck, /console\.|logger|log\(/i);
assert.doesNotMatch(route + precheck, /sendMail\s*\(|createTransport|claim_native|getLexware\s*\(|createFinalInvoice\s*\(/i,
  "no mailprocessor, SMTP, claim, or provider path");
assert.doesNotMatch(vercel, /api\/cron\/lexware\/mail-orchestration/, "cron schedule remains inactive");

console.log("PASS: temporary native open-gate mail orchestration trigger harness");
