import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

type RuntimeReadinessModule =
  typeof import("../app/api/admin/lexware/runtime-readiness/route");
type RuntimeReadinessCoreModule =
  typeof import("../app/lib/lexware/lexwareRuntimeReadinessCore");

const routePath =
  "app/api/admin/lexware/runtime-readiness/route.ts";
const routeSource = readFileSync(routePath, "utf8");
const coreModuleUrl = new URL(
  "../app/lib/lexware/lexwareRuntimeReadinessCore.ts",
  import.meta.url,
).href;
const readinessCore: RuntimeReadinessCoreModule = await import(coreModuleUrl);

const expectedGetExport: keyof RuntimeReadinessModule = "GET";
assert.equal(expectedGetExport, "GET");

function pass(label: string) {
  process.stdout.write(`${label} PASS\n`);
}

const baseInput: Parameters<
  RuntimeReadinessCoreModule["buildLexwareRuntimeReadiness"]
>[0] = {
  runtimeSummary: {
    activeModeConfigured: true,
    activeModeValid: true,
    activeMode: "test",
    integrationEnabledConfigured: true,
    integrationEnabledValid: true,
    integrationEnabled: false,
    productionApiKeyConfigured: false,
    productionOrganizationConfigured: false,
  },
  databaseSettings: {
    productionWriteEnabled: false,
    automaticMailEnabled: false,
    targetOrganizationConfigured: true,
    credentialAliasConfigured: true,
  },
  checkoutMaintenance: {
    known: true,
    value: true,
  },
};

