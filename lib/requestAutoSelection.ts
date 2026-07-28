import {
  findExactBookIsbnMatch,
  getRequestItemBookIdentity,
} from "@/lib/requestBookIdentity";

export const AUTO_SELECTION_MIN_GENERIC_SCORE = 85;
export const AUTO_SELECTION_MIN_SCORE_GAP = 3;
export const AUTO_SELECTION_GUARD_VERSION =
  "request-auto-selection-v1-strict-product-identity";

export type AutomaticSelectionItemLike = {
  id: string;
  raw_text?: string | null;
  normalized_name?: string | null;
  product_type?: string | null;
  category?: string | null;
  format?: string | null;
  color?: string | null;
  lineature?: string | null;
  notes?: string | null;
  status?: string | null;
  admin_resolution_status?: string | null;
  is_book?: boolean | null;
  book_isbn10?: string | null;
  book_isbn13?: string | null;
};

export type AutomaticSelectionMatchLike = {
  id: string;
  request_item_id: string;
  product_id: string | null;
  product_name?: string | null;
  product_sku?: string | null;
  match_score?: number | string | null;
  match_reason?: string | null;
};

export type AutomaticSelectionProductLike = {
  id: string;
  name?: string | null;
  product_name?: string | null;
  title?: string | null;
  sku?: string | null;
  product_sku?: string | null;
  category?: string | null;
  product_type?: string | null;
  format?: string | null;
  color?: string | null;
  lineature?: string | null;
  active?: boolean | null;
  status?: string | null;
  is_book?: boolean | null;
  ean?: string | null;
  book_isbn10?: string | null;
  book_isbn13?: string | null;
};

export type AutomaticSelectionDecision<
  TMatch extends AutomaticSelectionMatchLike,
> = {
  kind: "exact_isbn" | "generic" | "none";
  match: TMatch | null;
  code:
    | "exact_isbn"
    | "generic_safe"
    | "item_blocked"
    | "book_exact_isbn_not_unique"
    | "no_compatible_generic_match"
    | "generic_score_below_minimum"
    | "generic_score_gap_too_small";
  topScore: number | null;
  secondScore: number | null;
};

const BLOCKED_STATUSES = new Set([
  "not_needed",
  "customer_supplies_self",
  "covered_by_alternative",
  "resolved",
  "done",
  "ignored",
  "admin_resolved",
  "manually_resolved",
  "manual_admin_added",
  "manual_review",
  "needs_review",
  "rejected",
  "dismissed",
  "skipped",
]);

const COLOR_TYPES = new Set([
  "umschlag",
  "schnellhefter",
  "ringhefter",
  "mappe",
]);

const FORMAT_TYPES = new Set([
  "heft",
  "hausaufgabenheft",
  "umschlag",
  "schnellhefter",
  "ringhefter",
  "mappe",
  "schreibblock",
  "zeichenblock",
  "zeichenkarton",
]);

const LINEATURE_TYPES = new Set([
  "heft",
  "hausaufgabenheft",
  "schreibblock",
]);

