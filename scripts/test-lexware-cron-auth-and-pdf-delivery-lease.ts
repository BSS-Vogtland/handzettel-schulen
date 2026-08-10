import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const cronAuthorization = await import(pathToFileURL(resolve("app/lib/cron/cronAuthorization.ts")).href);
const leaseCore = await import(pathToFileURL(resolve("app/lib/lexware/lexwareNativePdfDeliveryLeaseCore.ts")).href);
const { isLexwareCronRequestAuthorized } = cronAuthorization;
const { canClaimNativePdfDeliveryLease, canReclaimStaleNativePdfDeliveryLease } = leaseCore;
type NativePdfDeliveryLeaseState = {
  status: "pending" | "processing" | "retry" | "succeeded" | "failed" | "manual_review";
  attemptCount: number;
  maxAttempts: number;
  lockedAt: string | null;
  lockExpiresAt: string | null;
  lockedBy: string | null;
  lastErrorCode: string | null;
  manualReviewReason: string | null;
  pdfStored: boolean;
};

const request = (authorization?: string, extra: Record<string, string> = {}) => ({
  headers: new Headers({ ...(authorization ? { authorization } : {}), ...extra }),
});

assert.equal(isLexwareCronRequestAuthorized(request(), {}), false, "missing secret fails closed");
assert.equal(isLexwareCronRequestAuthorized(request("Bearer wrong"), { CRON_SECRET: "correct" }), false, "wrong secret rejected");
assert.equal(isLexwareCronRequestAuthorized(request("Bearer correct"), { CRON_SECRET: "correct" }), true, "exact bearer accepted");
assert.equal(isLexwareCronRequestAuthorized(request(undefined, { "x-vercel-cron": "1" }), { CRON_SECRET: "correct" }), false,
  "x-vercel-cron is never sufficient");
assert.equal(isLexwareCronRequestAuthorized(request("Bearer wrong"), { CRON_SECRET: "" }), false, "empty secret fails closed");

const authSource = readFileSync("app/lib/cron/cronAuthorization.ts", "utf8");
assert.doesNotMatch(authSource, /searchParams|nextUrl|request\.url|console\.|x-vercel-cron/i, "no URL secrets, logs, or trusted cron hint");
assert.doesNotMatch(authSource, /CRON_SECRET[^\n]*(log|warn|error)/i, "secret is never logged");

const base: NativePdfDeliveryLeaseState = {
  status: "pending", attemptCount: 0, maxAttempts: 3,
  lockedAt: null, lockExpiresAt: null, lockedBy: null,
  lastErrorCode: null, manualReviewReason: null, pdfStored: false,
};
assert.equal(canClaimNativePdfDeliveryLease(base), true, "pending claimable");
assert.equal(canClaimNativePdfDeliveryLease({ ...base, status: "retry" }), true, "retry claimable");
assert.equal(canClaimNativePdfDeliveryLease({ ...base, status: "processing", lockedAt: "2026-08-10T10:00:00Z",
  lockExpiresAt: "2026-08-10T10:05:00Z", lockedBy: "worker" }), false, "active lock blocks normal claim");
assert.equal(canClaimNativePdfDeliveryLease({ ...base, attemptCount: 3 }), false, "max attempts blocks");
assert.equal(canClaimNativePdfDeliveryLease({ ...base, pdfStored: true }), false, "stored PDF blocks");
assert.equal(canClaimNativePdfDeliveryLease({ ...base, status: "manual_review", manualReviewReason: "ambiguous" }), false,
  "manual review blocks");

const processing: NativePdfDeliveryLeaseState = {
  ...base, status: "processing", attemptCount: 1,
  lockedAt: "2026-08-10T10:00:00Z", lockExpiresAt: "2026-08-10T10:05:00Z", lockedBy: "worker-1",
};
assert.equal(canReclaimStaleNativePdfDeliveryLease(processing, "2026-08-10T10:05:01Z"), true, "stale reclaim allowed");
assert.equal(canReclaimStaleNativePdfDeliveryLease(processing, "2026-08-10T10:04:59Z"), false, "active lock blocks reclaim");
assert.equal(canReclaimStaleNativePdfDeliveryLease({ ...processing, manualReviewReason: "review" }, "2026-08-10T10:05:01Z"), false,
  "review is never reclaimed");

