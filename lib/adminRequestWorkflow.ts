type SupabaseLike = {
  from: (table: string) => any;
};

type WorkflowSnapshot = {
  requestStatus: string | null;
  offerStatus: string | null;
  requestItemsCount: number;
  offerItemsCount: number;
  openManualReviewCount: number;
};

function normalizeStatus(value: unknown) {
  return String(value || "").trim();
}

function isLockedAfterCustomerStep(status: string | null, offerStatus: string | null) {
  const values = new Set([normalizeStatus(status), normalizeStatus(offerStatus)]);

  return (
    values.has("confirmed") ||
    values.has("offer_sent") ||
    values.has("customer_selection") ||
    values.has("payment_pending") ||
    values.has("payment_received") ||
    values.has("archived") ||
    values.has("cancelled")
  );
}

export async function getAdminRequestWorkflowSnapshot(
  supabase: SupabaseLike,
  requestId: string
): Promise<WorkflowSnapshot> {
  const { data: request, error: requestError } = await supabase
    .from("school_requests")
    .select("id, status, offer_status")
    .eq("id", requestId)
    .maybeSingle();

  if (requestError) {
    throw new Error(`Anfrage-Workflow konnte nicht geladen werden: ${requestError.message}`);
  }

  if (!request) {
    throw new Error("Anfrage wurde nicht gefunden.");
  }

  const [
    { data: requestItems, error: requestItemsError },
    { data: offerItems, error: offerItemsError },
  ] = await Promise.all([
    supabase
      .from("school_request_items")
      .select("id, admin_resolution_status")
      .eq("request_id", requestId),

    supabase
      .from("school_offer_items")
      .select("id, request_item_id")
      .eq("request_id", requestId),
  ]);

  if (requestItemsError) {
    throw new Error(`Listenpositionen konnten nicht geladen werden: ${requestItemsError.message}`);
  }

  if (offerItemsError) {
    throw new Error(`Paketpositionen konnten nicht geladen werden: ${offerItemsError.message}`);
  }

  const resolvedRequestItemIds = new Set<string>();

  for (const offerItem of offerItems || []) {
    const requestItemId = normalizeStatus(offerItem?.request_item_id);

    if (requestItemId) {
      resolvedRequestItemIds.add(requestItemId);
    }
  }

  const openManualReviewCount = (requestItems || []).filter((item: any) => {
    const itemId = normalizeStatus(item?.id);
    const adminResolutionStatus = normalizeStatus(item?.admin_resolution_status);

    return itemId && !adminResolutionStatus && !resolvedRequestItemIds.has(itemId);
  }).length;

  return {
    requestStatus: request.status || null,
    offerStatus: request.offer_status || null,
    requestItemsCount: (requestItems || []).length,
    offerItemsCount: (offerItems || []).length,
    openManualReviewCount:
      (requestItems || []).length === 0 ? 1 : openManualReviewCount,
  };
}

export async function updateAdminRequestWorkflowState(
  supabase: SupabaseLike,
  requestId: string
) {
  const snapshot = await getAdminRequestWorkflowSnapshot(supabase, requestId);
  const now = new Date().toISOString();

  if (isLockedAfterCustomerStep(snapshot.requestStatus, snapshot.offerStatus)) {
    await supabase
      .from("school_requests")
      .update({ updated_at: now })
      .eq("id", requestId);

    return snapshot;
  }

  const updatePayload: Record<string, string> = {
    updated_at: now,
  };

  if (snapshot.openManualReviewCount > 0) {
    updatePayload.status = "manual_review";
    updatePayload.offer_status = "manual_review";
  } else if (snapshot.requestItemsCount > 0 && snapshot.offerItemsCount > 0) {
    updatePayload.status = "offer_created";
    updatePayload.offer_status = "offer_created";
  }

  await supabase
    .from("school_requests")
    .update(updatePayload)
    .eq("id", requestId);

  return snapshot;
}

export async function assertAdminRequestReadyForOfferMail(
  supabase: SupabaseLike,
  requestId: string
) {
  const snapshot = await getAdminRequestWorkflowSnapshot(supabase, requestId);

  if (snapshot.openManualReviewCount > 0) {
    throw new Error(
      `Es sind noch ${snapshot.openManualReviewCount} offene Listenposition(en) vorhanden. Bitte erst Produkt übernehmen oder Position manuell auflösen.`
    );
  }

  if (snapshot.offerItemsCount <= 0) {
    throw new Error(
      "Es sind noch keine Paketpositionen vorhanden. Bitte erst Produkte übernehmen oder manuell ergänzen."
    );
  }

  return snapshot;
}
