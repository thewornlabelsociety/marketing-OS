/** Verification-only failure injection for PG-3B transaction probes. */
export function shouldInjectPlanningFailure(stage: string): boolean {
  return process.env.PG3B_INJECT_FAILURE === stage;
}

export class PlanningVerificationAbortError extends Error {
  constructor(public readonly stage: string) {
    super(`PG-3B injected failure at stage: ${stage}`);
    this.name = 'PlanningVerificationAbortError';
  }
}

export function maybeInjectPlanningFailure(stage: string): void {
  if (shouldInjectPlanningFailure(stage)) {
    throw new PlanningVerificationAbortError(stage);
  }
}
