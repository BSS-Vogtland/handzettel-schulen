import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migration = readFileSync(resolve(root, "supabase/migrations/20260806140000_lexware_expired_permit_reissue.sql"), "utf8");
const expireRoute = readFileSync(resolve(root, "app/api/admin/lexware/invoices/[invoiceId]/expire-production-permit/route.ts"), "utf8");
const reissueRoute = readFileSync(resolve(root, "app/api/admin/lexware/invoices/[invoiceId]/reissue-production-permit/route.ts"), "utf8");
const service = readFileSync(resolve(root, "app/lib/lexware/lexwareProductionWritePermitService.ts"), "utf8");
const dryRun = readFileSync(resolve(root, "app/lib/lexware/lexwareProductionDryRunService.ts"), "utf8");
const middleware = readFileSync(resolve(root, "middleware.ts"), "utf8");
const corePath = resolve(root, "app/lib/lexware", "lexwareProductionWritePermitCore" + ".ts");
const { evaluateObjectScopedPermitReadiness } = await import(pathToFileURL(corePath).href);

const normalized = migration.replace(/\s+/g, " ").trim();
assert.equal((normalized.match(/\bbegin;/gi) ?? []).length, 1); // A
assert.equal((normalized.match(/\bcommit;/gi) ?? []).length, 1); // B
assert.match(migration, /permit_row\.permit_state <> 'activated'|permit_row\.permit_state != 'activated'/); // C
assert.match(migration, /permit_row\.expires_at > now_value/); // D
assert.match(migration, /claimed_at is not null|claim_id is not null/); // E
assert.match(migration, /consumed_at is not null/); // F
assert.match(migration, /PERMIT_EXPIRY_IDENTITY_MISMATCH/); // G
assert.match(migration, /job_row\.status <> 'pending'/); // H
assert.match(migration, /job_row\.attempt_count <> 0/); // I
assert.match(migration, /locked_at is not null|lock_expires_at is not null|locked_by is not null/); // J
assert.match(migration, /lexware_invoice_id is not null|lexware_invoice_number is not null/); // K
assert.doesNotMatch(migration, /update public\.school_lexware_invoice_jobs[\s\S]*expire_school/i); // L
assert.doesNotMatch(expireRoute, /claimLexware|processLexware|createLexware/); // M
assert.match(migration, /production_write_permit_expired/); // N
assert.match(readFileSync(resolve(root, "supabase/migrations/20260806023000_lexware_object_scoped_production_write_permits.sql"), "utf8"), /where permit_state in \('issued','activated','claimed'\)/); // O
assert.match(migration, /old_permit\.permit_state <> 'expired'/); // P
assert.match(migration, /PERMIT_REISSUE_ACTIVE_PERMIT_PRESENT/); // Q
for (const binding of ["invoice_row.id", "invoice_row.request_id", "job_row.id", "target_organization_id", "payload_hash_version", "payload_sha256"]) assert.match(migration, new RegExp(binding.replace(".", "\\."))); // R
assert.match(migration, /p_expires_in_minutes <> 30/); // S
assert.match(migration, /'pending', 0, 'activated'/); // T
assert.doesNotMatch(migration, /update public\.school_lexware_invoice_jobs/); // U
assert.match(migration, /expected_attempt_count, permit_state/); // V
assert.doesNotMatch(reissueRoute, /lock|claimLexware/); // W-X
for (const source of [migration, expireRoute, reissueRoute]) assert.doesNotMatch(source, /lexware\.io|createLexwareProductionFinalInvoice|sendMail/); // Y-Z
assert.doesNotMatch(migration, /invoice_provider\s*=/i); // AA
assert.doesNotMatch(migration, /lexware_production_write_enabled\s*=/i); // AB

const common = {
  invoiceId: "11111111-1111-4111-8111-111111111111",
  requestId: "22222222-2222-4222-8222-222222222222",
  jobId: "33333333-3333-4333-8333-333333333333",
  targetOrganizationId: "44444444-4444-4444-8444-444444444444",
  payloadHashVersion: "lexware-payload-canonical-v2",
  payloadSha256: "a".repeat(64),
  attemptCount: 0,
  technicalPreviewReady: true,
  now: "2026-08-06T12:00:00.000Z",
};
const expiredPermit = {
  id: "55555555-5555-4555-8555-555555555555", ...common,
  state: "expired" as const, expiresAt: "2026-08-06T11:00:00.000Z", claimId: null,
};
const before = evaluateObjectScopedPermitReadiness({ ...common, permit: null, expiredPermit, jobStatus: "pending" });
assert.equal(before.activePermitExists, false);
assert.equal(before.expiredPermitExists, true);
assert.equal(before.expiredPermitIdentityMatches, true);
assert.equal(before.permitReissueReady, true);
assert.equal(before.objectScopedClaimReady, false);
const activatedPermit = { ...expiredPermit, id: "66666666-6666-4666-8666-666666666666", state: "activated" as const, expiresAt: "2026-08-06T12:30:00.000Z" };
const after = evaluateObjectScopedPermitReadiness({ ...common, permit: activatedPermit, expiredPermit, jobStatus: "pending" });
assert.equal(after.activePermitExists, true);
assert.equal(after.currentPermitState, "activated");
assert.equal(after.objectScopedClaimReady, true); // AC
for (const route of [expireRoute, reissueRoute]) {
  assert.match(route, /requireAdminApiSession/); assert.match(route, /hasSameRequestOrigin/);
  assert.match(route, /Cache-Control.*no-store/); assert.match(route, /readLimitedJsonBody\(request, 1_024\)/);
}
assert.match(middleware, /expire-production-permit\|reissue-production-permit/); // AD
for (const fn of ["expire_school_lexware_production_write_permit", "reissue_school_lexware_production_write_permit"]) {
  assert.match(migration, new RegExp(`create or replace function public\\.${fn}`));
}
assert.equal((migration.match(/security definer/gi) ?? []).length, 2);
assert.equal((migration.match(/set search_path = public, pg_temp/gi) ?? []).length, 2);
assert.equal((migration.match(/revoke all on function/gi) ?? []).length, 2);
assert.equal((migration.match(/grant execute on function/gi) ?? []).length, 2); // AE
assert.doesNotMatch(migration, /cascade/i); // AF
assert.doesNotMatch(migration, /\bexecute\s+format|\bformat\s*\(/i); // AG
assert.doesNotMatch(migration, /\bcreate\s+trigger\b|\bpg_cron\b|\bcron\.schedule\b|\bcreate\s+(?:or\s+replace\s+)?function\b[^$]*\bworker\b/i); // AH
assert.match(service, /p_expires_in_minutes: 30/);
assert.match(dryRun, /expiredPermit/);
assert.match(migration, /status <> 'pending'[\s\S]*creation_state <> 'not_attempted'[\s\S]*attempt_count <> 0/); // AI

console.log("Lexware expired permit reissue A-AI PASS");
