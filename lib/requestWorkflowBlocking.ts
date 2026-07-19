export type WorkflowRequestItem = {
  id: string;
  status?: string | null;
  admin_resolution_status?: string | null;
};

export type WorkflowOfferItem = {
  request_item_id?: string | null;
};

export const RESOLVED_REQUEST_ITEM_STATUSES = new Set<string>([
  "selected",
  "customer_supplies_self",
  "covered_by_alternative",
  "not_needed",
  "resolved",
  "done",
  "ignored",
]);

function normalizeWorkflowStatus(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

export function getRequestItemResolutionStatus(
  item: Pick<WorkflowRequestItem, "status" | "admin_resolution_status">,
) {
  const adminStatus = normalizeWorkflowStatus(item.admin_resolution_status);
  const itemStatus = normalizeWorkflowStatus(item.status);

  if (RESOLVED_REQUEST_ITEM_STATUSES.has(adminStatus)) {
    return adminStatus;
  }

  if (RESOLVED_REQUEST_ITEM_STATUSES.has(itemStatus)) {
    return itemStatus;
  }

  return "";
}

export function isRequestItemResolvedForWorkflow(
  item: WorkflowRequestItem,
  hasLinkedOfferItem = false,
) {
  if (hasLinkedOfferItem) {
    return true;
  }

  return Boolean(getRequestItemResolutionStatus(item));
}

export function buildCoveredRequestItemIds(offerItems: WorkflowOfferItem[]) {
  return new Set(
    offerItems
      .map((item) => String(item.request_item_id || "").trim())
      .filter((value) => value.length > 0),
  );
}

export function getRequestBlockingState<
  TRequestItem extends WorkflowRequestItem,
>(
  requestItems: TRequestItem[],
  offerItems: WorkflowOfferItem[],
  checkoutOverrideEnabled = false,
) {
  const coveredRequestItemIds = buildCoveredRequestItemIds(offerItems);

  const rawBlockingItems = requestItems.filter(
    (item) =>
      !isRequestItemResolvedForWorkflow(
        item,
        coveredRequestItemIds.has(item.id),
      ),
  );

  const overrideEnabled = checkoutOverrideEnabled === true;
  const effectiveBlockingItems = overrideEnabled ? [] : rawBlockingItems;

  return {
    coveredRequestItemIds,
    rawBlockingItems,
    rawBlockingCount: rawBlockingItems.length,
    effectiveBlockingItems,
    effectiveBlockingCount: effectiveBlockingItems.length,
    overrideEnabled,
    canProceed: effectiveBlockingItems.length === 0,
  };
}
