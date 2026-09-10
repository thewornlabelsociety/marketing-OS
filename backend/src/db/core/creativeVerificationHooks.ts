/** Verification-only failure injection for PG-5B transaction probes. */
export function shouldInjectCreativeFailure(stage: string): boolean {
  return process.env.PG5B_INJECT_FAILURE === stage;
}

export class CreativeVerificationAbortError extends Error {
  constructor(public readonly stage: string) {
    super(`PG-5B injected failure at stage: ${stage}`);
    this.name = 'CreativeVerificationAbortError';
  }
}

export function maybeInjectCreativeFailure(stage: string): void {
  if (shouldInjectCreativeFailure(stage)) {
    throw new CreativeVerificationAbortError(stage);
  }
}
