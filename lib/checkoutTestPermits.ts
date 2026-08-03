import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export const CHECKOUT_TEST_PERMIT_CREATE_CONFIRMATION =
  "CREATE_SINGLE_CHECKOUT_TEST_PERMIT";
export const CHECKOUT_MAINTENANCE_TEST_CONFIRMATION =
  "ADMIN_CHECKOUT_MAINTENANCE_TEST";
export const CHECKOUT_MAINTENANCE_TEST_HEADER =
  "X-Checkout-Maintenance-Test";
export const CHECKOUT_TEST_PERMIT_HEADER = "X-Checkout-Test-Permit";

export type CheckoutTestPermitType = "offer";

type RpcResult<T> = {
  data: T | null;
  error: { message?: string | null; code?: string | null } | null;
};

export type CheckoutTestPermitRpcClient = {
  rpc(
    name: string,
    params: Record<string, unknown>,
  ): PromiseLike<RpcResult<unknown>>;
};

export type CreatedCheckoutTestPermit = {
  permitToken: string;
  permitId: string;
  checkoutType: CheckoutTestPermitType;
  createdAt: string;
  expiresAt: string;
};

export type ConsumedCheckoutTestPermit = {
  permitId: string;
  consumedAt: string;
};

type PermitRow = {
  permit_id?: unknown;
  checkout_type?: unknown;
  target_reference_hash?: unknown;
  created_at?: unknown;
  expires_at?: unknown;
  consumed_at?: unknown;
};

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getSupabaseAdminClient(): CheckoutTestPermitRpcClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase-Service-Konfiguration fehlt.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function firstRow(data: unknown): PermitRow | null {
  if (!Array.isArray(data) || data.length !== 1) return null;
  const row = data[0];
  return row && typeof row === "object" && !Array.isArray(row)
    ? (row as PermitRow)
    : null;
}

function isIsoTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    Number.isFinite(Date.parse(value))
  );
}

export function hashCheckoutTestPermitToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function hashCheckoutTestTargetReference(
  checkoutType: "offer",
  targetReference: string,
): string {
  return createHash("sha256")
    .update(`checkout-test-target:${checkoutType}:${targetReference}`, "utf8")
    .digest("hex");
}

export function normalizeCheckoutTestTargetReference(
  checkoutType: "offer",
  targetReference: string,
): string {
  return hashCheckoutTestTargetReference(checkoutType, targetReference);
}

export function isValidCheckoutTestOfferToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{16}$/.test(value);
}

export function generateCheckoutTestPermitToken(): string {
  return randomBytes(32).toString("hex");
}

export function isCheckoutTestRequestSameOrigin(request: Request): boolean {
  let requestOrigin: string;
  try {
    requestOrigin = new URL(request.url).origin;
  } catch {
    return false;
  }

  const origin = request.headers.get("origin")?.trim();
  if (origin) return origin === requestOrigin;

  const referer = request.headers.get("referer")?.trim();
  if (!referer) return false;
  try {
    return new URL(referer).origin === requestOrigin;
  } catch {
    return false;
  }
}

export async function readCheckoutMaintenanceTestInput(
  request: Request,
): Promise<{
  confirmation: string | null;
}> {
  try {
    const body = (await request.clone().json()) as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return { confirmation: null };
    }
    const record = body as Record<string, unknown>;
    const confirmation = record[
      "checkoutMaintenanceTestConfirmation"
    ];
    return {
      confirmation: typeof confirmation === "string" ? confirmation : null,
    };
  } catch {
    return { confirmation: null };
  }
}

export async function createCheckoutTestPermit(
  input: {
    checkoutType: CheckoutTestPermitType;
    targetReference: string;
    expiresInMinutes?: number;
  },
  client: CheckoutTestPermitRpcClient = getSupabaseAdminClient(),
): Promise<CreatedCheckoutTestPermit> {
  if (input.checkoutType !== "offer") {
    throw new Error("Checkout-Testfreigaben sind ausschließlich für Angebote zulässig.");
  }
  if (!isValidCheckoutTestOfferToken(input.targetReference)) {
    throw new Error("Offer-Zielreferenz ist ungültig.");
  }
  const permitToken = generateCheckoutTestPermitToken();
  const permitHash = hashCheckoutTestPermitToken(permitToken);
  const hashedTargetReference = normalizeCheckoutTestTargetReference(
    input.checkoutType,
    input.targetReference,
  );
  const expiresInMinutes = input.expiresInMinutes ?? 10;

  const { data, error } = await client.rpc("create_checkout_test_permit", {
    p_permit_hash: permitHash,
    p_checkout_type: input.checkoutType,
    p_target_reference_hash: hashedTargetReference,
    p_expires_in_minutes: expiresInMinutes,
  });
  if (error) {
    throw new Error(error.message || "Checkout-Testfreigabe konnte nicht erstellt werden.");
  }

  const row = firstRow(data);
  if (
    !row ||
    typeof row.permit_id !== "string" ||
    !UUID_PATTERN.test(row.permit_id) ||
    row.checkout_type !== input.checkoutType ||
    row.target_reference_hash !== hashedTargetReference ||
    !isIsoTimestamp(row.created_at) ||
    !isIsoTimestamp(row.expires_at) ||
    !SHA256_PATTERN.test(permitHash)
  ) {
    throw new Error("Checkout-Testfreigabe lieferte ein ungültiges RPC-Ergebnis.");
  }

  return {
    permitToken,
    permitId: row.permit_id,
    checkoutType: input.checkoutType,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

export async function consumeCheckoutTestPermit(
  input: {
    permitToken: string;
    checkoutType: CheckoutTestPermitType;
    targetReference: string;
  },
  client: CheckoutTestPermitRpcClient = getSupabaseAdminClient(),
): Promise<ConsumedCheckoutTestPermit | null> {
  if (input.checkoutType !== "offer") return null;
  if (!/^[a-f0-9]{64}$/.test(input.permitToken)) return null;
  if (!isValidCheckoutTestOfferToken(input.targetReference)) return null;

  const permitHash = hashCheckoutTestPermitToken(input.permitToken);
  const targetReference = normalizeCheckoutTestTargetReference(
    input.checkoutType,
    input.targetReference,
  );
  const { data, error } = await client.rpc("consume_checkout_test_permit", {
    p_permit_hash: permitHash,
    p_checkout_type: input.checkoutType,
    p_target_reference_hash: targetReference,
  });
  if (error) return null;

  const row = firstRow(data);
  if (
    !row ||
    typeof row.permit_id !== "string" ||
    !UUID_PATTERN.test(row.permit_id) ||
    !isIsoTimestamp(row.consumed_at)
  ) {
    return null;
  }

  return { permitId: row.permit_id, consumedAt: row.consumed_at };
}
