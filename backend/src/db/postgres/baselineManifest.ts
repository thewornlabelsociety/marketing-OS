/**
 * Expected final-state schema derived from authoritative SQLite manifest.
 * Used by PG-1 verification to compare live Postgres against canonical MOS schema.
 */
import crypto from 'crypto';
import rawManifest from './sqliteSchemaManifest.json';

const TIMESTAMP_NAME = /(_at|_for|_until|_since|occurred_at|scheduled_for|applied_at|resolved_at|published_at|evaluated_at)$/i;

export interface ManifestColumn {
  name: string;
  sqliteType: string;
  notNull: boolean;
  defaultValue: string | number | null;
  primaryKey: boolean;
  pkOrder: number;
}

export interface ManifestForeignKey {
  id: number;
  seq: number;
  from: string;
  to: string;
  table: string;
  onUpdate: string;
  onDelete: string;
}

export interface ManifestIndex {
  name: string;
  table: string;
  unique: boolean;
  partialPredicate: string | null;
  sql: string;
}

export interface ManifestTable {
  columns: ManifestColumn[];
  foreignKeys: ManifestForeignKey[];
}

export interface SqliteSchemaManifest {
  generatedAt?: string;
  checksum?: string;
  tables: Record<string, ManifestTable>;
  indexes: ManifestIndex[];
}

export const sqliteSchemaManifest = rawManifest as SqliteSchemaManifest;

/**
 * Normalize SQLite PRAGMA table_info dflt_value.
 * DEFAULT NULL is reported as the string "NULL" — not a substantive default.
 * Literal string defaults retain SQLite quoting, e.g. "'NULL'" or "'[]'".
 */
export function normalizeSqliteDefaultValue(
  raw: string | number | null | undefined,
): string | number | null {
  if (raw == null) return null;
  if (typeof raw === 'string' && raw.toUpperCase() === 'NULL') return null;
  return raw;
}

export function hasMeaningfulSqliteDefault(
  raw: string | number | null | undefined,
): boolean {
  return normalizeSqliteDefaultValue(raw) != null;
}

export function mapSqliteColumnToPostgresType(column: Pick<ManifestColumn, 'name' | 'sqliteType'>): string {
  const t = (column.sqliteType || 'TEXT').toUpperCase();
  if (t.includes('DATETIME') || t.includes('TIMESTAMP')) return 'timestamptz';
  if (t === 'TEXT' && TIMESTAMP_NAME.test(column.name)) return 'timestamptz';
  if (t.includes('INT')) return 'integer';
  if (t === 'REAL' || t.includes('FLOAT') || t.includes('DOUBLE')) return 'double precision';
  if (t.includes('BLOB')) return 'bytea';
  return 'text';
}

export function normalizePostgresType(dataType: string, udtName: string): string {
  const dt = dataType.toLowerCase();
  const udt = udtName.toLowerCase();
  if (udt === 'timestamptz' || dt === 'timestamp with time zone') return 'timestamptz';
  if (udt === 'timestamp' || dt === 'timestamp without time zone') return 'timestamp';
  if (udt === 'int4' || dt === 'integer') return 'integer';
  if (udt === 'float8' || dt === 'double precision') return 'double precision';
  if (udt === 'text') return 'text';
  if (udt === 'bytea') return 'bytea';
  return udt || dt;
}

export function expectedTableNames(): string[] {
  return Object.keys(sqliteSchemaManifest.tables).sort();
}

export function expectedIndexNames(): string[] {
  return sqliteSchemaManifest.indexes.map((i) => i.name).sort();
}

export function manifestChecksum(): string {
  if (sqliteSchemaManifest.checksum) {
    return sqliteSchemaManifest.checksum;
  }
  return crypto.createHash('sha256').update(JSON.stringify({
    tables: sqliteSchemaManifest.tables,
    indexes: sqliteSchemaManifest.indexes,
  })).digest('hex');
}

export interface ExpectedColumn {
  name: string;
  postgresType: string;
  notNull: boolean;
  hasDefault: boolean;
  primaryKey: boolean;
  pkOrder: number;
}

export function expectedColumns(tableName: string): ExpectedColumn[] {
  const table = sqliteSchemaManifest.tables[tableName];
  if (!table) return [];
  return table.columns.map((col) => ({
    name: col.name,
    postgresType: mapSqliteColumnToPostgresType(col),
    notNull: col.notNull || col.primaryKey,
    hasDefault: hasMeaningfulSqliteDefault(col.defaultValue),
    primaryKey: col.primaryKey,
    pkOrder: col.pkOrder,
  }));
}

export function expectedForeignKeys(tableName: string): ManifestForeignKey[] {
  return sqliteSchemaManifest.tables[tableName]?.foreignKeys ?? [];
}

export function expectedIndexes(): ManifestIndex[] {
  return sqliteSchemaManifest.indexes;
}

/** Tables excluded from live Postgres comparison (trackers / ephemeral). */
export const EXCLUDED_LIVE_TABLES = new Set(['postgres_migrations']);
