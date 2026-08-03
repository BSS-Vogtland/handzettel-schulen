export const BANK_TRANSFER_DETAILS = {
  accountHolder: "Röthig, Marius",
  bankName: "Sparkasse Vogtland",
  iban: "DE52 8705 8000 0101 0721 04",
  bic: "WELADED1PLX",
  currency: "EUR",
} as const;

export type BankTransferDetails = {
  accountHolder: string;
  bankName: string;
  iban: string;
  bic: string;
  currency: "EUR";
};

export type BankTransferSnapshotSource = {
  bank_account_holder_snapshot?: string | null;
  bank_name_snapshot?: string | null;
  bank_iban_snapshot?: string | null;
  bank_bic_snapshot?: string | null;
};

export type BankTransferSnapshotState = "complete" | "missing" | "incomplete";

export class BankTransferConfigurationError extends Error {
  readonly code: "BANK_TRANSFER_SNAPSHOT_INCOMPLETE" | "BANK_TRANSFER_CONFIGURATION_INVALID";

  constructor(code: BankTransferConfigurationError["code"], message: string) {
    super(message);
    this.name = "BankTransferConfigurationError";
    this.code = code;
  }
}

export function normalizeIban(value: string) {
  return value.replace(/ /g, "").toUpperCase();
}

export function formatIban(value: string) {
  return normalizeIban(value).replace(/(.{4})(?=.)/g, "$1 ");
}

export function isValidIbanMod97(value: string) {
  const iban = normalizeIban(value);
  if (!/^[A-Z0-9]{15,34}$/.test(iban)) return false;
  if (iban.startsWith("DE") && iban.length !== 22) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const character of rearranged) {
    const expanded = /[A-Z]/.test(character)
      ? String(character.charCodeAt(0) - 55)
      : character;
    for (const digit of expanded) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

export function validateBankTransferDetails(input: BankTransferDetails) {
  const accountHolder = input.accountHolder.trim();
  const bankName = input.bankName.trim();
  const iban = normalizeIban(input.iban);
  const bic = input.bic.trim().toUpperCase();
  if (!accountHolder) throw new Error("Kontoinhaber der Bankverbindung fehlt.");
  if (!bankName) throw new Error("Bankname der Bankverbindung fehlt.");
  if (/\s/.test(iban) || !/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) {
    throw new BankTransferConfigurationError("BANK_TRANSFER_CONFIGURATION_INVALID", "IBAN der Bankverbindung ist ungültig.");
  }
  if (!isValidIbanMod97(iban)) {
    throw new BankTransferConfigurationError("BANK_TRANSFER_CONFIGURATION_INVALID", "IBAN-Prüfsumme der Bankverbindung ist ungültig.");
  }
  if (!/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bic)) {
    throw new Error("BIC der Bankverbindung ist ungültig.");
  }
  if (input.currency !== "EUR") throw new Error("Banküberweisungen müssen EUR verwenden.");
  return { accountHolder, bankName, iban, bic, currency: "EUR" as const };
}

export function getBankTransferSnapshotState(snapshot?: BankTransferSnapshotSource | null): BankTransferSnapshotState {
  const values = [
    snapshot?.bank_account_holder_snapshot,
    snapshot?.bank_name_snapshot,
    snapshot?.bank_iban_snapshot,
    snapshot?.bank_bic_snapshot,
  ];
  const presentCount = values.filter((value) => Boolean(value?.trim())).length;
  if (presentCount === 0) return "missing";
  if (presentCount === values.length) return "complete";
  return "incomplete";
}

export function resolveBankTransferDetails(snapshot?: BankTransferSnapshotSource | null) {
  const snapshotState = getBankTransferSnapshotState(snapshot);
  if (snapshotState === "incomplete") {
    throw new BankTransferConfigurationError(
      "BANK_TRANSFER_SNAPSHOT_INCOMPLETE",
      "Der gespeicherte Bankverbindungs-Snapshot ist unvollständig.",
    );
  }
  if (snapshotState === "complete") {
    return validateBankTransferDetails({
      accountHolder: snapshot!.bank_account_holder_snapshot!,
      bankName: snapshot!.bank_name_snapshot!,
      iban: snapshot!.bank_iban_snapshot!,
      bic: snapshot!.bank_bic_snapshot!,
      currency: "EUR",
    });
  }
  return validateBankTransferDetails(BANK_TRANSFER_DETAILS);
}

export function createBankTransferSnapshot() {
  const details = validateBankTransferDetails(BANK_TRANSFER_DETAILS);
  return {
    bank_snapshot_version: "bank-profile-2026-08-v1",
    bank_account_holder_snapshot: details.accountHolder,
    bank_name_snapshot: details.bankName,
    bank_iban_snapshot: details.iban,
    bank_bic_snapshot: details.bic,
  };
}


export const PAYMENT_COPY = {
  bankTransferTitle: "Überweisung vorbereiten",
  bankTransferIntro:
    "Deine Zahlungsart wurde gespeichert. Bitte überweise den Gesamtbetrag mit dem angegebenen Verwendungszweck. Nach Zahlungseingang bereiten wir Dein Schulpaket weiter vor.",
  giroCodeHint:
    "Du kannst den QR-Code mit vielen Banking-Apps scannen. Bitte prüfe die Daten vor der Freigabe in Deiner Banking-App.",
  cashPickupTitle: "Barzahlung bei Abholung",
  cashPickupIntro:
    "Deine Zahlungsart wurde gespeichert. Du zahlst den Gesamtbetrag direkt bei Abholung im Laden.",
};
