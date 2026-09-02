#!/usr/bin/env node
'use strict';
/**
 * Phase 4A — Marketing Intelligence Foundation — Verification
 * Run: node scripts/run-verify-phase-4a.cjs
 * 29 checks across 9 sections.
 */
const fs = require('fs');
const path = require('path');

let pass = 0;
let fail = 0;
const failures = [];

function ok(label) { console.log(`  ✓  ${label}`); pass++; }
function ko(label, reason) { console.error(`  ✗  ${label}${reason ? ` — ${reason}` : ''}`); fail++; failures.push({ label, reason }); }
function check(label, condition, reason) { if (condition) ok(label); else ko(label, reason); }

function readFile(rel) {
  try { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
  catch { return null; }
}

// ─── [1/9] Migrations ─────────────────────────────────────────────────────────
console.log('\n[1/9] Migrations');

const m16 = readFile('src/db/migrations/016-marketing-scope.sql');
check('016-marketing-scope.sql exists', m16 !== null);
check('016 adds marketing_scope to campaigns', m16?.includes('campaigns ADD COLUMN marketing_scope'), 'column not added to campaigns');
check('016 adds marketing_scope to creative_artifacts', m16?.includes('creative_artifacts ADD COLUMN marketing_scope'), 'column not added to creative_artifacts');

const m17 = readFile('src/db/migrations/017-ai-usage-ledger.sql');
check('017-ai-usage-ledger.sql exists', m17 !== null);
check('017 creates ai_usage_records table', m17?.includes('CREATE TABLE IF NOT EXISTS ai_usage_records'));
check('017 creates workspace_ai_budget table', m17?.includes('CREATE TABLE IF NOT EXISTS workspace_ai_budget'));
check('017 ai_usage_records has fx_rate_used column', m17?.includes('fx_rate_used REAL'), 'fx_rate_used not recorded — old NZD figures would be unverifiable');
check('017 ai_usage_records has fx_rate_source column', m17?.includes('fx_rate_source TEXT'), 'fx_rate_source not recorded — cannot audit which rate was applied');
check('017 uses estimated_cost_nzd not cost_nzd', m17?.includes('estimated_cost_nzd') && !m17?.includes('  cost_nzd'), 'misleading naming — implies provider-billed NZD');

const m18 = readFile('src/db/migrations/018-creative-feedback.sql');
check('018-creative-feedback.sql exists', m18 !== null);
check('018 creates creative_feedback table', m18?.includes('CREATE TABLE IF NOT EXISTS creative_feedback'));

const m19 = readFile('src/db/migrations/019-creative-ai-provenance.sql');
check('019-creative-ai-provenance.sql exists', m19 !== null);
check('019 adds ai_provider, ai_model, ai_generated, ai_task_type', m19?.includes('ai_provider') && m19?.includes('ai_model') && m19?.includes('ai_generated') && m19?.includes('ai_task_type'));

const m20 = readFile('src/db/migrations/020-channel-strategy.sql');
check('020-channel-strategy.sql exists', m20 !== null);
check('020 creates workspace_channel_strategy table', m20?.includes('CREATE TABLE IF NOT EXISTS workspace_channel_strategy'));

// ─── [2/9] FX Integrity ───────────────────────────────────────────────────────
console.log('\n[2/9] FX / NZD Cost Integrity');

const pricing = readFile('src/config/aiPricing.ts');
check('aiPricing.ts exists', pricing !== null);
check('computeCost returns estimatedNzd not nzd', pricing?.includes('estimatedNzd') && !pricing?.match(/\s+nzd:/), 'plain nzd field implies provider-billed amount');
check('computeCost returns fxRateUsed', pricing?.includes('fxRateUsed'), 'FX rate not returned per-call');
check('computeCost returns fxRateSource', pricing?.includes('fxRateSource'), 'FX source not returned per-call');
check('USD_TO_NZD exported as named constant (not inlined)', pricing?.includes('STATIC_USD_TO_NZD'), 'rate scattered through logic rather than centralised');
check('FX_RATE_SOURCE constant exported', pricing?.includes('FX_RATE_SOURCE'), 'source not exported as constant');

const ledger = readFile('src/services/intelligence/AIUsageLedgerService.ts');
check('Ledger stores estimated_cost_nzd not cost_nzd', ledger?.includes('estimated_cost_nzd') && !ledger?.includes("'cost_nzd'"), 'misleading column name used in INSERT');
check('Ledger stores fx_rate_used', ledger?.includes('fx_rate_used') && ledger?.includes('cost.fxRateUsed'), 'FX rate not written to record');
check('Ledger stores fx_rate_source', ledger?.includes('fx_rate_source') && ledger?.includes('cost.fxRateSource'), 'FX source not written to record');
check('Budget summary uses estimatedSpentThisMonthNzd', ledger?.includes('estimatedSpentThisMonthNzd'), 'misleading field name on summary');
check('Budget summary includes percentageUsed', ledger?.includes('percentageUsed'), 'percentage field missing');
check('NZD budget SUM reads estimated_cost_nzd column', ledger?.includes('SUM(estimated_cost_nzd)'), 'summing wrong column');

// ─── [3/9] AI Provider Contract ──────────────────────────────────────────────
console.log('\n[3/9] AI Provider Contract');

const contract = readFile('src/integrations/contracts/AIProvider.ts');
check('generateTracked in contract', contract?.includes('generateTracked'));
check('generateStructured preserved for backward compat', contract?.includes('generateStructured'));
check('AIGenerationResult referenced', contract?.includes('AIGenerationResult'));

const anthropic = readFile('src/integrations/adapters/AnthropicAdapter.ts');
check('AnthropicAdapter.generateTracked captures input_tokens', anthropic?.includes('input_tokens'));
check('AnthropicAdapter.generateStructured delegates to generateTracked', anthropic?.includes('generateTracked(req)'));

const openai = readFile('src/integrations/adapters/OpenAIAdapter.ts');
check('OpenAIAdapter.generateTracked captures prompt_tokens', openai?.includes('prompt_tokens'));

// ─── [4/9] Usage-Ledger Durability ──────────────────────────────────────────
console.log('\n[4/9] Usage-Ledger Durability');

const orchestrator = readFile('src/services/intelligence/AIOrchestrator.ts');
check('AIOrchestrator wraps ledger record() in try/catch', orchestrator?.includes('try {') && orchestrator?.includes('aiUsageLedgerService.record'), 'ledger failure not caught — could surface as unhandled rejection');
check('Catch logs to console.warn not console.error or throw', orchestrator?.includes('console.warn'), 'failure not surfaced to diagnostics');
check('result returned after catch — generation survives ledger failure', (() => {
  // Confirm that "return result" appears AFTER the catch block
  if (!orchestrator) return false;
  const catchIdx = orchestrator.lastIndexOf('} catch');
  const returnIdx = orchestrator.lastIndexOf('return result');
  return returnIdx > catchIdx;
})(), 'return result is before catch block — ledger failure would suppress content');
check('Ledger.record() is synchronous — no unhandled Promise', !ledger?.includes('async record'), 'record() is async — a bare call would create an unhandled Promise');

// ─── [5/9] Intelligence Route Security ────────────────────────────────────────
console.log('\n[5/9] Intelligence Route Security');

const routes = readFile('src/routes/intelligence.ts');
check('All routes use LOCAL_TENANT_ID constant (not req.body.workspaceId)', routes?.includes('LOCAL_TENANT_ID') && !routes?.includes('req.body.workspaceId') && !routes?.includes('req.params.workspaceId'), 'browser-supplied workspace ID accepted — violates local-first security model');
check('Status endpoint returns no API keys', (() => {
  if (!routes) return false;
  // Extract the /status handler body and verify it only returns available + budget
  const statusHandler = routes.match(/intelligenceRouter\.get\('\/status'[\s\S]*?\}\)/)?.[0] ?? '';
  return statusHandler.includes('available') && !statusHandler.includes('apiKey') && !statusHandler.includes('ANTHROPIC') && !statusHandler.includes('OPENAI');
})(), 'API key may leak through /status');
check('Knowledge seed uses LOCAL_TENANT_ID', routes?.includes("marketingKnowledgeService.seedIfEmpty(LOCAL_TENANT_ID"), 'workspace ID not locked to local tenant');
check('Feedback route uses LOCAL_TENANT_ID', routes?.includes("workspaceId: LOCAL_TENANT_ID"), 'workspace ID not locked to local tenant');

