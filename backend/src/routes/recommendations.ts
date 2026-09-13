import { Router, Request } from 'express';
import { marketingExpertService } from '../services/intelligence/MarketingExpertService';

const router = Router();

function resolveWorkspaceId(req: Request): string | undefined {
  const query = req.query as Record<string, string | undefined>;
  const body = req.body as { workspaceId?: string } | undefined;
  return query.workspaceId || body?.workspaceId;
}

// GET /api/recommendations — list NEW and ACCEPTED recommendations
router.get('/', (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  if (!workspaceId) return res.status(400).json({ error: 'workspaceId is required' });
  try {
    const recommendations = marketingExpertService.listRecommendations(workspaceId);
    res.json({ recommendations });
  } catch (err) {
    console.error('[recommendations] list error:', err);
    res.status(500).json({ error: 'Failed to list recommendations' });
  }
});

// POST /api/recommendations/generate — trigger AI generation
router.post('/generate', async (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  if (!workspaceId) return res.status(400).json({ error: 'workspaceId is required' });
  try {
    const result = await marketingExpertService.generateRecommendations(workspaceId);
    res.json(result);
  } catch (err) {
    console.error('[recommendations] generate error:', err);
    res.status(500).json({ error: 'Failed to generate recommendations' });
  }
});

// POST /api/recommendations/:id/dismiss
router.post('/:id/dismiss', (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  if (!workspaceId) return res.status(400).json({ error: 'workspaceId is required' });
  try {
    const { id } = req.params;
    const dismissed = marketingExpertService.dismissRecommendation(id, workspaceId);
    if (!dismissed) {
      return res.status(404).json({ error: 'Recommendation not found or already actioned' });
    }
    res.json({ success: true, id });
  } catch (err) {
    console.error('[recommendations] dismiss error:', err);
    res.status(500).json({ error: 'Failed to dismiss recommendation' });
  }
});

export { router as recommendationsRouter };
