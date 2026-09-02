import { Router } from 'express';
import { LOCAL_TENANT_ID } from '../config/constants';
import { aiUsageLedgerService } from '../services/intelligence/AIUsageLedgerService';
import { marketingKnowledgeService } from '../services/intelligence/MarketingKnowledgeService';
import { marketingFeedbackService } from '../services/intelligence/MarketingFeedbackService';
import { channelStrategyService } from '../services/intelligence/ChannelStrategyService';
import { aiOrchestrator } from '../services/intelligence/AIOrchestrator';

export const intelligenceRouter = Router();

// ─── AI Status & Budget ───────────────────────────────────────────────────────

intelligenceRouter.get('/status', (_req, res) => {
  const available = aiOrchestrator.isAvailable();
  const summary = aiUsageLedgerService.budgetSummary(LOCAL_TENANT_ID);
  res.json({ available, budget: summary });
});

intelligenceRouter.get('/budget', (_req, res) => {
  res.json(aiUsageLedgerService.budgetSummary(LOCAL_TENANT_ID));
});

intelligenceRouter.put('/budget', (req, res) => {
  const { monthlyLimitUsd, alertThresholdPct } = req.body as { monthlyLimitUsd?: number; alertThresholdPct?: number };
  if (typeof monthlyLimitUsd !== 'number' || monthlyLimitUsd < 0) {
    return res.status(400).json({ error: 'monthlyLimitUsd must be a non-negative number' });
  }
  const threshold = typeof alertThresholdPct === 'number' ? Math.max(1, Math.min(100, alertThresholdPct)) : 80;
  aiUsageLedgerService.setBudget(LOCAL_TENANT_ID, monthlyLimitUsd, threshold);
  res.json(aiUsageLedgerService.budgetSummary(LOCAL_TENANT_ID));
});

intelligenceRouter.get('/usage', (_req, res) => {
  const limit = parseInt(String((_req.query as Record<string, string>).limit ?? '50'), 10);
  res.json(aiUsageLedgerService.recentUsage(LOCAL_TENANT_ID, Math.min(limit, 200)));
});

// ─── Knowledge ────────────────────────────────────────────────────────────────

intelligenceRouter.get('/knowledge', (_req, res) => {
  res.json(marketingKnowledgeService.readAll(LOCAL_TENANT_ID));
});

intelligenceRouter.patch('/knowledge', (req, res) => {
  const updates = req.body as Record<string, unknown>;
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    return res.status(400).json({ error: 'Body must be a JSON object' });
  }
  marketingKnowledgeService.update(LOCAL_TENANT_ID, updates);
  res.json(marketingKnowledgeService.readAll(LOCAL_TENANT_ID));
});

intelligenceRouter.post('/knowledge/seed', (req, res) => {
  const seed = req.body as Record<string, unknown>;
  if (!seed || typeof seed !== 'object' || Array.isArray(seed)) {
    return res.status(400).json({ error: 'Body must be a JSON object' });
  }
  const result = marketingKnowledgeService.seedIfEmpty(LOCAL_TENANT_ID, seed);
  res.json(result);
});

// ─── Channel Strategy ─────────────────────────────────────────────────────────

intelligenceRouter.get('/channels', (_req, res) => {
  res.json(channelStrategyService.get(LOCAL_TENANT_ID));
});

intelligenceRouter.put('/channels', (req, res) => {
  const strategy = req.body;
  if (!strategy || typeof strategy !== 'object' || Array.isArray(strategy)) {
    return res.status(400).json({ error: 'Body must be a JSON object' });
  }
  res.json(channelStrategyService.set(LOCAL_TENANT_ID, strategy));
});

intelligenceRouter.patch('/channels', (req, res) => {
  const updates = req.body;
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    return res.status(400).json({ error: 'Body must be a JSON object' });
  }
  res.json(channelStrategyService.patch(LOCAL_TENANT_ID, updates));
});

// ─── Feedback ─────────────────────────────────────────────────────────────────

intelligenceRouter.post('/feedback', (req, res) => {
  const { feedbackType, sentiment, artifactId, campaignId, feedbackText, operatorDecision, context } = req.body as Record<string, unknown>;
  if (typeof feedbackType !== 'string' || typeof sentiment !== 'string') {
    return res.status(400).json({ error: 'feedbackType and sentiment are required' });
  }
  const record = marketingFeedbackService.record({
    workspaceId: LOCAL_TENANT_ID,
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
  const records = marketingFeedbackService.list(LOCAL_TENANT_ID, {
    artifactId: artifactId || undefined,
    campaignId: campaignId || undefined,
    limit: limit ? parseInt(limit, 10) : 50,
  });
  res.json(records);
});
