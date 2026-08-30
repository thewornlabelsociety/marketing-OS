import { Router } from 'express';
import { LOCAL_TENANT_ID } from '../config/constants';
import { db } from '../db/database';
import type { ContentRow } from '../types';
import { mapContentRow } from '../utils/mappers';
import { queryEntityId } from '../utils/params';

export const contentRouter = Router();

contentRouter.get('/', (req, res) => {
  const entity_id = queryEntityId(req);
  let query = 'SELECT * FROM content_items WHERE is_archived = 0';
  const params: unknown[] = [];

  if (entity_id) {
    query += ' AND entity_id = ?';
    params.push(entity_id);
  }

  query += ' ORDER BY scheduled_for ASC, created_at DESC';
  const rows = db.prepare(query).all(...params) as ContentRow[];
  res.json(rows.map(mapContentRow));
});

contentRouter.post('/', (req, res) => {
  const body = req.body as Record<string, unknown>;
  const id = (body.id ?? `item_${Date.now()}`) as string;
  const tenant_id = (body.tenant_id ?? body.tenantId ?? LOCAL_TENANT_ID) as string;
  const entity_id = (body.entity_id ?? body.entityId) as string;
  const type = body.type as string;
  const title = body.title as string;
  const body_markdown = (body.body_markdown ?? body.bodyMarkdown ?? null) as string | null;
  const assets = (body.assets ?? []) as unknown[];
  const status = (body.status ?? 'draft') as string;
  const target_channels = (body.target_channels ?? body.targetChannels ?? []) as string[];
  const scheduled_for = (body.scheduled_for ?? body.scheduledFor ?? null) as string | null;

  db.prepare(`
    INSERT INTO content_items
      (id, tenant_id, entity_id, type, title, body_markdown, assets, status, target_channels, scheduled_for, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      body_markdown = excluded.body_markdown,
      assets = excluded.assets,
      status = excluded.status,
      target_channels = excluded.target_channels,
      scheduled_for = excluded.scheduled_for,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    id, tenant_id, entity_id, type, title,
    body_markdown, JSON.stringify(assets), status,
    JSON.stringify(target_channels), scheduled_for
  );

  const row = db
    .prepare('SELECT * FROM content_items WHERE id = ?')
    .get(id) as ContentRow;
  res.json(mapContentRow(row));
});

contentRouter.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM content_items WHERE id = ?').run(req.params.id);
  res.status(204).send();
});
