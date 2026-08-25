export function resolvePayPalPaymentsEnabled(
  value: unknown,
  hasError = false,
) {
  if (hasError || !value || typeof value !== "object") return false;
  return Reflect.get(value, "paypal_payments_enabled") === true;
}
