import { randomUUID } from 'crypto';
import { Router } from 'express';
import { db } from '../db/database';
import type { CampaignRow, ObjectiveRow } from '../types';

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

const CAMPAIGN_JOIN = `
  SELECT c.*,
    o.name  AS objective_name,
    o.primary_kpi AS objective_primary_kpi
  FROM campaigns c
  LEFT JOIN objectives o ON c.objective_id = o.id
`;

function mapRow(r: CampaignRow) {
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

// GET /api/campaigns?workspaceId=<id>&status=<status>
campaignsRouter.get('/', (req, res) => {
  const { workspaceId, status } = req.query as { workspaceId?: string; status?: string };

  const conditions: string[] = ['1=1'];
  const params: unknown[] = [];

  if (workspaceId) {
    conditions.push('c.workspace_id = ?');
    params.push(workspaceId);
  }
  if (status) {
    conditions.push('c.status = ?');
    params.push(status);
  }

  const rows = db
    .prepare(`${CAMPAIGN_JOIN} WHERE ${conditions.join(' AND ')} ORDER BY c.created_at DESC`)
    .all(...params) as CampaignRow[];

  res.json(rows.map(mapRow));
});

// GET /api/campaigns/:id
campaignsRouter.get('/:id', (req, res) => {
  const row = db
    .prepare(`${CAMPAIGN_JOIN} WHERE c.id = ?`)
    .get(req.params.id) as CampaignRow | undefined;

  if (!row) {
    res.status(404).json({ error: 'Campaign not found' });
    return;
  }
  res.json(mapRow(row));
});

// POST /api/campaigns
campaignsRouter.post('/', (req, res) => {
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

  const workspace = db.prepare('SELECT id FROM entities WHERE id = ?').get(workspaceId);
  if (!workspace) {
    res.status(404).json({ error: 'Workspace not found' });
    return;
  }

  const objective = db
    .prepare('SELECT id, workspace_id, is_system FROM objectives WHERE id = ? AND is_active = 1')
    .get(objectiveId) as ObjectiveRow | undefined;

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

  db.prepare(
    `INSERT INTO campaigns
       (id, workspace_id, objective_id, name, status, source_type, source_id,
        source_title, source_description, source_metadata, brief, channels, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'DRAFTING', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    workspaceId,
    objectiveId,
    campaignName,
    sourceType,
    sourceId ?? null,
    sourceTitle,
    sourceDescription ?? null,
    JSON.stringify(sourceMetadata ?? {}),
    brief ?? null,
    JSON.stringify(channels ?? []),
    now,
    now,
  );

  const created = db
    .prepare(`${CAMPAIGN_JOIN} WHERE c.id = ?`)
    .get(id) as CampaignRow;

  res.status(201).json(mapRow(created));
});

// PATCH /api/campaigns/:id
campaignsRouter.patch('/:id', (req, res) => {
  const { id } = req.params;

  const existing = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id) as CampaignRow | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Campaign not found' });
    return;
  }

  const body = req.body as Record<string, unknown>;

  if ('workspaceId' in body && body.workspaceId !== existing.workspace_id) {
    res.status(403).json({ error: 'Campaign does not belong to this workspace' });
    return;
  }
  const sets: string[] = [];
  const vals: unknown[] = [];

  const fieldMap: Record<string, string> = {
    name: 'name',
    brief: 'brief',
    sourceTitle: 'source_title',
    sourceDescription: 'source_description',
    cancellationReason: 'cancellation_reason',
    scheduledAt: 'scheduled_at',
    publishedAt: 'published_at',
    completedAt: 'completed_at',
  };

  for (const [jsKey, dbCol] of Object.entries(fieldMap)) {
    if (jsKey in body) {
      sets.push(`${dbCol} = ?`);
      vals.push(body[jsKey] ?? null);
    }
  }

  if ('status' in body) {
    const newStatus = body.status as string;
    if (!VALID_STATUSES.has(newStatus)) {
      res.status(400).json({ error: `Invalid status: ${newStatus}` });
      return;
    }
    sets.push('status = ?');
    vals.push(newStatus);
  }

  if ('channels' in body) {
    sets.push('channels = ?');
    vals.push(JSON.stringify(body.channels ?? []));
  }

  if ('sourceMetadata' in body) {
    sets.push('source_metadata = ?');
    vals.push(JSON.stringify(body.sourceMetadata ?? {}));
  }

  if ('objectiveId' in body) {
    const newObjId = body.objectiveId as string;
    const obj = db.prepare('SELECT id, workspace_id, is_system FROM objectives WHERE id = ? AND is_active = 1')
      .get(newObjId) as ObjectiveRow | undefined;
    if (!obj) {
      res.status(404).json({ error: 'Objective not found' });
      return;
    }
    if (obj.is_system !== 1 && obj.workspace_id !== existing.workspace_id) {
      res.status(403).json({ error: 'Objective does not belong to this workspace' });
      return;
    }
    sets.push('objective_id = ?');
    vals.push(newObjId);
  }

  if (sets.length === 0) {
    const row = db.prepare(`${CAMPAIGN_JOIN} WHERE c.id = ?`).get(id) as CampaignRow;
    res.json(mapRow(row));
    return;
  }

  sets.push('updated_at = ?');
  vals.push(new Date().toISOString());
  vals.push(id);

  db.prepare(`UPDATE campaigns SET ${sets.join(', ')} WHERE id = ?`).run(...vals);

  const updated = db
    .prepare(`${CAMPAIGN_JOIN} WHERE c.id = ?`)
    .get(id) as CampaignRow;

  res.json(mapRow(updated));
});
