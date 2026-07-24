import type {
  IsbnBookProvider,
  IsbnBookSource,
} from "@/lib/isbn/types";
import { freePublisherPriceProvider } from "@/lib/isbn/providers/freePublisherPrices";

export function getOptionalIsbnProviders(): IsbnBookProvider[] {
  return [freePublisherPriceProvider].filter(
    (provider) => provider.enabled,
  );
}

export async function resolveOptionalIsbnSources(
  isbn: string,
): Promise<IsbnBookSource[]> {
  const providers = getOptionalIsbnProviders();

  if (providers.length === 0) {
    return [];
  }

  const results = await Promise.allSettled(
    providers.map((provider) =>
      provider.resolve(isbn),
    ),
  );

  return results.flatMap((result) => {
    if (
      result.status !== "fulfilled" ||
      !result.value
    ) {
      return [];
    }

    return [result.value];
  });
}