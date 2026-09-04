/**
 * Postgres connection configuration for PG-1+.
 * Contract: DATABASE_URL only. No discrete PGHOST/PGPORT fallbacks.
 */
import type { PoolConfig } from 'pg';

export function getDatabaseUrl(): string | undefined {
  const url = process.env.DATABASE_URL?.trim();
  return url || undefined;
}

/**
 * Resolve SSL options for node-pg from DATABASE_URL.
 * Supabase uses publicly trusted CAs — verification stays enabled.
 * Does not globally disable certificate verification.
 */
export function resolvePostgresSsl(
  connectionString: string,
): boolean | { rejectUnauthorized: boolean } | undefined {
  try {
    const url = new URL(connectionString);
    const sslmode = (url.searchParams.get('sslmode') ?? '').toLowerCase();

    if (sslmode === 'disable') {
      return false;
    }

    if (sslmode === 'require' || sslmode === 'verify-ca' || sslmode === 'verify-full') {
      return { rejectUnauthorized: true };
    }

    // Supabase hosted endpoints require TLS even when sslmode is omitted.
    if (url.hostname.endsWith('.supabase.co')) {
      return { rejectUnauthorized: true };
    }

    // Local Postgres (no sslmode, non-Supabase host): let pg negotiate.
    return undefined;
  } catch {
    // Malformed URL fragments should not weaken SSL for remote-looking strings.
    if (/supabase\.co/i.test(connectionString)) {
      return { rejectUnauthorized: true };
    }
    return undefined;
  }
}

export function buildPoolConfig(): PoolConfig | null {
  const connectionString = getDatabaseUrl();
  if (!connectionString) {
    return null;
  }

  return {
    connectionString,
    ssl: resolvePostgresSsl(connectionString),
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
  };
}

/** Redact credentials from connection strings before logging. */
export function redactDatabaseUrl(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    if (url.password) url.password = '***';
    if (url.username) url.username = '***';
    return url.toString();
  } catch {
    return '[invalid DATABASE_URL]';
  }
}
