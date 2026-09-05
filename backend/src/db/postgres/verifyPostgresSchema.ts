/**
 * Compare live Postgres schema against baselineManifest expectations.
 */
import type { Pool } from 'pg';
import {
  EXCLUDED_LIVE_TABLES,
  expectedColumns,
  expectedForeignKeys,
  expectedIndexes,
  expectedTableNames,
  normalizePostgresType,
  type ManifestForeignKey,
} from './baselineManifest';
import {
  collectAdditiveIndexValidationFailures,
  type LiveIndexSnapshot,
} from './forwardMigrationExpectations';

export interface SchemaMismatch {
  category: string;
  detail: string;
}

interface LiveColumn {
  column_name: string;
  data_type: string;
  udt_name: string;
  is_nullable: string;
  column_default: string | null;
}

interface LiveForeignKey {
  constraint_name: string;
  table_name: string;
  column_name: string;
  foreign_table_name: string;
  foreign_column_name: string;
}

interface LiveIndex {
  indexname: string;
  tablename: string;
  indexdef: string;
  indisunique: boolean;
  indisprimary: boolean;
}

async function fetchLiveNonPrimaryIndexes(pool: Pool): Promise<Map<string, LiveIndexSnapshot>> {
  const indexResult = await pool.query<LiveIndex>(`
    SELECT
      i.relname AS indexname,
      t.relname AS tablename,
      pg_get_indexdef(i.oid) AS indexdef,
      ix.indisunique,
      ix.indisprimary
    FROM pg_class t
    JOIN pg_index ix ON t.oid = ix.indrelid
    JOIN pg_class i ON i.oid = ix.indexrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relkind = 'r'
  `);

  return new Map(
    indexResult.rows
      .filter((idx) => !idx.indisprimary)
      .map((idx) => [idx.indexname, idx]),
  );
}

interface LiveTableRow {
  table_name: string;
}

function normalizePredicate(predicate: string | null): string | null {
  if (!predicate) return null;
  return predicate.replace(/\s+/g, ' ').trim().toLowerCase();
}

function normalizeIndexDef(def: string): string {
  return def.replace(/\s+/g, ' ').trim().toLowerCase();
}

