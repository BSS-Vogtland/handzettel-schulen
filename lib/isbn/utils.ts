export function cleanIsbnString(value: unknown) {
  const cleaned = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned.length > 0 ? cleaned : null;
}

export function normalizeIsbn(value: unknown) {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[^0-9X]/g, "");
}

export function isValidIsbn10(isbn: string) {
  if (!/^\d{9}[\dX]$/.test(isbn)) {
    return false;
  }

  let sum = 0;

  for (let index = 0; index < 10; index += 1) {
    const character = isbn[index];
    const digit = character === "X" ? 10 : Number(character);

    sum += digit * (10 - index);
  }

  return sum % 11 === 0;
}

export function isValidIsbn13(isbn: string) {
  if (!/^\d{13}$/.test(isbn)) {
    return false;
  }

  const sum = isbn
    .slice(0, 12)
    .split("")
    .reduce((total, character, index) => {
      const digit = Number(character);

      return total + digit * (index % 2 === 0 ? 1 : 3);
    }, 0);

  const checkDigit = (10 - (sum % 10)) % 10;

  return checkDigit === Number(isbn[12]);
}

export function isValidIsbn(isbn: string) {
  if (isbn.length === 10) {
    return isValidIsbn10(isbn);
  }

  if (isbn.length === 13) {
    return isValidIsbn13(isbn);
  }

  return false;
}

export function convertIsbn10To13(isbn10: string) {
  if (!isValidIsbn10(isbn10)) {
    return null;
  }

  const base = `978${isbn10.slice(0, 9)}`;

  const sum = base.split("").reduce((total, character, index) => {
    const digit = Number(character);

    return total + digit * (index % 2 === 0 ? 1 : 3);
  }, 0);

  const checkDigit = (10 - (sum % 10)) % 10;

  return `${base}${checkDigit}`;
}

export function uniqueIsbnStrings(
  values: Array<string | null | undefined>
) {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const cleaned = cleanIsbnString(value);

    if (!cleaned) {
      continue;
    }

    const key = cleaned.toLocaleLowerCase("de-DE");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(cleaned);
  }

  return result;
}

export function forceHttps(value: unknown) {
  const url = cleanIsbnString(value);

  if (!url) {
    return null;
  }

  if (url.startsWith("http://")) {
    return `https://${url.slice("http://".length)}`;
  }

  return url;
}

export function parseIsbnPrice(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  const cleaned = String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[^\d,.-]/g, "")
    .trim();

  if (!cleaned) {
    return null;
  }

  let normalized = cleaned;

  if (cleaned.includes(",") && cleaned.includes(".")) {
    normalized =
      cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")
        ? cleaned.replace(/\./g, "").replace(",", ".")
        : cleaned.replace(/,/g, "");
  } else if (cleaned.includes(",")) {
    normalized = cleaned.replace(",", ".");
  }

  const parsed = Number(normalized);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export async function fetchIsbnJson<T>(
  url: string,
  options?: {
    headers?: HeadersInit;
    timeoutMs?: number;
  }
): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options?.timeoutMs ?? 12000
  );

  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "Handzettel-Schulen.de ISBN-Import/1.0",
        ...(options?.headers || {}),
      },
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}