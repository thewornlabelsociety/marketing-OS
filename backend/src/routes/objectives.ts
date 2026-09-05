import { randomUUID } from 'crypto';
import { Router } from 'express';
import { sanitizeCoreDbError } from '../config/coreDbConfig';
import { getCoreRepositories } from '../db/core/createCoreRepositories';
import type { ObjectiveRow } from '../types';

export const objectivesRouter = Router();

export function mapObjectiveRow(r: ObjectiveRow) {
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

objectivesRouter.get('/', async (req, res) => {
  try {
    const { workspaceId } = req.query as { workspaceId?: string };
    const rows = await getCoreRepositories().objective.listForWorkspace(workspaceId ?? '');
    res.json(rows.map(mapObjectiveRow));
  } catch (err) {
    res.status(503).json({ error: sanitizeCoreDbError(err) });
  }
});

objectivesRouter.post('/', async (req, res) => {
  try {
    const {
      workspaceId,
      name,
      description,
      objectiveType,
      primaryKpi,
      supportingKpis,
      conversionEvent,
      successCriteria,
      defaultChannels,
    } = req.body as {
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

    const repos = getCoreRepositories();
    if (!(await repos.workspace.exists(workspaceId))) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }

    const id = `obj_${randomUUID()}`;
    const now = new Date().toISOString();

    const created = await repos.objective.create({
      id,
      workspaceId,
      name,
      description: description ?? null,
      objectiveType,
      primaryKpi,
      supportingKpis: supportingKpis ?? [],
      conversionEvent: conversionEvent ?? null,
      successCriteria: successCriteria ?? null,
      defaultChannels: defaultChannels ?? [],
      createdAt: now,
      updatedAt: now,
    });

    res.status(201).json(mapObjectiveRow(created));
  } catch (err) {
    res.status(503).json({ error: sanitizeCoreDbError(err) });
  }
});

objectivesRouter.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const repos = getCoreRepositories();

    const existing = await repos.objective.findById(id);
    if (!existing) {
      res.status(404).json({ error: 'Objective not found' });
      return;
    }
    if (existing.is_system === 1) {
      res.status(403).json({ error: 'System objectives are immutable' });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const patch: Record<string, unknown> = {};

    if ('name' in body) patch.name = body.name;
    if ('description' in body) patch.description = body.description;
    if ('objectiveType' in body) patch.objectiveType = body.objectiveType;
    if ('primaryKpi' in body) patch.primaryKpi = body.primaryKpi;
    if ('conversionEvent' in body) patch.conversionEvent = body.conversionEvent;
    if ('successCriteria' in body) patch.successCriteria = body.successCriteria;
    if ('isActive' in body) patch.isActive = body.isActive;
    if ('supportingKpis' in body) patch.supportingKpis = body.supportingKpis;
    if ('defaultChannels' in body) patch.defaultChannels = body.defaultChannels;

    if (Object.keys(patch).length === 0) {
      res.json(mapObjectiveRow(existing));
      return;
    }

    const updated = await repos.objective.patch(
      id,
      {
        name: patch.name as string | undefined,
        description: patch.description as string | null | undefined,
        objectiveType: patch.objectiveType as string | undefined,
        primaryKpi: patch.primaryKpi as string | undefined,
        conversionEvent: patch.conversionEvent as string | null | undefined,
        successCriteria: patch.successCriteria as string | null | undefined,
        isActive: patch.isActive as boolean | undefined,
        supportingKpis: patch.supportingKpis as string[] | undefined,
        defaultChannels: patch.defaultChannels as string[] | undefined,
      },
      new Date().toISOString(),
    );

    if (!updated) {
      res.status(404).json({ error: 'Objective not found' });
      return;
    }
    res.json(mapObjectiveRow(updated));
  } catch (err) {
    res.status(503).json({ error: sanitizeCoreDbError(err) });
  }
});
