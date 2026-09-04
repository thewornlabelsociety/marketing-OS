/**
 * Shared CLI helpers for PG baseline generators.
 * Canonical migrations/manifest are immutable after first Supabase apply.
 */
const fs = require('fs');
const path = require('path');

const CANONICAL_BASELINE = '001_mos_baseline.sql';
const CANONICAL_MANIFEST = 'sqliteSchemaManifest.json';

function parseGeneratorArgs() {
  const args = process.argv.slice(2);
  let output = null;
  let allowPreBaselineOverwrite = false;
  let help = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      help = true;
    } else if (arg === '--output') {
      const next = args[++i];
      if (!next) throw new Error('--output requires a path argument');
      output = path.resolve(next);
    } else if (arg === '--allow-pre-baseline-overwrite') {
      allowPreBaselineOverwrite = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return { output, allowPreBaselineOverwrite, help };
}

function printGeneratorHelp(scriptName, { canonicalFile, artifactLabel, defaultAuditPrefix }) {
  console.log(`Usage: node scripts/${scriptName} [options]

Generates ${artifactLabel} from a fully migrated temp SQLite database.

Canonical file (immutable after first Supabase apply):
  backend/src/db/postgres/${canonicalFile}

Options:
  --output <path>                 Write to an explicit path (audit/diff output)
  --allow-pre-baseline-overwrite  Overwrite canonical file ONLY before first Supabase apply
  --help                          Show this help

If the canonical file already exists and --allow-pre-baseline-overwrite is not supplied,
output is written to:
  backend/src/db/postgres/audit/${defaultAuditPrefix}.<timestamp>.*

After 001/002 are applied to Supabase, never regenerate canonical files.
Add new immutable migrations instead: 003_*.sql, 004_*.sql, ...
`);
}

function resolveCanonicalOutputPath({
  postgresDir,
  canonicalFilename,
  auditFilenamePrefix,
  allowPreBaselineOverwrite,
  explicitOutput,
  artifactLabel,
}) {
  const canonicalPath = path.join(postgresDir, canonicalFilename);

  if (explicitOutput) {
    return explicitPathGuard(explicitOutput, canonicalPath, allowPreBaselineOverwrite, artifactLabel);
  }

  if (fs.existsSync(canonicalPath)) {
    if (allowPreBaselineOverwrite) {
      console.warn(`WARNING: Overwriting canonical ${artifactLabel} with --allow-pre-baseline-overwrite.`);
      console.warn('Use only before first Supabase apply. After apply, add 003_*.sql, 004_*.sql, ...');
      return canonicalPath;
    }

    const auditDir = path.join(postgresDir, 'audit');
    fs.mkdirSync(auditDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const ext = path.extname(canonicalFilename);
    const auditPath = path.join(auditDir, `${auditFilenamePrefix}.${stamp}${ext}`);
    console.warn(`Canonical ${artifactLabel} already exists — refusing overwrite.`);
    console.warn(`Writing audit copy: ${auditPath}`);
    console.warn('Use --output <path> for explicit audit output.');
    console.warn('Use --allow-pre-baseline-overwrite only before first Supabase apply.');
    return auditPath;
  }

  return canonicalPath;
}

function explicitPathGuard(explicitOutput, canonicalPath, allowPreBaselineOverwrite, artifactLabel) {
  if (
    path.resolve(explicitOutput) === path.resolve(canonicalPath)
    && fs.existsSync(canonicalPath)
    && !allowPreBaselineOverwrite
  ) {
    throw new Error(
      `Refusing to overwrite canonical ${artifactLabel} without --allow-pre-baseline-overwrite: ${canonicalPath}`,
    );
  }
  return explicitOutput;
}

module.exports = {
  CANONICAL_BASELINE,
  CANONICAL_MANIFEST,
  parseGeneratorArgs,
  printGeneratorHelp,
  resolveCanonicalOutputPath,
};
