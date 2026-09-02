/**
 * Provisioning state machine (spec 05 §5.3, PROV-1..5): resumable, persisted
 * per property; every created resource records its provider id in the same
 * transaction that marks the step complete.
 */
export const PROVISION_STEPS = [
  "group",
  "property",
  "room_types",
  "rate_plans",
  "policies",
  "webhook",
  "seed",
  "initial_push",
  "live",
] as const;
export type ProvisionStep = (typeof PROVISION_STEPS)[number];

export interface ProvisioningState {
  step: ProvisionStep;
  /** Provider ids recorded so far, keyed by local id or a fixed key such as "group" / "property". */
  refs: Record<string, string>;
  attempts: number;
  lastError: string | null;
}

export const initialProvisioning = (): ProvisioningState => ({
  step: "group",
  refs: {},
  attempts: 0,
  lastError: null,
});

export function nextStep(step: ProvisionStep): ProvisionStep | null {
  const i = PROVISION_STEPS.indexOf(step);
  return i >= 0 && i < PROVISION_STEPS.length - 1 ? PROVISION_STEPS[i + 1]! : null;
}

export function advance(
  state: ProvisioningState,
  refs: Record<string, string> = {},
): ProvisioningState {
  const next = nextStep(state.step);
  return {
    step: next ?? state.step,
    refs: { ...state.refs, ...refs },
    attempts: 0,
    lastError: null,
  };
}

export function fail(state: ProvisioningState, error: string): ProvisioningState {
  return { ...state, attempts: state.attempts + 1, lastError: error };
}

export const isLive = (s: ProvisioningState): boolean => s.step === "live";