const TYPE_RULES: Array<[string, string[]]> = [
  [
    "umschlag",
    [
      "umschlag",
      "umschlaege",
      "hefthuelle",
      "hefthuellen",
      "buchhuelle",
      "buchhuellen",
      "huelle",
      "huellen",
    ],
  ],
  [
    "hausaufgabenheft",
    [
      "hausaufgabenheft",
      "hausaufgaben",
      "aufgabenheft",
      "ha heft",
      "haheft",
      "ha hft",
    ],
  ],
  [
    "ringhefter",
    [
      "ringhefter",
      "ring hefter",
      "niederhalter",
      "2 ringe",
      "zwei ringe",
    ],
  ],
  [
    "schnellhefter",
    [
      "schnellhefter",
      "papphefter",
      "papp hefter",
      "papp-hefter",
    ],
  ],
  [
    "mappe",
    [
      "mappe",
      "mappen",
      "sammelmappe",
      "eckspanner",
      "gummizugmappe",
      "zeichenmappe",
    ],
  ],
  [
    "schreibblock",
    [
      "schreibblock",
      "collegeblock",
      "notizblock",
    ],
  ],
  [
    "zeichenblock",
    [
      "zeichenblock",
      "malblock",
      "skizzenblock",
    ],
  ],
  [
    "zeichenkarton",
    [
      "zeichenkarton",
      "tonkarton",
      "fotokarton",
    ],
  ],
  [
    "farbkasten",
    [
      "farbkasten",
      "wasserfarbkasten",
      "deckfarbkasten",
      "malkasten",
      "wasserfarben",
    ],
  ],
  [
    "klebestift",
    [
      "klebestift",
      "leimstift",
      "kleber",
    ],
  ],
  [
    "spitzer",
    [
      "spitzer",
      "anspitzer",
      "spitzerdose",
      "dosenspitzer",
      "auffangbehaelter",
      "auffangbehalter",
    ],
  ],
  [
    "lineal",
    [
      "lineal",
    ],
  ],
  [
    "schere",
    [
      "schere",
    ],
  ],
  [
    "buntstifte",
    [
      "buntstifte",
      "buntstift",
      "farbstifte",
      "farbstift",
    ],
  ],
  [
    "filzstifte",
    [
      "filzstifte",
      "filzstift",
      "fasermaler",
    ],
  ],
  [
    "bleistift",
    [
      "bleistift",
    ],
  ],
  [
    "radiergummi",
    [
      "radiergummi",
      "radierer",
    ],
  ],
  [
    "heft",
    [
      "rechenheft",
      "rechenh",
      "matheheft",
      "mathe heft",
      "math heft",
      "schreibheft",
      "schreibh",
      "schulheft",
      "arbeitsheft",
      "heft",
      "hefte",
    ],
  ],
];

function toNumber(value: unknown, fallback = 0) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return fallback;
  }

  if (typeof value === "number") {
    return Number.isFinite(value)
      ? value
      : fallback;
  }

  const parsed = Number(
    String(value).replace(",", "."),
  );

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

export function normalizeAutomaticSelectionText(
  value: unknown,
) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/Ã¤/g, "ae")
    .replace(/Ã¶/g, "oe")
    .replace(/Ã¼/g, "ue")
    .replace(/ÃŸ/g, "ss")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesTerm(
  text: string,
  term: string,
) {
  return ` ${text} `.includes(
    ` ${normalizeAutomaticSelectionText(term)} `,
  );
}

export function classifyAutomaticMaterialType(
  value: unknown,
) {
  const text =
    normalizeAutomaticSelectionText(value);

  if (!text) {
    return null;
  }

  /*
   * AUTO_SELECTION_RINGHEFTER_CLASSIFICATION_V1
   *
   * Der allgemeine Bestandteil "hefter" darf einen
   * Ringhefter niemals zu einem Schnellhefter machen.
   */
  if (includesTerm(text, "hb")) {
    return "bleistift";
  }

  for (const [type, terms] of TYPE_RULES) {
    const matches = terms.some((term) => {
      const normalized =
        normalizeAutomaticSelectionText(term);

      return (
        normalized.includes(" ") ||
        normalized === "heft" ||
        normalized === "hefte"
      )
        ? includesTerm(text, normalized)
        : text.includes(normalized);
    });

    if (matches) {
      return type;
    }
  }

  return null;
}

function getProductName(
  product: AutomaticSelectionProductLike,
) {
  return (
    product.name ||
    product.product_name ||
    product.title ||
    ""
  );
}

function getProductSku(
  product: AutomaticSelectionProductLike,
) {
  return (
    product.sku ||
    product.product_sku ||
    ""
  );
}

function getItemText(
  item: AutomaticSelectionItemLike,
) {
  return [
    item.normalized_name,
    item.product_type,
    item.category,
    item.format,
    item.color,
    item.lineature,
    item.raw_text,
    item.notes,
  ]
    .filter(Boolean)
    .join(" ");
}

function getProductText(
  product: AutomaticSelectionProductLike,
) {
  return [
    getProductName(product),
    getProductSku(product),
    product.product_type,
    product.category,
    product.format,
    product.color,
    product.lineature,
  ]
    .filter(Boolean)
    .join(" ");
}

