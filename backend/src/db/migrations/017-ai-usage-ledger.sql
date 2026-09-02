-- Migration 017: AI usage records and workspace budget

CREATE TABLE IF NOT EXISTS ai_usage_records (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  task_type TEXT NOT NULL,
  artifact_id TEXT REFERENCES creative_artifacts(id) ON DELETE SET NULL,
  campaign_id TEXT REFERENCES campaigns(id) ON DELETE SET NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  -- cost_usd: estimated cost in USD based on provider pricing at time of call
  cost_usd REAL NOT NULL DEFAULT 0,
  -- estimated_cost_nzd: NZD estimate at fx_rate_used; NOT a provider-billed NZD amount
  estimated_cost_nzd REAL NOT NULL DEFAULT 0,
  -- fx_rate_used: the exact USD→NZD rate applied to produce estimated_cost_nzd
  fx_rate_used REAL NOT NULL DEFAULT 1.64,
  -- fx_rate_source: how the rate was obtained (e.g. 'static', 'open-exchange-rates')
  fx_rate_source TEXT NOT NULL DEFAULT 'static',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspace_ai_budget (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL UNIQUE REFERENCES entities(id) ON DELETE CASCADE,
  monthly_limit_usd REAL NOT NULL DEFAULT 10.0,
  alert_threshold_pct INTEGER NOT NULL DEFAULT 80,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
