export const CHECKOUT_MAINTENANCE_ACTIVE = true;

export const CHECKOUT_MAINTENANCE_CODE = "CHECKOUT_MAINTENANCE";
export const CHECKOUT_MAINTENANCE_HTTP_STATUS = 503;
export const CHECKOUT_MAINTENANCE_MESSAGE =
  "Wir führen derzeit Wartungsarbeiten an unserem Bestellsystem durch. Bestellungen können voraussichtlich ab Sonntagabend wieder abgeschlossen werden. Vielen Dank für Ihr Verständnis.";

type CheckoutMaintenanceDecision = {
  active: boolean;
  code: typeof CHECKOUT_MAINTENANCE_CODE;
  httpStatus: typeof CHECKOUT_MAINTENANCE_HTTP_STATUS;
  message: typeof CHECKOUT_MAINTENANCE_MESSAGE;
};

export function getCheckoutMaintenanceDecision(): CheckoutMaintenanceDecision {
  return {
    active: CHECKOUT_MAINTENANCE_ACTIVE,
    code: CHECKOUT_MAINTENANCE_CODE,
    httpStatus: CHECKOUT_MAINTENANCE_HTTP_STATUS,
    message: CHECKOUT_MAINTENANCE_MESSAGE,
  };
}
