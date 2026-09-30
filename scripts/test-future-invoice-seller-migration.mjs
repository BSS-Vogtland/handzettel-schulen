import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createSellerSnapshot } from "../app/lib/sellerSettings.ts";

// Offline SQL contract verification only. No SQL execution, DB client or network.
const previous = readFileSync(new URL("../supabase/migrations/20260803060000_future_invoice_bank_snapshot.sql", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20260930150000_future_invoice_seller_snapshot.sql", import.meta.url), "utf8");
const binding = readFileSync(new URL("../supabase/migrations/20260728203000_invoice_provider_cutover_foundation.sql", import.meta.url), "utf8");
const functionPattern = /create or replace function public\.set_school_request_invoice_provider_on_insert\(\)[\s\S]*?\$\$;/;
const sellerBlockPattern = /  if seller_snapshot_field_count = 0 then\r?\n([\s\S]*?)  elsif seller_snapshot_field_count <> 13 then\r?\n    raise exception 'SELLER_SNAPSHOT_INCOMPLETE';\r?\n  end if;/;
const oldFunction = previous.match(functionPattern)?.[0];
const newFunction = migration.match(functionPattern)?.[0];
assert.ok(oldFunction && newFunction, "Expected exact trigger function");
const sellerBlock = newFunction.match(sellerBlockPattern);
assert.ok(sellerBlock, "Expected unchanged 0 / 13 / incomplete branch structure");
const assignments = [...sellerBlock[1].matchAll(/^    new\.(seller_\w+) := '([^']*)';\r?$/gm)];
const fallback = Object.fromEntries(assignments.map((m) => [m[1], m[2]]));
assert.equal(sellerBlock[1].replace(/^    new\.seller_\w+ := '[^']*';\r?\n/gm, ""), "", "Fallback contains literal assignments only");
const countExpression = newFunction.match(/  seller_snapshot_field_count :=\r?\n([\s\S]*?);/)?.[1];
assert.ok(countExpression);
const countedKeys = [...countExpression.matchAll(/\(case when nullif\(btrim\(new\.(seller_\w+)\), ''\) is not null then 1 else 0 end\)/g)].map((m) => m[1]);
assert.equal(countExpression.replace(/\(case when nullif\(btrim\(new\.seller_\w+\), ''\) is not null then 1 else 0 end\)/g, "").replace(/[\s+]/g, ""), "", "Only known completeness expressions");
assert.equal(countedKeys.length, 13);
assert.equal(new Set(countedKeys).size, 13);
assert.deepEqual(Object.keys(fallback).sort(), [...countedKeys].sort());

// Models only the structurally verified seller branch, using fields and literals
// extracted from SQL. PostgreSQL btrim(text) removes ordinary spaces, not all JS whitespace.
function projectSellerBranch(input) {
  const output = { ...input };
  const count = countedKeys.filter((key) => input[key] != null && input[key].replace(/^ +| +$/g, "") !== "").length;
  if (count === 0) Object.assign(output, fallback);
  else if (count !== 13) throw new Error("SELLER_SNAPSHOT_INCOMPLETE");
  return output;
}

const expected = {
  seller_snapshot_version: "business-profile-2026-09-30-v1",
  seller_legal_name_snapshot: "BSS Vogtland",
  seller_trade_name_snapshot: "Handzettel-Schulen.de",
  seller_owner_name_snapshot: "Marius Röthig",
  seller_street_snapshot: "Zwickauer Str. 167",
  seller_postal_code_snapshot: "08468",
  seller_city_snapshot: "Reichenbach im Vogtland",
  seller_country_snapshot: "Deutschland",
  seller_tax_number_snapshot: "223/263/05859",
  seller_vat_id_snapshot: "DE463186382",
  seller_email_snapshot: "kontakt@bss-vogtland.de",
  seller_phone_snapshot: "03765 / 16175",
  seller_website_snapshot: "www.handzettel-schulen.de",
};

test("A: absent, NULL, empty and space-only seller snapshots receive confirmed values", () => {
  assert.deepEqual(fallback, expected);
  assert.deepEqual(fallback, createSellerSnapshot());
  for (const missing of [undefined, null, "", "   "]) {
    const input = Object.fromEntries(countedKeys.map((key) => [key, missing]));
    const before = structuredClone(input);
    assert.deepEqual(projectSellerBranch(input), expected);
    assert.deepEqual(input, before);
  }
});

test("B/C: all 8192 field-presence combinations preserve complete snapshots or reject partial ones", () => {
  for (let mask = 0; mask < 1 << 13; mask++) {
    const input = Object.fromEntries(countedKeys.map((key, index) => [key, mask & (1 << index) ? `  historical-${index}  ` : null]));
    const before = structuredClone(input);
    if (mask === 0) assert.deepEqual(projectSellerBranch(input), expected);
    else if (mask === (1 << 13) - 1) assert.deepEqual(projectSellerBranch(input), input);
    else assert.throws(() => projectSellerBranch(input), /^Error: SELLER_SNAPSHOT_INCOMPLETE$/);
    assert.deepEqual(input, before);
  }
});

test("D: migration contains only function replacement; existing BEFORE INSERT binding is retained", () => {
  const uncommented = migration.replace(/^--[^\r\n]*(?:\r?\n|$)/gm, "").trim();
  assert.equal(uncommented, newFunction);
  assert.doesNotMatch(newFunction, /\b(?:update|insert\s+into|delete\s+from|merge|truncate|alter|drop|create\s+trigger)\b/i);
  assert.match(binding, /create trigger trg_set_school_request_invoice_provider_on_insert\s+before insert on public\.school_request_invoices\s+for each row\s+execute function public\.set_school_request_invoice_provider_on_insert\(\);/i);
});

test("E: entire function outside seller fallback values is byte-identical", () => {
  const maskSellerValues = (sql) => sql.replace(sellerBlockPattern, (block) => block.replace(/(new\.seller_\w+ := )'[^']*'/g, "$1'<VALUE>'"));
  assert.deepEqual(Buffer.from(maskSellerValues(newFunction)), Buffer.from(maskSellerValues(oldFunction)));
  const bankSection = (sql) => sql.slice(sql.indexOf("  bank_snapshot_field_count :="), sql.indexOf("  seller_snapshot_field_count :="));
  assert.deepEqual(Buffer.from(bankSection(newFunction)), Buffer.from(bankSection(oldFunction)));
  assert.equal(assignments.length, 13);
  const oldAssignments = Object.fromEntries([...oldFunction.match(sellerBlockPattern)[1].matchAll(/new\.(seller_\w+) := '([^']*)';/g)].map((m) => [m[1], m[2]]));
  assert.deepEqual(Object.keys(fallback).filter((key) => fallback[key] !== oldAssignments[key]).sort(), [
    "seller_snapshot_version", "seller_street_snapshot", "seller_postal_code_snapshot",
    "seller_city_snapshot", "seller_tax_number_snapshot", "seller_vat_id_snapshot", "seller_phone_snapshot",
  ].sort());
});