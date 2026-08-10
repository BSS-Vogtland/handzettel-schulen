import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const core = await import(pathToFileURL(resolve("app/lib/lexware/lexwareNativeInvoiceCronWorkerCore.ts")).href);
const base = {
  local_invoice_id: "ede1a917-0554-4bcb-8e29-3c9506c1d9f8",
  status: "pending", creation_state: "not_attempted", attempt_count: 0, max_attempts: 5,
  locked_by: null, locked_at: null, lock_expires_at: null,
  external_write_started_at: null, external_write_completed_at: null,
  lexware_invoice_id: null, lexware_invoice_number: null,
};
assert.equal(core.isNativeInvoiceCronTargetFirst([base], base.local_invoice_id, Date.now()), true);
assert.equal(core.isNativeInvoiceCronTargetFirst([{ ...base, local_invoice_id: "older" }, base], base.local_invoice_id, Date.now()), false);
assert.equal(core.isNativeInvoiceCronTargetFirst([{ ...base, status: "succeeded" }, base], base.local_invoice_id, Date.now()), true);
assert.equal(core.isNativeInvoiceCronTargetFirst([{ ...base, locked_by: "active", locked_at: "2026-08-10T12:00:00Z",
  lock_expires_at: "2099-08-10T12:05:00Z" }, base], base.local_invoice_id, Date.now()), true);

const route = readFileSync("app/api/admin/lexware/cron/invoices/trigger-once/route.ts", "utf8");
const worker = readFileSync("app/lib/lexware/lexwareNativeInvoiceCronWorker.ts", "utf8");
const middleware = readFileSync("middleware.ts", "utf8");
assert.match(route, /requireAdminApiSession\(\)/);
assert.match(route, /hasSameRequestOrigin\(request\)/);
assert.match(route, /hasExactConfirmation\(body, TEMPORARY_INVOICE_CRON_CONFIRMATION\)/);
assert.match(route, /TRIGGER_SINGLE_NATIVE_LEXWARE_INVOICE_CRON_TEST/);
assert.match(route, /isNativeInvoiceCronTargetReady\(TARGET_INVOICE_ID\)/);
assert.match(route, /process\.env\.CRON_SECRET\?\.trim\(\)/);
assert.match(route, /Authorization: `Bearer \$\{secret\}`/);
assert.equal((route.match(/fetch\(/g) ?? []).length, 1, "exactly one proxy request path");
assert.doesNotMatch(route, /console\.|CRON_SECRET[^\n]*(return|json|log)|setTimeout|retry/i);
assert.doesNotMatch(route, /processLexwareProductionInvoiceById|createFinalInvoice|getLexwareInvoicePdf|sendMail|smtp/i);
assert.match(worker, /loadCandidates: loadNativeInvoiceCronCandidates/);
assert.match(middleware, /\/api\/admin\/lexware\/cron\/invoices\/trigger-once/);
assert.doesNotMatch(readFileSync("vercel.json", "utf8"), /api\/admin\/lexware\/cron\/invoices\/trigger-once/);

console.log("PASS: temporary native invoice cron trigger harness");
