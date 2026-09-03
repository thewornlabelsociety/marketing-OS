import { Router } from 'express';
import { requireLocalOperatorSession } from '../middleware/localOperatorSession';
import { businessIntegrationService } from '../services/business/BusinessIntegrationService';
import { sourceRecordService } from '../services/business/SourceRecordService';
import { operatorStudioService } from '../services/business/OperatorStudioService';
import { creativeGeneratorService } from '../services/creative/CreativeGeneratorService';
import { db } from '../db/database';

export const businessSourcesRouter = Router();
businessSourcesRouter.use(requireLocalOperatorSession);

businessSourcesRouter.get('/integrations', (req, res) => {
  const workspaceId = String(req.query.workspaceId ?? '');
  if (!workspaceId) return res.status(400).json({ error: 'workspaceId is required' });
  res.json(businessIntegrationService.list(workspaceId));
});

businessSourcesRouter.get('/products', (req, res) => {
  const workspaceId = String(req.query.workspaceId ?? '');
  if (!workspaceId) return res.status(400).json({ error: 'workspaceId is required' });
  res.json(sourceRecordService.list(workspaceId, String(req.query.filter ?? 'all')));
});

businessSourcesRouter.get('/products/:id/usage', (req, res) => {
  const workspaceId = String(req.query.workspaceId ?? '');
  if (!workspaceId) return res.status(400).json({ error: 'workspaceId is required' });
  const usage = sourceRecordService.usage(req.params.id, workspaceId);
  if (!usage) return res.status(404).json({ error: 'Product not found' });
  res.json(usage);
});

businessSourcesRouter.get('/studio/library', (req, res) => {
  const workspaceId = String(req.query.workspaceId ?? '');
  if (!workspaceId) return res.status(400).json({ error: 'workspaceId is required' });

  const contentTypeToFormat: Record<string, 'POST' | 'CAROUSEL' | 'STORY' | 'EMAIL'> = {
    STATIC_POST: 'POST',
    CAROUSEL: 'CAROUSEL',
    STORY: 'STORY',
    EMAIL: 'EMAIL',
    NEWSLETTER: 'EMAIL',
  };

  const rows = db.prepare(`
    SELECT ca.id AS artifactId, ca.campaign_id AS campaignId, ca.content_key AS contentKey,
           ca.channel, ca.content_type AS contentType, ca.format, ca.title, ca.status,
           ca.content, ca.creative_direction AS creativeDirection,
           ca.created_at AS createdAt, ca.updated_at AS updatedAt,
           c.name AS campaignName, c.status AS campaignStatus
    FROM creative_artifacts ca
    JOIN campaigns c ON c.id = ca.campaign_id
    WHERE ca.workspace_id = ? AND ca.is_current = 1
    ORDER BY ca.created_at DESC
    LIMIT 100
  `).all(workspaceId) as Array<{
    artifactId: string; campaignId: string; contentKey: string;
    channel: string; contentType: string; format: string;
    title: string | null; status: string; content: string;
    creativeDirection: string | null;
    createdAt: string; updatedAt: string;
    campaignName: string; campaignStatus: string;
  }>;

  const enriched = rows.map(a => {
    const products = (db.prepare(`
      SELECT sr.id, sr.title, sr.image_urls, sr.price_amount, sr.price_currency, sr.payload
      FROM creative_source_links csl
      JOIN source_records sr ON sr.id = csl.source_record_id
      WHERE csl.creative_artifact_id = ?
      ORDER BY csl.position
    `).all(a.artifactId) as Array<{
      id: string; title: string; image_urls: string;
      price_amount: number | null; price_currency: string | null; payload: string;
    }>).map(p => {
      const payload = JSON.parse(p.payload || '{}') as Record<string, unknown>;
      return {
        id: p.id,
        title: p.title,
        brand: (payload.brand as string | null) ?? null,
        imageUrls: JSON.parse(p.image_urls || '[]') as string[],
        price: p.price_amount,
        currency: p.price_currency,
      };
    });

    let content: unknown;
    try { content = JSON.parse(a.content); } catch { content = {}; }

    return {
      artifactId: a.artifactId,
      campaignId: a.campaignId,
      contentKey: a.contentKey,
      channel: a.channel,
      contentType: a.contentType,
      format: a.format,
      studioFormat: contentTypeToFormat[a.contentType] ?? 'POST',
      title: a.title,
      status: a.status,
      campaignName: a.campaignName,
      campaignStatus: a.campaignStatus,
      content,
      products,
      creativeDirection: a.creativeDirection ?? null,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    };
  });

  res.json(enriched);
});

