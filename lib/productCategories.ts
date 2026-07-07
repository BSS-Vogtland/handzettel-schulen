export type ProductCategoryOption = {
  value: string;
  label: string;
  keywords: string[];
};

export const PRODUCT_CATEGORY_OPTIONS = [
  {
    value: "hefte_bloecke",
    label: "Hefte & BlÃƒÂ¶cke",
    keywords: ["heft", "hefte", "schulheft", "block", "collegeblock", "notizblock"],
  },
  {
    value: "papier_zeichenpapier",
    label: "Papier & Zeichenpapier",
    keywords: ["papier", "zeichenpapier", "zeichenblock", "tonpapier", "kopierpapier"],
  },
  {
    value: "umschlaege",
    label: "UmschlÃƒÂ¤ge",
    keywords: ["umschlag", "umschlÃƒÂ¤ge", "heftumschlag", "buchumschlag"],
  },
  {
    value: "schnellhefter_mappen",
    label: "Schnellhefter & Mappen",
    keywords: ["schnellhefter", "mappe", "mappen", "ordner", "heftring"],
  },
  {
    value: "stifte_schreiben",
    label: "Stifte & Schreiben",
    keywords: ["stift", "stifte", "fÃƒÂ¼ller", "kugelschreiber", "bleistift", "fineliner"],
  },
  {
    value: "malen_basteln",
    label: "Malen & Basteln",
    keywords: ["malen", "basteln", "pinsel", "farbe", "wasserfarbe", "wachsmalstift"],
  },
  {
    value: "kleben_schneiden",
    label: "Kleben & Schneiden",
    keywords: ["kleber", "klebestift", "schere", "schneiden", "tesa", "kleben"],
  },
  {
    value: "mathematik_geometrie",
    label: "Mathematik & Geometrie",
    keywords: ["zirkel", "lineal", "geodreieck", "winkelmesser", "taschenrechner"],
  },
  {
    value: "buecher_arbeitshefte",
    label: "BÃƒÂ¼cher & Arbeitshefte",
    keywords: ["buch", "bÃƒÂ¼cher", "arbeitsheft", "arbeitsbuch", "lernheft"],
  },
  {
    value: "ordnung_organisation",
    label: "Ordnung & Organisation",
    keywords: ["hausaufgabenheft", "kalender", "register", "trennblatt", "etiketten"],
  },
  {
    value: "federmappe_zubehoer",
    label: "Federmappe & ZubehÃƒÂ¶r",
    keywords: ["federmappe", "federtasche", "radiergummi", "spitzer", "linealset"],
  },
  {
    value: "sport_textil",
    label: "Sport & Textil",
    keywords: ["sport", "turnbeutel", "sportsachen", "textil"],
  },
  {
    value: "essen_trinken",
    label: "Essen & Trinken",
    keywords: ["brotdose", "trinkflasche", "trinkbecher", "becher", "flasche"],
  },
] as const;

const PRODUCT_CATEGORY_LABELS = PRODUCT_CATEGORY_OPTIONS.map(
  (category) => category.label
);

function normalizeCategoryKey(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/ÃƒÂ¤/g, "ae")
    .replace(/ÃƒÂ¶/g, "oe")
    .replace(/ÃƒÂ¼/g, "ue")
    .replace(/ÃƒÅ¸/g, "ss")
    .replace(/&/g, " und ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const PRODUCT_CATEGORY_LEGACY_ALIASES: Record<string, string> = {
  heft: "Hefte & BlÃƒÂ¶cke",
  hefte: "Hefte & BlÃƒÂ¶cke",
  schulheft: "Hefte & BlÃƒÂ¶cke",
  block: "Hefte & BlÃƒÂ¶cke",
  bloecke: "Hefte & BlÃƒÂ¶cke",
  collegeblock: "Hefte & BlÃƒÂ¶cke",

  papier: "Papier & Zeichenpapier",
  zeichenpapier: "Papier & Zeichenpapier",
  zeichenblock: "Papier & Zeichenpapier",
  tonpapier: "Papier & Zeichenpapier",

  umschlag: "UmschlÃƒÂ¤ge",
  umschlaege: "UmschlÃƒÂ¤ge",
  heftumschlag: "UmschlÃƒÂ¤ge",
  buchumschlag: "UmschlÃƒÂ¤ge",

  schnellhefter: "Schnellhefter & Mappen",
  mappe: "Schnellhefter & Mappen",
  mappen: "Schnellhefter & Mappen",
  ordner: "Schnellhefter & Mappen",

  stift: "Stifte & Schreiben",
  stifte: "Stifte & Schreiben",
  fueller: "Stifte & Schreiben",
  fuellhalter: "Stifte & Schreiben",
  kugelschreiber: "Stifte & Schreiben",
  bleistift: "Stifte & Schreiben",
  fineliner: "Stifte & Schreiben",

  malen: "Malen & Basteln",
  basteln: "Malen & Basteln",
  pinsel: "Malen & Basteln",
  farbe: "Malen & Basteln",
  wasserfarbe: "Malen & Basteln",

  kleber: "Kleben & Schneiden",
  klebestift: "Kleben & Schneiden",
  schere: "Kleben & Schneiden",

  mathe: "Mathematik & Geometrie",
  mathematik: "Mathematik & Geometrie",
  geometrie: "Mathematik & Geometrie",
  zirkel: "Mathematik & Geometrie",
  lineal: "Mathematik & Geometrie",
  geodreieck: "Mathematik & Geometrie",

  buch: "BÃƒÂ¼cher & Arbeitshefte",
  buecher: "BÃƒÂ¼cher & Arbeitshefte",
  arbeitsheft: "BÃƒÂ¼cher & Arbeitshefte",
  arbeitsbuch: "BÃƒÂ¼cher & Arbeitshefte",

  hausaufgabenheft: "Ordnung & Organisation",
  kalender: "Ordnung & Organisation",
  register: "Ordnung & Organisation",

  federmappe: "Federmappe & ZubehÃƒÂ¶r",
  federtasche: "Federmappe & ZubehÃƒÂ¶r",
  radiergummi: "Federmappe & ZubehÃƒÂ¶r",
  spitzer: "Federmappe & ZubehÃƒÂ¶r",

  sport: "Sport & Textil",
  turnbeutel: "Sport & Textil",

  brotdose: "Essen & Trinken",
  trinkflasche: "Essen & Trinken",
  trinkbecher: "Essen & Trinken",
  becher: "Essen & Trinken",
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
