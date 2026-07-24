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
  `${targetPath}.before-isbn-import-formdata-anchor-fix-${timestamp}.bak`;

if (!fs.existsSync(targetPath)) {
  throw new Error(`File not found: ${relativePath}`);
}

let content = fs
  .readFileSync(targetPath, "utf8")
  .replace(/^\uFEFF/, "")
  .replace(/\r\n/g, "\n")
  .replace(/\r/g, "\n");

const correctedAnchor =
  '`      formData.append("productPrice", parsedPrice.toFixed(2));';

if (content.includes(correctedAnchor)) {
  console.log(
    "The ISBN import FormData anchor is already corrected.",
  );
  process.exit(0);
}

const label =
  '    "ISBN import FormData book fields",';

const labelIndex = content.indexOf(label);

if (labelIndex < 0) {
  throw new Error(
    "The ISBN import FormData label was not found.",
  );
}

const callStart = content.lastIndexOf(
  "  content = replaceOnce(",
  labelIndex,
);

if (callStart < 0) {
  throw new Error(
    "The replaceOnce call before the ISBN FormData label was not found.",
  );
}

const callEndMarker = "\n  );";

const callEndIndex = content.indexOf(
  callEndMarker,
  labelIndex,
);

if (callEndIndex < 0) {
  throw new Error(
    "The end of the ISBN FormData replaceOnce call was not found.",
  );
}

const replacement = `  content = replaceOnce(
    content,
\`      formData.append("productPrice", parsedPrice.toFixed(2));
      formData.append("category", normalizedCategory);\`,
\`      formData.append(
        "productPrice",
        parsedPrice.toFixed(2),
      );

      formData.append("isBook", "true");
      formData.append("taxRate", String(taxRate));
      formData.append(
        "bookIsbn10",
        book.isbn10 || "",
      );
      formData.append(
        "bookIsbn13",
        book.isbn13 || "",
      );
      formData.append(
        "bookPublisher",
        book.publisher || "",
      );
      formData.append(
        "bookAuthors",
        JSON.stringify(book.authors || []),
      );
      formData.append(
        "bookPublishedDate",
        book.publishedDate || "",
      );
      formData.append(
        "bookPriceOriginalGross",
        parsedPrice.toFixed(2),
      );
      formData.append(
        "bookPriceSource",
        book.priceSource ||
          "ISBN-Import - manuell gepruefter Preis",
      );
      formData.append(
        "bookPriceConfirmationStatus",
        "pending",
      );

      formData.append("category", normalizedCategory);\`,
    "ISBN import FormData book fields",
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
  "ISBN import FormData anchor corrected successfully.",
);

console.log(
  `Backup: ${path.relative(root, backupPath)}`,
);