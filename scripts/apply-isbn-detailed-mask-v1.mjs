import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const relativePath = "components/AdminIsbnImportTool.tsx";
const targetPath = path.join(root, ...relativePath.split("/"));

if (!fs.existsSync(targetPath)) {
  throw new Error(`Datei nicht gefunden: ${relativePath}`);
}

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = `${targetPath}.before-isbn-detailed-mask-${timestamp}.bak`;

let content = fs
  .readFileSync(targetPath, "utf8")
  .replace(/^\uFEFF/, "")
  .replace(/\r\n/g, "\n")
  .replace(/\r/g, "\n");

const mojibakeReplacements = new Map([
  ["Ã¤", "ä"],
  ["Ã¶", "ö"],
  ["Ã¼", "ü"],
  ["Ã„", "Ä"],
  ["Ã–", "Ö"],
  ["Ãœ", "Ü"],
  ["ÃŸ", "ß"],
  ["â€“", "–"],
  ["â€”", "—"],
  ["â€¦", "…"],
  ["â‚¬", "€"],
  ["Â·", "·"],
  ["Â", ""],
]);

for (const [broken, fixed] of mojibakeReplacements) {
  content = content.split(broken).join(fixed);
}

function replaceOnce(source, from, to, label) {
  const firstIndex = source.indexOf(from);

  if (firstIndex < 0) {
    throw new Error(`Anker nicht gefunden: ${label}`);
  }

  const secondIndex = source.indexOf(from, firstIndex + from.length);

  if (secondIndex >= 0) {
    throw new Error(`Anker ist nicht eindeutig: ${label}`);
  }

  return (
    source.slice(0, firstIndex) +
    to +
    source.slice(firstIndex + from.length)
  );
}

function replaceBetween(source, start, end, replacement, label) {
  const startIndex = source.indexOf(start);

  if (startIndex < 0) {
    throw new Error(`Startanker nicht gefunden: ${label}`);
  }

  const endIndex = source.indexOf(end, startIndex + start.length);

  if (endIndex < 0) {
    throw new Error(`Endanker nicht gefunden: ${label}`);
  }

  return (
    source.slice(0, startIndex) +
    replacement +
    source.slice(endIndex)
  );
}

if (!content.includes("type SourceDetail =")) {
  content = replaceOnce(
    content,
    "type BookData = {",
    `type SourceDetail = {
  name: string;
  sourceId: string | null;
  sourceUrl: string | null;
  coverFound: boolean;
  coverUrl: string | null;
};

type BookData = {`,
    "SourceDetail-Typ",
  );
}

if (!content.includes("  edition: string | null;")) {
  content = replaceOnce(
    content,
    "  publishedDate: string | null;\n  description: string | null;",
    "  publishedDate: string | null;\n  edition: string | null;\n  description: string | null;",
    "edition im BookData-Typ",
  );
}

if (!content.includes("  availability: string | null;")) {
  content = replaceOnce(
    content,
    "  priceSource: string | null;\n  sources: string[];",
    "  priceSource: string | null;\n  availability: string | null;\n  sources: string[];\n  sourceDetails: SourceDetail[];",
    "availability und sourceDetails im BookData-Typ",
  );
}

if (!content.includes("function formatCurrency(")) {
  content = replaceOnce(
    content,
    `function parsePrice(value: string) {
  const normalized = value.trim().replace(/\\s/g, "").replace(",", ".");
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : null;
}
`,
    `function parsePrice(value: string) {
  const normalized = value.trim().replace(/\\s/g, "").replace(",", ".");
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : null;
}

function formatCurrency(value: number | null, currency = "EUR") {
  if (value === null || !Number.isFinite(value)) {
    return "Nicht gefunden";
  }

  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency,
  }).format(value);
}

function getAvailabilityLabel(value: string | null) {
  if (!value) {
    return "Nicht ermittelt";
  }

  const normalized = value.toLowerCase();

  if (normalized.includes("instock")) return "Lieferbar";
  if (normalized.includes("outofstock")) return "Nicht lieferbar";
  if (normalized.includes("preorder")) return "Vorbestellbar";

  return value;
}

function getPriceStatus(book: BookData) {
  if (book.recommendedPrice === null) {
    return {
      label: "Preis fehlt",
      description: "Keine belastbare Preisangabe gefunden.",
      className: "border-[#F1D1A8] bg-[#FFF8EE] text-[#8A4A1F]",
    };
  }

  const source = normalizeText(book.priceSource);

  if (source.includes("offizielle produktseite") || source.includes("verlag")) {
    return {
      label: "Offizieller Verlagspreis",
      description: "Preis wurde auf einer offiziellen Verlagsseite gefunden.",
      className: "border-[#BFE3CD] bg-[#F0FFF6] text-[#2F7D50]",
    };
  }

  return {
    label: "Preis gefunden",
    description: "Preisquelle ist vorhanden und wird zur Kontrolle angezeigt.",
    className: "border-[#D6E7EF] bg-[#F5FAFD] text-[#12395F]",
  };
}
`,
    "Preis- und Verfügbarkeitshelfer",
  );
}

