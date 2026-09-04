import { Router, Request, Response } from 'express';
import { aiEnv } from '../config/aiEnvironment';
import { db } from '../db/database';
import { creativeGeneratorService } from '../services/creative/CreativeGeneratorService';
import { contentPlannerService } from '../services/campaigns/ContentPlannerService';

type CreativeReq = Request<{ campaignId: string; contentKey?: string }>;

interface CampaignRecord { id: string; workspace_id: string }

function resolveWorkspaceId(req: CreativeReq): string | undefined {
  const query = req.query as Record<string, string | undefined>;
  const body = req.body as { workspaceId?: string } | undefined;
  return query.workspaceId || body?.workspaceId;
}

function resolveCampaign(campaignId: string, workspaceId: string | undefined, res: Response): CampaignRecord | null {
  if (!workspaceId) {
    res.status(400).json({ error: 'workspaceId is required' });
    return null;
  }
  const campaign = db.prepare('SELECT id, workspace_id FROM campaigns WHERE id = ?').get(campaignId) as CampaignRecord | undefined;
  if (!campaign) {
    res.status(404).json({ error: 'Campaign not found' });
    return null;
  }
  if (campaign.workspace_id !== workspaceId) {
    res.status(403).json({ error: 'Campaign does not belong to the specified workspace' });
    return null;
  }
  return campaign;
}

function statusFor(code?: string): number {
  if (code === 'AI_UNAVAILABLE') return 503;
  if (code === 'CONTENT_PLAN_NOT_APPROVED') return 409;
  if (code === 'PLANNING_CHANGE_REQUIRED') return 409;
  if (code === 'VALIDATION_FAILED' || code === 'QUALITY_FAILED') return 422;
  if (code === 'INVALID_CONTENT_KEY' || code === 'NOT_FOUND') return 404;
  return 400;
}

export const campaignCreativeRouter = Router({ mergeParams: true });

campaignCreativeRouter.get('/', (req: CreativeReq, res: Response) => {
  const { campaignId } = req.params;
  if (!resolveCampaign(campaignId, resolveWorkspaceId(req), res)) return;

  const summary = creativeGeneratorService.getSummary(campaignId);
  if ('error' in summary) {
    res.status(statusFor(summary.code)).json({ error: summary.error, code: summary.code });
    return;
  }
  res.json(summary);
});

campaignCreativeRouter.get('/status', (req: CreativeReq, res: Response) => {
  const { campaignId } = req.params;
  if (!resolveCampaign(campaignId, resolveWorkspaceId(req), res)) return;

  const approval = contentPlannerService.getApproval(campaignId);
  res.json({
    aiConfigured: aiEnv.isConfigured,
    aiProvider: aiEnv.provider,
    contentPlanApproved: approval !== null,
    summary: 'error' in (creativeGeneratorService.getSummary(campaignId) ?? {})
      ? null
      : creativeGeneratorService.getSummary(campaignId),
  });
});

campaignCreativeRouter.post('/generate', async (req: CreativeReq, res: Response) => {
  const { campaignId } = req.params;
  if (!resolveCampaign(campaignId, resolveWorkspaceId(req), res)) return;

  const result = await creativeGeneratorService.generateAllMissing(campaignId);
  if ('error' in result) {
    res.status(statusFor(result.code)).json({ error: result.error, code: result.code });
    return;
  }
  res.status(201).json(result);
});

