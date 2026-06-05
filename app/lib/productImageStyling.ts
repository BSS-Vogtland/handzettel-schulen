import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const PRODUCT_IMAGE_BUCKET = "school-product-images";
const PRODUCT_IMAGE_STYLED_PREFIX = "products-styled-removebg";

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 1200;
const LOGO_SAFE_BOTTOM_Y = 210;
const PRODUCT_BOTTOM_Y = 1040;

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

function createBackgroundSvg(_product: ProductRow) {
  return Buffer.from(`
    <svg width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" viewBox="0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#FFF9EF"/>
          <stop offset="0.55" stop-color="#FBF7F0"/>
          <stop offset="1" stop-color="#EEF4FA"/>
        </linearGradient>
        <radialGradient id="stage" cx="50%" cy="42%" r="55%">
          <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.92"/>
          <stop offset="0.72" stop-color="#FFFFFF" stop-opacity="0.42"/>
          <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
        </radialGradient>
      </defs>

      <rect width="1200" height="1200" fill="url(#bg)"/>
      <circle cx="145" cy="1070" r="320" fill="#F4E7D8" opacity="0.55"/>
      <circle cx="1115" cy="235" r="275" fill="#DDEAF7" opacity="0.75"/>
      <path d="M0 210 C220 130 380 265 610 180 C840 95 970 135 1200 70 L1200 0 L0 0 Z" fill="#ffffff" opacity="0.58"/>
      <rect x="0" y="0" width="1200" height="1200" fill="url(#stage)"/>
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

async function getTransparentPixelRatio(inputBuffer: Buffer) {
  const { data, info } = await sharp(inputBuffer, {
    failOn: "none",
  })
    .ensureAlpha()
    .raw()
    .toBuffer({
      resolveWithObject: true,
    });

  if (!info.width || !info.height || info.channels < 4) {
    return 0;
  }

  const totalPixels = info.width * info.height;
  let transparentPixels = 0;

  for (let index = 3; index < data.length; index += info.channels) {
    if (data[index] < 245) {
      transparentPixels += 1;
    }
  }

  return totalPixels > 0 ? transparentPixels / totalPixels : 0;
}

async function assertUsableTransparentImage(inputBuffer: Buffer) {
  const transparentRatio = await getTransparentPixelRatio(inputBuffer);

  if (transparentRatio < 0.05) {
    throw new Error(
      "Die Freistellung hat keinen nutzbaren transparenten Hintergrund erzeugt. Das Styled-Bild wurde nicht gespeichert, damit kein kaputtes Bild im Shop erscheint."
    );
  }
}

async function prepareProductLayer(inputBuffer: Buffer, profile: ProductProfile) {
  if (profile.preserveOriginal) {
    return sharp(inputBuffer, {
      failOn: "none",
    })
      .rotate()
      .resize({
        width: profile.maxWidth,
        height: profile.maxHeight,
        fit: "inside",
        withoutEnlargement: true,
      })
      .png()
      .toBuffer();
  }

  await assertUsableTransparentImage(inputBuffer);

  return sharp(inputBuffer, {
    failOn: "none",
  })
    .ensureAlpha()
    .trim({
      threshold: 10,
    })
    .resize({
      width: profile.maxWidth,
      height: profile.maxHeight,
      fit: "inside",
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();
}


async function buildStyledImage(input: {
  product: ProductRow;
  productBuffer: Buffer;
  profile: ProductProfile;
}) {
  const resizedProductBuffer = await prepareProductLayer(
    input.productBuffer,
    input.profile
  );

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
