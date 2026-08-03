export const SELLER_DETAILS = {
  legalName: "BSS Vogtland",
  tradeName: "Handzettel-Schulen.de",
  ownerName: "Marius Röthig",
  legalForm: "Einzelunternehmen",
  street: "Heinrich-Heine-Str. 2",
  postalCode: "08547",
  city: "Jößnitz",
  country: "Deutschland",
  taxNumber: "223/263/09459",
  vatId: "DE346183832",
  email: "kontakt@bss-vogtland.de",
  phone: "03765 16175",
  website: "www.handzettel-schulen.de",
} as const;

export type SellerDetails = {
  legalName: string;
  tradeName: string;
  ownerName: string;
  legalForm: string;
  street: string;
  postalCode: string;
  city: string;
  country: string;
  taxNumber: string;
  vatId: string;
  email: string;
  phone: string;
  website: string;
};

export type SellerSnapshotSource = {
  seller_snapshot_version?: string | null;
  seller_legal_name_snapshot?: string | null;
  seller_trade_name_snapshot?: string | null;
  seller_owner_name_snapshot?: string | null;
  seller_street_snapshot?: string | null;
  seller_postal_code_snapshot?: string | null;
  seller_city_snapshot?: string | null;
  seller_country_snapshot?: string | null;
  seller_tax_number_snapshot?: string | null;
  seller_vat_id_snapshot?: string | null;
  seller_email_snapshot?: string | null;
  seller_phone_snapshot?: string | null;
  seller_website_snapshot?: string | null;
};

export type SellerSnapshotState = "complete" | "missing" | "incomplete";

export class SellerConfigurationError extends Error {
  readonly code: "SELLER_SNAPSHOT_INCOMPLETE" | "SELLER_CONFIGURATION_INVALID";

  constructor(code: SellerConfigurationError["code"], message: string) {
    super(message);
    this.name = "SellerConfigurationError";
    this.code = code;
  }
}

function requireValue(value: string, label: string) {
  const cleaned = value.trim();
  if (!cleaned) {
    throw new SellerConfigurationError(
      "SELLER_CONFIGURATION_INVALID",
      `${label} der Verkäuferkonfiguration fehlt.`,
    );
  }
  return cleaned;
}

export function validateSellerDetails(input: SellerDetails): SellerDetails {
  const details = {
    legalName: requireValue(input.legalName, "Firmenname"),
    tradeName: requireValue(input.tradeName, "Geschäftsname"),
    ownerName: requireValue(input.ownerName, "Inhaber"),
    legalForm: requireValue(input.legalForm, "Unternehmensform"),
    street: requireValue(input.street, "Straße"),
    postalCode: requireValue(input.postalCode, "Postleitzahl"),
    city: requireValue(input.city, "Ort"),
    country: requireValue(input.country, "Land"),
    taxNumber: requireValue(input.taxNumber, "Steuernummer"),
    vatId: requireValue(input.vatId, "USt-IdNr."),
    email: requireValue(input.email, "E-Mail-Adresse"),
    phone: requireValue(input.phone, "Telefonnummer"),
    website: requireValue(input.website, "Website"),
  };

  if (!/^\d{5}$/.test(details.postalCode)) {
    throw new SellerConfigurationError("SELLER_CONFIGURATION_INVALID", "Die Verkäufer-Postleitzahl muss fünfstellig sein.");
  }
  if (!/^DE\d{9}$/.test(details.vatId)) {
    throw new SellerConfigurationError("SELLER_CONFIGURATION_INVALID", "Die Verkäufer-USt-IdNr. ist ungültig.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email)) {
    throw new SellerConfigurationError("SELLER_CONFIGURATION_INVALID", "Die Verkäufer-E-Mail-Adresse ist ungültig.");
  }
  if (!/^(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+\/?$/i.test(details.website)) {
    throw new SellerConfigurationError("SELLER_CONFIGURATION_INVALID", "Die Verkäufer-Website ist ungültig.");
  }

  return details;
}

const SELLER_SNAPSHOT_KEYS = [
  "seller_snapshot_version",
  "seller_legal_name_snapshot",
  "seller_trade_name_snapshot",
  "seller_owner_name_snapshot",
  "seller_street_snapshot",
  "seller_postal_code_snapshot",
  "seller_city_snapshot",
  "seller_country_snapshot",
  "seller_tax_number_snapshot",
  "seller_vat_id_snapshot",
  "seller_email_snapshot",
  "seller_phone_snapshot",
  "seller_website_snapshot",
] as const;

export function getSellerSnapshotState(snapshot?: SellerSnapshotSource | null): SellerSnapshotState {
  const presentCount = SELLER_SNAPSHOT_KEYS.filter((key) => Boolean(snapshot?.[key]?.trim())).length;
  if (presentCount === 0) return "missing";
  if (presentCount === SELLER_SNAPSHOT_KEYS.length) return "complete";
  return "incomplete";
}

export function resolveSellerDetails(snapshot?: SellerSnapshotSource | null) {
  const state = getSellerSnapshotState(snapshot);
  if (state === "incomplete") {
    throw new SellerConfigurationError(
      "SELLER_SNAPSHOT_INCOMPLETE",
      "Der gespeicherte Verkäufer-Snapshot ist unvollständig.",
    );
  }
  if (state === "missing") return validateSellerDetails(SELLER_DETAILS);

  return validateSellerDetails({
    legalName: snapshot!.seller_legal_name_snapshot!,
    tradeName: snapshot!.seller_trade_name_snapshot!,
    ownerName: snapshot!.seller_owner_name_snapshot!,
    legalForm: SELLER_DETAILS.legalForm,
    street: snapshot!.seller_street_snapshot!,
    postalCode: snapshot!.seller_postal_code_snapshot!,
    city: snapshot!.seller_city_snapshot!,
    country: snapshot!.seller_country_snapshot!,
    taxNumber: snapshot!.seller_tax_number_snapshot!,
    vatId: snapshot!.seller_vat_id_snapshot!,
    email: snapshot!.seller_email_snapshot!,
    phone: snapshot!.seller_phone_snapshot!,
    website: snapshot!.seller_website_snapshot!,
  });
}

export function createSellerSnapshot() {
  const details = validateSellerDetails(SELLER_DETAILS);
  return {
    seller_snapshot_version: "business-profile-2026-08-v1",
    seller_legal_name_snapshot: details.legalName,
    seller_trade_name_snapshot: details.tradeName,
    seller_owner_name_snapshot: details.ownerName,
    seller_street_snapshot: details.street,
    seller_postal_code_snapshot: details.postalCode,
    seller_city_snapshot: details.city,
    seller_country_snapshot: details.country,
    seller_tax_number_snapshot: details.taxNumber,
    seller_vat_id_snapshot: details.vatId,
    seller_email_snapshot: details.email,
    seller_phone_snapshot: details.phone,
    seller_website_snapshot: details.website,
  };
}
