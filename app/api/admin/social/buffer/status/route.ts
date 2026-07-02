import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUFFER_API_URL = "https://api.buffer.com";

type BufferGraphQlResponse<T> = {
  data?: T;
  errors?: Array<{
    message?: string;
  }>;
};

type BufferOrganization = {
  id: string;
  name: string;
  channelCount?: number;
  ownerEmail?: string | null;
};

type BufferChannel = {
  id: string;
  name?: string | null;
  displayName?: string | null;
  descriptor?: string | null;
  service?: string | null;
  type?: string | null;
  isDisconnected?: boolean | null;
  isLocked?: boolean | null;
  timezone?: string | null;
};

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getBufferApiKey() {
  return cleanString(process.env.BUFFER_API_KEY);
}

async function bufferGraphQl<T>(
  query: string,
  variables?: Record<string, unknown>
) {
  const apiKey = getBufferApiKey();

  if (!apiKey) {
    throw new Error("BUFFER_API_KEY fehlt in den Umgebungsvariablen.");
  }

  const response = await fetch(BUFFER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query,
      variables: variables || {},
    }),
    cache: "no-store",
  });

  const text = await response.text();

  let payload: BufferGraphQlResponse<T> | null = null;

  try {
    payload = JSON.parse(text) as BufferGraphQlResponse<T>;
  } catch {
    throw new Error(
      `Buffer API hat keine JSON-Antwort geliefert. HTTP ${response.status}: ${text.slice(0, 300)}`
    );
  }

  if (!response.ok) {
    throw new Error(
      `Buffer API Fehler: HTTP ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`
    );
  }

  const graphQlError = payload.errors?.[0]?.message;

  if (graphQlError) {
    throw new Error(graphQlError);
  }

  if (!payload.data) {
    throw new Error("Buffer API hat keine Daten geliefert.");
  }

  return payload.data;
}

export async function GET() {
  try {
    const apiKey = getBufferApiKey();

    if (!apiKey) {
      return NextResponse.json({
        ok: false,
        configured: false,
        message: "BUFFER_API_KEY fehlt.",
        organizations: [],
        channels: [],
        tiktokChannels: [],
      });
    }

    const organizationsData = await bufferGraphQl<{
      organizations: BufferOrganization[];
    }>(`
      query BufferOrganizations {
        organizations {
          id
          name
          channelCount
          ownerEmail
        }
      }
    `);

    const organizations = organizationsData.organizations || [];
    const primaryOrganization = organizations[0] || null;

    let channels: BufferChannel[] = [];

    if (primaryOrganization?.id) {
      const channelsData = await bufferGraphQl<{
        channels: BufferChannel[];
      }>(
        `
          query BufferChannels($organizationId: OrganizationId!) {
            channels(input: { organizationId: $organizationId }) {
              id
              name
              displayName
              descriptor
              service
              type
              isDisconnected
              isLocked
              timezone
            }
          }
        `,
        {
          organizationId: primaryOrganization.id,
        }
      );

      channels = channelsData.channels || [];
    }

    return NextResponse.json({
      ok: true,
      configured: true,
      message: "Buffer ist erreichbar.",
      organizations,
      primaryOrganization,
      channels,
      tiktokChannels: channels.filter(
        (channel) => cleanString(channel.service).toLowerCase() === "tiktok"
      ),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        configured: Boolean(getBufferApiKey()),
        message:
          error instanceof Error
            ? error.message
            : "Unbekannter Fehler beim Buffer-Status.",
        organizations: [],
        channels: [],
        tiktokChannels: [],
      },
      { status: 500 }
    );
  }
}
