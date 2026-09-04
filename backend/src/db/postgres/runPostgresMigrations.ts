/**
 * Postgres migration runner with checksum tracking.
 *
 * Non-destructive: applies CREATE IF NOT EXISTS / INSERT ON CONFLICT migrations only.
 * Does not DROP/TRUNCATE databases, schemas, tables, or application data.
 * Skips already-applied files; checksum mismatches fail instead of re-applying.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { Pool, PoolClient } from 'pg';

const MIGRATIONS_TABLE = 'postgres_migrations';

export interface MigrationRecord {
  filename: string;
  checksum: string;
  applied_at: Date;
}

export interface RunMigrationsResult {
  applied: string[];
  skipped: string[];
}

export function migrationsDirectory(): string {
  return path.resolve(__dirname, 'migrations');
}

export function listMigrationFiles(): string[] {
  const dir = migrationsDirectory();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

export function computeMigrationChecksum(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

export function computeMigrationFileChecksum(filename: string): string {
  const filePath = path.join(migrationsDirectory(), filename);
  const content = fs.readFileSync(filePath, 'utf8');
  return computeMigrationChecksum(content);
}

export async function ensureMigrationsTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      filename   TEXT PRIMARY KEY,
      checksum   TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export async function getAppliedMigration(
  client: PoolClient,
  filename: string,
): Promise<MigrationRecord | null> {
  const result = await client.query<MigrationRecord>(
    `SELECT filename, checksum, applied_at FROM ${MIGRATIONS_TABLE} WHERE filename = $1`,
    [filename],
  );
  return result.rows[0] ?? null;
}

export class MigrationChecksumMismatchError extends Error {
  constructor(
    public readonly filename: string,
    public readonly storedChecksum: string,
    public readonly currentChecksum: string,
  ) {
    super(
      `Migration checksum mismatch for ${filename}: stored=${storedChecksum} current=${currentChecksum}`,
    );
    this.name = 'MigrationChecksumMismatchError';
  }
}

export function assertChecksumMatch(
  filename: string,
  storedChecksum: string,
  currentChecksum: string,
): void {
  if (storedChecksum !== currentChecksum) {
    throw new MigrationChecksumMismatchError(filename, storedChecksum, currentChecksum);
  }
}

async function applyMigrationFile(
  client: PoolClient,
  filename: string,
): Promise<'applied' | 'skipped'> {
  const filePath = path.join(migrationsDirectory(), filename);
  const sql = fs.readFileSync(filePath, 'utf8');
  const checksum = computeMigrationChecksum(sql);
  const existing = await getAppliedMigration(client, filename);

  if (existing) {
    assertChecksumMatch(filename, existing.checksum, checksum);
    return 'skipped';
  }

  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query(
      `INSERT INTO ${MIGRATIONS_TABLE} (filename, checksum) VALUES ($1, $2)`,
      [filename, checksum],
    );
    await client.query('COMMIT');
    return 'applied';
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

export async function runPostgresMigrations(pool: Pool): Promise<RunMigrationsResult> {
  const client = await pool.connect();
  const applied: string[] = [];
  const skipped: string[] = [];

  try {
    await ensureMigrationsTable(client);
    for (const filename of listMigrationFiles()) {
      const outcome = await applyMigrationFile(client, filename);
      if (outcome === 'applied') applied.push(filename);
      else skipped.push(filename);
    }
  } finally {
    client.release();
  }

  return { applied, skipped };
}
