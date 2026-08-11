import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const configSource = readFileSync("vercel.json", "utf8");
const config = JSON.parse(configSource) as {
  $schema?: string;
  crons?: Array<{ path: string; schedule: string }>;
};
assert.equal(config.$schema, "https://openapi.vercel.sh/vercel.json", "official Vercel schema retained");
assert.ok(Array.isArray(config.crons), "Cron configuration exists");
const crons = config.crons ?? [];
assert.equal(crons.length, 10, "six existing and four Native Lexware Cron jobs");

const existingCronDigest = createHash("sha256")
  .update(JSON.stringify(crons.slice(0, 6)))
  .digest("hex");
assert.equal(existingCronDigest, "83d0cc41fcdf1bf95142a53d73b6c94b27b493352538b039f2e71d2279aac5ab",
  "all existing Cron objects remain byte-for-byte equivalent after JSON parsing");

const expected = new Map([
  ["/api/cron/lexware/invoices", "*/2 * * * *"],
  ["/api/cron/lexware/pdfs", "1-59/2 * * * *"],
  ["/api/cron/lexware/mail-orchestration", "*/2 * * * *"],
  ["/api/cron/lexware/mail-process", "1-59/2 * * * *"],
]);
for (const [path, schedule] of expected) {
  const matches = crons.filter((cron) => cron.path === path);
  assert.equal(matches.length, 1, `${path} is scheduled exactly once`);
  assert.equal(matches[0]?.schedule, schedule, `${path} has the expected two-minute phase`);
  assert.equal(path.includes("?"), false, `${path} contains no query-string secret`);
}

const minuteSet = (expression: string) => {
  const minute = expression.split(" ")[0];
  if (minute === "*/2") return Array.from({ length: 30 }, (_, index) => index * 2);
  if (minute === "1-59/2") return Array.from({ length: 30 }, (_, index) => index * 2 + 1);
  throw new Error(`UNEXPECTED_TEST_SCHEDULE:${minute}`);
};
for (const schedule of expected.values()) {
  const minutes = minuteSet(schedule);
  assert.equal(minutes.length, 30, "Batch-1 capacity is 30 runs per hour");
  assert.ok(minutes.every((minute, index) => index === 0 || minute - minutes[index - 1] === 2),
    "each worker runs every two minutes");
}
assert.deepEqual(minuteSet(expected.get("/api/cron/lexware/invoices")!).slice(0, 3), [0, 2, 4]);
assert.deepEqual(minuteSet(expected.get("/api/cron/lexware/pdfs")!).slice(0, 3), [1, 3, 5]);

const routes = ["invoices", "pdfs", "mail-orchestration", "mail-process"]
  .map((name) => readFileSync(`app/api/cron/lexware/${name}/route.ts`, "utf8"));
for (const route of routes) {
  assert.match(route, /isLexwareCronRequestAuthorized\(request\)/, "central Bearer CRON_SECRET auth retained");
  assert.doesNotMatch(route, /searchParams|get\(["']secret["']\)|x-vercel-cron/i,
    "no query-secret or x-vercel-cron authentication fallback");
}

const batchCores = [
  "app/lib/lexware/lexwareNativeInvoiceCronWorkerCore.ts",
  "app/lib/lexware/lexwareNativePdfCronWorkerCore.ts",
  "app/lib/lexware/lexwareNativeMailOrchestrationCore.ts",
  "app/lib/lexware/lexwareNativeMailProcessingCronWorkerCore.ts",
].map((path) => readFileSync(path, "utf8"));
for (const core of batchCores) assert.match(core, /BATCH_SIZE = 1 as const/, "Batch size remains exactly one");

const temporaryHarnesses = crons.filter((cron) => cron.path.includes("trigger-once"));
assert.equal(temporaryHarnesses.length, 0, "no temporary test harness is scheduled");
console.log("PASS: Native Lexware Vercel Cron schedules, auth, phasing, capacity, and existing Cron preservation");
