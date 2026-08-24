export const ADMIN_SESSION_COOKIE = "hs_admin_session";

export type AdminSessionIdentity = { username: string; expiresAt: number };
export type AdminAuditActor = {
  actorType: "admin";
  actorReference: string;
};

const SESSION_DURATION_MS = 1000 * 60 * 60 * 12;

function getAdminSessionSecret() {
  const configuredSecret = process.env.ADMIN_SESSION_SECRET?.trim();

  if (configuredSecret) return configuredSecret;

  const adminUser = process.env.ADMIN_USER?.trim();
  const adminPassword = process.env.ADMIN_PASSWORD?.trim();

  if (!adminUser || !adminPassword) {
    throw new Error("ADMIN_USER und ADMIN_PASSWORD müssen gesetzt sein.");
  }

  return `${adminUser}:${adminPassword}`;
}

function textToBytes(value: string) {
  return new TextEncoder().encode(value);
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function createHmacSignature(value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    textToBytes(getAdminSessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, textToBytes(value));

  return bytesToBase64Url(new Uint8Array(signature));
}

function safeCompare(a: string, b: string) {
  if (a.length !== b.length) return false;

  let result = 0;

  for (let index = 0; index < a.length; index += 1) {
    result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }

  return result === 0;
}

export function getAdminSessionMaxAgeSeconds() {
  return Math.floor(SESSION_DURATION_MS / 1000);
}

export async function createAdminSessionToken(username: string) {
  const normalizedUsername = String(username || "admin").trim() || "admin";
  const expiresAt = Date.now() + SESSION_DURATION_MS;
  const payload = `${encodeURIComponent(normalizedUsername)}.${expiresAt}`;
  const signature = await createHmacSignature(payload);

  return `${payload}.${signature}`;
}

export async function getVerifiedAdminSession(
  token: string | undefined | null
): Promise<AdminSessionIdentity | null> {
  if (!token) return null;

  const parts = token.split(".");

  if (parts.length !== 3) return null;

  const [encodedUsername, expiresAtRaw, signature] = parts;
  const expiresAt = Number(expiresAtRaw);

  if (!encodedUsername || !Number.isFinite(expiresAt)) return null;
  if (Date.now() > expiresAt) return null;

  const payload = `${encodedUsername}.${expiresAtRaw}`;
  const expectedSignature = await createHmacSignature(payload);

  if (!safeCompare(signature, expectedSignature)) return null;

  try {
    const username = decodeURIComponent(encodedUsername).trim();
    return username ? { username, expiresAt } : null;
  } catch {
    return null;
  }
}

export async function verifyAdminSessionToken(token: string | undefined | null) {
  return (await getVerifiedAdminSession(token)) !== null;
}

export function getAdminAuditActorForUsername(username: string): AdminAuditActor {
  const normalizedUsername = username.trim().normalize("NFKC").toLowerCase();

  if (!normalizedUsername) {
    throw new Error("Admin-Audit-Identität ist nicht verfügbar.");
  }

  return {
    actorType: "admin",
    actorReference: `admin:${normalizedUsername}`,
  };
}

export async function getAdminAuditActorFromSessionToken(
  token: string | undefined | null
): Promise<AdminAuditActor | null> {
  const session = await getVerifiedAdminSession(token);
  return session ? getAdminAuditActorForUsername(session.username) : null;
}

export function validateAdminCredentials(input: {
  username: string;
  password: string;
}) {
  const adminUser = process.env.ADMIN_USER?.trim();
  const adminPassword = process.env.ADMIN_PASSWORD?.trim();

  if (!adminUser || !adminPassword) {
    throw new Error("Admin-Zugang ist nicht konfiguriert. Bitte ADMIN_USER und ADMIN_PASSWORD setzen.");
  }

  return (
    safeCompare(String(input.username || ""), adminUser) &&
    safeCompare(String(input.password || ""), adminPassword)
  );
}
