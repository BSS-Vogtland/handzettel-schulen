import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProductRow = {
  id: string;
  name?: string | null;
  product_name?: string | null;
  sku?: string | null;
  product_sku?: string | null;
  category?: string | null;
  product_type?: string | null;
  format?: string | null;
  color?: string | null;
  lineature?: string | null;
};

type AutoFixChange = {
  productId: string;
  productName: string;
  sku: string | null;
  updates: {
    category?: string;
    product_type?: string;
    format?: string;
    color?: string;
    lineature?: string;
  };
  reasons: string[];
};

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase-Konfiguration fehlt. NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY pruefen."
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normalize(value: unknown) {
  return clean(value)
    .toLowerCase()
    .replace(/\u00e4/g, "ae")
    .replace(/\u00f6/g, "oe")
    .replace(/\u00fc/g, "ue")
    .replace(/\u00df/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getProductName(product: ProductRow) {
  return clean(product.name) || clean(product.product_name) || "Unbenanntes Produkt";
}

function getProductSku(product: ProductRow) {
  return clean(product.sku) || clean(product.product_sku) || null;
}

function textFor(product: ProductRow) {
  return normalize([
    getProductName(product),
    product.category,
    product.product_type,
    product.format,
    product.color,
    product.lineature,
    getProductSku(product),
  ].join(" "));
}

function has(text: string, values: string[]) {
  return values.some((value) => text.includes(normalize(value)));
}

function inferProductType(product: ProductRow) {
  const text = textFor(product);

  const checks: Array<[string, string[]]> = [
    ["Wachsmalstifte", ["wachsmalstift", "wachsmalstifte", "wachsmalkreide", "malkreide"]],
    ["Filzstifte", ["filzstift", "filzstifte"]],
    ["Buntstifte", ["buntstift", "buntstifte"]],
    ["Pinsel", ["borstenpinsel", "haarpinsel", "pinsel"]],
    ["Tuschkasten", ["tuschkasten", "farbkasten", "schulmalfarben"]],
    ["Mischpalette", ["mischpalette"]],
    ["Federmappe", ["federmappe", "federtasche", "schlampermappe"]],
    ["Schnellhefter", ["schnellhefter"]],
    ["Papphefter", ["papphefter"]],
    ["Postmappe", ["postmappe"]],
    ["Sammelmappe", ["sammelmappe", "kunstmappe"]],
    ["Buchumschlag", ["buchumschlag", "buchhuelle", "buchhulle"]],
    ["Umschlag", ["heftumschlag", "umschlag"]],
    ["Hausaufgabenheft", ["hausaufgabenheft"]],
    ["Vokabelheft", ["vokabelheft"]],
    ["Schreibheft", ["schreibheft", "geometrie heft", "schulheft", "heft"]],
    ["Lineal", ["lineal"]],
    ["Geodreieck", ["geodreieck"]],
    ["Zirkel", ["zirkel"]],
    ["Klebestift", ["klebestift"]],
    ["Schere", ["bastelschere", "schere"]],
    ["Stehsammler", ["stehsammler"]],
    ["Schulranzen", ["schulranzen", "schulranzenset", "ranzen"]],
    ["Turnbeutel", ["turnbeutel"]],
    ["Bleistift", ["bleistift"]],
    ["Radiergummi", ["radiergummi"]],
    ["Spitzer", ["doppelanspitzer", "spitzer"]],
    ["Textmarker", ["textmarker"]],
    ["Fuellhalter", ["fueller", "fuller", "fuellhalter", "fullhalter"]],
    ["Zeichenblock", ["zeichenblock"]],
    ["Malblock", ["malblock"]],
    ["Zeichenpapier", ["zeichenpapier"]],
  ];

  for (const [type, words] of checks) {
    if (has(text, words)) return type;
  }

  return "";
}

function inferCategory(product: ProductRow, inferredType: string) {
  const text = textFor(product) + " " + normalize(inferredType);

  if (has(text, ["wachsmal", "pinsel", "tuschkasten", "farbkasten", "schulmalfarben", "mischpalette", "schere"])) {
    return "Kunst";
  }

  if (has(text, ["schreibheft", "hausaufgabenheft", "vokabelheft", "heft", "umschlag", "buchumschlag"])) {
    return "Hefte";
  }

  if (has(text, ["schnellhefter", "papphefter", "sammelmappe", "postmappe", "kunstmappe", "federmappe", "mappe"])) {
    return "Mappen";
  }

  if (has(text, ["lineal", "geodreieck", "zirkel", "zeichenblock", "zeichenpapier", "malblock"])) {
    return "Zeichnen";
  }

  if (has(text, ["klebestift", "kleber"])) {
    return "Kleben";
  }

  if (has(text, ["bleistift", "radiergummi", "spitzer", "textmarker", "buntstift", "filzstift", "fueller", "fuellhalter"])) {
    return "Schreiben";
  }

  if (has(text, ["stehsammler"])) {
    return "Organisation";
  }

  if (has(text, ["schulranzen", "ranzen"])) {
    return "Schulranzen";
  }

  if (has(text, ["turnbeutel"])) {
    return "Sport";
  }

  return "";
}

function inferFormat(product: ProductRow) {
  const text = textFor(product);

  if (/\ba3\b/.test(text)) return "A3";
  if (/\ba4\b/.test(text)) return "A4";
  if (/\ba5\b/.test(text)) return "A5";

  return "";
}

function inferColor(product: ProductRow) {
  const text = textFor(product);

  const colors: Array<[string, string]> = [
    ["hellblau", "hellblau"],
    ["hellgruen", "hellgruen"],
    ["dunkelblau", "dunkelblau"],
    ["dunkelgruen", "dunkelgruen"],
    ["blau", "blau"],
    ["gelb", "gelb"],
    ["gruen", "gruen"],
    ["rot", "rot"],
    ["weiss", "weiss"],
    ["orange", "orange"],
    ["lila", "lila"],
    ["rosa", "rosa"],
    ["pink", "pink"],
    ["schwarz", "schwarz"],
    ["transparent", "transparent"],
    ["mehrfarbig", "mehrfarbig"],
  ];

  for (const [needle, color] of colors) {
    if (text.includes(needle)) return color;
  }

  if (/\b\d{1,2}\s*farben\b/.test(text)) return "mehrfarbig";

  return "";
}

function isLineatureRelevant(type: string, product: ProductRow) {
  const text = textFor(product) + " " + normalize(type);

  return has(text, [
    "schreibheft",
    "hausaufgabenheft",
    "vokabelheft",
    "schulheft",
    "geometrie heft",
    "lineatur",
    "heft",
  ]);
}

function inferLineature(product: ProductRow, inferredType: string) {
  if (!isLineatureRelevant(inferredType, product)) return "";

  const text = textFor(product);
  const match = text.match(/\b(lineatur|lin|nr|nummer)\s*(0|1|2|3|4|5|6|7|8f|9|10|20|25|26|27|28)\b/);

  if (match?.[2]) return match[2];

  const bracketMatch = text.match(/\b(0|1|2|3|4|5|6|7|8f|9|10|20|25|26|27|28)\b/);

  return bracketMatch?.[1] || "";
}

function buildSafeUpdates(product: ProductRow): AutoFixChange | null {
  const updates: AutoFixChange["updates"] = {};
  const reasons: string[] = [];

  const inferredType = inferProductType(product);
  const inferredCategory = inferCategory(product, inferredType);
  const inferredFormat = inferFormat(product);
  const inferredColor = inferColor(product);
  const inferredLineature = inferLineature(product, inferredType);

  if (!clean(product.product_type) && inferredType) {
    updates.product_type = inferredType;
    reasons.push("Typ aus Produktname/SKU eindeutig erkannt");
  }

  if (!clean(product.category) && inferredCategory) {
    updates.category = inferredCategory;
    reasons.push("Kategorie aus Produktname/Typ eindeutig erkannt");
  }

  if (!clean(product.format) && inferredFormat) {
    updates.format = inferredFormat;
    reasons.push("Format aus Produktname erkannt");
  }

  if (!clean(product.color) && inferredColor) {
    updates.color = inferredColor;
    reasons.push("Farbe aus Produktname erkannt");
  }

  if (!clean(product.lineature) && inferredLineature) {
    updates.lineature = inferredLineature;
    reasons.push("Lineatur aus Produktname erkannt");
  }

  if (Object.keys(updates).length === 0) return null;

  return {
    productId: product.id,
    productName: getProductName(product),
    sku: getProductSku(product),
    updates,
    reasons,
  };
}

async function readBody(request: NextRequest) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await readBody(request);
    const mode = String(body.mode || "dry-run");
    const apply = mode === "apply";
    const confirm = String(body.confirm || "");

    if (apply && confirm !== "JA_AUTOFIX_PRODUKTDATEN") {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Zum Schreiben muss confirm exakt JA_AUTOFIX_PRODUKTDATEN sein.",
        },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("school_products")
      .select("*")
      .order("name", { ascending: true });

    if (error) {
      throw error;
    }

    const products = (data || []) as ProductRow[];
    const changes = products
      .map((product) => buildSafeUpdates(product))
      .filter((change): change is AutoFixChange => Boolean(change));

    const results: Array<{
      productId: string;
      productName: string;
      updated: boolean;
      error?: string;
    }> = [];

    if (apply) {
      for (const change of changes) {
        const { error: updateError } = await supabase
          .from("school_products")
          .update({
            ...change.updates,
            updated_at: new Date().toISOString(),
          })
          .eq("id", change.productId);

        results.push({
          productId: change.productId,
          productName: change.productName,
          updated: !updateError,
          error: updateError?.message,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      mode: apply ? "apply" : "dry-run",
      productCount: products.length,
      changeCount: changes.length,
      appliedCount: results.filter((result) => result.updated).length,
      errorCount: results.filter((result) => result.error).length,
      changes: changes.slice(0, 300),
      results,
    });
  } catch (error) {
    console.error("product audit autofix error:", error);

    const errorMessage =
      error instanceof Error
        ? error.message
        : typeof error === "object" && error !== null
          ? JSON.stringify(error)
          : "Produktdaten-Autofix fehlgeschlagen.";

    return NextResponse.json(
      {
        ok: false,
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}