campaignCreativeRouter.get('/:contentKey', (req: CreativeReq, res: Response) => {
  const { campaignId, contentKey } = req.params;
  if (!resolveCampaign(campaignId, resolveWorkspaceId(req), res)) return;

  const artifact = creativeGeneratorService.getCurrent(campaignId, contentKey!);
  if (!artifact) {
    res.status(404).json({ error: 'No creative exists for this deliverable' });
    return;
  }

  // For carousel artifacts, return ordered per-slide images from source record associations.
  // This covers both original carousels and repurposed derivatives (source links are copied).
  let carouselSlideImages: string[] | undefined;
  if (artifact.content && (artifact.content as { kind?: string }).kind === 'CAROUSEL') {
    const links = db.prepare(`
      SELECT COALESCE(ma.storage_key, NULL) AS asset_key, sr.image_urls
      FROM creative_source_links csl
      LEFT JOIN source_records sr ON sr.id = csl.source_record_id
      LEFT JOIN media_assets ma ON ma.id = csl.media_asset_id AND ma.status = 'ACTIVE'
      WHERE csl.creative_artifact_id = ?
      ORDER BY csl.position
    `).all(artifact.id) as Array<{ asset_key: string | null; image_urls: string | null }>;

    carouselSlideImages = links.map(l => {
      if (l.asset_key) return `__asset__${l.asset_key}`;
      const urls = JSON.parse(l.image_urls || '[]') as string[];
      return urls[0] ?? '';
    }).filter(Boolean);
  }

  res.json({ ...artifact, ...(carouselSlideImages?.length ? { carouselSlideImages } : {}) });
});

campaignCreativeRouter.get('/:contentKey/versions', (req: CreativeReq, res: Response) => {
  const { campaignId, contentKey } = req.params;
  if (!resolveCampaign(campaignId, resolveWorkspaceId(req), res)) return;
  res.json(creativeGeneratorService.getAllVersions(campaignId, contentKey!));
});

campaignCreativeRouter.post('/:contentKey/generate', async (req: CreativeReq, res: Response) => {
  const { campaignId, contentKey } = req.params;
  if (!resolveCampaign(campaignId, resolveWorkspaceId(req), res)) return;

  const result = await creativeGeneratorService.generateOne(campaignId, contentKey!);
  if ('error' in result) {
    res.status(statusFor(result.code)).json({ error: result.error, code: result.code });
    return;
  }
  res.status(201).json(result.artifact);
});

campaignCreativeRouter.post('/:contentKey/revisions', async (req: CreativeReq, res: Response) => {
  const { campaignId, contentKey } = req.params;
  const { requestText, targetHint, workspaceId } = req.body as {
    requestText?: string;
    targetHint?: string;
    workspaceId?: string;
  };

  if (!requestText?.trim()) {
    res.status(400).json({ error: 'requestText is required' });
    return;
  }
  if (!resolveCampaign(campaignId, workspaceId, res)) return;

  const result = await creativeGeneratorService.revise(campaignId, contentKey!, requestText.trim(), targetHint);
  if ('error' in result) {
    res.status(statusFor(result.code)).json({ error: result.error, code: result.code });
    return;
  }
  res.status(201).json(result.artifact);
});

campaignCreativeRouter.post('/:contentKey/approval', (req: CreativeReq, res: Response) => {
  const { campaignId, contentKey } = req.params;
  const { creativeArtifactId, workspaceId } = req.body as { creativeArtifactId?: string; workspaceId?: string };

  if (!creativeArtifactId) {
    res.status(400).json({ error: 'creativeArtifactId is required' });
    return;
  }
  if (!resolveCampaign(campaignId, workspaceId, res)) return;

  const result = creativeGeneratorService.approve(campaignId, contentKey!, creativeArtifactId);
  if (result.error) {
    res.status(statusFor(result.code)).json({ error: result.error, code: result.code });
    return;
  }
  res.json({ approved: true });
});

campaignCreativeRouter.get('/:contentKey/approval', (req: CreativeReq, res: Response) => {
  const { campaignId, contentKey } = req.params;
  if (!resolveCampaign(campaignId, resolveWorkspaceId(req), res)) return;

  const approval = creativeGeneratorService.getApproval(campaignId, contentKey!);
  if (!approval) {
    res.status(404).json({ error: 'No creative approval record found' });
    return;
  }
  res.json(approval);
});

