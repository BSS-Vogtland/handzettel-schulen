export type ProductCategoryOption = {
  value: string;
  label: string;
  keywords: string[];
};

export const PRODUCT_CATEGORY_OPTIONS = [
  {
    value: "abheften_ordnen",
    label: "Abheften & Ordnen",
    keywords: ["Abheften", "Ordnen", "Schnellhefter", "Ringhefter", "Ringbuch", "Ordner", "Mappe", "Mappen"],
  },
  {
    value: "bloecke",
    label: "Blöcke",
    keywords: ["Block", "Blöcke", "Schreibblock", "Schreibblöcke", "Collegeblock", "Löschblattblock"],
  },
  {
    value: "buecher_arbeitshefte",
    label: "Bücher & Arbeitshefte",
    keywords: ["Buch", "Bücher", "Arbeitsheft", "Arbeitshefte", "Arbeitsbuch", "Lernen"],
  },
  {
    value: "etiketten_beschriftung",
    label: "Etiketten & Beschriftung",
    keywords: ["Etiketten", "Beschriftung", "Marker", "Edding"],
  },
  {
    value: "federmappen_zubehoer",
    label: "Federmappen & Zubehör",
    keywords: ["Federmäppchen", "Federmappe", "Federtasche", "Etui", "Radiergummi", "Spitzer", "Tinte", "Tintenkiller", "Mine"],
  },
  {
    value: "hefte",
    label: "Hefte",
    keywords: ["Heft", "Hefte", "Schulheft", "Schulhefte", "Schreibheft", "Schreiblernheft", "Notenheft", "Mitteilungsheft", "Löschblattheft"],
  },
  {
    value: "hygiene",
    label: "Hygiene",
    keywords: ["Hygiene", "Badehandtuch", "Handtuch", "Badekappe"],
  },
  {
    value: "kleben_schneiden",
    label: "Kleben & Schneiden",
    keywords: ["Klebestift", "Kleber", "Pritt", "Schere", "Bastelschere", "Klebeband"],
  },
  {
    value: "kunst_basteln",
    label: "Kunst & Basteln",
    keywords: ["Kunst", "Basteln", "Knete", "Buntpapier", "Tonzeichenkarton", "Mischpalette", "Malunterlage", "Zeichenbox", "Kunstbox"],
  },
  {
    value: "malen_farben",
    label: "Malen & Farben",
    keywords: ["Malen", "Farben", "Schulmalfarben", "Deckfarbenkasten", "Deckweiß", "Näpfchenfarben", "Tubenfarben", "Buntstifte", "Filzstifte", "Wachsmalstifte"],
  },
  {
    value: "mathematik_geometrie",
    label: "Mathematik & Geometrie",
    keywords: ["Mathematik", "Geometrie", "Lineal", "Limeal", "Geodreieck", "Dreieck", "Zirkel", "Taschenrechner", "Kurvenschablone", "Parabelschablone"],
  },
  {
    value: "papier_zeichenpapier",
    label: "Papier & Zeichenpapier",
    keywords: ["Papier", "Zeichenpapier", "Zeichenblock", "Zeichenblöcke", "Tonpapier", "Millimeterpapier", "Buntpapier"],
  },
  {
    value: "pinsel",
    label: "Pinsel",
    keywords: ["Pinsel", "Flachpinsel", "Rundpinsel", "Borstenpinsel", "Schulpinsel", "Spitzpinsel", "Pinselsortiment"],
  },
  {
    value: "ranzen_taschen",
    label: "Ranzen & Taschen",
    keywords: ["Schulranzen", "Schulrucksack", "Schulranzenset", "Ranzenzubehör", "Sporttasche", "Turnbeutel"],
  },
  {
    value: "schreiben_stifte",
    label: "Schreiben & Stifte",
    keywords: ["Schreiben", "Stifte", "Stift", "Bleistift", "Dreikantbleistift", "Buntstift", "Füller", "Füllfederhalter", "Schreibfüller", "Fineliner", "Folienstift", "Kugelschreiber", "Ghost Pen"],
  },
  {
    value: "sport",
    label: "Sport",
    keywords: ["Sport", "Sportbeutel", "Sporttasche", "Turnbeutel"],
  },
  {
    value: "technik_kopfhoerer",
    label: "Technik & Kopfhörer",
    keywords: ["Technik", "Kopfhörer", "Kopfhoerer", "Stereo headset", "Headset"],
  },
  {
    value: "umschlaege",
    label: "Umschläge",
    keywords: ["Umschlag", "Umschläge", "Buchumschlag", "Heftumschlag", "Hausaufgaben Heft Umschlag", "Buchfolie", "Hülle"],
  },
  {
    value: "verpflegung",
    label: "Verpflegung",
    keywords: ["Becher", "Becher mit Deckel", "Trinkbecher", "Trinkflasche", "Brotdose"],
  },
] as const;

