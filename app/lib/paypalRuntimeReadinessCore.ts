export type PayPalRuntimeEnvironment = "sandbox" | "live" | null;

export type PayPalRuntimeReadinessInput = {
  environment: PayPalRuntimeEnvironment;
  clientIdConfigured: boolean;
  clientSecretConfigured: boolean;
  webhookIdConfigured: boolean;
  productionSiteUrlConfigured: boolean;
  checkoutMaintenance: {
    known: boolean;
    value: boolean | null;
  };
};

export type PayPalRuntimeReadiness = {
  ok: boolean;
  runtime: {
    environmentKnown: boolean;
    environmentIsLive: boolean | null;
    clientIdConfigured: boolean;
    clientSecretConfigured: boolean;
    webhookIdConfigured: boolean;
    productionSiteUrlConfigured: boolean;
    liveApiSelected: boolean;
  };
  safety: {
    checkoutMaintenanceKnown: boolean;
    checkoutMaintenance: boolean | null;
    ordersCreated: 0;
    capturesPerformed: 0;
    webhooksSent: 0;
    databaseWritesPerformed: 0;
    mailsSent: 0;
    lexwareJobsCreated: 0;
  };
};

export function buildPayPalRuntimeReadiness(
  input: PayPalRuntimeReadinessInput,
): PayPalRuntimeReadiness {
  const environmentKnown = input.environment !== null;
  const environmentIsLive = environmentKnown
    ? input.environment === "live"
    : null;
  const liveApiSelected = input.environment === "live";
  const checkoutMaintenance = input.checkoutMaintenance.known
    ? input.checkoutMaintenance.value
    : null;

  const ok =
    environmentIsLive === true &&
    input.clientIdConfigured &&
    input.clientSecretConfigured &&
    input.webhookIdConfigured &&
    input.productionSiteUrlConfigured &&
    liveApiSelected;

  return {
    ok,
    runtime: {
      environmentKnown,
      environmentIsLive,
      clientIdConfigured: input.clientIdConfigured,
      clientSecretConfigured: input.clientSecretConfigured,
      webhookIdConfigured: input.webhookIdConfigured,
      productionSiteUrlConfigured: input.productionSiteUrlConfigured,
      liveApiSelected,
    },
    safety: {
      checkoutMaintenanceKnown: input.checkoutMaintenance.known,
      checkoutMaintenance,
      ordersCreated: 0,
      capturesPerformed: 0,
      webhooksSent: 0,
      databaseWritesPerformed: 0,
      mailsSent: 0,
      lexwareJobsCreated: 0,
    },
  };
}
