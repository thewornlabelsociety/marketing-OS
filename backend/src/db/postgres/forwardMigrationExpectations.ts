/**
 * Additive schema expectations for accepted forward Postgres migrations.
 *
 * Effective expected schema = PG-1 baseline manifest + additive expectations here.
 * Do not fold forward-only indexes into sqliteSchemaManifest.json.
 */
import { sqliteSchemaManifest } from './baselineManifest';
import { acceptedMigrationFilenames } from './acceptedMigrations';

export interface AdditiveIndexExpectation {
  /** Source migration filename — must be in acceptedMigrations registry. */
  migration: string;
  name: string;
  table: string;
  /** Ordered index columns. */
  columns: readonly string[];
  unique: boolean;
  method: 'btree';
  /** Canonical CREATE INDEX SQL (used for definition semantics). */
  sql: string;
}

/** Registered additive index expectations keyed by forward migration. */
export const FORWARD_MIGRATION_INDEX_EXPECTATIONS: readonly AdditiveIndexExpectation[] = [
  {
    migration: '003_pg3_unique_constraints.sql',
    name: 'uq_campaign_briefs_campaign_id',
    table: 'campaign_briefs',
    columns: ['campaign_id'],
    unique: true,
    method: 'btree',
    sql: 'CREATE UNIQUE INDEX uq_campaign_briefs_campaign_id ON campaign_briefs (campaign_id)',
  },
  {
    migration: '003_pg3_unique_constraints.sql',
    name: 'uq_plan_approvals_campaign_id',
    table: 'plan_approvals',
    columns: ['campaign_id'],
    unique: true,
    method: 'btree',
    sql: 'CREATE UNIQUE INDEX uq_plan_approvals_campaign_id ON plan_approvals (campaign_id)',
  },
  {
    migration: '004_pg4_content_plan_unique_constraints.sql',
    name: 'uq_content_plan_approvals_campaign_id',
    table: 'content_plan_approvals',
    columns: ['campaign_id'],
    unique: true,
    method: 'btree',
    sql: 'CREATE UNIQUE INDEX uq_content_plan_approvals_campaign_id ON content_plan_approvals (campaign_id)',
  },
  {
    migration: '005_pg5_creative_approval_unique_constraints.sql',
    name: 'uq_creative_approvals_campaign_content_key',
    table: 'creative_approvals',
    columns: ['campaign_id', 'content_key'],
    unique: true,
    method: 'btree',
    sql: 'CREATE UNIQUE INDEX uq_creative_approvals_campaign_content_key ON creative_approvals (campaign_id, content_key)',
  },
];

export function baselineNonPkIndexCount(): number {
  return sqliteSchemaManifest.indexes.length;
}

/** Additive non-PK indexes from currently accepted forward migrations. */
export function additiveNonPkIndexCount(): number {
  return additiveIndexExpectations().length;
}

/** Baseline manifest indexes + accepted forward migration indexes. */
export function effectiveNonPkIndexCount(): number {
  return baselineNonPkIndexCount() + additiveNonPkIndexCount();
}

export function additiveIndexExpectations(): AdditiveIndexExpectation[] {
  const accepted = new Set(acceptedMigrationFilenames());
  return FORWARD_MIGRATION_INDEX_EXPECTATIONS.filter((exp) => accepted.has(exp.migration));
}

export interface LiveIndexSnapshot {
  indexname: string;
  tablename: string;
  indexdef: string;
  indisunique: boolean;
}

function normalizeIndexDef(def: string): string {
  return def.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Validate one additive index expectation against live Postgres metadata.
 * Returns null when satisfied, otherwise a human-readable failure reason.
 */
export function validateAdditiveIndexExpectation(
  expectation: AdditiveIndexExpectation,
  live: LiveIndexSnapshot | undefined,
): string | null {
  if (!live) {
    return `Missing additive index: ${expectation.name} (from ${expectation.migration})`;
  }

  if (live.tablename !== expectation.table) {
    return `${expectation.name}: expected table ${expectation.table}, got ${live.tablename}`;
  }

  if (live.indisunique !== expectation.unique) {
    return `${expectation.name}: expected unique=${expectation.unique}, got ${live.indisunique}`;
  }

  const def = normalizeIndexDef(live.indexdef);
  if (!def.includes(`using ${expectation.method}`)) {
    return `${expectation.name}: expected method ${expectation.method}`;
  }
  for (const column of expectation.columns) {
    if (!def.includes(column.toLowerCase())) {
      return `${expectation.name}: index definition missing column ${column}`;
    }
  }

  if (!def.includes('unique index') && expectation.unique) {
    return `${expectation.name}: expected UNIQUE index semantics`;
  }

  if (!def.includes(expectation.name.toLowerCase())) {
    return `${expectation.name}: index definition name mismatch`;
  }

  const expNorm = normalizeIndexDef(expectation.sql);
  const expectedColumns = `(${expectation.columns.map((column) => column.toLowerCase()).join(', ')})`;
  if (!def.includes(expectation.table.toLowerCase()) || !def.includes(expectedColumns)) {
    return `${expectation.name}: index definition semantics mismatch`;
  }

  if (expNorm && expectation.columns.some((column) => !def.includes(column.toLowerCase()))) {
    return `${expectation.name}: column not reflected in live definition`;
  }

  return null;
}

/** Collect validation failures for all additive index expectations. */
export function collectAdditiveIndexValidationFailures(
  liveIndexesByName: ReadonlyMap<string, LiveIndexSnapshot>,
): string[] {
  const failures: string[] = [];
  for (const expectation of additiveIndexExpectations()) {
    const live = liveIndexesByName.get(expectation.name);
    const reason = validateAdditiveIndexExpectation(expectation, live);
    if (reason) failures.push(reason);
  }
  return failures;
}