assert.equal(
  (routeSource.match(/export async function GET\s*\(/g) ?? []).length,
  1,
);
assert.doesNotMatch(
  routeSource,
  /export async function (?:POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*\(/,
);
pass("A exclusively GET");

assert.match(routeSource, /export const runtime = "nodejs";/);
pass("B node runtime");

assert.match(routeSource, /export const dynamic = "force-dynamic";/);
pass("C force dynamic");

assert.match(routeSource, /requireAdminApiSession/);
assert.match(routeSource, /const unauthorized = await requireAdminApiSession\(\)/);
pass("D central admin authentication");

assert.match(
  routeSource,
  /unauthorized\.headers\.set\("Cache-Control", "no-store"\)/,
);
pass("E no-store on 401");

assert.doesNotMatch(routeSource, /lexwareClient/);
pass("F no Lexware client import");

assert.doesNotMatch(routeSource, /getLexwareProfile/);
pass("G no profile request");

assert.doesNotMatch(routeSource, /\bfetch\s*\(/);
pass("H no fetch");

assert.doesNotMatch(routeSource, /enqueue_existing_v2_lexware_invoice_job/);
pass("I no enqueue RPC");

assert.doesNotMatch(routeSource, /claim_school_lexware_invoice_job_for_processing/);
pass("J no claim RPC");

assert.doesNotMatch(
  routeSource,
  /\.(?:insert|update|delete|upsert|rpc)\s*\(/,
);
pass("K no database mutation");

assert.doesNotMatch(routeSource, /productionOrganizationId\s*:/);
pass("L no organization ID response");

assert.doesNotMatch(routeSource, /credentialAlias\s*:/);
pass("M no credential alias response");

assert.doesNotMatch(routeSource, /productionApiKey\s*:/);
pass("N no API key response");

assert.doesNotMatch(routeSource, /process\.env|apiKeyEnvironmentVariable|organizationIdEnvironmentVariable/);
pass("O no raw environment response");

let readiness = readinessCore.buildLexwareRuntimeReadiness({
  ...baseInput,
  runtimeSummary: {
    ...baseInput.runtimeSummary,
    activeMode: "production",
  },
});
assert.equal(readiness.runtime.activeModeKnown, true);
assert.equal(readiness.runtime.activeModeIsProduction, true);
pass("P production mode known and production");

readiness = readinessCore.buildLexwareRuntimeReadiness(baseInput);
assert.equal(readiness.runtime.activeModeKnown, true);
assert.equal(readiness.runtime.activeModeIsProduction, false);
pass("Q test mode known and not production");

for (const runtimeSummary of [
  {
    ...baseInput.runtimeSummary,
    activeModeConfigured: true,
    activeModeValid: false,
    activeMode: null,
  },
  {
    ...baseInput.runtimeSummary,
    activeModeConfigured: false,
    activeModeValid: false,
    activeMode: null,
  },
]) {
  readiness = readinessCore.buildLexwareRuntimeReadiness({
    ...baseInput,
    runtimeSummary,
  });
  assert.equal(readiness.runtime.activeModeKnown, false);
  assert.equal(readiness.runtime.activeModeIsProduction, null);
}
pass("R invalid or missing mode unknown and null");

readiness = readinessCore.buildLexwareRuntimeReadiness({
  ...baseInput,
  runtimeSummary: {
    ...baseInput.runtimeSummary,
    integrationEnabled: true,
  },
});
assert.equal(readiness.runtime.integrationEnabledKnown, true);
assert.equal(readiness.runtime.integrationEnabled, true);
pass("S integration true known");

readiness = readinessCore.buildLexwareRuntimeReadiness(baseInput);
assert.equal(readiness.runtime.integrationEnabledKnown, true);
assert.equal(readiness.runtime.integrationEnabled, false);
pass("T integration false known");

for (const runtimeSummary of [
  {
    ...baseInput.runtimeSummary,
    integrationEnabledConfigured: true,
    integrationEnabledValid: false,
    integrationEnabled: null,
  },
  {
    ...baseInput.runtimeSummary,
    integrationEnabledConfigured: false,
    integrationEnabledValid: true,
    integrationEnabled: null,
  },
]) {
  readiness = readinessCore.buildLexwareRuntimeReadiness({
    ...baseInput,
    runtimeSummary,
  });
  assert.equal(readiness.runtime.integrationEnabledKnown, false);
  assert.equal(readiness.runtime.integrationEnabled, null);
}
pass("U invalid or missing integration unknown and null");

readiness = readinessCore.buildLexwareRuntimeReadiness({
  ...baseInput,
  runtimeSummary: {
    ...baseInput.runtimeSummary,
    productionApiKeyConfigured: true,
  },
});
assert.equal(readiness.runtime.productionApiKeyConfigured, true);
pass("V production API key configured");

assert.equal(
  readinessCore.buildLexwareRuntimeReadiness(baseInput)
    .runtime.productionApiKeyConfigured,
  false,
);
pass("W empty production API key not configured");

readiness = readinessCore.buildLexwareRuntimeReadiness({
  ...baseInput,
  runtimeSummary: {
    ...baseInput.runtimeSummary,
    productionOrganizationConfigured: true,
  },
});
assert.equal(readiness.runtime.productionOrganizationConfigured, true);
pass("X production organization configured");

assert.equal(
  readinessCore.buildLexwareRuntimeReadiness(baseInput)
    .runtime.productionOrganizationConfigured,
  false,
);
pass("Y empty production organization not configured");

for (const field of [
  "productionWriteEnabled",
  "automaticMailEnabled",
  "targetOrganizationConfigured",
  "credentialAliasConfigured",
]) {
  assert.match(routeSource, new RegExp(`\\b${field}\\s*:`));
}
const databaseFixture = {
  productionWriteEnabled: true,
  automaticMailEnabled: true,
  targetOrganizationConfigured: false,
  credentialAliasConfigured: false,
};
readiness = readinessCore.buildLexwareRuntimeReadiness({
  ...baseInput,
  databaseSettings: databaseFixture,
});
assert.deepEqual(readiness.database, databaseFixture);
pass("Z database values preserved");

assert.match(routeSource, /const settings = parseRuntimeSettings\(data\)/);
assert.match(routeSource, /if \(error \|\| !settings\)/);
assert.match(routeSource, /\{ ok: false \}/);
assert.match(routeSource, /status: 503/);
pass("AA missing runtime settings controlled without default");

const safety = readinessCore.buildLexwareRuntimeReadiness(baseInput).safety;
const safetyCounterFields = [
  "externalReadsPerformed",
  "externalWritesPerformed",
  "databaseWritesPerformed",
  "jobsCreated",
  "claimsPerformed",
  "mailsSent",
] as const;
for (const field of safetyCounterFields) {
  assert.equal(safety[field], 0);
  assert.equal(typeof safety[field], "number");
}
pass("AB safety counters exact numeric zero");

const allowedResponseFields = [
  "ok",
  "runtime",
  "activeModeKnown",
  "activeModeIsProduction",
  "integrationEnabledKnown",
  "integrationEnabled",
  "productionApiKeyConfigured",
  "productionOrganizationConfigured",
  "database",
  "productionWriteEnabled",
  "automaticMailEnabled",
  "targetOrganizationConfigured",
  "credentialAliasConfigured",
  "safety",
  "checkoutMaintenance",
  "externalReadsPerformed",
  "externalWritesPerformed",
  "databaseWritesPerformed",
  "jobsCreated",
  "claimsPerformed",
  "mailsSent",
];
const successResponse = readinessCore.buildLexwareRuntimeReadiness(baseInput);
const responseKeys = [
  ...Object.keys(successResponse),
  ...Object.keys(successResponse.runtime),
  ...Object.keys(successResponse.database),
  ...Object.keys(successResponse.safety),
];
assert.deepEqual(
  [...new Set(responseKeys)].sort(),
  [...allowedResponseFields].sort(),
);
pass("AC no additional response fields");

assert.equal((routeSource.match(/\.select\s*\(/g) ?? []).length, 1);
assert.doesNotMatch(
  routeSource,
  /\b(?:fetch|getLexwareProfile|createLexware|enqueueLexware|claimInvoiceJob|sendMail)\b|\.(?:insert|update|delete|upsert|rpc)\s*\(/,
);
pass("AD no external requests or mutations");