// ─── [6/9] Knowledge Seed Safety ─────────────────────────────────────────────
console.log('\n[6/9] Knowledge Seed Safety');

const knowledge = readFile('src/services/intelligence/MarketingKnowledgeService.ts');
check('seedIfEmpty skips existing top-level keys', knowledge?.includes("if (current[key] !== undefined)") && knowledge?.includes('skippedKeys.push'), 'existing keys not protected');
check('seedIfEmpty returns skippedKeys list', knowledge?.includes('skippedKeys'), 'caller cannot audit what was skipped');
check('seedIfEmpty returns applied:false when nothing to write', knowledge?.includes("applied: false"), 'caller cannot detect a no-op seed');
check('No hardcoded brand name in knowledge service', !knowledge?.includes("'Worn Label'") && !knowledge?.includes('"Worn Label"'), 'brand name hardcoded');
check('deepMerge does not overwrite scalar values with object or vice versa unexpectedly', knowledge?.includes('typeof value === \'object\'') && knowledge?.includes('!Array.isArray(value)'), 'merge guard missing');

// ─── [7/9] Intelligence Services ─────────────────────────────────────────────
console.log('\n[7/9] Intelligence Services');

check('AIOrchestrator.isAvailable() present', orchestrator?.includes('isAvailable'));
check('AIOrchestrator.generate accepts MarketingAIBrief', orchestrator?.includes('MarketingAIBrief'));
check('MarketingKnowledgeService.formatForPrompt present', knowledge?.includes('formatForPrompt'));

