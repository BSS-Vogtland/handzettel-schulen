import type {
  IsbnBookProvider,
  IsbnBookSource,
} from "@/lib/isbn/types";
import { vlbProvider } from "@/lib/isbn/providers/vlb";

export function getOptionalIsbnProviders(): IsbnBookProvider[] {
  return [vlbProvider].filter((provider) => provider.enabled);
}

export async function resolveOptionalIsbnSources(
  isbn: string
): Promise<IsbnBookSource[]> {
  const providers = getOptionalIsbnProviders();

  if (providers.length === 0) {
    return [];
  }

  const results = await Promise.allSettled(
    providers.map((provider) => provider.resolve(isbn))
  );

  return results.flatMap((result) => {
    if (result.status !== "fulfilled" || !result.value) {
      return [];
    }

    return [result.value];
  });
}