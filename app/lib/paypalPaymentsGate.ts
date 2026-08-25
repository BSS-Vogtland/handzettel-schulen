import { supabaseServer } from "@/lib/supabase/server";
import { resolvePayPalPaymentsEnabled } from "@/app/lib/paypalPaymentsGateCore";

export { resolvePayPalPaymentsEnabled } from "@/app/lib/paypalPaymentsGateCore";

export const PAYPAL_DISABLED_CODE = "PAYPAL_TEMPORARILY_DISABLED";
export const PAYPAL_DISABLED_MESSAGE =
  "PayPal ist derzeit vorübergehend nicht verfügbar. Bitte wähle eine andere Zahlungsart.";

type RuntimeSettingsReader = Pick<typeof supabaseServer, "from">;

export async function isPayPalPaymentsEnabled(
  client: RuntimeSettingsReader = supabaseServer,
) {
  const { data, error } = await client
    .from("business_runtime_settings")
    .select("paypal_payments_enabled")
    .eq("id", "default")
    .maybeSingle();

  return resolvePayPalPaymentsEnabled(data, Boolean(error));
}