const PRODUCT_CATEGORY_LABELS = PRODUCT_CATEGORY_OPTIONS.map(
  (category) => category.label
);

function normalizeCategoryKey(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/&/g, " und ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const PRODUCT_CATEGORY_LEGACY_ALIASES: Record<string, string> = {
  "umschlag": "Umschläge",
  "umschlaege": "Umschläge",
  "buchumschlag": "Umschläge",
  "heftumschlag": "Umschläge",

  "heft": "Hefte",
  "hefte": "Hefte",
  "schulheft": "Hefte",
  "schulhefte": "Hefte",
  "schreibheft": "Hefte",
  "notenheft": "Hefte",

  "block": "Blöcke",
  "bloecke": "Blöcke",
  "schreibblock": "Blöcke",
  "schreibbloecke": "Blöcke",

  "ringbuch": "Abheften & Ordnen",
  "ringhefter": "Abheften & Ordnen",
  "schnellhefter": "Abheften & Ordnen",
  "mappe": "Abheften & Ordnen",
  "mappen": "Abheften & Ordnen",
  "ordner": "Abheften & Ordnen",

  "flachpinsel": "Pinsel",
  "rundpinsel": "Pinsel",
  "borstenpinsel": "Pinsel",
  "schulpinsel": "Pinsel",
  "pinsel": "Pinsel",

  "malen": "Malen & Farben",
  "farben": "Malen & Farben",
  "schulmalfarben": "Malen & Farben",

  "basteln": "Kunst & Basteln",
  "kunst": "Kunst & Basteln",

  "klebestift": "Kleben & Schneiden",
  "schere": "Kleben & Schneiden",

  "stifte": "Schreiben & Stifte",
  "schreiben": "Schreiben & Stifte",
  "bleistift": "Schreiben & Stifte",
  "buntstift": "Schreiben & Stifte",
  "buntstifte": "Schreiben & Stifte",
  "fueller": "Schreiben & Stifte",
  "fuellfederhalter": "Schreiben & Stifte",
  "schreibfueller": "Schreiben & Stifte",
  "fineliner": "Schreiben & Stifte",

  "mathematik": "Mathematik & Geometrie",
  "geometrie": "Mathematik & Geometrie",
  "zirkel": "Mathematik & Geometrie",
  "taschenrechner": "Mathematik & Geometrie",
  "dreieck": "Mathematik & Geometrie",

  "papier": "Papier & Zeichenpapier",
  "zeichnen": "Papier & Zeichenpapier",
  "zeichenbloecke": "Papier & Zeichenpapier",

  "federmappe": "Federmappen & Zubehör",
  "federtasche": "Federmappen & Zubehör",
  "federmäppchen": "Federmappen & Zubehör",
  "radiergummi": "Federmappen & Zubehör",
  "spitzer": "Federmappen & Zubehör",

  "sport": "Sport",
  "sporttasche": "Sport",
  "schulranzen": "Ranzen & Taschen",
  "schulrucksack": "Ranzen & Taschen",
  "ranzenzubehoer": "Ranzen & Taschen",

  "kopfhoerer": "Technik & Kopfhörer",
  "kopfhörer": "Technik & Kopfhörer",
  "stereo_headset": "Technik & Kopfhörer",

  "becher_mit_deckel": "Verpflegung",
  "becher": "Verpflegung",
};

export function normalizeProductCategory(value: unknown) {
  const raw = String(value || "").trim();

  if (!raw) return "";

  const exactLabel = PRODUCT_CATEGORY_LABELS.find((label) => label === raw);
  if (exactLabel) return exactLabel;

  const normalized = normalizeCategoryKey(raw);

  const byValue = PRODUCT_CATEGORY_OPTIONS.find(
    (category) => category.value === normalized
  );

  if (byValue) return byValue.label;

  return PRODUCT_CATEGORY_LEGACY_ALIASES[normalized] || "";
}

export function isAllowedProductCategory(value: unknown) {
  return Boolean(normalizeProductCategory(value));
}
