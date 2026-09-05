/**
 * PG-2 — Core domain database driver selection.
 * Default: sqlite. Postgres requires explicit verification gate.
 */

export type CoreDbDriver = 'sqlite' | 'postgres';

const POSTGRES_DRIVER: CoreDbDriver = 'postgres';
const SQLITE_DRIVER: CoreDbDriver = 'sqlite';

export class CoreDbConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CoreDbConfigurationError';
  }
}

/** Parse CORE_DB_DRIVER. Never infers from DATABASE_URL. */
export function resolveCoreDbDriver(env: NodeJS.ProcessEnv = process.env): CoreDbDriver {
  const raw = env.CORE_DB_DRIVER?.trim().toLowerCase();
  if (!raw || raw === 'sqlite') return SQLITE_DRIVER;
  if (raw === 'postgres') return POSTGRES_DRIVER;
  return SQLITE_DRIVER;
}

/** Postgres mode requires PG2_VERIFICATION_ALLOWED=1 (fail closed). */
export function assertCoreDbDriverAllowed(driver: CoreDbDriver, env: NodeJS.ProcessEnv = process.env): void {
  if (driver !== POSTGRES_DRIVER) return;

  const allowed = env.PG2_VERIFICATION_ALLOWED?.trim();
  if (allowed !== '1') {
    throw new CoreDbConfigurationError(
      'CORE_DB_DRIVER=postgres requires PG2_VERIFICATION_ALLOWED=1. Postgres core repository mode is verification-only in PG-2.',
    );
  }

  if (!env.DATABASE_URL?.trim()) {
    throw new CoreDbConfigurationError(
      'CORE_DB_DRIVER=postgres requires DATABASE_URL to be configured.',
    );
  }
}

export function sanitizeCoreDbError(err: unknown): string {
  if (err instanceof CoreDbConfigurationError) return err.message;
  if (err instanceof Error) {
    const msg = err.message;
    if (/password|secret|credential|DATABASE_URL/i.test(msg)) {
      return 'Database operation failed';
    }
    return msg;
  }
  return 'Database operation failed';
}
