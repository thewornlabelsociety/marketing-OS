/**
 * Generates expected schema manifest from fully migrated SQLite (audit/comparison).
 *
 * Canonical output: src/db/postgres/sqliteSchemaManifest.json
 * Immutable after first Supabase apply — use audit output for diffs thereafter.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const {
  CANONICAL_MANIFEST,
  parseGeneratorArgs,
  printGeneratorHelp,
  resolveCanonicalOutputPath,
} = require('./pg-baseline-generator-utils.cjs');

const backendRoot = path.join(__dirname, '..');
const postgresDir = path.join(backendRoot, 'src/db/postgres');
const tmp = path.join(os.tmpdir(), `mos-pg1-manifest-${Date.now()}.db`);

/** Match baselineManifest.normalizeSqliteDefaultValue — DEFAULT NULL → no default. */
function normalizeSqliteDefaultValue(raw) {
  if (raw == null) return null;
  if (typeof raw === 'string' && raw.toUpperCase() === 'NULL') return null;
  return raw;
}

function buildManifest(db) {
  const tables = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != 'migrations'
    ORDER BY name
  `).all().map((r) => r.name);

  const indexes = db.prepare(`
    SELECT name, tbl_name, sql FROM sqlite_master
    WHERE type = 'index' AND name NOT LIKE 'sqlite_%' AND sql IS NOT NULL
    ORDER BY name
  `).all();

  const manifest = { tables: {}, indexes: [] };

  for (const table of tables) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all();
    const foreignKeys = db.prepare(`PRAGMA foreign_key_list(${table})`).all();
    manifest.tables[table] = {
      columns: columns.map((c) => ({
        name: c.name,
        sqliteType: (c.type || 'TEXT').toUpperCase(),
        notNull: c.notnull === 1,
        defaultValue: normalizeSqliteDefaultValue(c.dflt_value),
        primaryKey: c.pk > 0,
        pkOrder: c.pk,
      })),
      foreignKeys: foreignKeys.map((fk) => ({
        id: fk.id,
        seq: fk.seq,
        from: fk.from,
        to: fk.to,
        table: fk.table,
        onUpdate: fk.on_update,
        onDelete: fk.on_delete,
      })),
    };
  }

  for (const idx of indexes) {
    const unique = /CREATE UNIQUE INDEX/i.test(idx.sql);
    const partialMatch = idx.sql.match(/\bWHERE\b(.+)$/is);
    manifest.indexes.push({
      name: idx.name,
      table: idx.tbl_name,
      unique,
      partialPredicate: partialMatch ? partialMatch[1].trim() : null,
      sql: idx.sql,
    });
  }

  manifest.generatedAt = new Date().toISOString();
  manifest.checksum = crypto.createHash('sha256').update(JSON.stringify({
    tables: manifest.tables,
    indexes: manifest.indexes,
  })).digest('hex');

  return { manifest, tables };
}

function main() {
  const cli = parseGeneratorArgs();
  if (cli.help) {
    printGeneratorHelp('generate-pg-baseline-manifest.cjs', {
      canonicalFile: CANONICAL_MANIFEST,
      artifactLabel: 'SQLite schema manifest (sqliteSchemaManifest.json)',
      defaultAuditPrefix: 'sqliteSchemaManifest.generated',
    });
    return;
  }

  const outPath = resolveCanonicalOutputPath({
    postgresDir,
    canonicalFilename: CANONICAL_MANIFEST,
    auditFilenamePrefix: 'sqliteSchemaManifest.generated',
    allowPreBaselineOverwrite: cli.allowPreBaselineOverwrite,
    explicitOutput: cli.output,
    artifactLabel: 'schema manifest',
  });

  const db = new Database(tmp);
  db.pragma('foreign_keys = ON');

  const schemaSql = fs.readFileSync(path.join(backendRoot, 'src/db/schema.sql'), 'utf8')
    .replace(/PRAGMA[^;]+;/gi, '');
  db.exec(schemaSql);

  const migrationsDir = path.join(backendRoot, 'src/db/migrations');
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  for (const filename of files) {
    db.exec(fs.readFileSync(path.join(migrationsDir, filename), 'utf8'));
  }

  const { manifest, tables } = buildManifest(db);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2));
  console.log(`Wrote manifest: ${outPath}`);
  console.log(`Tables: ${tables.length}, Indexes: ${manifest.indexes.length}`);
  console.log(`Checksum: ${manifest.checksum}`);

  db.close();
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(tmp + suffix); } catch (_) { /* ignore */ }
  }
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