export async function collectSchemaMismatches(pool: Pool): Promise<SchemaMismatch[]> {
  const mismatches: SchemaMismatch[] = [];

  const tablesResult = await pool.query<LiveTableRow>(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);

  const liveTables = new Set<string>(
    tablesResult.rows
      .map((r) => r.table_name)
      .filter((t) => !EXCLUDED_LIVE_TABLES.has(t)),
  );
  const expectedTables = new Set(expectedTableNames());

  for (const table of expectedTables) {
    if (!liveTables.has(table)) {
      mismatches.push({ category: 'tables', detail: `Missing table: ${table}` });
    }
  }

  for (const table of liveTables) {
    if (!expectedTables.has(table)) {
      mismatches.push({ category: 'tables', detail: `Unexpected table: ${table}` });
    }
  }

  for (const tableName of expectedTables) {
    if (!liveTables.has(tableName)) continue;

    const columnsResult = await pool.query<LiveColumn>(`
      SELECT column_name, data_type, udt_name, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position
    `, [tableName]);

    const liveByName = new Map(columnsResult.rows.map((c) => [c.column_name, c]));
    const expected = expectedColumns(tableName);

    for (const exp of expected) {
      const live = liveByName.get(exp.name);
      if (!live) {
        mismatches.push({
          category: 'columns',
          detail: `${tableName}.${exp.name}: missing column`,
        });
        continue;
      }

      const liveType = normalizePostgresType(live.data_type, live.udt_name);
      if (liveType !== exp.postgresType) {
        mismatches.push({
          category: 'column-types',
          detail: `${tableName}.${exp.name}: expected ${exp.postgresType}, got ${liveType}`,
        });
      }

      const liveNotNull = live.is_nullable === 'NO';
      if (liveNotNull !== exp.notNull) {
        mismatches.push({
          category: 'nullability',
          detail: `${tableName}.${exp.name}: expected notNull=${exp.notNull}, got ${liveNotNull}`,
        });
      }

      const liveHasDefault = live.column_default != null;
      if (exp.hasDefault && !liveHasDefault && !exp.primaryKey) {
        mismatches.push({
          category: 'defaults',
          detail: `${tableName}.${exp.name}: expected a default value`,
        });
      }
    }

    for (const liveCol of columnsResult.rows) {
      if (!expected.find((e) => e.name === liveCol.column_name)) {
        mismatches.push({
          category: 'columns',
          detail: `${tableName}.${liveCol.column_name}: unexpected column`,
        });
      }
    }

    const pkResult = await pool.query<{ column_name: string }>(`
      SELECT kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
      WHERE tc.table_schema = 'public'
        AND tc.table_name = $1
        AND tc.constraint_type = 'PRIMARY KEY'
      ORDER BY kcu.ordinal_position
    `, [tableName]);

    const livePk = pkResult.rows.map((r) => r.column_name);
    const expectedPk = expected
      .filter((c) => c.primaryKey)
      .sort((a, b) => a.pkOrder - b.pkOrder)
      .map((c) => c.name);

    if (livePk.join(',') !== expectedPk.join(',')) {
      mismatches.push({
        category: 'primary-keys',
        detail: `${tableName}: expected PK (${expectedPk.join(', ')}), got (${livePk.join(', ')})`,
      });
    }
  }

  const fkResult = await pool.query<LiveForeignKey>(`
    SELECT
      tc.constraint_name,
      kcu.table_name,
      kcu.column_name,
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
     AND ccu.table_schema = tc.table_schema
    WHERE tc.table_schema = 'public'
      AND tc.constraint_type = 'FOREIGN KEY'
  `);

  const liveFkSet = new Set(
    fkResult.rows.map((fk) => `${fk.table_name}.${fk.column_name}->${fk.foreign_table_name}.${fk.foreign_column_name}`),
  );

  const expectedFkSet = new Set<string>();
  for (const tableName of expectedTables) {
    for (const fk of expectedForeignKeys(tableName)) {
      expectedFkSet.add(`${tableName}.${fk.from}->${fk.table}.${fk.to}`);
    }
  }

  for (const fk of expectedFkSet) {
    if (!liveFkSet.has(fk)) {
      mismatches.push({ category: 'foreign-keys', detail: `Missing foreign key: ${fk}` });
    }
  }

  const liveIndexesByName = await fetchLiveNonPrimaryIndexes(pool);

  for (const expIdx of expectedIndexes()) {
    const live = liveIndexesByName.get(expIdx.name);
    if (!live) {
      mismatches.push({ category: 'indexes', detail: `Missing index: ${expIdx.name}` });
      continue;
    }

    if (live.indisunique !== expIdx.unique) {
      mismatches.push({
        category: 'indexes',
        detail: `${expIdx.name}: expected unique=${expIdx.unique}, got ${live.indisunique}`,
      });
    }

    if (expIdx.partialPredicate) {
      const def = live.indexdef.toLowerCase();
      const predicate = normalizePredicate(expIdx.partialPredicate);
      if (predicate && !def.includes(predicate!)) {
        mismatches.push({
          category: 'partial-indexes',
          detail: `${expIdx.name}: partial predicate not found (${expIdx.partialPredicate})`,
        });
      }
    }

    const expDefNorm = normalizeIndexDef(expIdx.sql);
    const liveDefNorm = normalizeIndexDef(live.indexdef);
    if (!liveDefNorm.includes(expIdx.name.toLowerCase())) {
      mismatches.push({
        category: 'indexes',
        detail: `${expIdx.name}: index definition mismatch`,
      });
    }
  }

  return mismatches;
}

export async function collectAdditiveSchemaMismatches(pool: Pool): Promise<SchemaMismatch[]> {
  const liveIndexesByName = await fetchLiveNonPrimaryIndexes(pool);
  const failures = collectAdditiveIndexValidationFailures(liveIndexesByName);
  return failures.map((detail) => ({
    category: 'additive-indexes',
    detail,
  }));
}

export async function verifyPostgresBaselineSchema(
  pool: Pool,
): Promise<{ ok: boolean; mismatches: SchemaMismatch[] }> {
  const mismatches = await collectSchemaMismatches(pool);
  return { ok: mismatches.length === 0, mismatches };
}

export async function verifyPostgresAdditiveSchema(
  pool: Pool,
): Promise<{ ok: boolean; mismatches: SchemaMismatch[] }> {
  const mismatches = await collectAdditiveSchemaMismatches(pool);
  return { ok: mismatches.length === 0, mismatches };
}

export async function verifyEffectivePostgresSchema(
  pool: Pool,
): Promise<{ ok: boolean; mismatches: SchemaMismatch[] }> {
  const baseline = await collectSchemaMismatches(pool);
  const additive = await collectAdditiveSchemaMismatches(pool);
  const mismatches = [...baseline, ...additive];
  return { ok: mismatches.length === 0, mismatches };
}

export async function verifyPostgresSchema(pool: Pool): Promise<{ ok: boolean; mismatches: SchemaMismatch[] }> {
  return verifyEffectivePostgresSchema(pool);
}

/** @internal exported for unit-style checks in verify script */
export function compareForeignKeyExpectation(
  fk: ManifestForeignKey,
  tableName: string,
): string {
  return `${tableName}.${fk.from}->${fk.table}.${fk.to}`;
}
