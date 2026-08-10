import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const core = await import(pathToFileURL(resolve(
  "app/lib/lexware/lexwareTemporaryMailOrchestrationTriggerCore.ts",
)).href);
const base = {
  automaticMailDisabled: true,
  readyNativeInvoiceCount: 1,
  mutableMailJobCount: 0,
  totalMailJobCount: 2,
};
assert.equal(core.isTemporaryMailOrchestrationPrecheckReady(base), true);
assert.equal(core.isTemporaryMailOrchestrationPrecheckReady({ ...base, automaticMailDisabled: false }), false);
assert.equal(core.isTemporaryMailOrchestrationPrecheckReady({ ...base, readyNativeInvoiceCount: 0 }), false);
assert.equal(core.isTemporaryMailOrchestrationPrecheckReady({ ...base, mutableMailJobCount: 1 }), false);

const route = readFileSync("app/api/admin/lexware/cron/mail-orchestration/trigger-once/route.ts", "utf8");
const coreSource = readFileSync("app/lib/lexware/lexwareTemporaryMailOrchestrationTriggerCore.ts", "utf8");
const precheck = readFileSync("app/lib/lexware/lexwareTemporaryMailOrchestrationPrecheck.ts", "utf8");
const worker = readFileSync("app/lib/lexware/lexwareNativeMailOrchestrationCore.ts", "utf8");
const middleware = readFileSync("middleware.ts", "utf8");
const vercel = readFileSync("vercel.json", "utf8");

assert.match(route, /requireAdminApiSession\(\)/, "admin session required");
assert.match(route, /hasSameRequestOrigin\(request\)/, "same-origin required");
assert.match(route, /hasExactConfirmation\(body, TEMPORARY_MAIL_ORCHESTRATION_CONFIRMATION\)/);
assert.match(coreSource, /TRIGGER_SINGLE_NATIVE_LEXWARE_MAIL_ORCHESTRATION_TEST/);
assert.match(route, /process\.env\.CRON_SECRET\?\.trim\(\)/, "server-side cron secret only");
assert.match(route, /Authorization: `Bearer \$\{secret\}`/);
assert.equal((route.match(/fetch\(/g) ?? []).length, 1, "exactly one internal cron GET");
assert.match(route, /method: "GET"/);
assert.match(route, /NATIVE_MAIL_ORCHESTRATION_NOOP/);
assert.match(route, /row\.processedCount === 0/);
assert.match(route, /row\.enqueueCount === 0/);
assert.match(route, /row\.activationCount === 0/);
assert.match(route, /mailJobCountAfter === mailJobCountBefore/, "mail jobs unchanged postcheck");
assert.match(precheck, /lexware_automatic_mail_enabled === false/, "gate must remain false");
assert.match(precheck, /waiting_for_activation/, "waiting jobs block harness");
assert.match(precheck, /"pending"/, "pending jobs block harness");
assert.match(precheck, /invoice\.lexware_pdf_storage_path === expectedPath/, "PDF binding required");
assert.match(precheck, /job\.status === "succeeded"/);
assert.match(precheck, /job\.creation_state === "definitely_created"/);
assert.match(worker, /if \(!await deps\.automaticMailEnabled\(\)\) return noop\(\)/,
  "closed gate returns before candidate loading");
assert.match(middleware, /\/api\/admin\/lexware\/cron\/mail-orchestration\/trigger-once/);
assert.doesNotMatch(route + precheck, /console\.|logger|log\(/i, "no secret or customer logging");
assert.doesNotMatch(route + precheck, /sendMail|smtp|claim_native|activate_native|enqueue_native|getLexware|createFinalInvoice/i,
  "harness has no direct provider, enqueue, activation, claim, or SMTP path");
assert.doesNotMatch(vercel, /api\/cron\/lexware\/mail-orchestration/, "cron schedule remains inactive");

console.log("PASS: temporary native mail orchestration no-op trigger harness");
