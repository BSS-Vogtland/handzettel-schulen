import type {
  ExistingLexwareIdentityClassification,
  TransitionClassification,
} from "./lexwareProductionTransitionCore";

export type LexwareProductionDryRunDecisionInput = {
  jobExists: boolean;
  invoiceJobLinkMatches: boolean;
  requestIdMatches: boolean;
  identityClassification: ExistingLexwareIdentityClassification;
  payloadHashVersionSupported: boolean;
  storedPayloadHashMatches: boolean;
  currentPayloadHashMatches: boolean | null;
  payloadValid: boolean;
  targetOrganizationMatches: boolean;
  transitionClassification: TransitionClassification;
  writeStateAllowed: boolean;
  gatesAllowed: boolean;
};

export function evaluateLexwareProductionDryRunDecision(input: LexwareProductionDryRunDecisionInput) {
  const common = input.jobExists && input.invoiceJobLinkMatches && input.requestIdMatches
    && input.payloadHashVersionSupported && input.storedPayloadHashMatches
    && input.targetOrganizationMatches;
  const wouldOnlyReadBack = common
    && input.identityClassification === "read_back_only";
  const claimWouldSucceed = common
    && (input.identityClassification === "write_candidate"
      || input.identityClassification === "expired_lock_write_candidate")
    && input.currentPayloadHashMatches === true
    && input.payloadValid
    && input.transitionClassification !== "blocked"
    && input.writeStateAllowed
    && input.gatesAllowed;
  const wouldPerformExactlyOnePost = claimWouldSucceed;
  return {
    claimWouldSucceed,
    wouldOnlyReadBack,
    wouldPerformExactlyOnePost,
    wouldCreateExactlyOneInvoice: wouldPerformExactlyOnePost,
  };
}
