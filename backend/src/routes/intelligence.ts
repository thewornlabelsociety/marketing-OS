import { Router, type Request } from 'express';
import { LOCAL_TENANT_ID } from '../config/constants';
import { getCoreRepositories } from '../db/core/createCoreRepositories';
import { aiUsageLedgerService } from '../services/intelligence/AIUsageLedgerService';
import { marketingKnowledgeService } from '../services/intelligence/MarketingKnowledgeService';
import { marketingFeedbackService } from '../services/intelligence/MarketingFeedbackService';
import { channelStrategyService } from '../services/intelligence/ChannelStrategyService';
import { aiOrchestrator } from '../services/intelligence/AIOrchestrator';

export const intelligenceRouter = Router();

// Resolve workspace from request — query param takes precedence over LOCAL_TENANT_ID.
// Validates the entity exists so cross-workspace access is prevented.
async function resolveWorkspaceId(req: Request): Promise<string> {
  const q = String((req.query as Record<string, string>).workspaceId ?? '').trim();
  const candidate = q || LOCAL_TENANT_ID;
  const exists = await getCoreRepositories().workspace.exists(candidate);
  return exists ? candidate : LOCAL_TENANT_ID;
}

// ─── AI Status & Budget ───────────────────────────────────────────────────────

intelligenceRouter.get('/status', async (req, res) => {
  const wsId = await resolveWorkspaceId(req);
  const available = aiOrchestrator.isAvailable();
  const summary = aiUsageLedgerService.budgetSummary(wsId);
  res.json({ available, budget: summary });
});

intelligenceRouter.get('/budget', async (req, res) => {
  res.json(aiUsageLedgerService.budgetSummary(await resolveWorkspaceId(req)));
});

intelligenceRouter.put('/budget', async (req, res) => {
  const { monthlyLimitUsd, alertThresholdPct } = req.body as { monthlyLimitUsd?: number; alertThresholdPct?: number };
  if (typeof monthlyLimitUsd !== 'number' || monthlyLimitUsd < 0) {
    res.status(400).json({ error: 'monthlyLimitUsd must be a non-negative number' });
    return;
  }
  const wsId = await resolveWorkspaceId(req);
  const threshold = typeof alertThresholdPct === 'number' ? Math.max(1, Math.min(100, alertThresholdPct)) : 80;
  aiUsageLedgerService.setBudget(wsId, monthlyLimitUsd, threshold);
  res.json(aiUsageLedgerService.budgetSummary(wsId));
});

intelligenceRouter.get('/usage', async (req, res) => {
  const { limit } = req.query as Record<string, string>;
  res.json(aiUsageLedgerService.recentUsage(await resolveWorkspaceId(req), Math.min(parseInt(limit ?? '50', 10), 200)));
});

// ─── Knowledge ────────────────────────────────────────────────────────────────

intelligenceRouter.get('/knowledge', async (req, res) => {
  res.json(await marketingKnowledgeService.readAll(await resolveWorkspaceId(req)));
});

intelligenceRouter.patch('/knowledge', async (req, res) => {
  const updates = req.body as Record<string, unknown>;
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    res.status(400).json({ error: 'Body must be a JSON object' });
    return;
  }
  const wsId = await resolveWorkspaceId(req);
  await marketingKnowledgeService.update(wsId, updates);
  res.json(await marketingKnowledgeService.readAll(wsId));
});

intelligenceRouter.post('/knowledge/seed', async (req, res) => {
  const seed = req.body as Record<string, unknown>;
  if (!seed || typeof seed !== 'object' || Array.isArray(seed)) {
    res.status(400).json({ error: 'Body must be a JSON object' });
    return;
  }
  const result = await marketingKnowledgeService.seedIfEmpty(await resolveWorkspaceId(req), seed);
  res.json(result);
});

// ─── Channel Strategy ─────────────────────────────────────────────────────────

intelligenceRouter.get('/channels', async (req, res) => {
  res.json(channelStrategyService.get(await resolveWorkspaceId(req)));
});

intelligenceRouter.put('/channels', async (req, res) => {
  const strategy = req.body;
  if (!strategy || typeof strategy !== 'object' || Array.isArray(strategy)) {
    res.status(400).json({ error: 'Body must be a JSON object' });
    return;
  }
  res.json(channelStrategyService.set(await resolveWorkspaceId(req), strategy));
});

intelligenceRouter.patch('/channels', async (req, res) => {
  const updates = req.body;
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    res.status(400).json({ error: 'Body must be a JSON object' });
    return;
  }
  res.json(channelStrategyService.patch(await resolveWorkspaceId(req), updates));
});

// ─── Feedback ─────────────────────────────────────────────────────────────────

intelligenceRouter.post('/feedback', async (req, res) => {
  const { feedbackType, sentiment, artifactId, campaignId, feedbackText, operatorDecision, context } = req.body as Record<string, unknown>;
  if (typeof feedbackType !== 'string' || typeof sentiment !== 'string') {
    res.status(400).json({ error: 'feedbackType and sentiment are required' });
    return;
  }
  const record = marketingFeedbackService.record({
    workspaceId: await resolveWorkspaceId(req),
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

intelligenceRouter.get('/feedback', async (req, res) => {
  const { artifactId, campaignId, limit } = req.query as Record<string, string>;
  const records = marketingFeedbackService.list(await resolveWorkspaceId(req), {
    artifactId: artifactId || undefined,
    campaignId: campaignId || undefined,
    limit: limit ? parseInt(limit, 10) : 50,
  });
  res.json(records);
});
