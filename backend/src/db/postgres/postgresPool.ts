/**
 * Lazy Postgres pool factory. Not imported by server.ts in PG-1.
 */
import { Pool } from 'pg';
import { buildPoolConfig } from './postgresConfig';

let pool: Pool | null = null;

export function getPostgresPool(): Pool {
  const config = buildPoolConfig();
  if (!config) {
    throw new Error('DATABASE_URL is not configured');
  }
  if (!pool) {
    pool = new Pool(config);
  }
  return pool;
}

export async function shutdownPostgresPool(): Promise<void> {
  if (pool) {
    const closing = pool;
    pool = null;
    await closing.end();
  }
}

/** @internal test helper */
export function resetPostgresPoolForTests(): void {
  pool = null;
}
