import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const APPLY_SAFE = process.argv.includes("--apply-safe");
const PAGE_SIZE = 1000;

const TABLES = [
  {
    table: "school_requests",
    hasRequestId: false,
    columns: [
      "customer_name",
      "child_name",
      "school_name",
      "class_name",
      "message",
    ],
  },
  {
    table: "school_request_children",
    hasRequestId: true,
    columns: ["label", "child_name", "school_name", "class_name", "notes"],
  },
  {
    table: "school_request_items",
    hasRequestId: true,
    columns: [
      "raw_text",
      "normalized_name",
      "category",
      "format",
      "color",
      "lineature",
      "notes",
    ],
  },
  {
    table: "school_offer_items",
    hasRequestId: true,
    columns: ["product_name", "product_sku", "unit", "notes", "customer_note"],
  },
  {
    table: "school_request_matches",
    hasRequestId: false,
    columns: ["product_name", "product_sku", "match_reason"],
  },
  {
    table: "school_request_item_questions",
    hasRequestId: true,
    columns: ["question_text", "answer_text"],
  },
  {
    table: "school_products",
    hasRequestId: false,
    allStringFields: true,
    allowApplySafe: false,
    columns: [],
  },
];

const DIRECT_REPLACEMENTS = [
  ["m?ssen", "müssen"],
  ["Ã¢â€šÂ¬", "€"],
  ["Ãƒâ€ž", "Ä"],
  ["Ãƒâ€“", "Ö"],
  ["ÃƒÅ“", "Ü"],
  ["ÃƒÂ¤", "ä"],
  ["ÃƒÂ¶", "ö"],
  ["ÃƒÂ¼", "ü"],
  ["ÃƒÅ¸", "ß"],
  ["Ã„", "Ä"],
  ["Ã–", "Ö"],
  ["Ãœ", "Ü"],
  ["Ã¤", "ä"],
  ["Ã¶", "ö"],
  ["Ã¼", "ü"],
  ["ÃŸ", "ß"],
  ["Ã©", "é"],
  ["Ã¨", "è"],
  ["Ã¡", "á"],
  ["Ã³", "ó"],
  ["Ã±", "ñ"],
  ["Ã—", "×"],
  ["Â·", "·"],
  ["Â°", "°"],
  ["Â€", "€"],
  ["â‚¬", "€"],
  ["â€“", "–"],
  ["â€”", "—"],
  ["â€ž", "„"],
  ["â€œ", "“"],
  ["â€", "”"],
  ["â€™", "’"],
  ["â€˜", "‘"],
  ["â€¦", "…"],
  ["â€¢", "•"],
  ["â†’", "→"],
];

const SUSPICIOUS_ENCODING_PATTERN = /(?:Ã.|Â.|â€|â‚|Ã¢|\uFFFD)/;
const CONTROL_CHARACTER_PATTERN =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, "utf8");

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function applyDirectReplacements(value) {
  let result = value;
  for (const [from, to] of DIRECT_REPLACEMENTS) {
    result = result.split(from).join(to);
  }
  return result;
}

function tryDecodeLatin1AsUtf8(value) {
  if (!SUSPICIOUS_ENCODING_PATTERN.test(value)) return value;

  const bytes = [];
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined || codePoint > 255) return value;
    bytes.push(codePoint);
  }

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(
      Uint8Array.from(bytes),
    );
  } catch {
    return value;
  }
}

function repairEncoding(value) {
  let result = String(value ?? "");

  for (let pass = 0; pass < 3; pass += 1) {
    const before = result;
    result = applyDirectReplacements(result);
    result = tryDecodeLatin1AsUtf8(result);
    result = applyDirectReplacements(result);
    if (result === before) break;
  }

  return result;
}

function safeDbRepair(value) {
  return repairEncoding(value)
    .normalize("NFKC")
    .replace(CONTROL_CHARACTER_PATTERN, "")
    .replace(/\u00AD/g, "")
    .replace(/ﬁ/g, "fi")
    .replace(/ﬂ/g, "fl")
    .replace(/ﬀ/g, "ff")
    .replace(/ﬃ/g, "ffi")
    .replace(/ﬄ/g, "ffl");
}

