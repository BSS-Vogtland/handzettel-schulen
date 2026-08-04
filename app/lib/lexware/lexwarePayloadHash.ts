import { createHash } from "node:crypto";

export const LEXWARE_PAYLOAD_HASH_V1 = "lexware-payload-json-v1" as const;
export const LEXWARE_PAYLOAD_HASH_V2 = "lexware-payload-canonical-v2" as const;
export type LexwarePayloadHashVersion =
  | typeof LEXWARE_PAYLOAD_HASH_V1
  | typeof LEXWARE_PAYLOAD_HASH_V2;

export function parseLexwarePayloadHashVersion(value: unknown): LexwarePayloadHashVersion {
  if (value === LEXWARE_PAYLOAD_HASH_V1 || value === LEXWARE_PAYLOAD_HASH_V2) return value;
  throw new Error("LEXWARE_PAYLOAD_HASH_VERSION_INVALID");
}

function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("LEXWARE_PAYLOAD_CANONICAL_NUMBER_INVALID");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.some(([, entry]) => entry === undefined)) {
      throw new Error("LEXWARE_PAYLOAD_CANONICAL_UNDEFINED_INVALID");
    }
    return `{${entries.sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(",")}}`;
  }
  throw new Error("LEXWARE_PAYLOAD_CANONICAL_VALUE_INVALID");
}

export function buildLexwarePayloadSha256(input: {
  payload: unknown;
  version: LexwarePayloadHashVersion;
}): string {
  const serialized = input.version === LEXWARE_PAYLOAD_HASH_V1
    ? JSON.stringify(input.payload)
    : canonicalJson(input.payload);
  if (serialized === undefined) throw new Error("LEXWARE_PAYLOAD_SERIALIZATION_INVALID");
  return createHash("sha256").update(serialized, "utf8").digest("hex");
}