function normalizeComparableName(
  value: unknown,
) {
  return normalizeAutomaticSelectionText(value)
    .replace(/^\d+\s+/, "")
    .replace(/\bdin\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeFormat(
  value: unknown,
) {
  const match =
    normalizeAutomaticSelectionText(value).match(
      /(?:^|\s)a\s*([345])(?:\s|$)/,
    );

  return match
    ? `A${match[1]}`
    : null;
}

function normalizeColor(
  value: unknown,
) {
  const text =
    normalizeAutomaticSelectionText(value);

  const colors: Array<
    [string, string[]]
  > = [
    [
      "hellblau",
      [
        "hellblau",
        "lichtblau",
      ],
    ],
    [
      "dunkelblau",
      [
        "dunkelblau",
      ],
    ],
    [
      "hellgruen",
      [
        "hellgruen",
        "lichtgruen",
      ],
    ],
    [
      "dunkelgruen",
      [
        "dunkelgruen",
      ],
    ],
    [
      "transparent",
      [
        "transparent",
        "farblos",
        "klar",
      ],
    ],
    [
      "orange",
      [
        "orange",
      ],
    ],
    [
      "violett",
      [
        "violett",
        "lila",
      ],
    ],
    [
      "pink",
      [
        "pink",
        "rosa",
      ],
    ],
    [
      "weiss",
      [
        "weiss",
      ],
    ],
    [
      "schwarz",
      [
        "schwarz",
      ],
    ],
    [
      "braun",
      [
        "braun",
      ],
    ],
    [
      "gelb",
      [
        "gelb",
      ],
    ],
    [
      "gruen",
      [
        "gruen",
      ],
    ],
    [
      "blau",
      [
        "blau",
      ],
    ],
    [
      "rot",
      [
        "rot",
      ],
    ],
    [
      "grau",
      [
        "grau",
      ],
    ],
  ];

  return (
    colors.find(([, aliases]) =>
      aliases.some((alias) =>
        includesTerm(text, alias),
      ),
    )?.[0] || null
  );
}

function normalizeLineature(
  value: unknown,
) {
  const text =
    normalizeAutomaticSelectionText(value);

  if (
    !text ||
    text === "unknown" ||
    text.includes("unklar")
  ) {
    return null;
  }

  if (text.includes("explicit_zero")) {
    return "0";
  }

  const values =
    "0|1|2|3|4|5|6|7|8f?|9|10|25|26|27|28";

  const direct = text.match(
    new RegExp(
      `^(${values})(?:\\s|$)`,
    ),
  );

  const labeled = text.match(
    new RegExp(
      `(?:lineatur|lin|l|nr|nummer)\\s*\\.?\\s*(${values})(?:\\s|$)`,
    ),
  );

  const result =
    direct?.[1] ||
    labeled?.[1] ||
    null;

  if (result) {
    return result === "8"
      ? "8f"
      : result;
  }

  if (includesTerm(text, "kariert")) {
    return "kariert";
  }

  if (includesTerm(text, "liniert")) {
    return "liniert";
  }

  return null;
}

export function isAutomaticSelectionItemBlocked(
  item: AutomaticSelectionItemLike,
) {
  const text =
    normalizeAutomaticSelectionText(
      getItemText(item),
    );

  if (
    text.includes(
      "manual_combo_no_auto_adopt",
    )
  ) {
    return true;
  }

  if (
    text.includes("kombiposition") &&
    text.includes("umschlag") &&
    text.includes("heft")
  ) {
    return true;
  }

  return [
    item.status,
    item.admin_resolution_status,
  ]
    .map(normalizeAutomaticSelectionText)
    .filter(Boolean)
    .some((status) =>
      BLOCKED_STATUSES.has(status),
    );
}

export function isAutomaticSelectionReasonUnsafe(
  match: AutomaticSelectionMatchLike,
) {
  const reason =
    normalizeAutomaticSelectionText(
      match.match_reason,
    );

  return [
    "artverwandter kandidat",
    "admin pr",
    "variantenmerkmale",
    "bitte pr",
    "teilweise erkannt",
    "score begrenzt",
    "abweichende explizite nummer",
    "gelernte zuordnung",
    "mehrere aktive produkte",
  ].some((blocked) =>
    reason.includes(blocked),
  );
}

function hasExactIsbnReason(
  match: AutomaticSelectionMatchLike,
) {
  const reason =
    normalizeAutomaticSelectionText(
      match.match_reason,
    );

  return (
    reason.includes(
      "exakte isbn identitaet",
    ) ||
    reason.includes(
      "exakte isbn identitat",
    )
  );
}

function compareMatches<
  TMatch extends AutomaticSelectionMatchLike,
>(
  left: TMatch,
  right: TMatch,
) {
  const scoreDifference =
    toNumber(right.match_score) -
    toNumber(left.match_score);

  if (scoreDifference !== 0) {
    return scoreDifference;
  }

  const nameDifference = String(
    left.product_name || "",
  ).localeCompare(
    String(
      right.product_name || "",
    ),
    "de",
    {
      numeric: true,
      sensitivity: "base",
    },
  );

  if (nameDifference !== 0) {
    return nameDifference;
  }

  return String(left.id).localeCompare(
    String(right.id),
    "de",
    {
      numeric: true,
      sensitivity: "base",
    },
  );
}

function isAutomaticSelectionProductActive(
  product: AutomaticSelectionProductLike,
) {
  if (product.active === false) {
    return false;
  }

  const status =
    normalizeAutomaticSelectionText(
      product.status,
    );

  return ![
    "inactive",
    "archived",
    "deleted",
    "disabled",
  ].includes(status);
}

function isProductCompatible(
  item: AutomaticSelectionItemLike,
  product: AutomaticSelectionProductLike,
) {
  const itemType =
    classifyAutomaticMaterialType(
      getItemText(item),
    );

  const productType =
    classifyAutomaticMaterialType(
      getProductText(product),
    );

  const itemName =
    normalizeComparableName(
      item.normalized_name ||
        item.raw_text,
    );

  const productName =
    normalizeComparableName(
      getProductName(product),
    );

  const namesEqual = Boolean(
    itemName &&
      productName &&
      itemName === productName,
  );

  if (
    (itemType || productType) &&
    itemType !== productType
  ) {
    return false;
  }

  if (
    !itemType &&
    !productType &&
    !namesEqual
  ) {
    return false;
  }

  const effectiveType =
    itemType || productType;

  const itemFormat = normalizeFormat(
    [
      item.format,
      item.normalized_name,
      item.raw_text,
    ]
      .filter(Boolean)
      .join(" "),
  );

  const productFormat = normalizeFormat(
    [
      product.format,
      getProductName(product),
      getProductSku(product),
    ]
      .filter(Boolean)
      .join(" "),
  );

  if (
    effectiveType &&
    FORMAT_TYPES.has(effectiveType) &&
    itemFormat !== productFormat
  ) {
    return false;
  }

  const itemColor = normalizeColor(
    [
      item.color,
      item.normalized_name,
      item.raw_text,
    ]
      .filter(Boolean)
      .join(" "),
  );

  const productColor = normalizeColor(
    [
      product.color,
      getProductName(product),
      getProductSku(product),
    ]
      .filter(Boolean)
      .join(" "),
  );

  if (
    effectiveType &&
    COLOR_TYPES.has(effectiveType) &&
    itemColor !== productColor
  ) {
    return false;
  }

  const itemLineature =
    normalizeLineature(
      [
        item.lineature,
        item.normalized_name,
        item.raw_text,
        item.notes,
      ]
        .filter(Boolean)
        .join(" "),
    );

  const productLineature =
    normalizeLineature(
      [
        product.lineature,
        getProductName(product),
      ]
        .filter(Boolean)
        .join(" "),
    );

  if (
    effectiveType &&
    LINEATURE_TYPES.has(effectiveType) &&
    itemLineature !== productLineature
  ) {
    return false;
  }

  return true;
}

function uniqueMatchesByProduct<
  TMatch extends AutomaticSelectionMatchLike,
>(
  matches: TMatch[],
) {
  const byProductId =
    new Map<string, TMatch>();

  for (
    const match of
    [...matches].sort(compareMatches)
  ) {
    const productId = String(
      match.product_id || "",
    ).trim();

    if (
      productId &&
      !byProductId.has(productId)
    ) {
      byProductId.set(
        productId,
        match,
      );
    }
  }

  return Array.from(
    byProductId.values(),
  ).sort(compareMatches);
}

function noMatch<
  TMatch extends AutomaticSelectionMatchLike,
>(
  code:
    AutomaticSelectionDecision<TMatch>["code"],
  topScore: number | null = null,
  secondScore: number | null = null,
): AutomaticSelectionDecision<TMatch> {
  return {
    kind: "none",
    match: null,
    code,
    topScore,
    secondScore,
  };
}

export function selectSafeAutomaticMatch<
  TMatch extends AutomaticSelectionMatchLike,
>(params: {
  item: AutomaticSelectionItemLike;
  matches: TMatch[];
  productById: ReadonlyMap<
    string,
    AutomaticSelectionProductLike
  >;
}): AutomaticSelectionDecision<TMatch> {
  const {
    item,
    matches,
    productById,
  } = params;

  if (
    isAutomaticSelectionItemBlocked(item)
  ) {
    return noMatch("item_blocked");
  }

  const bookIdentity =
    getRequestItemBookIdentity(item);

  if (bookIdentity.isBook) {
    const exactMatches =
      uniqueMatchesByProduct(
        matches.filter((match) => {
          const product =
            match.product_id
              ? productById.get(
                  match.product_id,
                )
              : null;

          return Boolean(
            product &&
              isAutomaticSelectionProductActive(
                product,
              ) &&
              toNumber(
                match.match_score,
              ) === 100 &&
              hasExactIsbnReason(
                match,
              ) &&
              !isAutomaticSelectionReasonUnsafe(
                match,
              ) &&
              findExactBookIsbnMatch(
                item,
                product,
              ),
          );
        }),
      );

    if (
      exactMatches.length !== 1
    ) {
      return noMatch(
        "book_exact_isbn_not_unique",
      );
    }

    return {
      kind: "exact_isbn",
      match: exactMatches[0],
      code: "exact_isbn",
      topScore: 100,
      secondScore: null,
    };
  }

  const compatibleMatches =
    uniqueMatchesByProduct(
      matches.filter((match) => {
        const product =
          match.product_id
            ? productById.get(
                match.product_id,
              )
            : null;

        return Boolean(
          product &&
            isAutomaticSelectionProductActive(
                product,
              ) &&
            !isAutomaticSelectionReasonUnsafe(
              match,
            ) &&
            isProductCompatible(
              item,
              product,
            ),
        );
      }),
    );

  const topMatch =
    compatibleMatches[0] || null;

  if (!topMatch) {
    return noMatch(
      "no_compatible_generic_match",
    );
  }

  const topScore =
    toNumber(
      topMatch.match_score,
    );

  /*
   * AUTO_SELECTION_SCORE_GAP_ALL_COMPETITORS_V1
   *
   * Der Top-Treffer muss selbst mindestens 85 % erreichen.
   * Der Abstand wird anschließend aber gegen den zweitbesten
   * sicheren und produktkompatiblen Kandidaten geprüft, auch
   * wenn dieser knapp unter 85 % liegt.
   */
  if (
    topScore <
    AUTO_SELECTION_MIN_GENERIC_SCORE
  ) {
    return noMatch(
      "generic_score_below_minimum",
      topScore,
      null,
    );
  }

  const secondMatch =
    compatibleMatches[1] || null;

  const secondScore =
    secondMatch
      ? toNumber(
          secondMatch.match_score,
        )
      : null;

  if (
    secondScore !== null &&
    topScore - secondScore <
      AUTO_SELECTION_MIN_SCORE_GAP
  ) {
    return noMatch(
      "generic_score_gap_too_small",
      topScore,
      secondScore,
    );
  }

  return {
    kind: "generic",
    match: topMatch,
    code: "generic_safe",
    topScore,
    secondScore,
  };
}