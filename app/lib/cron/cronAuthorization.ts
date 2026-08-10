import { createHash, timingSafeEqual } from "node:crypto";

type CronEnvironment = Readonly<Record<string, string | undefined>>;
type HeaderSource = Pick<Request, "headers">;

const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();

export function isLexwareCronRequestAuthorized(
  request: HeaderSource,
  environment: CronEnvironment = process.env,
) {
  const secret = environment.CRON_SECRET?.trim();
  if (!secret) return false;

  const authorization = request.headers.get("authorization");
  if (!authorization) return false;

  return timingSafeEqual(
    digest(authorization),
    digest(`Bearer ${secret}`),
  );
}