if (!content.includes("function StatusCard(")) {
  const metadataEnd = `function MetadataItem({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return (
    <div className="rounded-2xl border border-[#E8DED2] bg-white px-4 py-3">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-[#A75B28]">
        {label}
      </p>
      <p className="mt-1 text-sm font-bold leading-6 text-[#102A43]">{value}</p>
    </div>
  );
}
`;

  const metadataWithStatus = `${metadataEnd}
function StatusCard({
  label,
  value,
  description,
  className,
}: {
  label: string;
  value: string;
  description: string;
  className: string;
}) {
  return (
    <div className={\`rounded-[24px] border p-4 \${className}\`}>
      <p className="text-xs font-black uppercase tracking-[0.14em] opacity-80">
        {label}
      </p>
      <p className="mt-2 text-base font-black leading-6">{value}</p>
      <p className="mt-1 text-xs font-semibold leading-5 opacity-80">
        {description}
      </p>
    </div>
  );
}
`;

  content = replaceOnce(
    content,
    metadataEnd,
    metadataWithStatus,
    "StatusCard-Komponente",
  );
}

content = replaceOnce(
  content,
  `          <h2 className="text-2xl font-black text-[#102A43]">
            Buch anhand der ISBN finden
          </h2>

          <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#52616F]">
            Gib eine ISBN-10 oder ISBN-13 ein. Grunddaten kommen vorrangig aus
            der Deutschen Nationalbibliothek. Cover werden zusätzlich über
            Wikimedia Commons und Google Books gesucht. Nicht eindeutig nutzbare
            Bilder werden nur als Recherchehinweis angezeigt.
          </p>`,
  `          <h2 className="text-2xl font-black text-[#102A43]">
            Buchdaten, Preis und Produktidentität ermitteln
          </h2>

          <p className="mt-2 max-w-4xl text-sm font-semibold leading-6 text-[#52616F]">
            Die Suche führt bibliografische Daten, kostenlose Verlagspreise,
            Coverquellen und die ISBN-Dublettenprüfung zusammen. Das Ergebnis
            bleibt vor der Produktanlage vollständig kontrollierbar.
          </p>`,
  "Suchbereich-Überschrift",
);

const heroStart = `          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">`;
const heroEnd = `          {existingProduct ? (`;

