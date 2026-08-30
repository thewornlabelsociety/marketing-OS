import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { LOCAL_TENANT_ID } from '../config/constants';

const dbPath = path.resolve(__dirname, '../../app_data.db');
export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDatabase() {
  const schemaPath = path.resolve(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schemaSql);

  // Ensure the local tenant exists — required by FK constraints for local-first operation.
  // This is infrastructure only; no brand workspaces are created automatically.
  const tenantExists = db
    .prepare('SELECT id FROM tenants WHERE id = ?')
    .get(LOCAL_TENANT_ID);

  if (!tenantExists) {
    db.prepare(`
      INSERT INTO tenants (id, plan_tier, license_key)
      VALUES (?, 'pro_unlimited', 'LOCAL_DEV_LICENSE')
    `).run(LOCAL_TENANT_ID);
  }
}
