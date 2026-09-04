# Postgres audit artifacts

This directory holds **read-only comparison output** from baseline generators.

Generators refuse to overwrite canonical files once they exist:

- `../migrations/001_mos_baseline.sql`
- `../sqliteSchemaManifest.json`

After `001`/`002` are applied to Supabase, those canonical files are **immutable**.
Future schema changes require new numbered migrations (`003_*.sql`, `004_*.sql`, …).

Generate audit copies with:

```bash
node scripts/generate-pg-baseline-manifest.cjs
node scripts/generate-pg-baseline-sql.cjs
```

Or specify an explicit path:

```bash
node scripts/generate-pg-baseline-manifest.cjs --output ./tmp/manifest.json
node scripts/generate-pg-baseline-sql.cjs --output ./tmp/baseline.sql
```

Overwrite canonical files only **before first Supabase apply**:

```bash
node scripts/generate-pg-baseline-sql.cjs --allow-pre-baseline-overwrite
```
