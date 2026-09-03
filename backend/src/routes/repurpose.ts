import { Router } from 'express';
import { repurposeService } from '../services/business/RepurposeService';
import { CREATIVE_DESTINATIONS } from '../types/studioDestinations';
import { channelStrategyService } from '../services/intelligence/ChannelStrategyService';
import type { ChannelKey } from '../types/marketing';

export const repurposeRouter = Router();

// GET /api/repurpose/destinations?workspaceId=...
// Returns destinations annotated with channelEnabled based on workspace channel strategy.
repurposeRouter.get('/destinations', (req, res) => {
  const { workspaceId } = req.query as { workspaceId?: string };
  const strategy = workspaceId ? channelStrategyService.get(workspaceId) : {};
  const enriched = CREATIVE_DESTINATIONS.map(d => {
    const key = d.channel.toLowerCase() as ChannelKey;
    const config = strategy[key];
    const channelEnabled = config === undefined ? true : config.enabled;
    return { ...d, channelEnabled };
  });
  res.json(enriched);
});

// GET /api/repurpose/source/:artifactId
repurposeRouter.get('/source/:artifactId', (req, res) => {
  const { workspaceId } = req.query as { workspaceId?: string };
  if (!workspaceId) {
    res.status(400).json({ error: 'workspaceId is required' });
    return;
  }
  const result = repurposeService.getSourceSummary(workspaceId, req.params.artifactId);
  if ('error' in result) {
    res.status(result.code === 'NOT_FOUND' ? 404 : 400).json({ error: result.error });
    return;
  }
  const { artifact, summary } = result;
  res.json({
    id: artifact.id,
    campaignId: artifact.campaign_id,
    channel: artifact.channel,
    contentType: artifact.content_type,
    format: artifact.format,
    title: artifact.title,
    status: artifact.status,
    summary,
  });
});

// POST /api/repurpose
repurposeRouter.post('/', async (req, res) => {
  const { workspaceId, sourceArtifactId, destinations, idempotencyKey } = req.body as {
    workspaceId?: string;
    sourceArtifactId?: string;
    destinations?: string[];
    idempotencyKey?: string;
  };

  if (!workspaceId || !sourceArtifactId || !destinations || !idempotencyKey) {
    res.status(400).json({ error: 'workspaceId, sourceArtifactId, destinations, and idempotencyKey are required' });
    return;
  }

  try {
    const result = await repurposeService.repurpose({ workspaceId, sourceArtifactId, destinations, idempotencyKey });
    if ('error' in result) {
      const status = result.code === 'NOT_FOUND' ? 404 : result.code === 'CONFLICT' ? 409 : 400;
      res.status(status).json({ error: result.error });
      return;
    }
    const httpStatus = result.status === 'IN_PROGRESS' ? 202 : 200;
    res.status(httpStatus).json(result);
  } catch (err) {
    console.error('[repurpose] Unexpected error:', (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
});
