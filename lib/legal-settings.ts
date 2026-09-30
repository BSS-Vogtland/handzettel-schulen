import { CURRENT_LEGAL_COMPANY_DETAILS, SELLER_DETAILS } from "@/app/lib/sellerSettings";
import { createClient } from "@supabase/supabase-js";

export type LegalSettings = {
  id: string;

  site_name: string;
  brand_name: string;

  company_name: string;
  owner_name: string | null;
  legal_form: string | null;

  street: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;

  phone_primary: string | null;
  phone_secondary: string | null;
  fax: string | null;

  email_general: string | null;
  email_privacy: string | null;

  vat_id: string | null;

  register_court: string | null;
  register_number: string | null;
  supervisory_authority: string | null;

  responsible_person: string | null;
  privacy_contact: string | null;

  dispute_resolution_text: string | null;

  hosting_provider: string | null;
  database_provider: string | null;
  ai_provider: string | null;
  email_provider: string | null;

  updated_at: string | null;
  created_at: string | null;
};

export type LegalSettingsUpdateInput = Partial<
  Omit<LegalSettings, "id" | "created_at" | "updated_at">
>;

export const FALLBACK_LEGAL_SETTINGS: LegalSettings = {
  id: "default",
  ...CURRENT_LEGAL_COMPANY_DETAILS,

  site_name: "Handzettel-Schulen.de",
  brand_name: "Handzettel-Schulen.de",

  legal_form: "Einzelunternehmen",

  country: "Deutschland",

  vat_id: "DE463186382",

  register_court: null,
  register_number: null,
  supervisory_authority: null,

  dispute_resolution_text:
    "Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.",

  hosting_provider: "Vercel Inc.",
  database_provider: "Supabase",
  ai_provider: "OpenAI",
  email_provider: "IONOS",

  updated_at: null,
  created_at: null,
};

const LEGAL_SETTINGS_ID = "default";
const CANONICAL_CONTACT_EMAIL = SELLER_DETAILS.email;

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

function cleanNullableText(value: unknown) {
  if (value === null || value === undefined) return null;

  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}

function cleanRequiredText(value: unknown, fallback: string) {
  const cleaned = cleanNullableText(value);
  return cleaned || fallback;
}

function normalizeLegalSettings(row: Partial<LegalSettings> | null): LegalSettings {
  if (!row) {
    return FALLBACK_LEGAL_SETTINGS;
  }

  return {
    id: cleanRequiredText(row.id, FALLBACK_LEGAL_SETTINGS.id),
    ...CURRENT_LEGAL_COMPANY_DETAILS,

    site_name: cleanRequiredText(
      row.site_name,
      FALLBACK_LEGAL_SETTINGS.site_name
    ),
    brand_name: cleanRequiredText(
      row.brand_name,
      FALLBACK_LEGAL_SETTINGS.brand_name
    ),

    legal_form: cleanNullableText(row.legal_form),

    country: cleanNullableText(row.country),

    vat_id: cleanNullableText(row.vat_id),

    register_court: cleanNullableText(row.register_court),
    register_number: cleanNullableText(row.register_number),
    supervisory_authority: cleanNullableText(row.supervisory_authority),

    dispute_resolution_text: cleanNullableText(row.dispute_resolution_text),

    hosting_provider: cleanNullableText(row.hosting_provider),
    database_provider: cleanNullableText(row.database_provider),
    ai_provider: cleanNullableText(row.ai_provider),
    email_provider: cleanNullableText(row.email_provider),

    updated_at: cleanNullableText(row.updated_at),
    created_at: cleanNullableText(row.created_at),
  };
}

export async function getLegalSettings() {
  try {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("site_legal_settings")
      .select("*")
      .eq("id", LEGAL_SETTINGS_ID)
      .maybeSingle();

    if (error) {
      console.error("Rechtliche Einstellungen konnten nicht geladen werden:", error);
      return FALLBACK_LEGAL_SETTINGS;
    }

    return normalizeLegalSettings(data as LegalSettings | null);
  } catch (error) {
    console.error("Fallback für rechtliche Einstellungen wird genutzt:", error);
    return FALLBACK_LEGAL_SETTINGS;
  }
}

export async function updateLegalSettings(input: LegalSettingsUpdateInput) {
  const supabase = getSupabaseAdmin();

  const payload = {
    id: LEGAL_SETTINGS_ID,
    ...CURRENT_LEGAL_COMPANY_DETAILS,

    site_name: cleanRequiredText(input.site_name, FALLBACK_LEGAL_SETTINGS.site_name),
    brand_name: cleanRequiredText(
      input.brand_name,
      FALLBACK_LEGAL_SETTINGS.brand_name
    ),

    legal_form: cleanNullableText(input.legal_form),

    country: cleanNullableText(input.country),

    vat_id: cleanNullableText(input.vat_id),

    register_court: cleanNullableText(input.register_court),
    register_number: cleanNullableText(input.register_number),
    supervisory_authority: cleanNullableText(input.supervisory_authority),

    dispute_resolution_text: cleanNullableText(input.dispute_resolution_text),

    hosting_provider: cleanNullableText(input.hosting_provider),
    database_provider: cleanNullableText(input.database_provider),
    ai_provider: cleanNullableText(input.ai_provider),
    email_provider: cleanNullableText(input.email_provider),
  };

  const { data, error } = await supabase
    .from("site_legal_settings")
    .upsert(payload, {
      onConflict: "id",
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(
      `Rechtliche Einstellungen konnten nicht gespeichert werden: ${error.message}`
    );
  }

  return normalizeLegalSettings(data as LegalSettings);
}

export function getLegalAddress(settings: LegalSettings) {
  const parts = [
    settings.street,
    [settings.postal_code, settings.city].filter(Boolean).join(" "),
    settings.country,
  ].filter((part): part is string => Boolean(part && part.trim().length > 0));

  return parts;
}

export function getLegalDisplayName(settings: LegalSettings) {
  if (settings.owner_name) {
    return `${settings.company_name}, Inh.: ${settings.owner_name}`;
  }

  return settings.company_name;
}

export function getPrivacyEmail(settings: LegalSettings) {
  return settings.email_privacy || settings.email_general || "";
}

export function getGeneralEmail(settings: LegalSettings) {
  return settings.email_general || settings.email_privacy || "";
}

export function getCanonicalContactEmail() {
  return CANONICAL_CONTACT_EMAIL;
}
