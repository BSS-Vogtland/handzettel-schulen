import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const PRODUCT_IMAGE_BUCKET = "school-product-images";
const PRODUCT_IMAGE_STYLED_PREFIX = "products-styled-removebg";

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 1200;
const LOGO_SAFE_BOTTOM_Y = 355;
const PRODUCT_BOTTOM_Y = 1038;

type ProductRow = {
  id: string;
  name?: string | null;
  product_name?: string | null;
  title?: string | null;
  sku?: string | null;
  category?: string | null;
  product_type?: string | null;
  format?: string | null;
  color?: string | null;
  lineature?: string | null;
  image_url?: string | null;
  image_original_url?: string | null;
  image_styled_url?: string | null;
  image_styled_at?: string | null;
};

type StyleResult = {
  styledImageUrl: string;
  storagePath: string;
  usedRemoveBg: boolean;
  profile: string;
};

type TryStyleResult =
  | {
      attempted: true;
      ok: true;
      result: StyleResult;
      message: string;
    }
  | {
      attempted: true;
      ok: false;
      result: null;
      message: string;
    }
  | {
      attempted: false;
      ok: false;
      result: null;
      message: string;
    };

type ProductProfile = {
  name: string;
  maxWidth: number;
  maxHeight: number;
  preserveOriginal: boolean;
};

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase Umgebungsvariablen fehlen. Prüfe NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function cleanText(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function normalizeGermanText(value: unknown) {
  return cleanText(value)
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");
}

function slugify(value: unknown) {
  return normalizeGermanText(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90);
}

function getProductName(product: ProductRow) {
  return cleanText(product.name || product.product_name || product.title) || "Produkt";
}

function buildProductText(product: ProductRow) {
  return [
    product.name,
    product.product_name,
    product.title,
    product.sku,
    product.category,
    product.product_type,
    product.format,
    product.color,
    product.lineature,
  ]
    .map((value) => normalizeGermanText(value))
    .filter(Boolean)
    .join(" ");
}

function includesAny(text: string, words: string[]) {
  return words.some((word) => text.includes(word));
}

function getProductProfile(product: ProductRow): ProductProfile {
  const text = buildProductText(product);

  if (
    includesAny(text, [
      "transparent",
      "klar",
      "clear",
      "durchsichtig",
      "pvc",
      "folie",
      "folien",
      "buchumschlag",
      "buchhuelle",
      "buchhulle",
      "heftumschlag",
      "umschlag transparent",
      "umschlag klar",
      "schnellhefter pvc",
    ])
  ) {
    return {
      name: "flatTransparent",
      maxWidth: 900,
      maxHeight: 680,
      preserveOriginal: true,
    };
  }

  if (
    includesAny(text, [
      "klebestift",
      "stift",
      "textmarker",
      "permanentmarker",
      "marker",
      "bleistift",
      "pinsel",
      "lineal",
      "zirkel",
      "heftstreifen",
      "aktentulli",
      "schere",
    ])
  ) {
    return {
      name: "slim",
      maxWidth: 460,
      maxHeight: 760,
      preserveOriginal: false,
    };
  }

  if (
    includesAny(text, [
      "schnellhefter",
      "heft",
      "block",
      "zeichenblock",
      "malblock",
      "mappe",
      "papier",
      "tonpapier",
      "transparentpapier",
      "buntpapier",
    ])
  ) {
    return {
      name: "flat",
      maxWidth: 850,
      maxHeight: 640,
      preserveOriginal: false,
    };
  }

  return {
    name: "default",
    maxWidth: 760,
    maxHeight: 720,
    preserveOriginal: false,
  };
}

function createBackgroundSvg(product: ProductRow) {
  const productName = getProductName(product)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return Buffer.from(`
    <svg width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" viewBox="0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#FFF9EF"/>
          <stop offset="0.55" stop-color="#FBF7F0"/>
          <stop offset="1" stop-color="#EEF4FA"/>
        </linearGradient>
        <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#102A43" flood-opacity="0.16"/>
        </filter>
      </defs>

      <rect width="1200" height="1200" rx="0" fill="url(#bg)"/>
      <circle cx="140" cy="1050" r="310" fill="#F4E7D8" opacity="0.55"/>
      <circle cx="1110" cy="230" r="270" fill="#DDEAF7" opacity="0.75"/>
      <path d="M0 210 C220 130 380 265 610 180 C840 95 970 135 1200 70 L1200 0 L0 0 Z" fill="#ffffff" opacity="0.82"/>

      <g filter="url(#softShadow)">
        <rect x="86" y="70" width="1028" height="210" rx="44" fill="#ffffff" opacity="0.96"/>
      </g>

      <text x="600" y="145" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="52" font-weight="800" fill="#102A43">Handzettel-Schulen.de</text>
      <text x="600" y="198" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="700" fill="#A75B28">Schulmaterial einfach finden</text>
      <text x="600" y="246" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700" fill="#52616F">${productName}</text>

      <rect x="110" y="1080" width="980" height="42" rx="21" fill="#ffffff" opacity="0.72"/>
    </svg>
  `);
}

async function fetchBufferFromUrl(url: string) {
  const response = await fetch(url, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Bild konnte nicht geladen werden: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function removeBackgroundWithRemoveBg(inputBuffer: Buffer) {
  const apiKey = process.env.REMOVE_BG_API_KEY;

  if (!apiKey) {
    throw new Error(
      "REMOVE_BG_API_KEY fehlt. Bitte in den Umgebungsvariablen hinterlegen."
    );
  }

  const formData = new FormData();
  formData.append(
  "image_file",
  new Blob([new Uint8Array(inputBuffer)], {
    type: "image/png",
  }),
  "product.png"
);
  formData.append("size", "auto");
  formData.append("format", "png");

  const response = await fetch("https://api.remove.bg/v1.0/removebg", {
    method: "POST",
    headers: {
      "X-Api-Key": apiKey,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `remove.bg konnte das Bild nicht freistellen: ${response.status} ${response.statusText}${
        errorText ? ` - ${errorText.slice(0, 240)}` : ""
      }`
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function normalizeInputImage(inputBuffer: Buffer) {
  return sharp(inputBuffer, {
    failOn: "none",
  })
    .rotate()
    .png()
    .toBuffer();
}

async function buildStyledImage(input: {
  product: ProductRow;
  productBuffer: Buffer;
  profile: ProductProfile;
}) {
  const resizedProductBuffer = await sharp(input.productBuffer, {
    failOn: "none",
  })
    .rotate()
    .resize({
      width: input.profile.maxWidth,
      height: input.profile.maxHeight,
      fit: "inside",
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();

  const metadata = await sharp(resizedProductBuffer).metadata();
  const productWidth = metadata.width || input.profile.maxWidth;
  const productHeight = metadata.height || input.profile.maxHeight;

  const availableHeight = PRODUCT_BOTTOM_Y - LOGO_SAFE_BOTTOM_Y;
  const top = Math.max(
    LOGO_SAFE_BOTTOM_Y + 18,
    Math.round(LOGO_SAFE_BOTTOM_Y + (availableHeight - productHeight) / 2)
  );
  const left = Math.max(0, Math.round((CANVAS_WIDTH - productWidth) / 2));

  return sharp(createBackgroundSvg(input.product), {
    failOn: "none",
  })
    .composite([
      {
        input: resizedProductBuffer,
        top,
        left,
      },
    ])
    .webp({
      quality: 88,
      effort: 4,
    })
    .toBuffer();
}

async function uploadStyledImage(input: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  product: ProductRow;
  buffer: Buffer;
}) {
  const productName = getProductName(input.product);
  const productSlug = slugify(productName) || "produkt";
  const storagePath = `${PRODUCT_IMAGE_STYLED_PREFIX}/${input.product.id}-${productSlug}-${Date.now()}.webp`;

  const { error: uploadError } = await input.supabase.storage
    .from(PRODUCT_IMAGE_BUCKET)
    .upload(storagePath, input.buffer, {
      contentType: "image/webp",
      upsert: false,
    });

  if (uploadError) {
    throw new Error(
      `Freigestelltes Produktbild konnte nicht hochgeladen werden: ${uploadError.message}`
    );
  }

  const { data } = input.supabase.storage
    .from(PRODUCT_IMAGE_BUCKET)
    .getPublicUrl(storagePath);

  return {
    storagePath,
    styledImageUrl: data.publicUrl || null,
  };
}

export async function styleProductImageById(productId: string): Promise<StyleResult> {
  const cleanProductId = cleanText(productId);

  if (!cleanProductId) {
    throw new Error("Keine Produkt-ID übergeben.");
  }

  const supabase = getSupabaseAdmin();

  const { data: productData, error: productError } = await supabase
    .from("school_products")
    .select("*")
    .eq("id", cleanProductId)
    .maybeSingle();

  if (productError || !productData) {
    throw new Error(
      productError?.message || "Produkt wurde nicht gefunden."
    );
  }

  const product = productData as ProductRow;
  const sourceImageUrl = cleanText(product.image_original_url || product.image_url);

  if (!sourceImageUrl) {
    throw new Error(
      "Für dieses Produkt ist kein Originalbild oder Produktbild gespeichert."
    );
  }

  const profile = getProductProfile(product);
  const originalBuffer = await fetchBufferFromUrl(sourceImageUrl);
  const normalizedBuffer = await normalizeInputImage(originalBuffer);

  const productBuffer = profile.preserveOriginal
    ? normalizedBuffer
    : await removeBackgroundWithRemoveBg(normalizedBuffer);

  const styledBuffer = await buildStyledImage({
    product,
    productBuffer,
    profile,
  });

  const uploaded = await uploadStyledImage({
    supabase,
    product,
    buffer: styledBuffer,
  });

  if (!uploaded.styledImageUrl) {
    throw new Error("Styled-Bild wurde hochgeladen, aber es wurde keine öffentliche URL zurückgegeben.");
  }

  const styledAt = new Date().toISOString();

  const { error: updateError } = await supabase
    .from("school_products")
    .update({
      image_styled_url: uploaded.styledImageUrl,
      image_styled_at: styledAt,
      updated_at: styledAt,
    })
    .eq("id", product.id);

  if (updateError) {
    throw new Error(
      `Styled-Bild wurde erzeugt, aber das Produkt konnte nicht aktualisiert werden: ${updateError.message}`
    );
  }

  return {
    styledImageUrl: uploaded.styledImageUrl,
    storagePath: uploaded.storagePath,
    usedRemoveBg: !profile.preserveOriginal,
    profile: profile.name,
  };
}

export async function tryStyleProductImageById(
  _productId: string
): Promise<TryStyleResult> {
  return {
    attempted: false,
    ok: false,
    result: null,
    message:
      "Automatische Hintergrund-Erzeugung beim Speichern ist deaktiviert. Nutze im Admin den separaten Button „Bild freistellen & Hintergrund setzen“.",
  };
}
