import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20260807100000_native_lexware_checkout_staging.sql", "utf8");
const shop = readFileSync("app/api/shop/checkout/route.ts", "utf8");
const offer = readFileSync("app/api/offer/[token]/checkout/route.ts", "utf8");
const staging = readFileSync("app/lib/lexware/lexwareNativeCheckoutStaging.ts", "utf8");
const repository = readFileSync("app/lib/lexware/lexwareProductionInvoiceJobRepository.ts", "utf8");
const processService = readFileSync("app/lib/lexware/lexwareProductionInvoiceProcessService.ts", "utf8");
const gates = readFileSync("app/lib/lexware/lexwareProductionInvoiceJob.ts", "utf8");
const permitMigration = readFileSync("supabase/migrations/20260806023000_lexware_object_scoped_production_write_permits.sql", "utf8");

assert.equal((migration.match(/^begin;$/gim) ?? []).length, 1);
assert.equal((migration.match(/^commit;$/gim) ?? []).length, 1);
assert.match(migration, /invoice_provider is distinct from 'lexware'/);
assert.match(migration, /tax_snapshot_version = 'invoice-tax-snapshot-v2'/);
assert.match(migration, /lexware_invoice_id is null[\s\S]*lexware_invoice_number is null[\s\S]*lexware_finalized_at is null/);
assert.match(migration, /lexware_invoice_job_id is not null[\s\S]*lexware_invoice_id\), ''\) is not null[\s\S]*lexware_finalized_at is not null/);
assert.doesNotMatch(migration, /on delete cascade/i);

assert.match(migration, /stage_native_lexware_checkout_invoice/);
assert.match(migration, /trigger_source[\s\S]*'checkout_native_lexware'/);
assert.match(migration, /'pending', 'not_attempted', 0/);
assert.match(migration, /lexware-payload-canonical-v2/);
assert.match(migration, /NATIVE_PROVIDER_CUTOVER_INACTIVE/);
assert.match(migration, /insert into public\.school_request_invoices[\s\S]*insert into public\.school_request_invoice_items[\s\S]*insert into public\.school_lexware_invoice_jobs[\s\S]*update public\.school_request_invoices/);

for (const checkout of [shop, offer]) {
  assert.match(checkout, /stageNativeLexwareCheckoutInvoice/);
  assert.match(checkout, /selectedInvoiceProvider === "lexware"/);
  assert.doesNotMatch(checkout, /createLexwareProductionFinalInvoice|claimInvoiceJobForProcessing|lexwareGetJson|lexwarePost|processLexwareProductionInvoiceById/);
  assert.match(checkout, /if \(!nativeLexwareCheckout\) \{[\s\S]*sendCustomerInvoiceMailSafely/);
}
assert.match(staging, /buildEligibleLocalInvoice/);
assert.match(staging, /stage_native_lexware_checkout_invoice/);
assert.doesNotMatch(staging, /fetch\(|lexware\.io|claim|mail|pdf/i);

assert.match(migration, /claim_native_lexware_invoice_job_for_processing/);
assert.match(migration, /invoice_row\.invoice_provider is distinct from 'lexware'/);
assert.match(migration, /job_row\.trigger_source is distinct from 'checkout_native_lexware'/);
assert.match(migration, /settings_row\.lexware_production_write_enabled is not true/);
assert.match(migration, /job_row\.status not in \('pending', 'retry'\)/);
assert.match(migration, /NATIVE_JOB_LOCK_CONFLICT/);
assert.match(repository, /rpc\("claim_native_lexware_invoice_job_for_processing"/);
assert.match(processService, /job\.trigger_source === "checkout_native_lexware"/);
assert.match(processService, /nativeProductionJob/);
assert.match(gates, /input\.nativeProductionJob === true \|\| input\.checkoutMaintenanceActive === true/);

assert.match(permitMigration, /claim_school_lexware_invoice_job_with_permit/);
assert.match(permitMigration, /claim_school_lexware_invoice_job_for_processing/);
assert.doesNotMatch(permitMigration, /claim_native_lexware_invoice_job_for_processing/);

assert.doesNotMatch(migration + staging + shop + offer, /automaticMailEnabled|lexware_automatic_mail_enabled/);
console.log("Lexware native checkout staging A-AD PASS");
