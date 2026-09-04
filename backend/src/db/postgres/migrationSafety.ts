/**
 * Static safety checks for Postgres migration SQL and PG-1 live verification paths.
 */
import fs from 'fs';
import path from 'path';
import { listMigrationFiles, migrationsDirectory } from './runPostgresMigrations';

/** Patterns that must not appear in canonical migrations or live verify SQL. */
export const DESTRUCTIVE_SQL_PATTERNS: ReadonlyArray<{ name: string; pattern: RegExp }> = [
  { name: 'DROP DATABASE', pattern: /\bDROP\s+DATABASE\b/i },
  { name: 'DROP SCHEMA', pattern: /\bDROP\s+SCHEMA\b/i },
  { name: 'DROP TABLE', pattern: /\bDROP\s+TABLE\b/i },
  { name: 'TRUNCATE', pattern: /\bTRUNCATE\b/i },
];

export interface DestructiveSqlHit {
  source: string;
  pattern: string;
}

export function findDestructiveSql(sql: string, source: string): DestructiveSqlHit[] {
  const hits: DestructiveSqlHit[] = [];
  for (const { name, pattern } of DESTRUCTIVE_SQL_PATTERNS) {
    if (pattern.test(sql)) {
      hits.push({ source, pattern: name });
    }
  }
  return hits;
}

export function scanCanonicalMigrationFiles(): DestructiveSqlHit[] {
  const hits: DestructiveSqlHit[] = [];
  for (const filename of listMigrationFiles()) {
    const filePath = path.join(migrationsDirectory(), filename);
    const sql = fs.readFileSync(filePath, 'utf8');
    hits.push(...findDestructiveSql(sql, filename));
  }
  return hits;
}

/** SQL executed by verify-pg-1.ts live path (session-scoped temp tables only). */
export const VERIFY_PG1_LIVE_SQL = `
CREATE TEMP TABLE pg1_tx_probe (id TEXT PRIMARY KEY, value TEXT);
BEGIN;
INSERT INTO pg1_tx_probe (id, value) VALUES ('rollback', 'x');
ROLLBACK;
BEGIN;
INSERT INTO pg1_tx_probe (id, value) VALUES ('commit', 'y');
COMMIT;
CREATE TEMP TABLE pg1_roundtrip_probe (
  id TEXT PRIMARY KEY,
  ts TIMESTAMPTZ,
  json_text TEXT,
  flag INTEGER
);
INSERT INTO pg1_roundtrip_probe (id, ts, json_text, flag) VALUES ($1, $2::timestamptz, $3, $4);
SELECT ts FROM pg1_roundtrip_probe WHERE id = $1;
SELECT json_text FROM pg1_roundtrip_probe WHERE id = $1;
UPDATE pg1_roundtrip_probe SET flag = 1 WHERE id = $1;
SELECT flag FROM pg1_roundtrip_probe WHERE id = $1;
SELECT 1 AS ok;
SELECT filename, checksum FROM postgres_migrations ORDER BY filename;
SELECT COUNT(*)::int AS c FROM objectives WHERE is_system = 1;
SELECT id FROM objectives WHERE id = $1;
`;

export function scanVerifyPg1LiveSql(): DestructiveSqlHit[] {
  return findDestructiveSql(VERIFY_PG1_LIVE_SQL, 'verify-pg-1 live SQL');
}
