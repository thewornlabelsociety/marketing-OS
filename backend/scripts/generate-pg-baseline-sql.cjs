/**
 * Generates squashed Postgres baseline SQL from fully migrated SQLite schema.
 *
 * Canonical output: src/db/postgres/migrations/001_mos_baseline.sql
 * Immutable after first Supabase apply — use audit output or new 003_*.sql migrations thereafter.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const Database = require('better-sqlite3');
const {
  CANONICAL_BASELINE,
  parseGeneratorArgs,
  printGeneratorHelp,
  resolveCanonicalOutputPath,
} = require('./pg-baseline-generator-utils.cjs');

const backendRoot = path.join(__dirname, '..');
const postgresDir = path.join(backendRoot, 'src/db/postgres');
const tmp = path.join(os.tmpdir(), `mos-pg1-baseline-${Date.now()}.db`);

const TIMESTAMP_NAME = /(_at|_for|_until|_since|occurred_at|scheduled_for|applied_at|resolved_at|published_at|evaluated_at)$/i;

function isTimestampColumn(name, sqliteType) {
  const t = (sqliteType || 'TEXT').toUpperCase();
  if (t.includes('DATETIME') || t.includes('TIMESTAMP')) return true;
  if (t === 'TEXT' && TIMESTAMP_NAME.test(name)) return true;
  return false;
}

function mapType(col) {
  const t = (col.type || 'TEXT').toUpperCase();
  if (isTimestampColumn(col.name, t)) return 'TIMESTAMPTZ';
  if (t.includes('INT')) return 'INTEGER';
  if (t === 'REAL' || t.includes('FLOAT') || t.includes('DOUBLE')) return 'DOUBLE PRECISION';
  if (t.includes('BLOB')) return 'BYTEA';
  return 'TEXT';
}

function mapDefault(col, pgType) {
  if (col.dflt_value == null) return null;
  let d = col.dflt_value;
  if (typeof d === 'string') {
    if (/^CURRENT_TIMESTAMP$/i.test(d)) return 'NOW()';
    if (/^datetime\s*\(\s*'now'\s*\)/i.test(d)) return 'NOW()';
    if (pgType === 'TIMESTAMPTZ' && /^'now'$/i.test(d)) return 'NOW()';
    return d;
  }
  return String(d);
}

function quoteIdent(name) {
  return `"${name.replace(/"/g, '""')}"`;
}

function buildCreateTable(db, table) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  const pkCols = cols.filter((c) => c.pk > 0).sort((a, b) => a.pk - b.pk);
  const lines = cols.map((c) => {
    const pgType = mapType(c);
    let line = `  ${quoteIdent(c.name)} ${pgType}`;
    const isSinglePk = pkCols.length === 1 && pkCols[0].name === c.name;
    if (c.notnull && !isSinglePk) line += ' NOT NULL';
    const def = mapDefault(c, pgType);
    if (def != null && !isSinglePk) line += ` DEFAULT ${def}`;
    return line;
  });

  if (pkCols.length === 1) {
    const pk = pkCols[0];
    const idx = lines.findIndex((l) => l.includes(quoteIdent(pk.name)));
    if (idx >= 0) {
      const def = mapDefault(pk, mapType(pk));
      lines[idx] = `  ${quoteIdent(pk.name)} ${mapType(pk)} PRIMARY KEY`;
      if (def != null) lines[idx] += ` DEFAULT ${def}`;
    }
  } else if (pkCols.length > 1) {
    lines.push(`  PRIMARY KEY (${pkCols.map((c) => quoteIdent(c.name)).join(', ')})`);
  }

  return `CREATE TABLE IF NOT EXISTS ${quoteIdent(table)} (\n${lines.join(',\n')}\n);`;
}

function collectForeignKeys(db, tables) {
  const fks = [];
  for (const table of tables) {
    for (const fk of db.prepare(`PRAGMA foreign_key_list(${table})`).all()) {
      const onDelete = fk.on_delete && fk.on_delete !== 'NO ACTION' ? ` ON DELETE ${fk.on_delete}` : '';
      const onUpdate = fk.on_update && fk.on_update !== 'NO ACTION' ? ` ON UPDATE ${fk.on_update}` : '';
      fks.push(
        `ALTER TABLE ${quoteIdent(table)} ADD CONSTRAINT ${quoteIdent(`${table}_${fk.from}_fkey`)} `
        + `FOREIGN KEY (${quoteIdent(fk.from)}) REFERENCES ${quoteIdent(fk.table)} (${quoteIdent(fk.to)})${onDelete}${onUpdate};`,
      );
    }
  }
  return fks;
}

function translateIndexSql(sql) {
  return sql.replace(/\s+/g, ' ').trim();
}

function generateBaselineSql(db) {
  const tables = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != 'migrations'
    ORDER BY name
  `).all().map((r) => r.name);

  const indexes = db.prepare(`
    SELECT name, sql FROM sqlite_master
    WHERE type = 'index' AND name NOT LIKE 'sqlite_%' AND sql IS NOT NULL
    ORDER BY name
  `).all();

  const fks = collectForeignKeys(db, tables);

  let out = '-- Migration 001: MOS canonical Postgres baseline (squashed from SQLite schema.sql + migrations 001-023)\n\n';
  for (const table of tables) {
    out += `-- Table: ${table}\n${buildCreateTable(db, table)}\n\n`;
  }

  if (fks.length > 0) {
    out += '-- Foreign keys\n';
    for (const fk of fks) out += `${fk}\n`;
    out += '\n';
  }

  out += '-- Indexes\n';
  for (const idx of indexes) {
    out += `${translateIndexSql(idx.sql)};\n`;
  }

  return { out, tables, fks, indexes };
}

function main() {
  const cli = parseGeneratorArgs();
  if (cli.help) {
    printGeneratorHelp('generate-pg-baseline-sql.cjs', {
      canonicalFile: `migrations/${CANONICAL_BASELINE}`,
      artifactLabel: 'Postgres baseline SQL (001_mos_baseline.sql)',
      defaultAuditPrefix: '001_mos_baseline.generated',
    });
    return;
  }

  const outPath = resolveCanonicalOutputPath({
    postgresDir,
    canonicalFilename: path.join('migrations', CANONICAL_BASELINE),
    auditFilenamePrefix: '001_mos_baseline.generated',
    allowPreBaselineOverwrite: cli.allowPreBaselineOverwrite,
    explicitOutput: cli.output,
    artifactLabel: 'baseline SQL',
  });

  const db = new Database(tmp);
  db.pragma('foreign_keys = ON');
  const schemaSql = fs.readFileSync(path.join(backendRoot, 'src/db/schema.sql'), 'utf8')
    .replace(/PRAGMA[^;]+;/gi, '');
  db.exec(schemaSql);
  const migrationsDir = path.join(backendRoot, 'src/db/migrations');
  for (const f of fs.readdirSync(migrationsDir).filter((x) => x.endsWith('.sql')).sort()) {
    db.exec(fs.readFileSync(path.join(migrationsDir, f), 'utf8'));
  }

  const { out, tables, fks, indexes } = generateBaselineSql(db);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, out);
  console.log(`Wrote ${outPath} (${tables.length} tables, ${fks.length} foreign keys, ${indexes.length} indexes)`);

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
