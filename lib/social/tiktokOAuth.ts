import { randomBytes } from "node:crypto";
import { supabaseServer } from "@/lib/supabase/server";

const TIKTOK_AUTHORIZE_URL = "https://www.tiktok.com/v2/auth/authorize/";
const TIKTOK_TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const TIKTOK_USER_INFO_URL =
  "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url";

export type TikTokStoredConnection = {
  id: string;
  platform: string;
  account_name: string | null;
  external_account_id: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_type: string | null;
  scope: string | null;
  expires_at: string | null;
  refresh_expires_at: string | null;
  is_active: boolean;
  metadata: Record<string, unknown> | null;
  connected_at: string | null;
  updated_at: string | null;
};

export type TikTokTokenResponse = {
  access_token?: string;
  expires_in?: number;
  open_id?: string;
  refresh_expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
  log_id?: string;
};

type TikTokUserInfoResponse = {
  data?: {
    user?: {
      open_id?: string;
      display_name?: string;
      avatar_url?: string;
    };
  };
  error?: {
    code?: string;
    message?: string;
    log_id?: string;
  };
};

export function cleanTikTokString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function getTikTokOAuthConfig() {
  const clientKey = cleanTikTokString(process.env.TIKTOK_CLIENT_KEY);
  const clientSecret = cleanTikTokString(process.env.TIKTOK_CLIENT_SECRET);
  const redirectUri = cleanTikTokString(process.env.TIKTOK_REDIRECT_URI);

  return {
    clientKey,
    clientSecret,
    redirectUri,
    configured: Boolean(clientKey && clientSecret && redirectUri),
  };
}

export function getTikTokScopes() {
  const envScopes = cleanTikTokString(process.env.TIKTOK_OAUTH_SCOPES);

  if (envScopes) {
    return envScopes
      .split(/[,\s]+/)
      .map((scope) => scope.trim())
      .filter(Boolean)
      .join(",");
  }

  return "user.info.basic";
}

export function createTikTokOAuthState() {
  return randomBytes(24).toString("hex");
}

export function buildTikTokAuthorizationUrl({ state }: { state: string }) {
  const config = getTikTokOAuthConfig();

  if (!config.clientKey || !config.redirectUri) {
    throw new Error(
      "TikTok OAuth ist nicht vollstaendig konfiguriert. TIKTOK_CLIENT_KEY und TIKTOK_REDIRECT_URI muessen gesetzt sein."
    );
  }

  const url = new URL(TIKTOK_AUTHORIZE_URL);

  url.searchParams.set("client_key", config.clientKey);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", getTikTokScopes());
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("disable_auto_auth", "1");

  return url;
}

function buildTokenExpiration(seconds: number | undefined) {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return null;

  return new Date(Date.now() + seconds * 1000).toISOString();
}

async function requestTikTokToken(params: URLSearchParams) {
  const response = await fetch(TIKTOK_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Cache-Control": "no-cache",
    },
    body: params,
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as
    | TikTokTokenResponse
    | null;

  if (!response.ok || !payload) {
    throw new Error(
      `TikTok Token-Anfrage fehlgeschlagen: ${
        payload?.error_description || payload?.error || response.status
      }`
    );
  }

  if (payload.error) {
    throw new Error(
      `TikTok OAuth Fehler: ${payload.error_description || payload.error}`
    );
  }

  if (!payload.access_token) {
    throw new Error("TikTok hat keinen Access Token zurueckgegeben.");
  }

  return payload;
}

export async function exchangeTikTokCodeForToken(code: string) {
  const config = getTikTokOAuthConfig();

  if (!config.configured) {
    throw new Error(
      "TikTok OAuth ist nicht vollstaendig konfiguriert. Pruefe TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET und TIKTOK_REDIRECT_URI."
    );
  }

  const params = new URLSearchParams();

  params.set("client_key", config.clientKey);
  params.set("client_secret", config.clientSecret);
  params.set("code", code);
  params.set("grant_type", "authorization_code");
  params.set("redirect_uri", config.redirectUri);

  return requestTikTokToken(params);
}

export async function refreshTikTokToken(refreshToken: string) {
  const config = getTikTokOAuthConfig();

  if (!config.clientKey || !config.clientSecret) {
    throw new Error(
      "TikTok OAuth ist nicht vollstaendig konfiguriert. Pruefe TIKTOK_CLIENT_KEY und TIKTOK_CLIENT_SECRET."
    );
  }

  const params = new URLSearchParams();

  params.set("client_key", config.clientKey);
  params.set("client_secret", config.clientSecret);
  params.set("grant_type", "refresh_token");
  params.set("refresh_token", refreshToken);

  return requestTikTokToken(params);
}

