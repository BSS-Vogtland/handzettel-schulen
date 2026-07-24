import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const relativePath = "lib/isbn/merge.ts";
const targetPath = path.join(
  root,
  ...relativePath.split("/"),
);

if (!fs.existsSync(targetPath)) {
  throw new Error(`File not found: ${relativePath}`);
}

const timestamp = new Date()
  .toISOString()
  .replace(/[:.]/g, "-");

const backupPath =
  `${targetPath}.before-free-publisher-priority-${timestamp}.bak`;

let content = fs
  .readFileSync(targetPath, "utf8")
  .replace(/^\uFEFF/, "")
  .replace(/\r\n/g, "\n")
  .replace(/\r/g, "\n");

const pricePriority = `const priority = [
        "VLB",
        "Cornelsen Verlag",
        "Ernst Klett Verlag",
        "Westermann Verlag",
        "C.C. Buchner Verlag",
        "Google Books",
      ];`;

const metadataPriority = `const order = [
    "VLB",
    "Cornelsen Verlag",
    "Ernst Klett Verlag",
    "Westermann Verlag",
    "C.C. Buchner Verlag",
    "Deutsche Nationalbibliothek",
    "Google Books",
    "Open Library",
  ];`;

let priceReplacementCount = 0;
let metadataReplacementCount = 0;

content = content.replace(
  /const priority = \[\s*"VLB",[\s\S]*?"Google Books",\s*\];/g,
  () => {
    priceReplacementCount += 1;
    return pricePriority;
  },
);

content = content.replace(
  /const order = \[\s*"VLB",[\s\S]*?"Open Library",\s*\];/g,
  () => {
    metadataReplacementCount += 1;
    return metadataPriority;
  },
);

const alreadyContainsAllPublishers =
  content.includes('"Ernst Klett Verlag"') &&
  content.includes('"Westermann Verlag"') &&
  content.includes('"C.C. Buchner Verlag"');

if (
  priceReplacementCount === 0 &&
  !alreadyContainsAllPublishers
) {
  throw new Error(
    "No compatible price priority array was found in lib/isbn/merge.ts",
  );
}

fs.copyFileSync(targetPath, backupPath);
fs.writeFileSync(targetPath, content, "utf8");

console.log("ISBN price priorities updated.");
console.log(
  `Price arrays changed: ${priceReplacementCount}`,
);
console.log(
  `Metadata arrays changed: ${metadataReplacementCount}`,
);
console.log(
  `Backup: ${path.relative(root, backupPath)}`,
);