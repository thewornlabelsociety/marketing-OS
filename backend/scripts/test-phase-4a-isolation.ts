#!/usr/bin/env ts-node
/**
 * Phase 4A — Runtime isolation and budget acceptance tests
 * Run: npx ts-node scripts/test-phase-4a-isolation.ts
 *
 * Uses the real app_data.db — writes to test-scoped entities only and cleans up.
 */
import { randomUUID } from 'crypto';
import { db } from '../src/db/database';
import { marketingKnowledgeService } from '../src/services/intelligence/MarketingKnowledgeService';
import { aiUsageLedgerService } from '../src/services/intelligence/AIUsageLedgerService';

let pass = 0;
let fail = 0;

function ok(label: string) { console.log(`  ✓  ${label}`); pass++; }
function ko(label: string, reason: string) { console.error(`  ✗  ${label} — ${reason}`); fail++; }
function check(label: string, condition: boolean, reason: string) { if (condition) ok(label); else ko(label, reason); }

// ─── Test Setup ───────────────────────────────────────────────────────────────

const WLS_ID = `test_wls_${randomUUID()}`;
const FUDI_ID = `test_fudi_${randomUUID()}`;
const WLS_TENANT = 'test_tenant_isolation';

function insertTestEntity(id: string, name: string) {
  db.prepare(`
    INSERT OR IGNORE INTO tenants (id, plan_tier, license_key)
    VALUES (?, 'pro_unlimited', 'TEST_LICENSE')
  `).run(WLS_TENANT);
  db.prepare(`
    INSERT INTO entities (id, tenant_id, name, slug, brand_kit, api_keys, updated_at)
    VALUES (?, ?, ?, ?, '{}', '{}', CURRENT_TIMESTAMP)
  `).run(id, WLS_TENANT, name, name.toLowerCase().replace(/\s/g, '-'));
}

function cleanup() {
  db.prepare('DELETE FROM ai_usage_records WHERE workspace_id IN (?, ?)').run(WLS_ID, FUDI_ID);
  db.prepare('DELETE FROM workspace_ai_budget WHERE workspace_id IN (?, ?)').run(WLS_ID, FUDI_ID);
  db.prepare('DELETE FROM entities WHERE id IN (?, ?)').run(WLS_ID, FUDI_ID);
  db.prepare('DELETE FROM tenants WHERE id = ?').run(WLS_TENANT);
}

// ─── Test 1: Cross-brand knowledge isolation ──────────────────────────────────
console.log('\n[1/3] Cross-brand knowledge isolation');

insertTestEntity(WLS_ID, 'Test WLS Workspace');
insertTestEntity(FUDI_ID, 'Test FUDI Workspace');

// Seed distinct sentinels into each workspace
marketingKnowledgeService.update(WLS_ID, { brandBrain: { identity: { sentinel: 'WLS_ONLY_SENTINEL_4A' } } });
marketingKnowledgeService.update(FUDI_ID, { brandBrain: { identity: { sentinel: 'FUDI_ONLY_SENTINEL_4A' } } });

// Read WLS knowledge — check it contains WLS sentinel and NOT FÜDI sentinel
const wlsKnowledge = marketingKnowledgeService.read(WLS_ID, ['BRAND_CORE']);
const wlsPromptText = JSON.stringify(wlsKnowledge);
check('WLS knowledge contains WLS sentinel', wlsPromptText.includes('WLS_ONLY_SENTINEL_4A'), 'WLS sentinel absent from WLS workspace read');
check('WLS knowledge does NOT contain FÜDI sentinel', !wlsPromptText.includes('FUDI_ONLY_SENTINEL_4A'), 'FÜDI sentinel leaked into WLS workspace read');

// Read FÜDI knowledge — check it contains FÜDI sentinel and NOT WLS sentinel
const fudiKnowledge = marketingKnowledgeService.read(FUDI_ID, ['BRAND_CORE']);
const fudiPromptText = JSON.stringify(fudiKnowledge);
check('FÜDI knowledge contains FÜDI sentinel', fudiPromptText.includes('FUDI_ONLY_SENTINEL_4A'), 'FÜDI sentinel absent from FÜDI workspace read');
check('FÜDI knowledge does NOT contain WLS sentinel', !fudiPromptText.includes('WLS_ONLY_SENTINEL_4A'), 'WLS sentinel leaked into FÜDI workspace read');

