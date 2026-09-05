/**
 * Accepted Postgres migration registry.
 *
 * Baseline migrations (001, 002) are immutable squashed foundation files.
 * Forward migrations (003+) are registered here with pinned checksums once accepted.
 * Unregistered files on disk fail verification — new migrations require explicit registration.
 */
import {
  computeMigrationFileChecksum,
  listMigrationFiles,
} from './runPostgresMigrations';

/** Immutable PG-1 squashed baseline — must always be present and ordered first. */
export const REQUIRED_BASELINE_MIGRATION_FILENAMES = [
  '001_mos_baseline.sql',
  '002_system_objectives_seed.sql',
] as const;

/** Pinned SHA-256 checksums for every accepted migration file (baseline + forward). */
export const ACCEPTED_MIGRATION_CHECKSUMS: Readonly<Record<string, string>> = {
  '001_mos_baseline.sql': '527d63704e668248a8e584088231042ce3db902cc25e33b1326e529aa7617f5c',
  '002_system_objectives_seed.sql': '70014cea1d7f590260feb7399c17ce3de0266c086d8d93144a2b7ed1927c92fc',
  '003_pg3_unique_constraints.sql': 'bf5222657d4f2897fd73c4eaad93b995c3a80c7428dee10babc6687ebfdea196',
  '004_pg4_content_plan_unique_constraints.sql': 'fdde24f6e30390d740f76e340b10151e6a603c668275a53a8fe332fdd6565df4',
};

export function acceptedMigrationFilenames(): string[] {
  return Object.keys(ACCEPTED_MIGRATION_CHECKSUMS).sort();
}

export function isAcceptedMigration(filename: string): boolean {
  return filename in ACCEPTED_MIGRATION_CHECKSUMS;
}

export interface MigrationValidationIssue {
  code: string;
  detail: string;
}

export type FileChecksumFn = (filename: string) => string;

/**
 * Validate on-disk migration inventory against the accepted registry.
 * Does not apply migrations — static inventory integrity only.
 */
export function validateDiscoveredMigrationInventory(
  discoveredFiles: readonly string[],
  fileChecksum: FileChecksumFn,
): MigrationValidationIssue[] {
  const issues: MigrationValidationIssue[] = [];
  const accepted = acceptedMigrationFilenames();
  const acceptedSet = new Set(accepted);
  const discoveredSet = new Set(discoveredFiles);

  const seen = new Set<string>();
  for (const filename of discoveredFiles) {
    if (seen.has(filename)) {
      issues.push({ code: 'duplicate_filename', detail: filename });
    }
    seen.add(filename);
  }

  const sorted = [...discoveredFiles].sort();
  if (discoveredFiles.join('\0') !== sorted.join('\0')) {
    issues.push({
      code: 'nondeterministic_order',
      detail: `expected lexicographic order: ${sorted.join(', ')}`,
    });
  }

  for (const baseline of REQUIRED_BASELINE_MIGRATION_FILENAMES) {
    if (!discoveredSet.has(baseline)) {
      issues.push({ code: 'missing_baseline', detail: baseline });
    }
  }

  for (const filename of discoveredFiles) {
    if (!acceptedSet.has(filename)) {
      issues.push({ code: 'unaccepted_migration', detail: filename });
    }
  }

  for (const filename of accepted) {
    if (!discoveredSet.has(filename)) {
      issues.push({ code: 'missing_accepted_migration', detail: filename });
    }
  }

  if (discoveredFiles.length >= 2) {
    if (discoveredFiles[0] !== REQUIRED_BASELINE_MIGRATION_FILENAMES[0]) {
      issues.push({ code: 'baseline_order', detail: '001_mos_baseline.sql must be first' });
    }
    if (discoveredFiles[1] !== REQUIRED_BASELINE_MIGRATION_FILENAMES[1]) {
      issues.push({ code: 'baseline_order', detail: '002_system_objectives_seed.sql must be second' });
    }
  }

  for (const filename of discoveredFiles) {
    const expected = ACCEPTED_MIGRATION_CHECKSUMS[filename];
    if (!expected) continue;
    const actual = fileChecksum(filename);
    if (actual !== expected) {
      issues.push({
        code: 'checksum_mismatch',
        detail: `${filename}: stored=${expected} current=${actual}`,
      });
    }
  }

  return issues;
}

/** Convenience wrapper using live migration directory contents. */
export function validateAcceptedMigrationInventory(): MigrationValidationIssue[] {
  return validateDiscoveredMigrationInventory(
    listMigrationFiles(),
    computeMigrationFileChecksum,
  );
}

export interface LiveMigrationRow {
  filename: string;
  checksum: string;
}

/**
 * Validate live postgres_migrations tracking rows against accepted registry.
 */
export function validateLiveMigrationTracking(
  rows: readonly LiveMigrationRow[],
): MigrationValidationIssue[] {
  const issues: MigrationValidationIssue[] = [];
  const accepted = acceptedMigrationFilenames();
  const acceptedSet = new Set(accepted);

  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.filename)) {
      issues.push({ code: 'duplicate_tracking_row', detail: row.filename });
    }
    seen.add(row.filename);
  }

  if (rows.length !== accepted.length) {
    issues.push({
      code: 'tracking_row_count',
      detail: `expected ${accepted.length} rows, got ${rows.length}`,
    });
  }

  const rowByName = new Map(rows.map((r) => [r.filename, r]));

  for (const filename of accepted) {
    const row = rowByName.get(filename);
    if (!row) {
      issues.push({ code: 'missing_tracking_row', detail: filename });
      continue;
    }
    const expected = ACCEPTED_MIGRATION_CHECKSUMS[filename];
    if (row.checksum !== expected) {
      issues.push({
        code: 'live_checksum_mismatch',
        detail: `${filename}: expected ${expected}, got ${row.checksum}`,
      });
    }
  }

  for (const row of rows) {
    if (!acceptedSet.has(row.filename)) {
      issues.push({ code: 'unexpected_tracking_row', detail: row.filename });
    }
  }

  return issues;
}
