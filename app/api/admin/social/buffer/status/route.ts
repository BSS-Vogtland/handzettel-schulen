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
};

type BufferChannel = {
  id: string;
  name?: string | null;
  displayName?: string | null;
  service?: string | null;
  avatar?: string | null;
  isQueuePaused?: boolean | null;
};

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getBufferApiKey() {
  return cleanString(process.env.BUFFER_API_KEY);
}

async function bufferGraphQl<T>(query: string) {
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
    body: JSON.stringify({ query }),
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

  const graphQlError = payload.errors?.map((error) => error.message).filter(Boolean).join(" | ");

  if (!response.ok || graphQlError) {
    throw new Error(
      `Buffer API Fehler. HTTP ${response.status}: ${graphQlError || JSON.stringify(payload).slice(0, 500)}`
    );
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

    const accountData = await bufferGraphQl<{
      account: {
        organizations: BufferOrganization[];
      };
    }>(`
      query GetBufferOrganizations {
        account {
          organizations {
            id
            name
          }
        }
      }
    `);

    const organizations = accountData.account?.organizations || [];
    const primaryOrganization = organizations[0] || null;

    let channels: BufferChannel[] = [];

    if (primaryOrganization?.id) {
      const organizationIdLiteral = JSON.stringify(primaryOrganization.id);

      const channelsData = await bufferGraphQl<{
        channels: BufferChannel[];
      }>(`
        query GetBufferChannels {
          channels(input: { organizationId: ${organizationIdLiteral} }) {
            id
            name
            displayName
            service
            avatar
            isQueuePaused
          }
        }
      `);

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
