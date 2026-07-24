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
  `${targetPath}.before-ccbuchner-title-fix-${timestamp}.bak`;

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
    "function buildPublisherProductName(",
  )
) {
  console.log(
    "Publisher product name resolver is already installed.",
  );
  process.exit(0);
}

function replaceOnce(source, from, to, label) {
  const firstIndex = source.indexOf(from);

  if (firstIndex < 0) {
    throw new Error(`Anchor not found: ${label}`);
  }

  const secondIndex = source.indexOf(
    from,
    firstIndex + from.length,
  );

  if (secondIndex >= 0) {
    throw new Error(`Anchor is not unique: ${label}`);
  }

  return (
    source.slice(0, firstIndex) +
    to +
    source.slice(firstIndex + from.length)
  );
}

const helperAnchor =
  "function getPublisherConfig(";

const helperIndex = content.indexOf(helperAnchor);

if (helperIndex < 0) {
  throw new Error(
    "getPublisherConfig was not found.",
  );
}

const helperCode = `function cleanPublisherProductTitle(
  value: string | null,
) {
  return String(value || "")
    .replace(
      /\\s*\\|\\s*(?:C\\.?\\s*C\\.?\\s*Buchner|C\\.C\\. Buchner Verlag).*$/i,
      "",
    )
    .replace(/\\s+/g, " ")
    .trim();
}

function buildPublisherProductName(input: {
  sourceName: string;
  html: string;
  fallbackTitle: string | null;
}) {
  const fallbackTitle =
    cleanPublisherProductTitle(input.fallbackTitle);

  if (input.sourceName !== "C.C. Buchner Verlag") {
    return fallbackTitle || null;
  }

  const text = htmlToText(input.html);

  const lines = text
    .split("\\n")
    .map((line) => line.replace(/\\s+/g, " ").trim())
    .filter(Boolean);

  if (fallbackTitle) {
    const combinedLine = lines.find((line) => {
      const normalizedLine = line
        .replace(/\\s+[\\u2013\\u2014-]\\s+/g, " - ")
        .trim();

      const suffix = \` - \${fallbackTitle}\`;

      return (
        normalizedLine.endsWith(suffix) &&
        normalizedLine.length > suffix.length &&
        normalizedLine.length <= 180
      );
    });

    if (combinedLine) {
      return combinedLine
        .replace(/\\s+[\\u2013\\u2014-]\\s+/g, " \\u2013 ")
        .trim();
    }
  }

  const seriesLabelIndex = lines.findIndex(
    (line) => line.toLowerCase() === "reihe:",
  );

  const seriesName =
    seriesLabelIndex >= 0
      ? String(lines[seriesLabelIndex + 1] || "").trim()
      : "";

  if (
    seriesName &&
    fallbackTitle &&
    !fallbackTitle
      .toLowerCase()
      .includes(seriesName.toLowerCase())
  ) {
    return \`\${seriesName} \\u2013 \${fallbackTitle}\`;
  }

  return fallbackTitle || seriesName || null;
}

`;

content =
  content.slice(0, helperIndex) +
  helperCode +
  content.slice(helperIndex);

content = replaceOnce(
  content,
`      sourceUrl: page.finalUrl,
      title: analysis.title,`,
`      sourceUrl: page.finalUrl,
      title: buildPublisherProductName({
        sourceName: config.sourceName,
        html: page.html,
        fallbackTitle: analysis.title,
      }),`,
  "direct publisher page title",
);

content = replaceOnce(
  content,
`        sourceUrl: productPage.finalUrl,
        title: analysis.title,`,
`        sourceUrl: productPage.finalUrl,
        title: buildPublisherProductName({
          sourceName: config.sourceName,
          html: productPage.html,
          fallbackTitle: analysis.title,
        }),`,
  "resolved product page title",
);

content = replaceOnce(
  content,
`        sourceUrl: searchPage.finalUrl,
        title: searchAnalysis.title,`,
`        sourceUrl: searchPage.finalUrl,
        title: buildPublisherProductName({
          sourceName: config.sourceName,
          html: searchPage.html,
          fallbackTitle: searchAnalysis.title,
        }),`,
  "publisher search page title",
);

fs.copyFileSync(targetPath, backupPath);
fs.writeFileSync(targetPath, content, "utf8");

console.log(
  "C.C. Buchner product name resolver installed.",
);

console.log(
  `Backup: ${path.relative(root, backupPath)}`,
);