// Manual content edit — updates content in place; resets APPROVED → READY_FOR_REVIEW and clears stale approval
campaignCreativeRouter.patch('/:contentKey', (req: CreativeReq, res: Response) => {
  const { campaignId, contentKey } = req.params;
  const { content, workspaceId } = req.body as { content?: unknown; workspaceId?: string };

  if (!content || typeof content !== 'object' || Array.isArray(content)) {
    res.status(400).json({ error: 'content is required and must be an object' });
    return;
  }
  if (!resolveCampaign(campaignId, workspaceId, res)) return;

  interface ArtifactStatusRow { id: string; status: string }
  const row = db.prepare(
    'SELECT id, status FROM creative_artifacts WHERE campaign_id = ? AND content_key = ? AND is_current = 1',
  ).get(campaignId, contentKey!) as ArtifactStatusRow | undefined;

  if (!row) {
    res.status(404).json({ error: 'No current creative artifact found for this deliverable' });
    return;
  }

  const wasApproved = row.status === 'APPROVED';
  const newStatus = wasApproved ? 'READY_FOR_REVIEW' : row.status;
  const now = new Date().toISOString();

  db.prepare(
    'UPDATE creative_artifacts SET content = ?, status = ?, updated_at = ? WHERE id = ?',
  ).run(JSON.stringify(content), newStatus, now, row.id);

  if (wasApproved) {
    db.prepare(
      'DELETE FROM creative_approvals WHERE campaign_id = ? AND content_key = ?',
    ).run(campaignId, contentKey!);
  }

  const updated = creativeGeneratorService.getCurrent(campaignId, contentKey!);
  if (!updated) {
    res.status(500).json({ error: 'Failed to retrieve updated artifact' });
    return;
  }
  res.json(updated);
});

// POST /:contentKey/select-media — attach a media asset to the current creative artifact
campaignCreativeRouter.post('/:contentKey/select-media', (req: CreativeReq, res: Response) => {
  const { campaignId, contentKey } = req.params;
  const { workspaceId, mediaAssetId } = req.body as { workspaceId?: string; mediaAssetId?: string };
  if (!mediaAssetId || typeof mediaAssetId !== 'string') {
    res.status(400).json({ error: 'mediaAssetId is required' });
    return;
  }
  if (!resolveCampaign(campaignId, workspaceId, res)) return;
  // Verify media asset belongs to this workspace
  const asset = db.prepare('SELECT id FROM media_assets WHERE id = ? AND workspace_id = ? AND status = ?')
    .get(mediaAssetId, workspaceId!, 'ACTIVE');
  if (!asset) {
    res.status(404).json({ error: 'Media asset not found or not accessible' });
    return;
  }
  interface ArtifactSelectRow { id: string; status: string }
  const artifact = db.prepare(
    'SELECT id, status FROM creative_artifacts WHERE campaign_id = ? AND content_key = ? AND is_current = 1'
  ).get(campaignId, contentKey!) as ArtifactSelectRow | undefined;
  if (!artifact) {
    res.status(404).json({ error: 'No current creative artifact found' });
    return;
  }
  const wasApproved = artifact.status === 'APPROVED';
  const newStatus = wasApproved ? 'READY_FOR_REVIEW' : artifact.status;
  const now = new Date().toISOString();
  db.prepare('UPDATE creative_artifacts SET media_asset_id = ?, status = ?, updated_at = ? WHERE id = ?')
    .run(mediaAssetId, newStatus, now, artifact.id);
  if (wasApproved) {
    db.prepare('DELETE FROM creative_approvals WHERE campaign_id = ? AND content_key = ?')
      .run(campaignId, contentKey!);
  }
  const result = creativeGeneratorService.getCurrent(campaignId, contentKey!);
  if (!result) {
    res.status(500).json({ error: 'Failed to retrieve updated artifact' });
    return;
  }
  res.json(result);
});
