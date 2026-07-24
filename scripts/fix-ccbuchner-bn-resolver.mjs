import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const relativePath =
  "lib/isbn/providers/freePublisherPrices.ts";

const targetPath = path.join(
  root,
  ...relativePath.split("/"),
);

const timestamp = new Date()
  .toISOString()
  .replace(/[:.]/g, "-");

const backupPath =
  `${targetPath}.before-ccbuchner-bn-fix-${timestamp}.bak`;

if (!fs.existsSync(targetPath)) {
  throw new Error(`File not found: ${relativePath}`);
}

let content = fs
  .readFileSync(targetPath, "utf8")
  .replace(/^\uFEFF/, "")
  .replace(/\r\n/g, "\n")
  .replace(/\r/g, "\n");

if (
  content.includes(
    "function getCcBuchnerOrderNumber(",
  )
) {
  console.log(
    "C.C. Buchner BN resolver is already installed.",
  );
  process.exit(0);
}

const configFunctionAnchor =
  "function getPublisherConfig(";

const configFunctionIndex =
  content.indexOf(configFunctionAnchor);

if (configFunctionIndex < 0) {
  throw new Error(
    "getPublisherConfig was not found.",
  );
}

const helper = `function getCcBuchnerOrderNumber(
  isbnValue: string,
) {
  const isbn = normalizeIsbn(isbnValue);

  // Publisher prefix 661:
  // 978-3-661-80041-7 -> order number 80041
  if (/^9783661\\d{6}$/.test(isbn)) {
    return isbn.slice(7, 12);
  }

  // Publisher prefix 7661:
  // 978-3-7661-7970-8 -> order number 7970
  if (/^97837661\\d{5}$/.test(isbn)) {
    return isbn.slice(8, 12);
  }

  return null;
}

`;

content =
  content.slice(0, configFunctionIndex) +
  helper +
  content.slice(configFunctionIndex);

const formattedAnchor =
`  const isbn = normalizeIsbn(isbnValue);
  const formatted = formatKnownIsbn13(isbn);`;

const formattedReplacement =
`  const isbn = normalizeIsbn(isbnValue);
  const formatted = formatKnownIsbn13(isbn);
  const ccBuchnerOrderNumber =
    getCcBuchnerOrderNumber(isbn);`;

if (!content.includes(formattedAnchor)) {
  throw new Error(
    "ISBN configuration initialization was not found.",
  );
}

content = content.replace(
  formattedAnchor,
  formattedReplacement,
);

const blockStart = content.indexOf(
  '      sourceName: "C.C. Buchner Verlag",',
);

if (blockStart < 0) {
  throw new Error(
    "C.C. Buchner configuration was not found.",
  );
}

const nextBlockStart = content.indexOf(
  "\n    },",
  blockStart,
);

if (nextBlockStart < 0) {
  throw new Error(
    "End of C.C. Buchner configuration was not found.",
  );
}

const configBlock = content.slice(
  blockStart,
  nextBlockStart,
);

const oldDirectUrls =
  "      directUrls: () => [],";

const newDirectUrls =
`      directUrls: () =>
        ccBuchnerOrderNumber
          ? [
              \`https://www.ccbuchner.de/bn/\${encodeURIComponent(
                ccBuchnerOrderNumber,
              )}\`,
            ]
          : [],`;

if (!configBlock.includes(oldDirectUrls)) {
  throw new Error(
    "C.C. Buchner directUrls anchor was not found.",
  );
}

const updatedConfigBlock = configBlock.replace(
  oldDirectUrls,
  newDirectUrls,
);

content =
  content.slice(0, blockStart) +
  updatedConfigBlock +
  content.slice(nextBlockStart);

fs.copyFileSync(targetPath, backupPath);
fs.writeFileSync(targetPath, content, "utf8");

console.log(
  "C.C. Buchner BN resolver installed successfully.",
);
console.log(
  `Backup: ${path.relative(root, backupPath)}`,
);