const newHero = `          <div className="rounded-[28px] border border-[#D6E7EF] bg-[#F5FAFD] p-5 sm:p-6">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0">
                <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-[#2F7D50] ring-1 ring-[#BFE3CD]">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Buch gefunden
                </div>

                <h2 className="mt-4 text-2xl font-black leading-tight text-[#102A43] sm:text-3xl">
                  {book.title || productName || "Buchtitel nicht ermittelt"}
                </h2>

                {book.subtitle ? (
                  <p className="mt-2 text-base font-bold leading-7 text-[#52616F]">
                    {book.subtitle}
                  </p>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold text-[#52616F]">
                  {book.publisher ? <span>Verlag: {book.publisher}</span> : null}
                  {book.authors.length > 0 ? (
                    <span>Autor(en): {book.authors.join(", ")}</span>
                  ) : null}
                  <span>ISBN: {book.isbn13 || book.isbn10}</span>
                  <span>
                    Verfügbarkeit: {getAvailabilityLabel(book.availability)}
                  </span>
                </div>
              </div>

              <div className="flex max-w-xl flex-wrap gap-2">
                {book.sources.map((source) => (
                  <span
                    key={source}
                    className="rounded-full border border-[#D6E7EF] bg-white px-3 py-1 text-xs font-black text-[#12395F]"
                  >
                    {source}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="my-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <StatusCard
              label="Dublettenprüfung"
              value={
                existingProduct
                  ? "Exakte ISBN vorhanden"
                  : "Keine exakte ISBN-Dublette"
              }
              description={
                existingProduct
                  ? "Der Import ist gesperrt. Öffne das vorhandene Produkt."
                  : "Diese Ausgabe ist noch nicht im Produktkatalog gespeichert."
              }
              className={
                existingProduct
                  ? "border-[#F0C7C7] bg-[#FFF5F5] text-[#B5282D]"
                  : "border-[#BFE3CD] bg-[#F0FFF6] text-[#2F7D50]"
              }
            />

            <StatusCard
              label="Gefundener Preis"
              value={formatCurrency(
                book.recommendedPrice,
                book.priceCurrency || "EUR",
              )}
              description={getPriceStatus(book).description}
              className={getPriceStatus(book).className}
            />

            <StatusCard
              label="Händlerbestätigung"
              value="Nach Import ausstehend"
              description="Preis und Umsatzsteuer werden später bestätigt oder geändert."
              className="border-[#F1D1A8] bg-[#FFF8EE] text-[#8A4A1F]"
            />

            <StatusCard
              label="Google-Produktidentität"
              value={
                book.isbn13 && book.publisher
                  ? "Grunddaten vollständig"
                  : "Noch unvollständig"
              }
              description={
                book.isbn13 && book.publisher
                  ? "Verlag wird als Marke und ISBN-13 als GTIN verwendet."
                  : "Für den Merchant-Export fehlen Verlag oder ISBN-13."
              }
              className={
                book.isbn13 && book.publisher
                  ? "border-[#BFE3CD] bg-[#F0FFF6] text-[#2F7D50]"
                  : "border-[#F1D1A8] bg-[#FFF8EE] text-[#8A4A1F]"
              }
            />
          </div>

`;

content = replaceBetween(
  content,
  heroStart,
  heroEnd,
  newHero,
  "ausführlicher Buchkopf",
);

content = replaceOnce(
  content,
  `              <div>
                <h3 className="text-xl font-black text-[#102A43]">
                  Produktdaten
                </h3>
                <p className="mt-1 text-sm font-semibold leading-6 text-[#52616F]">
                  Alle Felder können vor dem Speichern angepasst werden. SKU,
                  SEO-Daten und Matching-Keywords erzeugt die vorhandene
                  Produktanlage automatisch. Buchcover bleiben unverändert und
                  erhalten keinen KI-Hintergrund.
                </p>
              </div>`,
  `              <div className="rounded-[24px] border border-[#D6E7EF] bg-[#F5FAFD] p-4">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[#12395F]">
                  Buchidentität und Shopdaten
                </p>
                <h3 className="mt-2 text-xl font-black text-[#102A43]">
                  Titel, Preis und bibliografische Angaben prüfen
                </h3>
                <p className="mt-1 text-sm font-semibold leading-6 text-[#52616F]">
                  Der Produktname bleibt editierbar. Verlag und ISBN werden
                  später für Google korrekt als Marke und GTIN verwendet;
                  Handzettel-Schulen.de bleibt ausschließlich Verkäufer.
                </p>
              </div>`,
  "Produktdaten-Kopf",
);

const leftPanelEnd = `            </div>

            <form onSubmit={handleImport} className="grid gap-5">`;

