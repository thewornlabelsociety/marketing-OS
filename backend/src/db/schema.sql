PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- 1. Tenants (Commercial SaaS readiness)
CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
    plan_tier TEXT DEFAULT 'pro',
    license_key TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Dynamic Workspaces / Entities
CREATE TABLE IF NOT EXISTS entities (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    brand_kit JSON NOT NULL,
    api_keys JSON DEFAULT '{}',
    is_archived INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- 3. Intake Queue from Admin Bridge
CREATE TABLE IF NOT EXISTS intake_queue (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    brand TEXT,
    title TEXT,
    fabric TEXT,
    price REAL,
    photos JSON DEFAULT '[]',
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE
);

-- 4. Content Items & Master Drop Drafts
CREATE TABLE IF NOT EXISTS content_items (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body_markdown TEXT,
    assets JSON DEFAULT '[]',
    status TEXT DEFAULT 'draft',
    target_channels JSON DEFAULT '[]',
    scheduled_for DATETIME,
    is_archived INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE
);

-- 5. SOP Playbooks
CREATE TABLE IF NOT EXISTS sops (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT,
    recurrence TEXT DEFAULT 'one_time',
    steps JSON NOT NULL,
    last_completed_at DATETIME,
    is_archived INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE
);

-- 6. Performance Attribution & Memory Vault
CREATE TABLE IF NOT EXISTS performance_logs (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    content_id TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    impressions INTEGER DEFAULT 0,
    revenue REAL DEFAULT 0.0,
    conversions INTEGER DEFAULT 0,
    hook TEXT,
    ai_learnings TEXT,
    is_synced_to_vault INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (content_id) REFERENCES content_items(id) ON DELETE CASCADE,
    FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE
);

-- 7. Recurring Drop Blueprints
CREATE TABLE IF NOT EXISTS recurring_drop_templates (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    name TEXT NOT NULL,
    enabled INTEGER DEFAULT 1,
    slots JSON NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE
);
