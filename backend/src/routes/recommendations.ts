import { Router } from 'express';
import { marketingExpertService } from '../services/intelligence/MarketingExpertService';
import { LOCAL_TENANT_ID } from '../config/constants';

const router = Router();

// GET /api/recommendations — list NEW and ACCEPTED recommendations
router.get('/', (_req, res) => {
  try {
    const recommendations = marketingExpertService.listRecommendations(LOCAL_TENANT_ID);
    res.json({ recommendations });
  } catch (err) {
    console.error('[recommendations] list error:', err);
    res.status(500).json({ error: 'Failed to list recommendations' });
  }
});

// POST /api/recommendations/generate — trigger AI generation
router.post('/generate', async (_req, res) => {
  try {
    const result = await marketingExpertService.generateRecommendations(LOCAL_TENANT_ID);
    res.json(result);
  } catch (err) {
    console.error('[recommendations] generate error:', err);
    res.status(500).json({ error: 'Failed to generate recommendations' });
  }
});

// POST /api/recommendations/:id/dismiss
router.post('/:id/dismiss', (req, res) => {
  try {
    const { id } = req.params;
    const dismissed = marketingExpertService.dismissRecommendation(id, LOCAL_TENANT_ID);
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
