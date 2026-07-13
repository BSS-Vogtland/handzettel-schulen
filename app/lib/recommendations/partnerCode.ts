import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  recommendationProjectKey,
  throwRecommendationDatabaseError,
} from "@/app/lib/recommendations/serviceSupport";

export function getRecommendationPartnerCodePrefix(projectKey: string) {
  if (projectKey === "handzettel-schulen") return "HZS-P-";

  const compact = projectKey.replace(/[^a-z0-9]/gi, "").toUpperCase();
  return `${compact.slice(0, 3).padEnd(3, "X")}-P-`;
}

export function formatRecommendationPartnerCode(
  projectKey: string,
  number: number,
) {
  const prefix = getRecommendationPartnerCodePrefix(projectKey);
  return `${prefix}${String(number).padStart(6, "0")}`;
}

export async function generateAvailableRecommendationPartnerCode(
  supabase: SupabaseClient,
  projectKeyValue: string,
) {
  const projectKey = recommendationProjectKey(projectKeyValue);
  const prefix = getRecommendationPartnerCodePrefix(projectKey);
  const { data, error } = await supabase
    .from("recommendation_partners")
    .select("partner_code")
    .eq("project_key", projectKey)
    .like("partner_code", `${prefix}%`)
    .order("partner_code", { ascending: false })
    .limit(1);

  if (error) {
    throwRecommendationDatabaseError(error, {
      fallback: "Die Partnerkennung konnte nicht erzeugt werden.",
    });
  }

  const latestCode =
    data?.[0] && typeof data[0].partner_code === "string"
      ? data[0].partner_code
      : null;
  const latestNumber = latestCode?.startsWith(prefix)
    ? Number(latestCode.slice(prefix.length))
    : 0;
  const start = Number.isInteger(latestNumber) && latestNumber >= 0
    ? latestNumber + 1
    : 1;

  for (let offset = 0; offset < 25; offset += 1) {
    const candidate = formatRecommendationPartnerCode(projectKey, start + offset);
    const { data: collision, error: collisionError } = await supabase
      .from("recommendation_partners")
      .select("id")
      .eq("project_key", projectKey)
      .eq("partner_code", candidate)
      .maybeSingle();

    if (collisionError) {
      throwRecommendationDatabaseError(collisionError, {
        fallback: "Die Partnerkennung konnte nicht geprüft werden.",
      });
    }
    if (!collision) return candidate;
  }

  throw new Error("Es konnte keine freie Partnerkennung ermittelt werden.");
}
