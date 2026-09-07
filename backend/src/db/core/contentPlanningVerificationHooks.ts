/** Verification-only failure injection for PG-4B transaction probes. */
export function shouldInjectContentPlanningFailure(stage: string): boolean {
  return process.env.PG4B_INJECT_FAILURE === stage;
}

export class ContentPlanningVerificationAbortError extends Error {
  constructor(public readonly stage: string) {
    super(`PG-4B injected failure at stage: ${stage}`);
    this.name = 'ContentPlanningVerificationAbortError';
  }
}

export function maybeInjectContentPlanningFailure(stage: string): void {
  if (shouldInjectContentPlanningFailure(stage)) {
    throw new ContentPlanningVerificationAbortError(stage);
  }
}
