import sharp from "sharp";
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

const sourceLogo = path.join(root, "public", "handzettel-logo.png");

const outputs = {
  appIcon: path.join(root, "app", "icon.png"),
  appleIcon: path.join(root, "app", "apple-icon.png"),
  publicIcon192: path.join(root, "public", "icon-192.png"),
  publicIcon512: path.join(root, "public", "icon-512.png"),
  ogImage: path.join(root, "public", "og-handzettel-schulen.png"),
};

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function createSquareIcon(size, outputPath) {
  const logoBuffer = await sharp(sourceLogo)
    .resize({
      width: Math.round(size * 0.78),
      height: Math.round(size * 0.78),
      fit: "inside",
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: "#FBF7F0",
    },
  })
    .composite([
      {
        input: logoBuffer,
        gravity: "center",
      },
    ])
    .png()
    .toFile(outputPath);
}

async function createOgImage() {
  const width = 1200;
  const height = 630;

  const logoBuffer = await sharp(sourceLogo)
    .resize({
      width: 430,
      height: 210,
      fit: "inside",
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();

  const svg = `
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#FBF7F0"/>
        <stop offset="100%" stop-color="#F4E7D3"/>
      </linearGradient>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="14" stdDeviation="18" flood-color="#102A43" flood-opacity="0.18"/>
      </filter>
    </defs>

    <rect width="${width}" height="${height}" fill="url(#bg)"/>

    <circle cx="1040" cy="90" r="180" fill="#FDE68A" opacity="0.35"/>
    <circle cx="140" cy="560" r="210" fill="#D97706" opacity="0.10"/>

    <rect x="70" y="70" width="1060" height="490" rx="44" fill="#FFFFFF" filter="url(#shadow)"/>
    <rect x="94" y="94" width="1012" height="442" rx="34" fill="#FBF7F0" stroke="#E6D7BF" stroke-width="2"/>

    <text x="120" y="190" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="800" fill="#D97706" letter-spacing="4">
      HANDZETTEL-SCHULEN.DE
    </text>

    <text x="120" y="275" font-family="Arial, Helvetica, sans-serif" font-size="58" font-weight="900" fill="#102A43">
      Schulmaterialliste
    </text>
    <text x="120" y="340" font-family="Arial, Helvetica, sans-serif" font-size="58" font-weight="900" fill="#102A43">
      einfach hochladen
    </text>

    <text x="120" y="405" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="600" fill="#486581">
      Persönlicher Paketwunsch für Eltern.
    </text>

    <rect x="120" y="450" width="360" height="58" rx="29" fill="#D97706"/>
    <text x="155" y="488" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="900" fill="#FFFFFF">
      Liste hochladen
    </text>

    <text x="515" y="487" font-family="Arial, Helvetica, sans-serif" font-size="23" font-weight="700" fill="#102A43">
      Stressfrei. Schnell. Regional.
    </text>
  </svg>`;

  const backgroundBuffer = await sharp(Buffer.from(svg)).png().toBuffer();

  await sharp(backgroundBuffer)
    .composite([
      {
        input: logoBuffer,
        left: 735,
        top: 220,
      },
    ])
    .png()
    .toFile(outputs.ogImage);
}

async function main() {
  if (!(await fileExists(sourceLogo))) {
    throw new Error(`Logo wurde nicht gefunden: ${sourceLogo}`);
  }

  await createSquareIcon(512, outputs.appIcon);
  await createSquareIcon(180, outputs.appleIcon);
  await createSquareIcon(192, outputs.publicIcon192);
  await createSquareIcon(512, outputs.publicIcon512);
  await createOgImage();

  console.log("Brand assets wurden erzeugt:");
  for (const [key, filePath] of Object.entries(outputs)) {
    console.log(`${key}: ${path.relative(root, filePath)}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});