function detectIssues(value) {
  const text = String(value ?? "");
  const issues = new Set();

  if (SUSPICIOUS_ENCODING_PATTERN.test(text)) issues.add("mojibake");
  if (/\bm\?ssen\b/iu.test(text)) {
    issues.add("recoverable_questionmark");
  }
  if (text.includes("�")) issues.add("replacement_character");
  if (CONTROL_CHARACTER_PATTERN.test(text)) issues.add("control_character");
  CONTROL_CHARACTER_PATTERN.lastIndex = 0;
  if (text.includes("\u00AD")) issues.add("soft_hyphen");
  if (/[ﬁﬂﬀﬃﬄ]/.test(text)) issues.add("ocr_ligature");
  if (/\s{3,}/.test(text) || /[\t\r\n]/.test(text)) {
    issues.add("excess_whitespace");
  }
  if (/(?:\b\p{L}\s+){3,}\p{L}\b/iu.test(text)) {
    issues.add("ocr_spaced_letters");
  }
  if (/([!?.,;:])\1{2,}/.test(text)) issues.add("repeated_punctuation");

  return [...issues];
}

function isSafeAutomaticChange(issues, before, after) {
  if (before === after) return false;

  const unsafeIssues = new Set([
    "replacement_character",
    "excess_whitespace",
    "ocr_spaced_letters",
    "repeated_punctuation",
  ]);

  return issues.every((issue) => !unsafeIssues.has(issue));
}

function csvValue(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

async function loadRows(supabase, config) {
  const rows = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from(config.table)
      .select("*")
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`${config.table}: ${error.message}`);
    }

    const page = data || [];
    rows.push(...page);

    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

loadEnvFile(path.join(process.cwd(), ".env.local"));
loadEnvFile(path.join(process.cwd(), ".env"));

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt in .env.local.",
  );
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const findings = [];
const updates = [];

for (const config of TABLES) {
  console.log(`Prüfe ${config.table} ...`);
  const rows = await loadRows(supabase, config);

  for (const row of rows) {
    const patch = {};

    const columns = config.allStringFields
      ? Object.entries(row)
          .filter(
            ([column, value]) =>
              column !== "id" &&
              column !== "request_id" &&
              typeof value === "string",
          )
          .map(([column]) => column)
      : config.columns;

    for (const column of columns) {
      const before = row[column];
      if (before === null || before === undefined || before === "") continue;

      const issues = detectIssues(before);
      if (issues.length === 0) continue;

      const after = safeDbRepair(before);
      const safeAutomaticChange = isSafeAutomaticChange(issues, before, after);

      findings.push({
        table: config.table,
        id: row.id,
        request_id: row.request_id ?? null,
        column,
        issues,
        before,
        proposed_after: after,
        safe_automatic_change: safeAutomaticChange,
      });

      if (
        APPLY_SAFE &&
        config.allowApplySafe !== false &&
        safeAutomaticChange
      ) {
        patch[column] = after;
      }
    }

    if (APPLY_SAFE && Object.keys(patch).length > 0) {
      const { error } = await supabase
        .from(config.table)
        .update(patch)
        .eq("id", row.id);

      if (error) {
        throw new Error(
          `${config.table}/${row.id} konnte nicht aktualisiert werden: ${error.message}`,
        );
      }

      updates.push({
        table: config.table,
        id: row.id,
        columns: Object.keys(patch),
      });
    }
  }
}

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const desktop = path.join(process.env.USERPROFILE || os.homedir(), "Desktop");
const outputDirectory = fs.existsSync(desktop) ? desktop : process.cwd();
const jsonPath = path.join(
  outputDirectory,
  `handzettel-customer-text-audit-${timestamp}.json`,
);
const csvPath = path.join(
  outputDirectory,
  `handzettel-customer-text-audit-${timestamp}.csv`,
);

fs.writeFileSync(
  jsonPath,
  JSON.stringify(
    {
      created_at: new Date().toISOString(),
      apply_safe: APPLY_SAFE,
      finding_count: findings.length,
      update_count: updates.length,
      updates,
      findings,
    },
    null,
    2,
  ),
  "utf8",
);

const csvHeader = [
  "table",
  "id",
  "request_id",
  "column",
  "issues",
  "safe_automatic_change",
  "before",
  "proposed_after",
].join(",");

const csvRows = findings.map((finding) =>
  [
    finding.table,
    finding.id,
    finding.request_id,
    finding.column,
    finding.issues.join("|"),
    finding.safe_automatic_change,
    finding.before,
    finding.proposed_after,
  ]
    .map(csvValue)
    .join(","),
);

fs.writeFileSync(csvPath, [csvHeader, ...csvRows].join("\r\n"), "utf8");

console.log("");
console.log(`Verdachtsstellen: ${findings.length}`);
console.log(`Sicher aktualisierte Datensätze: ${updates.length}`);
console.log(`JSON: ${jsonPath}`);
console.log(`CSV:  ${csvPath}`);
console.log(
  APPLY_SAFE
    ? "Sichere Encoding-/Steuerzeichenkorrekturen wurden angewendet. OCR-Verdachtsfälle blieben unverändert."
    : "Nur Prüfung. Für sichere DB-Korrekturen erneut mit --apply-safe starten.",
);