export async function verifyTikTokUserInfo(accessToken: string) {
  const response = await fetch(TIKTOK_USER_INFO_URL, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as
    | TikTokUserInfoResponse
    | null;

  if (!response.ok || !payload) {
    return {
      ok: false,
      status: response.status,
      error: payload || {
        message: "TikTok User Info konnte nicht gelesen werden.",
      },
    };
  }

  if (payload.error && payload.error.code && payload.error.code !== "ok") {
    return {
      ok: false,
      status: response.status,
      error: payload.error,
    };
  }

  const user = payload.data?.user || null;

  return {
    ok: Boolean(user?.open_id),
    status: response.status,
    payload,
    user,
  };
}

export async function loadStoredTikTokConnection() {
  const { data, error } = await supabaseServer
    .from("social_platform_connections")
    .select(
      "id, platform, account_name, external_account_id, access_token, refresh_token, token_type, scope, expires_at, refresh_expires_at, is_active, metadata, connected_at, updated_at"
    )
    .eq("platform", "tiktok")
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data || null) as TikTokStoredConnection | null;
}

export async function saveTikTokConnection(token: TikTokTokenResponse) {
  const now = new Date().toISOString();

  const accessToken = cleanTikTokString(token.access_token);
  const refreshToken = cleanTikTokString(token.refresh_token);
  const openId = cleanTikTokString(token.open_id);
  const scope = cleanTikTokString(token.scope);
  const tokenType = cleanTikTokString(token.token_type || "Bearer");

  if (!accessToken) {
    throw new Error("TikTok Access Token fehlt und kann nicht gespeichert werden.");
  }

  const expiresAt = buildTokenExpiration(token.expires_in);
  const refreshExpiresAt = buildTokenExpiration(token.refresh_expires_in);

  const { data, error } = await supabaseServer
    .from("social_platform_connections")
    .upsert(
      {
        platform: "tiktok",
        external_account_id: openId || null,
        access_token: accessToken,
        refresh_token: refreshToken || null,
        token_type: tokenType || "Bearer",
        scope: scope || null,
        expires_at: expiresAt,
        refresh_expires_at: refreshExpiresAt,
        is_active: true,
        connected_at: now,
        updated_at: now,
        metadata: {
          open_id: openId || null,
          scope: scope || null,
          token_type: tokenType || "Bearer",
          expires_in: token.expires_in || null,
          refresh_expires_in: token.refresh_expires_in || null,
          saved_at: now,
        },
      },
      { onConflict: "platform" }
    )
    .select(
      "id, platform, account_name, external_account_id, access_token, refresh_token, token_type, scope, expires_at, refresh_expires_at, is_active, metadata, connected_at, updated_at"
    )
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as TikTokStoredConnection;
}

export async function updateTikTokConnectionAccountInfo({
  connection,
  user,
}: {
  connection: TikTokStoredConnection;
  user: {
    open_id?: string;
    display_name?: string;
    avatar_url?: string;
  } | null;
}) {
  if (!user?.open_id && !user?.display_name && !user?.avatar_url) {
    return connection;
  }

  const metadata = {
    ...(connection.metadata || {}),
    user_info: user || null,
    user_info_checked_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseServer
    .from("social_platform_connections")
    .update({
      external_account_id: user.open_id || connection.external_account_id,
      account_name: user.display_name || connection.account_name,
      metadata,
      updated_at: new Date().toISOString(),
    })
    .eq("id", connection.id)
    .select(
      "id, platform, account_name, external_account_id, access_token, refresh_token, token_type, scope, expires_at, refresh_expires_at, is_active, metadata, connected_at, updated_at"
    )
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as TikTokStoredConnection;
}

export function buildPublicConnectionStatus({
  storedConnection,
}: {
  storedConnection: TikTokStoredConnection | null;
}) {
  const envAccessToken = cleanTikTokString(process.env.TIKTOK_ACCESS_TOKEN);
  const envRefreshToken = cleanTikTokString(process.env.TIKTOK_REFRESH_TOKEN);
  const envOpenId = cleanTikTokString(process.env.TIKTOK_OPEN_ID);
  const config = getTikTokOAuthConfig();

  const dbAccessToken = cleanTikTokString(storedConnection?.access_token);
  const dbRefreshToken = cleanTikTokString(storedConnection?.refresh_token);
  const dbOpenId = cleanTikTokString(storedConnection?.external_account_id);

  const activeAccessToken = dbAccessToken || envAccessToken;

  return {
    source: dbAccessToken ? "database" : envAccessToken ? "environment" : "none",
    activeAccessToken,
    config: {
      clientKeySet: Boolean(config.clientKey),
      clientSecretSet: Boolean(config.clientSecret),
      redirectUriSet: Boolean(config.redirectUri),
      accessTokenSet: Boolean(activeAccessToken),
      refreshTokenSet: Boolean(dbRefreshToken || envRefreshToken),
      openIdSet: Boolean(dbOpenId || envOpenId),
      configured: config.configured,
      tokenConfigured: Boolean(activeAccessToken),
      scopes: getTikTokScopes(),
      expiresAt: storedConnection?.expires_at || null,
      refreshExpiresAt: storedConnection?.refresh_expires_at || null,
      storedConnectionId: storedConnection?.id || null,
      accountName: storedConnection?.account_name || null,
      externalAccountId: storedConnection?.external_account_id || null,
    },
  };
}