// Verify formatForPrompt also isolates correctly
const wlsFormatted = marketingKnowledgeService.formatForPrompt(WLS_ID, ['BRAND_CORE']);
const fudiFormatted = marketingKnowledgeService.formatForPrompt(FUDI_ID, ['BRAND_CORE']);
check('WLS formatForPrompt contains WLS sentinel', wlsFormatted.includes('WLS_ONLY_SENTINEL_4A'), 'WLS sentinel absent from formatted prompt');
check('WLS formatForPrompt does NOT contain FÜDI sentinel', !wlsFormatted.includes('FUDI_ONLY_SENTINEL_4A'), 'FÜDI sentinel leaked into WLS formatted prompt');
check('FÜDI formatForPrompt contains FÜDI sentinel', fudiFormatted.includes('FUDI_ONLY_SENTINEL_4A'), 'FÜDI sentinel absent from formatted prompt');
check('FÜDI formatForPrompt does NOT contain WLS sentinel', !fudiFormatted.includes('WLS_ONLY_SENTINEL_4A'), 'WLS sentinel leaked into FÜDI formatted prompt');

// ─── Test 2: Seed safety ─────────────────────────────────────────────────────
console.log('\n[2/3] Seed safety');

const testSeedId = `test_seed_${randomUUID()}`;
insertTestEntity(testSeedId, 'Test Seed Workspace');

// Empty workspace → seed succeeds
const firstSeed = marketingKnowledgeService.seedIfEmpty(testSeedId, { operatorNote: 'seeded' });
check('Empty workspace: seed applied', firstSeed.applied === true, `applied=${firstSeed.applied}`);

// Operator edits the seeded key
marketingKnowledgeService.update(testSeedId, { operatorNote: 'operator-edited' });

// Seed called again → operator change preserved
const secondSeed = marketingKnowledgeService.seedIfEmpty(testSeedId, { operatorNote: 'seeded' });
check('Re-seed skips existing key', secondSeed.applied === false, `applied=${secondSeed.applied}`);
check('Operator edit preserved after re-seed', secondSeed.skippedKeys.includes('operatorNote'), 'key not in skippedKeys');

const kit = marketingKnowledgeService.readAll(testSeedId);
check('Operator value unchanged after re-seed', (kit as Record<string, unknown>).operatorNote === 'operator-edited', `value=${(kit as Record<string, unknown>).operatorNote}`);

// New key not present → seeds that key while leaving existing alone
const partialSeed = marketingKnowledgeService.seedIfEmpty(testSeedId, { operatorNote: 'seeded', newField: 'from-seed' });
check('Seed adds missing key', partialSeed.applied === true && partialSeed.skippedKeys.includes('operatorNote'), 'missing key not added or existing key overwritten');
const kitAfterPartial = marketingKnowledgeService.readAll(testSeedId) as Record<string, unknown>;
check('Existing key still intact after partial seed', kitAfterPartial.operatorNote === 'operator-edited', `value=${kitAfterPartial.operatorNote}`);
check('New field present after partial seed', kitAfterPartial.newField === 'from-seed', `value=${kitAfterPartial.newField}`);

db.prepare('DELETE FROM entities WHERE id = ?').run(testSeedId);

// ─── Test 3: Budget calculation ───────────────────────────────────────────────
console.log('\n[3/3] Budget calculation');

const budgetWorkspaceId = WLS_ID;

// Zero usage
const zeroSummary = aiUsageLedgerService.budgetSummary(budgetWorkspaceId);
check('Zero usage: spentThisMonthUsd = 0', zeroSummary.spentThisMonthUsd === 0, `spent=${zeroSummary.spentThisMonthUsd}`);
check('Zero usage: withinBudget = true', zeroSummary.withinBudget, 'zero spend should be within budget');
check('Zero usage: percentageUsed = 0', zeroSummary.percentageUsed === 0, `percentage=${zeroSummary.percentageUsed}`);