businessSourcesRouter.post('/studio/founder', async (req, res) => {
  const { workspaceId, recommendationId } = req.body as {
    workspaceId?: string;
    recommendationId?: string;
  };
  if (!workspaceId) return res.status(400).json({ error: 'workspaceId is required', code: 'BAD_REQUEST' });
  if (!recommendationId) return res.status(400).json({ error: 'recommendationId is required', code: 'BAD_REQUEST' });
  const result = await operatorStudioService.setupFounderContent({ workspaceId, recommendationId });
  if ('error' in result) {
    const status = result.code === 'NOT_FOUND' ? 404 : result.code === 'CONFLICT' ? 409 : 400;
    return res.status(status).json(result);
  }
  res.json(result);
});

businessSourcesRouter.post('/studio', async (req, res) => {
  const { workspaceId, sourceProductIds, format, creativeDirection, recommendationId } = req.body as {
    workspaceId?: string;
    sourceProductIds?: string[];
    format?: string;
    creativeDirection?: 'EDITORIAL' | 'PRODUCT_LED' | 'MINIMAL' | null;
    recommendationId?: string | null;
  };
  if (!workspaceId) return res.status(400).json({ error: 'workspaceId is required', code: 'BAD_REQUEST' });
  if (!sourceProductIds?.length) return res.status(400).json({ error: 'At least one product must be selected', code: 'BAD_REQUEST' });
  if (!format) return res.status(400).json({ error: 'format is required', code: 'BAD_REQUEST' });

  const direction = creativeDirection ?? null;
  const recId = recommendationId ?? null;

  if (format === 'WHOLE_SET') {
    const result = await operatorStudioService.setupWholeSet({ workspaceId, sourceProductIds, creativeDirection: direction, recommendationId: recId });
    if ('error' in result) {
      const status = result.code === 'NOT_FOUND' ? 404 : result.code === 'CONFLICT' ? 409 : 400;
      return res.status(status).json(result);
    }
    return res.json(result);
  }

  const result = await operatorStudioService.setup({
    workspaceId,
    sourceProductIds,
    format: format as 'POST' | 'CAROUSEL' | 'STORY' | 'EMAIL',
    creativeDirection: direction,
    recommendationId: recId,
  });
  if ('error' in result) {
    const status = result.code === 'NOT_FOUND' ? 404 : result.code === 'CONFLICT' ? 409 : 400;
    return res.status(status).json(result);
  }
  res.json(result);
});

// Approve all artifacts in a whole-set — uses existing approval semantics per artifact
businessSourcesRouter.post('/studio/approve-all', async (req, res) => {
  const { workspaceId, campaignId, artifacts } = req.body as {
    workspaceId?: string;
    campaignId?: string;
    artifacts?: Array<{ artifactId: string; contentKey: string }>;
  };

  if (!workspaceId) return res.status(400).json({ error: 'workspaceId is required' });
  if (!campaignId) return res.status(400).json({ error: 'campaignId is required' });
  if (!Array.isArray(artifacts) || artifacts.length === 0) return res.status(400).json({ error: 'artifacts must be a non-empty array' });

  const results: Array<{ artifactId: string; contentKey: string; success: boolean; error?: string }> = [];

  for (const { artifactId, contentKey } of artifacts) {
    // Verify the artifact belongs to this workspace and campaign
    const row = db.prepare(
      'SELECT id FROM creative_artifacts WHERE id = ? AND campaign_id = ? AND workspace_id = ? AND is_current = 1'
    ).get(artifactId, campaignId, workspaceId);

    if (!row) {
      results.push({ artifactId, contentKey, success: false, error: 'Artifact not found or not accessible' });
      continue;
    }

    const outcome = creativeGeneratorService.approve(campaignId, contentKey, artifactId);
    if (outcome.error) {
      results.push({ artifactId, contentKey, success: false, error: outcome.error });
    } else {
      results.push({ artifactId, contentKey, success: true });
    }
  }

  res.json({ results });
});
