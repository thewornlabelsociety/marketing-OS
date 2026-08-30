import { randomUUID } from 'crypto';
import { Router } from 'express';
import { db } from '../db/database';
import type { ObjectiveRow } from '../types';

export const objectivesRouter = Router();

function mapRow(r: ObjectiveRow) {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    name: r.name,
    description: r.description,
    objectiveType: r.objective_type,
    primaryKpi: r.primary_kpi,
    supportingKpis: JSON.parse(r.supporting_kpis || '[]') as string[],
    conversionEvent: r.conversion_event,
    successCriteria: r.success_criteria,
    defaultChannels: JSON.parse(r.default_channels || '[]') as string[],
    isSystem: r.is_system === 1,
    isActive: r.is_active === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// GET /api/objectives?workspaceId=<id>
// Returns system objectives plus custom objectives for the given workspace
objectivesRouter.get('/', (req, res) => {
  const { workspaceId } = req.query as { workspaceId?: string };

  const rows = db
    .prepare(
      `SELECT * FROM objectives
       WHERE is_active = 1
         AND (workspace_id IS NULL OR workspace_id = ?)
       ORDER BY is_system DESC, name ASC`
    )
    .all(workspaceId ?? '') as ObjectiveRow[];

  res.json(rows.map(mapRow));
});

// POST /api/objectives — create custom workspace objective
objectivesRouter.post('/', (req, res) => {
  const { workspaceId, name, description, objectiveType, primaryKpi, supportingKpis, conversionEvent, successCriteria, defaultChannels } =
    req.body as {
      workspaceId?: string;
      name?: string;
      description?: string;
      objectiveType?: string;
      primaryKpi?: string;
      supportingKpis?: string[];
      conversionEvent?: string;
      successCriteria?: string;
      defaultChannels?: string[];
    };

  if (!workspaceId || !name || !objectiveType || !primaryKpi) {
    res.status(400).json({ error: 'workspaceId, name, objectiveType, and primaryKpi are required' });
    return;
  }

  const workspace = db.prepare('SELECT id FROM entities WHERE id = ?').get(workspaceId);
  if (!workspace) {
    res.status(404).json({ error: 'Workspace not found' });
    return;
  }

  const id = `obj_${randomUUID()}`;
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO objectives
       (id, workspace_id, name, description, objective_type, primary_kpi, supporting_kpis,
        conversion_event, success_criteria, default_channels, is_system, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?)`
  ).run(
    id,
    workspaceId,
    name,
    description ?? null,
    objectiveType,
    primaryKpi,
    JSON.stringify(supportingKpis ?? []),
    conversionEvent ?? null,
    successCriteria ?? null,
    JSON.stringify(defaultChannels ?? []),
    now,
    now,
  );

  const created = db.prepare('SELECT * FROM objectives WHERE id = ?').get(id) as ObjectiveRow;
  res.status(201).json(mapRow(created));
});

// PATCH /api/objectives/:id — update custom workspace objective (system objectives are immutable)
objectivesRouter.patch('/:id', (req, res) => {
  const { id } = req.params;

  const existing = db.prepare('SELECT * FROM objectives WHERE id = ?').get(id) as ObjectiveRow | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Objective not found' });
    return;
  }
  if (existing.is_system === 1) {
    res.status(403).json({ error: 'System objectives are immutable' });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const sets: string[] = [];
  const vals: unknown[] = [];

  const fieldMap: Record<string, string> = {
    name: 'name',
    description: 'description',
    objectiveType: 'objective_type',
    primaryKpi: 'primary_kpi',
    conversionEvent: 'conversion_event',
    successCriteria: 'success_criteria',
    isActive: 'is_active',
  };

  for (const [jsKey, dbCol] of Object.entries(fieldMap)) {
    if (jsKey in body) {
      sets.push(`${dbCol} = ?`);
      const v = body[jsKey];
      vals.push(jsKey === 'isActive' ? (v ? 1 : 0) : (v ?? null));
    }
  }

  if ('supportingKpis' in body) {
    sets.push('supporting_kpis = ?');
    vals.push(JSON.stringify(body.supportingKpis ?? []));
  }
  if ('defaultChannels' in body) {
    sets.push('default_channels = ?');
    vals.push(JSON.stringify(body.defaultChannels ?? []));
  }

  if (sets.length === 0) {
    res.json(mapRow(existing));
    return;
  }

  sets.push('updated_at = ?');
  vals.push(new Date().toISOString());
  vals.push(id);

  db.prepare(`UPDATE objectives SET ${sets.join(', ')} WHERE id = ?`).run(...vals);

  const updated = db.prepare('SELECT * FROM objectives WHERE id = ?').get(id) as ObjectiveRow;
  res.json(mapRow(updated));
});
