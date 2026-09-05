import { randomUUID } from 'crypto';
import { Router } from 'express';
import { sanitizeCoreDbError } from '../config/coreDbConfig';
import { getCoreRepositories } from '../db/core/createCoreRepositories';
import type { CampaignRow } from '../types';

export const campaignsRouter = Router();

const VALID_SOURCE_TYPES = new Set([
  'PRODUCT', 'SERVICE', 'OFFER', 'FEATURE', 'EVENT',
  'INVENTORY_BATCH', 'ANNOUNCEMENT', 'EDUCATIONAL_TOPIC',
  'CAMPAIGN_IDEA', 'OTHER',
]);

const VALID_STATUSES = new Set([
  'DRAFTING', 'READY_FOR_REVIEW', 'CHANGES_REQUESTED', 'REVISING',
  'READY_FOR_APPROVAL', 'APPROVED', 'SCHEDULED', 'PUBLISHED',
  'MEASURING', 'COMPLETE', 'CANCELLED', 'ARCHIVED',
]);

const READ_ONLY_STATUSES = new Set(['CANCELLED', 'COMPLETE', 'ARCHIVED']);

export function mapCampaignRow(r: CampaignRow) {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    objectiveId: r.objective_id,
    objectiveName: r.objective_name ?? null,
    objectivePrimaryKpi: r.objective_primary_kpi ?? null,
    name: r.name,
    status: r.status,
    sourceType: r.source_type,
    sourceId: r.source_id ?? null,
    sourceTitle: r.source_title,
    sourceDescription: r.source_description ?? null,
    sourceMetadata: JSON.parse(r.source_metadata || '{}') as Record<string, unknown>,
    brief: r.brief ?? null,
    channels: JSON.parse(r.channels || '[]') as string[],
    cancellationReason: r.cancellation_reason ?? null,
    scheduledAt: r.scheduled_at ?? null,
    publishedAt: r.published_at ?? null,
    completedAt: r.completed_at ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

campaignsRouter.get('/', async (req, res) => {
  try {
    const { workspaceId, status } = req.query as { workspaceId?: string; status?: string };
    const rows = await getCoreRepositories().campaign.list({ workspaceId, status });
    res.json(rows.map(mapCampaignRow));
  } catch (err) {
    res.status(503).json({ error: sanitizeCoreDbError(err) });
  }
});

campaignsRouter.get('/:id', async (req, res) => {
  try {
    const row = await getCoreRepositories().campaign.findByIdWithObjective(req.params.id);
    if (!row) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }
    res.json(mapCampaignRow(row));
  } catch (err) {
    res.status(503).json({ error: sanitizeCoreDbError(err) });
  }
});

campaignsRouter.post('/', async (req, res) => {
  try {
    const {
      workspaceId, objectiveId, name, sourceType,
      sourceId, sourceTitle, sourceDescription, sourceMetadata,
      brief, channels,
    } = req.body as {
      workspaceId?: string;
      objectiveId?: string;
      name?: string;
      sourceType?: string;
      sourceId?: string;
      sourceTitle?: string;
      sourceDescription?: string;
      sourceMetadata?: Record<string, unknown>;
      brief?: string;
      channels?: string[];
    };

    if (!workspaceId || !objectiveId || !sourceType || !sourceTitle) {
      res.status(400).json({ error: 'workspaceId, objectiveId, sourceType, and sourceTitle are required' });
      return;
    }

    if (!VALID_SOURCE_TYPES.has(sourceType)) {
      res.status(400).json({ error: `Invalid sourceType. Valid values: ${[...VALID_SOURCE_TYPES].join(', ')}` });
      return;
    }

    const repos = getCoreRepositories();

    if (!(await repos.workspace.exists(workspaceId))) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }

    const objective = await repos.objective.findForCampaignValidation(objectiveId);
    if (!objective) {
      res.status(404).json({ error: 'Objective not found' });
      return;
    }
    if (objective.is_system !== 1 && objective.workspace_id !== workspaceId) {
      res.status(403).json({ error: 'Objective does not belong to this workspace' });
      return;
    }

    const id = `campaign_${randomUUID()}`;
    const now = new Date().toISOString();
    const campaignName = (name?.trim()) || sourceTitle;

    const created = await repos.campaign.create({
      id,
      workspaceId,
      objectiveId,
      name: campaignName,
      sourceType,
      sourceId: sourceId ?? null,
      sourceTitle,
      sourceDescription: sourceDescription ?? null,
      sourceMetadata: sourceMetadata ?? {},
      brief: brief ?? null,
      channels: channels ?? [],
      createdAt: now,
      updatedAt: now,
    });

    res.status(201).json(mapCampaignRow(created));
  } catch (err) {
    res.status(503).json({ error: sanitizeCoreDbError(err) });
  }
});

campaignsRouter.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const repos = getCoreRepositories();

    const existing = await repos.campaign.findById(id);
    if (!existing) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    const body = req.body as Record<string, unknown>;

    if ('workspaceId' in body && body.workspaceId !== existing.workspace_id) {
      res.status(403).json({ error: 'Campaign does not belong to this workspace' });
      return;
    }

    if (READ_ONLY_STATUSES.has(existing.status)) {
      res.status(409).json({ error: `Campaign is ${existing.status.toLowerCase()} and cannot be edited` });
      return;
    }

    if ('status' in body) {
      const newStatus = body.status as string;
      if (!VALID_STATUSES.has(newStatus)) {
        res.status(400).json({ error: `Invalid status: ${newStatus}` });
        return;
      }
    }

    if ('objectiveId' in body) {
      const newObjId = body.objectiveId as string;
      const obj = await repos.objective.findForCampaignValidation(newObjId);
      if (!obj) {
        res.status(404).json({ error: 'Objective not found' });
        return;
      }
      if (obj.is_system !== 1 && obj.workspace_id !== existing.workspace_id) {
        res.status(403).json({ error: 'Objective does not belong to this workspace' });
        return;
      }
    }

    const patch: Record<string, unknown> = {};
    for (const key of [
      'name', 'brief', 'sourceTitle', 'sourceDescription', 'cancellationReason',
      'scheduledAt', 'publishedAt', 'completedAt', 'status', 'channels', 'sourceMetadata', 'objectiveId',
    ]) {
      if (key in body) patch[key] = body[key];
    }

    if (Object.keys(patch).length === 0) {
      const row = await repos.campaign.findByIdWithObjective(id);
      res.json(mapCampaignRow(row!));
      return;
    }

    const updated = await repos.campaign.patch(
      id,
      {
        name: patch.name as string | undefined,
        brief: patch.brief as string | null | undefined,
        sourceTitle: patch.sourceTitle as string | undefined,
        sourceDescription: patch.sourceDescription as string | null | undefined,
        cancellationReason: patch.cancellationReason as string | null | undefined,
        scheduledAt: patch.scheduledAt as string | null | undefined,
        publishedAt: patch.publishedAt as string | null | undefined,
        completedAt: patch.completedAt as string | null | undefined,
        status: patch.status as string | undefined,
        channels: patch.channels as string[] | undefined,
        sourceMetadata: patch.sourceMetadata as Record<string, unknown> | undefined,
        objectiveId: patch.objectiveId as string | undefined,
      },
      new Date().toISOString(),
    );

    if (!updated) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }
    res.json(mapCampaignRow(updated));
  } catch (err) {
    res.status(503).json({ error: sanitizeCoreDbError(err) });
  }
});