if (!content.includes("Gefundene Datenquellen")) {
  content = replaceOnce(
    content,
    leftPanelEnd,
    `              <div className="mt-3 rounded-[24px] border border-[#E8DED2] bg-[#FBF7F0] p-4">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[#A75B28]">
                  Gefundene Datenquellen
                </p>

                <div className="mt-3 grid gap-2">
                  {(book.sourceDetails || []).map((source, index) => (
                    <div
                      key={\`\${source.name}-\${source.sourceId || index}\`}
                      className="rounded-2xl border border-[#E8DED2] bg-white px-3 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-black text-[#102A43]">
                            {source.name}
                          </p>
                          <p className="mt-1 text-[11px] font-semibold text-[#7B8792]">
                            {source.coverFound
                              ? "Buchdaten und/oder Cover gefunden"
                              : "Buchdaten gefunden"}
                          </p>
                        </div>

                        {source.sourceUrl ? (
                          <a
                            href={source.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-xl bg-[#F5FAFD] p-2 text-[#12395F] transition hover:bg-[#E8F2F8]"
                            aria-label={\`\${source.name} öffnen\`}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <form onSubmit={handleImport} className="grid gap-5">`,
    "Datenquellen-Panel",
  );
}

content = replaceOnce(
  content,
  `              <div className="rounded-[24px] border border-[#F1D1A8] bg-[#FFF8EE] p-4">
                <p className="text-sm font-black text-[#8A4A1F]">
                  Händlerbestätigung nach dem Import
                  ausstehend
                </p>

                <p className="mt-1 text-xs font-semibold leading-5 text-[#52616F]">
                  Das Buch wird sofort aktiv angelegt und kann
                  bereits gelistet und verkauft werden. In der
                  bestehenden Voranfrage muss die Buchhandlung
                  den Preis und den Umsatzsteuersatz später
                  bestätigen oder korrigieren.
                </p>

                {book.priceSource ? (
                  <p className="mt-2 text-xs font-black text-[#102A43]">
                    Preisquelle: {book.priceSource}
                  </p>
                ) : null}
              </div>`,
  `              <div className="rounded-[24px] border border-[#F1D1A8] bg-[#FFF8EE] p-4">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[#A75B28]">
                  Preis, Steuer und Händlerprüfung
                </p>
                <p className="mt-2 text-sm font-black text-[#8A4A1F]">
                  Händlerbestätigung nach dem Import ausstehend
                </p>

                <p className="mt-1 text-xs font-semibold leading-5 text-[#52616F]">
                  Das Buch wird sofort aktiv und verkaufbar angelegt. Die
                  Buchhandlung bestätigt oder korrigiert später pro Position
                  den Verkaufspreis und den Umsatzsteuersatz. Änderungen gelten
                  nur für zukünftige Verkäufe.
                </p>

                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-2xl border border-[#F1D1A8] bg-white px-3 py-3">
                    <p className="text-xs font-black text-[#102A43]">
                      Preisquelle
                    </p>
                    <p className="mt-1 text-xs font-semibold leading-5 text-[#52616F]">
                      {book.priceSource || "Manuelle Eingabe erforderlich"}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-[#F1D1A8] bg-white px-3 py-3">
                    <p className="text-xs font-black text-[#102A43]">
                      Lieferstatus
                    </p>
                    <p className="mt-1 text-xs font-semibold leading-5 text-[#52616F]">
                      {getAvailabilityLabel(book.availability)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-[24px] border border-[#BFE3CD] bg-[#F0FFF6] p-4">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[#2F7D50]">
                  Google-Merchant-Schutz
                </p>
                <p className="mt-2 text-sm font-black text-[#102A43]">
                  Verlag ist die Marke – Handzettel-Schulen.de ist der Verkäufer
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <MetadataItem
                    label="Marke / Brand"
                    value={book.publisher || "Fehlt"}
                  />
                  <MetadataItem
                    label="GTIN"
                    value={book.isbn13 || "Fehlt"}
                  />
                  <MetadataItem
                    label="Verkäufer"
                    value="Handzettel-Schulen.de"
                  />
                  <MetadataItem label="MPN" value="Nicht übermitteln" />
                </div>
              </div>`,
  "Händler- und Merchant-Block",
);

content = content.replace(
  "In Produktkatalog übernehmen",
  "Buch aktiv im Produktkatalog anlegen",
);

fs.copyFileSync(targetPath, backupPath);
fs.writeFileSync(targetPath, content, "utf8");

console.log("ISBN-Detailmaske wurde erfolgreich eingebaut.");
console.log(`Backup: ${path.relative(root, backupPath)}`);
console.log(`Aktualisiert: ${relativePath}`);