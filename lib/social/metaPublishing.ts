type MetaPlatform = "facebook" | "instagram";

type MetaConfig = {
  graphApiVersion: string;
  facebookPageId: string;
  facebookAccessToken: string;
  instagramBusinessAccountId: string;
  instagramAccessToken: string;
};

type MetaGraphErrorPayload = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
};

type MetaPublishResult = {
  platform: MetaPlatform;
  ok: true;
  id: string | null;
  postId?: string | null;
  creationId?: string | null;
  raw: unknown;
};

export type MetaPublishFailure = {
  platform: MetaPlatform;
  ok: false;
  message: string;
  raw?: unknown;
};

export type MetaPublishPlatformResult = MetaPublishResult | MetaPublishFailure;

function cleanEnv(value: string | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

export function getMetaConfig(): MetaConfig {
  const sharedToken = cleanEnv(process.env.META_ACCESS_TOKEN);

  return {
    graphApiVersion: cleanEnv(process.env.META_GRAPH_API_VERSION) || "v25.0",
    facebookPageId:
      cleanEnv(process.env.META_FACEBOOK_PAGE_ID) ||
      cleanEnv(process.env.META_PAGE_ID),
    facebookAccessToken:
      cleanEnv(process.env.META_FACEBOOK_PAGE_ACCESS_TOKEN) || sharedToken,
    instagramBusinessAccountId:
      cleanEnv(process.env.META_INSTAGRAM_BUSINESS_ACCOUNT_ID) ||
      cleanEnv(process.env.META_IG_USER_ID),
    instagramAccessToken:
      cleanEnv(process.env.META_INSTAGRAM_ACCESS_TOKEN) || sharedToken,
  };
}

export function getMetaConfigStatus() {
  const config = getMetaConfig();

  return {
    graphApiVersion: config.graphApiVersion,
    facebook: {
      configured: Boolean(config.facebookPageId && config.facebookAccessToken),
      pageIdSet: Boolean(config.facebookPageId),
      tokenSet: Boolean(config.facebookAccessToken),
    },
    instagram: {
      configured: Boolean(
        config.instagramBusinessAccountId && config.instagramAccessToken
      ),
      businessAccountIdSet: Boolean(config.instagramBusinessAccountId),
      tokenSet: Boolean(config.instagramAccessToken),
    },
  };
}

export function getConfiguredMetaPlatforms(): MetaPlatform[] {
  const status = getMetaConfigStatus();
  const platforms: MetaPlatform[] = [];

  if (status.facebook.configured) platforms.push("facebook");
  if (status.instagram.configured) platforms.push("instagram");

  return platforms;
}

function getGraphBaseUrl(version: string) {
  return `https://graph.facebook.com/${version.replace(/^\//, "")}`;
}

function buildMetaErrorMessage(payload: unknown, fallback: string) {
  const parsed = payload as MetaGraphErrorPayload;
  const error = parsed?.error;

  if (!error) return fallback;

  const details = [
    error.message,
    error.type ? `Typ: ${error.type}` : null,
    typeof error.code === "number" ? `Code: ${error.code}` : null,
    typeof error.error_subcode === "number"
      ? `Subcode: ${error.error_subcode}`
      : null,
    error.fbtrace_id ? `fbtrace_id: ${error.fbtrace_id}` : null,
  ].filter(Boolean);

  return details.length > 0 ? details.join(" | ") : fallback;
}

async function postGraphApi({
  version,
  edge,
  params,
}: {
  version: string;
  edge: string;
  params: Record<string, string>;
}) {
  const body = new URLSearchParams(params);
  const response = await fetch(
    `${getGraphBaseUrl(version)}/${edge.replace(/^\//, "")}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body,
      cache: "no-store",
    }
  );

  const payload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    throw new Error(
      buildMetaErrorMessage(
        payload,
        `Meta Graph API Fehler bei ${edge}: HTTP ${response.status}`
      )
    );
  }

  return payload;
}

async function getGraphApi({
  version,
  edge,
  accessToken,
  fields,
}: {
  version: string;
  edge: string;
  accessToken: string;
  fields: string;
}) {
  const url = new URL(`${getGraphBaseUrl(version)}/${edge.replace(/^\//, "")}`);
  url.searchParams.set("fields", fields);
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    throw new Error(
      buildMetaErrorMessage(
        payload,
        `Meta Graph API Fehler bei ${edge}: HTTP ${response.status}`
      )
    );
  }

  return payload;
}

function pickString(value: unknown, key: string) {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  return typeof record[key] === "string" ? record[key] : null;
}

export async function verifyMetaConnection() {
  const config = getMetaConfig();
  const status = getMetaConfigStatus();

  const result: {
    config: ReturnType<typeof getMetaConfigStatus>;
    facebook?: { ok: boolean; name?: string | null; id?: string | null; error?: string };
    instagram?: { ok: boolean; username?: string | null; id?: string | null; error?: string };
  } = { config: status };

  if (status.facebook.configured) {
    try {
      const payload = await getGraphApi({
        version: config.graphApiVersion,
        edge: config.facebookPageId,
        accessToken: config.facebookAccessToken,
        fields: "id,name",
      });

      result.facebook = {
        ok: true,
        id: pickString(payload, "id"),
        name: pickString(payload, "name"),
      };
    } catch (error) {
      result.facebook = {
        ok: false,
        error: error instanceof Error ? error.message : "Facebook-Prüfung fehlgeschlagen.",
      };
    }
  }

  if (status.instagram.configured) {
    try {
      const payload = await getGraphApi({
        version: config.graphApiVersion,
        edge: config.instagramBusinessAccountId,
        accessToken: config.instagramAccessToken,
        fields: "id,username",
      });

      result.instagram = {
        ok: true,
        id: pickString(payload, "id"),
        username: pickString(payload, "username"),
      };
    } catch (error) {
      result.instagram = {
        ok: false,
        error:
          error instanceof Error ? error.message : "Instagram-Prüfung fehlgeschlagen.",
      };
    }
  }

  return result;
}

export async function publishFacebookPhoto({
  imageUrl,
  caption,
}: {
  imageUrl: string;
  caption: string;
}): Promise<MetaPublishResult> {
  const config = getMetaConfig();

  if (!config.facebookPageId || !config.facebookAccessToken) {
    throw new Error(
      "Meta Facebook ist nicht vollständig konfiguriert. Benötigt: META_FACEBOOK_PAGE_ID und META_FACEBOOK_PAGE_ACCESS_TOKEN oder META_ACCESS_TOKEN."
    );
  }

  const payload = await postGraphApi({
    version: config.graphApiVersion,
    edge: `${config.facebookPageId}/photos`,
    params: {
      url: imageUrl,
      caption,
      published: "true",
      access_token: config.facebookAccessToken,
    },
  });

  return {
    platform: "facebook",
    ok: true,
    id: pickString(payload, "id"),
    postId: pickString(payload, "post_id"),
    raw: payload,
  };
}

export async function publishInstagramImage({
  imageUrl,
  caption,
}: {
  imageUrl: string;
  caption: string;
}): Promise<MetaPublishResult> {
  const config = getMetaConfig();

  if (!config.instagramBusinessAccountId || !config.instagramAccessToken) {
    throw new Error(
      "Meta Instagram ist nicht vollständig konfiguriert. Benötigt: META_INSTAGRAM_BUSINESS_ACCOUNT_ID und META_INSTAGRAM_ACCESS_TOKEN oder META_ACCESS_TOKEN."
    );
  }

  const containerPayload = await postGraphApi({
    version: config.graphApiVersion,
    edge: `${config.instagramBusinessAccountId}/media`,
    params: {
      image_url: imageUrl,
      caption,
      access_token: config.instagramAccessToken,
    },
  });

  const creationId = pickString(containerPayload, "id");

  if (!creationId) {
    throw new Error(
      "Instagram hat keinen Media-Container zurückgegeben. Veröffentlichung wurde abgebrochen."
    );
  }

  const publishPayload = await postGraphApi({
    version: config.graphApiVersion,
    edge: `${config.instagramBusinessAccountId}/media_publish`,
    params: {
      creation_id: creationId,
      access_token: config.instagramAccessToken,
    },
  });

  return {
    platform: "instagram",
    ok: true,
    id: pickString(publishPayload, "id"),
    creationId,
    raw: publishPayload,
  };
}
