export const CHECKOUT_MAINTENANCE_ACTIVE = true;

export const CHECKOUT_MAINTENANCE_CODE = "CHECKOUT_MAINTENANCE";
export const CHECKOUT_MAINTENANCE_HTTP_STATUS = 503;
export const CHECKOUT_MAINTENANCE_MESSAGE =
  "Wir führen derzeit Wartungsarbeiten an unserem Bestellsystem durch. Bestellungen können voraussichtlich ab Sonntagabend wieder abgeschlossen werden. Vielen Dank für Ihr Verständnis.";

export type CheckoutMaintenanceAccessDecision = {
  maintenanceActive: boolean;
  bypassAllowed: boolean;
  bypassReason: "maintenance_inactive" | "admin_test_permit_consumed" | "blocked";
  isAdminTest: boolean;
  permitId: string | null;
  consumedAt: string | null;
};

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

export async function resolveCheckoutMaintenanceAccess(input: {
  adminAuthenticated: boolean;
  sameOrigin: boolean;
  maintenanceTestHeader: string | null;
  confirmation: string | null;
  permitToken: string | null;
  expectedConfirmation: string;
  consumePermit: () => Promise<{
    permitId: string;
    consumedAt: string;
  } | null>;
  maintenanceActive?: boolean;
}): Promise<CheckoutMaintenanceAccessDecision> {
  const maintenanceActive =
    input.maintenanceActive ?? CHECKOUT_MAINTENANCE_ACTIVE;

  if (!maintenanceActive) {
    return {
      maintenanceActive: false,
      bypassAllowed: false,
      bypassReason: "maintenance_inactive",
      isAdminTest: false,
      permitId: null,
      consumedAt: null,
    };
  }

  const prerequisitesMet =
    input.adminAuthenticated &&
    input.sameOrigin &&
    input.maintenanceTestHeader === "true" &&
    input.confirmation === input.expectedConfirmation &&
    Boolean(input.permitToken);

  if (!prerequisitesMet) {
    return {
      maintenanceActive: true,
      bypassAllowed: false,
      bypassReason: "blocked",
      isAdminTest: false,
      permitId: null,
      consumedAt: null,
    };
  }

  const consumedPermit = await input.consumePermit();
  if (!consumedPermit) {
    return {
      maintenanceActive: true,
      bypassAllowed: false,
      bypassReason: "blocked",
      isAdminTest: false,
      permitId: null,
      consumedAt: null,
    };
  }

  return {
    maintenanceActive: true,
    bypassAllowed: true,
    bypassReason: "admin_test_permit_consumed",
    isAdminTest: true,
    permitId: consumedPermit.permitId,
    consumedAt: consumedPermit.consumedAt,
  };
}