// Set budget to $50 USD
aiUsageLedgerService.setBudget(budgetWorkspaceId, 50, 80);

// Record $12.50 of usage — use a known model so cost is deterministic
// We'll inject records directly to control exact dollar amounts
const now = new Date().toISOString();
db.prepare(`
  INSERT INTO ai_usage_records
    (id, workspace_id, provider, model, task_type, artifact_id, campaign_id,
     input_tokens, output_tokens, total_tokens, cost_usd, estimated_cost_nzd, fx_rate_used, fx_rate_source, created_at)
  VALUES (?, ?, 'anthropic', 'claude-sonnet-4-5-20251015', 'CREATIVE_COPY', NULL, NULL, 0, 0, 0, 12.50, 20.50, 1.64, 'static', ?)
`).run(`aiuse_test_${randomUUID()}`, budgetWorkspaceId, now);

const summary = aiUsageLedgerService.budgetSummary(budgetWorkspaceId);
check('Budget $50, spent $12.50: spentThisMonthUsd = 12.50', Math.abs(summary.spentThisMonthUsd - 12.50) < 0.001, `spent=${summary.spentThisMonthUsd}`);
check('Budget $50, spent $12.50: remainingUsd = 37.50', Math.abs(summary.remainingUsd - 37.50) < 0.001, `remaining=${summary.remainingUsd}`);
check('Budget $50, spent $12.50: percentageUsed = 25', Math.abs(summary.percentageUsed - 25) < 0.01, `percentage=${summary.percentageUsed}`);
check('Budget $50, spent $12.50: withinBudget = true', summary.withinBudget, 'should be within budget');
check('Budget $50, spent $12.50: nearingLimit = false (threshold 80%)', !summary.nearingLimit, 'should not be nearing limit at 25%');
check('estimatedSpentThisMonthNzd = 20.50 (preserved per-record)', Math.abs(summary.estimatedSpentThisMonthNzd - 20.50) < 0.001, `nzd=${summary.estimatedSpentThisMonthNzd}`);

// Over budget
db.prepare(`
  INSERT INTO ai_usage_records
    (id, workspace_id, provider, model, task_type, artifact_id, campaign_id,
     input_tokens, output_tokens, total_tokens, cost_usd, estimated_cost_nzd, fx_rate_used, fx_rate_source, created_at)
  VALUES (?, ?, 'anthropic', 'claude-sonnet-4-5-20251015', 'CREATIVE_COPY', NULL, NULL, 0, 0, 0, 50.00, 82.00, 1.64, 'static', ?)
`).run(`aiuse_test_${randomUUID()}`, budgetWorkspaceId, now);

const overSummary = aiUsageLedgerService.budgetSummary(budgetWorkspaceId);
check('Over budget: withinBudget = false', !overSummary.withinBudget, 'should be over budget');
check('Over budget: remainingUsd = 0 (not negative)', overSummary.remainingUsd === 0, `remaining=${overSummary.remainingUsd}`);
check('Near limit at 80% threshold fires correctly', overSummary.nearingLimit, 'should be nearing limit');

// No configured budget falls back to default $10
const noBudgetId = FUDI_ID;
const defaultSummary = aiUsageLedgerService.budgetSummary(noBudgetId);
check('No configured budget: default monthlyLimitUsd = 10', defaultSummary.monthlyLimitUsd === 10, `limit=${defaultSummary.monthlyLimitUsd}`);
check('No configured budget: default alertThresholdPct = 80', defaultSummary.alertThresholdPct === 80, `threshold=${defaultSummary.alertThresholdPct}`);

// Workspace isolation — FÜDI should not see WLS usage
check('Budget workspace isolation: FÜDI sees 0 spend', defaultSummary.spentThisMonthUsd === 0, `FÜDI saw ${defaultSummary.spentThisMonthUsd} of WLS spend`);

// ─── Cleanup ──────────────────────────────────────────────────────────────────
cleanup();

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log('\n─────────────────────────────────────────');
console.log(`Isolation + budget: ${pass} passed, ${fail} failed`);
console.log('─────────────────────────────────────────\n');
process.exit(fail > 0 ? 1 : 0);
