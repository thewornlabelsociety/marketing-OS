import { Router, type Request } from 'express';
import { LOCAL_TENANT_ID } from '../config/constants';
import { db } from '../db/database';
import { aiUsageLedgerService } from '../services/intelligence/AIUsageLedgerService';
import { marketingKnowledgeService } from '../services/intelligence/MarketingKnowledgeService';
import { marketingFeedbackService } from '../services/intelligence/MarketingFeedbackService';
import { channelStrategyService } from '../services/intelligence/ChannelStrategyService';
import { aiOrchestrator } from '../services/intelligence/AIOrchestrator';

export const intelligenceRouter = Router();

// Resolve workspace from request — query param takes precedence over LOCAL_TENANT_ID.
// Validates the entity exists so cross-workspace access is prevented.
function resolveWorkspaceId(req: Request): string {
  const q = String((req.query as Record<string, string>).workspaceId ?? '').trim();
  const candidate = q || LOCAL_TENANT_ID;
  const exists = db.prepare('SELECT id FROM entities WHERE id = ?').get(candidate);
  return exists ? candidate : LOCAL_TENANT_ID;
}

// ─── AI Status & Budget ───────────────────────────────────────────────────────

intelligenceRouter.get('/status', (req, res) => {
  const wsId = resolveWorkspaceId(req);
  const available = aiOrchestrator.isAvailable();
  const summary = aiUsageLedgerService.budgetSummary(wsId);
  res.json({ available, budget: summary });
});

intelligenceRouter.get('/budget', (req, res) => {
  res.json(aiUsageLedgerService.budgetSummary(resolveWorkspaceId(req)));
});

intelligenceRouter.put('/budget', (req, res) => {
  const { monthlyLimitUsd, alertThresholdPct } = req.body as { monthlyLimitUsd?: number; alertThresholdPct?: number };
  if (typeof monthlyLimitUsd !== 'number' || monthlyLimitUsd < 0) {
    return res.status(400).json({ error: 'monthlyLimitUsd must be a non-negative number' });
  }
  const wsId = resolveWorkspaceId(req);
  const threshold = typeof alertThresholdPct === 'number' ? Math.max(1, Math.min(100, alertThresholdPct)) : 80;
  aiUsageLedgerService.setBudget(wsId, monthlyLimitUsd, threshold);
  res.json(aiUsageLedgerService.budgetSummary(wsId));
});

intelligenceRouter.get('/usage', (req, res) => {
  const { limit } = req.query as Record<string, string>;
  res.json(aiUsageLedgerService.recentUsage(resolveWorkspaceId(req), Math.min(parseInt(limit ?? '50', 10), 200)));
});

// ─── Knowledge ────────────────────────────────────────────────────────────────

intelligenceRouter.get('/knowledge', (req, res) => {
  res.json(marketingKnowledgeService.readAll(resolveWorkspaceId(req)));
});

intelligenceRouter.patch('/knowledge', (req, res) => {
  const updates = req.body as Record<string, unknown>;
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    return res.status(400).json({ error: 'Body must be a JSON object' });
  }
  const wsId = resolveWorkspaceId(req);
  marketingKnowledgeService.update(wsId, updates);
  res.json(marketingKnowledgeService.readAll(wsId));
});

intelligenceRouter.post('/knowledge/seed', (req, res) => {
  const seed = req.body as Record<string, unknown>;
  if (!seed || typeof seed !== 'object' || Array.isArray(seed)) {
    return res.status(400).json({ error: 'Body must be a JSON object' });
  }
  const result = marketingKnowledgeService.seedIfEmpty(resolveWorkspaceId(req), seed);
  res.json(result);
});

// ─── Channel Strategy ─────────────────────────────────────────────────────────

intelligenceRouter.get('/channels', (req, res) => {
  res.json(channelStrategyService.get(resolveWorkspaceId(req)));
});

intelligenceRouter.put('/channels', (req, res) => {
  const strategy = req.body;
  if (!strategy || typeof strategy !== 'object' || Array.isArray(strategy)) {
    return res.status(400).json({ error: 'Body must be a JSON object' });
  }
  res.json(channelStrategyService.set(resolveWorkspaceId(req), strategy));
});

intelligenceRouter.patch('/channels', (req, res) => {
  const updates = req.body;
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    return res.status(400).json({ error: 'Body must be a JSON object' });
  }
  res.json(channelStrategyService.patch(resolveWorkspaceId(req), updates));
});

// ─── Feedback ─────────────────────────────────────────────────────────────────

intelligenceRouter.post('/feedback', (req, res) => {
  const { feedbackType, sentiment, artifactId, campaignId, feedbackText, operatorDecision, context } = req.body as Record<string, unknown>;
  if (typeof feedbackType !== 'string' || typeof sentiment !== 'string') {
    return res.status(400).json({ error: 'feedbackType and sentiment are required' });
  }
  const record = marketingFeedbackService.record({
    workspaceId: resolveWorkspaceId(req),
    feedbackType: feedbackType as Parameters<typeof marketingFeedbackService.record>[0]['feedbackType'],
    sentiment: sentiment as Parameters<typeof marketingFeedbackService.record>[0]['sentiment'],
    artifactId: typeof artifactId === 'string' ? artifactId : null,
    campaignId: typeof campaignId === 'string' ? campaignId : null,
    feedbackText: typeof feedbackText === 'string' ? feedbackText : null,
    operatorDecision: typeof operatorDecision === 'string' ? operatorDecision : null,
    context: context && typeof context === 'object' && !Array.isArray(context) ? (context as Record<string, unknown>) : null,
  });
  res.status(201).json(record);
});

intelligenceRouter.get('/feedback', (req, res) => {
  const { artifactId, campaignId, limit } = req.query as Record<string, string>;
  const records = marketingFeedbackService.list(resolveWorkspaceId(req), {
    artifactId: artifactId || undefined,
    campaignId: campaignId || undefined,
    limit: limit ? parseInt(limit, 10) : 50,
  });
  res.json(records);
});