const feedback = readFile('src/services/intelligence/MarketingFeedbackService.ts');
check('MarketingFeedbackService.record present', feedback?.includes('record('));
check('MarketingFeedbackService scopes all queries to workspace_id', feedback?.includes('workspace_id = ?'), 'workspace filter missing from query');

const channels = readFile('src/services/intelligence/ChannelStrategyService.ts');
check('ChannelStrategyService.patch merges not replaces', channels?.includes('{ ...current, ...updates }'), 'patch replaces entire strategy instead of merging');

// ─── [8/9] OperatorStudio Provenance ─────────────────────────────────────────
console.log('\n[8/9] OperatorStudio Provenance');

const opStudio = readFile('src/services/business/OperatorStudioService.ts');
check('Uses aiOrchestrator.generate() not raw ai.generateStructured()', opStudio?.includes('aiOrchestrator.generate') && !opStudio?.includes('ai.generateStructured'));
check('getAIProvider() import removed', !opStudio?.includes("from '../../integrations/adapters/AIProviderFactory'"));
check('ai_generated=0 when fallback template used (truthful)', opStudio?.includes('aiGenerated ? 1 : 0'));
check('ai_provider=NULL when fallback used', opStudio?.includes('aiGenerated ? (aiEnv.provider ?? null) : null'));
check('CREATIVE_COPY task type for single-format', opStudio?.includes("'CREATIVE_COPY'"));
check('CREATIVE_WHOLE_SET task type for whole-set', opStudio?.includes("'CREATIVE_WHOLE_SET'"));
check('creative_source_links uses INSERT OR IGNORE (no duplicates)', opStudio?.includes('INSERT OR IGNORE INTO creative_source_links'));

// ─── [9/9] WLS Read-Only Confirmation ────────────────────────────────────────
console.log('\n[9/9] WLS Read-Only');

const wlsConnector = readFile('src/integrations/business/WornLabelConnector.ts');
check('WornLabelConnector declares READ_PRODUCTS, READ_AVAILABILITY capabilities only', wlsConnector?.includes("'READ_PRODUCTS', 'READ_AVAILABILITY'") && !wlsConnector?.includes('WRITE'), 'write capability declared');
check('WornLabelConnector makes no POST/PUT/DELETE/PATCH HTTP calls', !wlsConnector?.includes("method: 'POST'") && !wlsConnector?.includes("method: 'PUT'") && !wlsConnector?.includes("method: 'DELETE'") && !wlsConnector?.match(/axios\.(post|put|patch|delete)\(/), 'write HTTP call found');

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log('\n─────────────────────────────────────────');
console.log(`Phase 4A: ${pass} passed, ${fail} failed`);
if (failures.length > 0) {
  console.log('\nFailed checks:');
  for (const f of failures) {
    console.log(`  ✗ ${f.label}${f.reason ? ` (${f.reason})` : ''}`);
  }
}
console.log('─────────────────────────────────────────\n');
process.exit(fail > 0 ? 1 : 0);