let shared = { ...base };
const atomicClaim = () => {
  if (!canClaimNativePdfDeliveryLease(shared)) return false;
  shared = { ...shared, status: "processing", attemptCount: shared.attemptCount + 1,
    lockedAt: "2026-08-10T10:00:00Z", lockExpiresAt: "2026-08-10T10:05:00Z", lockedBy: "winner" };
  return true;
};
assert.deepEqual([atomicClaim(), atomicClaim()].sort(), [false, true], "exactly one competing claim wins");

const migration = readFileSync("supabase/migrations/20260810123000_native_lexware_pdf_delivery_lease.sql", "utf8");
assert.equal((migration.match(/^begin;$/gim) ?? []).length, 1);
assert.equal((migration.match(/^commit;$/gim) ?? []).length, 1);
assert.match(migration, /unique \(local_invoice_id\)/, "one PDF delivery job per invoice");
assert.match(migration, /status in \('pending','processing','retry','succeeded','failed','manual_review'\)/);
assert.match(migration, /status in \('pending','retry'\)[\s\S]*attempt_count < claimed_job\.max_attempts[\s\S]*locked_at is null/,
  "atomic pending/retry claim CAS");
assert.match(migration, /status = 'processing'[\s\S]*lock_expires_at <= now_value[\s\S]*attempt_count < reclaimed_job\.max_attempts/,
  "explicit stale reclaim CAS");
assert.match(migration, /NATIVE_PDF_DELIVERY_ALREADY_STORED/g, "stored PDF is blocked");
assert.match(migration, /manual_review_reason is null/g, "manual review fails closed");
assert.match(migration, /NATIVE_PDF_DELIVERY_BINDING_MISMATCH/, "object bindings fail closed");
assert.match(migration, /NATIVE_PDF_DELIVERY_CLAIM_BINDING_MISMATCH/, "claim revalidates current object bindings");
assert.match(migration, /NATIVE_PDF_DELIVERY_RECLAIM_BINDING_MISMATCH/, "reclaim revalidates current object bindings");
assert.match(migration, /NATIVE_PDF_DELIVERY_COMPLETE_BINDING_MISMATCH/, "completion revalidates current object bindings");
assert.match(migration, /security definer\s+set search_path = public, pg_temp/gi);
assert.match(migration, /revoke all on table[\s\S]*from service_role;[\s\S]*grant select, insert, update/i);
assert.match(migration, /revoke all on function[\s\S]*from public, anon, authenticated, service_role;/i);
assert.match(migration, /grant execute on function[\s\S]*to service_role;/i);
assert.doesNotMatch(migration, /\bcascade\b|execute\s+format|https?:\/\/|getLexwareInvoicePdf|createFinalInvoice|smtp|sendMail/i,
  "no cascade, dynamic SQL, provider calls, or mail");

const existingPdfService = readFileSync("app/lib/lexware/lexwareProductionPdfStorage.ts", "utf8");
const existingDeliveryCore = readFileSync("app/lib/lexware/lexwareProductionDeliveryCore.ts", "utf8");
assert.match(existingPdfService, /getLexwareInvoicePdf\("production"/, "manual PDF service remains present and separate");
assert.doesNotMatch(existingPdfService, /pdf_delivery_jobs|claim_native_lexware_invoice_pdf_delivery_job/,
  "manual PDF service remains unchanged");
assert.match(existingDeliveryCore, /sendClaimedMailAtMostOnce/, "existing mail core remains unchanged");

console.log("PASS: fail-closed cron authorization and native PDF delivery lease A-Z");
