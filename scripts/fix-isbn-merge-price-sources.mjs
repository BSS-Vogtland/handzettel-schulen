import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const relativePath = "lib/isbn/merge.ts";
const targetPath = path.join(root, ...relativePath.split("/"));
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = `${targetPath}.before-price-source-fix-${timestamp}.bak`;

if (!fs.existsSync(targetPath)) {
  throw new Error(`File not found: ${relativePath}`);
}

let content = fs
  .readFileSync(targetPath, "utf8")
  .replace(/^\uFEFF/, "")
  .replace(/\r\n/g, "\n")
  .replace(/\r/g, "\n");

const oldBlock = `    // Verkaufspreise werden bewusst immer manuell geprueft und eingetragen.
    recommendedPrice: null,
    priceCurrency: null,
    priceSource: null,`;

const alternativeOldBlock = `    // Verkaufspreise werden bewusst immer manuell geprüft und eingetragen.
    recommendedPrice: null,
    priceCurrency: null,
    priceSource: null,`;

const newBlock = `    recommendedPrice: (() => {
      const priority = [
        "VLB",
        "Cornelsen Verlag",
        "Google Books",
      ];

      const selected = [...metadataSources]
        .filter(
          (source) =>
            source.recommendedPrice !== null &&
            source.recommendedPrice !== undefined &&
            Number.isFinite(Number(source.recommendedPrice)) &&
            Number(source.recommendedPrice) > 0,
        )
        .sort((left, right) => {
          const leftIndex = priority.indexOf(left.source);
          const rightIndex = priority.indexOf(right.source);

          const leftPriority =
            leftIndex === -1
              ? Number.MAX_SAFE_INTEGER
              : leftIndex;

          const rightPriority =
            rightIndex === -1
              ? Number.MAX_SAFE_INTEGER
              : rightIndex;

          return leftPriority - rightPriority;
        })[0];

      return selected?.recommendedPrice ?? null;
    })(),

    priceCurrency: (() => {
      const priority = [
        "VLB",
        "Cornelsen Verlag",
        "Google Books",
      ];

      const selected = [...metadataSources]
        .filter(
          (source) =>
            source.recommendedPrice !== null &&
            source.recommendedPrice !== undefined &&
            Number.isFinite(Number(source.recommendedPrice)) &&
            Number(source.recommendedPrice) > 0,
        )
        .sort((left, right) => {
          const leftIndex = priority.indexOf(left.source);
          const rightIndex = priority.indexOf(right.source);

          const leftPriority =
            leftIndex === -1
              ? Number.MAX_SAFE_INTEGER
              : leftIndex;

          const rightPriority =
            rightIndex === -1
              ? Number.MAX_SAFE_INTEGER
              : rightIndex;

          return leftPriority - rightPriority;
        })[0];

      return selected
        ? selected.priceCurrency || "EUR"
        : null;
    })(),

    priceSource: (() => {
      const priority = [
        "VLB",
        "Cornelsen Verlag",
        "Google Books",
      ];

      const selected = [...metadataSources]
        .filter(
          (source) =>
            source.recommendedPrice !== null &&
            source.recommendedPrice !== undefined &&
            Number.isFinite(Number(source.recommendedPrice)) &&
            Number(source.recommendedPrice) > 0,
        )
        .sort((left, right) => {
          const leftIndex = priority.indexOf(left.source);
          const rightIndex = priority.indexOf(right.source);

          const leftPriority =
            leftIndex === -1
              ? Number.MAX_SAFE_INTEGER
              : leftIndex;

          const rightPriority =
            rightIndex === -1
              ? Number.MAX_SAFE_INTEGER
              : rightIndex;

          return leftPriority - rightPriority;
        })[0];

      return selected
        ? selected.priceSource || selected.source
        : null;
    })(),`;

if (
  content.includes("source.recommendedPrice !== null") &&
  content.includes("Number.MAX_SAFE_INTEGER")
) {
  console.log("Price source merge is already patched.");
  process.exit(0);
}

let matchedBlock = null;

if (content.includes(oldBlock)) {
  matchedBlock = oldBlock;
} else if (content.includes(alternativeOldBlock)) {
  matchedBlock = alternativeOldBlock;
}

if (!matchedBlock) {
  throw new Error(
    "The manual price suppression block was not found in lib/isbn/merge.ts",
  );
}

fs.copyFileSync(targetPath, backupPath);

content = content.replace(matchedBlock, newBlock);

fs.writeFileSync(targetPath, content, "utf8");

console.log("Updated: lib/isbn/merge.ts");
console.log(`Backup:  ${path.relative(root, backupPath)}`);
console.log("ISBN price source merge fixed successfully.");