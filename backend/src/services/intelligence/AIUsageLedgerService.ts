import { randomUUID } from 'crypto';
import { db } from '../../db/database';
import { computeCost } from '../../config/aiPricing';
import type { AIUsageData, AIBudgetSummary } from '../../types/marketing';

interface UsageRecordRow {
  id: string;
  workspace_id: string;
  provider: string;
  model: string;
  task_type: string;
  artifact_id: string | null;
  campaign_id: string | null;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost_usd: number;
  estimated_cost_nzd: number;
  fx_rate_used: number;
  fx_rate_source: string;
  created_at: string;
}

interface BudgetRow {
  monthly_limit_usd: number;
  alert_threshold_pct: number;
}

export class AIUsageLedgerService {
  /**
   * Record a completed AI call.
   * Synchronous — never throws; call from a try/catch if you need to surface errors.
   * The FX rate and source are preserved on the record so historical NZD estimates
   * are never recalculated using a later rate.
   */
  record(params: {
    workspaceId: string;
    provider: string;
    model: string;
    taskType: string;
    usage: AIUsageData;
    artifactId?: string | null;
    campaignId?: string | null;
  }): void {
    const cost = computeCost(params.model, params.usage.inputTokens, params.usage.outputTokens);
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO ai_usage_records
        (id, workspace_id, provider, model, task_type, artifact_id, campaign_id,
         input_tokens, output_tokens, total_tokens,
         cost_usd, estimated_cost_nzd, fx_rate_used, fx_rate_source,
         created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `aiuse_${randomUUID()}`,
      params.workspaceId,
      params.provider,
      params.model,
      params.taskType,
      params.artifactId ?? null,
      params.campaignId ?? null,
      params.usage.inputTokens,
      params.usage.outputTokens,
      params.usage.totalTokens,
      cost.usd,
      cost.estimatedNzd,
      cost.fxRateUsed,
      cost.fxRateSource,
      now,
    );
  }

  budgetSummary(workspaceId: string): AIBudgetSummary {
    const budget = db.prepare('SELECT monthly_limit_usd, alert_threshold_pct FROM workspace_ai_budget WHERE workspace_id = ?')
      .get(workspaceId) as BudgetRow | undefined;

    const monthlyLimitUsd = budget?.monthly_limit_usd ?? 10.0;
    const alertThresholdPct = budget?.alert_threshold_pct ?? 80;

    const firstOfMonth = new Date();
    firstOfMonth.setUTCDate(1);
    firstOfMonth.setUTCHours(0, 0, 0, 0);

    // Sum cost_usd and estimated_cost_nzd from stored records.
    // estimated_cost_nzd on each record was calculated at the rate captured in fx_rate_used —
    // we never recalculate old NZD figures using the current rate.
    const spent = db.prepare(`
      SELECT
        COALESCE(SUM(cost_usd), 0) AS usd,
        COALESCE(SUM(estimated_cost_nzd), 0) AS nzd
      FROM ai_usage_records
      WHERE workspace_id = ? AND created_at >= ?
    `).get(workspaceId, firstOfMonth.toISOString()) as { usd: number; nzd: number };

    const spentUsd = spent.usd;
    const estimatedSpentNzd = spent.nzd;
    const remainingUsd = Math.max(0, monthlyLimitUsd - spentUsd);
    const percentageUsed = monthlyLimitUsd > 0 ? (spentUsd / monthlyLimitUsd) * 100 : 0;
    const withinBudget = spentUsd <= monthlyLimitUsd;
    const nearingLimit = spentUsd >= (monthlyLimitUsd * alertThresholdPct / 100);

    return {
      monthlyLimitUsd,
      spentThisMonthUsd: spentUsd,
      estimatedSpentThisMonthNzd: estimatedSpentNzd,
      remainingUsd,
      percentageUsed,
      alertThresholdPct,
      withinBudget,
      nearingLimit,
    };
  }

  setBudget(workspaceId: string, monthlyLimitUsd: number, alertThresholdPct: number): void {
    const existing = db.prepare('SELECT id FROM workspace_ai_budget WHERE workspace_id = ?').get(workspaceId);
    const now = new Date().toISOString();
    if (existing) {
      db.prepare('UPDATE workspace_ai_budget SET monthly_limit_usd = ?, alert_threshold_pct = ?, updated_at = ? WHERE workspace_id = ?')
        .run(monthlyLimitUsd, alertThresholdPct, now, workspaceId);
    } else {
      db.prepare('INSERT INTO workspace_ai_budget (id, workspace_id, monthly_limit_usd, alert_threshold_pct, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(`aibud_${randomUUID()}`, workspaceId, monthlyLimitUsd, alertThresholdPct, now, now);
    }
  }

  recentUsage(workspaceId: string, limit = 50): UsageRecordRow[] {
    return db.prepare('SELECT * FROM ai_usage_records WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?')
      .all(workspaceId, limit) as UsageRecordRow[];
  }
}

export const aiUsageLedgerService = new AIUsageLedgerService();
