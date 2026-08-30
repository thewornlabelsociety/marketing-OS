import { Router } from 'express';
import { LOCAL_TENANT_ID } from '../config/constants';
import { db } from '../db/database';
import { BrandMemoryService } from '../services/brand/BrandMemoryService';
import { campaignPerformanceService } from '../services/performance/CampaignPerformanceService';
import type { PerformanceRow } from '../types';
import { mapPerformanceRow } from '../utils/mappers';
import { queryEntityId } from '../utils/params';

export const performanceRouter = Router();

performanceRouter.get('/summary', (req, res) => {
  const workspaceId = (req.query.workspaceId as string | undefined) ?? queryEntityId(req);
  if (!workspaceId) {
    res.status(400).json({ error: 'workspaceId is required' });
    return;
  }
  res.json(campaignPerformanceService.getWorkspaceSummary(workspaceId));
});

performanceRouter.get('/', (req, res) => {
  const entity_id = queryEntityId(req);
  const rows = entity_id
    ? (db
        .prepare(
          'SELECT * FROM performance_logs WHERE entity_id = ? ORDER BY revenue DESC, impressions DESC'
        )
        .all(entity_id) as PerformanceRow[])
    : (db
        .prepare('SELECT * FROM performance_logs ORDER BY revenue DESC, impressions DESC')
        .all() as PerformanceRow[]);

  res.json(rows.map(mapPerformanceRow));
});

performanceRouter.post('/', (req, res) => {
  const body = req.body as Record<string, unknown>;
  const id = (body.id ?? `perf_${Date.now()}`) as string;
  const tenant_id = (body.tenant_id ?? body.tenantId ?? LOCAL_TENANT_ID) as string;
  const entity_id = (body.entity_id ?? body.entityId) as string;
  const impressions = (body.impressions ?? 0) as number;
  const revenue = (body.revenue ?? 0) as number;
  const conversions = (body.conversions ?? 0) as number;
  const hook = (body.hook ?? null) as string | null;
  const ai_learnings = (body.ai_learnings ?? body.aiLearnings ?? null) as string | null;

  const content_id = (body.content_id ?? body.contentId ?? `perf_placeholder_${entity_id}`) as string;

  if (!body.content_id && !body.contentId) {
    const exists = db.prepare('SELECT id FROM content_items WHERE id = ?').get(content_id);
    if (!exists) {
      db.prepare(`
        INSERT INTO content_items (id, tenant_id, entity_id, type, title, status, is_archived, updated_at)
        VALUES (?, ?, ?, 'performance-placeholder', 'Performance placeholder', 'draft', 1, CURRENT_TIMESTAMP)
      `).run(content_id, LOCAL_TENANT_ID, entity_id);
    }
  }

  db.prepare(`
    INSERT INTO performance_logs
      (id, tenant_id, content_id, entity_id, impressions, revenue, conversions, hook, ai_learnings)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, tenant_id, content_id, entity_id, impressions, revenue, conversions, hook, ai_learnings);

  const row = db
    .prepare('SELECT * FROM performance_logs WHERE id = ?')
    .get(id) as PerformanceRow;
  res.json(mapPerformanceRow(row));
});

performanceRouter.post('/sync-vault', (req, res) => {
  const body = req.body as Record<string, unknown>;
  const entity_id = (body.entity_id ?? body.entityId) as string | undefined;
  const singleHook = body.hook as string | undefined;

  if (singleHook && entity_id) {
    const updated = BrandMemoryService.syncHookToVault(entity_id, singleHook);
    res.json({ synced: updated ? 1 : 0, entities: updated ? [entity_id] : [] });
    return;
  }

  if (!entity_id) {
    res.json({ synced: 0, entities: [] });
    return;
  }

  const rows = db
    .prepare(
      `SELECT hook FROM performance_logs
       WHERE entity_id = ? AND hook IS NOT NULL AND hook != '' AND is_synced_to_vault = 0`
    )
    .all(entity_id) as Array<{ hook: string }>;

  let synced = 0;
  for (const row of rows) {
    if (BrandMemoryService.syncHookToVault(entity_id, row.hook)) {
      synced += 1;
    }
  }

  if (rows.length > 0) {
    db.prepare(
      `UPDATE performance_logs SET is_synced_to_vault = 1
       WHERE entity_id = ? AND hook IS NOT NULL AND hook != '' AND is_synced_to_vault = 0`
    ).run(entity_id);
  }

  res.json({ synced, entities: synced > 0 ? [entity_id] : [] });
});
