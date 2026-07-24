import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const relativePath =
  "scripts/apply-isbn-book-product-stage1.mjs";

const targetPath = path.join(
  root,
  ...relativePath.split("/"),
);

const timestamp = new Date()
  .toISOString()
  .replace(/[:.]/g, "-");

const backupPath =
  `${targetPath}.before-quick-create-anchor-fix-${timestamp}.bak`;

if (!fs.existsSync(targetPath)) {
  throw new Error(`File not found: ${relativePath}`);
}

let content = fs
  .readFileSync(targetPath, "utf8")
  .replace(/^\uFEFF/, "")
  .replace(/\r\n/g, "\n")
  .replace(/\r/g, "\n");

const correctedAnchor =
  '`    const bookWidthMm = toOptionalInteger(formData.get("bookWidthMm"));';

if (content.includes(correctedAnchor)) {
  console.log(
    "The quick-create FormData anchor is already corrected.",
  );
  process.exit(0);
}

const label =
  '    "quick-create FormData book fields",';

const labelIndex = content.indexOf(label);

if (labelIndex < 0) {
  throw new Error(
    "The quick-create FormData label was not found.",
  );
}

const callStart = content.lastIndexOf(
  "  content = replaceOnce(",
  labelIndex,
);

if (callStart < 0) {
  throw new Error(
    "The replaceOnce call before the FormData label was not found.",
  );
}

const callEndMarker = "\n  );";
const callEndIndex = content.indexOf(
  callEndMarker,
  labelIndex,
);

if (callEndIndex < 0) {
  throw new Error(
    "The end of the FormData replaceOnce call was not found.",
  );
}

const replacement = `  content = replaceOnce(
    content,
\`    const bookWidthMm = toOptionalInteger(formData.get("bookWidthMm"));
    const bookHeightMm = toOptionalInteger(formData.get("bookHeightMm"));
    const bookSizeNote = String(formData.get("bookSizeNote") || "").trim();\`,
\`    const bookWidthMm =
      toOptionalInteger(formData.get("bookWidthMm"));
    const bookHeightMm =
      toOptionalInteger(formData.get("bookHeightMm"));
    const bookSizeNote =
      String(formData.get("bookSizeNote") || "").trim();

    const isBook =
      String(formData.get("isBook") || "") === "true";

    const taxRate =
      normalizeTaxRate(formData.get("taxRate"));

    const bookIsbn10 =
      cleanString(formData.get("bookIsbn10"));

    const bookIsbn13 =
      cleanString(formData.get("bookIsbn13"));

    const bookPublisher =
      cleanString(formData.get("bookPublisher"));

    const bookAuthors =
      parseStringArray(formData.get("bookAuthors"));

    const bookPublishedDate = cleanString(
      formData.get("bookPublishedDate"),
    );

    const bookPriceOriginalGross = isBook
      ? toNumber(
          formData.get("bookPriceOriginalGross"),
          productPrice,
        )
      : null;

    const bookPriceSource = isBook
      ? cleanString(formData.get("bookPriceSource")) ||
        "ISBN-Import"
      : null;

    const requestedConfirmationStatus = cleanString(
      formData.get("bookPriceConfirmationStatus"),
    );

    const bookPriceConfirmationStatus = isBook
      ? requestedConfirmationStatus === "confirmed" ||
        requestedConfirmationStatus === "changed"
        ? requestedConfirmationStatus
        : "pending"
      : "not_required";\`,
    "quick-create FormData book fields",
  );`;

fs.copyFileSync(targetPath, backupPath);

content =
  content.slice(0, callStart) +
  replacement +
  content.slice(
    callEndIndex + callEndMarker.length,
  );

fs.writeFileSync(targetPath, content, "utf8");

console.log(
  "Quick-create FormData anchor corrected successfully.",
);
console.log(
  `Backup: ${path.relative(root, backupPath)}`,
);