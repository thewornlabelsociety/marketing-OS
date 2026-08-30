import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { LOCAL_TENANT_ID } from '../config/constants';

const dbPath = process.env.SQLITE_PATH
  ? path.resolve(process.env.SQLITE_PATH)
  : path.resolve(__dirname, '../../app_data.db');
export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const SYSTEM_OBJECTIVES = [
  {
    id: 'obj_sys_sales',
    name: 'Sales',
    description: 'Drive direct product or service purchases.',
    objective_type: 'SALES',
    primary_kpi: 'conversions',
    supporting_kpis: JSON.stringify(['revenue', 'reach']),
    default_channels: JSON.stringify(['instagram', 'email']),
  },
  {
    id: 'obj_sys_lead_gen',
    name: 'Lead Generation',
    description: 'Collect qualified leads for the sales pipeline.',
    objective_type: 'LEAD_GENERATION',
    primary_kpi: 'leads',
    supporting_kpis: JSON.stringify(['website_clicks', 'conversions']),
    default_channels: JSON.stringify(['instagram', 'email', 'facebook']),
  },
  {
    id: 'obj_sys_traffic',
    name: 'Traffic',
    description: 'Drive website visits or landing page clicks.',
    objective_type: 'TRAFFIC',
    primary_kpi: 'website_clicks',
    supporting_kpis: JSON.stringify(['reach', 'ctr']),
    default_channels: JSON.stringify(['instagram', 'facebook']),
  },
  {
    id: 'obj_sys_awareness',
    name: 'Awareness',
    description: 'Expand brand reach to new audiences.',
    objective_type: 'AWARENESS',
    primary_kpi: 'reach',
    supporting_kpis: JSON.stringify(['impressions', 'new_followers']),
    default_channels: JSON.stringify(['instagram', 'tiktok', 'facebook']),
  },
  {
    id: 'obj_sys_engagement',
    name: 'Engagement',
    description: 'Build audience connection and community interaction.',
    objective_type: 'ENGAGEMENT',
    primary_kpi: 'engagement_rate',
    supporting_kpis: JSON.stringify(['saves', 'comments', 'shares']),
    default_channels: JSON.stringify(['instagram', 'tiktok']),
  },
  {
    id: 'obj_sys_launch',
    name: 'Product / Service Launch',
    description: 'Introduce a new product or service to market.',
    objective_type: 'LAUNCH',
    primary_kpi: 'launch_conversions',
    supporting_kpis: JSON.stringify(['reach', 'website_clicks']),
    default_channels: JSON.stringify(['instagram', 'email', 'facebook']),
  },
  {
    id: 'obj_sys_event',
    name: 'Event Promotion',
    description: 'Drive ticket sales, RSVPs, or event attendance.',
    objective_type: 'EVENT_PROMOTION',
    primary_kpi: 'rsvps_or_tickets',
    supporting_kpis: JSON.stringify(['reach', 'website_clicks']),
    default_channels: JSON.stringify(['instagram', 'email', 'facebook']),
  },
  {
    id: 'obj_sys_email_growth',
    name: 'Email List Growth',
    description: 'Grow the newsletter or email subscriber base.',
    objective_type: 'EMAIL_LIST_GROWTH',
    primary_kpi: 'new_subscribers',
    supporting_kpis: JSON.stringify(['website_clicks', 'conversions']),
    default_channels: JSON.stringify(['instagram', 'facebook']),
  },
  {
    id: 'obj_sys_retention',
    name: 'Customer Retention',
    description: 'Re-purchase and loyalty from existing customers.',
    objective_type: 'RETENTION',
    primary_kpi: 'repeat_purchases',
    supporting_kpis: JSON.stringify(['revenue', 'conversions']),
    default_channels: JSON.stringify(['email', 'sms']),
  },
  {
    id: 'obj_sys_reengagement',
    name: 'Re-engagement',
    description: 'Bring lapsed customers or followers back to active status.',
    objective_type: 'RE_ENGAGEMENT',
    primary_kpi: 'reactivated_customers',
    supporting_kpis: JSON.stringify(['clicks', 'conversions']),
    default_channels: JSON.stringify(['email', 'instagram']),
  },
  {
    id: 'obj_sys_education',
    name: 'Education',
    description: 'Teach the audience something that builds trust or demand.',
    objective_type: 'EDUCATION',
    primary_kpi: 'content_completions',
    supporting_kpis: JSON.stringify(['saves', 'shares', 'watch_time']),
    default_channels: JSON.stringify(['instagram', 'tiktok', 'email']),
  },
  {
    id: 'obj_sys_community',
    name: 'Community Growth',
    description: 'Increase follower count or community membership.',
    objective_type: 'COMMUNITY_GROWTH',
    primary_kpi: 'new_followers',
    supporting_kpis: JSON.stringify(['reach', 'engagement_rate']),
    default_channels: JSON.stringify(['instagram', 'tiktok', 'facebook']),
  },
  {
    id: 'obj_sys_clearance',
    name: 'Inventory Clearance',
    description: 'Move excess or expiring stock at volume.',
    objective_type: 'INVENTORY_CLEARANCE',
    primary_kpi: 'units_sold',
    supporting_kpis: JSON.stringify(['revenue', 'conversions']),
    default_channels: JSON.stringify(['email', 'instagram', 'sms']),
  },
];

function runMigrations() {
  db.exec(`CREATE TABLE IF NOT EXISTS migrations (
    filename TEXT PRIMARY KEY,
    applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  const migrationsDir = path.resolve(__dirname, 'migrations');
  if (!fs.existsSync(migrationsDir)) return;

  const files = fs.readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const filename of files) {
    const already = db.prepare('SELECT filename FROM migrations WHERE filename = ?').get(filename);
    if (already) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, filename), 'utf8');
    db.exec(sql);
    db.prepare('INSERT INTO migrations (filename) VALUES (?)').run(filename);
  }
}

function seedSystemObjectives() {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO objectives
      (id, workspace_id, name, description, objective_type, primary_kpi, supporting_kpis,
       conversion_event, success_criteria, default_channels, is_system, is_active)
    VALUES
      (?, NULL, ?, ?, ?, ?, ?, NULL, NULL, ?, 1, 1)
  `);

  const tx = db.transaction(() => {
    for (const obj of SYSTEM_OBJECTIVES) {
      insert.run(
        obj.id,
        obj.name,
        obj.description,
        obj.objective_type,
        obj.primary_kpi,
        obj.supporting_kpis,
        obj.default_channels,
      );
    }
  });
  tx();
}

export function initDatabase() {
  const schemaPath = path.resolve(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schemaSql);

  runMigrations();
  seedSystemObjectives();

  // Ensure the local tenant exists — required by FK constraints for local-first operation.
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
