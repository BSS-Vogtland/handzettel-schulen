export class AdminMutationRequestError extends Error {
  readonly code: "SAME_ORIGIN_REQUIRED" | "BODY_TOO_LARGE" | "JSON_INVALID";

  constructor(code: "SAME_ORIGIN_REQUIRED" | "BODY_TOO_LARGE" | "JSON_INVALID") {
    super(code);
    this.name = "AdminMutationRequestError";
    this.code = code;
  }
}

export function hasSameRequestOrigin(request: Request): boolean {
  const source = request.headers.get("origin") ?? request.headers.get("referer");
  if (!source) return false;
  try {
    return new URL(source).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export async function readLimitedJsonBody(request: Request, maxBytes: number): Promise<unknown> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (!Number.isFinite(parsedLength) || parsedLength < 0 || parsedLength > maxBytes) {
      throw new AdminMutationRequestError("BODY_TOO_LARGE");
    }
  }
  if (!request.body) throw new AdminMutationRequestError("JSON_INVALID");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > maxBytes) {
      await reader.cancel();
      throw new AdminMutationRequestError("BODY_TOO_LARGE");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new AdminMutationRequestError("JSON_INVALID");
  }
}

export function hasExactConfirmation(body: unknown, confirmation: string): boolean {
  return typeof body === "object" && body !== null && !Array.isArray(body)
    && Object.keys(body).length === 1 && "confirmation" in body
    && body.confirmation === confirmation;
}
